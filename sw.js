const CACHE = 'supertiebreak-v2.3.2';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=2.2.1',
  './app.js?v=2.2.1',
  './install.js?v=2.2.1',
  './manifest.webmanifest?v=2.2.1',
  './club-logo.png',
  './icon-192-v221.png',
  './icon-512-v221.png',
  './icon-maskable-192-v221.png',
  './icon-maskable-512-v221.png',
  './apple-touch-icon-v221.png',
  './app-icon-source.png',
  './firebase-messaging-sw.js?v=2.3.2'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }))
  );
});
