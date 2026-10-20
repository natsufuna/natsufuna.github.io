export const data = {
  permalink: "/feed.xml",
  eleventyExcludeFromCollections: true,
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function render({ collections, site }) {
  const items = [...collections.entries].reverse().slice(0, 20);
  const updated = items.length ? `${items[0].data.diary.iso}T00:00:00Z` : new Date().toISOString();
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(site.title)}</title>
  <subtitle>${esc(site.aboutme)}</subtitle>
  <link href="${site.url}/feed.xml" rel="self"/>
  <link href="${site.url}/"/>
  <id>${site.url}/</id>
  <updated>${updated}</updated>
  <author><name>${esc(site.author)}</name></author>
${items
  .map((p) => {
    const d = p.data.diary;
    return `  <entry>
    <title>${esc(p.data.heading)}（${d.y}.${d.m}.${d.d}）</title>
    <link href="${site.url}${p.url}"/>
    <id>${site.url}${p.url}</id>
    <updated>${d.iso}T00:00:00Z</updated>
    <content type="html">${esc(p.content)}</content>
  </entry>`;
  })
  .join("\n")}
</feed>
`;
}
