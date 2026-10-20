// _inbox/ に届いた音声入力の下書きを整えて、_posts/ の日記にする。
// GitHub Actions から呼ばれる (ANTHROPIC_API_KEY はリポジトリの Secret)。
// 整形に失敗しても日記は失わないよう、そのときは元の文章のまま公開する。
import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { parseDoc, fmGet, fmSet, serialize } from "../assets/js/frontmatter.js";

const INBOX = "_inbox";
const POSTS = "_posts";
const MODEL = "claude-opus-5-5";
const TARGET_RE = /^_posts\/\d{4}-\d{2}-\d{2}[-.][\w.-]+\.md$/;

const SYSTEM = `あなたは natsufuna さんの日記の編集を手伝います。
渡されるのは、スマートフォンの音声入力で書かれた日記の下書きです。音声認識の結果なので、句読点がなかったり、言い淀みが混ざっていたりします。
これを、本人がふだん書いている日記の文章として読めるように整えてください。

やること:
- 句読点（、。）を補う。
- 「えーと」「あのー」「えー」「まあ」「なんか」などの言い淀み、言い直し、同じ言葉の繰り返しを取り除く。ただし、文の意味やニュアンスとして使われている「まあ」「なんか」は残す。
- 文末や語尾を、過去の日記の文体に寄せる（常体。「〜だ」「〜と思う」「〜なあと思う」など。「です・ます」で話していても常体にする）。一人称は過去の日記に合わせる。
- 1〜2文ごとに改行し、話題が変わるところは空行で区切る。過去の日記の改行の仕方に合わせる。
- 明らかな音声認識の誤変換は、前後の文脈から確実に分かる場合に限って直す。

やらないこと:
- 内容を足す、削る、要約する、順番を入れ替える、感想や説明を書き加える。
- 固有名詞や英単語を推測で書き換える（自信がなければそのまま残す）。
- ［画像1］のような印を動かしたり消したりする（その位置のまま残す）。
- 見出し、前置き、注釈をつける。

出力は、整えた日記の本文だけを <diary> と </diary> で囲んで返してください。`;

// 過去の日記を数件、文体の手本として渡す
async function styleExamples(limit = 5) {
  const files = (await fs.readdir(POSTS)).filter((f) => /^\d{4}-\d{2}-\d{2}[-.].+\.md$/.test(f)).sort().reverse();
  const out = [];
  for (const f of files) {
    if (out.length >= limit) break;
    const { body } = parseDoc(await fs.readFile(path.join(POSTS, f), "utf8"));
    const text = body.replace(/!\[[^\]]*\]\([^)]*\)/g, "").trim();
    if (text.length < 80) continue;
    out.push(`<example date="${f.slice(0, 10)}">\n${text.slice(0, 1500)}\n</example>`);
  }
  return out.join("\n\n");
}

// 画像の行は整形に渡さず、印に置き換えて後で戻す
function maskImages(text) {
  const images = [];
  const masked = text.replace(/!\[[^\]]*\]\([^)]*\)/g, (m) => {
    images.push(m);
    return `［画像${images.length}］`;
  });
  return { masked, images };
}
function unmaskImages(text, images) {
  let out = text;
  images.forEach((img, i) => {
    const mark = `［画像${i + 1}］`;
    out = out.includes(mark) ? out.replace(mark, img) : `${out.replace(/\s+$/, "")}\n${img}`;
  });
  return out;
}

async function tidy(client, examples, raw) {
  if (!client) {
    console.warn("ANTHROPIC_API_KEY がないため、整形せずに公開します");
    return raw;
  }
  const { masked, images } = maskImages(raw);
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: `${SYSTEM}\n\n以下は過去の日記です（文体の手本）:\n\n${examples}`,
      messages: [{ role: "user", content: `<transcript>\n${masked}\n</transcript>` }],
    });
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") {
      console.warn(`整形できませんでした (${res.stop_reason})。元の文章のまま公開します`);
      return raw;
    }
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const m = text.match(/<diary>([\s\S]*?)<\/diary>/);
    const cleaned = (m ? m[1] : text).trim();
    // 言い淀みを除く以上に短くなっていたら、何か削りすぎている
    if (cleaned.length < masked.replace(/\s/g, "").length * 0.5) {
      console.warn("整形後の文章が短くなりすぎたため、元の文章のまま公開します");
      return raw;
    }
    return unmaskImages(cleaned, images);
  } catch (e) {
    console.warn(`整形に失敗しました (${e?.status ?? ""} ${e?.message ?? e})。元の文章のまま公開します`);
    return raw;
  }
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function main() {
  const files = (await fs.readdir(INBOX).catch(() => [])).filter((f) => f.endsWith(".md")).sort();
  if (!files.length) return console.log("整形待ちの下書きはありません");

  const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  const examples = await styleExamples();

  for (const f of files) {
    const inboxPath = path.join(INBOX, f);
    const { fm, body } = parseDoc(await fs.readFile(inboxPath, "utf8"));
    const target = fmGet(fm, "target");
    const mode = fmGet(fm, "mode") || "new";
    if (typeof target !== "string" || !TARGET_RE.test(target)) {
      console.error(`${f}: 保存先が不正なのでスキップします (${target})`);
      continue;
    }
    const postFm = fm.filter((e) => e.key.startsWith("fm_")).map((e) => ({ key: e.key.slice(3), value: e.value }));
    const cleaned = await tidy(client, examples, body.trim());

    let out;
    if (mode === "replace" || !(await exists(target))) {
      out = serialize(postFm, cleaned);
    } else {
      // 追記 (または、同じ日の日記が先に保存されていた場合)
      const cur = parseDoc(await fs.readFile(target, "utf8"));
      const list = (v) => (Array.isArray(v) ? v : []);
      const tags = new Set([...list(fmGet(cur.fm, "tags")), ...list(fmGet(postFm, "tags"))]);
      fmSet(cur.fm, "tags", [...tags]);
      if (fmGet(postFm, "private") === "true") fmSet(cur.fm, "private", "true");
      out = serialize(cur.fm, `${cur.body.replace(/\s+$/, "")}\n\n${cleaned}`);
    }
    await fs.writeFile(target, out);
    await fs.unlink(inboxPath);
    console.log(`${f} → ${target} (${mode})`);
  }
}

await main();
