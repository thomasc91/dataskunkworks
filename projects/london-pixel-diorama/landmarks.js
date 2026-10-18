// Hand-built models of famous buildings, drawn in place of their plain map footprints.
//
// The pipeline (pipeline/landmarks.py) finds each landmark in the map data and writes it to the city's
// `landmarks` list: {kind, name, x, z, rot, len, wid, h, bid, ...}. x and z are the footprint's centre in metres,
// rot is the angle of its long axis, len and wid its size and h its real height. Each model below is authored in
// real metres in a local frame: u along the long axis, v across it, y up. Heights are multiplied by the
// renderer's height scale on the way out, like every other building, and the pixel pass gives them the same
// finish. Shapes and sizes follow published dimensions (see each model).
//
// buildLandmarks(list, {yScale, color}) returns flat arrays for one BufferGeometry: position, normal, color and
// aBid (so a landmark is picked and highlighted like a building).

const TAU = Math.PI * 2;

class Kit {
  constructor(lm, yScale, out, color, triangulate) {
    Object.assign(this, { lm, S: yScale, out, color, triangulate });
    this.hs = 1; // horizontal scale: a model sets it to S to scale evenly (a wheel that stays round)
    this.cr = Math.cos(lm.rot || 0);
    this.sr = Math.sin(lm.rot || 0);
    this.bid = lm.bid ?? -1;
  }
  w([u, y, v]) {
    const { lm, cr, sr } = this;
    u *= this.hs;
    v *= this.hs;
    return [lm.x + u * cr - v * sr, y * this.S, lm.z + u * sr + v * cr];
  }
  // A world direction (x east, z south) in local (u, v).
  local(dx, dz) {
    return [dx * this.cr + dz * this.sr, -dx * this.sr + dz * this.cr];
  }
  tri(a, b, c, rgb) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    const o = this.out;
    for (const p of [a, b, c]) {
      o.position.push(p[0], p[1], p[2]);
      o.normal.push(nx, ny, nz);
      o.color.push(rgb[0], rgb[1], rgb[2]);
      o.bid.push(this.bid);
    }
  }
  // A convex polygon of local points, fan-triangulated. The material is double-sided, so winding is free.
  poly(pts, hex) {
    const rgb = this.color(hex), W = pts.map((p) => this.w(p));
    for (let i = 1; i + 1 < W.length; i++) this.tri(W[0], W[i], W[i + 1], rgb);
  }
  quad(a, b, c, d, hex) { this.poly([a, b, c, d], hex); }
  // Walls between two rings (lists of [u, v]) of equal length, from y0 to y1, plus an optional top cap.
  frustum(r0, y0, r1, y1, hex, top = hex) {
    const n = r0.length, col = typeof hex === "function" ? hex : () => hex;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.quad([r0[i][0], y0, r0[i][1]], [r0[j][0], y0, r0[j][1]], [r1[j][0], y1, r1[j][1]], [r1[i][0], y1, r1[i][1]], col(i));
    }
    if (top) this.poly(r1.map(([u, v]) => [u, y1, v]), top);
  }
  prism(ring, y0, y1, hex, top = hex) { this.frustum(ring, y0, ring, y1, hex, top); }
  // Walls for any ring (convex or not) from y0 to y1, with a triangulated top.
  block(ring, y0, y1, hex, top) {
    this.frustum(ring, y0, ring, y1, hex, null);
    const rgb = this.color(top), W = ring.map(([u, v]) => this.w([u, y1, v]));
    for (const [a, b, c] of this.triangulate(ring)) this.tri(W[a], W[b], W[c], rgb);
  }
  box(u0, v0, u1, v1, y0, y1, hex, top = hex) { this.prism(rect(u0, v0, u1, v1), y0, y1, hex, top); }
  // A solid of revolution about the vertical axis at (cu, cv): prof is [[radius, y], ...] from the bottom up.
  lathe(cu, cv, prof, n, hex, a0 = 0) {
    const col = typeof hex === "function" ? hex : () => hex;
    for (let j = 0; j + 1 < prof.length; j++) {
      const [ra, ya] = prof[j], [rb, yb] = prof[j + 1];
      this.frustum(ngon(cu, cv, ra, n, a0), ya, ngon(cu, cv, rb, n, a0), yb, (i) => col(i, j), null);
    }
    const [rt, yt] = prof[prof.length - 1];
    if (rt > 0.01) this.poly(ngon(cu, cv, rt, n, a0).map(([u, v]) => [u, yt, v]), col(0, prof.length - 1));
  }
  // A square beam between two local points (y in real metres), t metres thick.
  beam(p0, p1, t, hex) {
    const A = this.w(p0), B = this.w(p1), rgb = this.color(hex);
    const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L = Math.hypot(...d) || 1;
    const D = d.map((x) => x / L);
    let U = Math.abs(D[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let X = [D[1] * U[2] - D[2] * U[1], D[2] * U[0] - D[0] * U[2], D[0] * U[1] - D[1] * U[0]];
    const xl = Math.hypot(...X); X = X.map((q) => q / xl);
    const Y = [D[1] * X[2] - D[2] * X[1], D[2] * X[0] - D[0] * X[2], D[0] * X[1] - D[1] * X[0]];
    const h = t / 2, off = (P, a, b) => [P[0] + (X[0] * a + Y[0] * b) * h, P[1] + (X[1] * a + Y[1] * b) * h, P[2] + (X[2] * a + Y[2] * b) * h];
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      const [a1, b1] = cs[i], [a2, b2] = cs[(i + 1) % 4];
      const q = [off(A, a1, b1), off(A, a2, b2), off(B, a2, b2), off(B, a1, b1)];
      this.tri(q[0], q[1], q[2], rgb); this.tri(q[0], q[2], q[3], rgb);
    }
  }
  // A flat disc on a vertical face: centre c (local), facing along +u ('u') or +v ('v') times sign. Its height is
  // divided by the height scale, so it stays round on screen (clock dials).
  disc(c, axis, sign, r, n, hex) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, s = Math.cos(a) * r, y = c[1] + (Math.sin(a) * r) / this.S;
      pts.push(axis === "u" ? [c[0], y, c[2] + s * sign] : [c[0] + s * sign, y, c[2]]);
    }
    this.poly(pts, hex);
  }
  // A thin flat strip on a vertical face, for hands and flags: from c, length len at angle a (0 = up).
  hand(c, axis, sign, len, a, wdt, hex) {
    const du = Math.sin(a) * len, dy = (Math.cos(a) * len) / this.S, pu = Math.cos(a) * wdt / 2, py = (-Math.sin(a) * wdt / 2) / this.S;
    const P = (s, y) => (axis === "u" ? [c[0], c[1] + y, c[2] + s * sign] : [c[0] + s * sign, c[1] + y, c[2]]);
    this.quad(P(-pu, -py), P(pu, py), P(du + pu, dy + py), P(du - pu, dy - py), hex);
  }
}

