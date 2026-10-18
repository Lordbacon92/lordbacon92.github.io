// Raya – Offline-Cache: erst Netz (immer aktuell), bei fehlender Verbindung aus dem Cache
const V = 'raya-v9';
const ASSETS = ['./', 'index.html', 'style.css', 'sprites.js', 'scene.js', 'game.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'vt323.woff2', 'press-start-2p.woff2',
  'raya-atlas.png', 'raya-atlas.json', 'raya-stand.png', 'raya-side-small.png', 'raya-side-small-w1.png', 'raya-side-small-w2.png',
  'room-day.png', 'room-dusk.png', 'room-night.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(V).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
