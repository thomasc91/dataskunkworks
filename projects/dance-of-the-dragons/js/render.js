// render.js — draws one frame of the stage. Washes are raster (baked once, blur-tolerant);
// ink is vector (drawn live at three levels of detail, culled); dragons and figures are drawn
// fresh each frame by the same hand.

import { SHEET, MAP, LOC, EDGES, S0, STEPS, PEOPLE } from './data.js';
import { DR, pt, keyOf, dragonPose, pathAt, legU } from './world.js';
import * as K from './ink.js';
import { rig, drawShadow, drawDragon as drawDragonRig, drawFire as drawFireRig } from './dragon.js';

export const INK = '#241d18', INK2 = '#5a5047', INK3 = '#8a7f72', VELLUM = '#efe7d6';
export const GREEN = '#12683a', BLACK = '#1b1b18', FIRE = '#c07a14';
export const SIDE_COL = { green: GREEN, black: BLACK };
const LODS = [4.5, 11, 26];
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function addPoly(p, P) { p.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) p.lineTo(P[i][0], P[i][1]); p.closePath(); }
function tracePoly(g, P) { g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); g.closePath(); }
function fillPoly(g, P) { g.beginPath(); tracePoly(g, P); g.fill(); }
function strokePoly(g, P, close = true) { g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); if (close) g.closePath(); g.stroke(); }
const inLand = (x, y) => K.pointInPoly(x, y, MAP.land) || Object.values(MAP.islands).some(p => K.pointInPoly(x, y, p));
const inLake = (x, y) => K.pointInPoly(x, y, MAP.lake) && !K.pointInPoly(x, y, MAP.isle);
const isWater = (x, y) => !inLand(x, y) || inLake(x, y);
const hitBox = (b, v) => b[0] <= v[2] && b[2] >= v[0] && b[1] <= v[3] && b[3] >= v[1];
function bboxOf(P, pad = 0) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of P) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]; }
function clipRuns(P, b) { // split a polyline into runs inside a box (with one point of slack)
  const runs = []; let cur = [];
  const inside = p => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
  for (let i = 0; i < P.length; i++) {
    const inn = inside(P[i]) || (i > 0 && inside(P[i - 1])) || (i < P.length - 1 && inside(P[i + 1]));
    if (inn) cur.push(P[i]); else if (cur.length) { if (cur.length > 1) runs.push(cur); cur = []; }
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}

/* ------------------------------ the sheet ------------------------------ */
function washLayers(q, poly, rgb, a, n, amp, seed, step = 1.1) {
  const P = K.resampleClosed(poly, step), base = K.warp(P, amp, 1 / 9, seed, 0);
  q.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  for (let j = 0; j < n; j++) { const L = K.warp(base, amp * 0.8, 1 / 4.5, seed + 31 * (j + 1), -amp * 0.2 * (j % 4)); q.beginPath(); tracePoly(q, L); q.fill(); }
  q.lineJoin = 'round'; q.strokeStyle = `rgba(${rgb[0] * 0.75 | 0},${rgb[1] * 0.75 | 0},${rgb[2] * 0.75 | 0},${Math.min(0.5, a * 2.6)})`; q.lineWidth = 0.2;
  q.beginPath(); tracePoly(q, base); q.stroke();
}
function bakeSheet(grain, cloud) {
  const [x0, y0, x1, y1] = SHEET, KT = 8;
  const w = Math.round((x1 - x0) * KT), h = Math.round((y1 - y0) * KT);
  const base = mk(w, h), g = base.getContext('2d');
  const toMap = q => q.setTransform(KT, 0, 0, KT, -x0 * KT, -y0 * KT);
  g.fillStyle = VELLUM; g.fillRect(0, 0, w, h);
  toMap(g);
  const r = K.rng(99);
  for (let i = 0; i < 110; i++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), rad = 5 + r() * 32, dark = r() < 0.55, a = 0.016 + r() * 0.03;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, dark ? `rgba(150,118,70,${a})` : `rgba(255,255,250,${a * 1.4})`); grd.addColorStop(1, 'rgba(150,118,70,0)');
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2;
  const vg = g.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 1.02);
  vg.addColorStop(0, 'rgba(120,92,50,0)'); vg.addColorStop(1, 'rgba(120,92,50,0.17)');
  g.fillStyle = vg; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.lineCap = 'round';
  for (let i = 0; i < 700; i++) { // fibres
    let x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), ang = r() * K.TAU;
    const len = 0.6 + r() * 3, bend = (r() - 0.5) * 0.25, light = r() < 0.45;
    g.strokeStyle = light ? `rgba(255,255,252,${0.2 + r() * 0.25})` : `rgba(110,90,60,${0.05 + r() * 0.08})`;
    g.lineWidth = 0.05 + r() * 0.07;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { ang += bend; x += Math.cos(ang) * len / 5; y += Math.sin(ang) * len / 5; g.lineTo(x, y); }
    g.stroke();
  }
  // washes on their own layer, speckled, then multiplied onto the vellum
  const wash = mk(w, h), q = wash.getContext('2d'); toMap(q);
  const islands = Object.values(MAP.islands);
  q.save();
  const sea = new Path2D(); sea.rect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20); addPoly(sea, MAP.land); islands.forEach(p => addPoly(sea, p));
  q.clip(sea, 'evenodd');
  const coast = new Path2D(); addPoly(coast, MAP.land); islands.forEach(p => addPoly(coast, p));
  q.lineJoin = 'round';
  [[8, 0.045], [4.6, 0.055], [2.4, 0.07], [1, 0.085]].forEach(([lw, a]) => { q.strokeStyle = `rgba(84,110,138,${a})`; q.lineWidth = lw; q.stroke(coast); });
  q.restore();
  washLayers(q, MAP.land, [196, 164, 106], 0.042, 8, 1.4, 101, 1.4);
  islands.forEach((p, i) => washLayers(q, p, [196, 164, 106], 0.05, 7, 0.45, 131 + i, 0.5));
  washLayers(q, MAP.lake, [78, 106, 134], 0.08, 9, 0.6, 151, 0.6);
  washLayers(q, MAP.isle, [196, 164, 106], 0.09, 5, 0.18, 157, 0.3);
  Object.values(MAP.forests).forEach((p, i) => washLayers(q, p, [104, 116, 80], 0.055, 7, 0.9, 171 + i, 0.8));
  q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'destination-out';
  q.globalAlpha = 0.3; q.fillStyle = q.createPattern(grain, 'repeat'); q.fillRect(0, 0, w, h);
  q.globalAlpha = 0.42; q.fillStyle = q.createPattern(cloud, 'repeat'); q.fillRect(0, 0, w, h);
  q.globalAlpha = 1; q.globalCompositeOperation = 'source-over';
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'multiply'; g.drawImage(wash, 0, 0); g.globalCompositeOperation = 'source-over';
  return base;
}
function makeDeckle() {
  const [x0, y0, x1, y1] = SHEET, pts = [];
  const edge = (ax, ay, bx, by, off) => {
    const len = Math.hypot(bx - ax, by - ay), n = Math.ceil(len / 0.7);
    for (let i = 0; i < n; i++) { const t = i / n, d = 0.32 * K.noise1(i * 0.5 + off, 4242) + 0.14 * K.noise1(i * 1.9 + off, 4243); pts.push([ax + (bx - ax) * t + (by - ay) / len * d, ay + (by - ay) * t - (bx - ax) / len * d]); }
  };
  edge(x0, y0, x1, y0, 0); edge(x1, y0, x1, y1, 100); edge(x1, y1, x0, y1, 200); edge(x0, y1, x0, y0, 300);
  const p = new Path2D(); addPoly(p, pts); return p;
}

