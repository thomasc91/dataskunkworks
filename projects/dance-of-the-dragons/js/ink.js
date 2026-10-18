// ink.js — the hand-drawn engine, forked from projects/nightingale-redrawn (engine parts only).
// Seeded noise, a humanised pen line with pressure, ribbon strokes, a single-stroke
// capital alphabet, and the paper tiles. No DOM, no state beyond seeds.

export const TAU = Math.PI * 2, DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const fade = t => t * t * (3 - 2 * t);
export const smooth = (a, b, x) => fade(clamp((x - a) / (b - a), 0, 1));
export const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(i, s) { // integer -> [-1, 1)
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul((s | 0) + 0x9e3779b9, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 2147483648 - 1;
}
export const strHash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
export function noise1(x, s) { const i = Math.floor(x), u = fade(x - i); return hash(i, s) * (1 - u) + hash(i + 1, s) * u; }
export function fbm1(x, s) { return 0.6 * noise1(x, s) + 0.28 * noise1(x * 2.07 + 13.1, s + 1) + 0.12 * noise1(x * 4.3 + 7.7, s + 2); }
export function noise2(x, y, s, period = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = fade(x - ix), fy = fade(y - iy);
  const w = v => (period ? ((v % period) + period) % period : v);
  const h = (a, b) => hash(w(a) * 7919 + w(b) * 104729, s);
  return lerp(lerp(h(ix, iy), h(ix + 1, iy), fx), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), fx), fy);
}
export function fbm2(x, y, s) { return 0.6 * noise2(x, y, s) + 0.3 * noise2(x * 2.1 + 5.2, y * 2.1 - 1.3, s + 1) + 0.1 * noise2(x * 4.3 - 2.7, y * 4.3 + 8.1, s + 2); }

