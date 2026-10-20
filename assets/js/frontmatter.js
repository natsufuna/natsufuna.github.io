// 日記の front matter を読み書きする。投稿ページ (ブラウザ) と整形スクリプト (Node) で共用。
// YAML の型変換 (日時が Date になる等) を避けるため、このリポジトリの単純な書式だけを扱う:
//   key: value
//   key:
//   - item
export function parseDoc(text) {
  const m = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if (!m) return { fm: [], body: text };
  const fm = [];
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s*-\s*(.*)$/);
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (item && fm.length) {
      const last = fm[fm.length - 1];
      if (!Array.isArray(last.value)) last.value = [];
      if (item[1].trim()) last.value.push(item[1].trim());
    } else if (kv) {
      fm.push({ key: kv[1], value: kv[2].trim() });
    }
  }
  return { fm, body: m[2] };
}

export function fmGet(fm, key) { return fm.find((e) => e.key === key)?.value; }
export function fmSet(fm, key, value) {
  const e = fm.find((x) => x.key === key);
  if (value === undefined) { if (e) fm.splice(fm.indexOf(e), 1); return; }
  if (e) e.value = value; else fm.push({ key, value });
}

export function serialize(fm, body) {
  const lines = fm.map(({ key, value }) =>
    Array.isArray(value) ? (value.length ? `${key}:\n${value.map((v) => `- ${v}`).join("\n")}` : `${key}: []`) : `${key}: ${value}`,
  );
  return `---\n${lines.join("\n")}\n---\n${body.replace(/^\n+/, "").replace(/\s+$/, "")}\n`;
}
