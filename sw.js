const CACHE_NAME = 'workout-v5';
const ASSETS = ['./', './index.html', './figures.js', './manifest.json', './icon-192.png', './icon-512.png', './1dk.mp3', './30s.mp3', './15s.mp3', './5s.mp3'];
const NAV_TIMEOUT_MS = 3500;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ================= FETCH ================= */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Sayfa ve uygulama kodu: önce ağ (güncellemeler hemen gelsin), ağ yoksa/yavaşsa önbellek
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, './index.html'));
    return;
  }
  if (url.origin === self.location.origin && url.pathname.endsWith('.js')) {
    e.respondWith(networkFirst(req, req));
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(req.headers.has('range') ? rangeFromCache(req) : staleWhileRevalidate(e, req));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req, cacheKey) {
  const cache = await caches.open(CACHE_NAME);
  const network = fetch(req).then((res) => {
    if (res.ok && res.status === 200) cache.put(cacheKey, res.clone());
    return res;
  });
  network.catch(() => {});
  const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch (err) { /* çevrimdışı */ }
  const cached = (await cache.match(cacheKey)) || (await cache.match(req));
  return cached || network;
}

async function staleWhileRevalidate(e, req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res.ok && res.status === 200) cache.put(req, res.clone());
    return res;
  });
  if (cached) {
    e.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network;
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// Ses dosyaları için kısmi (206) yanıt: iOS Safari önbellekten tam (200) yanıtla ses çalmaz
async function rangeFromCache(req) {
  const cached = await caches.match(req.url);
  if (!cached) return fetch(req);
  const buf = await cached.arrayBuffer();
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  let start = 0;
  let end = size - 1;
  if (m && m[1] !== '') {
    start = Number(m[1]);
    if (m[2] !== '') end = Math.min(Number(m[2]), size - 1);
  } else if (m && m[2] !== '') {
    start = Math.max(0, size - Number(m[2]));
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes'
    }
  });
}

/* ================= REST TIMER NOTIFICATIONS ================= */
// Sayfa dinlenmeyi başlatınca uyarı zamanlarını buraya bildirir. Sayfa arka planda
// dondurulursa (ve uyarıyı çalamazsa) bildirim yedek olarak buradan gönderilir.
const GRACE_MS = 1500;
let schedule = null;

self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'rest-start') e.waitUntil(startSchedule(d));
  else if (d.type === 'rest-stop') stopSchedule();
  else if (d.type === 'cue-done' && schedule && schedule.id === d.id) schedule.handled.add(d.sec);
});

function stopSchedule() {
  if (!schedule) return;
  schedule.timers.forEach(clearTimeout);
  schedule.resolve();
  schedule = null;
}

function startSchedule(d) {
  stopSchedule();
  return new Promise((resolve) => {
    const s = { id: d.id, handled: new Set(), timers: [], resolve };
    schedule = s;
    const now = Date.now();
    (d.cues || []).forEach((sec) => {
      const delay = d.endAt - sec * 1000 - now + GRACE_MS;
      if (delay > 0) s.timers.push(setTimeout(() => fallbackCue(s, sec, d.next), delay));
    });
    s.timers.push(setTimeout(() => {
      if (schedule === s) schedule = null;
      resolve();
    }, Math.max(0, d.endAt - now) + GRACE_MS + 4000));
  });
}

async function fallbackCue(s, sec, next) {
  if (schedule !== s || s.handled.has(sec)) return;
  try {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((c) => c.visibilityState === 'visible')) return;
    const title = sec === 0 ? '✅ Dinlenme bitti!' : sec === 60 ? '⏱ 1 dakika kaldı' : `⏱ ${sec} saniye kaldı`;
    await self.registration.showNotification(title, {
      body: next ? 'Sıradaki: ' + next : '',
      tag: 'rest-timer',
      renotify: true,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      vibrate: sec === 0 ? [300, 120, 300] : [200, 100, 200]
    });
  } catch (err) { /* izin geri alınmış olabilir */ }
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if ('focus' in c) return c.focus();
    }
    return self.clients.openWindow('./');
  })());
});