/* ---------------------------- geometry ---------------------------- */
export function polyLength(P) { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; }
export function resample(P, step) {
  if (P.length < 2) return P.map(p => p.slice());
  const out = [P[0].slice()];
  let carry = 0;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg === 0) continue;
    let d = step - carry;
    while (d <= seg) { const t = d / seg; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); d += step; }
    carry = seg - (d - step);
  }
  const last = P[P.length - 1], prev = out[out.length - 1];
  if (Math.hypot(last[0] - prev[0], last[1] - prev[1]) > step * 0.35) out.push(last.slice());
  else if (out.length > 1) out[out.length - 1] = last.slice();
  return out;
}
export function resampleClosed(P, step) { const R = resample(P.concat([P[0]]), step); R.pop(); return R; }
export function tangent(P, i) {
  const n = P.length, a = P[i > 0 ? i - 1 : 0], b = P[i < n - 1 ? i + 1 : n - 1];
  const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
  return [tx / l, ty / l];
}
export function signedArea(P) { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
export function pointInPoly(x, y, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Catmull-Rom through points, returns a dense polyline
export function spline(pts, perSeg = 18) {
  if (pts.length < 2) return pts.map(p => p.slice());
  const P = [pts[0], ...pts, pts[pts.length - 1]], out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
// offset a polyline sideways (positive = left of travel in y-down screen space)
export function offsetLine(P, d, closed = false) {
  const n = P.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = closed ? P[(i - 1 + n) % n] : P[Math.max(0, i - 1)], b = closed ? P[(i + 1) % n] : P[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    out[i] = [P[i][0] + ty * d, P[i][1] - tx * d];
  }
  return out;
}

/* ------------------------------ the hand ------------------------------ */
// Resample, then push every point sideways by a gentle bow, a slow drift and a fast
// tremor. The ends overshoot or stop a little short, as a hand does. Units are whatever
// the caller draws in; pass amplitudes in the same units.
export function humanize(clean, o, seed) {
  const r = rng(seed);
  const P = resample(clean, o.step), n = P.length;
  if (n < 2) return P;
  const L = polyLength(P);
  const bow = (r() * 2 - 1) * o.bow * Math.min(L, o.bowCap || 420);
  const drift = o.drift * Math.min(1, L / o.wave), tremor = o.tremor * Math.min(1, 0.4 + L / (o.tremorLen || 200));
  const out = new Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const [tx, ty] = tangent(P, i);
    const d = bow * Math.sin(Math.PI * s / (L || 1)) + drift * fbm1(s / o.wave, seed) + tremor * noise1(s / (o.tremorWave || 4.7), seed + 77);
    out[i] = [P[i][0] - ty * d, P[i][1] + tx * d];
  }
  if (o.over && !o.closed) {
    extendEnd(out, true, (r() * 1.5 - 0.35) * o.over, o.step);
    extendEnd(out, false, (r() * 1.5 - 0.35) * o.over, o.step);
  }
  return out;
}
function extendEnd(P, atStart, e, step) {
  const n = P.length;
  if (n < 3 || Math.abs(e) < 0.05 * step) return;
  const a = atStart ? P[0] : P[n - 1], b = atStart ? P[1] : P[n - 2];
  const tx = a[0] - b[0], ty = a[1] - b[1], l = Math.hypot(tx, ty) || 1;
  if (e > 0) { const q = [a[0] + tx / l * e, a[1] + ty / l * e]; atStart ? P.unshift(q) : P.push(q); }
  else { const k = Math.max(e, -0.8 * step); a[0] += tx / l * k; a[1] += ty / l * k; }
}
// hand settings in *screen pixels*; scaled into map units by the caller
export const HAND_PX = {
  coast:  { step: 2.2, bow: 0.002, drift: 0.9, wave: 140, tremor: 0.28, over: 0 },
  river:  { step: 2.2, bow: 0.004, drift: 0.8, wave: 110, tremor: 0.25, over: 2 },
  line:   { step: 2, bow: 0.006, drift: 0.9, wave: 130, tremor: 0.25, over: 2 },
  pencil: { step: 2.5, bow: 0.004, drift: 1.1, wave: 170, tremor: 0.35, over: 4 },
  glyph:  { step: 1.2, bow: 0.01, drift: 0.35, wave: 30, tremor: 0.18, over: 0.8 },
};
export function scaleHand(h, k) { // k = map units per pixel
  return { ...h, step: h.step * k, drift: h.drift * k, wave: h.wave * k, tremor: h.tremor * k, over: h.over * k, bowCap: 420 * k, tremorLen: 200 * k, tremorWave: 4.7 * k };
}
// pen pressure: thin as the nib lands, full through the stroke, lifting off at the end
export function widths(P, base, seed, taperIn = 3, taperOut = 7, minP = 0.55, nib = 0.3) {
  const n = P.length, W = new Float32Array(n), L = polyLength(P);
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const tin = fade(clamp(s / taperIn, 0, 1)), tout = fade(clamp((L - s) / taperOut, 0, 1));
    let w = base * (minP + (1 - minP) * tin) * (0.42 + 0.58 * tout);
    if (nib) { const [tx, ty] = tangent(P, i); w *= 1 + nib * (Math.abs(Math.sin(Math.atan2(ty, tx) + 40 * DEG)) - 0.5); }
    W[i] = Math.max(base * 0.25, w * (1 + 0.14 * noise1(s / (taperOut * 1.6), seed + 5)));
  }
  return W;
}
// append a ribbon (the polyline offset by half the width each side, round caps) to a path
export function ribbonPath(g, P, W, upto = Infinity) {
  const n = P.length;
  if (n < 2 || upto <= 0) return;
  const m = Math.min(n - 1, Math.floor(upto)), f = Math.min(upto, n - 1) - m;
  const pts = P.slice(0, m + 1), ws = Array.from(W.subarray ? W.subarray(0, m + 1) : W.slice(0, m + 1));
  if (f > 0.001 && m < n - 1) { pts.push([lerp(P[m][0], P[m + 1][0], f), lerp(P[m][1], P[m + 1][1], f)]); ws.push(lerp(W[m], W[m + 1], f)); }
  const q = pts.length;
  if (q < 2) { g.moveTo(pts[0][0] + ws[0] / 2, pts[0][1]); g.arc(pts[0][0], pts[0][1], ws[0] / 2, 0, TAU); return; }
  const Lp = new Array(q), Rp = new Array(q);
  for (let i = 0; i < q; i++) {
    const [tx, ty] = tangent(pts, i), h = ws[i] / 2;
    Lp[i] = [pts[i][0] - ty * h, pts[i][1] + tx * h];
    Rp[i] = [pts[i][0] + ty * h, pts[i][1] - tx * h];
  }
  g.moveTo(Lp[0][0], Lp[0][1]);
  for (let i = 1; i < q; i++) g.lineTo(Lp[i][0], Lp[i][1]);
  const e = pts[q - 1], ae = Math.atan2(Lp[q - 1][1] - e[1], Lp[q - 1][0] - e[0]);
  g.arc(e[0], e[1], ws[q - 1] / 2, ae, ae - Math.PI, true);
  for (let i = q - 1; i >= 0; i--) g.lineTo(Rp[i][0], Rp[i][1]);
  const s = pts[0], as = Math.atan2(Rp[0][1] - s[1], Rp[0][0] - s[0]);
  g.arc(s[0], s[1], ws[0] / 2, as, as - Math.PI, true);
  g.closePath();
}
// a stroke drawn by the hand into a Path2D: humanise + pressure + ribbon
export function inkStroke(path, clean, px, width, seed, hand = HAND_PX.line, k = 1) {
  const P = humanize(clean, scaleHand(hand, k), seed);
  const W = widths(P, width * k, seed, 3 * k, 7 * k);
  ribbonPath(path, P, W);
  return P;
}

/* ------------------------------ lettering ------------------------------ */
// Single-stroke capitals from the Nightingale engine. Coordinates run from the cap line
// (y = 0) to the baseline (y = 1); M L Q C are SVG-like, A is an arc, D a dot.
const TRACK = 0.17, SPACE = 0.46;
const GLYPH_SRC = {
  A: [0.70, 'M0 1 L.35 0 L.70 1 M.14 .62 L.56 .62'],
  B: [0.60, 'M0 0 L0 1 M0 0 L.32 0 C.58 0 .58 .47 .30 .47 L0 .47 M.30 .47 C.64 .47 .64 1 .33 1 L0 1'],
  C: [0.66, 'A.36 .5 .35 .5 -40 -320'],
  D: [0.60, 'M0 0 L0 1 M0 0 L.22 0 C.66 0 .66 1 .22 1 L0 1'],
  E: [0.54, 'M.54 0 L0 0 L0 1 L.54 1 M0 .48 L.44 .48'],
  F: [0.52, 'M.52 0 L0 0 L0 1 M0 .48 L.42 .48'],
  G: [0.72, 'A.36 .5 .35 .5 -40 -340 L.70 .56 L.44 .56'],
  H: [0.62, 'M0 0 L0 1 M.62 0 L.62 1 M0 .5 L.62 .5'],
  I: [0.28, 'M0 0 L.28 0 M.14 0 L.14 1 M0 1 L.28 1'],
  J: [0.52, 'M.12 0 L.52 0 M.42 0 L.42 .70 C.42 1.02 .04 1.04 0 .74'],
  K: [0.62, 'M0 0 L0 1 M.60 0 L0 .60 M.20 .45 L.62 1'],
  L: [0.50, 'M0 0 L0 1 L.50 1'],
  M: [0.80, 'M0 1 L.02 0 L.40 .64 L.78 0 L.80 1'],
  N: [0.64, 'M0 1 L0 0 L.64 1 L.64 0'],
  O: [0.72, 'A.36 .5 .36 .5 -100 -470'],
  P: [0.56, 'M0 0 L0 1 M0 0 L.30 0 C.60 0 .60 .52 .30 .52 L0 .52'],
  Q: [0.76, 'A.36 .5 .36 .5 -100 -470 M.46 .72 L.76 1.04'],
  R: [0.62, 'M0 0 L0 1 M0 0 L.30 0 C.60 0 .60 .52 .30 .52 L0 .52 M.24 .52 L.62 1'],
  S: [0.58, 'M.56 .16 C.48 -.02 .04 -.04 .04 .24 C.04 .52 .56 .44 .56 .74 C.56 1.04 .10 1.04 0 .84'],
  T: [0.60, 'M0 0 L.60 0 M.30 0 L.30 1'],
  U: [0.62, 'M0 0 L0 .66 C0 1.04 .62 1.04 .62 .66 L.62 0'],
  V: [0.66, 'M0 0 L.33 1 L.66 0'],
  W: [0.92, 'M0 0 L.22 1 L.46 .30 L.70 1 L.92 0'],
  X: [0.62, 'M0 0 L.62 1 M.62 0 L0 1'],
  Y: [0.64, 'M0 0 L.32 .50 L.64 0 M.32 .50 L.32 1'],
  Z: [0.60, 'M0 0 L.60 0 L0 1 L.60 1'],
  0: [0.56, 'A.28 .5 .28 .5 -95 -460'],
  1: [0.26, 'M.02 .20 L.22 0 L.22 1'],
  2: [0.58, 'M.03 .22 C.08 -.05 .54 -.07 .54 .25 C.54 .50 .22 .66 0 1 L.58 1'],
  3: [0.58, 'M.04 .10 C.20 -.05 .55 -.02 .52 .24 C.50 .42 .34 .46 .20 .46 C.46 .46 .60 .60 .57 .77 C.54 1.04 .12 1.04 0 .86'],
  4: [0.62, 'M.44 0 L0 .68 L.62 .68 M.44 0 L.44 1'],
  5: [0.58, 'M.52 0 L.10 0 L.06 .44 C.20 .36 .56 .34 .56 .68 C.56 1.04 .12 1.04 0 .86'],
  6: [0.58, 'M.48 .04 C.22 .08 .03 .34 .03 .64 C.03 .90 .16 1 .30 1 C.46 1 .56 .88 .56 .72 C.56 .55 .44 .44 .30 .44 C.17 .44 .07 .52 .04 .62'],
  7: [0.56, 'M0 0 L.56 0 L.20 1'],
  8: [0.58, 'M.50 .18 C.48 .02 .06 0 .08 .22 C.10 .44 .54 .48 .56 .74 C.58 1.03 .02 1.03 .02 .74 C.02 .48 .48 .44 .50 .22 L.50 .18'],
  9: [0.56, 'A.27 .28 .27 .28 5 -355 L.50 1'],
  '.': [0.10, 'D.05 .95'],
  ',': [0.12, 'M.09 .84 L.01 1.16'],
  ':': [0.12, 'D.06 .36 D.06 .95'],
  "'": [0.10, 'M.06 0 L.04 .24'],
  '’': [0.10, 'M.06 0 L.04 .24'],
  '-': [0.34, 'M0 .56 L.34 .56'],
  '–': [0.54, 'M0 .56 L.54 .56'],
  '?': [0.52, 'M.02 .20 C.06 -.04 .50 -.06 .50 .22 C.50 .42 .24 .44 .24 .68 D.24 .95'],
  '†': [0.40, 'M.20 -.05 L.20 1.05 M0 .28 L.40 .28'],
  '·': [0.20, 'D.10 .52'],
  '…': [0.50, 'D.05 .95 D.25 .95 D.45 .95'],
  '&': [0.64, 'M.62 1 L.14 .40 C0 .24 .08 0 .26 0 C.44 0 .48 .24 .32 .36 L.12 .52 C-.02 .66 .04 1 .28 1 C.46 1 .56 .84 .62 .62'],
};
function parseGlyph(d) {
  const tk = d.match(/[MLQCAD]|-?(?:\d+\.?\d*|\.\d+)/g);
  const strokes = [];
  let cur = null, i = 0;
  const num = () => parseFloat(tk[i++]);
  const last = () => cur[cur.length - 1];
  while (i < tk.length) {
    const c = tk[i++];
    if (c === 'M') { cur = [[num(), num()]]; strokes.push(cur); }
    else if (c === 'L') cur.push([num(), num()]);
    else if (c === 'Q') {
      const [x0, y0] = last(), qx = num(), qy = num(), x = num(), y = num();
      for (let s = 1; s <= 10; s++) { const t = s / 10, u = 1 - t; cur.push([u * u * x0 + 2 * u * t * qx + t * t * x, u * u * y0 + 2 * u * t * qy + t * t * y]); }
    } else if (c === 'C') {
      const [x0, y0] = last(), ax = num(), ay = num(), bx = num(), by = num(), x = num(), y = num();
      for (let s = 1; s <= 16; s++) {
        const t = s / 16, u = 1 - t;
        cur.push([u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y]);
      }
    } else if (c === 'A') {
      const cx = num(), cy = num(), rx = num(), ry = num(), a0 = num() * DEG, a1 = num() * DEG;
      const n = Math.max(6, Math.ceil(Math.abs(a1 - a0) / (9 * DEG)));
      const p0 = [cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry];
      if (!cur) { cur = [p0]; strokes.push(cur); } else if (Math.hypot(last()[0] - p0[0], last()[1] - p0[1]) > 0.01) cur.push(p0);
      for (let s = 1; s <= n; s++) { const a = a0 + (a1 - a0) * s / n; cur.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    } else if (c === 'D') {
      const x = num(), y = num(), dot = [];
      for (let s = 0; s <= 8; s++) dot.push([x + Math.cos(s / 8 * TAU) * 0.028, y + Math.sin(s / 8 * TAU) * 0.028]);
      strokes.push(dot); cur = null;
    }
  }
  return strokes;
}
const GLYPHS = {};
for (const [ch, [w, d]] of Object.entries(GLYPH_SRC)) GLYPHS[ch] = { w, strokes: parseGlyph(d) };
const glyphFor = ch => GLYPHS[ch] || GLYPHS[ch.toUpperCase()] || null;
const advance = ch => (ch === ' ' ? SPACE : glyphFor(ch) ? glyphFor(ch).w + TRACK : SPACE);
export function measure(text, cap, track = 0) { let w = 0; for (const ch of text) w += advance(ch) + track; return (w - TRACK - track) * cap; }

// Lay out a line of hand lettering into a Path2D (pixel units, baseline at y). Each glyph
// gets its own small change of size, lean and baseline, so no two letters are alike.
export function letterPath(text, cap, opts = {}) {
  const path = new Path2D();
  const seed = opts.seed ?? strHash(text), r = rng(seed);
  const slant = opts.slant ?? 0.08, width = opts.width || Math.max(1.05, cap * 0.085), track = opts.track || 0;
  const line = text.toUpperCase(), lw = measure(line, cap, track);
  let px = opts.align === 'center' ? -lw / 2 : opts.align === 'right' ? -lw : 0;
  for (const ch of line) {
    const g = ch === ' ' ? null : glyphFor(ch);
    if (!g) { px += (SPACE + track) * cap; continue; }
    const sc = 1 + (r() - 0.5) * 0.07, rot = (r() - 0.5) * 0.06, sl = slant + (r() - 0.5) * 0.04;
    const ox = px + (r() - 0.5) * 0.03 * cap, oy = (r() - 0.5) * 0.05 * cap;
    const gw = g.w * cap * sc, cxg = gw / 2, cyg = -cap * sc / 2, cr = Math.cos(rot), sr = Math.sin(rot);
    for (const S of g.strokes) {
      const clean = S.map(([gx, gy]) => {
        let lx = gx * cap * sc;
        const ly = (gy - 1) * cap * sc;
        lx -= ly * sl;
        const qx = lx - cxg, qy = ly - cyg;
        return [ox + cxg + qx * cr - qy * sr, oy + cyg + qx * sr + qy * cr];
      });
      const hs = Math.max(0.5, cap * 0.045);
      const P = humanize(clean, { step: hs, bow: 0, drift: cap * 0.014, wave: cap * 1.4, tremor: cap * 0.005, over: cap * 0.025, bowCap: 1, tremorLen: 1, tremorWave: 4.7 }, (seed + Math.floor(px * 13)) >>> 0);
      const W = widths(P, width, seed, cap * 0.08, cap * 0.18, 0.6, 0.25);
      ribbonPath(path, P, W);
    }
    px += (g.w + TRACK + track) * cap;
  }
  return { path, width: lw };
}

/* ------------------------------- tiles ------------------------------- */
export function makeTile(size, fn) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  fn(img.data, size);
  g.putImageData(img, 0, 0);
  return c;
}
export function toothTile() { // paper tooth: tileable value noise, darker in the valleys
  return makeTile(256, (d, n) => {
    const r = rng(3);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 0.55 * noise2(x / 4, y / 4, 21, 64) + 0.3 * noise2(x / 2, y / 2, 22, 128) + 0.3 * (r() - 0.5);
      const g = 255 - clamp((v + 0.7) / 1.6, 0, 1) * 34, i = (y * n + x) * 4;
      d[i] = g; d[i + 1] = g; d[i + 2] = g - 3; d[i + 3] = 255;
    }
  });
}
export function grainTile() { // granulation: pigment lifts out of the paper's peaks
  return makeTile(128, (d, n) => {
    const r = rng(7);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = noise2(x / 1.8, y / 1.8, 41, 71) * 0.8 + (r() - 0.5) * 0.6, i = (y * n + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255 * clamp(v * 0.9 - 0.05, 0, 1);
    }
  });
}
export function cloudTile() { // uneven density where a wash dried thinner
  return makeTile(256, (d, n) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 0.6 * noise2(x / 32, y / 32, 51, 8) + 0.3 * noise2(x / 16, y / 16, 52, 16) + 0.15 * noise2(x / 8, y / 8, 53, 32), i = (y * n + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255 * clamp(0.32 + v * 0.75, 0, 1);
    }
  });
}
// Tyler Hobbs-style warp used for washes: push each vertex along its normal by noise
export function warp(P, amp, freq, seed, bias) {
  const n = P.length, out = new Array(n), sgn = signedArea(P) > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const d = amp * fbm2(P[i][0] * freq, P[i][1] * freq, seed) + bias;
    out[i] = [P[i][0] + ty * sgn * d, P[i][1] - tx * sgn * d];
  }
  return out;
}
