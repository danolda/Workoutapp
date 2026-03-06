const CACHE_NAME='workout-v4';
const ASSETS=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./1dk.mp3','./30s.mp3','./15s.mp3','./5s.mp3'];

self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{if(r.status===200){const cl=r.clone();caches.open(CACHE_NAME).then(ca=>ca.put(e.request,cl))}return r})).catch(()=>{if(e.request.mode==='navigate')return caches.match('./index.html')}))});
