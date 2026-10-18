// dragon.js — the dragon rig, seen from above. A spine laid along the flight path; a width
// profile per build; bat wings with four fingers and a scalloped trailing edge; ink over wash.

import { DR } from './world.js';
import * as K from './ink.js';

const INK = '#241d18';
const BUILD = {
  heavy:     { prof: [[0, .03], [.035, .086], [.08, .052], [.17, .056], [.26, .11], [.38, .135], [.5, .108], [.6, .058], [.8, .026], [.97, .008], [1, .004]], sh: .27, hip: .5, span: 1.55, chord: 1.0 },
  standard:  { prof: [[0, .026], [.035, .076], [.08, .046], [.22, .042], [.3, .088], [.42, .104], [.52, .088], [.62, .05], [.82, .022], [.97, .007], [1, .003]], sh: .31, hip: .53, span: 1.42, chord: .95 },
  lean:      { prof: [[0, .022], [.028, .064], [.065, .036], [.32, .034], [.38, .066], [.48, .076], [.56, .06], [.64, .038], [.84, .017], [.97, .006], [1, .003]], sh: .39, hip: .58, span: 1.16, chord: .8 },
  slender:   { prof: [[0, .022], [.032, .066], [.075, .038], [.24, .035], [.31, .07], [.42, .08], [.52, .066], [.61, .04], [.82, .017], [.97, .006], [1, .003]], sh: .32, hip: .54, span: 1.5, chord: .85 },
  skinny:    { prof: [[0, .022], [.032, .06], [.075, .036], [.24, .032], [.31, .06], [.42, .066], [.52, .056], [.61, .036], [.82, .016], [.97, .006], [1, .003]], sh: .32, hip: .54, span: 1.48, chord: .85 },
  juvenile:  { prof: [[0, .036], [.05, .116], [.11, .062], [.2, .05], [.28, .1], [.4, .118], [.5, .092], [.6, .052], [.8, .024], [.97, .008], [1, .005]], sh: .3, hip: .52, span: 1.2, chord: 1.05 },
  hatchling: { prof: [[0, .05], [.07, .16], [.14, .08], [.22, .064], [.3, .13], [.42, .142], [.52, .1], [.62, .056], [.82, .025], [.97, .01], [1, .006]], sh: .32, hip: .52, span: 1.0, chord: 1.1 },
};
// wing points: [forward along the body, out from it], in half-spans
const WING = { elbow: [0.04, 0.3], wrist: [-0.05, 0.53], tips: [[-0.26, 1.0], [-0.5, 0.87], [-0.66, 0.66], [-0.72, 0.44]], thumb: [0.1, 0.5] };
const SWEPT = { elbow: [0.0, 0.3], wrist: [-0.1, 0.53], tips: [[-0.42, 0.97], [-0.62, 0.82], [-0.74, 0.62], [-0.78, 0.4]], thumb: [0.05, 0.5] };

function profW(prof, u) {
  for (let i = 1; i < prof.length; i++) if (u <= prof[i][0]) { const [u0, w0] = prof[i - 1], [u1, w1] = prof[i]; return K.lerp(w0, w1, K.fade((u - u0) / (u1 - u0))); }
  return prof[prof.length - 1][1];
}
function chaikin(P, it = 2) {
  let Q = P;
  for (let k = 0; k < it; k++) {
    const out = [], n = Q.length;
    for (let i = 0; i < n; i++) { const a = Q[i], b = Q[(i + 1) % n]; out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); }
    Q = out;
  }
  return Q;
}
export function shade(hex, k) { // lighten (k > 0) or darken (k < 0)
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function tracePoly(g, P) { g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); g.closePath(); }

