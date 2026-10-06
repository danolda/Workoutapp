/* ================= TRACKER & LEVELS =================
   Antrenman geçmişi (yerel), hareket istatistikleri ve seviye sistemi.
   DOM kullanmaz; tüm hesaplar saf fonksiyonlardır. */
(function (root) {
  'use strict';

  const HISTORY_KEY = 'athlete_quest_history_v1';
  const XP_BY_TYPE = { upper: 450, lower: 550 };
  const MAX_LEVEL = 100;
  const TIER_EVERY = 10;
  const MAX_TIER = MAX_LEVEL / TIER_EVERY;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);

  /* ---------- Seviye eğrisi ----------
     xpForLevel(n): n. seviyeye ulaşmak için gereken TOPLAM XP.
     Lv1 = 200 XP; her seviye bir öncekinden ~12 XP fazla ister; Lv100 = tam 80.000 XP.
     80 üst vücut (450) + 80 alt vücut (550) antrenmanı = 80.000 XP → Lv100 için en az 160 antrenman. */
  function xpForLevel(n) {
    n = clamp(Math.floor(n), 0, MAX_LEVEL);
    return 200 * n + Math.round((200 * n * (n - 1)) / 33);
  }

  function levelInfo(xp) {
    xp = Math.max(0, Math.floor(xp || 0));
    let level = 0;
    while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
    const base = xpForLevel(level);
    const next = level < MAX_LEVEL ? xpForLevel(level + 1) : base;
    return {
      xp,
      level,
      tier: tierForLevel(level),
      base,
      next,
      into: xp - base,
      need: next - base,
      progress: level < MAX_LEVEL ? (xp - base) / (next - base) : 1,
      isMax: level >= MAX_LEVEL
    };
  }

  function tierForLevel(level) {
    return clamp(Math.floor(Math.max(0, level) / TIER_EVERY), 0, MAX_TIER);
  }

  // Seans puanı: tam antrenman = gün tipinin puanı; yarım bırakılırsa yapılan set oranında
  function sessionXp(type, setsDone, setsTotal) {
    if (!setsDone || !setsTotal) return 0;
    return Math.round((XP_BY_TYPE[type] || 0) * Math.min(1, setsDone / setsTotal));
  }

  /* ---------- Geçmiş (localStorage) ----------
     Kayıt: { id, date: ISO, dayId, dayName, type: 'upper'|'lower', xp, setsDone, setsTotal,
              sets: [{ ex: 'pullup', s: 1, r: 8 }, ...] } */
  function storage() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }

  function isValidSession(s) {
    return s && typeof s === 'object' && typeof s.date === 'string' && !isNaN(Date.parse(s.date)) &&
      Array.isArray(s.sets) && s.sets.every((x) => x && typeof x.ex === 'string' && Number.isFinite(x.r));
  }

  function load() {
    const ls = storage();
    if (!ls) return [];
    try {
      const v = JSON.parse(ls.getItem(HISTORY_KEY));
      return Array.isArray(v) ? v.filter(isValidSession) : [];
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    const ls = storage();
    if (!ls) return false;
    try {
      ls.setItem(HISTORY_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function addSession(rec) {
    const list = load();
    list.push(rec);
    return save(list) ? list : null;
  }

  function totalXp(list) {
    return sum(list.map((s) => Math.max(0, s.xp || 0)));
  }

  /* ---------- Hareket istatistikleri ---------- */
  const dayKey = (t) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };

  // Her seans için o hareketin setleri (eskiden yeniye)
  function exerciseSessions(list, key) {
    const rows = [];
    list.forEach((s) => {
      const sets = s.sets.filter((x) => x.ex === key).sort((a, b) => (a.s || 0) - (b.s || 0));
      if (!sets.length) return;
      const reps = sets.map((x) => x.r);
      rows.push({
        id: s.id,
        t: Date.parse(s.date),
        date: s.date,
        dayName: s.dayName || '',
        reps,
        best: Math.max(...reps),
        total: sum(reps)
      });
    });
    return rows.sort((a, b) => a.t - b.t);
  }

  // Grafik için gün bazında birleştirilmiş noktalar (aynı gün 2 seans varsa tek nokta)
  function exerciseDaily(list, key) {
    const byDay = new Map();
    exerciseSessions(list, key).forEach((r) => {
      const k = dayKey(r.t);
      const cur = byDay.get(k);
      if (!cur) byDay.set(k, { t: r.t, best: r.best, total: r.total, reps: r.reps.slice() });
      else {
        cur.best = Math.max(cur.best, r.best);
        cur.total += r.total;
        cur.reps = cur.reps.concat(r.reps);
      }
    });
    return [...byDay.values()].sort((a, b) => a.t - b.t);
  }

  function exerciseSummary(list, key) {
    const rows = exerciseSessions(list, key);
    let best = 0;
    let bestT = null;
    rows.forEach((r) => {
      if (r.best > best) { best = r.best; bestT = r.t; }
    });
    return {
      sessions: rows.length,
      sets: sum(rows.map((r) => r.reps.length)),
      best,
      bestT,
      total: sum(rows.map((r) => r.total)),
      last: rows.length ? rows[rows.length - 1] : null
    };
  }

  function overall(list) {
    const upper = list.filter((s) => s.type === 'upper').length;
    const lower = list.filter((s) => s.type === 'lower').length;
    return {
      sessions: list.length,
      upper,
      lower,
      sets: sum(list.map((s) => s.sets.length)),
      reps: sum(list.map((s) => sum(s.sets.map((x) => x.r)))),
      xp: totalXp(list)
    };
  }

  /* ---------- Yedekleme ---------- */
  function exportData(extra) {
    return JSON.stringify(Object.assign({ app: 'athlete-quest', version: 1, exportedAt: new Date().toISOString(), history: load() }, extra || {}), null, 1);
  }

  // Yedek dosyasını doğrular; geçerliyse { history, records } döner
  function parseBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('Dosya okunamadı (geçersiz JSON).'); }
    if (!data || data.app !== 'athlete-quest' || !Array.isArray(data.history)) throw new Error('Bu bir Athlete Quest yedeği değil.');
    const history = data.history.filter(isValidSession);
    const records = data.records && typeof data.records === 'object' && !Array.isArray(data.records) ? data.records : null;
    return { history, records };
  }

  function replaceHistory(list) {
    return save(list.filter(isValidSession).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)));
  }

  root.Tracker = {
    HISTORY_KEY,
    XP_BY_TYPE,
    MAX_LEVEL,
    TIER_EVERY,
    MAX_TIER,
    xpForLevel,
    levelInfo,
    tierForLevel,
    sessionXp,
    load,
    save,
    addSession,
    totalXp,
    exerciseSessions,
    exerciseDaily,
    exerciseSummary,
    overall,
    exportData,
    parseBackup,
    replaceHistory
  };
})(typeof window !== 'undefined' ? window : globalThis);
