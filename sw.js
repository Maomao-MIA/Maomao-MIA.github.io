const CACHE = 'tihai-v60';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      // 新版本生效时，强制已在打开的页面刷新一次，避免长期停留在旧缓存
      .then(() => self.clients.matchAll({ includeUncontrolled: true }))
      .then((cls) => cls.forEach((c) => { try { c.navigate(c.url); } catch (e) {} }))
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // 网络优先，离线时回退缓存（保证更新即时生效，同时保留离线可用）
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || (req.mode === 'navigation' ? caches.match('./index.html') : undefined)))
  );
});
