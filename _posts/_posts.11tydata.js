import path from "node:path";
import { describe, postUrl } from "../assets/js/august.js";

// ファイル名 "2025-10-03-diary.md" から日付と slug を取り出す
function parseName(inputPath) {
  const base = path.basename(inputPath, ".md");
  const m = base.match(/^(\d{4}-\d{2}-\d{2})[-.](.+)$/);
  if (!m) throw new Error(`記事のファイル名が YYYY-MM-DD-xxx.md ではありません: ${inputPath}`);
  return { iso: m[1], slug: m[2] };
}

const hidden = (data) => data.private === true || data.published === false;
const isDiary = (data) => (data.category || "diary") === "diary";

export default {
  layout: "post.njk",
  eleventyComputed: {
    diary: (data) => {
      const { iso, slug } = parseName(data.page.inputPath);
      return { ...describe(iso), slug, key: `${iso}-${slug}` };
    },
    category: (data) => data.category || "diary",
    visible: (data) => !hidden(data),
    // 日記は8月暦がタイトル。感想などは front matter の title。
    heading: (data) => (isDiary(data) || !data.title ? describe(parseName(data.page.inputPath).iso).label : String(data.title)),
    pageTitle: (data) => (isDiary(data) || !data.title ? describe(parseName(data.page.inputPath).iso).label : String(data.title)),
    description: (data) => {
      const { y, m, d } = describe(parseName(data.page.inputPath).iso);
      return `${y}年${m}月${d}日`;
    },
    permalink: (data) => {
      if (hidden(data)) return false;
      const { iso, slug } = parseName(data.page.inputPath);
      return postUrl(data.category || "diary", iso, slug);
    },
  },
};
