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