const rect = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const ngon = (cu, cv, r, n, a0 = 0) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    out.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r]);
  }
  return out;
};
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const corners = (a, b = a) => [[-a, -b], [a, -b], [a, b], [-a, b]];

// ------------------------------------------------------------------------------------------- the models

const MODELS = {
  // Elizabeth Tower (Big Ben): 96 m, a 12 m square shaft, four 7 m dials centred 55 m up, a belfry, and an iron
  // spire with a gilded lantern and pinnacles. Gold Anston limestone; the dials' surrounds are Prussian blue.
  elizabeth_tower(K, lm) {
    const k = (lm.h || 96) / 96, a = clampN(Math.min(lm.len, lm.wid) / 2, 5, 7.5);
    const STONE = "#d6b67f", LIGHT = "#ead3a3", DARK = "#a8864f", SLATE = "#3f4b5f", GOLD = "#e3b43a";
    K.box(-a, -a, a, a, 0, 51 * k, STONE, null);
    for (const [su, sv] of corners(1)) K.box(su * a - 0.8, sv * a - 0.8, su * a + 0.3 * su, sv * a + 0.3 * sv, 0, 51 * k, LIGHT, null);
    for (const yb of [18, 34, 50]) K.box(-a - 0.15, -a - 0.15, a + 0.15, a + 0.15, yb * k, (yb + 0.8) * k, LIGHT);
    for (const s of [-1, 1]) for (const t of [-0.5, 0, 0.5]) {
      K.box(s * a - 0.05, t * a - 0.35, s * a + 0.1 * s, t * a + 0.35, 5 * k, 48 * k, DARK, null);
      K.box(t * a - 0.35, s * a - 0.05, t * a + 0.35, s * a + 0.1 * s, 5 * k, 48 * k, DARK, null);
    }
    const b = a + 0.6;
    K.box(-b, -b, b, b, 51 * k, 63 * k, "#dcbd88");
    const yc = 56.5 * k;
    for (const [axis, sign] of [["u", 1], ["u", -1], ["v", 1], ["v", -1]]) {
      const c = axis === "u" ? [sign * (b + 0.05), yc, 0] : [0, yc, sign * (b + 0.05)];
      const step = (d) => (axis === "u" ? [c[0] + sign * d, c[1], c[2]] : [c[0], c[1], c[2] + sign * d]);
      K.disc(step(0), axis, sign, 4.3, 16, GOLD);
      K.disc(step(0.06), axis, sign, 3.9, 16, "#24365c");
      K.disc(step(0.12), axis, sign, 3.3, 16, "#efe7cf");
      K.hand(step(0.18), axis, sign, 2.9, Math.PI / 3, 0.35, "#1c1c1c");
      K.hand(step(0.2), axis, sign, 2.0, -Math.PI / 3, 0.45, "#1c1c1c");
    }
    const c = a - 0.3;
    K.box(-c, -c, c, c, 63 * k, 72 * k, STONE, null);
    for (const s of [-1, 1]) for (const t of [-0.5, 0, 0.5]) {
      K.box(s * c - 0.05, t * c - 0.6, s * c + 0.12 * s, t * c + 0.6, 64.5 * k, 70.5 * k, "#3a3125", null);
      K.box(t * c - 0.6, s * c - 0.05, t * c + 0.6, s * c + 0.12 * s, 64.5 * k, 70.5 * k, "#3a3125", null);
    }
    for (const [su, sv] of corners(c)) K.lathe(su, sv, [[0.8, 72 * k], [0.8, 77 * k], [0.15, 81 * k]], 8, LIGHT);
    K.frustum(rect(-c + 0.4, -c + 0.4, c - 0.4, c - 0.4), 72 * k, rect(-3, -3, 3, 3), 82 * k, SLATE, null);
    for (const [su, sv] of corners(1)) K.beam([su * (c - 0.4), 72 * k, sv * (c - 0.4)], [su * 3, 82 * k, sv * 3], 0.35, GOLD);
    K.box(-2.7, -2.7, 2.7, 2.7, 82 * k, 86 * k, "#ddbf88");
    K.frustum(rect(-2.3, -2.3, 2.3, 2.3), 86 * k, rect(-0.25, -0.25, 0.25, 0.25), 94 * k, SLATE);
    K.box(-0.3, -0.3, 0.3, 0.3, 94 * k, 96 * k, GOLD);
  },

  // Victoria Tower: 98.5 m and about 23 m square, the taller tower at the south end of the Palace of
  // Westminster, with octagonal corner turrets, the Sovereign's Entrance arch and a flagpole.
  victoria_tower(K, lm) {
    const k = (lm.h || 98.5) / 98.5, a = clampN(Math.min(lm.len, lm.wid) / 2, 8, 12.5);
    const STONE = "#d3b37c", LIGHT = "#e4c896", DARK = "#a5844e", SLATE = "#46526a";
    K.box(-a, -a, a, a, 0, 82 * k, STONE, null);
    for (let yb = 14; yb < 82; yb += 14) K.box(-a - 0.12, -a - 0.12, a + 0.12, a + 0.12, yb * k, (yb + 0.8) * k, LIGHT);
    for (const s of [-1, 1]) for (const t of [-0.66, -0.33, 0, 0.33, 0.66]) {
      K.box(s * a - 0.05, t * a - 0.45, s * a + 0.1 * s, t * a + 0.45, 16 * k, 80 * k, DARK, null);
      K.box(t * a - 0.45, s * a - 0.05, t * a + 0.45, s * a + 0.1 * s, 16 * k, 80 * k, DARK, null);
    }
    K.box(-3.6, a - 0.05, 3.6, a + 0.15, 0, 15 * k, "#3b3226", null);
    for (const [su, sv] of corners(a - 0.4)) K.lathe(su, sv, [[2.3, 0], [2.3, 90 * k], [1.9, 92 * k], [0.2, 98 * k]], 8, (i, j) => (j < 1 ? LIGHT : SLATE));
    for (const s of [-1, 1]) for (let t = -a + 3; t <= a - 3; t += 3) {
      K.box(s * a - 0.8, t - 0.6, s * a + 0.1 * s, t + 0.6, 82 * k, 85 * k, STONE);
      K.box(t - 0.6, s * a - 0.8, t + 0.6, s * a + 0.1 * s, 82 * k, 85 * k, STONE);
    }
    K.frustum(rect(-a + 1, -a + 1, a - 1, a - 1), 82 * k, rect(-3, -3, 3, 3), 88 * k, SLATE);
    K.beam([0, 88 * k, 0], [0, 108 * k, 0], 0.35, "#e7e7e7");
    K.box(0.2, -0.05, 5, 0.05, 104.5 * k, 107.5 * k, "#1f3f8f");
    K.box(0.2, -0.08, 5, 0.08, 105.7 * k, 106.3 * k, "#c8102e");
    K.box(2.3, -0.08, 2.9, 0.08, 104.5 * k, 107.5 * k, "#c8102e");
  },

  // The Shard: 310 m of sloping glass. Eight panes ("shards") lean in towards a fractured top and stop short of
  // meeting, so the crown is open. The footprint sets the base.
  shard(K, lm) {
    const H = lm.h || 310, hb = H * 0.79, hu = clampN(lm.len / 2, 18, 34), hv = clampN(lm.wid / 2, 16, 30);
    const tu = hu * 0.2, tv = hv * 0.2, ou = hu * 0.04, ov = -hv * 0.03;
    const ring = (f) => rect(-hu + (hu - tu) * f + ou * f, -hv + (hv - tv) * f + ov * f, hu - (hu - tu) * f + ou * f, hv - (hv - tv) * f + ov * f);
    const bands = 24;
    for (let j = 0; j < bands; j++) {
      const f0 = j / bands, f1 = (j + 1) / bands;
      const hex = j % 5 === 4 ? "#8ea8ba" : j % 2 ? "#a9c2d2" : "#b8cddb";
      K.frustum(ring(f0), hb * f0, ring(f1), hb * f1, hex, j === bands - 1 ? "#5a6c7c" : null);
    }
    K.box(ou - 2.2, ov - 2.2, ou + 2.2, ov + 2.2, hb, H * 0.95, "#7d8d99");
    // The shards: each face splits into two panes that carry on up the face's own slope to different heights.
    const tops = [0.9, 1.0, 0.94, 0.97, 0.88, 0.99, 0.92, 0.96];
    const ru = (hu - tu) / hb, rv = (hv - tv) / hb;
    let n = 0;
    for (const [axis, s] of [["u", 1], ["v", 1], ["u", -1], ["v", -1]]) {
      for (const half of [0, 1]) {
        const yt = H * tops[n++], dy = yt - hb;
        const e0 = axis === "u" ? tu : tv, w0 = axis === "u" ? tv : tu, r = axis === "u" ? ru : rv, rw = axis === "u" ? rv : ru;
        const e1 = e0 - r * dy * 0.8 + 2.6, w1 = Math.max(0.6, w0 - rw * dy * 0.9);
        const a0 = half ? 0 : -w0, a1 = half ? w0 : 0, b0 = half ? 0.4 : -w1, b1 = half ? w1 : -0.4;
        const P = (e, w, y) => (axis === "u" ? [s * e + ou, y, w + ov] : [w + ou, y, s * e + ov]);
        K.quad(P(e0, a0, hb), P(e0, a1, hb), P(e1, b1, yt), P(e1, b0, yt), half ? "#e1edf3" : "#cfe0ea");
      }
    }
  },

  // The London Eye: a 120 m wheel, 135 m tall, held from one side by an A-frame and backstay cables. 32 level
  // capsules ride outside the rim; 64 cable spokes run to the hub. The wheel stands along the footprint's long
  // axis, and the A-frame leans back over the land (lm.land is +1 or -1 across the wheel).
  london_eye(K, lm) {
    // Scaled evenly by the height scale, so the wheel stays round and as tall as its neighbours are drawn.
    K.hs = K.S;
    const k = (lm.h || 135) / 135, R = 60 * k, hub = 71 * k, land = lm.land || 1;
    const WHITE = "#f1f3f4", GLASS = "#bfe0ec";
    const pt = (a, r, v) => [Math.cos(a) * r, hub + Math.sin(a) * r, v];
    const N = 64;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU;
      for (const v of [-2.2, 2.2]) K.beam(pt(a0, R, v), pt(a1, R, v), 0.9, WHITE);
      if (i % 2 === 0) K.beam(pt(a0, R, -2.2), pt(a0, R, 2.2), 0.5, WHITE);
      if (i % 2 === 0) K.beam([0, hub, i % 4 ? 3.5 : -3.5], pt(a0, R, i % 4 ? 2.2 : -2.2), 0.22, "#d3dade");
    }
    K.beam([0, hub, -5.5], [0, hub, 5.5], 4.2, "#c3cbd0");
    for (let i = 0; i < 32; i++) {
      const [u, y] = pt((i / 32) * TAU + 0.05, R + 3.2, 0);
      K.box(u - 1.9, -4, u + 1.9, 4, y - 1.7, y + 1.7, GLASS);
      K.box(u - 2.0, -4.2, u + 2.0, -3.6, y - 1.8, y + 1.8, WHITE);
      K.box(u - 2.0, 3.6, u + 2.0, 4.2, y - 1.8, y + 1.8, WHITE);
    }
    const top = (s) => [s * 1.6, hub, land * 5.5], foot = (s) => [s * 26, 0, land * 46];
    for (const s of [-1, 1]) K.beam(top(s), foot(s), 2.6, WHITE);
    const mid = (s, f) => top(s).map((c, i) => c + (foot(s)[i] - c) * f);
    K.beam(mid(-1, 0.62), mid(1, 0.62), 1.4, WHITE);
    for (const s of [-1, 0, 1]) K.beam([0, hub, land * 5.5], [s * 14, 0, land * 120], 0.35, "#cfd6da");
    K.box(-34, -7, 34, 7, 0, 2.5, "#c9c4b8");
  },

  // Tower Bridge: two 65 m Gothic towers 61 m apart over the bascules, high walkways about 43 m up between them,
  // and suspension chains down to the shore towers over the 82 m side spans. lm.d is the measured distance
  // between the towers' centres.
  tower_bridge(K, lm) {
    const k = (lm.h || 65) / 65, d = lm.d || 80, uc = d / 2;
    const STONE = "#e3ddcf", LIGHT = "#efeadf", SLATE = "#56677b", BLUE = "#8db8dc", BLUE2 = "#6d9cc6", GOLD = "#e3b43a";
    for (const s of [-1, 1]) {
      const c = s * uc;
      K.box(c - 12, -15, c + 12, 15, 0, 7.5, "#cfc8b8");
      for (const side of [-1, 1]) K.box(c - 9, side * 5, c + 9, side * 13, 0, 52 * k, STONE, null);
      K.box(c - 9, -5, c + 9, 5, 21 * k, 52 * k, STONE, null);
      for (const y of [27, 35, 43]) for (const side of [-1, 1]) for (const f of [-1, 1]) {
        K.box(c + f * 9 - 0.05, side * 9 - 1, c + f * 9 + 0.12 * f, side * 9 + 1, y * k, (y + 3) * k, "#4f5a66", null);
      }
      K.box(c - 9.6, -13.6, c + 9.6, 13.6, 52 * k, 53.5 * k, LIGHT);
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        K.lathe(c + su * 8, sv * 12, [[2.4, 30 * k], [2.4, 58 * k], [2.0, 59 * k], [0.25, 64 * k]], 8, (i, j) => (j < 1 ? LIGHT : SLATE));
        K.box(c + su * 8 - 0.2, sv * 12 - 0.2, c + su * 8 + 0.2, sv * 12 + 0.2, 64 * k, 65 * k, GOLD);
      }
      K.frustum(rect(c - 7.5, -10.5, c + 7.5, 10.5), 53.5 * k, rect(c - 1.2, -1.2, c + 1.2, 1.2), 62.5 * k, SLATE);
      K.box(c - 0.3, -0.3, c + 0.3, 0.3, 62.5 * k, 65 * k, GOLD);
    }
    for (const side of [-1, 1]) {
      const v = side * 6.5;
      K.box(-uc + 9, v - 1.6, uc - 9, v + 1.6, 42.5 * k, 43.3 * k, BLUE);
      K.box(-uc + 9, v - 1.3, uc - 9, v + 1.3, 43.3 * k, 46 * k, BLUE2);
      K.box(-uc + 9, v - 1.6, uc - 9, v + 1.6, 46 * k, 46.8 * k, BLUE);
      for (let u = -uc + 12; u < uc - 9; u += 4.5) K.box(u - 0.25, v - 1.65, u + 0.25, v + 1.65, 43.3 * k, 46 * k, "#f2f2ee", null);
      K.box(-uc + 9, side * 7 - 0.4, uc - 9, side * 7 + 0.4, 6.5, 10, BLUE, null);
    }
    const yT = 40 * k, yA = 17, span = 82;
    for (const s of [-1, 1]) {
      const u0 = s * (uc + 9), u1 = s * (uc + 9 + span);
      for (const side of [-1, 1]) {
        let prev = null;
        for (let i = 0; i <= 12; i++) {
          const f = i / 12, y = yT + (yA - yT) * f - 26 * f * (1 - f);
          const p = [u0 + (u1 - u0) * f, Math.max(y, 11), side * 12];
          if (prev) K.beam(prev, p, 1.2, BLUE);
          if (i > 0 && i < 12) K.beam(p, [p[0], 10, side * 11], 0.25, "#eef3f6");
          prev = p;
        }
      }
      const ua = s * (uc + 9 + span + 5);
      K.box(ua - 5, -13, ua + 5, 13, 0, 20, STONE);
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.lathe(ua + su * 4, sv * 11.5, [[1.5, 16], [1.5, 22], [0.2, 26]], 8, (i, j) => (j < 1 ? LIGHT : SLATE));
    }
  },

  // St Paul's Cathedral: Wren's dome, 111 m to the cross. A colonnaded drum about 34 m across, a lead dome, the
  // stone lantern and golden ball and cross; two 67 m west towers. The map's cruciform body stays; the origin
  // is the crossing, u points east and lm.west is the west front's distance along u (negative).
  st_pauls(K, lm) {
    // Everything is drawn 1.6 times taller, which would turn the dome into a cone, so above the nave roof the
    // heights are squashed back towards their real proportions.
    const k = (lm.h || 111) / 111, Y = (y) => (y * k <= 25 ? y * k : 25 + (y * k - 25) * 0.72), STONE = "#e7e2d6", SHADE = "#bdb6a7", LEAD = "#8b9298", RIB = "#7a8188", GOLD = "#dcaa32";
    // Peristyle about 42 m across, then the attic, then the lead dome (34 m across) from about 53 m to the
    // Golden Gallery at 85 m, the lantern, and the ball and cross at 111 m.
    K.lathe(0, 0, [[22, Y(25)], [22, Y(29)]], 24, STONE);
    K.lathe(0, 0, [[20.5, Y(29)], [20.5, Y(47)]], 32, (i) => (i % 2 ? STONE : SHADE));
    K.lathe(0, 0, [[21.2, Y(47)], [21.2, Y(49)], [17.8, Y(49)], [17.8, Y(55)]], 24, (i, j) => (j === 3 && i % 3 === 0 ? "#a39b8b" : STONE));
    K.lathe(0, 0, [[17.4, Y(55)], [17.2, Y(60)], [16.5, Y(65)], [15.2, Y(70)], [13.2, Y(74.5)], [10.4, Y(78.5)], [7.0, Y(82)], [3.8, Y(85)]], 24, (i) => (i % 3 === 0 ? RIB : LEAD));
    K.lathe(0, 0, [[4.2, Y(85)], [4.2, Y(87)], [3.2, Y(87)], [3.2, Y(95)]], 12, (i, j) => (j === 3 && i % 2 ? "#9d9585" : STONE));
    K.lathe(0, 0, [[3.2, Y(95)], [1.8, Y(98)], [0.6, Y(99.5)]], 12, LEAD);
    K.beam([0, Y(99.5), 0], [0, Y(111), 0], 0.7, GOLD);
    K.box(-1.2, -1.2, 1.2, 1.2, Y(101), Y(103.5), GOLD);
    K.beam([-1.8, Y(108), 0], [1.8, Y(108), 0], 0.6, GOLD);
    const uw = (lm.west || -95) + 6, vw = clampN((lm.wf || 50) / 2 - 5, 12, 24);
    for (const s of [-1, 1]) {
      K.box(uw - 5, s * vw - 5, uw + 5, s * vw + 5, 0, Y(44), STONE);
      K.lathe(uw, s * vw, [[4.6, Y(44)], [4.6, Y(56)]], 8, (i) => (i % 2 ? STONE : SHADE));
      K.lathe(uw, s * vw, [[4.3, Y(56)], [3.6, Y(60)], [2.0, Y(63)], [0.6, Y(64.5)]], 8, LEAD);
      K.beam([uw, Y(64.5), s * vw], [uw, Y(67), s * vw], 0.6, GOLD);
    }
  },

  // 30 St Mary Axe (the Gherkin): 180 m, 49 m across at the base, widest (about 56 m) around the 16th floor,
  // closing to a glass lens at the top. Dark and light glass spiral round it.
  gherkin(K, lm) {
    const k = (lm.h || 180) / 180;
    const prof = [[24.5, 0], [26.5, 25], [28, 55], [27.8, 85], [26.2, 110], [23.5, 130], [19.5, 148], [14.5, 162], [9, 171], [4.5, 177], [0.6, 180]];
    const rows = [];
    for (let j = 0; j + 1 < prof.length; j++) {
      const [ra, ya] = prof[j], [rb, yb] = prof[j + 1], n = Math.max(1, Math.round((yb - ya) / 6));
      for (let s = 0; s < n; s++) rows.push([ra + ((rb - ra) * s) / n, (ya + ((yb - ya) * s) / n) * k]);
    }
    rows.push([prof[prof.length - 1][0], 180 * k]);
    K.lathe(0, 0, rows, 24, (i, j) => (((i + j) % 6 + 6) % 6 < 2 ? "#2f475b" : "#91b2c6"));
  },

  // 20 Fenchurch Street (the Walkie-Talkie, home of the Sky Garden): 160 m, and wider at the top than the
  // bottom: its north and south faces bulge outwards as it rises, under a sloping glass roof.
  walkie_talkie(K, lm) {
    const k = (lm.h || 160) / 160, H = 150 * k;
    const [zu, zv] = K.local(0, 1), flareU = Math.abs(zu) > Math.abs(zv);
    const hu0 = clampN(lm.len / 2, 16, 34), hv0 = clampN(lm.wid / 2, 14, 30);
    const ring = (y) => {
      const f = 1 + 0.45 * Math.pow(y / H, 1.6), g = 1 + 0.06 * (y / H);
      return flareU ? rect(-hu0 * f, -hv0 * g, hu0 * f, hv0 * g) : rect(-hu0 * g, -hv0 * f, hu0 * g, hv0 * f);
    };
    const n = 19;
    for (let j = 0; j < n; j++) {
      const y0 = (H * j) / n, y1 = (H * (j + 1)) / n;
      K.frustum(ring(y0), y0, ring(y1), y1, j % 2 ? "#9fb6c6" : "#acc1cf", null);
    }
    const r = ring(H), r2 = r.map(([u, v]) => [u * 0.97, v * 0.97]);
    K.frustum(r, H, r2, 160 * k, "#d2e6ee", "#c3dbe5");
  },

  // The Leadenhall Building (the Cheesegrater): 225 m, a wedge whose sloping face leans back so it doesn't
  // block the view of St Paul's from the west. Yellow lift cores run up its vertical back.
  leadenhall(K, lm) {
    const H = lm.h || 225, hu = clampN(lm.len / 2, 18, 36), hv = clampN(lm.wid / 2, 16, 32);
    const [du, dv] = K.local(-0.92, 0.38), alongU = Math.abs(du) >= Math.abs(dv), s = alongU ? Math.sign(du) : Math.sign(dv);
    const span = alongU ? hu : hv, keep = 7;
    const ring = (f) => {
      const front = span - (2 * span - keep) * f;
      return alongU
        ? (s > 0 ? rect(-hu, -hv, front, hv) : rect(-front, -hv, hu, hv))
        : (s > 0 ? rect(-hu, -hv, hu, front) : rect(-hu, -front, hu, hv));
    };
    const n = 18;
    for (let j = 0; j < n; j++) K.frustum(ring(j / n), (H * j) / n, ring((j + 1) / n), (H * (j + 1)) / n, j % 2 ? "#a6bccb" : "#b4c8d5", j === n - 1 ? "#6f8190" : null);
    const back = -s * span;
    if (alongU) K.box(back - 0.9 * s, -5, back, 5, 0, H * 0.99, "#d9a441", null);
    else K.box(-5, back - 0.9 * s, 5, back, 0, H * 0.99, "#d9a441", null);
  },

  // BT Tower: a 177 m cylinder of glass bands, with antenna galleries near the top and a mast to 189 m.
  bt_tower(K, lm) {
    const k = (lm.h || 189) / 189, r = 8.5;
    const prof = [];
    for (let y = 0; y <= 118; y += 6) prof.push([r, y * k]);
    K.lathe(0, 0, prof, 16, (i, j) => (j % 2 ? "#e9e7e0" : "#3c4c59"));
    const g = [];
    for (let y = 118; y < 150; y += 4) g.push([10.8, y * k], [10.8, (y + 2) * k], [9.2, (y + 2) * k], [9.2, (y + 4) * k], [10.8, (y + 4) * k]);
    K.lathe(0, 0, [[r, 118 * k], ...g], 16, (i, j) => (j % 5 === 2 ? "#4a5865" : "#ecebe5"));
    const p2 = [];
    for (let y = 150; y <= 172; y += 5.5) p2.push([r, y * k]);
    K.lathe(0, 0, [[10.8, 150 * k], ...p2, [9.8, 172 * k], [9.8, 176 * k], [3, 176 * k]], 16, (i, j) => (j % 2 ? "#e9e7e0" : "#3c4c59"));
    K.beam([0, 176 * k, 0], [0, 189 * k, 0], 1.4, "#b9b9b9");
    K.box(-0.9, -0.9, 0.9, 0.9, 187 * k, 189 * k, "#d33b2c");
  },

  // Battersea Power Station: Giles Gilbert Scott's brick building, its blocks as mapped (lm.blocks: rings with
  // their base and top heights), and its four fluted white chimneys, 103 m, where the map puts them.
  battersea(K, lm) {
    const BRICK = "#9b5e46", ROOF = "#6f4536";
    for (const [ring, y0, y1] of lm.blocks || []) {
      const pts = [];
      for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
      if (pts.length >= 3) K.block(pts, y0, y1, BRICK, ROOF);
    }
    const chimneys = lm.chimneys?.length ? lm.chimneys : corners(1).map(([su, sv]) => [su * lm.len * 0.38, sv * lm.wid * 0.36]);
    for (const [cu, cv] of chimneys) {
      K.lathe(cu, cv, [[5.4, 48], [5.4, 52], [4.9, 52], [4.4, 99]], 16, (i, j) => (j < 1 ? "#d9d5ca" : i % 2 ? "#f4f2eb" : "#dad7cd"));
      K.lathe(cu, cv, [[4.7, 99], [4.7, 103]], 16, "#9e9b93");
    }
  },

  // Westminster Abbey: the two west towers (69 m, finished by Hawksmoor in 1745). The abbey's body stays as
  // mapped; u points east and the towers stand at the west end.
  westminster_abbey(K, lm) {
    const k = (lm.h || 69) / 69, uw = -lm.len / 2 + 6, STONE = "#d6c9af", DARK = "#a6987c";
    for (const s of [-1, 1]) {
      const cv = s * 7.5;
      K.box(uw - 5.5, cv - 5.5, uw + 5.5, cv + 5.5, 0, 58 * k, STONE, "#b9ab8f");
      for (const t of [-2.5, 0, 2.5]) K.box(uw - 5.6, cv + t - 0.4, uw - 5.45, cv + t + 0.4, 20 * k, 55 * k, DARK, null);
      for (const [su, sv] of corners(5)) K.lathe(uw + su, cv + sv, [[1.2, 50 * k], [1.2, 63 * k], [0.15, 69 * k]], 8, (i, j) => (j < 1 ? STONE : "#c4b597"));
    }
  },

  // The White Tower: the Norman keep of the Tower of London, about 36 by 32 m and 27 m high, with four corner
  // turrets (the north-east one round) under lead cupolas.
  white_tower(K, lm) {
    const k = (lm.h || 27) / 27, hu = clampN(lm.len / 2, 14, 19), hv = clampN(lm.wid / 2, 12, 17);
    const STONE = "#e3dccb", LEAD = "#7c868c";
    K.box(-hu, -hv, hu, hv, 0, 27 * k, STONE, "#cfc7b5");
    for (let u = -hu + 1; u < hu; u += 2.6) for (const s of [-1, 1]) K.box(u - 0.6, s * hv - 0.6, u + 0.6, s * hv + 0.1 * s, 27 * k, 28.6 * k, STONE);
    for (let v = -hv + 1; v < hv; v += 2.6) for (const s of [-1, 1]) K.box(s * hu - 0.6, v - 0.6, s * hu + 0.1 * s, v + 0.6, 27 * k, 28.6 * k, STONE);
    for (const s of [-1, 1]) for (let u = -hu + 4; u < hu - 2; u += 6) K.box(u - 0.6, s * hv - 0.05, u + 0.6, s * hv + 0.1 * s, 15 * k, 19 * k, "#3e3a33", null);
    const [eu, ev] = K.local(1, -1);
    for (const [su, sv] of corners(1)) {
      const cu = su * (hu - 2.4), cv = sv * (hv - 2.4), round = su * eu + sv * ev > 1.2;
      if (round) K.lathe(cu, cv, [[3.6, 0], [3.6, 33 * k]], 12, STONE);
      else K.box(cu - 3, cv - 3, cu + 3, cv + 3, 0, 33 * k, STONE);
      K.lathe(cu, cv, [[3.2, 33 * k], [3.1, 35 * k], [1.7, 37 * k], [0.4, 38.5 * k]], 12, LEAD);
      K.beam([cu, 38.5 * k, cv], [cu, 40.5 * k, cv], 0.3, "#d8aa36");
    }
  },
};

export const LANDMARK_KINDS = Object.keys(MODELS);

export function buildLandmarks(list, { yScale = 1, color, triangulate }) {
  const out = { position: [], normal: [], color: [], bid: [] };
  const cache = new Map(), col = (hex) => cache.get(hex) || (cache.set(hex, color(hex)), cache.get(hex));
  for (const lm of list || []) {
    const make = MODELS[lm.kind];
    if (make) make(new Kit(lm, yScale, out, col, triangulate), lm);
  }
  return out;
}
