/* ================= CHARTS =================
   Bağımlılıksız SVG eğri (monoton kübik) çizgi grafik.
   - Tarih ekseni gerçek zamana göre ölçeklenir (aralar boşluk olarak görünür)
   - Dokun/sürükle: dikey imleç + ipucu; ok tuşlarıyla da gezilebilir
   - Uç nokta ve rekor noktası etiketlenir, diğer değerler ipucunda / tabloda */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const DAY_MS = 86400000;

  const fmtDate = (t) => {
    const d = new Date(t);
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  };
  const fmtDateLong = (t) => {
    const d = new Date(t);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Okunur tam sayı eksen adımları: 1, 2, 5, 10, 20, 50 ... (tekrar sayıları tam sayıdır)
  function niceStep(raw) {
    if (raw <= 1) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / pow;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return Math.max(1, m * pow);
  }

  // Fritsch–Carlson monoton kübik eğri: tepe noktalarını aşmaz (yanlış değer göstermez)
  function monotonePath(p) {
    const n = p.length;
    if (n < 2) return '';
    if (n === 2) return `M${p[0].x},${p[0].y}L${p[1].x},${p[1].y}`;
    const dx = [];
    const m = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = p[i + 1].x - p[i].x;
      m[i] = dx[i] ? (p[i + 1].y - p[i].y) / dx[i] : 0;
    }
    const t = [m[0]];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    t[n - 1] = m[n - 2];
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i];
      const b = t[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) {
        const k = 3 / Math.sqrt(s);
        t[i] = k * a * m[i];
        t[i + 1] = k * b * m[i];
      }
    }
    let d = `M${p[0].x},${p[0].y}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += `C${(p[i].x + h).toFixed(1)},${(p[i].y + h * t[i]).toFixed(1)} ${(p[i + 1].x - h).toFixed(1)},${(p[i + 1].y - h * t[i + 1]).toFixed(1)} ${p[i + 1].x},${p[i + 1].y}`;
    }
    return d;
  }

  /**
   * line(container, points, opts)
   *  points: [{ t: ms, v: number, detail?: string }] (eskiden yeniye)
   *  opts: { unit: 'tekrar', height: 210, label: 'Set başı max' }
   */
  function line(container, points, opts) {
    opts = opts || {};
    container.innerHTML = '';
    container.classList.add('chart');
    const unit = opts.unit || '';
    const W = Math.max(260, Math.round(container.clientWidth || 320));
    const H = opts.height || 210;
    const M = { l: 34, r: 16, t: 22, b: 28 };
    const iw = W - M.l - M.r;
    const ih = H - M.t - M.b;

    if (!points.length) {
      const empty = document.createElement('div');
      empty.className = 'chart-empty';
      empty.textContent = opts.emptyText || 'Henüz kayıt yok.';
      container.appendChild(empty);
      return;
    }

    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const span = t1 - t0;
    const xOf = (t) => (span ? M.l + ((t - t0) / span) * iw : M.l + iw / 2);

    points = points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
    if (!points.length) return;
    const vmax = Math.max(...points.map((p) => p.v), 1);
    const step = niceStep(vmax / 4);
    const yMax = Math.ceil((vmax * 1.08) / step) * step || step;
    const yOf = (v) => M.t + ih - (v / yMax) * ih;

    const pts = points.map((p) => ({ x: +xOf(p.t).toFixed(1), y: +yOf(p.v).toFixed(1), p }));

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart-svg', role: 'img', tabindex: '0', 'aria-label': `${opts.label || 'Grafik'}: ${points.length} kayıt, son değer ${points[points.length - 1].v} ${unit}` });
    const defs = el('defs', {}, svg);
    const gid = 'cg' + Math.random().toString(36).slice(2, 8);
    const grad = el('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    el('stop', { offset: '0', style: 'stop-color: var(--chart-series); stop-opacity: 0.16' }, grad);
    el('stop', { offset: '1', style: 'stop-color: var(--chart-series); stop-opacity: 0' }, grad);

    // Izgara + y ekseni (soluk, tek eksen)
    for (let v = 0; v <= yMax + 1e-9; v += step) {
      const y = yOf(v).toFixed(1);
      el('line', { x1: M.l, x2: W - M.r, y1: y, y2: y, class: v === 0 ? 'chart-base' : 'chart-grid' }, svg);
      const tx = el('text', { x: M.l - 8, y: +y + 4, class: 'chart-tick', 'text-anchor': 'end' }, svg);
      tx.textContent = Number.isInteger(v) ? v : v.toFixed(1);
    }

    // X ekseni tarihleri (çakışmayan en fazla 4 etiket)
    const tickTimes = [];
    if (points.length <= 4 || !span) points.forEach((p) => tickTimes.push(p.t));
    else for (let i = 0; i < 4; i++) tickTimes.push(t0 + (span * i) / 3);
    let lastX = -Infinity;
    const seen = new Set();
    tickTimes.forEach((t, i) => {
      const x = xOf(t);
      const label = span > 300 * DAY_MS ? `${MONTHS[new Date(t).getMonth()]} ${String(new Date(t).getFullYear()).slice(2)}` : fmtDate(t);
      if (seen.has(label) || x - lastX < 46) return;
      seen.add(label);
      lastX = x;
      const anchor = tickTimes.length > 1 && i === 0 && span ? 'start' : tickTimes.length > 1 && i === tickTimes.length - 1 && span ? 'end' : 'middle';
      const tx = el('text', { x: x.toFixed(1), y: H - 8, class: 'chart-tick', 'text-anchor': anchor }, svg);
      tx.textContent = label;
    });

    // Alan + eğri
    const path = monotonePath(pts);
    if (path) {
      const last = pts[pts.length - 1];
      el('path', { d: `${path}L${last.x},${M.t + ih}L${pts[0].x},${M.t + ih}Z`, fill: `url(#${gid})` }, svg);
      el('path', { d: path, class: 'chart-line' }, svg);
    }

    // İşaretler: sık veride sadece son + rekor noktası
    const dense = pts.length > iw / 14;
    let bestIdx = 0; // en yüksek değere İLK ulaşılan nokta (tablodaki ★ ile aynı)
    pts.forEach((q, i) => { if (q.p.v > pts[bestIdx].p.v) bestIdx = i; });
    const lastIdx = pts.length - 1;
    pts.forEach((q, i) => {
      if (dense && i !== lastIdx && i !== bestIdx) return;
      el('circle', { cx: q.x, cy: q.y, r: i === lastIdx ? 5 : 4, class: 'chart-dot' }, svg);
    });

    // Seçici etiketler: son değer + (farklıysa) rekor
    const label = (q, text, above) => {
      const x = Math.min(Math.max(q.x, M.l + 14), W - M.r - 14);
      const t = el('text', { x: x.toFixed(1), y: (above ? q.y - 10 : q.y + 18).toFixed(1), class: 'chart-label', 'text-anchor': 'middle' }, svg);
      t.textContent = text;
    };
    const showBest = bestIdx !== lastIdx && pts[bestIdx].p.v > pts[lastIdx].p.v;
    // ★ sadece tüm zamanların rekoru bu aralıktaysa; aksi halde aralığın en yükseği yıldızsız yazılır
    const star = opts.record === undefined || pts[bestIdx].p.v === opts.record ? '★ ' : '';
    // Rekor etiketi son noktaya yakınsa son değer noktanın altına yazılır (üst üste binmesin)
    const crowded = showBest && Math.abs(pts[bestIdx].x - pts[lastIdx].x) < 40;
    label(pts[lastIdx], `${pts[lastIdx].p.v}`, !crowded || pts[lastIdx].y + 22 > M.t + ih);
    if (showBest) label(pts[bestIdx], `${star}${pts[bestIdx].p.v}`, true);

    // Etkileşim katmanı: imleç + vurgulu nokta
    const cross = el('line', { x1: 0, x2: 0, y1: M.t, y2: M.t + ih, class: 'chart-cross', visibility: 'hidden' }, svg);
    const focus = el('circle', { r: 6, class: 'chart-dot chart-focus', visibility: 'hidden' }, svg);
    const hit = el('rect', { x: M.l - 10, y: 0, width: iw + 20, height: H, fill: 'transparent' }, svg);

    container.appendChild(svg);
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    const tipVal = document.createElement('strong');
    const tipDate = document.createElement('span');
    const tipDetail = document.createElement('span');
    tip.append(tipVal, tipDate, tipDetail);
    container.appendChild(tip);

    let active = -1;
    function show(i) {
      active = Math.max(0, Math.min(pts.length - 1, i));
      const q = pts[active];
      cross.setAttribute('x1', q.x);
      cross.setAttribute('x2', q.x);
      focus.setAttribute('cx', q.x);
      focus.setAttribute('cy', q.y);
      cross.setAttribute('visibility', 'visible');
      focus.setAttribute('visibility', 'visible');
      tipVal.textContent = `${q.p.v} ${unit}`;
      tipDate.textContent = fmtDateLong(q.p.t);
      tipDetail.textContent = q.p.detail || '';
      tipDetail.hidden = !q.p.detail;
      tip.hidden = false;
      const scale = (svg.getBoundingClientRect().width || W) / W;
      const tw = tip.offsetWidth;
      const cw = container.clientWidth;
      let left = q.x * scale - tw / 2;
      left = Math.max(0, Math.min(cw - tw, left));
      tip.style.left = `${left}px`;
      // Üstte yer yoksa ipucu noktanın altına iner (noktayı ve etiketi kapatmasın)
      let top = q.y * scale - tip.offsetHeight - 14;
      if (top < 0) top = q.y * scale + 14;
      tip.style.top = `${top}px`;
    }
    function hide() {
      active = -1;
      cross.setAttribute('visibility', 'hidden');
      focus.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    }
    function nearest(clientX) {
      const r = svg.getBoundingClientRect();
      const x = ((clientX - r.left) / (r.width || W)) * W;
      let best = 0;
      pts.forEach((q, i) => { if (Math.abs(q.x - x) < Math.abs(pts[best].x - x)) best = i; });
      return best;
    }
    hit.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
    hit.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    hit.addEventListener('pointercancel', hide);
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        show(active < 0 ? lastIdx : active + (e.key === 'ArrowRight' ? 1 : -1));
      } else if (e.key === 'Escape') hide();
    });
  }

  window.Charts = { line, fmtDate, fmtDateLong };
})();
