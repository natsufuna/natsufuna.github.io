import path from "node:path";
import { describe } from "../assets/js/august.js";

// ファイル名 "2025-10-03-diary.md" から日付と slug を取り出す
function parseName(inputPath) {
  const base = path.basename(inputPath, ".md");
  const m = base.match(/^(\d{4}-\d{2}-\d{2})[-.](.+)$/);
  if (!m) throw new Error(`日記のファイル名が YYYY-MM-DD-xxx.md ではありません: ${inputPath}`);
  return { iso: m[1], slug: m[2] };
}

const hidden = (data) => data.private === true || data.published === false;

export default {
  layout: "post.njk",
  eleventyComputed: {
    diary: (data) => {
      const { iso, slug } = parseName(data.page.inputPath);
      return { ...describe(iso), slug, key: `${iso}-${slug}` };
    },
    visible: (data) => !hidden(data),
    pageTitle: (data) => describe(parseName(data.page.inputPath).iso).label,
    season: (data) => describe(parseName(data.page.inputPath).iso).season,
    description: (data) => {
      const { y, m, d } = describe(parseName(data.page.inputPath).iso);
      return `${y}年${m}月${d}日の日記`;
    },
    // 旧サイト (Jekyll) と同じ URL: /diary/2025/10/03/diary.html
    permalink: (data) => {
      if (hidden(data)) return false;
      const { iso, slug } = parseName(data.page.inputPath);
      const [y, m, d] = iso.split("-");
      return `/${data.category || "diary"}/${y}/${m}/${d}/${slug}.html`;
    },
  },
};
