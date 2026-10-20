// 投稿ページだけを対象にした最小限の Service Worker。
// 電波の弱い場所でもページを開いて下書きできるように、画面一式をキャッシュする。
// GitHub API への通信はキャッシュしない。
const CACHE = "diary-writer-v1";
const SHELL = ["/write/", "/assets/css/style.css", "/assets/css/write.css", "/assets/js/write.js", "/assets/js/august.js", "/assets/js/frontmatter.js"];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== "GET" || url.origin !== location.origin) return;
  // 新しい版を優先し、つながらないときだけキャッシュを使う
  ev.respondWith(
    fetch(ev.request)
      .then((res) => {
        if (res.ok && SHELL.includes(url.pathname)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(ev.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(ev.request)),
  );
});
