// Raya – Offline-Cache (stale-while-revalidate)
const V = 'raya-v2';
const ASSETS = ['./', 'index.html', 'style.css', 'sprites.js', 'game.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'vt323.woff2', 'press-start-2p.woff2'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(V).then((c) => c.match(e.request).then((hit) => {
    const net = fetch(e.request).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) c.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  })));
});
