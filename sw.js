importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBIG5j_8pHr5C1KlFuG6lG0WunlUR8EJFs',
  authDomain: 'tiebreak-opstelling.firebaseapp.com',
  projectId: 'tiebreak-opstelling',
  storageBucket: 'tiebreak-opstelling.firebasestorage.app',
  messagingSenderId: '363554771251',
  appId: '1:363554771251:web:811ab3b99099fe4b1dee46'
});

const messaging=firebase.messaging();
messaging.onBackgroundMessage(payload=>{
  const title=payload.notification?.title||'Supertiebreak';
  const options={
    body:payload.notification?.body||'Nieuwe aanmelding.',
    icon:'./icon-192-v221.png',
    badge:'./icon-192-v221.png',
    data:{url:'./'}
  };
  self.registration.showNotification(title,options);
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){ if('focus' in client) return client.focus(); }
    return clients.openWindow('./');
  }));
});

const CACHE = 'supertiebreak-v2.3.7';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=2.3.7',
  './app.js?v=2.3.7',
  './install.js?v=2.3.7',
  './manifest.webmanifest?v=2.3.7',
  './club-logo.png',
  './icon-192-v221.png',
  './icon-512-v221.png',
  './icon-maskable-192-v235.png',
  './icon-maskable-512-v235.png',
  './apple-touch-icon-v221.png',
  './app-icon-source.png'
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
