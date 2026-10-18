// world.js — the state of the war as a pure function of (step, t).
// One sequential pass over the story resolves every leg's rider and start point and takes a
// snapshot at the start of each step; a frame clones the snapshot and replays the step up to t.

import { LOC, DRAGONS, PEOPLE, STEPS, S0 } from './data.js';
import { spline, clamp, smooth, lerp, strHash, TAU, easeInOut } from './ink.js';

export const DR = Object.fromEntries(DRAGONS.map(d => [d.id, d]));
const SIZE_RANK = Object.fromEntries(DRAGONS.slice().sort((a, b) => b.size - a.size).map((d, i) => [d.id, i]));

export function pt(ref) {
  if (Array.isArray(ref)) return ref;
  const l = LOC[ref];
  if (!l) throw new Error('unknown place ' + ref);
  return [l.x, l.y];
}
export const keyOf = ref => (Array.isArray(ref) ? ref[0].toFixed(2) + ',' + ref[1].toFixed(2) : ref);

/* ------------------------------ paths ------------------------------ */
export function makePath(points, perSeg = 16) {
  const pts = spline(points.map(pt), perSeg);
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return { pts, cum, len: cum[pts.length - 1] || 1e-6 };
}
export function pathAt(P, s) { // position and unit tangent at arc length s (extrapolates past the ends)
  const { pts, cum, len } = P, n = pts.length;
  if (n < 2) return { x: pts[0][0], y: pts[0][1], tx: 1, ty: 0 };
  if (s <= 0) {
    const [a, b] = [pts[0], pts[1]], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l;
    return { x: a[0] + tx * s, y: a[1] + ty * s, tx, ty };
  }
  if (s >= len) {
    const [a, b] = [pts[n - 2], pts[n - 1]], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l;
    return { x: b[0] + tx * (s - len), y: b[1] + ty * (s - len), tx, ty };
  }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], f = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f), tx: (b[0] - a[0]) / l, ty: (b[1] - a[1]) / l };
}
function fightPoints(start, f) {
  const out = [start], n = 28;
  for (let i = 1; i <= n; i++) {
    const u = i / n, a = f.ph + f.turns * TAU * u, r = lerp(f.r0, f.r1, u);
    out.push([f.c[0] + Math.cos(a) * r, f.c[1] + Math.sin(a) * r]);
  }
  return out;
}
function fallPoints(start, at) {
  const out = [start], n = 16, dx = at[0] - start[0], dy = at[1] - start[1];
  const R = Math.max(0.5, Math.hypot(dx, dy) * 0.35);
  for (let i = 1; i <= n; i++) {
    const u = i / n, a = u * TAU * 1.6, r = R * (1 - u);
    out.push([start[0] + dx * u + Math.cos(a) * r, start[1] + dy * u + Math.sin(a) * r]);
  }
  return out;
}

/* ------------------------------ orbits ------------------------------ */
export function orbitParams(id, hover) {
  const d = DR[id], h = strHash(id), rank = SIZE_RANK[id];
  const r = hover ? 0.9 + 1.4 * d.size : Math.min(3.5 + 7 * d.size + 1.1 * rank, 6 + 60 * d.size);
  const v = 1.1 + 1.0 * d.size, dir = rank % 2 ? -1 : 1;
  return { r, w: dir * v / r, ph: (h % 6283) / 1000, tilt: ((h >> 8) % 628) / 100, ecc: 0.78 + ((h >> 4) % 20) / 100, dir };
}
export function orbitAt(c, o, clock, dAng = 0) {
  const a = o.ph + o.w * clock - o.dir * dAng;
  const ex = Math.cos(a) * o.r, ey = Math.sin(a) * o.r * o.ecc, ct = Math.cos(o.tilt), st = Math.sin(o.tilt);
  return [c[0] + ex * ct - ey * st, c[1] + ex * st + ey * ct];
}