// Build the outline in the units of the spine (map leagues, or pixels in the vignette)
export function rig(id, pose, sc, clock, minPx = 14, boil = 0) {
  const d = DR[id], B = BUILD[d.build], sp = pose.spine, n = sp.length;
  const Lpx = pose.L * sc;
  let S = sp, kx = 1;
  if (Lpx < minPx) { kx = minPx / Lpx; const m = sp[n >> 1]; S = sp.map(p => [m[0] + (p[0] - m[0]) * kx, m[1] + (p[1] - m[1]) * kx]); }
  const Le = pose.L * kx, T = new Array(n), N = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)];
    let tx = a[0] - b[0], ty = a[1] - b[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    T[i] = [tx, ty]; N[i] = [-ty, tx];
  }
  const width = fi => profW(B.prof, fi / (n - 1)) * Le;
  const at = fi => { const i = Math.max(0, Math.min(n - 2, Math.floor(fi))), f = fi - i; return [K.lerp(S[i][0], S[i + 1][0], f), K.lerp(S[i][1], S[i + 1][1], f)]; };
  const ri = fi => Math.max(0, Math.min(n - 1, Math.round(fi)));
  const seed = K.strHash(id), jamp = boil ? 0.5 / sc : 0;
  const jit = (p, i) => (jamp ? [p[0] + jamp * K.noise1(i * 0.73 + boil * 17.3, seed), p[1] + jamp * K.noise1(i * 0.61 + boil * 11.1, seed + 9)] : p);
  const small = Lpx * kx < 30;
  // body: down the left side, a spade at the tail, back up the right, the snout
  const left = [], right = [];
  for (let i = 0; i < n; i++) { const w = width(i) / 2; left.push([S[i][0] + N[i][0] * w, S[i][1] + N[i][1] * w]); right.push([S[i][0] - N[i][0] * w, S[i][1] - N[i][1] * w]); }
  const tl = S[n - 1], tt = T[n - 1], tn = N[n - 1], sw = Le * 0.028;
  const snout = [S[0][0] + T[0][0] * Le * 0.032, S[0][1] + T[0][1] * Le * 0.032];
  let body = [snout, ...left, [tl[0] + tn[0] * sw, tl[1] + tn[1] * sw], [tl[0] - tt[0] * Le * 0.05, tl[1] - tt[1] * Le * 0.05], [tl[0] - tn[0] * sw, tl[1] - tn[1] * sw], ...right.reverse()];
  if (!small) body = chaikin(body, 2);
  body = body.map((p, i) => jit(p, i));
  // wings
  const shI = B.sh * (n - 1), hipI = B.hip * (n - 1), sh = at(shI), f = T[ri(shI)], l = N[ri(shI)], hip = at(hipI), nh = N[ri(hipI)];
  const span = B.span * Le / 2;
  let A = 0.95, bias = 0.08, fold = 0;
  const ph = (seed % 1000) / 1000 * K.TAU, freq = 0.55 / Math.sqrt(d.size), phase = K.TAU * freq * clock + ph;
  if (pose.perched) { A = 0; bias = 0; fold = 0.82; }
  else if (pose.falling) { A = 0.4; fold = 0.45; }
  else if (pose.glide) { A = 0.14; bias = 0.03; }
  const theta = A * Math.sin(phase) + bias, up = A > 0.5 ? Math.max(0, Math.sin(phase)) : 0;
  const cLat = Math.max(0.3, Math.cos(theta * 0.95)), bank = pose.bank || 0, Wd = d.swept ? SWEPT : WING;
  const wing = side => {
    const latK = cLat * (1 - 0.32 * Math.max(0, side * bank)) * (1 - 0.84 * fold), back = B.chord * (1 - 0.35 * fold);
    const place = ([fa, la], j, upK = 1) => {
      const lf = (fa < 0 ? fa * back : fa * (1 - 0.5 * fold)) - fold * 0.05, ll = la * latK * upK;
      return jit([sh[0] + (f[0] * lf + l[0] * side * ll) * span, sh[1] + (f[1] * lf + l[1] * side * ll) * span], j + (side > 0 ? 80 : 90));
    };
    const elbow = place(Wd.elbow, 0), wrist = place(Wd.wrist, 1), thumb = place(Wd.thumb, 2);
    const tips = Wd.tips.map((tp, j) => place(tp, 3 + j, 1 - 0.18 * up * (j / 3)));
    const root = [sh[0] + l[0] * side * width(shI) * 0.4, sh[1] + l[1] * side * width(shI) * 0.4];
    const hipRoot = [hip[0] + nh[0] * side * width(hipI) * 0.38, hip[1] + nh[1] * side * width(hipI) * 0.38];
    const deep = d.old ? 0.34 : 0.26;
    const ctrl = (a, b) => [K.lerp((a[0] + b[0]) / 2, wrist[0], deep), K.lerp((a[1] + b[1]) / 2, wrist[1], deep)];
    const mid = [K.lerp(wrist[0], root[0], 0.45), K.lerp(wrist[1], root[1], 0.45)];
    const ctrls = [ctrl(tips[0], tips[1]), ctrl(tips[1], tips[2]), ctrl(tips[2], tips[3]), [K.lerp((tips[3][0] + hipRoot[0]) / 2, mid[0], 0.3), K.lerp((tips[3][1] + hipRoot[1]) / 2, mid[1], 0.3)]];
    return { root, elbow, wrist, thumb, tips, hipRoot, ctrls };
  };
  return { body, L: wing(1), R: wing(-1), S, T, N, Le, width, at, ri, shI, hipI, snout, kx, small };
}
function wingPath(g, W, old) {
  g.moveTo(W.root[0], W.root[1]); g.lineTo(W.elbow[0], W.elbow[1]); g.lineTo(W.wrist[0], W.wrist[1]); g.lineTo(W.tips[0][0], W.tips[0][1]);
  let a = W.tips[0];
  [W.tips[1], W.tips[2], W.tips[3], W.hipRoot].forEach((b, i) => {
    const c = W.ctrls[i];
    if (old && i < 3) { // a small tear in an old membrane
      const m = [0.25 * a[0] + 0.5 * c[0] + 0.25 * b[0], 0.25 * a[1] + 0.5 * c[1] + 0.25 * b[1]];
      const mm = [K.lerp(m[0], W.wrist[0], 0.07), K.lerp(m[1], W.wrist[1], 0.07)];
      g.quadraticCurveTo(K.lerp(a[0], c[0], 0.5), K.lerp(a[1], c[1], 0.5), mm[0], mm[1]);
      g.quadraticCurveTo(K.lerp(c[0], b[0], 0.5), K.lerp(c[1], b[1], 0.5), b[0], b[1]);
    } else g.quadraticCurveTo(c[0], c[1], b[0], b[1]);
    a = b;
  });
  g.closePath();
}
function simpleWingPath(g, W) { tracePoly(g, [W.root, W.wrist, W.tips[0], W.tips[2], W.hipRoot]); }

