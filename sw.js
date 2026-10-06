// Service worker: guarda la app para que funcione sin internet.
const CACHE = 'uush-v1';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'cards.js', 'manifest.webmanifest',
  'img/gato1.png', 'img/gato2.png', 'img/gato3.png',
  'fonts/alfa-slab-one.woff2', 'fonts/archivo-500.woff2', 'fonts/archivo-700.woff2', 'fonts/archivo-800.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match('index.html'))));
});
