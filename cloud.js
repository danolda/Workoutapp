/* ================= BULUT KAYDI (Google ile giriş) =================
   Asıl kayıt Supabase'teki hesabındır (workout_profiles, RPC workout_sync). Telefondaki
   localStorage yalnızca önbellek + çevrimdışı kuyruktur: her antrenman/rekor değişikliği
   "bekliyor" olarak işaretlenir ve internet olunca buluta gönderilir. Birleştirme sunucuda
   yapılır ve ilerleme hiç düşmez (antrenmanlar id'ye göre birleşir, hiçbiri silinmez).
   Giriş: Supabase Auth Google sağlayıcısı, implicit akış. index.html başındaki küçük betik
   dönüşteki #access_token=… parçasını aq_auth_new'e yazar ve adresi temizler. */
(function (root) {
  'use strict';

  const CFG = {
    url: 'https://veufvthlejqoobexzrjo.supabase.co',
    key: 'sb_publishable_QI3F1X4X2Qaxo7DGMKl6Ng_j_QlvvyV'
  };
  const K = {
    auth: 'aq_auth',
    authNew: 'aq_auth_new',
    authRet: 'aq_auth_ret',
    owner: 'aq_cloud_owner',     // bu cihazdaki önbelleğin ait olduğu hesap
    dirty: 'aq_cloud_dirty',     // buluta gönderilmemiş değişiklik sayısı
    rt: 'aq_records_t',          // rekor anahtarı başına son değişiklik zamanı
    last: 'aq_cloud_last',       // son başarılı eşitleme (ms)
    stash: 'aq_cloud_stash_'     // başka hesaba ait, gönderilmemiş veri (kaybolmasın diye)
  };
  const REC_KEY = 'athlete_quest_overload_records_v1';
  const T = root.Tracker;

  const ls = (() => { try { return root.localStorage; } catch (e) { return null; } })();
  function jget(k, d) { try { const v = ls && ls.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function jset(k, v) { try { ls && ls.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function jdel(k) { try { ls && ls.removeItem(k); } catch (e) {} }

  let quiet = false;           // buluttan gelen veriyi yazarken değişiklik sayma
  let busy = false;
  let again = false;
  let timer = null;
  let state = 'idle';          // idle | syncing | ok | offline | error
  let lastError = '';
  const listeners = [];

  function emit() { listeners.forEach((f) => { try { f(); } catch (e) {} }); }

  /* ---------- Oturum ---------- */
  function decodeJwt(t) {
    try {
      const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(p + '==='.slice((p.length + 3) % 4)))));
    } catch (e) { return {}; }
  }
  function sess() { return jget(K.auth, null); }
  function signedIn() { const s = sess(); return !!(s && s.access_token && s.email); }

  function getAccess() {
    const s = sess();
    if (!s || !s.access_token) return Promise.resolve(null);
    if (s.expires_at && Date.now() / 1000 < s.expires_at - 90) return Promise.resolve(s.access_token);
    if (!s.refresh_token) return Promise.resolve(null);
    return fetch(CFG.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: CFG.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    }).then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, d }))).then(({ ok, status, d }) => {
      if (ok && d && d.access_token) {
        s.access_token = d.access_token;
        s.refresh_token = d.refresh_token || s.refresh_token;
        s.expires_at = d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600);
        jset(K.auth, s);
        return s.access_token;
      }
      // Yenileme jetonu geçersizse oturum bitti: yeniden giriş istenir (veri cihazda kalır)
      if (status === 400 || status === 401) { jdel(K.auth); lastError = 'Oturum süresi doldu, tekrar giriş yap.'; }
      return null;
    }).catch(() => s.access_token);
  }

  function rpc(name, body) {
    return getAccess().then((at) => {
      if (!at) throw Object.assign(new Error('no_auth'), { code: 'no_auth' });
      return fetch(CFG.url + '/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: { apikey: CFG.key, Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
    }).then((r) => r.text().then((t) => {
      let d = null;
      try { d = JSON.parse(t); } catch (e) {}
      if (!r.ok) throw Object.assign(new Error((d && d.message) || ('HTTP ' + r.status)), { code: r.status });
      return d;
    }));
  }

  /* ---------- Yerel önbellek ---------- */
  function localRecords() { const r = jget(REC_KEY, {}); return r && typeof r === 'object' ? r : {}; }
  function localData() { return { history: T.load(), records: localRecords(), rt: jget(K.rt, {}) }; }
  function dirtyCount() { return +jget(K.dirty, 0) || 0; }

  function writeLocal(d) {
    quiet = true;
    try {
      const recs = {};
      Object.keys(d.records || {}).forEach((k) => { if (d.records[k] !== null && d.records[k] !== undefined) recs[k] = d.records[k]; });
      T.replaceHistory(Array.isArray(d.history) ? d.history : []);
      jset(REC_KEY, recs);
      jset(K.rt, d.records_t || {});
    } finally { quiet = false; }
  }

  function clearLocal() {
    quiet = true;
    try {
      T.replaceHistory([]);
      jset(REC_KEY, {});
      jdel(K.rt); jdel(K.owner); jdel(K.dirty);
    } finally { quiet = false; }
  }

  // Herhangi bir antrenman / rekor değişikliği: kuyruğa al, kısa süre sonra gönder
  function touch() {
    if (quiet) return;
    jset(K.dirty, dirtyCount() + 1);
    if (signedIn()) schedule(1500);
    emit();
  }

  // index.html'deki lsSet rekor yazarken çağırır: değişen anahtarların zamanını tut
  function recordsChanged(before, after) {
    if (quiet) return;
    const rt = jget(K.rt, {});
    const now = Date.now();
    const keys = new Set(Object.keys(before || {}).concat(Object.keys(after || {})));
    let changed = false;
    keys.forEach((k) => {
      if ((before || {})[k] !== (after || {})[k]) { rt[k] = now; changed = true; }
    });
    if (!changed) return;
    jset(K.rt, rt);
    // Silinen anahtar buluta "null" olarak gitsin diye: gönderimde rt'de olup kayıtta olmayan → null
    touch();
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => { sync(); }, ms);
  }

  /* ---------- Eşitleme ---------- */
  function payload(d) {
    const recs = Object.assign({}, d.records);
    Object.keys(d.rt || {}).forEach((k) => { if (!(k in recs)) recs[k] = null; });
    return { p_history: d.history, p_records: recs, p_records_t: d.rt || {} };
  }

  async function sync(opts) {
    opts = opts || {};
    if (!signedIn()) return false;
    if (busy) { again = true; return false; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { state = 'offline'; emit(); return false; }
    busy = true; state = 'syncing'; emit();
    const email = sess().email;
    try {
      const owner = jget(K.owner, null);
      const local = localData();
      const hasLocal = local.history.length > 0 || Object.keys(local.records).length > 0;
      let push = true;

      if (owner && owner !== email) {
        // Önbellek başka bir hesabın: gönderilmemiş değişikliği varsa sakla, bu hesaba karıştırma
        if (dirtyCount()) jset(K.stash + owner, local);
        push = false;
      } else if (!owner && hasLocal) {
        // Hesaba bağlanmamış eski cihaz verisi (giriş öncesi): bu hesaba eklensin mi?
        const xp = T.totalXp(local.history);
        const ok = typeof root.confirm !== 'function' ? true : root.confirm(
          `Bu cihazda ${local.history.length} antrenman (${xp.toLocaleString('tr-TR')} XP) var.\n\n` +
          `${email} hesabına eklensin mi? (Hesaptaki kayıtlar silinmez, ikisi birleşir.)`);
        if (!ok) { jset(K.stash + 'cihaz', local); push = false; }
      }

      // Bu hesaba ait, daha önce saklanmış gönderilmemiş veri varsa önce onu gönder
      const st = jget(K.stash + email, null);
      if (st) { await rpc('workout_sync', payload(st)); jdel(K.stash + email); }

      const seqBefore = dirtyCount();
      const res = await rpc('workout_sync', push ? payload(local) : {});
      if (!res || res.email !== email) throw new Error('Beklenmeyen yanıt');
      // İstek sürerken yeni bir set kaydedildiyse onu kaybetme: birleşmiş veriye ekleyip tekrar gönder
      const changedMeanwhile = dirtyCount() !== seqBefore;
      if (changedMeanwhile) {
        const cur = localData();
        const ids = new Set(res.history.map((x) => x.id));
        res.history = res.history.concat(cur.history.filter((x) => !ids.has(x.id)));
        Object.keys(cur.rt).forEach((k) => {
          if (!res.records_t || (cur.rt[k] || 0) > (res.records_t[k] || 0)) {
            res.records[k] = k in cur.records ? cur.records[k] : null;
            res.records_t = Object.assign(res.records_t || {}, { [k]: cur.rt[k] });
          }
        });
      }
      writeLocal(res);
      jset(K.owner, email);
      if (changedMeanwhile) again = true; else jdel(K.dirty);
      jset(K.last, Date.now());
      state = 'ok'; lastError = '';
      return true;
    } catch (e) {
      if (e && e.code === 'no_auth') { state = 'idle'; }
      else { state = (typeof navigator !== 'undefined' && navigator.onLine === false) || e instanceof TypeError ? 'offline' : 'error'; lastError = e && e.message ? String(e.message) : ''; }
      return false;
    } finally {
      busy = false;
      emit();
      if (again) { again = false; schedule(800); }
      else if (state === 'offline' || state === 'error') schedule(60000);
    }
  }

  function signIn() {
    jset(K.authRet, 'profile');
    const back = location.origin + location.pathname;
    location.href = CFG.url + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(back);
  }

  async function signOut() {
    if (dirtyCount()) await sync({ auto: true });
    if (dirtyCount() && !confirm('Son değişikliklerin henüz buluta gitmedi (internet yok gibi).\n\nYine de çıkılsın mı? Bu değişiklikler bu cihazda saklanır ve aynı hesapla tekrar giriş yapınca gönderilir.')) return false;
    const unsynced = dirtyCount() > 0;
    getAccess().then((at) => {
      if (at) fetch(CFG.url + '/auth/v1/logout', { method: 'POST', headers: { apikey: CFG.key, Authorization: 'Bearer ' + at } }).catch(() => {});
    });
    const s = sess();
    jdel(K.auth);
    if (unsynced && s) jset(K.stash + s.email, localData());
    clearLocal();
    state = 'idle'; lastError = '';
    emit();
    return true;
  }

  /* ---------- Açılış ---------- */
  function init() {
    let result = null;
    const nw = jget(K.authNew, null);
    if (nw) {
      jdel(K.authNew);
      if (nw.error) result = { ok: false, msg: nw.error_description || nw.error };
      else if (nw.access_token) {
        const c = decodeJwt(nw.access_token);
        const em = String(c.email || '').toLowerCase();
        if (em) {
          jset(K.auth, {
            access_token: nw.access_token,
            refresh_token: nw.refresh_token,
            expires_at: +nw.expires_at || Math.floor(Date.now() / 1000) + (+nw.expires_in || 3600),
            email: em
          });
          result = { ok: true, email: em };
        } else result = { ok: false, msg: 'E-posta alınamadı' };
      }
    }
    const ret = jget(K.authRet, null);
    if (ret) jdel(K.authRet);
    if (signedIn()) sync(result && result.ok ? {} : { auto: true });
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => sync({ auto: true }));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - (+jget(K.last, 0) || 0) > 30000) sync({ auto: true });
      });
    }
    return { result, ret };
  }

  root.WCloud = {
    init,
    sync: () => sync({ auto: true }),
    signIn,
    signOut,
    touch,
    recordsChanged,
    signedIn,
    email: () => (sess() || {}).email || '',
    status: () => ({ state, dirty: dirtyCount(), last: +jget(K.last, 0) || 0, error: lastError, busy }),
    onChange: (f) => listeners.push(f),
    _cfg: CFG
  };
})(typeof window !== 'undefined' ? window : globalThis);