export function drawShadow(g, R, pose, sc, alpha = 1) {
  const off = (pose.alt || 0) * (0.35 + 0.22 * R.Le), dx = 0.55 * off, dy = 0.83 * off;
  if (off * sc < 0.8) return;
  g.save(); g.translate(dx, dy); g.fillStyle = `rgba(38,28,20,${0.085 * alpha})`;
  for (const W of [R.L, R.R]) { g.beginPath(); R.small ? simpleWingPath(g, W) : wingPath(g, W, false); g.fill(); }
  g.beginPath(); tracePoly(g, R.body); g.fill();
  g.restore();
}

export function drawDragon(g, id, R, pose, sc, state, sideCol, alpha = 1) {
  const d = DR[id], px = 1 / sc, small = R.small;
  const lw = K.clamp(R.Le * sc / 200, 0.85, 2.1) * px, ghost = (d.faint ? 0.75 : 1) * alpha;
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const W of [R.L, R.R]) {
    g.beginPath(); small ? simpleWingPath(g, W) : wingPath(g, W, d.old);
    if (!small) { const tm = W.tips[1], gr = g.createLinearGradient(W.wrist[0], W.wrist[1], tm[0], tm[1]); gr.addColorStop(0, shade(d.wing, -0.16)); gr.addColorStop(1, shade(d.wing, 0.1)); g.fillStyle = gr; }
    else g.fillStyle = d.wing;
    g.globalAlpha = 0.86 * ghost; g.fill();
    g.globalAlpha = 0.65 * ghost; g.strokeStyle = INK; g.lineWidth = lw * 0.6; g.stroke();
    g.globalAlpha = 0.95 * ghost; g.lineWidth = lw * 1.15;
    g.beginPath(); g.moveTo(W.root[0], W.root[1]); g.lineTo(W.elbow[0], W.elbow[1]); g.lineTo(W.wrist[0], W.wrist[1]); g.lineTo(W.tips[0][0], W.tips[0][1]); g.stroke();
    if (!small) {
      g.lineWidth = lw * 0.7; g.beginPath();
      for (let j = 1; j < 4; j++) { const tp = W.tips[j]; g.moveTo(W.wrist[0], W.wrist[1]); g.quadraticCurveTo(K.lerp(W.wrist[0], tp[0], 0.5) + (W.wrist[1] - tp[1]) * 0.05, K.lerp(W.wrist[1], tp[1], 0.5) - (W.wrist[0] - tp[0]) * 0.05, tp[0], tp[1]); }
      g.moveTo(W.wrist[0], W.wrist[1]); g.lineTo(W.thumb[0], W.thumb[1]); g.stroke();
    }
  }
  g.globalAlpha = ghost; g.fillStyle = d.body; g.beginPath(); tracePoly(g, R.body); g.fill();
  if (!small) { // the side away from the light (north-west) in shadow
    const mi = Math.round(R.S.length * 0.45), nrm = R.N[mi], away = (nrm[0] * -0.6 + nrm[1] * -0.8) > 0 ? -1 : 1, half = [];
    for (let i = 1; i < R.S.length - 1; i++) half.push(R.S[i]);
    for (let i = R.S.length - 2; i >= 1; i--) { const w = R.width(i) / 2 * 0.92; half.push([R.S[i][0] + R.N[i][0] * w * away, R.S[i][1] + R.N[i][1] * w * away]); }
    g.globalAlpha = 0.17 * ghost; g.fillStyle = '#1a120c'; g.beginPath(); tracePoly(g, half); g.fill();
  }
  g.globalAlpha = 0.95 * ghost; g.strokeStyle = INK; g.lineWidth = lw; g.beginPath(); tracePoly(g, R.body); g.stroke();
  if (!small) {
    g.globalAlpha = 0.55 * ghost; g.lineWidth = lw * 0.6; g.beginPath(); // dorsal spines
    for (let i = 2; i < R.S.length - 2; i++) { const p = R.S[i], t = R.T[i], k = R.width(i) * 0.18; g.moveTo(p[0] + t[0] * k, p[1] + t[1] * k); g.lineTo(p[0] - t[0] * k * 1.4, p[1] - t[1] * k * 1.4); }
    g.stroke();
    const hp = R.at(R.hipI + 0.3), tn = R.T[R.ri(R.hipI)], nn = R.N[R.ri(R.hipI)], hw = R.width(R.hipI) * 0.55;
    g.globalAlpha = 0.8 * ghost; g.lineWidth = lw * 0.8; g.beginPath(); // hind legs tucked under
    for (const sgn of [1, -1]) { const a = [hp[0] + nn[0] * hw * sgn, hp[1] + nn[1] * hw * sgn]; g.moveTo(a[0], a[1]); g.lineTo(a[0] - tn[0] * R.Le * 0.045 + nn[0] * R.Le * 0.012 * sgn, a[1] - tn[1] * R.Le * 0.045 + nn[1] * R.Le * 0.012 * sgn); }
    g.stroke();
    const head = R.at(0.55), hw2 = R.width(0.55) * 0.42, Tt = R.T[0], Nn = R.N[0];
    g.globalAlpha = 0.95 * ghost; g.strokeStyle = d.crest || INK; g.lineWidth = lw * 1.25; g.beginPath(); // horns
    for (const sgn of [1, -1]) { const a = [head[0] + Nn[0] * hw2 * sgn, head[1] + Nn[1] * hw2 * sgn]; g.moveTo(a[0], a[1]); g.quadraticCurveTo(a[0] - Tt[0] * R.Le * 0.03 + Nn[0] * R.Le * 0.022 * sgn, a[1] - Tt[1] * R.Le * 0.03 + Nn[1] * R.Le * 0.022 * sgn, a[0] - Tt[0] * R.Le * 0.075 + Nn[0] * R.Le * 0.016 * sgn, a[1] - Tt[1] * R.Le * 0.075 + Nn[1] * R.Le * 0.016 * sgn); }
    g.stroke();
    const e = R.at(0.25); g.fillStyle = d.eye || INK; g.globalAlpha = 0.9 * ghost;
    for (const sgn of [1, -1]) { g.beginPath(); g.arc(e[0] + Nn[0] * R.width(0.25) * 0.26 * sgn, e[1] + Nn[1] * R.width(0.25) * 0.26 * sgn, Math.max(0.8 * px, R.Le * 0.0055), 0, K.TAU); g.fill(); }
  }
  g.globalAlpha = 1;
  // the rider and a pennant in the rider's colours; an idle dragon carries its bonded rider's pennant
  const riderId = pose.rider, bonded = !riderId && state.dragons[id] && state.dragons[id].rider;
  const pid = riderId || bonded, P = pid ? state.people[pid] : null, col = P ? sideCol[P.side] : null;
  if (P && col && P.alive) {
    g.globalAlpha = Math.max(0.5, ghost);
    const rp = R.at(R.shI - 0.9), Tt = R.T[R.ri(R.shI)], Nn = R.N[R.ri(R.shI)];
    const len = Math.max(R.Le * (riderId ? 0.085 : 0.06), (riderId ? 10 : 7.5) * px), w = len * 0.46;
    if (riderId) { g.fillStyle = INK; g.beginPath(); g.arc(rp[0], rp[1], Math.max(1.6 * px, R.Le * 0.016), 0, K.TAU); g.fill(); }
    const base = riderId ? rp : R.at(R.shI + 0.4);
    const tip = [base[0] - Tt[0] * len + Nn[0] * len * 0.2, base[1] - Tt[1] * len + Nn[1] * len * 0.2];
    const q = [[base[0] + Nn[0] * w / 2, base[1] + Nn[1] * w / 2], tip, [base[0] - Nn[0] * w / 2, base[1] - Nn[1] * w / 2]];
    g.fillStyle = col; g.beginPath(); tracePoly(g, q); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.8 * px; g.stroke();
    g.globalAlpha = 1;
  }
  if (pose.chained) {
    g.strokeStyle = INK; g.globalAlpha = 0.6; g.lineWidth = 0.8 * px; g.setLineDash([1.6 * px, 1.4 * px]);
    const nk = R.at(2), c = R.at(R.S.length * 0.6);
    g.beginPath(); g.moveTo(nk[0], nk[1]); g.lineTo(nk[0] + R.Le * 0.12, nk[1] + R.Le * 0.08); g.moveTo(c[0], c[1]); g.lineTo(c[0] - R.Le * 0.1, c[1] + R.Le * 0.1); g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
  }
}

