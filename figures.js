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
    // legK: üstten görünümde (sırtüstü yatış) öne doğru uzanan bacağın kısalmış izdüşümü
    const lk = p.legK || [1, 1];
    const TH = SEG.thigh * lk[0];
    const SH = SEG.shin * lk[1];
    const g = { H, S, Sh, head, td, nrm, curl: p.curl || 0, belly: p.belly || 0, arms: [], legs: [] };

    if (front) {
      g.sR = [add(Sh, mul(nrm, SEG.shW)), add(Sh, mul(nrm, -SEG.shW))];
      const hR = [add(H, mul(nrm, SEG.hipW)), add(H, mul(nrm, -SEG.hipW))];
      for (let i = 0; i < 2; i++) {
        g.arms.push(limb(g.sR[i], armSpec[i] || mirror(armSpec[0], H[0]), SEG.upper, SEG.fore));
        const leg = limb(hR[i], legSpec[i] || mirror(legSpec[0], H[0]), TH, SH);
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
      g.legs = near(legSpec, H, TH, SH);
      g.legs.forEach((leg, i) => {
        const fa = feet[i] === null || feet[i] === undefined ? feet[0] : feet[i];
        leg.push(add(leg[2], mul(dir(fa), SEG.foot)));
      });
    }
    return g;
  }

  // Yandan görünümde gövde: kalçadan omuza ikinci derece eğri (curl = omurga kavisi, px).
  // curl 0 ise düz çizgi. Karın bölgesi (abs) bu eğrinin ön yüzünü izler.
  function torsoCurve(g) {
    const c = add(mul(add(g.H, g.S), 0.5), mul(g.nrm, g.curl));
    const at = (t) => {
      const u = 1 - t;
      return [u * u * g.H[0] + 2 * u * t * c[0] + t * t * g.S[0], u * u * g.H[1] + 2 * u * t * c[1] + t * t * g.S[1]];
    };
    const normalAt = (t) => {
      const d = add(mul(add(c, mul(g.H, -1)), 2 * (1 - t)), mul(add(g.S, mul(c, -1)), 2 * t));
      const len = Math.hypot(d[0], d[1]) || 1;
      return [-d[1] / len, d[0] / len];
    };
    return { at, normalAt };
  }

  /* ---------- Egzersiz tanımları ---------- */
  const STAND_LEGS = { t: [100, 154], b: -1 };
  const FRONT_BASE = { hip: [100, 88], torso: -90, leg: [88, 90], foot: 30 };

  const DEFS = {
    pullup: {
      label: 'Barfiks', vb: '0 -10 200 180', floor: false, hl: ['back', 'biceps'], dur: 2.8,
      eqBack: '<path class="eq" d="M112 -10V18"/>',
      eqFront: '<circle class="eq-bar" cx="112" cy="18" r="5.5"/>',
      A: { hip: [99.9, 107.6], torso: -82, neck: -86, arm: { t: [112, 18], b: 1 }, leg: [75, 160], foot: 135 },
      B: { hip: [87.9, 73], torso: -78, neck: -84 }
    },
    dip: {
      label: 'Dips', hl: ['chest', 'triceps'], dur: 2.8,
      eqBack: '<path class="eq" d="M56 78V158M154 78V158"/>',
      eqFront: '<path class="eq-bar" d="M46 78H164"/>',
      A: { hip: [91, 72.3], torso: -70, neck: -64, arm: { t: [108, 78], b: 1 }, leg: [100, 165], foot: 130 },
      B: { hip: [98.8, 96], torso: -55, neck: -45 }
    },
    declinePushup: {
      label: 'Decline Şınav', hl: ['chest', 'triceps'], dur: 2.6,
      eqBack: '<rect class="eq-box" x="10" y="114" width="44" height="44" rx="5"/>',
      A: { hip: [110.9, 104.2], torso: 3.6, neck: 2, arm: { t: [146, 154], b: 1 }, leg: { t: [44, 100], b: 1 }, foot: 100 },
      B: { hip: [107.4, 121.7], torso: 18.9, neck: 14 }
    },
    curl: {
      label: 'Biceps Curl', hl: ['biceps'], db: true,
      A: { hip: [98, 88], torso: -88, arm: [88, 86], leg: STAND_LEGS },
      B: { arm: [80, -62] }
    },
    tricepsOverhead: {
      label: 'Triceps Overhead Extension', vb: '0 -14 200 184', hl: ['triceps'], db: 'near',
      A: { hip: [98, 88], torso: -88, arm: [-100, -235], leg: STAND_LEGS },
      B: { arm: [-95, -88] }
    },
    lateralRaise: {
      label: 'Lateral Raise', front: true, hl: ['delts'], db: true,
      A: Object.assign({}, FRONT_BASE, { arm: [80, 84] }),
      B: { arm: [-3, 5] }
    },
    shrug: {
      label: 'Shrug', front: true, hl: ['traps'], db: true, tl: [0.28, 0.27, 0.3, 0.15],
      A: Object.assign({}, FRONT_BASE, { arm: [84, 87], shrug: 0 }),
      B: { shrug: 8 }
    },
    neck: {
      label: 'Boyun Egzersizi', hl: ['neck'], plate: true, tl: [0.34, 0.2, 0.3, 0.16],
      A: { hip: [86, 92], torso: -38, neck: 30, arm: { t: [110, 110], b: 1 }, leg: { t: [100, 154], b: -1 } },
      B: { neck: -62 }
    },
    splitSquat: {
      label: 'Split Squat', hl: ['quads', 'glutes'], db: true,
      A: { hip: [93, 99], torso: -88, arm: [90, 90], legs: [{ t: [130, 154], b: -1 }, { t: [54.2, 146.2], b: -1 }], feet: [0, 45] },
      B: { hip: [90, 121] }
    },
    rdl: {
      label: 'Dumbbell RDL', hl: ['hams', 'glutes'], db: true, tl: [0.36, 0.16, 0.32, 0.16], dur: 3,
      A: { hip: [100, 88], torso: -88, neck: -88, arm: [90, 90], leg: { t: [104, 154], b: -1 } },
      B: { hip: [78, 96], torso: -14, neck: -24 }
    },
    squat: {
      label: 'Squat', hl: ['quads', 'glutes'], dur: 2.8,
      A: { hip: [103, 88], torso: -88, neck: -88, arm: [78, 72], leg: { t: [106, 154], b: -1 } },
      B: { hip: [78, 122], torso: -58, neck: -72, arm: [-4, -2] }
    },
    calfRaise: {
      label: 'Calf Raise', hl: ['calves0'], tl: [0.28, 0.22, 0.34, 0.16], dur: 2.4,
      eqBack: '<rect class="eq-box" x="151" y="8" width="12" height="150" rx="3"/>',
      A: { hip: [100, 88], torso: -84, neck: -86, arm: { t: [147, 64], b: 1 }, legs: [{ t: [103, 154], b: -1 }, [100, 162]], feet: [0, 110] },
      B: { hip: [103.2, 79.5], legs: [{ t: [107.2, 145.3], b: -1 }, [100, 162]], feet: [52, 110] }
    },
    // Çift dips barında inverted row: iki paralel barın arasında sırtüstü, her el bir barda (nötr tutuş),
    // topuklar yerde, gövde dümdüz; göğüs barların arasına çekilir. Arka bar/uzuvlar hafif yukarıda (3/4 görünüm).
    invertedRow: {
      label: 'Inverted Row (Çift Dips Barı)', hl: ['back', 'biceps'], dur: 2.8, far: [-3, -6],
      eqBack: '<path class="eq eq-far" d="M55 72V152M177 72V152"/><path class="eq-bar eq-bar-far" d="M47 72H183"/><path class="eq" d="M58 78V158M180 78V158"/>',
      eqFront: '<path class="eq-bar" d="M50 78H186"/>',
      A: { anchor: [41.3, 152], anchorLen: 67, torso: -20.9, neck: -20.9, arm: { t: [110, 78], b: -1 }, leg: { t: [41.3, 152], b: 1 }, foot: -111 },
      B: { torso: -47.1, neck: -44, foot: -137 }
    },

    /* ---------- Karın / core ----------
       hold: izometrik tutuş (pozda uzun bekler, çalışan bölge nabız gibi yanıp söner).
       abs: gövdenin ön yüzündeki karın şeridi; belly > 0 dışarıda, < 0 içe çekilmiş karın. */
    stomachVacuum: {
      label: 'Mide Vakumu', hl: ['abs'], hold: true, dur: 4.4, tl: [0.24, 0.48, 0.18, 0.1],
      A: { hip: [98, 90], torso: -87, neck: -88, arm: { t: [102, 86], b: 1 }, leg: { t: [101, 154], b: -1 }, belly: 5.5 },
      B: { torso: -89, neck: -86, belly: -3.4 }
    },
    psoasStretch: {
      label: 'Diz Çökerek Psoas Esnetme', hl: ['quads0', 'abs'], hold: true, dur: 4.4, tl: [0.26, 0.48, 0.18, 0.08],
      A: { hip: [92, 121], torso: -89, neck: -89, arm: { t: [96, 116], b: 1 }, legs: [[104, 180], { t: [127, 151], b: -1 }], feet: [180, 8] },
      B: { hip: [99, 123], torso: -94, neck: -92, legs: [[110, 180], { t: [127, 151], b: -1 }] }
    },
    weightedCrunch: {
      label: 'Ağırlıklı Mekik', hl: ['abs'], handPlate: true, dur: 4, tl: [0.22, 0.22, 0.44, 0.12],
      A: { hip: [116, 151], torso: 180, neck: 182, curl: 0, arm: [-90, -90], leg: { t: [146, 152], b: -1 }, foot: 0 },
      B: { torso: 206, neck: 222, curl: -5 }
    },
    reverseCrunch: {
      label: 'Ters Mekik', hl: ['abs'], dur: 3.8, tl: [0.28, 0.12, 0.44, 0.16],
      A: { hip: [120, 151], torso: 180, neck: 182, curl: 0, arm: [2, 0], leg: [-90, 0], foot: 10 },
      B: { hip: [117, 135], torso: 158, neck: 184, curl: -4, leg: [-148, -62], foot: -40 }
    },
    activePlank: {
      label: 'Aktif Plank', hl: ['abs'], hold: true, dur: 4.4, tl: [0.22, 0.56, 0.14, 0.08],
      A: { hip: [98.4, 136.6], torso: -11, neck: -12, arm: [90, 0], leg: [174, 174], foot: 84 },
      B: { hip: [98.4, 134.1], torso: -8, neck: -10, leg: [172, 172], foot: 82 }
    },
    sidePlank: {
      label: 'Side Plank', front: true, hl: ['abs'], hold: true, dur: 4.4, tl: [0.22, 0.56, 0.14, 0.08],
      A: { hip: [94, 130], torso: -22, neck: -19, arms: [[90, 0], { t: [97, 115], b: 1 }], legs: [[171, 171], [166, 166]], feet: [100, 100] },
      B: { hip: [93.3, 124], torso: -14, neck: -14, arms: [[90, 0], { t: [95, 110], b: 1 }], legs: [[166, 166], [161, 161]] }
    },
    cobraStretch: {
      label: 'Cobra Stretch', hl: ['abs'], hold: true, dur: 4.4, tl: [0.26, 0.48, 0.18, 0.08],
      A: { hip: [88, 151], torso: -4, neck: -8, curl: 0, arm: { t: [130, 154], b: 1 }, leg: [178, 178], foot: 180 },
      B: { torso: -48, neck: -66, curl: 7, arm: { t: [136, 154], b: 1 } }
    },
    lumbarTwist: {
      label: 'Spine Lumbar Twist', front: true, floor: false, hl: ['abs'], hold: true, dur: 4.6, tl: [0.28, 0.46, 0.18, 0.08],
      eqBack: '<rect class="eq-mat" x="24" y="10" width="152" height="150" rx="12"/>',
      A: { hip: [100, 100], torso: -90, neck: -90, arm: [6, 3], legs: [[92, 96], [88, 84]], legK: [0.5, 0.32], feet: [90, 90] },
      B: { legs: [[-8, 92], [8, 96]], legK: [1, 1], feet: [92, 96] }
    }
  };

  // B pozu, A'da verilmeyen alanları A'dan devralır
  Object.values(DEFS).forEach((d) => { d.B = Object.assign({}, d.A, d.B); });

  /* ---------- SVG çizimi ----------
     Gövde ve uzuvlar dolgulu, kas hatlı şekillerdir (üstten ışık alan gradyan + ince kontur).
     Çalışan kaslar (def.hl) ilgili uzvun / gövdenin doğru yüzünde yeşil parlar:
       gövde: chest, back, abs, glutes · bacak: quads, hams, calves · kol: biceps, triceps
       önden: delts, traps · neck. Sonuna 0 / 1 eklenirse sadece yakın / uzak uzuv (ör. 'quads0'). */
  const f1 = (n) => Math.round(n * 10) / 10;
  const pt = (q) => f1(q[0]) + ' ' + f1(q[1]);
  const P = (pts) => 'M' + pts.map(pt).join('L');
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const unit = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
  const perp = (d) => [-d[1], d[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const sgn = (v) => (v < 0 ? -1 : 1);
  let uid = 0;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Kapalı yumuşak kontur: noktalardan geçen Catmull-Rom eğrisi (kübik Bézier olarak)
  function smooth(pts) {
    const n = pts.length;
    let d = 'M' + pt(pts[0]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      d += 'C' + pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + ' ' +
        pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + ' ' + pt(p2);
    }
    return d + 'Z';
  }

  /* Uzuv: a → b, kalınlık ra → rb. Kas şişkinliği iki yüzde ayrı: bA (+n yüzü), bB (−n yüzü),
     şişkinliğin tepe noktası pk (0..1). */
  function limb2(a, b, ra, rb, bA, bB, pk) {
    const d = unit(sub(b, a));
    const n = perp(d);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ex = Math.log(0.5) / Math.log(pk || 0.5);
    const w = (t, side) => ra + (rb - ra) * t + (side > 0 ? bA : bB) * Math.sin(Math.PI * Math.pow(Math.max(0, Math.min(1, t)), ex));
    const at = (t, side, k) => add(add(a, mul(d, L * t)), mul(n, side * w(t, side) * (k === undefined ? 1 : k)));
    return { a, b, d, n, ra, rb, at };
  }

  const LT = [0, 0.2, 0.4, 0.6, 0.8, 1];
  function limbOutline(g) {
    const pts = LT.map((t) => g.at(t, 1));
    const cap = (c, r, dd, s) => [add(c, add(mul(dd, 0.72 * r), mul(g.n, 0.66 * r * s))), add(c, mul(dd, r)), add(c, add(mul(dd, 0.72 * r), mul(g.n, -0.66 * r * s)))];
    pts.push(...cap(g.b, g.rb, g.d, 1));
    for (let i = LT.length - 1; i >= 0; i--) pts.push(g.at(LT[i], -1));
    pts.push(...cap(g.a, g.ra, mul(g.d, -1), -1));
    return smooth(pts);
  }

  // Kas bandı: uzvun bir yüzünde t0..t1 arası (side ±1), ya da önden görünümde ortada (side 0)
  function limbMuscle(g, side, t0, t1) {
    const outer = [];
    const inner = [];
    for (let i = 0; i <= 5; i++) {
      const t = t0 + ((t1 - t0) * i) / 5;
      if (side) {
        outer.push(g.at(t, side, 0.96));
        inner.push(g.at(t, side, 0.18));
      } else {
        outer.push(g.at(t, 1, 0.62));
        inner.push(g.at(t, -1, 0.62));
      }
    }
    return smooth(outer.concat(inner.reverse()));
  }

  /* Yandan gövde profili (t: 0 = kalça, 1 = omuz): ön yüz (göğüs / karın) ve sırt (kalça kası / sırt kası) kalınlığı */
  const FRONT = [[-0.12, 3.5], [0, 7.2], [0.25, 7.8], [0.5, 8.3], [0.72, 10.4], [0.9, 9.6], [1, 6.5]];
  const BACK = [[-0.12, 8], [0.03, 10], [0.2, 8.6], [0.42, 7.3], [0.7, 9.5], [0.9, 9.1], [1, 6.5]];
  function keyed(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, v0] = keys[i - 1];
        const [t1, v1] = keys[i];
        return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
      }
    }
    return keys[keys.length - 1][1];
  }

  function torso2(g) {
    const tc = torsoCurve(g);
    const front = (t) => keyed(FRONT, t) + (t > 0.1 && t < 0.62 ? g.belly * Math.sin((Math.PI * (t - 0.1)) / 0.52) : 0);
    const at = (t, side, k) => add(tc.at(t), mul(tc.normalAt(t), side * (side > 0 ? front(t) : keyed(BACK, t)) * (k === undefined ? 1 : k)));
    return { tc, at };
  }

  const TT = [-0.12, 0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.74, 0.86, 1];
  function torsoOutline(T, g) {
    const pts = TT.map((t) => T.at(t, 1));
    pts.push(add(g.S, mul(g.td, 4)));
    for (let i = TT.length - 1; i >= 0; i--) pts.push(T.at(TT[i], -1));
    pts.push(T.tc.at(-0.2));
    return smooth(pts);
  }

  // [yüz (+1 ön / −1 sırt), t0, t1, iç sınır]
  const TORSO_MUS = { abs: [1, 0.1, 0.6, 0.3], chest: [1, 0.6, 0.95, 0.28], back: [-1, 0.42, 0.95, 0.3], glutes: [-1, -0.12, 0.2, 0.22] };
  function torsoMuscle(T, spec) {
    const [side, t0, t1, k] = spec;
    const outer = [];
    const inner = [];
    for (let i = 0; i <= 6; i++) {
      const t = t0 + ((t1 - t0) * i) / 6;
      outer.push(T.at(t, side, 0.95));
      inner.push(T.at(t, side, k));
    }
    return smooth(outer.concat(inner.reverse()));
  }

  // Önden gövde: omuz – koltuk altı – bel – kalça hattı
  function frontTorso(g) {
    const u = g.td;
    const n = g.nrm;
    const at = (k, w) => add(add(g.H, mul(u, k)), mul(n, w));
    const sh = (w, k) => add(add(g.Sh, mul(n, w)), mul(u, k));
    const side = (sg) => [at(-6, sg * 4.5), at(0, sg * 12), at(13, sg * 10.2), at(26, sg * 12.2), at(35, sg * 14.2), sh(sg * 16.5, -2.5), sh(sg * 13.5, 1.2)];
    const r = side(1);
    const l = side(-1).reverse();
    return smooth([...r, add(g.S, add(mul(u, 3.5), mul(n, 5))), add(g.S, add(mul(u, 3.5), mul(n, -5))), ...l, at(-8.5, 0)]);
  }
  const frontAt = (g, k, w) => add(add(g.H, mul(g.td, k)), mul(g.nrm, w));

  /* ---------- Figür ---------- */
  function Figure(id, opts) {
    const def = DEFS[id] || DEFS.squat;
    const hl = new Set(def.hl || []);
    const front = !!def.front;
    this.def = def;
    this.isHl = (m, i) => hl.has(m) || (i !== undefined && hl.has(m + i));
    const n = ++uid;
    const ids = { sk: `fg${n}sk`, skf: `fg${n}skf`, mu: `fg${n}mu`, muf: `fg${n}muf` };
    this.svg = el('svg', { viewBox: def.vb || '0 0 200 170', class: 'ex-fig' + (def.hold ? ' is-hold' : ''), role: 'img', 'aria-label': def.label + ' hareket animasyonu' });
    const svg = this.svg;
    const grad = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
    el('defs', {}, svg).innerHTML = grad(ids.sk, '#f7f7f9', '#b6b7c0') + grad(ids.skf, '#7a7a84', '#4a4a52') + grad(ids.mu, '#7cf0c2', '#059669') + grad(ids.muf, '#14a87a', '#064e3b');
    if (def.floor !== false) {
      el('path', { class: 'eq-floor', d: 'M6 158.5H194' }, svg);
      this.shadow = el('ellipse', { class: 'fg-shadow', cy: 159, ry: 3.2 }, svg);
    }
    if (def.eqBack) el('g', {}, svg).innerHTML = def.eqBack;

    const skin = (far) => `url(#${far ? ids.skf : ids.sk})`;
    const body = (far, cls) => el('path', { class: 'fb' + (cls ? ' ' + cls : '') + (far ? ' far' : ''), fill: skin(far) }, svg);
    const muscle = (far) => {
      const halo = el('path', { class: 'fh' + (far ? ' far' : '') }, svg);
      const m = el('path', { class: 'fm' + (far ? ' far' : ''), fill: `url(#${far ? ids.muf : ids.mu})` }, svg);
      return { halo, m };
    };
    const isFar = (i) => !front && i === 1; // önden görünümde iki taraf da aynı ton

    this.legs = [];
    this.arms = [];
    const addLeg = (i) => {
      const far = isFar(i);
      const L = { thigh: body(far), shin: body(far), shoe: el('path', { class: 'shoe' + (far ? ' far' : '') }, svg), mus: {} };
      ['quads', 'hams', 'calves'].forEach((m) => { if (this.isHl(m, i)) L.mus[m] = muscle(far); });
      this.legs[i] = L;
    };
    const addArm = (i) => {
      const far = isFar(i);
      const A = { upper: body(far), fore: body(far), hand: body(far), mus: {}, db: null };
      ['biceps', 'triceps'].forEach((m) => { if (this.isHl(m, i)) A.mus[m] = muscle(far); });
      if (def.db === true || (def.db === 'near' && i === 0)) {
        A.db = [el('circle', { class: 'db' + (far ? ' db-far' : ''), r: 7 }, svg), el('circle', { class: 'db-in', r: 2.4 }, svg)];
      }
      this.arms[i] = A;
    };

    // Çizim sırası: arka uzuvlar → gövde → boyun / baş → ön uzuvlar
    if (front) { addLeg(0); addLeg(1); } else { addLeg(1); addArm(1); }
    this.torso = body(false, 'torso');
    this.torsoMus = {};
    ['abs', 'chest', 'back', 'glutes'].forEach((m) => { if (hl.has(m)) this.torsoMus[m] = muscle(false); });
    if (front && hl.has('abs')) this.absLines = el('path', { class: 'fm-lines' }, svg);
    this.neck = el('path', { class: 'fb' + (hl.has('neck') ? ' neck-hl' : ''), fill: hl.has('neck') ? `url(#${ids.mu})` : skin(false) }, svg);
    if (hl.has('traps')) this.traps = muscle(false);
    this.hair = el('circle', { class: 'hair', r: 10 }, svg);
    this.face = el('circle', { class: 'fb face', fill: skin(false), r: 9.2 }, svg);
    if (def.handPlate) {
      this.handPlate = el('circle', { class: 'eq-plate', r: 11 }, svg);
      this.handPlateHole = el('circle', { class: 'eq-plate-hole', r: 3 }, svg);
    }
    if (front) { addArm(0); addArm(1); } else { addLeg(0); addArm(0); }
    if (hl.has('delts')) this.delts = [0, 1].map(() => muscle(false));
    if (def.plate) {
      this.chain = el('path', { class: 'eq-chain' }, svg);
      this.plate = el('circle', { class: 'eq-plate', r: 10 }, svg);
    }
    if (def.eqFront) el('g', {}, svg).innerHTML = def.eqFront;

    this.t0 = 0;
    this.update(opts && opts.t !== undefined ? opts.t : 1);
  }

  const setMus = (mu, d) => { mu.halo.setAttribute('d', d); mu.m.setAttribute('d', d); };

  Figure.prototype.update = function (t) {
    const def = this.def;
    const front = !!def.front;
    const g = solve(mix(def.A, def.B, t), front, def.far);
    const torsoFront = g.nrm; // yandan görünümde vücudun ön yüzü
    const lowPts = [];

    // Bacaklar: diz bükülme yönünden ön (quads) / arka (hams) yüz; ayak ucunun tersi baldır
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      const [hip, knee, ankle, toe] = g.legs[i];
      const dT = unit(sub(knee, hip));
      const dS = unit(sub(ankle, knee));
      const dF = unit(sub(toe, ankle));
      const c = cross(dT, dS);
      const quadSide = front ? 1 : Math.abs(c) > 0.12 ? -sgn(c) : sgn(dot(perp(dT), dF) || dot(perp(dT), torsoFront));
      const calfSide = front ? 1 : -sgn(dot(perp(dS), dF) || -quadSide);
      const th = front ? limb2(hip, knee, 8.2, 5.6, 1.6, 1.6, 0.4)
        : limb2(hip, knee, 8.4, 5.6, quadSide > 0 ? 2 : 1.6, quadSide > 0 ? 1.6 : 2, 0.4);
      const sh = front ? limb2(knee, ankle, 5.3, 3.3, 1.4, 1.4, 0.3)
        : limb2(knee, ankle, 5.2, 3.3, calfSide > 0 ? 2.5 : 0.3, calfSide > 0 ? 0.3 : 2.5, 0.3);
      L.thigh.setAttribute('d', limbOutline(th));
      L.shin.setAttribute('d', limbOutline(sh));
      const heel = add(ankle, mul(dF, front ? -0.5 : -2.4));
      const tip = front ? add(ankle, mul(dF, 4.2)) : add(toe, mul(dF, 1));
      L.shoe.setAttribute('d', limbOutline(limb2(heel, tip, front ? 3.4 : 3.7, front ? 3 : 2.7, 0.4, 0.4, 0.5)));
      if (L.mus.quads) setMus(L.mus.quads, limbMuscle(th, front ? 0 : quadSide, 0.1, 0.9));
      if (L.mus.hams) setMus(L.mus.hams, limbMuscle(th, front ? 0 : -quadSide, 0.12, 0.88));
      if (L.mus.calves) setMus(L.mus.calves, limbMuscle(sh, front ? 0 : calfSide, 0.05, 0.62));
      lowPts.push(ankle, toe, knee);
    }

    // Kollar: dirsek bükülme yönü pazu (biceps) yüzüdür
    for (let i = 0; i < 2; i++) {
      const A = this.arms[i];
      if (!A) continue;
      const [sho, elb, wri] = g.arms[i];
      const dU = unit(sub(elb, sho));
      const dF = unit(sub(wri, elb));
      const c = cross(dU, dF);
      const bicSide = front ? 1 : Math.abs(c) > 0.12 ? sgn(c) : sgn(dot(perp(dU), torsoFront));
      const up = limb2(sho, elb, 5.6, 3.9, bicSide > 0 ? 1.5 : 1.2, bicSide > 0 ? 1.2 : 1.5, 0.45);
      const fo = limb2(elb, wri, 4.2, 2.9, 1, 0.8, 0.28);
      A.upper.setAttribute('d', limbOutline(up));
      A.fore.setAttribute('d', limbOutline(fo));
      const hc = add(wri, mul(dF, 2.2));
      A.hand.setAttribute('d', limbOutline(limb2(add(wri, mul(dF, -0.5)), add(hc, mul(dF, 1.6)), 3.1, 2.7, 0.5, 0.5, 0.5)));
      if (A.mus.biceps) setMus(A.mus.biceps, limbMuscle(up, front ? 0 : bicSide, 0.18, 0.88));
      if (A.mus.triceps) setMus(A.mus.triceps, limbMuscle(up, front ? 0 : -bicSide, 0.1, 0.86));
      if (A.db) A.db.forEach((e) => { e.setAttribute('cx', f1(hc[0])); e.setAttribute('cy', f1(hc[1])); });
      lowPts.push(wri);
    }

    // Gövde
    if (front) {
      this.torso.setAttribute('d', frontTorso(g));
      const at = (k, w) => frontAt(g, k, w);
      if (this.torsoMus.abs) {
        setMus(this.torsoMus.abs, smooth([at(3, 6.4), at(14, 7.2), at(25.5, 7.8), at(25.5, -7.8), at(14, -7.2), at(3, -6.4)]));
        this.absLines.setAttribute('d', P([at(2.5, 0), at(26, 0)]) + P([at(10, 6.6), at(10, -6.6)]) + P([at(18, 7.2), at(18, -7.2)]));
      }
      if (this.torsoMus.chest) {
        setMus(this.torsoMus.chest, [1, -1].map((sg) => smooth([at(27, sg * 1.2), at(27, sg * 9), at(31, sg * 13), at(37, sg * 12), at(38.5, sg * 6), at(38.5, sg * 1.2)])).join(''));
      }
    } else {
      const T = torso2(g);
      this.torso.setAttribute('d', torsoOutline(T, g));
      Object.keys(this.torsoMus).forEach((m) => setMus(this.torsoMus[m], torsoMuscle(T, TORSO_MUS[m])));
      lowPts.push(T.at(0.05, 1), T.at(0.05, -1), T.at(0.9, 1), T.at(0.9, -1));
    }
    if (this.traps) {
      const u = g.td;
      const nn = g.nrm;
      const q = (k, w, base) => add(add(base || g.S, mul(u, k)), mul(nn, w));
      setMus(this.traps, smooth([q(9, 3.2), q(1.5, 9), q(0, 13.5, g.Sh), q(-4.5, 8.5), q(-10, 0), q(-4.5, -8.5), q(0, -13.5, g.Sh), q(1.5, -9), q(9, -3.2)]));
    }
    if (this.delts) this.delts.forEach((mu, i) => {
      const c0 = g.sR[i];
      const pts = [];
      for (let k = 0; k < 8; k++) pts.push(add(c0, [6.4 * Math.cos((k * Math.PI) / 4), 6.4 * Math.sin((k * Math.PI) / 4)]));
      setMus(mu, smooth(pts));
    });

    // Boyun ve baş (saç arkada / üstte; yüz göğsün baktığı yöne)
    const nb = add(g.S, mul(g.td, -2));
    this.neck.setAttribute('d', limbOutline(limb2(nb, g.head, 4.8, 4.2, 0.3, 0.3, 0.5)));
    const uN = unit(sub(g.head, g.S));
    let fFace = [0, 0];
    if (!front) {
      fFace = perp(uN);
      if (dot(fFace, torsoFront) < 0) fFace = mul(fFace, -1);
    }
    const hairC = add(add(g.head, mul(uN, 1.4)), mul(fFace, -1.7));
    const faceC = add(add(g.head, mul(uN, -0.5)), mul(fFace, 0.7));
    this.hair.setAttribute('cx', f1(hairC[0]));
    this.hair.setAttribute('cy', f1(hairC[1]));
    this.face.setAttribute('cx', f1(faceC[0]));
    this.face.setAttribute('cy', f1(faceC[1]));
    lowPts.push(g.head);

    if (this.handPlate) {
      const h = g.arms[0][2];
      [this.handPlate, this.handPlateHole].forEach((c) => { c.setAttribute('cx', f1(h[0])); c.setAttribute('cy', f1(h[1])); });
    }
    if (this.plate) {
      const top = add(g.head, [1.5, 8]);
      const plate = add(g.head, [2, 36]);
      this.chain.setAttribute('d', P([top, add(plate, [0, -10])]));
      this.plate.setAttribute('cx', f1(plate[0]));
      this.plate.setAttribute('cy', f1(plate[1]));
    }

    // Zemin gölgesi: yere yakın noktaların altında
    if (this.shadow) {
      let near = lowPts.filter((q) => q[1] > 128);
      if (!near.length) near = lowPts;
      const xs = near.map((q) => q[0]);
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      const lift = Math.min(1, Math.max(0, (158 - Math.max(...near.map((q) => q[1]))) / 40));
      this.shadow.setAttribute('cx', f1((lo + hi) / 2));
      this.shadow.setAttribute('rx', f1((hi - lo) / 2 + 12));
      this.shadow.setAttribute('opacity', f1(0.9 - lift * 0.6));
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
    this.svg.classList.add('playing');
    if (!raf) raf = requestAnimationFrame(loop);
    return this;
  };

  Figure.prototype.stop = function () {
    running.delete(this);
    this.svg.classList.remove('playing');
    return this;
  };

  window.ExerciseFigures = {
    ids: Object.keys(DEFS),
    label: (id) => (DEFS[id] ? DEFS[id].label : ''),
    create: (id, opts) => new Figure(id, opts)
  };
})();