/* ------------------------------ state ------------------------------ */
function initState() {
  const s = { dragons: {}, people: {}, control: {}, marks: [], tallies: [], regions: [] };
  for (const d of DRAGONS) s.dragons[d.id] = { alive: !d.unhatched, hatched: !d.unhatched, at: d.home, mode: d.unhatched ? 'egg' : 'orbit', rider: d.rider, hover: false };
  for (const [id, p] of Object.entries(PEOPLE)) s.people[id] = { on: !!p.seat, alive: true, at: p.seat, captive: false, hidden: false, side: p.side, attrs: new Set(p.attrs || []), withdrawn: false, deathAt: null };
  for (const [id, l] of Object.entries(LOC)) if (l.seat) s.control[id] = 'royal';
  return s;
}
function cloneState(s) {
  const o = { dragons: {}, people: {}, control: { ...s.control }, marks: s.marks.slice(), tallies: s.tallies.slice(), regions: s.regions.slice() };
  for (const k in s.dragons) o.dragons[k] = { ...s.dragons[k] };
  for (const k in s.people) { const p = s.people[k]; o.people[k] = { ...p, attrs: new Set(p.attrs) }; }
  return o;
}
function applyEvent(s, e, si) {
  const P = e.who ? s.people[e.who] : null, D = e.d ? s.dragons[e.d] : null;
  switch (e.k) {
    case 'death': {
      P.alive = false; const at = e.at ?? P.at; P.deathAt = at;
      if (!e.quiet) s.marks.push({ kind: 'person', who: e.who, at: pt(at), key: keyOf(at), si, t: e.t, lost: !!e.lost, claimant: !!PEOPLE[e.who].claimant });
      for (const id in s.dragons) if (s.dragons[id].rider === e.who) s.dragons[id].rider = null;
      break;
    }
    case 'ddeath': D.alive = false; D.mode = 'dead'; s.marks.push({ kind: 'dragon', d: e.d, at: pt(e.at), key: keyOf(e.at), water: !!e.water, si, t: e.t }); break;
    case 'claim': D.rider = e.who; break;
    case 'defect': P.side = e.side; break;
    case 'capture': P.captive = true; break;
    case 'release': P.captive = false; break;
    case 'control': if (e.loc === '*') { for (const k in s.control) s.control[k] = e.side; } else s.control[e.loc] = e.side; break;
    case 'attr': if (e.on) P.attrs.add(e.a); else P.attrs.delete(e.a); break;
    case 'ground': D.mode = e.how || 'perched'; D.at = e.at; break;
    case 'unground': D.mode = 'orbit'; D.hover = false; break;
    case 'vanish': D.mode = 'hidden'; break;
    case 'appear': D.mode = 'orbit'; D.at = e.at; D.hover = !!e.hover; break;
    case 'enter': P.on = true; P.at = e.at; P.hidden = false; break;
    case 'hide': P.hidden = true; break;
    case 'reveal': P.hidden = false; P.on = true; P.at = e.at; break;
    case 'withdraw': P.withdrawn = true; break;
    case 'burn': s.marks.push({ kind: 'burn', at: pt(e.at), key: keyOf(e.at), r: e.r || 2, si, t: e.t }); break;
    case 'battle': s.marks.push({ kind: 'battle', at: pt(e.at), key: keyOf(e.at), si, t: e.t }); break;
    case 'region': s.regions.push({ id: e.id, si, t0: e.t, t1: e.t1 ?? e.t + 0.1 }); break;
    case 'hatch': D.hatched = true; D.alive = true; D.mode = 'orbit'; D.at = e.at; break;
    case 'tally': s.tallies.push({ at: pt(e.at), n: e.n, si, t0: e.t, t1: e.t1 }); break;
  }
}
function endLeg(s, L) {
  const D = s.dragons[L.d], last = L.lastRef;
  D.at = last; D.hover = L.end === 'none';
  if (L.end === 'off') D.mode = 'off';
  else if (L.end === 'ground' || L.end === 'perch') D.mode = 'perched';
  else if (L.end !== 'die') D.mode = 'orbit';
  for (const id of [L.rider, ...(L.pass || [])]) {
    if (!id) continue;
    const P = s.people[id];
    if (!P.alive) continue;
    P.at = last;
    if (L.end === 'off') P.hidden = true;
  }
}
function endMove(s, M) {
  for (const id of M.who) {
    const P = s.people[id];
    if (!P.alive) continue;
    P.at = M.lastRef;
    if (M.end === 'hide' || M.end === 'off') P.hidden = true;
  }
}