export function drawFire(g, R, sc, clock, seed, fireCol) {
  const T = R.T[0], N = R.N[0], s = R.snout, px = 1 / sc;
  const len = Math.max(R.Le * 0.5, 22 * px), fl = 1 + 0.25 * K.noise1(clock * 7 + seed, seed), P = [];
  const w = (u, k) => (0.008 + 0.05 * Math.sin(u * Math.PI * 0.9) * (1 - 0.35 * u)) * R.Le * fl * (1 + 0.35 * K.noise1(u * 7 + clock * 11, seed + k));
  for (let i = 0; i <= 12; i++) { const u = i / 12, ww = w(u, 3); P.push([s[0] + T[0] * len * u + N[0] * ww, s[1] + T[1] * len * u + N[1] * ww]); }
  for (let i = 12; i >= 0; i--) { const u = i / 12, ww = w(u, 5); P.push([s[0] + T[0] * len * u - N[0] * ww, s[1] + T[1] * len * u - N[1] * ww]); }
  g.globalAlpha = 0.42; g.fillStyle = fireCol; g.beginPath(); tracePoly(g, P); g.fill();
  g.globalAlpha = 0.4; g.fillStyle = '#e8b664';
  g.save(); g.translate(s[0], s[1]); g.scale(0.55, 0.55); g.translate(-s[0], -s[1]); g.beginPath(); tracePoly(g, P); g.fill(); g.restore();
  g.globalAlpha = 1;
}