/* ------------------------------ map ink by LOD ------------------------------ */
function pushChunks(target, P, W, chunk = 150) {
  for (let i = 0; i < P.length - 1; i += chunk) {
    const Q = P.slice(i, Math.min(P.length, i + chunk + 1)), WQ = W.slice(i, Math.min(P.length, i + chunk + 1));
    const path = new Path2D(); K.ribbonPath(path, Q, WQ);
    target.push({ path, bb: bboxOf(Q, 1) });
  }
}
function seaSign(P, d, waterInside) { // which side of the line is water
  let plus = 0, minus = 0; const n = P.length, step = Math.max(1, Math.floor(n / 16));
  for (let i = step; i < n - 1; i += step) {
    const a = P[i - 1], b = P[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l;
    const px = P[i][0] + ty * d, py = P[i][1] - tx * d;
    const water = waterInside ? inLake(px, py) : isWater(px, py);
    if (water) plus++; else minus++;
  }
  return plus >= minus ? 1 : -1;
}
function buildLOD(s) {
  const k = 1 / s, L = { s, coast: [], water: [], rivers: [], roads: [], trees: [], waves: [], hills: [], mont: new Path2D() };
  const box = [SHEET[0] - 4, SHEET[1] - 4, SHEET[2] + 4, SHEET[3] + 4];
  let seed = 11;
  const ink = (clean, wpx, closed, lines, waterInside) => {
    const P = K.humanize(clean, { ...K.scaleHand(K.HAND_PX.coast, k), closed }, seed++);
    const W = K.widths(P, wpx * k, seed, 3 * k, 7 * k);
    pushChunks(L.coast, P, W);
    if (!lines) return;
    const sgn = seaSign(P, 5 * k, waterInside);
    [4.2, 8.6, 13.5].forEach((dpx, j) => {
      if (j === 2 && s < 8) return;
      const Q = K.offsetLine(P, sgn * dpx * k, closed).filter((p, i) => i % 1 === 0);
      const WQ = new Float32Array(Q.length).fill((0.75 - j * 0.12) * k);
      pushChunks(L.water, Q, WQ, 200);
    });
  };
  for (const run of clipRuns(MAP.land.slice(1, MAP.land.length - 1), box)) ink(run, 1.7, false, true, false);
  for (const poly of Object.values(MAP.islands)) ink(poly.concat([poly[0]]), 1.5, true, true, false);
  ink(MAP.lake.concat([MAP.lake[0]]), 1.4, true, true, true);
  ink(MAP.isle.concat([MAP.isle[0]]), 1.1, true, false, false);
  for (const r of Object.values(MAP.rivers)) for (const run of clipRuns(r, box)) {
    const P = K.humanize(run, K.scaleHand(K.HAND_PX.river, k), seed++), n = P.length, W = new Float32Array(n);
    for (let i = 0; i < n; i++) W[i] = (0.55 + 1.15 * (i / (n - 1))) * k;
    pushChunks(L.rivers, P, W);
  }
  for (const r of Object.values(MAP.roads)) for (const run of clipRuns(r, box)) {
    const P = K.resample(K.humanize(run, K.scaleHand(K.HAND_PX.pencil, k), seed++), 4.5 * k);
    for (let i = 0; i < P.length; i += 60) {
      const path = new Path2D(), Q = P.slice(i, i + 61);
      for (const [x, y] of Q) { path.moveTo(x + 0.62 * k, y); path.arc(x, y, 0.62 * k, 0, K.TAU); }
      L.roads.push({ path, bb: bboxOf(Q, 1) });
    }
  }
  // trees: a field of small loops, about 13 px apart at this level
  const cell = 10, grid = new Map(), rt = K.rng(501 + s);
  const addToGrid = (arr, x, y, draw) => { const key = Math.floor(x / cell) + ',' + Math.floor(y / cell); let c = grid.get(arr + key); if (!c) { c = { path: new Path2D(), bb: [Math.floor(x / cell) * cell - 2, Math.floor(y / cell) * cell - 2, Math.floor(x / cell) * cell + cell + 2, Math.floor(y / cell) * cell + cell + 2] }; grid.set(arr + key, c); L[arr].push(c); } draw(c.path); };
  for (const poly of Object.values(MAP.forests)) {
    const b = bboxOf(poly), sp = 13 * k;
    for (let y = b[1]; y < b[3]; y += sp * 0.86) for (let x = b[0]; x < b[2]; x += sp) {
      const jx = x + (rt() - 0.5) * sp * 0.8, jy = y + (rt() - 0.5) * sp * 0.8;
      if (!K.pointInPoly(jx, jy, poly) || !inLand(jx, jy)) continue;
      const rr = (2.6 + rt() * 1.2) * k, loop = [];
      for (let a = 0; a <= 12; a++) { const an = -Math.PI / 2 + a / 12 * K.TAU * 1.05; loop.push([jx + Math.cos(an) * rr * (1 + 0.12 * Math.sin(a * 2.3)), jy - rr + Math.sin(an) * rr]); }
      addToGrid('trees', jx, jy, p => {
        K.ribbonPath(p, loop, new Float32Array(loop.length).fill(0.85 * k));
        K.ribbonPath(p, [[jx, jy], [jx + 0.2 * k, jy + 2.6 * k]], new Float32Array([0.8 * k, 0.8 * k]));
      });
    }
  }
  // waves: sparse strokes on open water
  const rw = K.rng(777 + s), wsp = 38 * k;
  for (let y = SHEET[1] + 2; y < SHEET[3] - 2; y += wsp * 0.7) for (let x = SHEET[0] + 2; x < SHEET[2] - 2; x += wsp) {
    const jx = x + (rw() - 0.5) * wsp * 0.9, jy = y + (rw() - 0.5) * wsp * 0.6, d = 9 * k;
    if (!isWater(jx, jy) || !isWater(jx + d, jy) || !isWater(jx - d, jy) || !isWater(jx, jy + d) || !isWater(jx, jy - d)) continue;
    const w = (5 + rw() * 3) * k, P = [];
    for (let i = 0; i <= 10; i++) { const u = i / 10; P.push([jx - w + 2 * w * u, jy - Math.sin(u * K.TAU) * 1.1 * k]); }
    addToGrid('waves', jx, jy, p => K.ribbonPath(p, P, K.widths(P, 0.8 * k, 3, 1.2 * k, 2 * k, 0.4, 0)));
  }
  // hills: little hachured bumps along a line
  for (const line of MAP.hills) {
    const P = K.resample(line, 7 * k);
    P.forEach(([x, y], i) => {
      const w = 4.2 * k, h = 3 * k, bump = [];
      for (let a = 0; a <= 8; a++) { const u = a / 8; bump.push([x - w + 2 * w * u, y - Math.sin(u * Math.PI) * h]); }
      addToGrid('hills', x, y, p => {
        K.ribbonPath(p, bump, K.widths(bump, 0.9 * k, i, 1 * k, 1.5 * k, 0.5, 0));
        K.ribbonPath(p, [[x + 0.8 * k, y - 1.6 * k], [x + 2.4 * k, y - 0.2 * k]], new Float32Array([0.55 * k, 0.55 * k]));
      });
    });
  }
  // the Dragonmont: a smoking cone (map scale)
  const m = [LOC.dragonmont.x, LOC.dragonmont.y];
  const cone = [[m[0] - 1.4, m[1] + 0.9], [m[0] - 0.25, m[1] - 1.1], [m[0] + 0.3, m[1] - 1.1], [m[0] + 1.5, m[1] + 0.9]];
  K.ribbonPath(L.mont, K.humanize(cone, K.scaleHand(K.HAND_PX.line, k), 91), K.widths(K.humanize(cone, K.scaleHand(K.HAND_PX.line, k), 91), 1.2 * k, 91));
  const smoke = []; for (let i = 0; i <= 14; i++) { const u = i / 14; smoke.push([m[0] + Math.sin(u * 5) * 0.35 + u * 0.6, m[1] - 1.3 - u * 2.2]); }
  K.ribbonPath(L.mont, smoke, K.widths(smoke, 0.8 * k, 92, 1 * k, 4 * k, 0.5, 0));
  return L;
}

/* ------------------------------ glyphs in screen space ------------------------------ */
function jitterer(seed) { const r = K.rng(seed); return (x, y, a = 0.32) => [x + (r() - 0.5) * a * 2, y + (r() - 0.5) * a * 2]; }
function glyphPath(kind, variant) {
  const j = jitterer(K.strHash(kind) + variant * 7919), p = new Path2D(), f = new Path2D();
  const poly = (pts, fill = true) => { const q = pts.map(([x, y]) => j(x, y)); p.moveTo(q[0][0], q[0][1]); q.slice(1).forEach(([x, y]) => p.lineTo(x, y)); if (fill) { f.moveTo(q[0][0], q[0][1]); q.slice(1).forEach(([x, y]) => f.lineTo(x, y)); f.closePath(); } };
  const tower = (x, w, h) => poly([[x - w / 2, 0], [x - w / 2, -h], [x - w / 2 - 0.6, -h], [x - w / 2 - 0.6, -h - 1.6], [x - w / 6, -h - 1.6], [x - w / 6, -h - 0.7], [x + w / 6, -h - 0.7], [x + w / 6, -h - 1.6], [x + w / 2 + 0.6, -h - 1.6], [x + w / 2 + 0.6, -h], [x + w / 2, -h], [x + w / 2, 0], [x - w / 2, 0]]);
  if (kind === 'city') { poly([[-10, 0], [-10, -5], [10, -5], [10, 0], [-10, 0]]); tower(-7, 3.4, 9); tower(-1.5, 3.8, 12); tower(4.5, 3.4, 8); tower(8.6, 2.6, 6.5); }
  else if (kind === 'castle') { poly([[-5.5, 0], [-5.5, -4.5], [5.5, -4.5], [5.5, 0], [-5.5, 0]]); tower(-4, 3, 8.5); tower(4, 3, 8.5); }
  else if (kind === 'big') { poly([[-8, 0], [-8, -5], [8, -5], [8, 0], [-8, 0]]); tower(-6, 3.2, 9.5); tower(0, 4.2, 12.5); tower(6, 3.2, 9.5); }
  else if (kind === 'town') { poly([[-4, 0], [-4, -4], [4, -4], [4, 0], [-4, 0]]); poly([[-1.2, -4], [-1.2, -7.5], [0, -10], [1.2, -7.5], [1.2, -4]], false); }
  else if (kind === 'village') { p.moveTo(2, 0); p.arc(0, 0, 2, 0, K.TAU); f.moveTo(2, 0); f.arc(0, 0, 2, 0, K.TAU); }
  return { p, f };
}
// A standing figure, feet at (0, 0), about 20 px tall, with one identifying attribute
function figurePaths(fig, attrs, young, variant) {
  const j = jitterer(K.strHash(fig + attrs) + variant * 104729);
  const ink = new Path2D(), fill = new Path2D(), dark = new Path2D();
  const s = young || fig === 'child' ? 0.72 : 1;
  const P = (x, y) => j(x * s, y * s, 0.28);
  const line = pts => { const q = pts.map(([x, y]) => P(x, y)); ink.moveTo(q[0][0], q[0][1]); q.slice(1).forEach(([x, y]) => ink.lineTo(x, y)); };
  const shape = pts => { const q = pts.map(([x, y]) => P(x, y)); for (const g of [ink, fill]) { g.moveTo(q[0][0], q[0][1]); q.slice(1).forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); } };
  const robed = ['king', 'queen', 'princess', 'lady', 'maester', 'veiled', 'lord', 'prince'].includes(fig) || fig === 'child';
  if (robed) shape([[-4.4, 0], [-2.5, -11.4], [2.5, -11.4], [4.4, 0]]);
  else { shape([[-3.1, -4.6], [-2.5, -11.4], [2.5, -11.4], [3.1, -4.6]]); line([[-1.4, -4.6], [-1.9, 0]]); line([[1.4, -4.6], [1.9, 0]]); }
  const [hx, hy] = P(0, -14.6); const hr = 2.7 * s;
  for (const g of [ink, fill]) { g.moveTo(hx + hr, hy); g.arc(hx, hy, hr, 0, K.TAU); }
  const at = new Set(attrs.split(',').filter(Boolean));
  if (at.has('crown')) line([[-2.6, -16.8], [-2.6, -19.6], [-1.3, -18.2], [0, -20.2], [1.3, -18.2], [2.6, -19.6], [2.6, -16.8]]);
  else if (fig === 'prince' || fig === 'princess' || fig === 'queen') line([[-2.7, -16.2], [0, -17.4], [2.7, -16.2]]);
  if (fig === 'kingsguard' || fig === 'knight') line([[-2.9, -13.3], [-2.9, -17.6], [2.9, -17.6], [2.9, -13.3]]);
  if (fig === 'lord' || fig === 'common') line([[-3.3, -13.4], [-2.6, -17.4], [0, -18.3], [2.6, -17.4], [3.3, -13.4]]);
  if (fig === 'veiled') { line([[-3.6, -11], [-3.2, -16.6], [0, -18.4], [3.2, -16.6], [3.6, -11]]); }
  if (fig === 'maester') for (let i = -2; i <= 2; i++) { const [x, y] = P(i * 1.1, -9.6 + Math.abs(i) * -0.3); dark.moveTo(x + 0.55, y); dark.arc(x, y, 0.55, 0, K.TAU); }
  if (at.has('hand')) { const [x, y] = P(0, -8.2); dark.moveTo(x + 1.4, y); dark.arc(x, y, 1.4, 0, K.TAU); }
  if (at.has('protector')) { line([[-1.5, -9.4], [1.5, -9.4], [1.5, -7.6], [0, -6.2], [-1.5, -7.6], [-1.5, -9.4]]); }
  if (at.has('sword')) line([[-4.8, -2.4], [4.6, -15.6]]);
  if (at.has('eyepatch')) line([[-2.6, -16], [2.4, -13.8]]);
  if (at.has('ship')) line([[-5, 1.6], [5, 1.6], [3.4, 3.4], [-3.4, 3.4], [-5, 1.6]]);
  const flag = new Path2D(), pole = new Path2D();
  const [a0, a1] = [P(5.6, 0), P(5.6, -21.5)]; pole.moveTo(a0[0], a0[1]); pole.lineTo(a1[0], a1[1]);
  const fq = [P(5.6, -21.5), P(12.6, -19.6), P(5.6, -17.4)]; flag.moveTo(fq[0][0], fq[0][1]); flag.lineTo(fq[1][0], fq[1][1]); flag.lineTo(fq[2][0], fq[2][1]); flag.closePath();
  return { ink, fill, dark, flag, pole, h: 22 * s };
}