export function buildWorld() {
  const snaps = [], timelines = [];
  let s = initState();
  const countLog = [[0, 0, 20]];
  const counted = st => Object.values(st.dragons).filter(d => d.alive && d.hatched).length;
  STEPS.forEach((step, si) => {
    snaps[si] = cloneState(s);
    const items = [];
    step.legs.forEach((L, i) => { items.push({ t: L.t0, o: 2, type: 'legStart', L }); items.push({ t: L.t1, o: 0, type: 'legEnd', L }); });
    step.moves.forEach(M => items.push({ t: M.t1, o: 0, type: 'moveEnd', M }));
    step.ev.forEach(e => items.push({ t: e.t, o: 1, type: 'ev', e }));
    items.sort((a, b) => a.t - b.t || a.o - b.o);
    for (const it of items) {
      if (it.type === 'legStart') {
        const L = it.L, D = s.dragons[L.d];
        L.rider = L.r === undefined ? D.rider : L.r;
        const start = D.at ? pt(D.at) : pt(L.path ? L.path[0] : [0, 0]);
        let points;
        if (L.fight) { const len = S0 * DR[L.d].size; points = fightPoints(start, { ...L.fight, r0: Math.max(L.fight.r0, 0.42 * len), r1: Math.max(L.fight.r1, 0.28 * len) }); }
        else if (L.fall) points = fallPoints(start, L.fall.at);
        else points = [start, ...L.path.slice(1)];
        L.geo = makePath(points, L.fight ? 5 : L.fall ? 5 : 16);
        L.lastRef = L.fall ? L.fall.at : L.fight ? L.geo.pts[L.geo.pts.length - 1] : L.path[L.path.length - 1];
        L.startRef = D.at; L.startMode = D.mode; L.startHover = D.hover;
        L.si = si;
      } else if (it.type === 'legEnd') endLeg(s, it.L);
      else if (it.type === 'moveEnd') endMove(s, it.M);
      else {
        const before = counted(s);
        applyEvent(s, it.e, si);
        const after = counted(s);
        if (after !== before) countLog.push([si, it.e.t, after]);
      }
    }
    step.moves.forEach(M => { M.geo = makePath(M.path, 12); M.lastRef = M.path[M.path.length - 1]; M.si = si; });
    timelines[si] = items;
  });
  snaps[STEPS.length] = cloneState(s);
  return { snaps, timelines, countLog };
}

// state at (step, t): clone the snapshot, replay the step's timeline up to t
export function stateAt(W, si, t) {
  const s = cloneState(W.snaps[si]);
  for (const it of W.timelines[si]) {
    if (it.t > t) break;
    if (it.type === 'legEnd') endLeg(s, it.L);
    else if (it.type === 'moveEnd') endMove(s, it.M);
    else if (it.type === 'ev') applyEvent(s, it.e, si);
  }
  return s;
}
export function activeLegs(si, t) { return STEPS[si].legs.filter(L => t >= L.t0 && t < L.t1); }
export function activeMoves(si, t) { return STEPS[si].moves.filter(M => t >= M.t0 && t < M.t1); }
export const legU = (L, t) => easeInOut(clamp((t - L.t0) / (L.t1 - L.t0), 0, 1));
export function altitude(L, u) {
  const a = L.alt ?? 1;
  if (L.fall) return a * (1 - u) * 0.9;
  if (L.fight) return a;
  const up = L.startMode === 'perched' || L.startMode === 'chained' ? smooth(0, 0.18, u) : 1;
  const down = L.end === 'ground' || L.end === 'perch' || L.end === 'die' ? 1 - smooth(0.82, 1, u) : 1;
  return a * Math.min(up, down) * 0.85 + 0.15 * a;
}

