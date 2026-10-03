/* Folio – service worker: stores the app on the device so it starts without internet.
   Bump VERSION after every change to the app (folio-v4, folio-v5, …); devices then fetch the new version. */
const VERSION = 'folio-v4';
const SHELL = ['./', 'app.css', 'app.js', 'i18n.js', 'db.js', 'epub.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'fonts/Lora.ttf', 'fonts/Lora-Italic.ttf'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Answer from the device cache first (fast, offline) and check for updates in the background.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = req.mode === 'navigate' ? './' : req;
    const hit = await cache.match(key, { ignoreSearch: true });
    const fresh = fetch(req.url, { cache: 'no-cache' })
      .then(res => { if (res && res.ok) cache.put(key, res.clone()); return res; })
      .catch(() => null);
    if (hit) { e.waitUntil(fresh); return hit; }
    return (await fresh) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