/* ------------------------------ the renderer ------------------------------ */
export function createRenderer() {
  const tooth = K.toothTile(), grain = K.grainTile(), cloud = K.cloudTile();
  const sheetTex = bakeSheet(grain, cloud), deckle = makeDeckle();
  const lods = [], glyphs = new Map(), labels = new Map(), figs = new Map();
  const lod = i => (lods[i] || (lods[i] = buildLOD(LODS[i])));
  const prevRoutes = new Map();
  const label = (text, cap, opts = {}) => { const k = text + '|' + cap + '|' + (opts.track || 0) + '|' + (opts.align || 'center'); let v = labels.get(k); if (!v) { v = K.letterPath(text, cap, { align: 'center', ...opts }); labels.set(k, v); } return v; };
  const glyph = (kind, v) => { const k = kind + v; let g = glyphs.get(k); if (!g) { g = glyphPath(kind, v); glyphs.set(k, g); } return g; };
  const figure = (fig, attrs, young, v) => { const k = fig + '|' + attrs + '|' + young + '|' + v; let f = figs.get(k); if (!f) { f = figurePaths(fig, attrs, young, v); figs.set(k, f); } return f; };
  const scarShapes = new Map(), toothPats = new WeakMap();
  const blob = (key, r, seed) => { let s = scarShapes.get(key); if (!s) { const P = []; for (let i = 0; i < 18; i++) { const a = i / 18 * K.TAU, rr = r * (1 + 0.28 * K.noise1(i * 0.8, seed) + 0.12 * K.noise1(i * 2.1, seed + 1)); P.push([Math.cos(a) * rr, Math.sin(a) * rr]); } s = P; scarShapes.set(key, s); } return s; };
  let riverBurn = null;

  function render(g, cw, ch, dpr, F) {
    const { state, si, t, cam, safe, clock, boil } = F;
    const sc = safe.w / cam[2], ox = safe.x + safe.w / 2, oy = safe.y + safe.h / 2, phone = safe.w < 520, LS = phone ? 0.78 : 1;
    const toS = (x, y) => [ox + (x - cam[0]) * sc, oy + (y - cam[1]) * sc];
    const setMap = () => g.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (ox - cam[0] * sc), dpr * (oy - cam[1] * sc));
    const setScr = () => g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const view = [cam[0] - (ox + 60) / sc, cam[1] - (oy + 60) / sc, cam[0] + (cw - ox + 60) / sc, cam[1] + (ch - oy + 60) / sc];
    const hits = [];
    const step = STEPS[si];
    const fresh = m => m.si === si && t >= m.t && t - m.t < 0.3;

    // desk and sheet
    setScr(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = F.desk || '#e9e4d8'; g.fillRect(0, 0, cw, ch);
    setMap();
    g.save(); g.shadowColor = 'rgba(40,30,20,0.28)'; g.shadowBlur = 18 * dpr; g.shadowOffsetY = 4 * dpr;
    g.fillStyle = VELLUM; g.fill(deckle); g.restore();
    g.save(); g.clip(deckle);
    g.imageSmoothingQuality = 'high';
    g.drawImage(sheetTex, SHEET[0], SHEET[1], SHEET[2] - SHEET[0], SHEET[3] - SHEET[1]);

    // burned land: the riverlands wash, burns, dragon scars
    for (const rg of state.regions) {
      const k = rg.si === si ? K.smooth(rg.t0, rg.t1, t) : 1;
      if (!riverBurn) riverBurn = K.warp(K.resampleClosed(MAP.riverlandsBurn, 1), 3, 1 / 10, 61, 0);
      g.globalAlpha = 0.16 * k; g.fillStyle = 'rgb(66,50,38)'; fillPoly(g, riverBurn);
      g.globalAlpha = 0.1 * k; fillPoly(g, K.warp(riverBurn, 2, 1 / 6, 62, -1.5));
    }
    const perKey = new Map();
    const nth = key => { const n = perKey.get(key) || 0; perKey.set(key, n + 1); return n; };
    for (const m of state.marks) {
      if (m.kind === 'burn' || (m.kind === 'dragon' && !m.water)) {
        const r = m.kind === 'burn' ? m.r : 0.8 + 3.2 * DR[m.d].size, i = m.kind === 'dragon' ? nth('s' + m.key) : 0;
        const x = m.at[0] + Math.cos(i * 2.4) * i * 0.9, y = m.at[1] + Math.sin(i * 2.4) * i * 0.9;
        const P = blob(m.kind + (m.d || m.key), r, K.strHash(m.d || m.key)).map(([a, b]) => [x + a, y + b]);
        g.globalAlpha = 0.3; g.fillStyle = 'rgb(62,47,36)'; fillPoly(g, P);
        g.globalAlpha = 0.42; g.strokeStyle = INK; g.lineWidth = 0.9 / sc; strokePoly(g, P);
        if (fresh(m)) { g.globalAlpha = 0.9 * (1 - (t - m.t) / 0.3); g.strokeStyle = FIRE; g.lineWidth = 2.2 / sc; strokePoly(g, P); }
        g.globalAlpha = 1;
        m._p = [x, y, r];
      } else if (m.kind === 'dragon' && m.water) {
        const r = 0.7 + 2.6 * DR[m.d].size;
        g.strokeStyle = INK; g.lineWidth = 0.8 / sc;
        [0.45, 0.8, 1.15].forEach((k, j) => { g.globalAlpha = 0.5 - j * 0.12; const P = blob('w' + m.d + j, r * k, K.strHash(m.d) + j).map(([a, b]) => [m.at[0] + a, m.at[1] + b * 0.7]); strokePoly(g, P); });
        g.globalAlpha = 1; m._p = [m.at[0], m.at[1], r];
      }
    }

    // map ink at the nearest level of detail
    const li = sc < 7 ? 0 : sc < 17 ? 1 : 2, L = lod(li);
    g.fillStyle = INK;
    g.globalAlpha = 0.34; for (const c of L.water) if (hitBox(c.bb, view)) g.fill(c.path);
    g.globalAlpha = 0.42; for (const c of L.waves) if (hitBox(c.bb, view)) g.fill(c.path);
    g.globalAlpha = 0.62; for (const c of L.trees) if (hitBox(c.bb, view)) g.fill(c.path);
    g.globalAlpha = 0.7; for (const c of L.hills) if (hitBox(c.bb, view)) g.fill(c.path);
    g.globalAlpha = 0.5; for (const c of L.roads) if (hitBox(c.bb, view)) g.fill(c.path);
    g.globalAlpha = 0.82; for (const c of L.rivers) if (hitBox(c.bb, view)) g.fill(c.path);
    g.globalAlpha = 0.9; for (const c of L.coast) if (hitBox(c.bb, view)) g.fill(c.path);
    g.globalAlpha = 0.8; g.fill(L.mont);
    g.globalAlpha = 1;

    // routes: earlier steps faint, this step's legs inking themselves behind the dragons
    if (F.routes) {
      g.strokeStyle = INK; g.lineWidth = 0.9 / sc; g.globalAlpha = 0.11;
      for (let sj = 0; sj < si; sj++) for (const Lg of STEPS[sj].legs) {
        if (Lg.fight || Lg.fall || !Lg.geo) continue;
        let p = prevRoutes.get(Lg); if (!p) { p = new Path2D(); const P = Lg.geo.pts; p.moveTo(P[0][0], P[0][1]); for (const q of P) p.lineTo(q[0], q[1]); prevRoutes.set(Lg, p); }
        g.stroke(p);
      }
      g.globalAlpha = 1;
    }
    for (const Lg of step.legs) {
      if (Lg.fight || Lg.fall || !Lg.geo || t < Lg.t0) continue;
      const u = t >= Lg.t1 ? 1 : legU(Lg, t), P = Lg.geo.pts, upto = u * Lg.geo.len;
      g.beginPath(); g.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length && Lg.geo.cum[i] <= upto; i++) g.lineTo(P[i][0], P[i][1]);
      const e = pathAt(Lg.geo, upto); g.lineTo(e.x, e.y);
      g.strokeStyle = INK; g.globalAlpha = t >= Lg.t1 ? 0.26 : 0.55; g.lineWidth = 1.05 / sc;
      g.setLineDash(Lg.conf === 'unknown' ? [1.5 / sc, 4 / sc] : Lg.conf === 'inferred' ? [5 / sc, 3.5 / sc] : []);
      g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      if (Lg.conf === 'unknown' && t < Lg.t1) { setScr(); g.font = 'italic 600 13px Fraunces, Georgia, serif'; g.fillStyle = INK2; const a = toS(P[0][0], P[0][1]); g.fillText('?', a[0] + 6, a[1] - 6); setMap(); }
    }
    // moves: people travelling without a dragon
    const moving = new Map();
    for (const M of step.moves) {
      if (t < M.t0) continue;
      const u = t >= M.t1 ? 1 : K.easeInOut(K.clamp((t - M.t0) / (M.t1 - M.t0), 0, 1)), P = M.geo.pts, upto = u * M.geo.len;
      if (t >= M.t1 && M.mode !== 'army') continue;
      g.beginPath(); g.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length && M.geo.cum[i] <= upto; i++) g.lineTo(P[i][0], P[i][1]);
      const e = pathAt(M.geo, upto); g.lineTo(e.x, e.y);
      const dash = { road: [3, 3], army: [6, 2.5], ship: [1.4, 3.6], hidden: [1, 5], message: [1, 2.6], litter: [2, 3], captive: [2, 2] }[M.mode] || [3, 3];
      g.setLineDash(dash.map(v => v / sc)); g.strokeStyle = M.mode === 'message' ? FIRE : INK; g.globalAlpha = t >= M.t1 ? 0.2 : M.mode === 'hidden' ? 0.4 : 0.6; g.lineWidth = 1 / sc; g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      if (t < M.t1) moving.set(M, [e.x, e.y, e.tx, e.ty]);
    }

    // dragons: shadows, then perched, then aloft by altitude
    const poses = [];
    for (const id in DR) {
      const p = dragonPose(id, null, si, t, state, clock);
      if (!p) continue;
      if (step.vignette && p.perched && ['dragonpit', 'red_keep', 'kings_landing'].includes(state.dragons[id].at)) continue; // the vignette shows these
      if (p.leg && !p.fighting && !p.falling) { const u = legU(p.leg, t); p.glide = u > 0.74 && !p.leg.fight; }
      if (p.orbit) p.glide = Math.sin(clock * 0.31 + K.strHash(id) % 7) > 0.45;
      poses.push([id, p]);
    }
    poses.sort((a, b) => (a[1].perched ? -1 : a[1].alt) - (b[1].perched ? -1 : b[1].alt));
    const rigs = poses.map(([id, p]) => [id, p, rig(id, p, sc, clock, F.minPx || 14, F.reduced ? 0 : boil + 1)]);
    const actorsD = new Set(step.legs.map(l => l.d).concat(step.ev.filter(e => e.d).map(e => e.d)));
    const isFrameStep = si === 0 || si === STEPS.length - 1;
    const dimOf = id => (!isFrameStep && !F.dip && sc > 7 && !actorsD.has(id) && F.hoverId !== id) ? 0.36 : 1;
    for (const [id, p, R] of rigs) if (!p.perched) drawShadow(g, R, p, sc, dimOf(id));
    const fireOn = new Set();
    for (const fw of step.fire || []) if (t >= fw.t0 && t < fw.t1) fireOn.add(fw.d);
    for (const [id, p, R] of rigs) {
      drawDragonRig(g, id, R, p, sc, state, SIDE_COL, dimOf(id));
      if (fireOn.has(id)) drawFireRig(g, R, sc, clock, K.strHash(id) % 97, FIRE);
      const m = R.at(R.S.length * 0.45), sp = toS(m[0], m[1]);
      hits.push({ type: 'dragon', id, x: sp[0], y: sp[1], r: Math.max(12, R.Le * sc * 0.28) });
    }
    g.restore(); // unclip

    // places, labels, banners (screen space)
    setScr();
    for (const [id, l] of Object.entries(LOC)) {
      if (!l.glyph || l.glyph === 'none') continue;
      const [x, y] = toS(l.x, l.y);
      if (x < -40 || y < -40 || x > cw + 40 || y > ch + 40) continue;
      const gp = glyph(l.glyph, 0);
      g.save(); g.translate(x, y); g.fillStyle = VELLUM; g.fill(gp.f); g.strokeStyle = INK; g.lineWidth = 1.05; g.lineJoin = 'round'; g.stroke(gp.p); g.restore();
      if (l.seat && state.control[id] !== undefined) {
        const side = state.control[id], bx = x + (l.glyph === 'city' ? 11 : 8), by = y - (l.glyph === 'city' ? 14 : 10);
        g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(bx, by + 9); g.lineTo(bx, by - 8); g.stroke();
        const flag = [[bx, by - 8], [bx + 11, by - 8], [bx + 8.5, by - 4.6], [bx + 11, by - 1.2], [bx, by - 1.2]];
        if (side === 'none') { g.beginPath(); g.moveTo(bx, by - 8); g.lineTo(bx + 7, by - 7.2); g.lineTo(bx + 4.4, by - 5.4); g.lineTo(bx + 6.2, by - 3.6); g.lineTo(bx, by - 1.2); g.strokeStyle = INK3; g.stroke(); }
        else { g.fillStyle = SIDE_COL[side] || VELLUM; fillPoly(g, flag); g.strokeStyle = INK; g.lineWidth = 0.9; strokePoly(g, flag); if (side === 'royal') { g.fillStyle = INK; g.beginPath(); g.arc(bx + 4.2, by - 4.6, 1.3, 0, K.TAU); g.fill(); } }
      }
      hits.push({ type: 'place', id, x, y: y - 4, r: 9 });
    }
    // labels by rank and zoom
    const rankOK = r => r === 1 || (r === 2 && sc >= 7.5) || (r === 3 && sc >= 15);
    g.fillStyle = INK;
    for (const [id, l] of Object.entries(LOC)) {
      if (!l.rank || !rankOK(l.rank)) continue;
      const [x, y] = toS(l.x, l.y), off = l.lab || [0, l.water ? 0 : 16];
      if (x < -80 || y < -40 || x > cw + 80 || y > ch + 40) continue;
      const lp = label(l.name, (l.rank === 1 ? 10.5 : l.rank === 2 ? 9 : 8) * LS);
      g.save(); g.translate(x + off[0], y + off[1]); g.globalAlpha = l.water ? 0.62 : 0.92; g.fillStyle = l.water ? '#415a72' : INK; g.fill(lp.path); g.restore();
    }
    for (const rg of MAP.regions) {
      if (!rankOK(rg.rank || 1)) continue;
      if (phone && sc < 3.5 && !rg.water) continue;
      const [x, y] = toS(rg.x, rg.y);
      if (x < -200 || y < -40 || x > cw + 200 || y > ch + 40) continue;
      const lp = label(rg.text, rg.cap * LS, { track: rg.track });
      g.save(); g.translate(x, y); g.globalAlpha = rg.water ? 0.62 : 0.5; g.fillStyle = rg.water ? '#415a72' : INK2; g.fill(lp.path); g.restore();
    }
    for (const e of EDGES) {
      const [x, y] = toS(e.x, e.y);
      if (x < -200 || y < -40 || x > cw + 200 || y > ch + 40) continue;
      const lp = label(e.text, 7.5 * LS, { track: 0.12 });
      g.save(); g.translate(x, y); g.globalAlpha = 0.6; g.fillStyle = INK2; g.fill(lp.path);
      const a = e.dir * K.DEG, ax = Math.cos(a), ay = Math.sin(a), bx = ax * (lp.width / 2 + 14), by = ay * 14 - 3;
      g.strokeStyle = INK2; g.lineWidth = 1; g.beginPath(); g.moveTo(bx - ax * 10, by - ay * 10); g.lineTo(bx, by); g.lineTo(bx - ax * 4 - ay * 3, by - ay * 4 + ax * 3); g.moveTo(bx, by); g.lineTo(bx - ax * 4 + ay * 3, by - ay * 4 - ax * 3); g.stroke(); g.restore();
    }

    // marks: crosses, battles, tallies, scar names
    g.globalAlpha = 1;
    const pk = new Map();
    for (const m of state.marks) {
      const [x, y] = toS(m.at[0], m.at[1]);
      if (m.kind === 'person') {
        const i = pk.get(m.key) || 0; pk.set(m.key, i + 1);
        const r = i ? 8 + 3.4 * Math.sqrt(i) : 0, a = i * 2.4 + 0.6, px2 = x + Math.cos(a) * r + (i ? 0 : 0), py2 = y + Math.sin(a) * r - 2;
        const fr = fresh(m);
        g.strokeStyle = fr ? FIRE : INK; g.lineWidth = fr ? 2 : 1.5; g.globalAlpha = m.lost ? 0.55 : 0.95;
        g.beginPath(); g.moveTo(px2, py2 - 6); g.lineTo(px2, py2 + 6); g.moveTo(px2 - 3.6, py2 - 2.4); g.lineTo(px2 + 3.6, py2 - 2.4); g.stroke();
        if (m.lost) { g.setLineDash([1.5, 2]); g.beginPath(); g.arc(px2, py2, 8, 0, K.TAU); g.stroke(); g.setLineDash([]); }
        if (m.claimant) { g.lineWidth = 1.1; g.beginPath(); g.moveTo(px2 - 3, py2 - 8); g.lineTo(px2 - 3, py2 - 11); g.lineTo(px2 - 1.5, py2 - 9.6); g.lineTo(px2, py2 - 11.4); g.lineTo(px2 + 1.5, py2 - 9.6); g.lineTo(px2 + 3, py2 - 11); g.lineTo(px2 + 3, py2 - 8); g.stroke(); }
        g.globalAlpha = 1;
        if (fr || sc >= 16 || F.hoverId === m.who) { g.font = 'italic 500 10.5px Fraunces, Georgia, serif'; g.fillStyle = fr ? INK : INK2; g.textAlign = 'center'; g.fillText(PEOPLE[m.who].name, px2, py2 + 16); g.textAlign = 'start'; }
        hits.push({ type: 'mark', id: m.who, x: px2, y: py2, r: 8, m });
      } else if (m.kind === 'battle') {
        const bx = x - 12, by = y + 2;
        g.strokeStyle = INK; g.lineWidth = 1.2; g.globalAlpha = 0.85;
        g.beginPath(); g.moveTo(bx - 4, by - 4); g.lineTo(bx + 4, by + 4); g.moveTo(bx + 4, by - 4); g.lineTo(bx - 4, by + 4);
        g.moveTo(bx - 4.8, by - 1.6); g.lineTo(bx - 1.6, by - 4.8); g.moveTo(bx + 4.8, by - 1.6); g.lineTo(bx + 1.6, by - 4.8); g.stroke(); g.globalAlpha = 1;
      } else if (m.kind === 'dragon' && m._p) {
        if (fresh(m) || sc >= 6.5) {
          const [sx, sy] = toS(m._p[0], m._p[1] + m._p[2]);
          g.font = `italic 500 ${fresh(m) ? 12 : 10.5}px Fraunces, Georgia, serif`; g.fillStyle = fresh(m) ? INK : INK2; g.textAlign = 'center';
          g.fillText('† ' + DR[m.d].name, sx, sy + 12); g.textAlign = 'start';
        }
        const [sx, sy] = toS(m._p[0], m._p[1]);
        hits.push({ type: 'scar', id: m.d, x: sx, y: sy, r: Math.max(8, m._p[2] * sc), m });
      }
    }
    for (const ty of state.tallies) {
      const n = ty.si === si ? Math.floor(ty.n * K.smooth(ty.t0, ty.t1, t) + 0.001) : ty.n, [x, y] = toS(ty.at[0], ty.at[1]);
      g.strokeStyle = INK; g.lineWidth = 1.2;
      for (let i = 0; i < n; i++) {
        const grp = Math.floor(i / 5), inG = i % 5, bx = x + 26 + grp * 22 + inG * 3.6, by = y + 16;
        g.beginPath();
        if (inG === 4) { g.moveTo(bx - 16, by + 8); g.lineTo(bx + 1, by - 1); }
        else { g.moveTo(bx, by - 1); g.lineTo(bx - 0.6, by + 9); }
        g.stroke();
      }
    }

    // people: travellers, then the courts at their seats
    const riding = new Set();
    for (const [id, p] of poses) if (p.rider) riding.add(p.rider);
    for (const Lg of step.legs) if (t >= Lg.t0 && t < Lg.t1) (Lg.pass || []).forEach(x => riding.add(x));
    const onMove = new Map();
    for (const [M, pos] of moving) M.who.forEach((w, i) => onMove.set(w, [pos, i, M]));
    const actorsP = new Set();
    step.ev.forEach(e => e.who && actorsP.add(e.who)); step.moves.forEach(M => M.who.forEach(w => actorsP.add(w))); step.legs.forEach(l => { if (l.rider) actorsP.add(l.rider); (l.pass || []).forEach(w => actorsP.add(w)); });
    const fs = (phone ? 0.72 : 1) * (sc < 6.5 ? 0.8 : 1); // figures smaller at the overview and on phones
    const drawFig = (id, x, y, opts = {}) => {
      const P = state.people[id], def = PEOPLE[id], attrs = [...P.attrs].sort().join(',');
      const f = figure(def.fig, attrs, !!def.young, F.reduced ? 0 : boil);
      g.save(); g.translate(x, y); g.scale(fs, fs);
      if (P.withdrawn) g.globalAlpha = 0.45;
      g.fillStyle = def.fig === 'kingsguard' ? '#fbf8f1' : VELLUM; g.fill(f.fill);
      g.strokeStyle = INK; g.lineWidth = 1.05; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(f.ink);
      g.fillStyle = INK; g.fill(f.dark);
      const col = SIDE_COL[P.side];
      g.lineWidth = 0.9; g.stroke(f.pole);
      if (col) { g.fillStyle = col; g.fill(f.flag); g.stroke(f.flag); } else { g.strokeStyle = INK3; g.stroke(f.flag); }
      if (P.captive) { g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-6, -f.h + 2); g.lineTo(-8, -f.h + 2); g.lineTo(-8, 2); g.lineTo(-6, 2); g.moveTo(14, -f.h + 2); g.lineTo(16, -f.h + 2); g.lineTo(16, 2); g.lineTo(14, 2); g.stroke(); }
      g.restore();
      if (opts.name) { g.font = 'italic 500 10.5px Fraunces, Georgia, serif'; g.fillStyle = INK; g.textAlign = 'center'; g.globalAlpha = 0.9; g.fillText(def.name, x + 3, y + 12); g.textAlign = 'start'; g.globalAlpha = 1; }
      hits.push({ type: 'person', id, x: x + 2, y: y - 10, r: 11 });
    };
    // travellers
    for (const [M, pos] of moving) {
      const [x, y] = toS(pos[0], pos[1]);
      if (M.mode === 'ship' || M.mode === 'captive' && !M.who.length) {
        const n = M.ships || (M.who.length ? 1 : 2);
        for (let i = 0; i < n; i++) { const bx = x - i * 11 * (pos[2] || 1), by = y - i * 11 * (pos[3] || 0) + (i % 2) * 4; g.strokeStyle = INK; g.lineWidth = 1.1; g.fillStyle = VELLUM; g.beginPath(); g.moveTo(bx - 6, by); g.lineTo(bx + 6, by); g.lineTo(bx + 4, by + 3.4); g.lineTo(bx - 4, by + 3.4); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by - 9); g.lineTo(bx + 5, by - 3); g.lineTo(bx, by - 2); g.stroke(); }
      }
      if (M.mode === 'army') {
        g.strokeStyle = INK; g.lineWidth = 1;
        for (let i = 0; i < 5; i++) { const bx = x - 14 - i * 4.2, by = y + 4 + (i % 2) * 2; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 1.5, by - 12); g.stroke(); g.beginPath(); g.moveTo(bx + 1.5, by - 12); g.lineTo(bx + 0.2, by - 9.4); g.lineTo(bx + 2.8, by - 9.6); g.closePath(); g.fillStyle = INK; g.fill(); }
        if (M.label) { g.font = 'italic 500 10.5px Fraunces, Georgia, serif'; g.fillStyle = INK2; g.fillText(M.label, x + 6, y - 6); }
      }
      if (M.mode === 'message') { g.fillStyle = FIRE; g.beginPath(); g.arc(x, y, 2.6, 0, K.TAU); g.fill(); }
      if (M.label && M.mode === 'ship') { g.font = 'italic 500 10.5px Fraunces, Georgia, serif'; g.fillStyle = INK2; g.fillText(M.label, x + 10, y + 16); }
    }
    for (const [id, [pos, i, M]] of onMove) {
      const P = state.people[id];
      if (!P || !P.alive || riding.has(id)) continue;
      const [x, y] = toS(pos[0], pos[1]);
      drawFig(id, x + i * 12 - 4, y - 2 + (M.mode === 'ship' ? -2 : 0), { name: true });
    }
    // courts
    const courts = new Map();
    for (const [id, P] of Object.entries(state.people)) {
      if (!P.on || !P.alive || P.hidden || riding.has(id) || onMove.has(id) || !P.at) continue;
      const k = keyOf(P.at); if (!courts.has(k)) courts.set(k, []); courts.get(k).push(id);
    }
    const CL = { kings_landing: [-8, 34], dragonstone: [14, 30], driftmark: [-52, 34], storms_end: [14, 14], harrenhal: [16, -8], maidenpool: [14, 6], rooks_rest: [12, 10], tumbleton: [14, 10], bitterbridge: [-50, 26], duskendale: [10, 10] };
    for (const [k, ids] of courts) {
      ids.sort((a, b) => (PEOPLE[a].rank ?? 9) - (PEOPLE[b].rank ?? 9));
      const at = LOC[k] ? [LOC[k].x, LOC[k].y] : k.split(',').map(Number);
      const [x, y] = toS(at[0], at[1]);
      if (x < -120 || y < -80 || x > cw + 120 || y > ch + 80) continue;
      const off = CL[k] || [12, 16], perRow = sc < 6.5 ? 6 : 8;
      const maxShown = sc >= 20 ? 24 : sc < 6.5 ? 6 : 14;
      const named = id => actorsP.has(id) && t > 0 && sc >= 9;
      ids.sort((a, b) => (named(b) - named(a)) || ((PEOPLE[a].rank ?? 9) - (PEOPLE[b].rank ?? 9)));
      g.font = 'italic 500 10.5px Fraunces, Georgia, serif';
      let cx = x + off[0], row = 0, n = 0;
      for (const id of ids.slice(0, maxShown)) {
        const nm = named(id), slot = nm ? Math.max(16, g.measureText(PEOPLE[id].name).width + 8) : 12.5 * fs;
        if (n >= perRow) { row++; n = 0; cx = x + off[0]; }
        drawFig(id, cx + (nm ? slot / 2 - 4 : 0), y + off[1] + row * 28 * fs, { name: nm });
        cx += slot; n++;
      }
      if (ids.length > maxShown) { g.font = 'italic 500 10.5px Fraunces, Georgia, serif'; g.fillStyle = INK2; g.fillText('+' + (ids.length - maxShown), cx + 2, y + off[1] - 2); }
    }
    // dragon names: this step's actors, all four at the close, any on hover
    g.font = 'italic 600 12.5px Fraunces, Georgia, serif'; g.textAlign = 'left';
    const isOpen = si === 0, isClose = si === STEPS.length - 1;
    for (const [id, p, R] of rigs) {
      const show = F.hoverId === id || (isClose ? true : isOpen ? sc >= 7 : (actorsD.has(id) && t > 0.02));
      if (!show) continue;
      const h = R.S[0], [x, y] = toS(h[0], h[1]);
      g.fillStyle = VELLUM; g.globalAlpha = 0.75; const w = g.measureText(DR[id].name).width; g.fillRect(x + 7, y - 17, w + 6, 16); g.globalAlpha = 1;
      g.fillStyle = INK; g.fillText(DR[id].name, x + 10, y - 5);
    }

    // the King's Landing vignette
    if (step.vignette) drawVignette(g, F, toS(0, 0), cw, ch, safe, hits);

    // cartouche: title, scale of leagues, the scribe's tally
    drawCartouche(g, F, safe, sc);

    // paper tooth over everything on the sheet
    setMap(); g.save(); g.clip(deckle);
    let tp = toothPats.get(g); if (!tp) { tp = g.createPattern(tooth, 'repeat'); toothPats.set(g, tp); }
    const ls = LODS[li]; try { tp.setTransform(new DOMMatrix([1 / ls, 0, 0, 1 / ls, 0, 0])); } catch (e) { /* older engines */ }
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.5; g.fillStyle = tp; g.fillRect(view[0], view[1], view[2] - view[0], view[3] - view[1]);
    g.restore(); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;

    if (F.notes) drawNotes(g, F, setMap, setScr, toS, sc, view, rigs, deckle);
    setScr();
    return hits;
  }

  /* --------------------------- the vignette --------------------------- */
  function drawVignette(g, F, klS, cw, ch, safe, hits) {
    const { t, state, si } = F, open = K.smooth(0.03, 0.12, t) * (1 - K.smooth(0.93, 0.995, t));
    if (open <= 0.01) return;
    const R = Math.min(200, safe.h * 0.33, safe.w * 0.28) * (0.3 + 0.7 * open);
    let cx = klS[0] + R + 40, cy = klS[1] - R * 0.15;
    cx = Math.min(cx, safe.x + safe.w - R - 20); cy = Math.max(safe.y + R + 30, Math.min(cy, safe.y + safe.h - R - 20));
    const V = (x, y) => [cx + x * R, cy + y * R];
    g.save(); g.globalAlpha = open;
    g.strokeStyle = INK; g.lineWidth = 1; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(klS[0] + 6, klS[1] - 4); g.lineTo(cx - R * 0.98, cy); g.stroke(); g.setLineDash([]);
    g.shadowColor = 'rgba(40,30,20,0.25)'; g.shadowBlur = 14; g.fillStyle = '#f2ebdc'; g.beginPath(); g.arc(cx, cy, R, 0, K.TAU); g.fill(); g.shadowBlur = 0;
    g.save(); g.beginPath(); g.arc(cx, cy, R - 2, 0, K.TAU); g.clip();
    // bay and river
    g.fillStyle = 'rgba(84,110,138,0.16)'; g.beginPath(); const bay = [[0.7, -1.2], [1.3, -1.2], [1.3, 1.3], [0.62, 1.3], [0.66, 0.66], [0.8, 0.2], [0.74, -0.4]]; tracePoly(g, bay.map(p => V(...p))); g.fill();
    g.strokeStyle = 'rgba(84,110,138,0.5)'; g.lineWidth = R * 0.05; g.beginPath(); const riv = [[-1.2, 0.8], [-0.4, 0.74], [0.3, 0.76], [0.72, 0.7]].map(p => V(...p)); g.moveTo(...riv[0]); riv.forEach(p => g.lineTo(...p)); g.stroke();
    // hills
    const hill = (x, y, r) => { g.strokeStyle = INK; g.globalAlpha = open * 0.35; g.lineWidth = 0.9; for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.95 + i * 0.22; const p = V(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8), q = V(x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r); g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); } g.globalAlpha = open; };
    hill(0.42, 0.3, 0.2); hill(0.2, -0.42, 0.2); hill(-0.42, -0.22, 0.2);
    // walls
    const wall = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * K.TAU; const rr = 0.72 * (1 + 0.06 * K.noise1(i * 0.7, 5)); wall.push(V(Math.cos(a) * rr * 0.95 - 0.02, Math.sin(a) * rr * 0.9)); }
    g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(...wall[0]); wall.forEach(p => g.lineTo(...p)); g.stroke();
    // the Red Keep and the Dragonpit
    const rk = V(0.42, 0.3);
    const gp = glyph('big', 1); g.save(); g.translate(rk[0], rk[1] + 6); g.scale(1.25, 1.25); g.fillStyle = VELLUM; g.fill(gp.f); g.strokeStyle = INK; g.lineWidth = 1; g.stroke(gp.p); g.restore();
    const dp = V(0.2, -0.42), broken = state.marks.some(m => m.kind === 'burn' && m.key === 'dragonpit');
    g.strokeStyle = INK; g.lineWidth = 1.4; g.fillStyle = VELLUM;
    g.beginPath(); g.arc(dp[0], dp[1], R * 0.13, Math.PI, broken ? Math.PI * 1.45 : Math.PI * 2); g.stroke();
    if (broken) { g.beginPath(); g.arc(dp[0], dp[1], R * 0.13, Math.PI * 1.62, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(dp[0] - R * 0.13, dp[1]); g.lineTo(dp[0] + R * 0.13, dp[1]); g.stroke();
    const labelV = (txt, x, y, cap = 7) => { const lp = label(txt, cap); const [a, b] = V(x, y); g.save(); g.translate(a, b); g.fillStyle = INK2; g.fill(lp.path); g.restore(); };
    labelV('RED KEEP', 0.42, 0.52); labelV('DRAGONPIT', 0.2, -0.2); labelV("VISENYA'S HILL", -0.42, 0.02, 6.5);
    labelV('GATE OF THE GODS', 0.36, -0.84, 6); labelV('DRAGON GATE', 0.62, 0.02, 6); labelV('KING’S LANDING', 0, -0.94, 8);
    // the scene
    const people = [], dr = [];
    const at = (a, b, u) => [K.lerp(a[0], b[0], u), K.lerp(a[1], b[1], u)];
    const live = id => state.people[id]?.alive;
    if (F.step.vig === 'bloodcheese') {
      [['alicent', [0.3, 0.2]], ['helaena', [0.4, 0.16]], ['maelor', [0.5, 0.2]], ['jaehaerys', [0.46, 0.24]]].forEach(([id, p]) => live(id) && people.push({ id, p }));
      const u1 = K.smooth(0.14, 0.32, t);
      if (t > 0.1 && t < 0.62) { people.push({ cameo: 'common', p: at([-0.3, 0.1], [0.34, 0.26], u1), name: t < 0.42 ? 'Blood' : null }); people.push({ cameo: 'common', p: at([-0.34, 0.14], [0.3, 0.3], u1), name: t < 0.42 ? 'Cheese' : null }); }
      if (t >= 0.42) { const u2 = K.smooth(0.42, 0.5, t); people.push({ cameo: 'common', p: at([0.34, 0.26], [0.42, -0.66], u2), name: 'Blood', captive: t > 0.5 }); }
      dr.push({ id: 'shrykos', p: [0.12, -0.46], h: 0.4 }, { id: 'morghul', p: [0.28, -0.44], h: 2.2 });
      if (t > 0.56) dr.push({ id: 'dreamfyre', p: [0.2, -0.36], h: 1.2 });
      if (!live('jaehaerys')) people.push({ cross: [0.46, 0.26], name: 'Jaehaerys' });
    } else if (F.step.vig === 'dragonpit') {
      [['rhaenyra', [0.36, 0.14]], ['aegon_iii', [0.46, 0.14]], ['helaena', [0.52, 0.34]]].forEach(([id, p]) => live(id) && people.push({ id, p }));
      if (!live('helaena')) people.push({ cross: [0.54, 0.36], name: 'Helaena' });
      const um = K.smooth(0.24, 0.52, t);
      if (t > 0.22 && t < 0.9) for (let i = 0; i < 14; i++) { const a = [-0.5 + (i % 5) * 0.08, 0.1 + Math.floor(i / 5) * 0.08], b = [0.2 + Math.cos(i) * 0.16, -0.42 + Math.sin(i) * 0.14]; people.push({ mob: true, p: at(a, b, um) }); }
      const pitAlive = id => state.dragons[id].alive;
      [['shrykos', [0.08, -0.46], 0.5], ['morghul', [0.32, -0.46], 2.4], ['tyraxes', [0.2, -0.52], 1.6], ['dreamfyre', [0.2, -0.36], 1.1]].forEach(([id, p, h]) => { if (pitAlive(id)) dr.push({ id, p, h }); else dr.push({ scar: id, p }); });
      // Syrax: chained in the yard, then Joffrey's flight, then the pit
      if (pitAlive('syrax')) {
        if (t < 0.44) dr.push({ id: 'syrax', p: [0.52, 0.42], h: 3.3 });
        else if (t < 0.5) { const u = K.smooth(0.44, 0.5, t); dr.push({ id: 'syrax', p: at([0.52, 0.42], [0.26, -0.3], u), h: -2.2, fly: true, rider: t < 0.48 ? 'joffrey' : null }); }
        else dr.push({ id: 'syrax', p: [0.3, -0.3], h: 2.6 });
      } else dr.push({ scar: 'syrax', p: [0.3, -0.3] });
      if (!live('joffrey')) people.push({ cross: [0.34, 0.02], name: 'Joffrey' });
      if (t > 0.52 && t < 0.72) for (let i = 0; i < 3; i++) { const p = V(0.2 + Math.cos(t * 40 + i * 2) * 0.1, -0.44 + Math.sin(t * 33 + i) * 0.06); g.fillStyle = FIRE; g.globalAlpha = open * 0.6; g.beginPath(); g.arc(p[0], p[1], R * 0.03, 0, K.TAU); g.fill(); g.globalAlpha = open; }
    }
    for (const d of dr) {
      const [x, y] = V(...d.p);
      if (d.scar) { g.fillStyle = 'rgba(62,47,36,0.4)'; g.beginPath(); g.arc(x, y, R * (0.03 + 0.08 * DR[d.scar].size), 0, K.TAU); g.fill(); continue; }
      const def = DR[d.id], Lpx = R * (0.2 + 0.42 * def.size), n = 15, sp = [];
      for (let i = 0; i < n; i++) sp.push([x + Math.cos(d.h) * (Lpx * 0.5 - i * Lpx / (n - 1)), y + Math.sin(d.h) * (Lpx * 0.5 - i * Lpx / (n - 1))]);
      const pose = { spine: sp, L: Lpx, perched: !d.fly, alt: d.fly ? 0.5 : 0, rider: d.rider || null, chained: !d.fly };
      const Rg = rig(d.id, pose, 1, F.clock, 8, F.reduced ? 0 : F.boil + 1);
      if (d.fly) drawShadow(g, Rg, pose, 1);
      const st = d.rider ? { dragons: { [d.id]: { rider: d.rider } }, people: { [d.rider]: state.people[d.rider] } } : { dragons: { [d.id]: { rider: null } }, people: {} };
      drawDragonRig(g, d.id, Rg, pose, 1, st, SIDE_COL);
    }
    for (const q of people) {
      const [x, y] = V(...(q.cross || q.p));
      if (q.cross) { g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x, y + 6); g.moveTo(x - 3.6, y - 2.4); g.lineTo(x + 3.6, y - 2.4); g.stroke(); g.font = 'italic 500 10px Fraunces, Georgia, serif'; g.fillStyle = INK; g.textAlign = 'center'; g.fillText(q.name, x, y + 16); g.textAlign = 'start'; continue; }
      if (q.mob) { g.fillStyle = INK; g.globalAlpha = open * 0.75; g.beginPath(); g.arc(x, y - 3, 1.6, 0, K.TAU); g.fill(); g.fillRect(x - 1.2, y - 1.5, 2.4, 3.5); g.globalAlpha = open; continue; }
      if (q.cameo) {
        const f = figure(q.cameo, '', false, 0); g.save(); g.translate(x, y); g.scale(0.8, 0.8); g.fillStyle = VELLUM; g.fill(f.fill); g.strokeStyle = INK; g.lineWidth = 1; g.stroke(f.ink); g.restore();
        if (q.captive) { g.strokeStyle = INK; g.beginPath(); g.moveTo(x - 6, y - 16); g.lineTo(x - 8, y - 16); g.lineTo(x - 8, y + 1); g.lineTo(x - 6, y + 1); g.moveTo(x + 6, y - 16); g.lineTo(x + 8, y - 16); g.lineTo(x + 8, y + 1); g.lineTo(x + 6, y + 1); g.stroke(); }
        if (q.name) { g.font = 'italic 500 10px Fraunces, Georgia, serif'; g.fillStyle = INK; g.textAlign = 'center'; g.fillText(q.name, x, y + 12); g.textAlign = 'start'; }
        continue;
      }
      const P = state.people[q.id], def = PEOPLE[q.id], f = figure(def.fig, [...P.attrs].sort().join(','), !!def.young, 0);
      g.save(); g.translate(x, y); g.scale(0.85, 0.85); g.fillStyle = VELLUM; g.fill(f.fill); g.strokeStyle = INK; g.lineWidth = 1; g.stroke(f.ink); g.fillStyle = INK; g.fill(f.dark); g.stroke(f.pole); const col = SIDE_COL[P.side]; if (col) { g.fillStyle = col; g.fill(f.flag); g.stroke(f.flag); } g.restore();
      g.font = 'italic 500 10px Fraunces, Georgia, serif'; g.fillStyle = INK; g.textAlign = 'center'; g.fillText(def.name.split(' ')[0], x + 2, y + 11); g.textAlign = 'start';
      hits.push({ type: 'person', id: q.id, x, y: y - 8, r: 9 });
    }
    g.restore();
    g.strokeStyle = INK; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, cy, R, 0, K.TAU); g.stroke(); g.lineWidth = 0.7; g.beginPath(); g.arc(cx, cy, R - 4, 0, K.TAU); g.stroke();
    g.restore();
  }

  /* --------------------------- the cartouche --------------------------- */
  function drawCartouche(g, F, safe, sc) {
    if (safe.w < 520 || F.dip) { // phones and the diptych: just the count, top left
      const cw2 = 132, chh = 40, x0 = safe.x + 4, y0 = safe.y + 4, n = F.counts[F.counts.length - 1];
      g.save(); g.fillStyle = 'rgba(242,236,222,0.92)'; g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.rect(x0, y0, cw2, chh); g.fill(); g.stroke();
      const a = label('DRAGONS LIVING', 6, { align: 'left', track: 0.1 }); g.save(); g.translate(x0 + 9, y0 + 16); g.fillStyle = INK2; g.fill(a.path); g.restore();
      const b = label(String(n), 13, { align: 'left' }); g.save(); g.translate(x0 + 9, y0 + 33); g.fillStyle = INK; g.fill(b.path); g.restore();
      g.restore(); return;
    }
    const w = 244, h = 106, x = safe.x + safe.w - w - 6, y = safe.y + safe.h - h - 6;
    g.save();
    g.fillStyle = 'rgba(242,236,222,0.92)'; g.strokeStyle = INK; g.lineWidth = 1.1;
    g.beginPath(); g.rect(x, y, w, h); g.fill(); g.stroke(); g.lineWidth = 0.6; g.beginPath(); g.rect(x + 3.5, y + 3.5, w - 7, h - 7); g.stroke();
    g.fillStyle = INK;
    const t1 = label('THE DYING OF THE DRAGONS', 10, { align: 'left', track: 0.08 }); g.save(); g.translate(x + 12, y + 22); g.fill(t1.path); g.restore();
    const t2 = label('A MAP OF THE DANCE · 129–131 AC', 6.5, { align: 'left', track: 0.08 }); g.save(); g.translate(x + 12, y + 35); g.globalAlpha = 0.75; g.fill(t2.path); g.restore();
    const t3 = label('DRAGONS LIVING', 6.5, { align: 'left', track: 0.1 }); g.save(); g.translate(x + 12, y + 54); g.globalAlpha = 0.75; g.fill(t3.path); g.restore();
    // the scribe's tally: the first count, then the latest few, old ones struck through
    const all = F.counts, seq = all.length > 7 ? [all[0], '…', ...all.slice(-5)] : all;
    let cx = x + 12;
    seq.forEach((n, i) => {
      const last = i === seq.length - 1, lp = label(String(n), last ? 15 : 10.5, { align: 'left' });
      g.save(); g.translate(cx, y + (last ? 78 : 75)); g.globalAlpha = last ? 1 : 0.55; g.fillStyle = last ? INK : INK2; g.fill(lp.path); g.restore();
      if (!last && n !== '…') { g.strokeStyle = INK2; g.lineWidth = 1; g.globalAlpha = 0.8; g.beginPath(); g.moveTo(cx - 1, y + 71); g.lineTo(cx + lp.width + 1.5, y + 68); g.stroke(); g.globalAlpha = 1; }
      cx += lp.width + (last ? 0 : 6);
    });
    // scale of leagues along the bottom
    const nice = [5, 10, 20, 50, 100].find(v => v * sc >= 44 && v * sc <= w - 90) || [5, 10, 20, 50, 100].find(v => v * sc >= 20) || 100;
    const bl = Math.min(nice * sc, w - 90), sx = x + 12, sy = y + h - 12;
    g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + bl, sy); g.moveTo(sx, sy - 3); g.lineTo(sx, sy + 3); g.moveTo(sx + bl, sy - 3); g.lineTo(sx + bl, sy + 3); g.moveTo(sx + bl / 2, sy - 2); g.lineTo(sx + bl / 2, sy + 2); g.stroke();
    const sl = label(nice + ' LEAGUES', 6, { align: 'left' }); g.save(); g.translate(sx + bl + 8, sy + 3); g.fillStyle = INK2; g.fill(sl.path); g.restore();
    // compass
    const nx = x + w - 20, ny = y + 30;
    g.beginPath(); g.moveTo(nx, ny - 12); g.lineTo(nx + 4, ny); g.lineTo(nx, ny - 3); g.lineTo(nx - 4, ny); g.closePath(); g.fillStyle = INK; g.fill();
    const nl = label('N', 7); g.save(); g.translate(nx, ny - 15); g.fill(nl.path); g.restore();
    g.restore();
  }

  /* --------------------------- the Maester's notes --------------------------- */
  function drawNotes(g, F, setMap, setScr, toS, sc, view, rigs, deck) {
    setMap(); g.save(); g.clip(deck);
    g.fillStyle = 'rgba(18,52,102,0.8)'; g.fillRect(view[0], view[1], view[2] - view[0], view[3] - view[1]);
    g.strokeStyle = 'rgba(210,228,255,0.12)'; g.lineWidth = 1 / sc; g.beginPath();
    for (let x = Math.ceil(view[0] / 10) * 10; x < view[2]; x += 10) { g.moveTo(x, view[1]); g.lineTo(x, view[3]); }
    for (let y = Math.ceil(view[1] / 10) * 10; y < view[3]; y += 10) { g.moveTo(view[0], y); g.lineTo(view[2], y); }
    g.stroke();
    g.strokeStyle = 'rgba(236,245,255,0.85)'; g.lineWidth = 1.1 / sc; g.beginPath();
    const poly = (P, close) => { g.moveTo(P[0][0], P[0][1]); P.forEach(p => g.lineTo(p[0], p[1])); if (close) g.closePath(); };
    poly(MAP.land.slice(1, -1)); Object.values(MAP.islands).forEach(p => poly(p, true)); poly(MAP.lake, true); poly(MAP.isle, true);
    Object.values(MAP.rivers).forEach(r => poly(r)); g.stroke();
    g.strokeStyle = 'rgba(236,245,255,0.45)'; g.setLineDash([3 / sc, 3 / sc]); g.beginPath(); Object.values(MAP.roads).forEach(r => poly(r)); g.stroke(); g.setLineDash([]);
    // this step's legs, clean, with their lengths
    const step = STEPS[F.si];
    g.strokeStyle = 'rgba(255,214,140,0.9)'; g.lineWidth = 1.4 / sc;
    for (const Lg of step.legs) { if (!Lg.geo || Lg.fight || Lg.fall) continue; g.beginPath(); poly(Lg.geo.pts); g.stroke(); }
    // dragons' lengths
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.2 / sc;
    for (const [id, p, R] of rigs) { g.beginPath(); poly(R.S); g.stroke(); }
    g.restore();
    setScr();
    g.font = '500 10.5px ui-monospace, Consolas, monospace'; g.fillStyle = 'rgba(236,245,255,0.95)';
    for (const [id, l] of Object.entries(LOC)) {
      if (!l.name || id.startsWith('off')) continue;
      const [x, y] = toS(l.x, l.y);
      if (x < 0 || y < 0 || x > 5000 || y > 5000) continue;
      g.strokeStyle = 'rgba(236,245,255,0.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + 5, y); g.moveTo(x, y - 5); g.lineTo(x, y + 5); g.stroke();
      if (l.rank && l.rank <= (sc > 12 ? 3 : 1)) g.fillText(`${l.name} (${l.x}, ${l.y})`, x + 7, y - 6);
    }
    for (const Lg of step.legs) {
      if (!Lg.geo || Lg.fight || Lg.fall) continue;
      const m = pathAt(Lg.geo, Lg.geo.len / 2), [x, y] = toS(m.x, m.y);
      g.fillStyle = 'rgba(255,214,140,0.95)'; g.fillText(`${DR[Lg.d].name} ${Math.round(Lg.geo.len)} lg ${Lg.conf ? '(' + Lg.conf + ')' : ''}`, x + 6, y + 4);
    }
    g.fillStyle = 'rgba(236,245,255,0.95)';
    for (const [id, p, R] of rigs) { const h = R.S[0], [x, y] = toS(h[0], h[1]); g.fillText(`${DR[id].name} ${DR[id].size.toFixed(2)}${R.kx > 1 ? ' (drawn at minimum size)' : ''}`, x + 8, y + 12); }
    const note = ['MAESTER’S NOTES', 'Clean geometry under the hand. 1 unit = 1 league; King’s Landing at (0, 0).', 'Positions are schematic: placed by eye from AWOIAF’s statements.', 'Dragons drawn about 1,000× map scale; lengths relative to Vhagar (1.00).'];
    const bx = F.safe.x + 8, by = F.safe.y + F.safe.h - 70;
    g.fillStyle = 'rgba(10,30,60,0.72)'; g.fillRect(bx - 6, by - 16, 470, 66);
    note.forEach((s, i) => { g.fillStyle = i ? 'rgba(236,245,255,0.9)' : 'rgba(255,214,140,1)'; g.fillText(s, bx, by + i * 15); });
  }

  return { render, warm: () => { lod(0); } };
}
