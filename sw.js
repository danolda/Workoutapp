const CACHE_NAME = 'workout-v10';
const ASSETS = ['./', './index.html', './figures.js', './tracker.js', './charts.js', './avatar.js', './manifest.json', './icon-192.png', './icon-512.png', './1dk.mp3?v=2', './30s.mp3?v=2', './15s.mp3?v=2', './5s.mp3?v=2'];
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

const CARD_TAG = 'workout-card';

self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'rest-start') e.waitUntil(startSchedule(d));
  else if (d.type === 'rest-stop') stopSchedule();
  else if (d.type === 'cue-done' && schedule && schedule.id === d.id) schedule.handled.add(d.sec);
  else if (d.type === 'ntfy-plan' && schedule && schedule.id === d.id) schedule.ntfy = d.cues && d.cues.length ? { topic: d.topic, cues: d.cues } : null;
});

/* ---- ntfy (sayfa donukken kilit ekranı düğmelerinin ntfy uyarılarını da güncellemesi için) ---- */
const NTFY_BASE = 'https://ntfy.sh';
const NTFY_MIN_LEAD_MS = 11000;
function ntfyReq(method, topic, seq, params, body) {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  const init = { method, mode: 'cors' };
  if (body !== undefined) {
    init.body = body;
    init.headers = { 'Content-Type': 'text/plain; charset=utf-8' };
  }
  return fetch(`${NTFY_BASE}/${encodeURIComponent(topic)}/${seq}${q}`, init).catch(() => null);
}
function ntfyShift(n, endAt, deltaMs) {
  const now = Date.now();
  return Promise.all(n.cues.map((c) => {
    c.at += deltaMs;
    if (c.cue === 0 && endAt > now && c.at - now < NTFY_MIN_LEAD_MS) c.at = now + NTFY_MIN_LEAD_MS;
    if (c.at - now < NTFY_MIN_LEAD_MS) return null;
    const body = c.cue === 0 ? c.base : [c.base, 'Bitiş: ' + clockTime(endAt)].filter(Boolean).join('\n');
    return ntfyReq('PUT', n.topic, c.seq, { title: c.title, priority: c.priority, at: String(Math.ceil(c.at / 1000)) }, body);
  }));
}
function ntfyCancel(n) {
  const now = Date.now();
  return Promise.all(n.cues.filter((c) => c.at > now - 11000).map((c) => ntfyReq('DELETE', n.topic, c.seq)));
}

const clockTime = (t) => {
  const d = new Date(t);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
};
const cueTitle = (sec) => (sec === 0 ? '✅ Dinlenme bitti!' : sec === 60 ? '⏱ 1 dakika kaldı' : `⏱ ${sec} saniye kaldı`);

// Sayfa donmuşken kartı servis çalışanı günceller (sıradaki set + bitiş saati)
function cardOptions(d, sec, alert) {
  const o = {
    body: [d.next ? 'Sıradaki: ' + d.next : '', d.progress || '', sec === 0 ? '' : 'Bitiş: ' + clockTime(d.endAt)].filter(Boolean).join('\n'),
    tag: CARD_TAG,
    renotify: !!alert,
    silent: !alert,
    requireInteraction: true,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    timestamp: d.endAt,
    actions: sec === 0 ? [{ action: 'open', title: '▶ Sete başla' }] : [{ action: 'skip-rest', title: '⏭ Dinlenmeyi bitir' }, { action: 'add15', title: '+15 sn' }],
    data: { kind: 'card', restId: d.id }
  };
  if (alert) o.vibrate = sec === 0 ? [300, 120, 300] : [200, 100, 200];
  return o;
}

function stopSchedule() {
  if (!schedule) return;
  schedule.timers.forEach(clearTimeout);
  schedule.resolve();
  schedule = null;
}

function startSchedule(d) {
  stopSchedule();
  return new Promise((resolve) => {
    const s = { id: d.id, handled: new Set(), timers: [], resolve, data: d };
    schedule = s;
    const now = Date.now();
    (d.cues || []).forEach((sec) => {
      const delay = d.endAt - sec * 1000 - now + GRACE_MS;
      if (delay > 0) s.timers.push(setTimeout(() => fallbackCue(s, sec), delay));
    });
    s.timers.push(setTimeout(() => {
      if (schedule === s) schedule = null;
      resolve();
    }, Math.max(0, d.endAt - now) + GRACE_MS + 4000));
  });
}

async function fallbackCue(s, sec) {
  if (schedule !== s || s.handled.has(sec)) return;
  try {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((c) => c.visibilityState === 'visible')) return;
    await self.registration.showNotification(cueTitle(sec), cardOptions(s.data, sec, true));
  } catch (err) { /* izin geri alınmış olabilir */ }
}

// Kart düğmeleri: kilit ekranından dinlenmeyi bitir / +15 sn / uygulamayı aç
self.addEventListener('notificationclick', (e) => {
  const action = e.action || 'open';
  const restId = e.notification.data && e.notification.data.restId;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const restAction = action === 'add15' || action === 'skip-rest';
    if (restAction && !wins.length) {
      // Uygulama kapanmış: işlemi açılışta uygula (dinlenme localStorage'dan geri yüklenir)
      e.notification.close();
      return self.clients.openWindow(`./index.html?act=${action}&rest=${restId}`);
    }
    wins.forEach((c) => c.postMessage({ type: 'notif-action', action, restId, at: Date.now() }));
    if (action === 'add15') {
      if (schedule && schedule.id === restId) {
        // Yedek zamanlayıcıyı (ve varsa ntfy uyarılarını) 15 sn kaydır: sayfa donmuş olsa bile doğru anda gelsin
        const ntfy = schedule.ntfy;
        const d = Object.assign({}, schedule.data, { endAt: schedule.data.endAt + 15000 });
        const keep = startSchedule(d);
        if (ntfy) {
          schedule.ntfy = ntfy;
          await ntfyShift(ntfy, d.endAt, 15000);
        }
        await self.registration.showNotification('⏱ +15 sn eklendi', cardOptions(d, 1, false));
        return keep;
      }
      return undefined; // sayfa süreyi uzatır, kartı ve yedek zamanlayıcıyı kendisi yeniler
    }
    e.notification.close();
    if (action === 'skip-rest') {
      if (schedule && schedule.id === restId && schedule.ntfy) await ntfyCancel(schedule.ntfy);
      stopSchedule();
    }
    for (const c of wins) {
      if ('focus' in c) return c.focus();
    }
    return self.clients.openWindow('./');
  })());
});
