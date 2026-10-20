import { displayTags } from "./assets/js/august.js";

// トップページのカレンダー・絞り込み・検索が読み込む日記の索引
export const data = {
  permalink: "/posts.json",
  eleventyExcludeFromCollections: true,
};

const plain = (html) =>
  String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

export function render({ collections }) {
  const entries = collections.entries.map((p) => {
    const d = p.data.diary;
    const text = plain(p.content);
    return {
      url: p.url,
      date: d.iso,
      wd: d.weekday,
      au: d.day,
      summer: d.summer,
      tags: displayTags(p.data.tags),
      title: p.data.title && !String(p.data.title).startsWith("8月") ? String(p.data.title) : "",
      excerpt: text.length > 110 ? text.slice(0, 110) + "…" : text,
      text,
    };
  });
  return JSON.stringify(entries);
}