/* ------------------------------ pose ------------------------------ */
// The dragon's body is laid along its path behind the head, so turns bend it and a
// backward scroll rewinds it. The spine is a chain whose joints can bend only so far, so a
// long body follows a tight path loosely instead of coiling round it.
export const SPINE_N = 14;
const MAX_BEND = { lean: 0.26, slender: 0.21, skinny: 0.21, standard: 0.18, heavy: 0.15, juvenile: 0.2, hatchling: 0.24 };
function chain(target, n, seg, headDir, maxBend) {
  const out = new Array(n + 1);
  out[0] = target(0);
  let dx = -headDir[0], dy = -headDir[1];
  for (let i = 1; i <= n; i++) {
    const p = out[i - 1], q = target(i);
    let tx = q[0] - p[0], ty = q[1] - p[1];
    const l = Math.hypot(tx, ty);
    if (l > 1e-9) { tx /= l; ty /= l; } else { tx = dx; ty = dy; }
    let da = Math.atan2(ty, tx) - Math.atan2(dy, dx);
    while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    da = clamp(da, -maxBend, maxBend);
    const a = Math.atan2(dy, dx) + da;
    dx = Math.cos(a); dy = Math.sin(a);
    out[i] = [p[0] + dx * seg, p[1] + dy * seg];
  }
  return out;
}
export function dragonPose(id, W, si, t, state, clock) {
  const d = DR[id], D = state.dragons[id], L = S0 * d.size, seg = L / SPINE_N;
  const leg = STEPS[si].legs.find(l => l.d === id && t >= l.t0 && t < l.t1);
  const spine = new Array(SPINE_N + 1);
  if (leg) {
    const u = legU(leg, t), s = u * leg.geo.len;
    // blend out of the orbit at the start of a leg, and into one at its end
    let ox = 0, oy = 0;
    if (leg.startMode === 'orbit' && leg.startRef && !leg.fight && !leg.fall) {
      const o = orbitParams(id, leg.startHover), c = pt(leg.startRef), p0 = orbitAt(c, o, clock), q = leg.geo.pts[0];
      const k = 1 - smooth(0, 0.14, u); ox += (p0[0] - q[0]) * k; oy += (p0[1] - q[1]) * k;
    }
    if ((!leg.end || leg.end === 'orbit') && !leg.fight && !leg.fall) {
      const o = orbitParams(id, false), c = pt(leg.lastRef), p1 = orbitAt(c, o, clock), q = leg.geo.pts[leg.geo.pts.length - 1];
      const k = smooth(0.86, 1, u); ox += (p1[0] - q[0]) * k; oy += (p1[1] - q[1]) * k;
    }
    const h = pathAt(leg.geo, s);
    const sp = chain(i => { const p = pathAt(leg.geo, s - i * seg); return [p.x + ox, p.y + oy]; }, SPINE_N, seg, [h.tx, h.ty], MAX_BEND[d.build] * (leg.fall ? 1.6 : 1));
    for (let i = 0; i <= SPINE_N; i++) spine[i] = sp[i];
    const ahead = pathAt(leg.geo, s + L * 0.5), behind = pathAt(leg.geo, s - L * 0.5);
    const curv = (ahead.tx * behind.ty - ahead.ty * behind.tx);
    return { spine, alt: altitude(leg, u), bank: clamp(curv * 1.4, -1, 1), leg, falling: !!leg.fall, fighting: !!leg.fight, rider: leg.rider, heading: Math.atan2(h.ty, h.tx), L };
  }
  if (!D.alive || !D.hatched || D.mode === 'hidden' || D.mode === 'off' || D.mode === 'dead' || D.mode === 'egg') return null;
  const c = pt(D.at);
  if (D.mode === 'perched' || D.mode === 'chained') {
    const h = strHash(id), a = ((h % 628) / 100);
    const slot = (SIZE_RANK[id] % 5) * 0.55;
    const cx = c[0] + Math.cos(a) * slot, cy = c[1] + Math.sin(a) * slot, hd = a + 1.9;
    for (let i = 0; i <= SPINE_N; i++) spine[i] = [cx + Math.cos(hd) * (L * 0.5 - i * seg), cy + Math.sin(hd) * (L * 0.5 - i * seg)];
    return { spine, alt: 0, bank: 0, perched: true, chained: D.mode === 'chained', rider: null, heading: hd, L };
  }
  const o = orbitParams(id, D.hover);
  const h0 = orbitAt(c, o, clock), h1 = orbitAt(c, o, clock + 0.05);
  const hl = Math.hypot(h1[0] - h0[0], h1[1] - h0[1]) || 1;
  const sp = chain(i => orbitAt(c, o, clock, (i * seg) / o.r), SPINE_N, seg, [(h1[0] - h0[0]) / hl, (h1[1] - h0[1]) / hl], MAX_BEND[d.build]);
  for (let i = 0; i <= SPINE_N; i++) spine[i] = sp[i];
  return { spine, alt: 0.62, bank: clamp(o.dir * -0.55 * (6 / o.r), -0.7, 0.7), orbit: true, rider: null, heading: Math.atan2(h1[1] - h0[1], h1[0] - h0[0]), L };
}
