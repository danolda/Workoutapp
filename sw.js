const CACHE_NAME = 'workout-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './1dk.mp3',
  './30s.mp3',
  './15s.mp3',
  './5s.mp3'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(response => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    }).catch(() => {
      if (e.request.mode === 'navigate') return caches.match('./index.html');
    })
  );
});

// Bildirim aksiyonlari - kilit ekranindan kontrol
const bc = new BroadcastChannel('workout-channel');

self.addEventListener('notificationclick', event => {
  const action = event.action;

  if (action === 'decrease' || action === 'increase' || action === 'save' || action === 'skip') {
    bc.postMessage({ action });
  } else {
    event.notification.close();
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        for (const client of windowClients) {
          if ('focus' in client) return client.focus();
        }
        return clients.openWindow('./index.html');
      })
    );
  }
});
