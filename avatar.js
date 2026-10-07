/* AvatarArt - original cel-shaded manga fighter, 11 evolution tiers (levels 0..100).
   Plain script, no modules, no SVG filters. Exposes window.AvatarArt = { TIERS, tierForLevel, name, svg }. */
(function () {
  'use strict';
  var NAMES = ['Çaylak', 'Acemi', 'Sokak Dövüşçüsü', 'Demir Yumruk', 'Çelik Kas', 'Arena Şampiyonu', 'Titan', 'Canavar', 'Savaş Tanrısı', 'Efsane', 'Yenilmez'];
  var INK = '#1d100c', MIR = 'transform="matrix(-1 0 0 1 240 0)"';
  var seq = 0, CTX = null, GEMS = null;

  /* ---------------- helpers ---------------- */
  function R(v) { return Math.round(v * 10) / 10; }
  function V(x, y) { return { x: x, y: y }; }
  function add(a, b) { return V(a.x + b.x, a.y + b.y); }
  function sub(a, b) { return V(a.x - b.x, a.y - b.y); }
  function mul(a, k) { return V(a.x * k, a.y * k); }
  function unit(a) { var l = Math.sqrt(a.x * a.x + a.y * a.y) || 1; return V(a.x / l, a.y / l); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpP(a, b, t) { return V(lerp(a.x, b.x, t), lerp(a.y, b.y, t)); }
  function N(v) { return String(R(v)).replace(/^(-?)0\./, '$1.'); }
  function S(p) { return N(p.x) + ' ' + N(p.y); }
  function M(p) { return 'M' + S(p); }
  function L(p) { return 'L' + S(p); }
  function C(a, b, c) { return 'C' + S(a) + ' ' + S(b) + ' ' + S(c); }
  function Q(a, b) { return 'Q' + S(a) + ' ' + S(b); }
  function mx(p) { return V(240 - p.x, p.y); }
  function pth(d, a) { return '<path d="' + d + '"' + (a ? ' ' + a : '') + '/>'; }
  function OP(op) { return op != null && op < 1 ? ' opacity="' + N(op) + '"' : ''; }
  function F(c, op) { return 'fill="' + c + '"' + OP(op); }
  function FS(c, w) { return 'fill="' + c + '" stroke="' + INK + '" stroke-width="' + N(w) + '"'; }
  function SK(w, c, op) { return 'fill="none" stroke="' + (c || INK) + '" stroke-width="' + N(w) + '"' + OP(op); }
  function ell(c, rx, ry, a) { return '<ellipse cx="' + N(c.x) + '" cy="' + N(c.y) + '" rx="' + N(rx) + '" ry="' + N(ry) + '" ' + a + '/>'; }
  function hex(c) { return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)]; }
  function mix(a, b, t) {
    var A = hex(a), B = hex(b), o = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(A[i] + (B[i] - A[i]) * t); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o;
  }
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* symmetric closed path from a left half: [start, [c1,c2,p], ...] */
  function symPath(h) {
    var d = M(h[0]), pts = [h[0]], i;
    for (i = 1; i < h.length; i++) { d += C(h[i][0], h[i][1], h[i][2]); pts.push(h[i][2]); }
    var last = pts[pts.length - 1];
    if (Math.abs(last.x - 120) > 0.01) d += L(mx(last));
    for (i = h.length - 1; i >= 1; i--) d += C(mx(h[i][1]), mx(h[i][0]), mx(pts[i - 1]));
    return d + 'Z';
  }
  /* sharp lens between P and Q; b1, b2 = bulges along the left normal of P->Q */
  function lens(P, Qp, b1, b2) {
    var m = mul(add(P, Qp), 0.5), d = unit(sub(Qp, P)), n = V(-d.y, d.x);
    return M(P) + Q(add(m, mul(n, b1)), Qp) + Q(add(m, mul(n, b2)), P) + 'Z';
  }
  function lensUp(P, Qp, b1, b2) {
    var d = unit(sub(Qp, P)), k = d.x < 0 ? 1 : -1;
    return lens(P, Qp, b1 * k, b2 * k);
  }
  /* tapered manga brush stroke along a cubic; w = width toward the left normal of a->b */
  function brush(a, c1, c2, b, w) {
    var d = unit(sub(b, a)), n = V(-d.y * w, d.x * w);
    return M(a) + C(c1, c2, b) + C(add(c2, n), add(c1, n), a) + 'Z';
  }
  /* per-call registry: shapes are defined once in <defs> and drawn with <use> */
  function def(d) { var k = CTX.id + 'p' + (CTX.n++).toString(36); CTX.defs.push('<path id="' + k + '" d="' + d + '"/>'); return k; }
  function U(k, a) { return '<use href="#' + k + '"' + (a ? ' ' + a : '') + '/>'; }
  function clipOf(k) { CTX.defs.push('<clipPath id="' + k + 'c"><use href="#' + k + '"/></clipPath>'); return k + 'c'; }
  /* left-half detail group drawn twice (mirrored) */
  function mirror(inner) { var k = CTX.id + 'g' + (CTX.n++).toString(36); CTX.defs.push('<g id="' + k + '">' + inner + '</g>'); return U(k) + U(k, MIR); }
  /* cel-shaded fill: shade everywhere, base shifted toward the light, clipped to the shape */
  function cel(id, d, pal, dx, dy) {
    var k = def(d), c = clipOf(k); cel.k = k; cel.c = c;
    return U(k, F(pal.shade)) + '<g clip-path="url(#' + c + ')">' + U(k, F(pal.base) + ' transform="translate(' + dx + ' ' + dy + ')"') + '</g>';
  }
  /* aura back-light along the shadow (right) side of the last cel shape, tiers 8+ */
  function rim(P) {
    var c = AURA[P.t]; if (!c) return '';
    return '<g clip-path="url(#' + cel.c + ')">' + U(cel.k, SK(3.4, c[2], 0.9) + ' transform="translate(-2.6 0)"') + '</g>';
  }
  var LIGHT = unit(V(-0.55, -0.85));
  /* tapered limb capsule with muscle bulges, cel shadow band and a sharp highlight */
  function limb(A, B, rA, rB, o) {
    o = o || {};
    var dv = sub(B, A), Ln = Math.sqrt(dv.x * dv.x + dv.y * dv.y), d = unit(dv), n = V(-d.y, d.x);
    function at(t, off) { return add(add(A, mul(d, Ln * t)), mul(n, off)); }
    function r(t) { return lerp(rA, rB, t); }
    var b1 = o.b1 || 0, t1 = o.t1 == null ? 0.45 : o.t1, b2 = o.b2 || 0, t2 = o.t2 == null ? 0.45 : o.t2;
    var w1 = o.w1 || 0.3, w2 = o.w2 || 0.3;
    var a1 = Math.max(0.02, t1 - w1), c1 = Math.min(0.98, t1 + w1), a2 = Math.max(0.02, t2 - w2), c2 = Math.min(0.98, t2 + w2);
    var e1 = [at(0, rA), at(a1, r(a1) + b1 * 1.33), at(c1, r(c1) + b1 * 1.33), at(1, rB)];
    var e2 = [at(1, -rB), at(c2, -r(c2) - b2 * 1.33), at(a2, -r(a2) - b2 * 1.33), at(0, -rA)];
    var cb = (o.capB == null ? 1 : o.capB) * 1.1, ca = (o.capA == null ? 0.5 : o.capA) * 1.1;
    var dd = M(e1[0]) + C(e1[1], e1[2], e1[3]) + C(add(e1[3], mul(d, rB * cb)), add(e2[0], mul(d, rB * cb)), e2[0]) +
      C(e2[1], e2[2], e2[3]) + C(add(e2[3], mul(d, -rA * ca)), add(e1[0], mul(d, -rA * ca)), e1[0]) + 'Z';
    var lit1 = (n.x * LIGHT.x + n.y * LIGHT.y) > 0;
    var f = o.sf == null ? 0.1 : o.sf, sd;
    if (lit1) {
      sd = M(at(0, -rA * f)) + C(at(a2, -(r(a2) * f + b2 * 0.75)), at(c2, -(r(c2) * f + b2 * 0.75)), at(1, -rB * f)) +
        L(e2[0]) + C(e2[1], e2[2], e2[3]) + 'Z';
    } else {
      sd = M(e1[0]) + C(e1[1], e1[2], e1[3]) + L(at(1, rB * f)) +
        C(at(c1, r(c1) * f + b1 * 0.75), at(a1, r(a1) * f + b1 * 0.75), at(0, rA * f)) + 'Z';
    }
    var ls = lit1 ? 1 : -1, bl = lit1 ? b1 : b2, tl = lit1 ? t1 : t2;
    var hp = at(Math.max(0.12, tl - 0.24), ls * (r(tl) * 0.5 + bl * 0.55)),
      hq = at(Math.min(0.88, tl + 0.24), ls * (r(tl) * 0.45 + bl * 0.5));
    var hl = lens(hp, hq, ls * (r(tl) * 0.34 + bl * 0.3), ls * r(tl) * 0.06);
    return { d: dd, sh: sd, hl: hl, at: at, n: n, dir: d, len: Ln, lit1: lit1 };
  }
  function drawLimb(lb, pal, w) {
    var k = def(lb.d); drawLimb.k = k;
    return U(k, F(pal.base)) + pth(lb.sh, F(pal.shade)) + pth(lb.hl, F(pal.hi)) + U(k, SK(w || 2.6));
  }

  /* ---------------- tier parameters (monotonic growth) ---------------- */
  var TBL = {
    sw: [33, 36.5, 40, 43.5, 47, 50.5, 54, 57.5, 61, 65, 69],
    dR: [8, 9.5, 11, 12.5, 14, 15.5, 17, 18.5, 20, 22, 24],
    nw: [10, 11, 12, 13.5, 15, 16.5, 18, 19.5, 21, 22.5, 24],
    trap: [2, 4, 6, 9, 12, 15, 18, 21, 24, 27, 30],
    latW: [30, 33, 36.5, 41, 46, 51, 56, 60, 66, 74, 82],
    ww: [28.5, 30, 31.5, 33, 35, 37, 39, 41, 44, 48, 52],
    pecL: [146, 150, 154, 157, 160, 163, 166, 169, 171, 173, 175],
    armR: [5.8, 7.2, 8.6, 10, 11.4, 12.8, 14.2, 15.6, 17.6, 19.6, 21.6],
    foreR: [4.8, 5.9, 7, 8, 9, 10, 11, 12, 12.8, 13.6, 14.4],
    abW: [12, 13, 14, 15, 16.5, 17.5, 18.5, 19.5, 21, 22.5, 24],
    cam: [1, 1, 1, 1, 1, 1, 1, 1, 0.96, 0.925, 0.89]
  };
  // frame palettes per tier: bg1 bg2 glow line metal0 metal1 metal2 (grey, green, bronze, copper-red, steel, platinum, gold, ember, crimson, violet, gold-red)
  var FRAMES = [
    '#25272e #0b0c0f #52525b #a1a1aa #3f3f46 #a1a1aa #52525b',
    '#15322a #07100d #10b981 #6ee7b7 #065f46 #6ee7b7 #047857',
    '#33261a #100b07 #b8863e #e3b878 #6b4a1f #ecc890 #8a6a29',
    '#3a1416 #120506 #d94a4a #f6a5a0 #7a1f1c #ffc4b8 #b83a2e',
    '#282d36 #0b0d11 #94a3b8 #e2e8f0 #4b5563 #f1f5f9 #6b7280',
    '#1d2a3e #080c14 #7dd3fc #e0f2fe #64748b #ffffff #93c5fd',
    '#382c0c #110d03 #f5b70b #fde68a #8a5a06 #fff3b0 #c99a06',
    '#3d1806 #130702 #ff7a1a #fdba74 #9a3412 #ffe0c2 #f2600c',
    '#3d1010 #120404 #ef4444 #fca5a5 #7f1d1d #fecaca #dc2626',
    '#2a0d33 #0c0410 #c026d3 #f0abfc #5b1d74 #f5d0fe #a21caf',
    '#3a1205 #120402 #f59e0b #fde68a #b91c1c #fff1b8 #f59e0b'
  ].map(function (r) { r = r.split(' '); return { bg1: r[0], bg2: r[1], glow: r[2], ln: r[3], m: r.slice(4) }; });
  var AURA = { 8: ['#991b1b', '#f97316', '#fed7aa'], 9: ['#4c1d95', '#d946ef', '#fbcfe8'], 10: ['#991b1b', '#f59e0b', '#fff3c4'] };

  function params(t) {
    var p = { t: t, shY: 124, rimK: [] };
    for (var k in TBL) p[k] = TBL[k][t];
    p.pose = t < 2 ? 'hang' : t < 5 ? 'fist' : t < 8 ? 'cross' : 'flex';
    var k2 = t / 10;
    p.skin = {
      base: mix('#f2c6a0', '#dc9e6a', k2), shade: mix('#d39a72', '#ad633b', k2),
      deep: mix('#a8623f', '#74361c', k2), hi: mix('#fde7d2', '#ffd9b0', k2)
    };
    p.wrap = t >= 10 ? ['#c81e1e', '#7f1d1d'] : t >= 9 ? ['#2a2a30', '#6b6b75'] : ['#f3efe6', '#a8a29e'];
    p.band = t >= 8 ? ['#f59e0b', '#fde68a', '#b45309'] : t >= 5 ? ['#6366f1', '#a5b4fc', '#4338ca'] : ['#10b981', '#6ee7b7', '#047857'];
    return p;
  }

  /* ---------------- background & frame ---------------- */
  function background(P, Fr, id) {
    var t = P.t, o = '';
    o += '<rect width="240" height="300" fill="url(#' + id + 'bg)"/>';
    o += '<ellipse cx="120" cy="135" rx="135" ry="150" fill="url(#' + id + 'gl)"/>';
    var rnd = rng(11 + t * 7), n = t >= 8 ? 18 : 28 + t * 2.5, d = '';
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + rnd() * 0.15, w = 0.004 + rnd() * 0.011, r0 = 100 + rnd() * 50;
      d += 'M' + Math.round(120 + Math.cos(a) * r0) + ' ' + Math.round(140 + Math.sin(a) * r0) + 'L' + Math.round(120 + Math.cos(a - w) * 270) + ' ' + Math.round(140 + Math.sin(a - w) * 270) +
        'L' + Math.round(120 + Math.cos(a + w) * 270) + ' ' + Math.round(140 + Math.sin(a + w) * 270) + 'Z';
    }
    return o + pth(d, F(Fr.ln, R(0.08 + t * 0.016)));
  }
  function gem(x, y, s, c) {
    var g = GEMS[c] || (GEMS[c] = ['', '']);
    g[0] += M(V(x, y - s)) + 'l' + N(s * 0.8) + ' ' + N(s) + 'l' + N(-s * 0.8) + ' ' + N(s) + 'l' + N(-s * 0.8) + ' ' + N(-s) + 'Z';
    g[1] += M(V(x, y - s)) + 'l' + N(s * 0.8) + ' ' + N(s) + 'h' + N(-s * 0.8) + 'Z';
    return '';
  }
  function flushGems() {
    var o = '';
    for (var c in GEMS) o += pth(GEMS[c][0], FS(c, 1.2)) + pth(GEMS[c][1], F('#ffffff', 0.45));
    GEMS = {};
    return o;
  }
  function frame(P, Fr, id) {
    var t = P.t, o = '', i;
    GEMS = {};
    o += '<rect x="4.5" y="4.5" width="231" height="291" rx="19" fill="none" stroke="url(#' + id + 'mt)" stroke-width="' + (t >= 6 ? 6 : 5) + '"/>';
    o += '<rect x="9.5" y="9.5" width="221" height="281" rx="15" fill="none" stroke="' + Fr.ln + '" stroke-opacity=".35"/>';
    if (t >= 3) { // corner brackets riding the inner edge of the rounded frame
      var br = '', bl = 6 + Math.min(t, 9) * 1.5, r = 16;
      [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (c) {
        var x = c[0] > 0 ? 7.5 : 232.5, y = c[1] > 0 ? 7.5 : 292.5;
        br += M(V(x, y + c[1] * (r + bl))) + L(V(x, y + c[1] * r)) + 'A' + r + ' ' + r + ' 0 0 ' + (c[0] * c[1] > 0 ? 1 : 0) + ' ' + S(V(x + c[0] * r, y)) + L(V(x + c[0] * (r + bl), y));
      });
      o += pth(br, SK(3, Fr.m[1]) + ' stroke-linecap="round"');
    }
    if (t >= 2) {
      var sz = 3.5 + Math.min(t, 8) * 0.4, gc = t >= 6 ? Fr.glow : Fr.m[1];
      [[19, 19], [221, 19], [19, 281], [221, 281]].forEach(function (c) { gem(c[0], c[1], sz, gc); });
    }
    if (t >= 6) {
      var cw = t >= 8 ? 18 : 12, ch = t >= 8 ? 12 : 9;
      o += pth(M(V(120 - cw, 4.5)) + L(V(120 - cw * 0.45, 1)) + L(V(120, 4)) + L(V(120 + cw * 0.45, 1)) + L(V(120 + cw, 4.5)) + L(V(120, 4.5 + ch)) + 'Z', FS(Fr.m[1], 1.4));
      gem(120, 7.5, 4, t >= 8 ? AURA[t][1] : Fr.glow);
    }
    if (t >= 7) { gem(4.5, 150, 5, Fr.glow); gem(235.5, 150, 5, Fr.glow); }
    o += flushGems();
    if (t > 0) { // tier pip counter: N dots for tier N
      var pw = 14 + t * 7.4, x0 = 120 - pw / 2;
      if (t >= 8) o += pth(M(V(x0 + 1, 284.5)) + L(V(x0 - 9, 289.5)) + L(V(x0 + 1, 294.5)) + 'Z' + M(V(241 - x0 - 2, 284.5)) + L(V(249 - x0, 289.5)) + L(V(241 - x0 - 2, 294.5)) + 'Z', FS(Fr.m[1], 1.1));
      o += '<rect x="' + N(x0) + '" y="284" width="' + N(pw) + '" height="11" rx="5.5" fill="' + Fr.bg2 + '" stroke="url(#' + id + 'mt)" stroke-width="1.5"/>';
      o += pth(M(V(120 - (t - 1) * 3.7, 289.5)) + 'h' + N((t - 1) * 7.4 + 0.1), SK(4.2, Fr.m[1]) + ' stroke-linecap="round" stroke-dasharray=".01 7.39"');
    }
    return o;
  }

  /* ---------------- aura & energy (no filters: haze gradient + stacked flame rings) ---------------- */
  function I(p) { return Math.round(p.x) + ' ' + Math.round(p.y); }
  function flameRing(cx, cy, rx, ry, n, amp, seed) {
    var rnd = rng(seed), pts = [], i, d;
    for (i = 0; i <= n; i++) {
      var th = Math.PI * (0.9 + 1.2 * i / n);
      pts.push(V(cx + rx * Math.cos(th), cy + ry * Math.sin(th)));
    }
    d = M(V(cx - rx - 10, 330)) + L(pts[0]);
    for (i = 0; i < n; i++) {
      var a = pts[i], b = pts[i + 1], m = mul(add(a, b), 0.5);
      var out = unit(sub(m, V(cx, cy)));
      var dir = unit(add(out, V(0, -1.4)));
      var h = amp * (0.55 + rnd() * 0.9);
      var tip = add(m, add(mul(dir, h), V((rnd() - 0.5) * 8, 0)));
      d += 'Q' + I(add(lerpP(a, tip, 0.55), mul(out, -h * 0.22))) + ' ' + I(tip) + 'Q' + I(add(lerpP(tip, b, 0.45), mul(out, h * 0.16))) + ' ' + I(b);
    }
    return d + L(V(cx + rx + 10, 330)) + 'Z';
  }
  function aura(P, id) {
    var t = P.t, c = AURA[t]; if (!c) return '';
    var sc = t - 8;
    return '<rect width="240" height="300" fill="url(#' + id + 'hz)"/>' +
      pth(flameRing(120, 186, 110 + sc * 4, 158 + sc * 8, 14, 30 + sc * 5, 3 + t), F(c[0], 0.55)) +
      pth(flameRing(120, 192, 100 + sc * 4, 146 + sc * 7, 13, 25 + sc * 5, 4 + t), F(c[0], 0.9)) +
      pth(flameRing(120, 197, 88 + sc * 4, 130 + sc * 7, 12, 20 + sc * 4, 5 + t), F(c[1], 0.85)) +
      pth(flameRing(120, 212, 66 + sc * 4, 98 + sc * 6, 11, 12 + sc * 3, 9 + t), F(c[2], 0.3 + sc * 0.05));
  }
  function sparks(P) {
    var t = P.t; if (t < 8) return '';
    var rnd = rng(31 + t), n = 9 + (t - 8) * 4, d = '', c = AURA[t];
    for (var i = 0; i < n; i++) {
      var x = 18 + rnd() * 204, y = 20 + rnd() * 250, s = 1.4 + rnd() * 2.4;
      if (Math.abs(x - 120) < 70 && y > 50 && y < 280) continue;
      var a = R(s * 0.4), b = R(s * 1.4);
      d += M(V(x, y - s * 1.8)) + 'l' + a + ' ' + b + ' ' + b + ' ' + a + ' ' + (-b) + ' ' + a + ' ' + (-a) + ' ' + b + ' ' + (-a) + ' ' + (-b) + ' ' + (-b) + ' ' + (-a) + ' ' + b + ' ' + (-a) + 'Z';
    }
    var o = pth(d, F(c[2]));
    if (t >= 9) {
      var rr = rng(70 + t), bolts = '';
      var starts = t === 10 ? [[14, 200, 1, -1], [226, 196, -1, -1], [16, 112, 1, -1], [224, 108, -1, -1], [44, 34, 1, 1], [196, 30, -1, 1]] : [[14, 205, 1, -1], [226, 200, -1, -1], [18, 120, 1, -1]];
      starts.forEach(function (s) {
        var x = s[0], y = s[1], seg = M(V(x, y));
        for (var k = 0; k < 5; k++) { x += s[2] * (k % 2 ? -2 : 5 + rr() * 4); y += s[3] * (7 + rr() * 7); seg += L(V(x, y)); }
        bolts += seg;
      });
      var bk = def(bolts);
      o += U(bk, SK(5, t === 10 ? '#fbbf24' : '#e879f9', 0.45)) + U(bk, SK(1.8, '#fffbeb'));
    }
    return o;
  }

  /* ---------------- torso ---------------- */
  function torsoHalf(P) {
    var sw = P.sw, nw = P.nw, shY = P.shY, tr = P.trap, dR = P.dR, latW = P.latW, ww = P.ww;
    var flex = P.pose === 'flex';
    var Nk = V(120 - nw + 1.5, shY - tr), A = V(120 - sw, shY + 3);
    var Ap = V(120 - Math.min(sw - 3, latW - 2), shY + dR + (flex ? 10 : 14));
    var Lw = V(120 - latW, shY + (flex ? 46 : 52)), W = V(120 - ww, 262), B = V(120 - ww - 1, 345);
    return [Nk,
      [V(120 - nw - (sw - nw) * 0.38, shY - tr + 0.5), V(120 - sw + (sw - nw) * 0.22, shY - tr * 0.5), A],
      [A, Ap, Ap],
      [V(Ap.x - 1, Ap.y + 8), V(Lw.x, Lw.y - 14), Lw],
      [V(Lw.x, Lw.y + 30), V(W.x - 3, W.y - 42), W],
      [W, B, B]];
  }

  /* ---------------- neck ---------------- */
  function neck(P, pal) {
    var nw = P.nw, shY = P.shY, tr = P.trap, o = '';
    var top = 86, bot = shY + 10;
    var h = [V(120, top), [V(120 - nw * 0.6, top), V(120 - nw, top + 2), V(120 - nw, top + 8)],
      [V(120 - nw, shY - tr - 4), V(120 - nw - 1, shY - tr + 2), V(120 - nw - 3, shY - tr + 6)],
      [V(120 - nw * 0.6, bot - 4), V(120 - 4, bot), V(120, bot)]];
    var nk = def(symPath(h)), nc = clipOf(nk);
    P.rimK.push(nk);
    o += U(nk, F(pal.base));
    o += '<g clip-path="url(#' + nc + ')">' + U(P.faceK, F(pal.shade) + ' transform="translate(1 8)"') +
      pth(M(V(120 + nw * 0.35, top)) + L(V(120 + nw + 4, top)) + L(V(120 + nw + 4, bot)) + L(V(120 + nw * 0.55, bot)) + 'Z', F(pal.shade)) + '</g>';
    var side = M(V(120 - nw, top + 6)) + C(V(120 - nw, shY - tr - 4), V(120 - nw - 1, shY - tr + 2), V(120 - nw - 3, shY - tr + 6));
    o += pth(side + M(mx(V(120 - nw, top + 6))) + C(mx(V(120 - nw, shY - tr - 4)), mx(V(120 - nw - 1, shY - tr + 2)), mx(V(120 - nw - 3, shY - tr + 6))), SK(2.6));
    if (P.t >= 3) {
      var scm = '';
      [-1, 1].forEach(function (s) { scm += M(V(120 + s * (nw - 3), top + 10)) + Q(V(120 + s * (nw * 0.45), shY - 6), V(120 + s * 3, bot - 3)); });
      o += pth(scm, SK(1.3, pal.deep, 0.8));
    }
    if (P.t >= 9) o += veinPath(M(V(120 - nw + 4, top + 6)) + Q(V(120 - nw + 2, top + 16), V(120 - nw + 5, top + 26)), pal);
    return o;
  }

  /* ---------------- chest / abs (left half, mirrored) ---------------- */
  function absHalf(P, pal) {
    var t = P.t, top = P.pecL - 3, navel = top + (250 - top) * 0.72, o = '', i;
    var ys = [top], acc = top, wt = [0.95, 1, 1.08];
    for (i = 0; i < 3; i++) { acc += (navel - 3 - top) * wt[i] / 3.03; ys.push(acc); }
    P.navel = navel; P.absTop = top;
    var ink = t < 5 ? pal.deep : INK, iw = -(0.7 + t * 0.2), sh = '', hl = '', ln = '';
    var rows = t >= 3 ? 3 : 2;
    for (i = 0; i < rows; i++) {
      var y0 = ys[i], y1 = ys[i + 1], hh = y1 - y0, xi = 118, xo = 120 - (P.abW - i * 1.3), mid = (xi + xo) / 2, bw = 1.6 + t * 0.22;
      if (t >= 3) { // angular L-shaped bevel (bottom + outer side) in shade, sharp glint on top; ink only on the shadow edge
        sh += M(V(xi, y1 + 0.4)) + L(V(xo + 0.5, y1)) + L(V(xo - 0.3, y0 + hh * 0.18)) + L(V(xo + bw, y0 + hh * 0.34)) + L(V(xo + bw + 1, y1 - hh * 0.3)) + L(V(xi - 0.4, y1 - hh * 0.2)) + 'Z';
        hl += lensUp(V(xi - 2, y0 + 2.6), V(xo + 3 + bw, y0 + 2.2), 1.5 + t * 0.12, 0.2);
      }
      ln += brush(V(xi + 0.3, y1), V(mid + 3, y1 + 1.6), V(mid - 2, y1 + 1.2), V(xo - 0.4, y1 - 1.6), iw);
    }
    var xa = 120 - P.abW;
    if (t >= 3) ln += brush(V(xa + 1, top + 3), V(xa - 2, top + 22), V(xa - 1.5, navel - 14), V(xa + 4, navel + 8), 0.9 + t * 0.12);
    if (t >= 4) { // lower abs fade into the V-taper
      ln += brush(V(120 - P.ww + 2.5, 226), V(120 - P.ww + 6, 246), V(120 - 16, 256), V(120 - 8, 263), t >= 6 ? 1.7 : 1.1);
    }
    o += pth(sh, F(pal.shade, t === 3 ? 0.75 : t >= 4 && t < 6 ? 0.9 : 1));
    if (hl) o += pth(hl, F(pal.hi));
    o += pth(ln, F(ink, t === 2 ? 0.5 : t < 5 ? 0.75 : 0.9));
    if (t >= 4) { // serratus
      var sr = '';
      for (i = 0; i < 3; i++) {
        var y = P.pecL - 1 + i * 8, x0 = 120 - (P.abW + 9 + i * 1.5), x1 = 120 - (Math.min(P.latW, P.sw + 4) - 5 - i * 2.5);
        sr += lensUp(V(x0, y + 5), V(x1, y - 4), 3 + t * 0.1, 0.4);
      }
      o += pth(sr, F(pal.shade));
    }
    return o;
  }
  function chest(P, pal) {
    var t = P.t, shY = P.shY, sw = P.sw, dR = P.dR, low = P.pecL, flex = P.pose === 'flex', h = absHalf(P, pal), o;
    function X(dx, y) { return V(120 - dx, y); }
    var S2 = X(sw - dR * 0.2 + (flex ? 3 : 0), flex ? shY + dR + 2 : low - 12), S3 = X(sw * 0.6, low + 1), S4 = X(1.6, low - 5 - t * 0.25);
    var a1 = X(sw * 0.16, S4.y + 1.2), a2 = X(sw * 0.4, low + 1.6), b1 = X(sw * 0.86, low + 0.6), b2 = V(S2.x + 1.5, S2.y + 10);
    var edge = M(S4) + C(a1, a2, S3) + C(b1, b2, S2);
    function back(k0, k1, k2) { return C(V(b2.x, b2.y + k0), V(b1.x, b1.y + k1), V(S3.x, S3.y + k1)) + C(V(a2.x, a2.y + k1), V(a1.x, a1.y + k2), S4) + 'Z'; }
    var cs = 1.5 + t * 0.7, ks = 2 + t * 0.6, iw = 0.9 + t * 0.2;
    h += pth(edge + back(cs * 0.4, cs, cs * 0.3), F(pal.deep, 0.3 + t * 0.045));             // cast shadow under the pec
    h += pth(edge + back(-ks * 0.9, -ks, -ks * 0.3), F(pal.shade));                           // pec underside
    h += pth(lensUp(X(6, shY + 15 + t * 0.3), X(sw - dR * 0.7, shY + 9), 3.5 + t * 0.4, 1), F(pal.hi));
    if (t >= 6) h += pth(M(X(sw * 0.22, shY + 27)) + Q(X(sw * 0.5, shY + 25), X(sw * 0.74, shY + 15)) + M(X(sw * 0.3, shY + 36)) + Q(X(sw * 0.6, shY + 34), X(sw * 0.8, shY + 22)), SK(1.1, pal.shade, 0.85));
    h += pth(edge + back(iw * 0.4, iw, iw * 0.15), F(INK, t < 4 ? 0.8 : 1));                   // tapered ink only on the lower edge
    h += pth(M(X(5, shY + 7)) + Q(X(sw * 0.45, shY + 3 - t * 0.2), X(sw - dR * 0.5, shY + 2)), SK(1.1, pal.deep, t < 5 ? 0.8 : 0.5));
    o = mirror(h);
    if (t >= 3) o += pth(brush(V(120, shY + 13), V(119.4, shY + 26), V(119.4, low - 16), V(120, low - 8), 0.6 + t * 0.08), F(pal.deep, 0.8));
    o += pth(brush(V(120, P.absTop + 1), V(119.3, P.absTop + 18), V(119.3, P.navel - 18), V(120, P.navel - 3), 0.8 + t * 0.12), F(t < 5 ? pal.deep : INK, t === 2 ? 0.5 : 0.85));
    var nv = P.navel;
    o += pth(M(V(118, nv)) + Q(V(120, nv - 2.5), V(122, nv)) + Q(V(120, nv + 4), V(118, nv)) + 'Z', FS(pal.deep, 1));
    return o;
  }
  function scar(a, b, n, k) {
    var d = M(a) + Q(V((a.x + b.x) / 2 + (b.y - a.y) * 0.08, (a.y + b.y) / 2 - (b.x - a.x) * 0.08), b), st = '';
    var dv = unit(sub(b, a)), nn = V(-dv.y * 2.6 * k, dv.x * 2.6 * k);
    for (var i = 1; i <= n; i++) { var c = lerpP(a, b, i / (n + 1)); st += M(sub(c, nn)) + L(add(c, nn)); }
    return pth(d, SK(3.4 * k, '#7c2d24', 0.85)) + pth(d, SK(1.5 * k, '#f2b8a2')) + (st ? pth(st, SK(0.9 * k, '#7c2d24')) : '');
  }
  function bodyScars(P) {
    var t = P.t; if (t < 7) return '';
    var o = scar(V(120 - P.sw * 0.7, P.shY + 16), V(120 + P.sw * 0.42, P.pecL + 20), t >= 8 ? 5 : 3, 1);
    if (t >= 9) for (var i = 0; i < 3; i++) o += scar(V(120 + P.sw * 0.3 + i * 5, P.shY + 14 + i * 2), V(120 + P.sw * 0.62 + i * 5, P.shY + 34 + i * 2), 0, 0.7);
    return o;
  }

  /* ---------------- tank top (tiers 0-1) ---------------- */
  function tank(P) {
    var t = P.t, shY = P.shY, nw = P.nw, sw = P.sw, tr = P.trap;
    var c = t === 0 ? { b: '#9a9ca3', s: '#6f7179', h: '#c4c6cc' } : { b: '#f1f1ef', s: '#c3c4c8', h: '#ffffff' };
    var h = [V(120, shY + 22 - t * 2),
      [V(120 - 8, shY + 22 - t * 2), V(120 - nw - 1, shY + 6), V(120 - nw - 2, shY - tr + 1)],
      [V(120 - nw - 6, shY - tr + 1.5), V(120 - nw - 9, shY - tr + 2), V(120 - nw - 10, shY - tr + 3)],
      [V(120 - nw - 9, shY + 16), V(120 - sw + 10, shY + 30), V(120 - P.latW + 1, shY + 36)],
      [V(120 - P.latW, shY + 70), V(120 - P.ww - 2, 230), V(120 - P.ww - 3, 262)],
      [V(120 - P.ww, 266), V(120 - 10, 266), V(120, 266)]];
    var k = def(symPath(h)), o = '';
    o += U(k, F(c.s));
    o += '<g clip-path="url(#' + P.torsoClip + ')">' + U(k, F(c.b) + ' transform="translate(-8 -2)"') + '</g>';
    o += pth(M(V(104, 175)) + Q(V(112, 190), V(110, 214)) + M(V(134, 182)) + Q(V(128, 205), V(132, 230)) + M(V(112, 236)) + Q(V(120, 246), V(116, 258)), SK(1.3, c.s));
    o += pth(lensUp(V(102, shY + 30), V(116, shY + 26), 3, 0.5), F(c.h));
    o += U(k, SK(2.6));
    o += pth(M(V(104, shY + 40 + t * 2)) + Q(V(112, shY + 44 + t * 2), V(118, shY + 40)) + M(V(122, shY + 40)) + Q(V(128, shY + 44 + t * 2), V(136, shY + 40 + t * 2)), SK(1.1, c.s));
    return o;
  }
  function towel(P) {
    var nw = P.nw, shY = P.shY, tr = P.trap, o = '', d = '', sh = '', st = '';
    for (var s = -1; s <= 1; s += 2) {
      var p = function (dx, y) { return V(120 + s * dx, y); };
      d += M(p(nw - 0.5, shY - tr - 1)) + Q(p(nw + 6, shY - tr - 3), p(nw + 13, shY - tr + 4)) + C(p(nw + 12, shY + 4), p(nw + 10, shY + 14), p(nw + 9.5, shY + 22)) +
        L(p(nw + 9, 184)) + Q(p(nw + 2, 188), p(nw - 5, 186)) + L(p(nw - 4.5, shY + 18)) + C(p(nw - 4.5, shY + 8), p(nw - 2, shY - tr + 4), p(nw - 0.5, shY - tr - 1)) + 'Z';
      if (s > 0) sh += M(p(nw + 3, shY + 10)) + L(p(nw + 9.5, shY + 22)) + L(p(nw + 9, 184)) + Q(p(nw + 6, 186), p(nw + 3, 186.5)) + 'Z';
      else sh += M(p(nw - 4.5, shY + 18)) + L(p(nw - 4.5, 186)) + L(p(nw - 1.5, 186.8)) + L(p(nw - 1.5, shY + 14)) + 'Z';
      st += M(p(nw - 4.5, 174)) + L(p(nw + 9, 173)) + M(p(nw - 4.5, 178.5)) + L(p(nw + 9, 177.5));
    }
    var k = def(d);
    o += U(k, F('#10b981')) + pth(sh, F('#047857')) + pth(st, SK(1.6, '#d1fae5')) + U(k, SK(2.3));
    o += pth(M(V(120 - nw - 2, shY - tr + 2)) + Q(V(120 - nw - 6, shY + 6), V(120 - nw - 7, shY + 20)) + M(V(120 + nw + 8, shY - tr + 4)) + Q(V(120 + nw + 5, shY + 8), V(120 + nw + 6, shY + 20)), SK(1, '#047857'));
    return o;
  }

  /* ---------------- pants & champion belt ---------------- */
  function pants(P, Fr, id) {
    var ww = P.ww, o = '', t = P.t, top = 255;
    o += pth(M(V(120 - ww - 4, top)) + Q(V(120, top + 7), V(120 + ww + 4, top)) + L(V(120 + ww + 14, 345)) + L(V(120 - ww - 14, 345)) + 'Z', FS('#1b1b20', 2.6));
    o += pth(M(V(120 + ww - 6, top + 10)) + L(V(120 + ww + 3, top + 6)) + L(V(120 + ww + 14, 345)) + L(V(120 + 14, 345)) + Q(V(120 + ww - 2, 285), V(120 + ww - 6, top + 10)) + 'Z', F('#0e0e11'));
    o += pth(lens(V(120 - ww + 2, top + 16), V(120 - ww - 5, 310), 3, -1), F('#3f3f46'));
    o += pth(M(V(120 - 4, 277)) + Q(V(110, 290), V(103, 312)) + M(V(120 + 8, 280)) + Q(V(128, 293), V(135, 314)) + M(V(120 - ww, 274)) + Q(V(120 - ww + 4, 288), V(120 - ww - 3, 306)), SK(1.3, '#4b4b55'));
    if (t < 5) {
      o += pth(M(V(120 - ww - 4, top)) + Q(V(120, top + 7), V(120 + ww + 4, top)) + L(V(120 + ww + 5, top + 9)) + Q(V(120, top + 16), V(120 - ww - 5, top + 9)) + 'Z', FS('#26262c', 2.2));
      o += pth(M(V(120 - ww - 4.5, top + 4.5)) + Q(V(120, top + 11.5), V(120 + ww + 4.5, top + 4.5)), SK(2, t >= 2 ? P.band[0] : '#52525b'));
      var cord = M(V(117, top + 11)) + Q(V(113, top + 20), V(115, top + 30)) + M(V(123, top + 11)) + Q(V(126, top + 21), V(124, top + 32));
      o += pth(cord, SK(3.2)) + pth(cord, SK(1.6, '#e7e5e4'));
      return o;
    }
    // champion belt: leather band with metal trim, a plate that grows and a tier-coloured gem; side tabs from 8
    o += pth(M(V(120 - ww - 5, top - 1)) + Q(V(120, top + 6), V(120 + ww + 5, top - 1)) + L(V(120 + ww + 6, top + 12)) + Q(V(120, top + 19), V(120 - ww - 6, top + 12)) + 'Z', FS('#201a17', 2.2));
    o += pth(M(V(120 - ww - 5, top + 2)) + Q(V(120, top + 9), V(120 + ww + 5, top + 2)) + M(V(120 - ww - 5.5, top + 9.5)) + Q(V(120, top + 16.5), V(120 + ww + 5.5, top + 9.5)), SK(1.2, Fr.m[1], 0.85));
    var pw = 12 + (t - 5) * 1.9, ph = 9 + (t - 5) * 0.8, cy = top + 8;
    if (t >= 8) o += pth(M(V(120 - pw - 11, cy - ph * 0.5)) + L(V(120 - pw + 2, cy - ph * 0.75)) + L(V(120 - pw + 2, cy + ph * 0.75)) + L(V(120 - pw - 11, cy + ph * 0.5)) + L(V(120 - pw - 6, cy)) + 'Z' +
      M(V(120 + pw + 11, cy - ph * 0.5)) + L(V(120 + pw - 2, cy - ph * 0.75)) + L(V(120 + pw - 2, cy + ph * 0.75)) + L(V(120 + pw + 11, cy + ph * 0.5)) + L(V(120 + pw + 6, cy)) + 'Z', FS(Fr.m[2], 1.2));
    function oct(w, h) { return M(V(120 - w, cy - h * 0.55)) + L(V(120 - w * 0.62, cy - h)) + L(V(120 + w * 0.62, cy - h)) + L(V(120 + w, cy - h * 0.55)) + L(V(120 + w, cy + h * 0.55)) + L(V(120 + w * 0.62, cy + h)) + L(V(120 - w * 0.62, cy + h)) + L(V(120 - w, cy + h * 0.55)) + 'Z'; }
    o += pth(oct(pw, ph), 'fill="url(#' + id + 'mt)" stroke="' + INK + '" stroke-width="1.6"');
    o += pth(oct(pw - 3, ph - 2.6), SK(1, Fr.m[0], 0.8));
    var gr = 3.2 + (t - 5) * 0.4;
    o += '<circle cx="120" cy="' + N(cy) + '" r="' + N(gr) + '" ' + FS(Fr.glow, 1) + '/>' + ell(V(120 - gr * 0.35, cy - gr * 0.35), gr * 0.32, gr * 0.32, F('#fff', 0.8));
    return o;
  }

  /* ---------------- hands ---------------- */
  function wrapBand(W, d, n, r, len, col) {
    var A = add(W, mul(d, -len)), q = limb(A, W, r * 1.06, r * 1.04, { capA: 0.1, capB: 0.12 }), ln = '';
    for (var i = 1; i < 3; i++) {
      var c = add(A, mul(d, len * i / 3));
      ln += M(add(c, mul(n, r))) + L(add(add(c, mul(d, -3)), mul(n, -r)));
    }
    return pth(q.d, FS(col[0], 2.1)) + pth(ln, SK(1, col[1]));
  }
  /* hanging clenched fist, thumb side toward viewer; W = wrist, s = side */
  function fistHang(W, r, s, pal) {
    var w = Math.max(r * 2.5, 15), h = w * 1.1, x = W.x, y = W.y - 2;
    function p(u, v) { return V(x + s * u, y + v); }
    var body = M(p(-w * 0.42, 0)) + C(p(-w * 0.58, h * 0.4), p(-w * 0.52, h * 0.95), p(-w * 0.1, h)) +
      C(p(w * 0.3, h * 1.04), p(w * 0.58, h * 0.8), p(w * 0.55, h * 0.45)) + C(p(w * 0.53, h * 0.15), p(w * 0.48, 0), p(w * 0.4, 0)) + 'Z';
    var o = pth(body, F(pal.base));
    o += pth(lens(p(w * 0.55, h * 0.25), p(-w * 0.15, h * 1.0), s * w * 0.28, 0), F(pal.shade));
    var fg = '';
    for (var i = 0; i < 3; i++) {
      var yy = h * (0.5 + i * 0.16);
      fg += M(p(w * 0.56, yy)) + Q(p(w * 0.3, yy + 1.2), p(w * 0.12, yy - 0.5));
    }
    var thumb = M(p(-w * 0.5, h * 0.18)) + C(p(-w * 0.15, h * 0.2), p(w * 0.2, h * 0.32), p(w * 0.16, h * 0.5)) +
      C(p(w * 0.1, h * 0.62), p(-w * 0.3, h * 0.55), p(-w * 0.54, h * 0.5)) + 'Z';
    o += pth(body, SK(2.4));
    o += pth(fg, SK(1.2));
    o += pth(thumb, FS(pal.base, 1.6));
    o += pth(lensUp(p(-w * 0.42, h * 0.27), p(w * 0.05, h * 0.36), 1.6, 0), F(pal.hi));
    o += pth(M(p(-w * 0.45, h * 0.62)) + Q(p(-w * 0.1, h * 0.88), p(w * 0.12, h * 0.68)), SK(1.2));
    return o;
  }
  function handOpen(W, r, s, pal) {
    var x = W.x, y = W.y - 2;
    function p(u, v) { return V(x + s * u, y + v); }
    var w = Math.max(r * 2.3, 12.5), h = w * 1.85;
    var d = M(p(-w * 0.42, 0)) + C(p(-w * 0.62, h * 0.3), p(-w * 0.5, h * 0.82), p(-w * 0.12, h)) +
      C(p(w * 0.18, h * 1.06), p(w * 0.5, h * 0.8), p(w * 0.56, h * 0.48)) + C(p(w * 0.6, h * 0.2), p(w * 0.52, 0), p(w * 0.42, 0)) + 'Z';
    var o = pth(d, F(pal.base));
    o += pth(lens(p(w * 0.55, h * 0.2), p(-w * 0.12, h), s * w * 0.3, 0), F(pal.shade));
    o += pth(d, SK(2.3));
    o += pth(M(p(-w * 0.12, h * 0.5)) + Q(p(-w * 0.02, h * 0.78), p(-w * 0.08, h * 0.96)) + M(p(w * 0.16, h * 0.52)) + Q(p(w * 0.26, h * 0.78), p(w * 0.2, h * 0.95)), SK(1.1));
    o += pth(M(p(-w * 0.44, h * 0.18)) + Q(p(-w * 0.66, h * 0.48), p(-w * 0.32, h * 0.7)), SK(1.4));
    return o;
  }
  /* raised fist (front): W wrist, d forearm direction (up), s side */
  function fistRaised(W, d, r, s, pal) {
    var n = V(-d.y, d.x), inn = (n.x * -s) > 0 ? 1 : -1;
    var w = r * 2.6, h = r * 2.35;
    function p(u, v) { return add(add(W, mul(d, v)), mul(n, u * inn)); } // u>0 toward the head
    var tops = [h * 0.93, h * 1.0, h * 0.97, h * 0.86];
    var us = [w * 0.5, w * 0.25, 0, -w * 0.25, -w * 0.5];
    var body = M(p(-w * 0.4, -1)) + C(p(-w * 0.52, h * 0.2), p(-w * 0.56, h * 0.5), p(-w * 0.5, h * 0.66));
    for (var i = 3; i >= 0; i--) {
      var ua = us[i + 1], ub = us[i], tp = tops[i];
      body += C(p(ua, tp + 0.5), p(lerp(ua, ub, 0.15), tp + 3), p((ua + ub) / 2, tp + 3)) + C(p(lerp(ua, ub, 0.85), tp + 3), p(ub, tp + 0.5), p(ub, tp - 2.5));
    }
    body += C(p(w * 0.56, h * 0.45), p(w * 0.5, h * 0.2), p(w * 0.4, -1)) + 'Z';
    var fk = def(body), o = U(fk, F(pal.base));
    fistRaised.k = fk;
    var shd = s > 0 ? lens(p(-w * 0.5, h * 0.8), p(-w * 0.35, -0.5), -w * 0.28 * (inn > 0 ? 1 : -1), 0) : lens(p(w * 0.52, h * 0.75), p(w * 0.35, -0.5), w * 0.25 * (inn > 0 ? -1 : 1), 0);
    o += pth(shd, F(pal.shade));
    var lines = '';
    for (i = 1; i < 4; i++) lines += M(p(us[i], tops[i] - 1.5)) + L(p(us[i], h * 0.62));
    o += pth(lines, SK(1.2));
    var th = M(p(w * 0.52, h * 0.5)) + C(p(w * 0.3, h * 0.66), p(-w * 0.05, h * 0.66), p(-w * 0.22, h * 0.6)) +
      C(p(-w * 0.32, h * 0.52), p(-w * 0.2, h * 0.42), p(0, h * 0.42)) + C(p(w * 0.2, h * 0.42), p(w * 0.4, h * 0.36), p(w * 0.5, h * 0.3)) + 'Z';
    o += pth(th, FS(pal.base, 1.6));
    var kh = lens(p(w * 0.3, h * 0.6), p(-w * 0.1, h * 0.6), 1.6, 0);
    for (i = 0; i < 4; i++) kh += lens(p(lerp(us[i + 1], us[i], 0.25), tops[i] - 2.5), p(lerp(us[i + 1], us[i], 0.75), tops[i] - 2), 1.6, 0);
    o += pth(kh, F(pal.hi));
    o += U(fk, SK(2.5));
    return o;
  }
  /* hand gripping the opposite biceps (crossed arms): back of the hand and four curled fingers */
  function gripHand(Wr, d, r, pal, id) {
    var n = V(-d.y, d.x), hw = r * 0.98, hl = r * 0.8, fh = hw * 0.5;
    function p(u, v) { return add(add(Wr, mul(d, u)), mul(n, v)); }
    var fl = [0.85, 1.02, 0.98, 0.8], dd = M(p(-1, -hw)) + Q(p(hl * 0.5, -hw * 1.12), p(hl, -hw)), ln = '', kn = '';
    for (var i = 0; i < 4; i++) {
      var v0 = -hw + i * fh, v1 = v0 + fh, e = hl + r * fl[i];
      dd += L(p(e, v0)) + C(p(e + fh * 0.62, v0), p(e + fh * 0.62, v1), p(e - 0.4, v1));
      if (i) ln += M(p(hl * 0.55, v0)) + L(p(hl + r * Math.min(fl[i], fl[i - 1]) - 0.5, v0));
      kn += lens(p(hl - 1, v0 + fh * 0.25), p(hl + r * fl[i] * 0.7, v0 + fh * 0.2), 1.3, 0);
    }
    dd += Q(p(hl * 0.5, hw * 1.15), p(-1, hw)) + 'Z';
    var o = cel(id + 'gh', dd, pal, -1.5, -2.6);
    return o + pth(kn, F(pal.hi)) + pth(ln, SK(1.2)) + U(cel.k, SK(2.3));
  }

  /* ---------------- veins ---------------- */
  function veinsOn(lb, P, pal, side, a0, a1) {
    if (P.t < 6) return '';
    var k = side, m = (a0 + a1) / 2;
    var d = M(lb.at(a0, k * 2)) + Q(lb.at((a0 * 3 + a1) / 4, k * 3.5), lb.at(m, k * -1)) + Q(lb.at((a0 + a1 * 3) / 4, k * -3.5), lb.at(a1, k * 1));
    if (P.t >= 7) d += M(lb.at(m, k * -1)) + Q(lb.at(m + 0.08, k * 2.5), lb.at(m + 0.22, k * 4.5));
    if (P.t >= 9) d += M(lb.at(a0 + 0.08, k * 2.6)) + Q(lb.at(a0 + 0.02, k * -2), lb.at(Math.max(0.05, a0 - 0.1), k * -4));
    return veinPath(d, pal);
  }
  function veinPath(d, pal) { var k = def(d); return U(k, SK(2.2, pal.deep, 0.8)) + U(k, SK(0.8, pal.hi, 0.9) + ' transform="translate(-.6 -.6)"'); }

  /* ---------------- arms: hanging / clenched ---------------- */
  function upperArmSil(P, s, sp, yE) {
    // continuous deltoid cap + upper arm silhouette, hanging down
    var sw = P.sw, dR = P.dR, shY = P.shY, aR = P.armR;
    function p(dx, y) { return V(120 + s * dx, y); }
    var pitY = shY + dR * 1.5 + 8, insY = shY + dR * 2.55;
    var dTop = sw - dR * 0.85, dOut = sw + dR * 1.02 + 0.5, dIns = sw + sp * 0.3 + aR * 0.84, triY = (insY + yE) / 2 + 2, dTri = sw + sp * 0.6 + aR * 1.1;
    var dEo = sw + sp + aR * 0.66, dEi = sw + sp - aR * 0.64, biY = (pitY + yE) / 2 + 4, dBi = sw + sp * 0.4 - aR * 1.06, dPit = sw - aR * 0.8 + 0.5;
    var outer = M(p(dTop, shY + 0.5)) + C(p(sw - dR * 0.15, shY - dR * 0.58), p(sw + dR * 0.95, shY - dR * 0.08), p(dOut, shY + dR * 0.95)) +
      C(p(dOut + 0.2, shY + dR * 1.6), p(dIns + 1.5, insY - dR * 0.35), p(dIns, insY)) +
      C(p(dIns + 0.3, insY + 6), p(dTri, triY - 12), p(dTri, triY)) + C(p(dTri, triY + 12), p(dEo + 0.3, yE - 9), p(dEo, yE));
    var inner = C(p(dEi - 1.5, yE - 8), p(dBi, biY + 12), p(dBi, biY)) + C(p(dBi, biY - 10), p(dPit - 0.5, pitY + 8), p(dPit, pitY));
    var front = C(p(dPit - 0.5, pitY - 7), p(sw - dR * 1.05, shY + dR * 0.6), p(dTop, shY + 0.5));
    return { outer: outer, inner: inner, front: front, p: p, insY: insY, pitY: pitY, dIns: dIns, dPit: dPit, dEo: dEo, dEi: dEi, dTri: dTri, triY: triY };
  }
  function deltDetail(P, pal, Ua, s) {
    var sw = P.sw, dR = P.dR, shY = P.shY, p = Ua.p;
    var o = pth(lens(p(Ua.dIns, Ua.insY), p(sw - dR * 0.55, shY + dR * 1.15), s * (2.5 + dR * 0.12), 0), F(pal.shade));
    o += pth(lensUp(p(sw - dR * 0.45, shY + dR * 0.25), p(sw + dR * 0.7, shY + dR * 0.45), dR * 0.36, dR * 0.04), F(pal.hi));
    return o + ell(p(sw + dR * 0.2, shY + dR * 0.6), dR * 0.55, dR * 0.4, F(pal.hi, 0.3));
  }
  function armLines(P, Ua, sp, yE, tri) { // delt border, biceps/triceps split
    var sw = P.sw, dR = P.dR, shY = P.shY, aR = P.armR, p = Ua.p;
    return M(p(Ua.dIns, Ua.insY)) + Q(p(sw + dR * 0.1, shY + dR * 1.9), p(sw - dR * 0.55, shY + dR * 1.15)) +
      M(p(sw - aR * 0.2, Ua.insY - 2)) + Q(p(sw + sp * 0.4 - aR * 0.45, (Ua.insY + yE) / 2), p(Ua.dEi + aR * 0.35, yE - 4)) +
      (tri ? M(p(Ua.dIns - aR * 0.35, Ua.insY + 5)) + Q(p(Ua.dTri - aR * 0.5, Ua.triY + 3), p(Ua.dEo - aR * 0.3, yE - 3)) : '');
  }
  function armHang(P, pal, id, s) {
    var sw = P.sw, dR = P.dR, shY = P.shY, aR = P.armR, fR = P.foreR, t = P.t, fist = P.pose === 'fist';
    var sp = fist ? 3 + t * 0.9 : 1.5, yE = 196, yW = 243;
    var Ua = upperArmSil(P, s, sp, yE), p = Ua.p;
    var dFo = sw + sp + fR * 1.45, dWo = sw + sp + 1.5 + fR * 0.66, dWi = sw + sp + 1.5 - fR * 0.66, dFi = sw + sp - fR * 1.12;
    var fore = C(p(Ua.dEo + 0.8, yE + 4), p(dFo, yE + 7), p(dFo, yE + 14)) + C(p(dFo, yE + 26), p(dWo + 0.8, yW - 14), p(dWo, yW));
    var foreIn = C(p(dWi - 0.8, yW - 14), p(dFi, yE + 28), p(dFi, yE + 16)) + C(p(dFi, yE + 9), p(Ua.dEi - 0.6, yE + 6), p(Ua.dEi, yE - 3));
    var o = cel(id + 'a' + (s < 0 ? 'l' : 'r'), Ua.outer + fore + L(p(dWi, yW)) + foreIn + Ua.inner + Ua.front + 'Z', pal, R(-3.5 - aR * 0.22), -2);
    if (t >= 2) o += deltDetail(P, pal, Ua, s);
    else o += pth(lensUp(p(sw - dR * 0.45, shY + dR * 0.3), p(sw + dR * 0.65, shY + dR * 0.5), dR * 0.36, dR * 0.04), F(pal.hi));
    var lines = t >= 2 ? armLines(P, Ua, sp, yE, t >= 3) + M(p(Ua.dEi + 1, yE)) + Q(p(sw + sp, yE + 3), p(sw + sp + 3, yE + 1)) : '';
    if (t >= 3) lines += M(p(Ua.dEo - 1, yE + 6)) + Q(p(sw + sp + fR * 0.5, yE + 22), p(sw + sp + 1, yW - 12));
    if (lines) o += pth(lines, SK(1.3, INK, 0.75));
    o += pth(M(p(Ua.dPit, Ua.pitY)) + Ua.front, SK(1.6, INK, 0.85));
    o += pth(Ua.outer + fore + M(p(dWi, yW)) + foreIn + Ua.inner, SK(2.6));
    var W = p(sw + sp + 1.5, yW);
    if (fist) {
      o += wrapBand(add(W, V(0, 1)), V(0, 1), V(-1, 0), fR * 0.75, 11, P.wrap);
      o += fistHang(add(W, V(0, 2)), fR, s, pal);
    } else {
      if (t === 1) o += wrapBand(add(W, V(0, 1)), V(0, 1), V(-1, 0), fR * 0.8, 7, ['#10b981', '#047857']);
      o += handOpen(W, fR, s, pal);
    }
    return o;
  }

  /* ---------------- arms: crossed under the pecs ---------------- */
  function upperArmCross(P, pal, id, s, yE) {
    var sw = P.sw, dR = P.dR, shY = P.shY, aR = P.armR, t = P.t, sp = -3;
    var Ua = upperArmSil(P, s, sp, yE), p = Ua.p;
    var dEc = sw + sp, ecY = yE + aR * 0.55;
    var cap = C(p(Ua.dEo + 0.5, yE + aR * 0.4), p(dEc + aR * 0.4, ecY + 1), p(dEc, ecY)) + C(p(dEc - aR * 0.45, ecY + 0.5), p(Ua.dEi - 0.5, yE + aR * 0.4), p(Ua.dEi, yE));
    var o = cel(id + 'a' + (s < 0 ? 'l' : 'r'), Ua.outer + cap + Ua.inner + Ua.front + 'Z', pal, R(-3.5 - aR * 0.22), -2);
    o += deltDetail(P, pal, Ua, s);
    var lines = armLines(P, Ua, sp, yE, 1) + M(p(sw + dR * 0.1, shY + dR * 0.35)) + Q(p(sw + dR * 0.38, shY + dR * 1.2), p(sw + dR * 0.25, shY + dR * 2.0));
    o += pth(lines, SK(1.3, INK, 0.75));
    if (t >= 6) o += veinPath(M(p(Ua.dTri - aR * 0.9, Ua.insY + 8)) + Q(p(Ua.dTri - aR * 1.3, Ua.triY), p(Ua.dTri - aR * 0.9, Ua.triY + 12)) + Q(p(Ua.dTri - aR * 1.1, yE - 10), p(Ua.dTri - aR * 1.4, yE - 2)), pal);
    o += pth(M(p(Ua.dPit, Ua.pitY)) + Ua.front, SK(1.6, INK, 0.85));
    o += pth(Ua.outer + cap + Ua.inner, SK(2.6));
    return o;
  }
  function armsCross(P, pal, id) {
    var sw = P.sw, fR = P.foreR, aR = P.armR, o = '', yE = 198;
    var ER = V(120 + sw - 3, yE + 8), WB = V(120 - sw + 6, 171);
    var EL = V(120 - sw + 3, yE + 6), WF = V(120 + sw - aR * 0.55, 177);
    var fb = limb(ER, WB, fR * 1.1, fR * 0.86, { b1: fR * 0.25, t1: 0.3, b2: fR * 0.3, t2: 0.25, capA: 0.9 });
    var ff = limb(EL, WF, fR * 1.15, fR * 0.86, { b1: fR * 0.22, t1: 0.3, b2: fR * 0.38, t2: 0.25, capA: 0.9 });
    o += upperArmCross(P, pal, id, 1, yE);
    o += drawLimb(fb, pal) + veinsOn(fb, P, pal, -1, 0.2, 0.55);
    o += upperArmCross(P, pal, id, -1, yE);
    o += drawLimb(ff, pal) + veinsOn(ff, P, pal, -1, 0.25, 0.7);
    o += pth(M(ff.at(0.12, -fR * 0.4)) + Q(ff.at(0.35, -fR * 0.75), ff.at(0.6, -fR * 0.55)), SK(1.2, INK, 0.7));
    o += wrapBand(WF, ff.dir, ff.n, fR * 0.88, 9, P.wrap);
    o += gripHand(add(WF, mul(ff.dir, 1)), ff.dir, fR, pal, id);
    return o;
  }

  /* ---------------- arms: front double biceps ---------------- */
  function armFlex(P, pal, id, s) {
    var sw = P.sw, dR = P.dR, shY = P.shY, aR = P.armR, fR = P.foreR, t = P.t, o = '';
    function p(q) { return V(120 + s * q.x, q.y); }   // arm-space (x = outward) -> screen
    var J = V(sw - dR * 0.3, shY + dR * 0.25), E = V(J.x + 42 + (t - 8) * 1.5, shY - 2);
    var dv = sub(E, J), len = Math.sqrt(dv.x * dv.x + dv.y * dv.y), u = unit(dv), n = V(u.y, -u.x);
    function A(k, off) { return add(add(J, mul(u, len * k)), mul(n, off)); }
    function pt(a, b, c) { return add(a, add(mul(u, b), mul(n, c))); }
    function lz(a, b, b1, b2) { var m = mul(add(a, b), 0.5), d = unit(sub(b, a)), nn = V(-d.y, d.x); return M(p(a)) + Q(p(add(m, mul(nn, b1))), p(b)) + Q(p(add(m, mul(nn, b2))), p(a)) + 'Z'; }
    var T0 = V(sw - dR * 0.9, shY + 1), D = V(sw - dR * 0.12, shY - dR * 0.72);
    var G = A(0.23, aR * 0.78), BP = A(0.41, aR * 1.5), EC = A(0.86, aR * 0.82), ET = pt(E, fR * 1.05, -fR * 0.35);
    var TR = A(0.56, -aR * 1.12), PIT = V(sw - dR * 0.05, shY + dR + 5);
    var seg = [
      [V(T0.x + dR * 0.1, T0.y - dR * 0.6), V(D.x - dR * 0.62, D.y), D],                  // deltoid cap
      [V(D.x + dR * 0.55, D.y), pt(G, -aR * 0.35, aR * 0.45), G],                          // delt/biceps notch
      [pt(G, aR * 0.22, aR * 0.3), pt(BP, -aR * 0.62, -aR * 0.02), BP],                    // biceps peak
      [pt(BP, aR * 0.6, 0), pt(EC, -aR * 0.4, aR * 0.55), EC],
      [pt(EC, fR * 0.4, 0), pt(ET, 0, fR * 0.6), ET],                                      // elbow
      [pt(ET, 0, -fR * 0.9), pt(TR, aR * 0.95, 0), TR],                                    // triceps sag
      [pt(TR, -aR * 0.9, 0), V(PIT.x + dR * 0.45, PIT.y + 1), PIT],
      [V(PIT.x - dR * 0.35, PIT.y - dR * 0.3), V(sw - dR, shY + dR * 0.55), T0]];
    var d = M(p(T0));
    seg.forEach(function (c) { d += C(p(c[0]), p(c[1]), p(c[2])); });
    o += cel(id + 'a' + (s < 0 ? 'l' : 'r'), d + 'Z', pal, R(-3 - aR * 0.2), -3);
    var armK = cel.k; P.rimK.push(armK);
    o += rim(P);
    // clipped form shading: triceps underside, delt underside
    o += '<g clip-path="url(#' + cel.c + ')">' + pth(lz(PIT, ET, aR * 1.5, aR * 0.42) + lz(T0, G, aR * 0.05, -dR * 0.5), F(pal.shade)) + '</g>';
    o += pth(M(p(pt(G, 0.5, -2.5))) + Q(p(pt(G, -aR * 0.1, -aR * 0.75)), p(V(sw + dR * 0.05, shY + dR * 0.85))) + M(p(A(0.3, -aR * 0.15))) + Q(p(A(0.6, -aR * 0.42)), p(A(0.86, -aR * 0.28))), SK(1.3, INK, 0.75));
    o += pth(lensUp(p(V(sw - dR * 0.55, shY - dR * 0.45)), p(V(sw + dR * 0.5, shY - dR * 0.62)), dR * 0.3, dR * 0.02) +
      lensUp(p(pt(BP, -aR * 0.7, -aR * 0.3)), p(pt(BP, aR * 0.25, -aR * 0.3)), aR * 0.26, 0), F(pal.hi));
    o += ell(p(pt(BP, -aR * 0.15, -aR * 0.7)), aR * 0.6, aR * 0.4, F(pal.hi, 0.3));
    o += veinPath(M(p(A(0.3, aR * 0.15))) + Q(p(A(0.42, aR * 0.75)), p(A(0.52, aR * 0.7))) + Q(p(A(0.64, aR * 0.62)), p(A(0.74, aR * 0.2))), pal);
    o += U(armK, SK(2.7));
    // forearm (near vertical so the biceps peak stays visible) + fist
    var Ef = A(0.98, aR * 0.05), W = V(E.x - fR * 0.55, shY - 52);
    var fo = limb(p(Ef), p(W), fR * 1.12, fR * 0.8, s < 0 ? { b1: fR * 0.2, t1: 0.35, b2: fR * 0.42, t2: 0.22, capA: 1 } : { b1: fR * 0.42, t1: 0.22, b2: fR * 0.2, t2: 0.35, capA: 1 });
    o += drawLimb(fo, pal, 2.7) + veinsOn(fo, P, pal, s < 0 ? 1 : -1, 0.3, 0.72);
    P.rimK.push(drawLimb.k);
    o += wrapBand(p(W), fo.dir, fo.n, fR * 0.8, 11, P.wrap);
    o += fistRaised(add(p(W), mul(fo.dir, -0.5)), fo.dir, fR, s, pal);
    P.rimK.push(fistRaised.k);
    return o;
  }

  /* ---------------- head ---------------- */
  function faceHalf(P) {
    var jw = P.t * 0.28;
    return [V(120, 33),
      [V(106, 33), V(95.5, 41), V(95.5, 55)],
      [V(95.5, 63), V(95.8, 71), V(96.8, 78)],
      [V(97.8, 85), V(99.5 - jw, 89), V(102 - jw, 92.5)],
      [V(107 - jw * 0.6, 97.5), V(113 - jw * 0.5, 101.5), V(120, 102)]];
  }
  function hairPath(P) {
    var t = P.t, cx = 120, cy = 60, rx = 27, ry = 31;
    var up = 0.08 + t * 0.03, grow = 1 + t * 0.05;
    var sp = [[184, 9], [202, 15], [220, 19], [239, 22], [258, 24], [277, 24], [296, 22], [315, 19], [334, 15], [352, 9]];
    function ep(deg, ex) { var a = deg * Math.PI / 180; return V(cx + (rx + ex) * Math.cos(a), cy + (ry + ex) * Math.sin(a)); }
    var d = M(V(95.5, 69)) + L(ep(176, 1)), tips = [];
    for (var i = 0; i < sp.length; i++) {
      var a = sp[i][0], pa = i ? sp[i - 1][0] : 170;
      var vm = ep((a + pa) / 2 + 2, 2), ta = a + (270 - a) * up, tip = ep(ta, sp[i][1] * grow);
      tips.push([vm, tip]);
      var mid = lerpP(vm, tip, 0.5);
      d += (i ? Q(lerpP(V(cx, cy), mid, 1.0), vm) : L(vm)) + Q(add(mid, mul(unit(sub(mid, V(cx, cy))), -2.5)), tip);
      if (i === sp.length - 1) d += Q(lerpP(tip, ep(8, 1), 0.4), ep(8, 1));
    }
    var b = [[144.5, 69], [142, 56], [140.5, 66], [136, 50], [131, 62], [127, 49], [121.5, 61], [115, 49], [110, 63], [105, 51], [99, 66], [97, 58]];
    for (i = 0; i < b.length; i++) d += L(V(b[i][0], b[i][1]));
    P.hairTips = tips;
    return d + 'Z';
  }
  function head(P, pal) {
    var t = P.t, o = '', s, ear = '';
    for (s = -1; s <= 1; s += 2) {
      var ex = 120 + s * 24;
      ear += M(V(ex, 64)) + C(V(ex + s * 7, 60), V(ex + s * 9, 70), V(ex + s * 6, 77)) + C(V(ex + s * 4.5, 81), V(ex + s * 1, 83), V(ex - s * 1, 80)) + 'Z';
    }
    var ek = def(ear);
    P.rimK.push(ek, P.faceK, P.hairK);
    o += U(ek, FS(pal.base, 2.4));
    o += pth(M(V(97, 68)) + Q(V(91, 68), V(92.5, 75)) + M(V(143, 68)) + Q(V(149, 68), V(147.5, 75)), SK(1.3, pal.deep));
    o += U(P.faceK, F(pal.shade));
    o += '<g clip-path="url(#' + P.faceC + ')">' + U(P.faceK, F(pal.base) + ' transform="translate(-6 -2)"') +
      U(P.hairK, F(pal.shade) + ' transform="translate(1.5 4)"') + '</g>';
    o += pth(lensUp(V(99, 76), V(106, 82), 0, -3), F(pal.hi));
    o += U(P.faceK, SK(2.8));
    if (t >= 4) o += pth(M(V(102, 80)) + Q(V(104, 85), V(108, 87)) + M(V(138, 80)) + Q(V(136, 85), V(132, 87)), SK(1.2, INK, 0.7));
    if (t >= 7) o += pth(M(V(113, 86)) + Q(V(111, 89), V(112, 92)) + M(V(127, 86)) + Q(V(129, 89), V(128, 92)), SK(1, INK, 0.6));
    o += eyes(P, pal);
    o += pth(M(V(121, 73)) + L(V(123.5, 83)) + L(V(120, 84.5)), SK(1.5));
    o += pth(M(V(123.5, 83)) + L(V(125.5, 82)) + L(V(123, 76)) + 'Z', F(pal.shade));
    o += mouth(P, pal);
    if (t >= 2 && t <= 4) { // cheek plaster
      var c = V(133.5, 81.5), a = unit(V(1, -0.38)), bn = V(-a.y, a.x);
      var q = function (u, v) { return add(c, add(mul(a, u), mul(bn, v))); };
      o += pth(M(q(-5.5, -2.8)) + L(q(5.5, -2.8)) + L(q(5.5, 2.8)) + L(q(-5.5, 2.8)) + 'Z', FS('#f1dcc0', 1.1)) + pth(M(q(-1.6, -2.8)) + L(q(-1.6, 2.8)) + M(q(1.6, -2.8)) + L(q(1.6, 2.8)), SK(0.8, '#b8a07e'));
    }
    if (t === 7) o += scar(V(101.5, 72), V(107, 83), 0, 0.85);
    if (t >= 8) o += scar(V(100.5, 55), V(103.5, 64), 1, 0.8) + scar(V(104.5, 77), V(108, 87.5), 2, 0.8);
    return o;
  }
  function eyes(P, pal) {
    var t = P.t, o = '', s, f = t / 10, hot = t >= 8 ? t - 7 : 0;
    var h = lerp(6.4, 4.2, f), tilt = lerp(0, 3, f) + hot * 0.3, ir = lerp(3.5, 2.3, f);
    var browIn = lerp(-2, 4, f) + hot * 0.9, browOut = lerp(1, -3.5, f) - hot * 0.5;
    var whites = '', lids = '', iris = '', brows = '', lows = '', hls = '';
    for (s = -1; s <= 1; s += 2) {
      var Ie = V(120 + s * 5, 72), O = V(120 + s * 18.5, 69.5 - tilt);
      var up = C(V(Ie.x + s * 3, Ie.y - h * 0.95), V(O.x - s * 5, O.y - h * 0.85), O);
      var lowc = C(V(O.x - s * 3, O.y + h * 0.75), V(Ie.x + s * 4, Ie.y + h * 0.55), Ie);
      whites += M(Ie) + up + lowc + 'Z';
      lids += M(V(Ie.x - s * 0.5, Ie.y + 0.5)) + up + L(V(O.x + s * 2.5, O.y - 1.2));
      lows += M(V(O.x - s * 2, O.y + h * 0.5)) + Q(V(O.x - s * 7, Ie.y + h * 0.6), V(Ie.x + s * 3, Ie.y + 1.5));
      var ic = V(120 + s * 11, 71 - tilt * 0.3);
      iris += '<circle cx="' + N(ic.x) + '" cy="' + N(ic.y) + '" r="' + N(ir) + '"/>';
      hls += '<circle cx="' + N(ic.x - 1) + '" cy="' + N(ic.y - 1) + '" r=".9"/>';
      var B1 = V(120 + s * 4, 62.5 + browIn), B2 = V(120 + s * 21, 59.5 + browOut);
      brows += M(B1) + Q(V((B1.x + B2.x) / 2, Math.min(B1.y, B2.y) - 2.5), B2) + L(V(B2.x - s * 2, B2.y + 2.4)) + Q(V((B1.x + B2.x) / 2, Math.min(B1.y, B2.y) + 1.5), V(B1.x - s * 0.5, B1.y + 3.8)) + 'Z';
    }
    if (t >= 6) {
      var br = '';
      for (s = -1; s <= 1; s += 2) br += lensUp(V(120 + s * 4.5, 66 + browIn * 0.6), V(120 + s * 20, 63.5 - tilt * 0.6), 1.5, -2.5 - (t - 6) * 0.4);
      o += pth(br, F(pal.shade, 0.9));
    }
    o += pth(whites, F(t === 10 ? '#fff7d6' : '#fbf7f2'));
    if (t < 10) o += '<g fill="' + (t === 9 ? '#c026d3' : t === 8 ? '#b91c1c' : '#3a2418') + '">' + iris + '</g><g fill="#fff">' + hls + '</g>';
    o += pth(lids, SK(2.6));
    o += pth(lows, SK(1, INK, 0.8));
    if (t >= 9) o += ell(V(108.6, 70.5), t === 10 ? 11 : 8, t === 10 ? 7 : 5, F('url(#' + P.id + 'eg)')) + ell(V(131.4, 70.5), t === 10 ? 11 : 8, t === 10 ? 7 : 5, F('url(#' + P.id + 'eg)'));
    o += pth(brows, F('#1a1d2e') + ' stroke="' + INK + '" stroke-width=".8"');
    if (t >= 5) o += pth(M(V(118, 60 + browIn)) + L(V(118.5, 64 + browIn)) + M(V(122, 60 + browIn)) + L(V(121.5, 64 + browIn)), SK(1.1, INK, 0.7));
    return o;
  }
  function mouth(P, pal) {
    var t = P.t, o = '', i;
    if (t <= 1) {
      o += pth(M(V(115, 92)) + Q(V(120, 91.2 + t * 1.6), V(125, 92.3 - t * 0.8)), SK(1.6));
    } else if (t <= 5) {
      var cu = t === 5 ? 1.8 : 0;
      o += pth(M(V(113.5, 92)) + Q(V(121, 92.2), V(126.5, 92 - cu)) + M(V(113.5, 92)) + L(V(112.5, 93.3)), SK(1.7));
      o += pth(M(V(116, 95.5)) + Q(V(120, 96.8), V(124, 95.5)), SK(1.1, pal.deep));
    } else if (t <= 9) { // clenched toothy grin -> snarl
      var w = 8.5 + (t - 7) * 1.3, up = (t - 6) * 0.5, cy = 90 - up;
      var mo = M(V(120 - w, cy)) + Q(V(120, 88.6), V(120 + w, cy)) + Q(V(120 + w * 0.75, 96.4), V(120, 96.6)) + Q(V(120 - w * 0.75, 96.4), V(120 - w, cy)) + 'Z';
      o += pth(mo, F('#fbf7f2'));
      var tl = M(V(120 - w + 1, cy + 2.4)) + Q(V(120, 93.6), V(120 + w - 1, cy + 2.4));
      for (i = -2; i <= 2; i++) tl += M(V(120 + i * w * 0.3, 89.2 + Math.abs(i) * 0.15)) + L(V(120 + i * w * 0.31, 96.2 - Math.abs(i) * 0.9));
      o += pth(tl, SK(0.8));
      o += pth(mo, SK(1.7));
      o += pth(M(V(120 - w - 2.2, cy - 2)) + L(V(120 - w, cy)) + L(V(120 - w - 1.5, cy + 2)) + M(V(120 + w + 2.2, cy - 2)) + L(V(120 + w, cy)) + L(V(120 + w + 1.5, cy + 2)), SK(1.2));
    } else { // battle roar
      var mr = M(V(107.5, 88.4)) + Q(V(120, 86.6), V(132.5, 88.4)) + L(V(127.5, 99)) + Q(V(120, 101), V(112.5, 99)) + 'Z';
      o += pth(mr, F('#5a1010'));
      o += pth(M(V(109, 88.9)) + Q(V(120, 87.4), V(131, 88.9)) + L(V(130, 91.4)) + Q(V(120, 90.2), V(110, 91.4)) + 'Z' + M(V(113.4, 98.4)) + Q(V(120, 99.8), V(126.6, 98.4)) + L(V(127.2, 96.6)) + Q(V(120, 97.6), V(112.8, 96.6)) + 'Z', F('#fbf7f2'));
      o += pth(lens(V(115, 94.6), V(125, 94.6), -2.2, 0), F('#b91c1c'));
      o += pth(M(V(115.5, 88.3)) + L(V(115.5, 90.8)) + M(V(120, 87.8)) + L(V(120, 90.4)) + M(V(124.5, 88.3)) + L(V(124.5, 90.8)), SK(0.7));
      o += pth(mr, SK(1.8));
      o += pth(M(V(104.8, 86.2)) + L(V(107.5, 88.4)) + L(V(106, 91)) + M(V(135.2, 86.2)) + L(V(132.5, 88.4)) + L(V(134, 91)), SK(1.2));
    }
    return o;
  }
  function hair(P) {
    var t = P.t, o = '', hc = { b: '#20243a', s: '#0e1020', h: t >= 8 ? AURA[t][1] : '#5065a3' };
    o += U(P.hairK, F(hc.s));
    o += '<g clip-path="url(#' + P.hairC + ')">' + U(P.hairK, F(hc.b) + ' transform="translate(-5 -4)"') + '</g>';
    var strands = '';
    P.hairTips.forEach(function (vt, i) { if (i > 0 && i < 9) strands += M(lerpP(V(120, 60), vt[1], 0.45)) + Q(lerpP(V(120, 58), vt[1], 0.7), lerpP(vt[0], vt[1], 0.85)); });
    o += pth(strands, SK(1.1, hc.s));
    o += pth(lens(V(103, 44), V(117, 34), 3, 0) + lens(V(108, 47), V(98, 39), -2, 0) + lens(V(123, 38), V(135, 33), 2.5, 0), F(hc.h));
    o += U(P.hairK, SK(2.7));
    if (t === 0) o += pth(M(V(150, 56)) + C(V(153.5, 62), V(154.5, 66), V(150.5, 68)) + C(V(146.5, 67), V(147, 62), V(150, 56)) + 'Z', FS('#cdeafe', 1.3)) +
      pth(lens(V(149, 62), V(149.5, 66), 1, 0), F('#ffffff'));
    if (t >= 2) { // forehead wrap in milestone colour (green 2-4, indigo 5-7, gold 8-10), knotted at the left temple
      var B = P.band;
      o += pth(M(V(95.5, 51)) + Q(V(120, 43), V(144.5, 51)) + L(V(144.8, 57.5)) + Q(V(120, 49.5), V(95.2, 57.5)) + 'Z', FS(B[0], 2.2));
      o += pth(M(V(99, 52.5)) + Q(V(118, 46.5), V(130, 47.6)), SK(1.6, B[1]));
      o += pth(M(V(91.5, 50)) + C(V(88, 51.5), V(88, 58.5), V(92, 59.8)) + C(V(96, 60.6), V(98.5, 56), V(97.5, 52.5)) + C(V(96.5, 49.6), V(94, 48.8), V(91.5, 50)) + 'Z', FS(B[2], 1.8));
      o += pth(lens(V(91, 52.5), V(94.5, 51), 1.2, 0), F(B[1]));
    }
    return o;
  }
  function tails(P) {
    if (P.t < 2) return '';
    var t = P.t, a = V(92, 55), B = P.band, t1, t2;
    if (t >= 8) { // short knot tails lifted by the aura
      t1 = M(a) + C(V(a.x - 4, a.y - 4), V(a.x - 8, a.y - 10), V(a.x - 9, a.y - 17)) + L(V(a.x - 4, a.y - 13)) + C(V(a.x - 2, a.y - 8), V(a.x + 1, a.y - 5), V(a.x + 2, a.y - 2)) + 'Z';
      t2 = M(a) + C(V(a.x - 6, a.y - 1), V(a.x - 12, a.y - 4), V(a.x - 16, a.y - 10)) + L(V(a.x - 15, a.y - 3)) + C(V(a.x - 11, a.y + 1), V(a.x - 6, a.y + 3), V(a.x, a.y + 3)) + 'Z';
    } else { // short tails hanging behind the ear
      t1 = M(a) + C(V(a.x - 4, a.y + 2), V(a.x - 7, a.y + 6), V(a.x - 9, a.y + 13)) + L(V(a.x - 4.5, a.y + 12)) + C(V(a.x - 3, a.y + 8), V(a.x - 1, a.y + 5), V(a.x + 2, a.y + 3)) + 'Z';
      t2 = M(a) + C(V(a.x - 6, a.y + 1), V(a.x - 11, a.y + 3), V(a.x - 15, a.y + 8)) + L(V(a.x - 13, a.y + 12)) + C(V(a.x - 9, a.y + 8), V(a.x - 5, a.y + 6), V(a.x, a.y + 4)) + 'Z';
    }
    return pth(t2, FS(B[2], 2)) + pth(t1, FS(B[0], 2));
  }

  /* ---------------- main ---------------- */
  function svg(tier, opts) {
    opts = opts || {};
    var t = Math.max(0, Math.min(10, Math.floor(+tier || 0)));
    var id = (opts.idPrefix || 'av') + (++seq).toString(36) + '_';
    var P = params(t), pal = P.skin, Fr = FRAMES[t], ac = AURA[t], framed = opts.frame !== false;
    P.id = id;
    CTX = { id: id, n: 0, defs: [] }; GEMS = {};
    try {
      P.faceK = def(symPath(faceHalf(P))); P.faceC = clipOf(P.faceK);
      P.hairK = def(hairPath(P)); P.hairC = clipOf(P.hairK);
      var body = cel(id + 'tc', symPath(torsoHalf(P)), pal, -7, -3) + rim(P) + U(cel.k, SK(2.8));
      P.torsoClip = cel.c; P.rimK.push(cel.k);
      body += neck(P, pal);
      body += t <= 1 ? tank(P) + (t === 1 ? towel(P) : '') : chest(P, pal) + bodyScars(P);
      body += pants(P, Fr, id);
      body += P.pose === 'cross' ? armsCross(P, pal, id) : P.pose === 'flex' ? armFlex(P, pal, id, -1) + armFlex(P, pal, id, 1) : armHang(P, pal, id, -1) + armHang(P, pal, id, 1);
      body += head(P, pal) + hair(P);
      // hot silhouette rim behind the figure (8+): separates skin from the flames
      var hot = ac ? '<g fill="' + ac[2] + '" stroke="' + ac[2] + '" stroke-width="7">' + P.rimK.map(function (k) { return U(k); }).join('') + '</g>' : '';
      var o = ['<svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + NAMES[t] + '"><defs>'];
      o.push('<linearGradient id="' + id + 'bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + Fr.bg1 + '"/><stop offset="1" stop-color="' + Fr.bg2 + '"/></linearGradient>');
      o.push('<radialGradient id="' + id + 'gl" cx=".5" cy=".42" r=".5"><stop offset="0" stop-color="' + Fr.glow + '" stop-opacity="' + N(t >= 8 ? 0.45 : 0.35 + t * 0.03) + '"/><stop offset="1" stop-color="' + Fr.glow + '" stop-opacity="0"/></radialGradient>');
      o.push('<linearGradient id="' + id + 'mt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + Fr.m[1] + '"/><stop offset=".3" stop-color="' + Fr.m[0] + '"/><stop offset=".55" stop-color="' + Fr.m[1] + '"/><stop offset=".8" stop-color="' + Fr.m[2] + '"/><stop offset="1" stop-color="' + Fr.m[0] + '"/></linearGradient>');
      o.push('<clipPath id="' + id + 'fr"><rect x="7" y="7" width="226" height="286" rx="17"/></clipPath>');
      if (ac) o.push('<radialGradient id="' + id + 'hz" cx=".5" cy=".5" r=".62"><stop offset="0" stop-color="' + ac[1] + '" stop-opacity=".6"/><stop offset="1" stop-color="' + ac[0] + '" stop-opacity="0"/></radialGradient>');
      if (t >= 9) o.push('<radialGradient id="' + id + 'eg"><stop offset="0" stop-color="#fffbe6"/><stop offset=".45" stop-color="' + (t === 10 ? '#fde047' : '#f0abfc') + '" stop-opacity=".75"/><stop offset="1" stop-color="' + (t === 10 ? '#f59e0b' : '#c026d3') + '" stop-opacity="0"/></radialGradient>');
      var fx = sparks(P);
      o.push(CTX.defs.join(''));
      o.push('</defs><g clip-path="url(#' + id + 'fr)">');
      if (framed) o.push(background(P, Fr, id));
      o.push(aura(P, id));
      var cam = P.cam;
      o.push('<g stroke-linejoin="round" stroke-linecap="round"' + (cam !== 1 ? ' transform="matrix(' + cam + ' 0 0 ' + cam + ' ' + N(120 * (1 - cam)) + ' ' + N(170 * (1 - cam)) + ')"' : '') + '>');
      o.push(hot + tails(P) + body + '</g>');
      o.push(fx + '</g>');
      if (framed) o.push(frame(P, Fr, id));
      o.push('</svg>');
      return o.join('');
    } finally { CTX = null; GEMS = null; }
  }

  window.AvatarArt = {
    TIERS: 11,
    tierForLevel: function (level) { return Math.min(10, Math.floor(Math.max(0, +level || 0) / 10)); },
    name: function (tier) { return NAMES[Math.max(0, Math.min(10, Math.floor(+tier || 0)))]; },
    svg: svg
  };
})();
