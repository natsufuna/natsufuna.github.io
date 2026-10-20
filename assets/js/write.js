import { describe, diaryDateOf, localTimestamp, MONTH_ABBR, displayTags } from "./august.js";
import { parseDoc, fmGet, fmSet, serialize } from "./frontmatter.js";

// ---------------------------------------------------------------
// 設定・下書き (この端末の localStorage にだけ保存する)
// ---------------------------------------------------------------
const K = {
  token: "diary.writer.token",
  repo: "diary.writer.repo",
  branch: "diary.writer.branch",
  cutoff: "diary.writer.cutoff",
  draft: "diary.writer.draft",
  tags: "diary.writer.tags",
  provider: "diary.writer.provider",
};
const store = {
  get(k, d = "") { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const cfg = () => {
  const [owner, name] = (store.get(K.repo) || "natsufuna/natsufuna.github.io").split("/");
  return {
    token: store.get(K.token),
    owner,
    name,
    branch: store.get(K.branch) || "master",
    cutoff: Number(store.get(K.cutoff, "4")),
    provider: store.get(K.provider) || "claude",
  };
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const status = (msg, kind = "") => { const el = $("w-status"); el.textContent = msg; el.dataset.kind = kind; };

// ---------------------------------------------------------------
// GitHub API
// ---------------------------------------------------------------
const b64encode = (bytes) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64text = (s) => b64encode(new TextEncoder().encode(s));
const textFromB64 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

async function gh(path, opts = {}) {
  const c = cfg();
  if (!c.token) throw new Error("GitHub トークンが設定されていません（右上の ⚙ から設定してください）");
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${c.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).message; } catch {}
    if (res.status === 401) throw new Error("トークンが無効か、期限切れです");
    if (res.status === 403) throw new Error(`書き込み権限がありません（${detail}）`);
    if (res.status === 409) throw new Error("他の端末からの更新と衝突しました。もう一度保存してください");
    throw new Error(`GitHub: ${res.status} ${detail}`);
  }
  return res.status === 204 ? null : res.json();
}

const repoPath = () => { const c = cfg(); return `/repos/${c.owner}/${c.name}`; };
const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");

async function getFile(path) {
  const j = await gh(`${repoPath()}/contents/${encPath(path)}?ref=${encodeURIComponent(cfg().branch)}`);
  return j && { path, sha: j.sha, text: textFromB64(j.content) };
}

async function putFile(path, base64, message, sha) {
  return gh(`${repoPath()}/contents/${encPath(path)}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: base64, branch: cfg().branch, ...(sha ? { sha } : {}) }),
  });
}

async function listPaths(prefix) {
  const t = await gh(`${repoPath()}/git/trees/${encodeURIComponent(cfg().branch)}?recursive=1`);
  return (t?.tree || []).filter((x) => x.type === "blob" && x.path.startsWith(prefix)).map((x) => x.path);
}

// ---------------------------------------------------------------
// 画面の状態
// ---------------------------------------------------------------
const state = {
  date: "",
  category: "diary",
  tags: new Set(),
  knownTags: new Set(),
  editing: null, // { path, sha, fm }
  usedMic: false,
};

function auLabel() {
  const d = describe(state.date);
  $("w-au").textContent = d.label;
  $("w-date").value = state.date;
}

function renderKind() {
  for (const r of document.querySelectorAll('input[name="w-kind"]')) r.checked = r.value === state.category;
  $("w-title").hidden = state.category === "diary";
}

function renderTags() {
  const all = [...new Set([...state.knownTags, ...state.tags])];
  $("w-tags").innerHTML = all
    .map((t) => `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="${state.tags.has(t)}">${esc(t)}</button>`)
    .join("");
}

function saveDraft() {
  store.set(
    K.draft,
    JSON.stringify({
      date: state.date,
      category: state.category,
      title: $("w-title").value,
      body: $("w-body").value,
      tags: [...state.tags],
      private: $("w-private").checked,
      tidy: $("w-tidy").checked,
      editing: state.editing,
    }),
  );
}

function resetForm() {
  state.editing = null;
  state.usedMic = false;
  state.tags = new Set();
  state.category = "diary";
  state.date = diaryDateOf(new Date(), cfg().cutoff);
  $("w-body").value = "";
  $("w-title").value = "";
  $("w-private").checked = false;
  $("w-tidy").checked = false;
  $("w-date").disabled = false;
  $("w-editing").hidden = true;
  store.del(K.draft);
  auLabel();
  renderKind();
  renderTags();
}

function restoreDraft() {
  let d = null;
  try { d = JSON.parse(store.get(K.draft) || "null"); } catch {}
  if (!d || (!d.body && !d.editing)) return resetForm();
  state.date = d.date || diaryDateOf(new Date(), cfg().cutoff);
  state.tags = new Set(d.tags || []);
  state.editing = d.editing || null;
  state.category = d.category || "diary";
  $("w-title").value = d.title || "";
  $("w-body").value = d.body || "";
  $("w-private").checked = !!d.private;
  $("w-tidy").checked = !!d.tidy;
  showEditing();
  auLabel();
  renderKind();
  renderTags();
  if (d.body) status("書きかけの下書きを復元しました");
}

function showEditing() {
  const e = state.editing;
  $("w-editing").hidden = !e;
  $("w-date").disabled = !!e;
  if (e) $("w-editing").textContent = `編集中: ${e.path.replace(/^_posts\//, "")}`;
}

// ---------------------------------------------------------------
// 保存
// ---------------------------------------------------------------
async function nextFreePath(date, category) {
  const taken = new Set(await listPaths(`_posts/${date}`));
  for (let i = 2; ; i++) {
    const p = `_posts/${date}-${category}-${i}.md`;
    if (!taken.has(p)) return p;
  }
}

function titleValue() {
  return state.category === "diary" ? describe(state.date).label : $("w-title").value.trim();
}

function newFrontMatter() {
  const fm = [
    { key: "title", value: titleValue() },
    { key: "category", value: state.category },
    { key: "tags", value: [...state.tags] },
  ];
  if ($("w-private").checked) fm.push({ key: "private", value: "true" });
  fm.push({ key: "written", value: localTimestamp() });
  return fm;
}

async function save() {
  const body = $("w-body").value.trim();
  if (!body) return status("本文が空です", "error");
  if (state.category !== "diary" && !$("w-title").value.trim()) return status("タイトルを入れてください", "error");
  const btn = $("w-save");
  btn.disabled = true;
  status("保存しています…");
  try {
    const tidy = $("w-tidy").checked;
    const label = titleValue();
    let path, mode, fm, text, sha;

    if (state.editing) {
      ({ path, sha } = state.editing);
      mode = "replace";
      fm = state.editing.fm;
      fmSet(fm, "tags", [...(state.editing.hiddenTags || []), ...state.tags]);
      fmSet(fm, "private", $("w-private").checked ? "true" : undefined);
      fmSet(fm, "published", undefined);
      fmSet(fm, "category", state.category);
      fmSet(fm, "title", titleValue());
      text = body;
    } else {
      path = `_posts/${state.date}-${state.category}.md`;
      const existing = await getFile(path);
      if (existing && state.category === "diary" && confirm(`${label}の日記はもうあります。続きとして追記しますか？\n（キャンセルで別の日記として保存）`)) {
        mode = "append";
        sha = existing.sha;
        const doc = parseDoc(existing.text);
        fm = doc.fm;
        const merged = new Set([...(Array.isArray(fmGet(fm, "tags")) ? fmGet(fm, "tags") : []), ...state.tags]);
        fmSet(fm, "tags", [...merged]);
        if ($("w-private").checked) fmSet(fm, "private", "true");
        text = `${doc.body.replace(/\s+$/, "")}\n\n${body}`;
      } else {
        mode = "new";
        if (existing) path = await nextFreePath(state.date, state.category);
        fm = newFrontMatter();
        text = body;
      }
    }

    if (tidy) {
      // 整形は GitHub Actions 側で行う。_inbox に置くと、整形して path に書き込まれる。
      const inbox = [
        { key: "target", value: path },
        { key: "mode", value: mode },
        { key: "provider", value: cfg().provider },
        ...fm.map((e) => ({ key: `fm_${e.key}`, value: e.value })),
      ];
      const stamp = localTimestamp().slice(11, 19).replace(/:/g, "");
      await putFile(`_inbox/${state.date}-${stamp}.md`, b64text(serialize(inbox, body)), `inbox: ${label} (${state.date})`);
      status(`受け付けました。整えてから公開します（数分かかります）`, "ok");
    } else {
      await putFile(path, b64text(serialize(fm, text)), `diary: ${label} (${state.date})`, sha);
      const isPrivate = $("w-private").checked;
      status(isPrivate ? "保存しました（非公開）" : "保存しました。1〜2分でサイトに反映されます", "ok");
    }

    for (const t of state.tags) state.knownTags.add(t);
    store.set(K.tags, JSON.stringify([...state.knownTags]));
    resetForm();
    loadRecent();
  } catch (e) {
    status(e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------
// 最近の日記 (非公開・整形待ちも含めて GitHub から読む)
// ---------------------------------------------------------------
async function loadRecent() {
  const ul = $("w-recent-list");
  if (!cfg().token) {
    ul.innerHTML = `<li class="w-muted">右上の ⚙ から GitHub トークンを設定すると、ここに最近の日記が並びます。</li>`;
    return;
  }
  try {
    const [posts, inbox] = await Promise.all([listPaths("_posts/"), listPaths("_inbox/")]);
    const items = posts.filter((p) => /\/\d{4}-\d{2}-\d{2}[-.].+\.md$/.test(p)).sort().reverse().slice(0, 14);
    const pending = inbox.filter((p) => p.endsWith(".md"));
    ul.innerHTML =
      pending.map((p) => `<li class="w-muted">⏳ 整形待ち: ${esc(p.slice(7, 17))}</li>`).join("") +
      items
        .map((p) => {
          const iso = p.slice(7, 17);
          const d = describe(iso);
          const kind = /-review(-\d+)?\.md$/.test(p) ? "感想 · " : "";
          return `<li><button type="button" class="w-recent-item" data-path="${esc(p)}">
            <span class="au">${kind}${d.label}</span><span class="date">${d.y}.${d.m}.${d.d} ${d.weekday}</span></button></li>`;
        })
        .join("");
  } catch (e) {
    ul.innerHTML = `<li class="w-muted">${esc(e.message)}</li>`;
  }
}

async function openForEdit(path) {
  if ($("w-body").value.trim() && !confirm("書きかけの内容を破棄して、この日記を開きますか？")) return;
  status("読み込んでいます…");
  try {
    const f = await getFile(path);
    if (!f) throw new Error("見つかりませんでした");
    const { fm, body } = parseDoc(f.text);
    const tags = Array.isArray(fmGet(fm, "tags")) ? fmGet(fm, "tags") : [];
    state.tags = new Set(displayTags(tags));
    // 旧サイトの "2022/07" のような日付タグは残したまま、画面には出さない
    state.editing = { path, sha: f.sha, fm, hiddenTags: tags.filter((t) => !state.tags.has(t)) };
    state.date = path.slice(7, 17);
    state.category = fmGet(fm, "category") || "diary";
    $("w-title").value = state.category === "diary" ? "" : fmGet(fm, "title") || "";
    $("w-body").value = body.replace(/^\n+/, "").replace(/\s+$/, "");
    $("w-private").checked = fmGet(fm, "private") === "true" || fmGet(fm, "published") === "false";
    $("w-tidy").checked = false;
    showEditing();
    auLabel();
    renderKind();
    renderTags();
    saveDraft();
    status("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    status(e.message, "error");
  }
}

// ---------------------------------------------------------------
// 写真 (端末で縮小してから送る。位置情報などの EXIF はここで消える)
// ---------------------------------------------------------------
async function resize(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  return new Uint8Array(await blob.arrayBuffer());
}

function insertAtCursor(text) {
  const ta = $("w-body");
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + text.length;
  saveDraft();
}

async function addPhotos(files) {
  const [y, m, d] = state.date.split("-");
  let i = 0;
  for (const file of files) {
    i++;
    status(`写真を送っています… (${i}/${files.length})`);
    try {
      const bytes = await resize(file);
      const t = localTimestamp().slice(11, 19).replace(/:/g, "");
      const path = `assets/images/${y}/${MONTH_ABBR[Number(m) - 1]}/${y}${m}${d}_${t}_${i}.jpg`;
      await putFile(path, b64encode(bytes), `photo: ${state.date}`);
      const ta = $("w-body");
      const before = ta.value.slice(0, ta.selectionStart ?? ta.value.length);
      insertAtCursor(`${before && !before.endsWith("\n") ? "\n" : ""}![写真](/${path})\n`);
    } catch (e) {
      return status(`写真を送れませんでした: ${e.message}`, "error");
    }
  }
  status("写真を追加しました", "ok");
}

// ---------------------------------------------------------------
// 音声入力 (Web Speech API)。使えない端末ではキーボードのマイクを使う。
// ---------------------------------------------------------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let listening = false;

function setupMic() {
  if (!SR) return;
  const btn = $("w-mic");
  btn.hidden = false;
  // Android の Chrome は continuous だと同じ結果を繰り返すので、1文ずつ区切って再開する
  const continuous = !/Android/i.test(navigator.userAgent);

  const start = () => {
    rec = new SR();
    rec.lang = "ja-JP";
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) insertAtCursor(r[0].transcript);
        else interim += r[0].transcript;
      }
      $("w-interim").textContent = interim;
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        stop();
        status("マイクが許可されていません。ブラウザの設定を確認するか、キーボードのマイクを使ってください", "error");
      }
    };
    rec.onend = () => {
      if (listening) { try { rec.start(); } catch { start(); } }
    };
    rec.start();
  };
  const stop = () => {
    listening = false;
    rec?.stop();
    btn.textContent = "🎙 話して書く";
    btn.classList.remove("on");
    $("w-interim").textContent = "";
  };

  btn.addEventListener("click", () => {
    if (listening) return stop();
    listening = true;
    state.usedMic = true;
    $("w-tidy").checked = true; // 音声で書いたら、既定で整形する
    btn.textContent = "■ 止める";
    btn.classList.add("on");
    try { start(); } catch (e) { stop(); status(e.message, "error"); }
  });
}

// ---------------------------------------------------------------
// 設定
// ---------------------------------------------------------------
function setupSettings() {
  const dlg = $("w-settings");
  const open = () => {
    const c = cfg();
    $("s-token").value = c.token;
    $("s-repo").value = `${c.owner}/${c.name}`;
    $("s-branch").value = c.branch;
    $("s-cutoff").value = String(c.cutoff);
    $("s-provider").value = c.provider;
    $("s-status").textContent = "";
    dlg.showModal();
  };
  const persist = () => {
    store.set(K.token, $("s-token").value.trim());
    store.set(K.repo, $("s-repo").value.trim() || "natsufuna/natsufuna.github.io");
    store.set(K.branch, $("s-branch").value.trim() || "master");
    store.set(K.cutoff, $("s-cutoff").value);
    store.set(K.provider, $("s-provider").value);
  };
  $("w-open-settings").addEventListener("click", open);
  dlg.addEventListener("close", () => {
    persist();
    if (!state.editing && !$("w-body").value.trim()) resetForm();
    loadRecent();
  });
  $("s-test").addEventListener("click", async () => {
    persist();
    $("s-status").textContent = "確認しています…";
    try {
      const r = await gh(repoPath());
      if (!r) throw new Error("リポジトリが見つかりません（トークンの対象リポジトリを確認してください）");
      $("s-status").textContent = r.permissions?.push ? `✓ ${r.full_name} に書き込めます` : "読み取りのみです。Contents の Read and write を許可してください";
    } catch (e) {
      $("s-status").textContent = e.message;
    }
  });
  $("s-forget").addEventListener("click", () => {
    if (!confirm("この端末からトークンと下書きを消去しますか？")) return;
    Object.values(K).forEach((k) => store.del(k));
    $("s-token").value = "";
    $("s-status").textContent = "消去しました";
  });
  if (!cfg().token) open();
}

// ---------------------------------------------------------------
// 起動
// ---------------------------------------------------------------
async function loadKnownTags() {
  try { JSON.parse(store.get(K.tags) || "[]").forEach((t) => state.knownTags.add(t)); } catch {}
  try {
    const entries = await (await fetch("/posts.json")).json();
    const count = new Map();
    for (const e of entries) for (const t of e.tags) count.set(t, (count.get(t) || 0) + 1);
    [...count.entries()].sort((a, b) => b[1] - a[1]).forEach(([t]) => state.knownTags.add(t));
  } catch {}
  renderTags();
}

$("w-date").addEventListener("change", (ev) => {
  if (!ev.target.value) return;
  state.date = ev.target.value;
  auLabel();
  saveDraft();
});
$("w-tags").addEventListener("click", (ev) => {
  const b = ev.target.closest(".chip");
  if (!b) return;
  const t = b.dataset.tag;
  state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t);
  renderTags();
  saveDraft();
});
$("w-tag-input").addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" || ev.isComposing) return;
  ev.preventDefault();
  const t = ev.target.value.trim().replace(/[,\s]+/g, "_");
  if (t) { state.tags.add(t); state.knownTags.add(t); }
  ev.target.value = "";
  renderTags();
  saveDraft();
});
$("w-body").addEventListener("input", saveDraft);
$("w-title").addEventListener("input", saveDraft);
for (const r of document.querySelectorAll('input[name="w-kind"]')) {
  r.addEventListener("change", () => { state.category = r.value; renderKind(); saveDraft(); });
}
$("w-private").addEventListener("change", saveDraft);
$("w-tidy").addEventListener("change", saveDraft);
$("w-photo").addEventListener("change", (ev) => { const files = [...ev.target.files]; ev.target.value = ""; if (files.length) addPhotos(files); });
$("w-save").addEventListener("click", save);
$("w-new").addEventListener("click", () => {
  if ($("w-body").value.trim() && !confirm("書きかけの内容を破棄しますか？")) return;
  resetForm();
  status("");
});
$("w-recent-list").addEventListener("click", (ev) => {
  const b = ev.target.closest(".w-recent-item");
  if (b) openForEdit(b.dataset.path);
});

restoreDraft();
setupMic();
setupSettings();
loadKnownTags();
loadRecent();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/write/sw.js", { scope: "/write/" }).catch(() => {});
