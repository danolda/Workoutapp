/* ================= EXERCISE FIGURES =================
   Her egzersiz için animasyonlu SVG çubuk figür (çevrimdışı çalışır, dış görsel yok).
   Pozlar açı (FK: [üst, alt] derece) ya da hedef nokta (IK: {t:[x,y], b:±1}) ile tanımlanır.
   Açılar SVG koordinatında: 0 = sağ (ileri), 90 = aşağı, -90 = yukarı.
   Figür A pozundan B pozuna yumuşak geçiş yapar; yeşil bölgeler çalışan kas grubudur. */
(function () {
  'use strict';

  const SEG = { torso: 44, neck: 21, head: 9.5, upper: 26, fore: 24, thigh: 34, shin: 33, foot: 11, footFront: 7, shW: 15, hipW: 7 };
  const FAR = [-2.5, -1.5]; // yandan görünümde arka uzuvların kayması (derinlik hissi)
  const NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_TL = [0.32, 0.18, 0.34, 0.16]; // A→B, B'de bekle, B→A, A'da bekle

  const rad = (d) => d * Math.PI / 180;
  const dir = (d) => [Math.cos(rad(d)), Math.sin(rad(d))];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const shift = (pts, o) => pts.map((p) => add(p, o));
  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);

  function mix(a, b, t) {
    if (typeof a === 'number') return a + (b - a) * t;
    if (Array.isArray(a)) return a.map((v, i) => (v === null ? null : mix(v, b[i], t)));
    if (a && typeof a === 'object') {
      const o = {};
      for (const k in a) o[k] = mix(a[k], b[k], t);
      return o;
    }
    return a;
  }

  function fk(root, a, l1, l2) {
    const j = add(root, mul(dir(a[0]), l1));
    return [root, j, add(j, mul(dir(a[1]), l2))];
  }

  function ik(root, target, l1, l2, bend) {
    const dx = target[0] - root[0];
    const dy = target[1] - root[1];
    const a = Math.atan2(dy, dx);
    const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.5), l1 + l2 - 0.01);
    const c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const ang = a + bend * Math.acos(Math.max(-1, Math.min(1, c)));
    const j = add(root, [l1 * Math.cos(ang), l1 * Math.sin(ang)]);
    return [root, j, add(root, [d * Math.cos(a), d * Math.sin(a)])];
  }

  const limb = (root, spec, l1, l2) => (Array.isArray(spec) ? fk(root, spec, l1, l2) : ik(root, spec.t, l1, l2, spec.b || 1));

  // Önden görünümde sol uzuv, sağ uzvun aynadaki görüntüsü
  function mirror(spec, cx) {
    if (Array.isArray(spec)) return spec.map((a) => 180 - a);
    return { t: [2 * cx - spec.t[0], spec.t[1]], b: -(spec.b || 1) };
  }

  function solve(p, front, far) {
    far = far || FAR;
    // anchor: vücut bir noktanın (ör. topuk) etrafında dümdüz döner; kalça o yay üzerinde kalır
    const H = p.anchor ? add(p.anchor, mul(dir(p.torso), p.anchorLen)) : p.hip;
    const td = dir(p.torso);
    const S = add(H, mul(td, SEG.torso));
    const Sh = add(S, mul(td, p.shrug || 0));
    const head = add(S, mul(dir(p.neck === undefined ? p.torso : p.neck), SEG.neck));
    const nrm = [-td[1], td[0]];
    const armSpec = p.arms || [p.arm, null];
    const legSpec = p.legs || [p.leg, null];
    const feet = p.feet || [p.foot || 0, null];
    const g = { H, S, Sh, head, td, nrm, arms: [], legs: [] };

    if (front) {
      g.sR = [add(Sh, mul(nrm, SEG.shW)), add(Sh, mul(nrm, -SEG.shW))];
      const hR = [add(H, mul(nrm, SEG.hipW)), add(H, mul(nrm, -SEG.hipW))];
      for (let i = 0; i < 2; i++) {
        g.arms.push(limb(g.sR[i], armSpec[i] || mirror(armSpec[0], H[0]), SEG.upper, SEG.fore));
        const leg = limb(hR[i], legSpec[i] || mirror(legSpec[0], H[0]), SEG.thigh, SEG.shin);
        const fa = feet[i] === null || feet[i] === undefined ? 180 - feet[0] : feet[i];
        leg.push(add(leg[2], mul(dir(fa), SEG.footFront)));
        g.legs.push(leg);
      }
    } else {
      g.sR = [Sh, add(Sh, far)];
      const near = (specs, root, l1, l2) => {
        const n = limb(root, specs[0], l1, l2);
        const f = specs[1] ? limb(add(root, far), specs[1], l1, l2) : shift(n, far);
        return [n, f];
      };
      g.arms = near(armSpec, Sh, SEG.upper, SEG.fore);
      g.legs = near(legSpec, H, SEG.thigh, SEG.shin);
      g.legs.forEach((leg, i) => {
        const fa = feet[i] === null || feet[i] === undefined ? feet[0] : feet[i];
        leg.push(add(leg[2], mul(dir(fa), SEG.foot)));
      });
    }
    return g;
  }

  /* ---------- Egzersiz tanımları ---------- */
  const STAND_LEGS = { t: [100, 154], b: -1 };
  const FRONT_BASE = { hip: [100, 88], torso: -90, leg: [88, 90], foot: 30 };

  const DEFS = {
    pullup: {
      label: 'Barfiks', vb: '0 -10 200 180', floor: false, hl: ['torso', 'upperArm'], dur: 2.8,
      eqBack: '<path class="eq" d="M112 -10V18"/>',
      eqFront: '<circle class="eq-bar" cx="112" cy="18" r="5.5"/>',
      A: { hip: [99.9, 107.6], torso: -82, neck: -86, arm: { t: [112, 18], b: 1 }, leg: [75, 160], foot: 135 },
      B: { hip: [87.9, 73], torso: -78, neck: -84 }
    },
    dip: {
      label: 'Dips', hl: ['torso', 'upperArm'], dur: 2.8,
      eqBack: '<path class="eq" d="M56 78V158M154 78V158"/>',
      eqFront: '<path class="eq-bar" d="M46 78H164"/>',
      A: { hip: [91, 72.3], torso: -70, neck: -64, arm: { t: [108, 78], b: 1 }, leg: [100, 165], foot: 130 },
      B: { hip: [98.8, 96], torso: -55, neck: -45 }
    },
    declinePushup: {
      label: 'Decline Şınav', hl: ['torso', 'upperArm'], dur: 2.6,
      eqBack: '<rect class="eq-box" x="10" y="114" width="44" height="44" rx="5"/>',
      A: { hip: [110.9, 104.2], torso: 3.6, neck: 2, arm: { t: [146, 154], b: 1 }, leg: { t: [44, 100], b: 1 }, foot: 100 },
      B: { hip: [107.4, 121.7], torso: 18.9, neck: 14 }
    },
    curl: {
      label: 'Biceps Curl', hl: ['upperArm'], db: true,
      A: { hip: [98, 88], torso: -88, arm: [88, 86], leg: STAND_LEGS },
      B: { arm: [80, -62] }
    },
    tricepsOverhead: {
      label: 'Triceps Overhead Extension', vb: '0 -14 200 184', hl: ['upperArm'], db: 'near',
      A: { hip: [98, 88], torso: -88, arm: [-100, -235], leg: STAND_LEGS },
      B: { arm: [-95, -88] }
    },
    lateralRaise: {
      label: 'Lateral Raise', front: true, hl: ['shoulder'], db: true,
      A: Object.assign({}, FRONT_BASE, { arm: [80, 84] }),
      B: { arm: [-3, 5] }
    },
    shrug: {
      label: 'Shrug', front: true, hl: ['trap'], db: true, tl: [0.28, 0.27, 0.3, 0.15],
      A: Object.assign({}, FRONT_BASE, { arm: [84, 87], shrug: 0 }),
      B: { shrug: 8 }
    },
    neck: {
      label: 'Boyun Egzersizi', hl: ['neck'], plate: true, tl: [0.34, 0.2, 0.3, 0.16],
      A: { hip: [86, 92], torso: -38, neck: 30, arm: { t: [110, 110], b: 1 }, leg: { t: [100, 154], b: -1 } },
      B: { neck: -62 }
    },
    splitSquat: {
      label: 'Split Squat', hl: ['thigh'], db: true,
      A: { hip: [93, 99], torso: -88, arm: [90, 90], legs: [{ t: [130, 154], b: -1 }, { t: [54.2, 146.2], b: -1 }], feet: [0, 45] },
      B: { hip: [90, 121] }
    },
    rdl: {
      label: 'Dumbbell RDL', hl: ['thigh'], db: true, tl: [0.36, 0.16, 0.32, 0.16], dur: 3,
      A: { hip: [100, 88], torso: -88, neck: -88, arm: [90, 90], leg: { t: [104, 154], b: -1 } },
      B: { hip: [78, 96], torso: -14, neck: -24 }
    },
    squat: {
      label: 'Squat', hl: ['thigh'], dur: 2.8,
      A: { hip: [103, 88], torso: -88, neck: -88, arm: [78, 72], leg: { t: [106, 154], b: -1 } },
      B: { hip: [78, 122], torso: -58, neck: -72, arm: [-4, -2] }
    },
    calfRaise: {
      label: 'Calf Raise', hl: ['shin'], tl: [0.28, 0.22, 0.34, 0.16], dur: 2.4,
      eqBack: '<rect class="eq-box" x="151" y="8" width="12" height="150" rx="3"/>',
      A: { hip: [100, 88], torso: -84, neck: -86, arm: { t: [147, 64], b: 1 }, legs: [{ t: [103, 154], b: -1 }, [100, 162]], feet: [0, 110] },
      B: { hip: [103.2, 79.5], legs: [{ t: [107.2, 145.3], b: -1 }, [100, 162]], feet: [52, 110] }
    },
    // Çift dips barında inverted row: iki paralel barın arasında sırtüstü, her el bir barda (nötr tutuş),
    // topuklar yerde, gövde dümdüz; göğüs barların arasına çekilir. Arka bar/uzuvlar hafif yukarıda (3/4 görünüm).
    invertedRow: {
      label: 'Inverted Row (Çift Dips Barı)', hl: ['torso', 'upperArm'], dur: 2.8, far: [-3, -6],
      eqBack: '<path class="eq eq-far" d="M55 72V152M177 72V152"/><path class="eq-bar eq-bar-far" d="M47 72H183"/><path class="eq" d="M58 78V158M180 78V158"/>',
      eqFront: '<path class="eq-bar" d="M50 78H186"/>',
      A: { anchor: [41.3, 152], anchorLen: 67, torso: -20.9, neck: -20.9, arm: { t: [110, 78], b: -1 }, leg: { t: [41.3, 152], b: 1 }, foot: -111 },
      B: { torso: -47.1, neck: -44, foot: -137 }
    }
  };

  // B pozu, A'da verilmeyen alanları A'dan devralır
  Object.values(DEFS).forEach((d) => { d.B = Object.assign({}, d.A, d.B); });

  /* ---------- SVG çizimi ---------- */
  const f1 = (n) => Math.round(n * 10) / 10;
  const P = (pts) => 'M' + pts.map((q) => f1(q[0]) + ' ' + f1(q[1])).join('L');

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function Figure(id, opts) {
    const def = DEFS[id] || DEFS.squat;
    const hl = new Set(def.hl || []);
    const cls = (part, far) => `fg ${far ? 'fg-far' : 'fg-near'}${hl.has(part) ? ' fg-hl' : ''}`;
    this.def = def;
    this.svg = el('svg', { viewBox: def.vb || '0 0 200 170', class: 'ex-fig', role: 'img', 'aria-label': def.label + ' hareket animasyonu' });
    const svg = this.svg;
    if (def.floor !== false) el('path', { class: 'eq-floor', d: 'M6 158.5H194' }, svg);
    if (def.eqBack) el('g', {}, svg).innerHTML = def.eqBack;

    const p = (part, far) => el('path', { class: cls(part, far) }, svg);
    const db = (far) => el('circle', { class: far ? 'db db-far' : 'db', r: 6.2 }, svg);
    const wantDb = (i) => def.db === true || (def.db === 'near' && i === 0);
    const isFar = (i) => !def.front && i === 1; // önden görünümde iki taraf da aynı renk

    // Çizim sırası: arka uzuvlar → gövde/baş → ön uzuvlar
    this.parts = { arm: [], leg: [], db: [] };
    const addLeg = (i) => { this.parts.leg[i] = [p('thigh', isFar(i)), p('shin', isFar(i))]; };
    const addArm = (i) => {
      this.parts.arm[i] = [p('upperArm', isFar(i)), p('foreArm', isFar(i))];
      this.parts.db[i] = wantDb(i) ? db(isFar(i)) : null;
    };
    if (def.front) { addLeg(0); addLeg(1); } else { addLeg(1); addArm(1); }
    this.torso = el('path', { class: (def.front ? 'fg-torso-front ' : 'fg-torso ') + cls('torso', false) }, svg);
    this.neck = el('path', { class: 'fg-neck ' + cls('neck', false) }, svg);
    this.head = el('circle', { class: 'fg-head' + (hl.has('neck') ? ' fg-head-hl' : ''), r: SEG.head }, svg);
    if (def.front) { addArm(0); addArm(1); } else { addLeg(0); addArm(0); }
    if (hl.has('trap')) this.trap = el('path', { class: 'fg-trap' }, svg);
    if (hl.has('shoulder')) this.delts = [el('circle', { class: 'fg-delt', r: 5.2 }, svg), el('circle', { class: 'fg-delt', r: 5.2 }, svg)];
    if (def.plate) {
      this.chain = el('path', { class: 'eq-chain' }, svg);
      this.plate = el('circle', { class: 'eq-plate', r: 10 }, svg);
    }
    if (def.eqFront) el('g', {}, svg).innerHTML = def.eqFront;

    this.t0 = 0;
    this.update(opts && opts.t !== undefined ? opts.t : 1);
  }

  Figure.prototype.update = function (t) {
    const def = this.def;
    const g = solve(mix(def.A, def.B, t), def.front, def.far);
    for (let i = 0; i < 2; i++) {
      const arm = g.arms[i];
      const leg = g.legs[i];
      if (this.parts.arm[i]) {
        this.parts.arm[i][0].setAttribute('d', P([arm[0], arm[1]]));
        this.parts.arm[i][1].setAttribute('d', P([arm[1], arm[2]]));
        const d = this.parts.db[i];
        if (d) { d.setAttribute('cx', f1(arm[2][0])); d.setAttribute('cy', f1(arm[2][1])); }
      }
      this.parts.leg[i][0].setAttribute('d', P([leg[0], leg[1]]));
      this.parts.leg[i][1].setAttribute('d', P([leg[1], leg[2], leg[3]]));
    }
    if (def.front) {
      const n = g.nrm;
      this.torso.setAttribute('d', P([add(g.Sh, mul(n, 11)), add(g.Sh, mul(n, -11)), add(g.H, mul(n, -9)), add(g.H, mul(n, 9))]) + 'Z');
    } else {
      this.torso.setAttribute('d', P([g.H, g.S]));
    }
    this.neck.setAttribute('d', P([g.S, g.head]));
    this.head.setAttribute('cx', f1(g.head[0]));
    this.head.setAttribute('cy', f1(g.head[1]));
    if (this.trap) this.trap.setAttribute('d', P([g.sR[1], add(g.S, mul(g.td, 10)), g.sR[0]]));
    if (this.delts) this.delts.forEach((c, i) => { c.setAttribute('cx', f1(g.sR[i][0])); c.setAttribute('cy', f1(g.sR[i][1])); });
    if (this.plate) {
      const top = add(g.head, [1.5, 8]);
      const plate = add(g.head, [2, 36]);
      this.chain.setAttribute('d', P([top, add(plate, [0, -10])]));
      this.plate.setAttribute('cx', f1(plate[0]));
      this.plate.setAttribute('cy', f1(plate[1]));
    }
  };

  /* ---------- Animasyon döngüsü ---------- */
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const running = new Set();
  let raf = 0;

  function phaseToT(ph, tl) {
    const [a, b, c] = tl;
    if (ph < a) return ease(ph / a);
    if (ph < a + b) return 1;
    if (ph < a + b + c) return 1 - ease((ph - a - b) / c);
    return 0;
  }

  function loop(now) {
    running.forEach((f) => {
      const dur = (f.def.dur || 2.6) * 1000;
      f.update(phaseToT(((now - f.t0) % dur) / dur, f.def.tl || DEFAULT_TL));
    });
    raf = running.size ? requestAnimationFrame(loop) : 0;
  }

  Figure.prototype.play = function () {
    if (reduceMotion || running.has(this)) return this;
    this.t0 = performance.now();
    running.add(this);
    if (!raf) raf = requestAnimationFrame(loop);
    return this;
  };

  Figure.prototype.stop = function () {
    running.delete(this);
    return this;
  };

  window.ExerciseFigures = {
    ids: Object.keys(DEFS),
    label: (id) => (DEFS[id] ? DEFS[id].label : ''),
    create: (id, opts) => new Figure(id, opts)
  };
})();
