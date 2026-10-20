import { describe, displayTags, summerLabel } from "./assets/js/august.js";

const strip = (html) =>
  String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

export default function (cfg) {
  cfg.addPassthroughCopy("assets");
  cfg.addPassthroughCopy("images");
  cfg.addPassthroughCopy("write/sw.js");
  cfg.addPassthroughCopy("write/manifest.webmanifest");

  // 1行ごとに改行して書く文体なので、改行をそのまま <br> にする
  cfg.amendLibrary("md", (md) => md.set({ breaks: true, html: true }));

  cfg.addCollection("entries", (api) =>
    api
      .getFilteredByGlob("_posts/*.md")
      .filter((p) => p.data.visible)
      .sort((a, b) => (a.data.diary.key < b.data.diary.key ? -1 : 1)),
  );

  cfg.addFilter("displayTags", displayTags);
  cfg.addFilter("summerLabel", summerLabel);
  cfg.addFilter("describe", describe);
  cfg.addFilter("plain", strip);
  cfg.addFilter("excerpt", (html, n = 110) => {
    const s = strip(html);
    return s.length > n ? s.slice(0, n) + "…" : s;
  });
  cfg.addFilter("reverse", (arr) => [...arr].reverse());
  // 8月暦の年 (夏) ごとにまとめる。新しい夏が先頭。
  cfg.addFilter("bySummer", (entries) => {
    const groups = new Map();
    for (const e of entries) {
      const s = e.data.diary.summer;
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s).push(e);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([summer, items]) => ({ summer, items: items.reverse() }));
  });

  // 夏の中を月ごとにまとめる。新しい月が先頭、月の中は日付順。
  cfg.addFilter("byMonth", (items) => {
    const groups = new Map();
    for (const e of items) {
      const { y, m } = e.data.diary;
      const k = `${y}-${String(m).padStart(2, "0")}`;
      if (!groups.has(k)) groups.set(k, { y, m, items: [] });
      groups.get(k).items.push(e);
    }
    return [...groups.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([, g]) => ({ ...g, items: [...g.items].reverse() }));
  });

  return {
    dir: { input: ".", includes: "_includes", data: "_data", output: "_site" },
    // 本文中の {{ }} などをテンプレートとして解釈しない
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
  };
}
