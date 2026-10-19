// Hand-built models of the Brisbane River bridges, drawn in place of the plain decks the map gives every bridge.
//
// bridges.json (bridges/build_bridges.py) says which of westend.json's bridge ways belong to each named bridge,
// and gives its straight axis and deck width. terrain.js works out every way's deck height, as it does for any
// bridge, and leaves the plain deck and piers out for the claimed ways; once the city is built it calls
// build() here with those decks, and each model draws the bridge around them.
//
// Each model works in the bridge's own frame: u metres along the axis from its first end, v metres across it
// (to the left), and y the drawn height (real metres times the map's 1.6, as for buildings). deckTop(u) is the
// top of the deck the cars drive on, so arches, pylons and piers meet it. Shapes and sizes follow published
// dimensions and photos (see each model's notes); a model may set `deck`, its real height above the river at
// mid-span, and the cars follow it. Like the landmark models in the city diorama kit, this file only builds
// geometry; terrain.js turns it into one mesh with the bridges' material.
(() => {
  const models = {};
  window.__bridgeModels = { models, build };

  class Kit {
    constructor(b, ctx, out) {
      Object.assign(this, { b, ctx, out, S: ctx.S });
      this.cache = new Map();
      this.frame([[b.axis[0], b.axis[1]], [b.axis[2], b.axis[3]]]);
    }
    // The frame: a polyline the model is built along (the straight axis, or a curved deck line), with u the
    // distance along it and v the offset to its left.
    frame(F) {
      const C = [0];
      for (let i = 1; i < F.length; i++) C.push(C[i - 1] + Math.hypot(F[i][0] - F[i - 1][0], F[i][1] - F[i - 1][1]));
      Object.assign(this, { F, C, L: C[C.length - 1] });
      this.cache.delete('river');
      this.profile();
    }
    // Follow a claimed way's own line instead of the straight axis, shifted `shift` metres to its left.
    follow(part, shift = 0) {
      const P = part.P, n = P.length, F = [];
      for (let i = 0; i < n; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        F.push([P[i][0] - ((b[1] - a[1]) / l) * shift, P[i][1] + ((b[0] - a[0]) / l) * shift]);
      }
      this.frame(F);
    }
    seg(u) {
      const C = this.C;
      let i = 0, j = C.length - 1;
      if (u <= 0) i = 0;
      else if (u >= this.L) i = C.length - 2;
      else {
        while (j - i > 1) {
          const m = (i + j) >> 1;
          C[m] <= u ? (i = m) : (j = m);
        }
      }
      return i;
    }
    // Local (u, y, v) to world [x, y, z].
    P(u, y, v = 0) {
      const i = this.seg(u), A = this.F[i], B = this.F[i + 1], l = this.C[i + 1] - this.C[i] || 1;
      const dx = (B[0] - A[0]) / l, dz = (B[1] - A[1]) / l, t = u - this.C[i];
      return [A[0] + dx * t - dz * v, y, A[1] + dz * t + dx * v];
    }
    local(x, z) {
      let best = null, bd = Infinity;
      for (let i = 0; i + 1 < this.F.length; i++) {
        const A = this.F[i], B = this.F[i + 1], l = this.C[i + 1] - this.C[i] || 1;
        const dx = (B[0] - A[0]) / l, dz = (B[1] - A[1]) / l;
        let t = (x - A[0]) * dx + (z - A[1]) * dz;
        const first = i === 0, last = i + 2 === this.F.length;
        const tc = Math.max(first ? -Infinity : 0, Math.min(last ? Infinity : l, t));
        const px = A[0] + dx * tc, pz = A[1] + dz * tc, dd = Math.hypot(x - px, z - pz);
        if (dd < bd) (bd = dd), (best = [this.C[i] + tc, -(x - A[0]) * dz + (z - A[1]) * dx]);
      }
      return best;
    }
    // The mean offset of a claimed way from the frame over its middle, to find a twin's centreline.
    offsetOf(part) {
      let s = 0, n = 0;
      for (const p of part.P) {
        const [u, v] = this.local(p[0], p[1]);
        if (u > this.L * 0.3 && u < this.L * 0.7) (s += v), n++;
      }
      return n ? s / n : 0;
    }
    // The deck top along the axis, from the claimed ways' decks (the highest within the deck's width), every 2 m.
    profile() {
      const step = 2, pad = 60, n = Math.ceil((this.L + 2 * pad) / step) + 1, prof = new Float32Array(n).fill(NaN);
      // each claimed way's deck, interpolated along u on its own, then the highest of them at each step (taking
      // the highest sample per step instead mixes ways that ramp at different places, and the deck zigzags)
      for (const p of this.b.parts) {
        const pts = [];
        for (let i = 0; i < p.P.length; i++) {
          const [u, v] = this.local(p.P[i][0], p.P[i][1]);
          if (Math.abs(v) <= this.b.width / 2 + 12) pts.push([u, p.deck[i] + 0.8]);
        }
        pts.sort((a, b) => a[0] - b[0]);
        for (let i = 0; i + 1 < pts.length; i++) {
          const [ua, ya] = pts[i], [ub, yb] = pts[i + 1];
          for (let k = Math.max(0, Math.ceil((ua + pad) / step)); k < n && k * step - pad <= ub; k++) {
            const u = k * step - pad, y = ub > ua ? ya + ((yb - ya) * (u - ua)) / (ub - ua) : ya;
            if (!(prof[k] >= y)) prof[k] = y;
          }
        }
      }
      let last = -1;
      for (let k = 0; k < n; k++) {
        if (Number.isNaN(prof[k])) continue;
        if (last < 0) prof.fill(prof[k], 0, k);
        else for (let q = last + 1; q < k; q++) prof[q] = prof[last] + ((prof[k] - prof[last]) * (q - last)) / (k - last);
        last = k;
      }
      if (last >= 0) prof.fill(prof[last], last + 1);
      this.prof = { prof, step, pad, n };
    }
    deckTop(u) {
      const { prof, step, pad, n } = this.prof;
      const f = Math.min(n - 1.001, Math.max(0, (u + pad) / step)), k = f | 0;
      return prof[k] + (prof[k + 1] - prof[k]) * (f - k);
    }
    ground(u, v = 0) {
      const [x, , z] = this.P(u, 0, v);
      return this.ctx.h(x, z);
    }
    surface(u, v = 0) {
      const [x, , z] = this.P(u, 0, v);
      return this.ctx.hs(x, z);
    }
    wet(u, v = 0) {
      const [x, , z] = this.P(u, 0, v);
      return this.ctx.inWater(x, z);
    }
    // Where the axis is over water: [first u, last u].
    river() {
      if (!this.cache.has('river')) {
        let a = null, b = null;
        for (let u = 0; u <= this.L; u += 2) if (this.wet(u)) (a ??= u), (b = u);
        this.cache.set('river', a == null ? [this.L * 0.25, this.L * 0.75] : [a, b]);
      }
      return this.cache.get('river');
    }
    col(hex) {
      if (!this.cache.has(hex)) {
        const c = new this.ctx.K.Color(hex);
        this.cache.set(hex, [c.r, c.g, c.b]);
      }
      return this.cache.get(hex);
    }
    tri(a, b, c, hex) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) return;
      (nx /= l), (ny /= l), (nz /= l);
      const rgb = this.col(hex), o = this.out;
      for (const p of [a, b, c]) o.position.push(p[0], p[1], p[2]), o.normal.push(nx, ny, nz), o.color.push(rgb[0], rgb[1], rgb[2]);
    }
    quad(a, b, c, d, hex) {
      this.tri(a, b, c, hex);
      this.tri(a, c, d, hex);
    }
    // A box in the bridge's frame (sides along u and v), y in drawn metres.
    box(u0, u1, v0, v1, y0, y1, hex, top = hex) {
      const p = (u, y, v) => this.P(u, y, v);
      this.quad(p(u0, y1, v0), p(u1, y1, v0), p(u1, y1, v1), p(u0, y1, v1), top);
      this.quad(p(u0, y0, v0), p(u1, y0, v0), p(u1, y0, v1), p(u0, y0, v1), hex);
      this.quad(p(u0, y0, v0), p(u1, y0, v0), p(u1, y1, v0), p(u0, y1, v0), hex);
      this.quad(p(u0, y0, v1), p(u1, y0, v1), p(u1, y1, v1), p(u0, y1, v1), hex);
      this.quad(p(u0, y0, v0), p(u0, y0, v1), p(u0, y1, v1), p(u0, y1, v0), hex);
      this.quad(p(u1, y0, v0), p(u1, y0, v1), p(u1, y1, v1), p(u1, y1, v0), hex);
    }
    // A member between two local points [u, y, v], w wide and t thick (both drawn metres).
    beam(a, b, w, t, hex) {
      const A = this.P(a[0], a[1], a[2]), B = this.P(b[0], b[1], b[2]);
      let dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
      const L = Math.hypot(dx, dy, dz) || 1;
      (dx /= L), (dy /= L), (dz /= L);
      let sx = -dz, sz = dx, sl = Math.hypot(sx, sz);
      if (sl < 1e-3) {
        // a vertical member: face it along the frame at its foot
        const p0 = this.P(a[0], 0, 0), p1 = this.P(a[0] + 1, 0, 0);
        (sx = p1[0] - p0[0]), (sz = p1[2] - p0[2]), (sl = Math.hypot(sx, sz) || 1);
      }
      (sx /= sl), (sz /= sl);
      const fx = dy * sz, fy = dz * sx - dx * sz, fz = -dy * sx; // d × s
      const c = (P, i, j) => [P[0] + (sx * i * w + fx * j * t) / 2, P[1] + (fy * j * t) / 2, P[2] + (sz * i * w + fz * j * t) / 2];
      const k = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let q = 0; q < 4; q++) {
        const [i0, j0] = k[q], [i1, j1] = k[(q + 1) % 4];
        this.quad(c(A, i0, j0), c(A, i1, j1), c(B, i1, j1), c(B, i0, j0), hex);
      }
      this.quad(c(A, -1, -1), c(A, 1, -1), c(A, 1, 1), c(A, -1, 1), hex);
      this.quad(c(B, -1, -1), c(B, 1, -1), c(B, 1, 1), c(B, -1, 1), hex);
    }
    // A thin member, for cables and hangers.
    cable(a, b, hex = '#f2f2ee', w = 0.35) {
      this.beam(a, b, w, w, hex);
    }
    // A vertical prism of n sides around (u, v), from y0 to y1, radii r0 at the bottom and r1 at the top.
    column(u, v, y0, y1, r0, hex, n = 8, r1 = r0) {
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        const p = (a, r, y) => this.P(u + Math.cos(a) * r, y, v + Math.sin(a) * r);
        this.quad(p(a0, r0, y0), p(a1, r0, y0), p(a1, r1, y1), p(a0, r1, y1), hex);
        this.tri(this.P(u, y1, v), p(a0, r1, y1), p(a1, r1, y1), hex);
      }
    }
    // A deck slab along a claimed way's own line (so curved approaches stay curved): its top at the deck,
    // `depth` drawn metres deep (a number, or a function of u), with railings.
    way(part, { depth = 1.3 * this.S, top = '#b3aca2', side = '#ddd6cb', rail = '#ece8e1', railH = 0.9 * this.S, under = side, width } = {}) {
      const P = part.P, n = P.length, w = (width ?? part.width) / 2;
      const L = [], R = [], Y = [];
      for (let i = 0; i < n; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
        let dx = b[0] - a[0], dz = b[1] - a[1];
        const l = Math.hypot(dx, dz) || 1;
        (dx /= l), (dz /= l);
        L.push([P[i][0] - dz * w, P[i][1] + dx * w]);
        R.push([P[i][0] + dz * w, P[i][1] - dx * w]);
        Y.push(part.deck[i] + 0.8);
      }
      const dep = (i) => (typeof depth === 'function' ? depth(this.local(P[i][0], P[i][1])[0], i) : depth);
      for (let i = 0; i + 1 < n; i++) {
        const y0 = Y[i], y1 = Y[i + 1], d0 = dep(i), d1 = dep(i + 1);
        const p = (Q, y) => [Q[0], y, Q[1]];
        this.quad(p(L[i], y0), p(R[i], y0), p(R[i + 1], y1), p(L[i + 1], y1), top);
        this.quad(p(L[i], y0 - d0), p(R[i], y0 - d0), p(R[i + 1], y1 - d1), p(L[i + 1], y1 - d1), under);
        for (const Q of [L, R]) {
          this.quad(p(Q[i], y0 - d0), p(Q[i + 1], y1 - d1), p(Q[i + 1], y1), p(Q[i], y0), side);
          if (railH > 0) this.quad(p(Q[i], y0), p(Q[i + 1], y1), p(Q[i + 1], y1 + railH), p(Q[i], y0 + railH), rail);
        }
      }
    }
    // Run the frame from the end nearer (x, z).
    orient(x, z) {
      const a = this.F[0], b = this.F[this.F.length - 1];
      if (Math.hypot(b[0] - x, b[1] - z) < Math.hypot(a[0] - x, a[1] - z)) this.frame(this.F.slice().reverse());
    }
    // Which side (+1 left, -1 right) of the frame faces a world direction (dx, dz), at mid-length.
    side(dx, dz) {
      const m = this.P(this.L / 2, 0, 0), [, v] = this.local(m[0] + dx * 50, m[2] + dz * 50);
      return v >= 0 ? 1 : -1;
    }
    // A low wall along the deck from u0 to u1 at v, h drawn metres tall and t thick.
    wall(u0, u1, v, h, t, hex) {
      this.slab(u0, u1, v - t / 2, v + t / 2, 0.01, hex, hex, 6, h);
      this.slab(u0, u1, v - t / 2, v + t / 2, h, hex, hex, 6, h);
    }
    // A deck (or a roof, with `lift`) along the frame from u0 to u1, between v0 and v1, following deckTop.
    slab(u0, u1, v0, v1, depth, top, side, step = 6, lift = 0) {
      const n = Math.max(1, Math.ceil((u1 - u0) / step));
      for (let i = 0; i < n; i++) {
        const a = u0 + ((u1 - u0) * i) / n, b = u0 + ((u1 - u0) * (i + 1)) / n;
        const ya = this.deckTop(a) + lift, yb = this.deckTop(b) + lift;
        const da = typeof depth === 'function' ? depth(a) : depth, db = typeof depth === 'function' ? depth(b) : depth;
        const p = (u, y, v) => this.P(u, y, v);
        this.quad(p(a, ya, v0), p(b, yb, v0), p(b, yb, v1), p(a, ya, v1), top);
        this.quad(p(a, ya - da, v0), p(b, yb - db, v0), p(b, yb - db, v1), p(a, ya - da, v1), side);
        this.quad(p(a, ya - da, v0), p(b, yb - db, v0), p(b, yb, v0), p(a, ya, v0), side);
        this.quad(p(a, ya - da, v1), p(b, yb - db, v1), p(b, yb, v1), p(a, ya, v1), side);
      }
    }
    // A pier under the deck at u: a box from below the ground (or river bed) up to the deck's underside.
    pier(u, v0, v1, len, under, hex) {
      const y0 = Math.min(this.ground(u, v0), this.ground(u, v1)) - 1;
      this.box(u - len / 2, u + len / 2, v0, v1, y0, this.deckTop(u) - under, hex);
    }
    // Points along a curve y(u) from u0 to u1 in n steps, at v (or v(t)).
    curve(u0, u1, y, v, n) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, u = u0 + (u1 - u0) * t;
        pts.push([u, y(u, t), typeof v === 'function' ? v(t) : v]);
      }
      return pts;
    }
    // A chain of members through the points.
    chain(pts, w, t, hex) {
      for (let i = 0; i + 1 < pts.length; i++) this.beam(pts[i], pts[i + 1], w, t, hex);
    }
    // A parabolic arch rib from (u0, y0) to (u1, y1), rising `rise` drawn metres above the chord at mid-span.
    arch(u0, u1, y0, y1, rise, v, w, t, hex, n = 20) {
      const pts = this.curve(u0, u1, (u, s) => y0 + (y1 - y0) * s + 4 * rise * s * (1 - s), v, n);
      this.chain(pts, w, t, hex);
      return pts;
    }
    // A truss between u0 and u1 on both sides of the deck (v = ±half), from the deck up `height(u)` drawn
    // metres: chords, verticals, diagonals (Warren, alternating) and top bracing between the two sides.
    truss(u0, u1, half, height, panels, hex, { w = 0.9, t = 0.9, base = (u) => this.deckTop(u), verticals = true, brace = true } = {}) {
      const at = (i) => u0 + ((u1 - u0) * i) / panels;
      for (const v of [-half, half]) {
        for (let i = 0; i < panels; i++) {
          const a = at(i), b = at(i + 1);
          const A = [a, base(a), v], B = [b, base(b), v], At = [a, base(a) + height(a), v], Bt = [b, base(b) + height(b), v];
          this.beam(A, B, w, t, hex);
          this.beam(At, Bt, w, t, hex);
          this.beam(i % 2 ? At : A, i % 2 ? B : Bt, w * 0.8, t * 0.8, hex);
          if (verticals) this.beam(A, At, w * 0.7, t * 0.7, hex);
        }
        this.beam([u1, base(u1), v], [u1, base(u1) + height(u1), v], w * 0.7, t * 0.7, hex);
      }
      if (brace)
        for (let i = 0; i <= panels; i++) {
          const a = at(i), y = base(a) + height(a);
          if (height(a) > 2) this.beam([a, y, -half], [a, y, half], w * 0.6, t * 0.6, hex);
        }
    }
    // A prism with an elliptical section (a along u, b across) from y0 to y1, for pile caps, drums and platforms.
    ellipse(u, v, a, b, y0, y1, hex, top = hex, n = 18) {
      const p = (i, y) => this.P(u + Math.cos((i / n) * Math.PI * 2) * a, y, v + Math.sin((i / n) * Math.PI * 2) * b);
      for (let i = 0; i < n; i++) {
        this.quad(p(i, y0), p(i + 1, y0), p(i + 1, y1), p(i, y1), hex);
        this.tri(this.P(u, y1, v), p(i, y1), p(i + 1, y1), top);
        this.tri(this.P(u, y0, v), p(i + 1, y0), p(i, y0), hex);
      }
    }
    // A block whose half-sizes change from (a0 along, b0 across) at y0 to (a1, b1) at y1: tapered or battered piers.
    taper(u, v, a0, b0, a1, b1, y0, y1, hex, top = hex) {
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const lo = c.map(([i, j]) => this.P(u + i * a0, y0, v + j * b0)), hi = c.map(([i, j]) => this.P(u + i * a1, y1, v + j * b1));
      for (let q = 0; q < 4; q++) this.quad(lo[q], lo[(q + 1) % 4], hi[(q + 1) % 4], hi[q], hex);
      this.quad(hi[0], hi[1], hi[2], hi[3], top);
      this.quad(lo[0], lo[1], lo[2], lo[3], hex);
    }
    // Map a spec's chainages (metres along the bridge, with the river from s0 to s1) onto u, using where this
    // frame meets the water, optionally running the other way.
    chainage(s0, s1, reversed = false) {
      const [r0, r1] = this.river(), f = (r1 - r0) / (s1 - s0);
      return reversed ? (ch) => r1 - (ch - s0) * f : (ch) => r0 + (ch - s0) * f;
    }
    // Lamp posts along an edge every `step` metres: a pole `h` real metres tall with a short arm.
    lamps(u0, u1, v, step, h, hex = '#9ea3a6') {
      const S = this.S;
      for (let u = u0; u <= u1; u += step) {
        const y = this.deckTop(u), top = y + h * S;
        this.beam([u, y, v], [u, top, v], 0.35, 0.35, hex);
        this.beam([u, top, v], [u, top, v - Math.sign(v || 1) * 2.2], 0.3, 0.3, hex);
      }
    }
    // Stay cables from a pylon top to anchors along the deck edge: list of u positions, both edges unless v given.
    fan(top, us, vs, hex = '#f2f2ee', w = 0.35) {
      for (const u of us) for (const v of vs) this.cable(top, [u, this.deckTop(u) + 0.5, v], hex, w);
    }
  }

  // The plain model, for any claimed bridge without its own: the generic deck, railings and piers.
  models.default = {
    draw(k) {
      for (const p of k.b.parts) k.way(p);
      const [r0, r1] = k.river();
      for (let u = r0 + 40; u < r1 - 20; u += 45) k.pier(u, -k.b.width / 2 + 1, k.b.width / 2 - 1, 2.4, 1.3 * k.S, '#d9d4cb');
    },
  };

  // ---------------------------------------------------------------------------------------------------------
  // The models. Each note gives the layout used, from the research specs (Wikipedia, engineering papers, BCC,
  // the Queensland heritage register, MSQ's air-draft table, Commons photos and satellite views; 19 Oct 2026).
  // Chainages are mapped onto the frame through where it meets the river, so each model lands on the real
  // banks. Heights in real metres are multiplied by S, like every other height on the map.
  // ---------------------------------------------------------------------------------------------------------
  const rad = (d) => (d * Math.PI) / 180;
  const roadway = (k, p, o) => k.way(p, o);

  // Captain Cook Bridge (1972): twin post-tensioned concrete box girders, 555 m, a 183 m main span. Deep
  // parabolic haunches over the two main piers read as flat arches; inverted-trapezoid wall piers in pairs.
  // CBD end: 5 approach spans of about 35 m into the Riverside Expressway, anchor pier at the mangroves.
  models['captain-cook'] = {
    deck: 17,
    draw(k) {
      const S = k.S, D = (u) => k.deckTop(u);
      const at = k.chainage(120, 490), aN = at(180), pN = at(305), pS = at(488), end = at(557);
      const depth = (u) => {
        let d = 2.5;
        if (u >= pN && u <= pS) d = 3 + 5.5 * (2 * ((u - pN) / (pS - pN)) - 1) ** 2;
        else if (u >= aN && u < pN) d = 2.5 + 6 * ((u - aN) / (pN - aN)) ** 2;
        else if (u > pS) d = 2.5 + 6 * Math.max(0, 1 - (u - pS) / (end - pS)) ** 2;
        return d * S;
      };
      const vs = k.b.parts.map((p) => k.offsetOf(p));
      for (const p of k.b.parts) roadway(k, p, { depth, top: '#3d3f42', side: '#e4e1d8', under: '#a3a49f', rail: '#f2f2ee', railH: 1.1 * S });
      for (const u of [aN, pN, pS])
        for (const vc of vs) {
          const y0 = k.ground(u, vc) - 1, y1 = D(u) - depth(u);
          k.taper(u, vc, 2.5, 3.5, 4.5, 3.5, y0, y1, '#cfcdc6');
          if (k.wet(u, vc)) k.taper(u, vc, 2.7, 3.7, 2.8, 3.7, y0, 1.4, '#4a4a42');
        }
      for (let ch = 35; ch < 180; ch += 35)
        for (const vc of vs) for (const dv of [-4, 4]) k.taper(at(ch), vc + dv, 1, 2, 1, 2, k.ground(at(ch), vc + dv) - 1, D(at(ch)) - depth(at(ch)), '#cfcdc6');
      const edge = Math.max(...vs.map(Math.abs)) + 7.5;
      for (const v of [-edge, edge]) k.lamps(at(10), end - 10, v, 35, 12, '#b0b4b6');
    },
  };

  // Goodwill Bridge (2001), pedestrians and cyclists: from South Bank, a curved approach on steel portals, a
  // raking white abutment, the 120 m span under two 102 m steel arches that lean towards each other (7 and 29
  // degrees, 15 m high, zigzag hangers), the white pavilion pier with its raked mast and stays, then the
  // straight approach on portal frames under a louvre canopy to QUT. Blue-grey steel, white concrete.
  models.goodwill = {
    deck: 14.5,
    draw(k) {
      const S = k.S, D = (u) => k.deckTop(u), steel = '#5e6974';
      const main = k.b.parts.reduce((a, p) => (p.P.length > a.P.length ? p : a));
      k.follow(main);
      k.orient(k.b.axis[0], k.b.axis[1]);
      const at = k.chainage(145, 420), sAb = at(145), a0 = at(154), a1 = at(256), pav = at(270);
      for (const p of k.b.parts) roadway(k, p, { depth: 1.2 * S, top: '#b8b5ad', side: steel, under: '#3f474f', rail: '#8b9196', railH: 1.2 * S, width: 7 });
      const ribs = [[5, 5 - 15 * Math.tan(rad(7))], [-5, -5 + 15 * Math.tan(rad(29))]];
      ribs.forEach(([vs, vc], r) => {
        const pts = k.curve(a0, a1, (u, t) => D(u) + 4 * 15 * S * t * (1 - t), (t) => vs + (vc - vs) * 4 * t * (1 - t), 22);
        k.chain(pts, 0.9, 1.4, steel);
        for (let i = 2; i < pts.length - 2; i++) {
          const uu = pts[i % 2 ? i - 1 : i + 1][0];
          k.cable(pts[i], [uu, D(uu), Math.sign(vs) * 3.4], steel, 0.4);
        }
        // the restraint members carry each rib's line down past the abutment into the ground
        k.beam([a0, D(a0), vs], [a0 - 14, k.ground(a0 - 14, vs), vs * 1.4], 1.2, 1.2, steel);
      });
      for (const v of [-3, 3]) k.beam([sAb - 9, k.ground(sAb - 9, v) - 1, v * 1.3], [sAb, D(sAb) - 1.2 * S, v], 2.2, 2.2, '#eeeeea');
      // the pavilion: white blade pier, viewing platform and roof, raked mast and stays
      const yP = D(pav) - 1.2 * S;
      k.ellipse(pav, 0, 7, 5, k.ground(pav) - 1, 1.2 * S, '#d9d6cf');
      k.taper(pav, 0, 4.5, 2.2, 2.4, 1.6, 1.2 * S, yP, '#eeeeea');
      k.ellipse(pav, 0, 13, 9, yP, D(pav), steel, '#b8b5ad');
      k.ellipse(pav + 2, 0, 9, 6, D(pav) + 3.6 * S, D(pav) + 3.9 * S, '#c9ced2');
      const top = [pav + 5, D(pav) + 28 * S, 0], node = [pav + 3, D(pav) + 17 * S, 0];
      k.beam([pav - 1, D(pav), 0], top, 1.2, 1.2, '#eeeeea');
      for (const du of [-26, -14, 14, 26]) for (const v of [-3.4, 3.4]) k.cable(node, [pav + du, D(pav + du) + 0.5, v]);
      for (const v of [-5, 5]) k.cable(top, [a1, D(a1) + 1, v]);
      // portal frames on both approaches, and the louvre canopy along the city approach
      const portal = (u) => {
        const y = D(u) - 1.2 * S;
        for (const v of [-3.6, 3.6]) k.beam([u, k.ground(u, v) - 1, v], [u, y, v], 0.7, 0.7, steel);
        k.beam([u, y, -3.8], [u, y, 3.8], 0.8, 0.8, steel);
      };
      for (let ch = 20; ch < 140; ch += 20) portal(at(ch));
      for (let ch = 290; ch < 445; ch += 20) portal(at(ch));
      for (let ch = 280; ch < 440; ch += 10) k.beam([at(ch), D(at(ch)), 3.5], [at(ch), D(at(ch)) + 4.5 * S, 3.5], 0.35, 0.35, '#c9ced2');
      k.slab(at(280), at(440), 0.4, 3.8, 0.25, '#c9ced2', '#c9ced2', 6, 4.5 * S);
    },
  };

  // Neville Bonner Bridge (2024), pedestrians: from South Bank, a tied arch on four splayed white legs (crown
  // 30 m above the river) to the mid-river pier with its lens-shaped deck and two drums, then a 145 m
  // cable-stayed span from a white mast leaning towards Queen's Wharf (75 m above the river), a 37 m approach
  // over the expressway to the Queen's Wharf podium. A full-length white canopy. Spans 138 / 145 / 37 m.
  models['neville-bonner'] = {
    deck: 13.5,
    draw(k) {
      const S = k.S, D = (u) => k.deckTop(u), white = '#f4f3ef';
      const at = k.chainage(43, 326, true), pier = at(209), qw = at(68), sb = at(340), crown = at(272);
      for (const p of k.b.parts) roadway(k, p, { depth: 1.2 * S, top: '#cfcac0', side: white, under: '#c9cbc8', rail: '#c9cbcb', railH: 1.2 * S, width: 5 });
      const u0 = Math.min(sb, at(30)), u1 = Math.max(sb, at(30));
      k.slab(u0, u1, -3.2, 3.2, 0.3, white, '#e6e6e2', 6, 3 * S);
      for (let u = u0 + 4; u < u1; u += 12) for (const v of [-2.6, 2.6]) k.beam([u, D(u), v], [u, D(u) + 3 * S, v], 0.3, 0.3, white);
      // the mid-river pier: drums, pile cap and the observation deck
      for (const v of [-10.5, 10.5]) k.ellipse(pier, v, 5.5, 5.5, k.ground(pier, v) - 1, 1.6 * S, '#dad7cf');
      k.box(pier - 5, pier + 5, -9, 9, k.ground(pier) - 1, D(pier) - 1.2 * S, '#dad7cf');
      k.ellipse(pier, 0, 20, 7.25, D(pier) - 1.2 * S, D(pier), white, '#cfcac0');
      k.box(qw - 1.5, qw + 1.5, -2, 2, k.ground(qw) - 1, D(qw) - 1.2 * S, '#dad7cf');
      // the mast, leaning about 22 degrees towards Queen's Wharf, with its stays and the backstays to the crown
      const dir = Math.sign(qw - pier), base = [pier, D(pier), 0], top = [pier + dir * 25, D(pier) + 62 * S, 0];
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const a = i / segs, b = (i + 1) / segs, w = 2.5 - 1.5 * a;
        k.beam(base.map((c, q) => c + (top[q] - c) * a), base.map((c, q) => c + (top[q] - c) * b), w, w, white);
      }
      for (const [i, d] of [18, 34, 52, 72].entries())
        for (const v of [-2.5, 2.5]) k.cable([top[0] - dir * i * 1.2, top[1] - i * 2.2 * S, 0], [pier + dir * d, D(pier + dir * d) + 0.5, v], '#b8bcbf');
      const cr = [crown, 30 * S, 0];
      for (const v of [-0.8, 0.8]) k.cable(top, [crown, 30 * S, v], '#b8bcbf');
      // the arch: two legs from the South Bank abutment, two from the pier, meeting at the crown
      const leg = (from) => {
        for (let i = 0; i < 6; i++) {
          const a = i / 6, b = (i + 1) / 6, w = 3 - 1.5 * a;
          k.beam(from.map((c, q) => c + (cr[q] - c) * a), from.map((c, q) => c + (cr[q] - c) * b), w, w, white);
        }
      };
      for (const v of [-9, 9]) leg([sb, k.ground(sb, v), v]);
      for (const v of [-4.5, 4.5]) leg([pier - dir * 6, D(pier) - 1.5 * S, v]);
      for (const d of [-14, -7, 0, 7, 14, 21]) k.cable(cr, [crown + d, D(crown + d), 0], '#b8bcbf', 0.3);
      for (const v of [-9, 9]) k.taper(sb, v, 5, 3, 1.5, 1.5, k.ground(sb, v) - 1, k.ground(sb, v) + 4 * S, '#dad7cf');
    },
  };

  // Victoria Bridge (1969): a three-span haunched concrete box girder, 313 m, a 146.3 m main span with
  // symmetric 83 m side spans, two flared wall piers in the river. Now buses, a bikeway and footpaths, with
  // swan-neck lamps. Deep at the piers (about 6.5 m), 2.5 m at mid-span and the abutments.
  models.victoria = {
    deck: 15,
    draw(k) {
      const S = k.S, D = (u) => k.deckTop(u), conc = '#e7e3d8';
      const at = k.chainage(34, 303), sA = at(8), pS = at(91), pN = at(238), nA = at(321);
      const depth = (u) => {
        let d;
        if (u < pS) d = 2.5 + 4 * Math.max(0, (u - sA) / (pS - sA)) ** 2;
        else if (u <= pN) d = 2.5 + 4 * (2 * ((u - pS) / (pN - pS)) - 1) ** 2;
        else d = 2.5 + 4 * Math.max(0, (nA - u) / (nA - pN)) ** 2;
        return d * S;
      };
      k.slab(sA, nA, -12, 12, depth, '#3b3d40', conc);
      for (const [v0, v1] of [[-12, -6.6], [8.2, 12]]) k.slab(sA, nA, v0, v1, 0.1, '#bdb9b0', conc, 6, 0.12);
      for (const v of [-6.3, 5.9]) k.wall(sA, nA, v, 1.1 * S, 0.5, '#d9d6cd');
      for (const v of [-11.9, 11.9]) k.wall(sA, nA, v, 1.1 * S, 0.25, '#efefea');
      for (const u of [pS, pN]) {
        const y0 = k.ground(u) - 1, y1 = D(u) - depth(u);
        k.taper(u, 0, 2, 3.5, 2, 6, y0, y1, conc);
        k.taper(u, 0, 2.15, 3.65, 2.1, 3.9, y0, 1.4, '#6e6a60');
      }
      for (const v of [-11.6, 11.6]) k.lamps(sA + 10, nA - 10, v, 30, 10, '#4b4f53');
    },
  };

  // Kurilpa Bridge (2009), pedestrians: a "tensegrity" bridge. From Kurilpa Point, the spiral ramp, a 57 m
  // side span, the 128 m main span and a 45 m side span to the river wall, then curved spans over the
  // expressway to Tank St. A thin white deck under a forest of 20 raked white masts (crowns of six over the
  // two blade piers), 16 flying spars, a web of cables and a continuous canopy over half the deck.
  models.kurilpa = {
    deck: 13.5,
    draw(k) {
      const S = k.S, D = (u) => k.deckTop(u), white = '#f2f3f1', grey = '#9aa0a4';
      k.follow(k.b.parts[0]);
      k.orient(k.b.axis[0], k.b.axis[1]);
      const at = k.chainage(134, 328);
      for (const p of k.b.parts) roadway(k, p, { depth: 1.0 * S, top: '#c9c4ba', side: white, under: '#e6e3dc', rail: '#8c7f6e', railH: 1.3 * S, width: 7 });
      const pS = at(169), pN = at(297);
      for (const u of [pS, pN]) {
        k.box(u - 4.5, u + 4.5, -4.5, 4.5, k.ground(u) - 1, 1.5 * S, '#a9a398');
        k.taper(u, 0, 1, 3.2, 1.1, 4, 1.5 * S, D(u) - S, '#b8b2a6');
      }
      k.ellipse(at(174), 0, 9, 12.5, D(at(174)) - S, D(at(174)) + 0.05, white, '#c9c4ba');
      for (const ch of [112, 342]) k.taper(at(ch), 0, 0.8, 2.5, 0.8, 2.5, k.ground(at(ch)) - 1, D(at(ch)) - S, '#b8b2a6');
      for (let ch = 15; ch < 110; ch += 20) k.taper(at(ch), 0, 0.5, 2.2, 0.5, 2.2, k.ground(at(ch)) - 1, D(at(ch)) - S, '#b8b2a6');
      for (let ch = 360; ch < 425; ch += 20) k.column(at(ch), 0, k.ground(at(ch)) - 1, D(at(ch)) - S, 0.9, '#b8b2a6');
      // masts: [chainage, side, lean along (m), lean across (m), length (m)]
      const masts = [];
      for (const c of [169, 297])
        masts.push([c - 4, 1, -6, 6, 24], [c - 4, -1, -9, -5, 22], [c, 1, 3, 9, 30], [c, -1, -2, -9, 30], [c + 4, 1, 8, 5, 22], [c + 4, -1, 6, -6, 25]);
      masts.push([196, 1, 5, 4, 20], [221, -1, -5, -5, 19], [246, 1, 4, 5, 20], [271, -1, -4, -4, 19], [128, -1, 4, -4, 18], [150, 1, -4, 4, 19], [314, -1, 4, -4, 18], [330, 1, -3, 4, 19]);
      const spars = [];
      for (const [c, s, da, dv, len] of masts) {
        const u = at(c), base = [u, D(u), s * 3.4];
        const rise = Math.sqrt(Math.max(1, len * len - da * da - dv * dv)) * S;
        const top = [u + da, D(u) + rise, s * 3.4 + dv];
        k.beam(base, top, 0.75, 0.75, white);
        for (const d of [-16, 16]) k.cable(top, [u + d, D(u + d) + 0.4, s * 3.4], grey, 0.25);
        k.cable(top, [u, D(u) + 0.4, -s * 3.4], grey, 0.25);
        if (spars.length < 16 && len >= 20) {
          const sb = [u + da * 0.4, D(u) + rise * 0.35, s * 3.4 + dv * 0.4], se = [sb[0] + Math.sign(da || 1) * 6, sb[1] + 0.8 * S, sb[2] + s * 16];
          spars.push([sb, se, top]);
        }
      }
      for (const [sb, se, top] of spars) {
        k.beam(sb, se, 0.6, 0.6, white);
        k.cable(top, se, grey, 0.22);
        k.cable(se, [se[0] - 12, D(se[0] - 12) + 0.4, Math.sign(se[2]) * 3.4], grey, 0.22);
      }
      k.slab(at(112), at(342), 0, 3.4, 0.25, '#e6e3dc', '#cfe0dc', 6, 4 * S);
    },
  };

  // William Jolly Bridge (1932): three cream concrete-encased steel through-arches of 72.5 m, the ribs between
  // the roadway and the footways, springing from rusticated piers near the waterline and rising about 7 m
  // above the road; four entrance towers with spires; a long viaduct down to Grey St.
  models['william-jolly'] = {
    deck: 15,
    draw(k) {
      const S = k.S, D = (u) => k.deckTop(u), cream = '#e8dfc7', shade = '#c8bea6';
      const at = k.chainage(21, 221), sup = [12, 85, 157, 230].map(at);
      const road = k.b.parts.reduce((a, p) => (p.width > a.width ? p : a)), vr = k.offsetOf(road);
      for (const p of k.b.parts) roadway(k, p, { depth: 2.5 * S, top: p === road ? '#4a4a4a' : '#cfcac0', side: cream, under: shade, rail: cream, railH: 1.1 * S });
      for (const [i, u] of sup.entries()) {
        const y0 = k.ground(u, vr) - 1, top = D(u) + 1.6 * S;
        k.taper(u, vr, 3.5, 11, 3.5, 11, y0, top, cream);
        for (let y = 1.5; y < top; y += 3 * S) k.box(u - 3.6, u + 3.6, vr - 11.1, vr + 11.1, y, y + 0.35, shade);
        if (i === 0 || i === 3)
          for (const v of [vr - 9, vr + 9]) {
            const uu = u + (i === 0 ? -2 : 2);
            k.box(uu - 1.6, uu + 1.6, v - 1.6, v + 1.6, D(uu), D(uu) + 6 * S, cream);
            k.box(uu - 1.1, uu + 1.1, v - 1.1, v + 1.1, D(uu) + 6 * S, D(uu) + 8 * S, cream);
            k.beam([uu, D(uu) + 8 * S, v], [uu, D(uu) + 12.5 * S, v], 0.3, 0.3, '#8d969c');
          }
      }
      for (let s = 0; s < 3; s++) {
        const a = sup[s] + 3.5, b = sup[s + 1] - 3.5, mid = (a + b) / 2, ys = 1.5 * S, yc = D(mid) + 7 * S;
        for (const side of [-1, 1]) {
          const v = vr + side * 6.7;
          const pts = k.arch(a, b, ys, ys, yc - ys, v, 1.2, 3.5, cream, 20);
          for (const p of pts) if (p[1] > D(p[0]) + 2 && Math.abs(p[0] - mid) < 22) k.beam(p, [p[0], D(p[0]), v], 0.5, 0.5, cream);
        }
      }
      for (let u = sup[3] + 15; u < k.L; u += 15) k.pier(u, vr - 4, vr + 4, 1.5, 2.5 * S, cream);
    },
  };

  // Merivale Bridge (1978), rail: a 132 m steel tied arch with two white box ribs leaning together like a
  // basket handle (13 m apart at the ends, about 6.5 m at the crown, 20 m above the rails) and criss-cross
  // network hangers, on battered concrete piers; long concrete viaducts on tall tapered piers either side.
  models.merivale = {
    deck: 15,
    draw(k) {
      const S = k.S, D = (u) => k.deckTop(u), white = '#e3e8e4', conc = '#9a948a';
      const [t1, t2] = k.b.parts;
      k.follow(t1);
      k.follow(t1, k.offsetOf(t2) / 2);
      k.orient(k.b.axis[0], k.b.axis[1]);
      const [r0, r1] = k.river(), uN = r0 + 54, uS = r1 - 43;
      k.slab(0, uN, -6.5, 6.5, 2.8 * S, '#8a857d', '#7f7b73', 8);
      k.slab(uS, k.L, -6.5, 6.5, 2.8 * S, '#8a857d', '#7f7b73', 8);
      k.slab(uN, uS, -6.5, 6.5, 2 * S, '#8a857d', white, 6);
      for (const v of [-6.4, 6.4]) k.wall(0, k.L, v, 0.9 * S, 0.3, '#8f8a82');
      for (const v of [-2.75, -1.25, 1.25, 2.75]) k.wall(0, k.L, v, 0.25, 0.2, '#5a5550');
      const rib = (s) => k.curve(uN, uS, (u, t) => D(u) + 4 * 20 * S * t * (1 - t), (t) => s * (6.5 - 3.25 * 4 * t * (1 - t)), 22);
      for (const s of [-1, 1]) {
        const pts = rib(s);
        k.chain(pts, 1.2, 3.2, white);
        for (let i = 2; i < pts.length - 2; i += 2) {
          for (const d of [-13, 13]) {
            const uu = Math.min(uS - 2, Math.max(uN + 2, pts[i][0] + d));
            k.cable(pts[i], [uu, D(uu), s * 6.3], '#a7adad', 0.3);
          }
        }
      }
      for (const u of [uN, uS]) {
        const y0 = k.ground(u) - 1, y1 = D(u) - 2 * S;
        k.taper(u, 0, 6, 8.5, 4.5, 7, y0, y1, conc);
        k.taper(u, 0, 6.1, 8.6, 5.9, 8.4, y0, 1.6 * S, '#7d776c');
      }
      const piers = [];
      for (let u = uN - 32; u > 4; u -= 33) piers.push(u);
      for (let u = uS + 33; u < k.L - 4; u += 33) piers.push(u);
      for (const u of piers) k.taper(u, 0, 1.4, 4, 1.3, 2.3, k.ground(u) - 1, D(u) - 2.8 * S, conc);
      for (let u = 25; u < k.L; u += 50) {
        if (u > uN && u < uS) continue;
        for (const v of [-6.1, 6.1]) k.beam([u, D(u), v], [u, D(u) + 6.5 * S, v], 0.35, 0.35, '#b6babc');
        k.beam([u, D(u) + 6.5 * S, -6.1], [u, D(u) + 6.5 * S, 6.1], 0.3, 0.3, '#b6babc');
      }
    },
  };

  // Go Between Bridge (2010): three haunched concrete box girders, 74 / 117 / 80 m, a steep hump-backed road;
  // wide cream wall piers with rounded ends and a navy waterline band; blue and violet striped cladding along
  // the downstream path, with a louvred canopy over its middle; tall street lights.
  models['go-between'] = {
    deck: 15.5,
    draw(k) {
      const S = k.S, D = (u) => k.deckTop(u), cream = '#e4e0d6';
      const [r0] = k.river(), pN = r0 + 72, pS = pN + 117, a0 = pN - 74, a1 = pS + 80;
      const depth = (u) => {
        let d;
        if (u < pN) d = 2.5 + 3.75 * Math.max(0, (u - a0) / (pN - a0)) ** 2;
        else if (u <= pS) d = 2.75 + 3.5 * (2 * ((u - pN) / (pS - pN)) - 1) ** 2;
        else d = 2.5 + 3.75 * Math.max(0, (a1 - u) / (a1 - pS)) ** 2;
        return d * S;
      };
      const down = k.side(1, 0); // the river runs east here: the downstream side faces east
      const paths = k.b.parts.filter((p) => p.width < 5), roads = k.b.parts.filter((p) => p.width >= 5);
      for (const p of roads) roadway(k, p, { depth, top: '#3f4042', side: cream, under: '#bdb8ad', rail: '#b6babc', railH: 1.3 * S });
      for (const p of paths) roadway(k, p, { depth: (u) => Math.min(depth(u), 3 * S), top: '#c9c6bd', side: cream, under: '#bdb8ad', rail: '#b6babc', railH: 1.3 * S });
      const dp = paths.length ? paths.reduce((a, p) => (k.offsetOf(p) * down > k.offsetOf(a) * down ? p : a)) : null;
      if (dp) {
        const ve = k.offsetOf(dp) + down * (dp.width / 2 + 0.2), stripes = ['#2a3170', '#5a4f9c', '#8d88c2', '#2a3170', '#cbcdd2', '#5a4f9c'];
        let i = 0;
        for (let u = a0 + 4; u < a1 - 4; u += 1.9, i++) {
          const v0 = ve, v1 = ve + down * 0.3;
          k.box(u, u + 1.8, Math.min(v0, v1), Math.max(v0, v1), D(u) - 1.9 * S, D(u) + 1.2 * S, stripes[i % stripes.length]);
        }
        const vc = k.offsetOf(dp);
        for (let u = pN + 10; u < pS - 10; u += 6) k.beam([u, D(u), ve - down * 0.4], [u, D(u) + 3 * S, ve - down * 0.4], 0.3, 0.3, '#f0f0ee');
        k.slab(pN + 10, pS - 10, Math.min(vc - 2, ve), Math.max(vc - 2, ve) + 0.01, 0.25, '#3a3f45', '#3a3f45', 6, 3 * S);
      }
      for (const u of [pN, pS]) {
        const y0 = k.ground(u) - 1, y1 = D(u) - depth(u);
        k.box(u - 2, u + 2, -9, 9, y0, y1, cream);
        for (const v of [-9, 9]) k.column(u, v, y0, y1, 2, cream, 10);
        k.box(u - 2.1, u + 2.1, -9.1, 9.1, y0, 3.5 * S, '#1f2b57');
        for (const v of [-9, 9]) k.column(u, v, y0, 3.5 * S, 2.1, '#1f2b57', 10);
      }
      const vs = roads.map((p) => k.offsetOf(p));
      if (vs.length) for (const v of [Math.min(...vs) - 4.5, Math.max(...vs) + 4.5]) k.lamps(a0 + 10, a1 - 10, v, 30, 12, '#b6babc');
    },
  };

  // Eleanor Schonell Bridge (2006), "the green bridge": a busway between two paths, cable-stayed from four
  // free-standing pale pylons (70 m above the river, two per pier, no cross-beams) in two harp planes of 64
  // dark stays; a 184 m main span and 73 m back spans, pylon piers on low pile caps near each bank; a ribbed
  // canopy over the north footpath; a curved approach climbing to Dutton Park.
  models['eleanor-schonell'] = {
    deck: 18,
    draw(k) {
      const S = k.S, D = (u) => k.deckTop(u), conc = '#cfccc4';
      const [f, c] = k.b.parts;
      k.follow(f);
      if (c) k.follow(f, k.offsetOf(c) / 2);
      k.orient(k.b.axis[0], k.b.axis[1]);
      const at = k.chainage(74, 332), pyl = [at(98), at(282)];
      const depth = (u) => (1.2 + 1.7 * Math.max(0, ...pyl.map((p) => 1 - Math.abs(u - p) / 20))) * S;
      k.slab(0, k.L, -10, 10, depth, '#3c3d3f', '#d6d6d2');
      for (const [v0, v1] of [[-10, -6.4], [6.4, 10]]) k.slab(0, k.L, v0, v1, 0.1, '#c9c6bd', '#d6d6d2', 6, 0.12);
      for (const v of [-6.1, 6.1]) k.wall(0, k.L, v, 1.1 * S, 0.5, '#e8e6e0');
      for (const v of [-9.9, 9.9]) k.wall(0, k.L, v, 1.4 * S, 0.2, '#b8bcbe');
      for (const p of pyl) {
        k.box(p - 4, p + 4, -12, 12, k.ground(p) - 1, 2 * S, '#bdb8ae');
        for (const v of [-5.5, 5.5]) {
          k.box(p - 1.5, p + 1.5, v - 1, v + 1, 2 * S, 70 * S, conc);
          for (let i = 0; i < 8; i++) {
            const d = 27 + 9.6 * i, h = D(p) + (12 + 4.3 * i) * S;
            for (const dir of [-1, 1]) k.cable([p, h, v], [p + dir * d, D(p + dir * d) + 0.4, v], '#4b4f53', 0.35);
          }
        }
      }
      for (const ch of [28, 355]) for (const v of [-5, 5]) k.column(at(ch), v, k.ground(at(ch), v) - 1, D(at(ch)) - depth(at(ch)), 1.2, conc);
      for (let ch = 385; at(ch) < k.L - 5; ch += 30) for (const v of [-4, 4]) k.column(at(ch), v, k.ground(at(ch), v) - 1, D(at(ch)) - depth(at(ch)), 1.1, conc);
      const n = k.side(0, -1); // the north (downstream) footpath has the ribbed canopy
      for (let u = 6; u < Math.min(k.L, at(470)); u += 4) {
        const y = D(u);
        k.beam([u, y, n * 6.5], [u, y + 3.5 * S, n * 7.6], 0.25, 0.25, '#b8bcbe');
        k.beam([u, y + 3.5 * S, n * 7.6], [u, y + 2.6 * S, n * 9.9], 0.25, 0.25, '#b8bcbe');
      }
      k.slab(6, Math.min(k.L, at(470)), Math.min(n * 6.6, n * 9.9), Math.max(n * 6.6, n * 9.9), 0.2, '#e4e5e2', '#b8bcbe', 6, 3.3 * S);
    },
  };

  // Kangaroo Point Bridge (2024), pedestrians and cyclists: one 95 m white mast (83 m above the deck) on its
  // own pier in the river nearer the city, four legs straddling the deck that merge into a spike at about
  // deck + 52 m, a cruciform tie and a gold masthead; 32 white stays in two fans (183 m main span to
  // Kangaroo Point, 90 m back span); white Y piers on oval pile caps, a gold-lined canopy on the north edge,
  // the elliptical platform round the mast, and the Stilts pavilion at the city landing. Replaces the
  // earlier hand-built model (whose mast stood 75 m too close to the city, on a 14 m deck).
  models['kangaroo-point'] = {
    deck: 15,
    draw(k) {
      const S = k.S, D = (u) => k.deckTop(u), white = '#e9e7e1';
      const part = k.b.parts[0];
      k.follow(part);
      const at = k.chainage(14, 387), mast = at(171), kp = at(354);
      roadway(k, part, { width: 8.5, depth: 1.2 * S, top: '#c8c8c4', side: white, under: '#c9cbc8', rail: '#b9bec0', railH: 1.4 * S });
      k.ellipse(mast, 0, 12.5, 14.5, D(mast) - 1.2 * S, D(mast) + 0.06, white, '#c8c8c4');
      k.ellipse(kp, 0, 8, 9.5, D(kp) - 1.2 * S, D(kp) + 0.06, white, '#c8c8c4');
      for (const ch of [27, 54, 81, 171, 354, 395, 435]) {
        const u = at(ch);
        if (u > k.L - 3) continue;
        const g = k.ground(u), wet = k.wet(u), base = wet ? 0 : g, yd = D(u) - 1.2 * S, fork = yd - 5 * S;
        if (wet) k.ellipse(u, 0, 4, 7, g - 1, 1.2 * S, white);
        k.taper(u, 0, 1.4, 1.4, 1.4, 1.4, (wet ? 1.2 * S : g - 1), fork, white);
        for (const v of [-3.4, 3.4]) k.beam([u, fork, 0], [u, yd, v], 1.4, 1.8, white);
        void base;
      }
      // the mast
      const y0 = D(mast), merge = [mast, y0 + 52 * S, 0], feet = [[-7.5, -7.5], [7.5, -7.5], [7.5, 7.5], [-7.5, 7.5]];
      const at30 = 30 / 52;
      const legAt = (q, f) => [mast + feet[q][0] * (1 - f), y0 + 52 * S * f, feet[q][1] * (1 - f)];
      for (let q = 0; q < 4; q++) k.beam([mast + feet[q][0], y0, feet[q][1]], merge, 1.8, 1.8, white);
      k.beam(legAt(0, at30), legAt(2, at30), 0.9, 0.9, white);
      k.beam(legAt(1, at30), legAt(3, at30), 0.9, 0.9, white);
      k.beam(merge, [mast, y0 + 61 * S, 0], 2.4, 2.4, white);
      k.beam([mast, y0 + 61 * S, 0], [mast, y0 + 83 * S, 0], 2.0, 2.0, '#b8954a');
      const dir = Math.sign(kp - mast);
      const main = [20, 42, 64, 86, 108, 130, 152, 175], back = [15, 25, 35, 45, 55, 65, 75, 85];
      main.forEach((d, i) => { for (const v of [-4.2, 4.2]) k.cable([mast, y0 + (64 + i * 2.2) * S, 0], [mast + dir * d, D(mast + dir * d) + 0.5, v], '#f2f2ee', 0.32); });
      back.forEach((d, i) => { for (const v of [-4.2, 4.2]) k.cable([mast, y0 + (64 + i * 2.2) * S, 0], [mast - dir * d, D(mast - dir * d) + 0.5, v], '#f2f2ee', 0.32); });
      // the canopy on the north edge: pale on top, gold underneath, on inclined posts
      const n = k.side(0, -1);
      for (let u = 6; u < k.L - 4; u += 6) {
        if (Math.abs(u - mast) < 14) continue;
        k.beam([u, D(u), n * 4.1], [u - 1, D(u) + 4.25 * S, n * 3.2], 0.3, 0.3, white);
      }
      k.slab(6, mast - 14, Math.min(0, n * 4.3), Math.max(0, n * 4.3), 0.3, '#eeeeea', '#c2a266', 6, 4.25 * S);
      k.slab(mast + 14, k.L - 4, Math.min(0, n * 4.3), Math.max(0, n * 4.3), 0.3, '#eeeeea', '#c2a266', 6, 4.25 * S);
      // Stilts, the restaurant pavilion over the water beside the city landing
      const su = at(39), sv = n * 38;
      for (const du of [-8, 8]) for (const dv of [-6, 6]) k.column(su + du, sv + dv, k.ground(su + du, sv + dv) - 1, 7 * S, 0.5, '#8c7f6e', 6);
      k.box(su - 10, su + 10, sv - 7.5, sv + 7.5, 7 * S, 11 * S, '#d8cfc0', '#6b5a48');
    },
  };

  // The four bridges side by side at Indooroopilly (upstream to downstream: Walter Taylor, the 1957 rail
  // bridge, the 1895 Albert Bridge, Jack Pesch). Their axes run from Chelmer (south) to Indooroopilly, and the
  // rail chainages (Chelmer water's edge at about 44 m, twin river piers at 104 m) line up with the frames.

  // Walter Taylor Bridge (1936): a 183 m suspension span with no river piers, between two cream Art Deco towers
  // that people lived in (road arch, stepped shafts with windows, both tops about 37 m above high water); the
  // cables run straight from the saddles to the quarter points, then form the open truss's top chord across the
  // middle half; anchor buttresses beside the road at Indooroopilly; green girders on white portals at Chelmer.
  models['walter-taylor'] = {
    deck: 15.5,
    draw(k) {
      const S = k.S, D = (u) => k.deckTop(u), cream = '#eee8da', grey = '#9ba2a7', green = '#2f5e47';
      const [r0] = k.river(), uC = r0 - 5, uI = uC + 182.9, q = 45.7, half = 5.75;
      for (const p of k.b.parts) roadway(k, p, { depth: 1.5 * S, top: p.width > 5 ? '#3a3b3d' : '#b9b5ac', side: green, under: green, rail: '#9ba2a7', railH: 1.0 * S });
      const tower = (u, warm) => {
        const base = Math.min(k.ground(u, -9), k.ground(u, 9)) - 1, top = 37 * S, y = D(u), col = warm ? '#e8decb' : cream;
        for (const s of [-1, 1]) {
          k.taper(u, s * 6.25, 4.25, 2.75, 3, 2.5, base, top - 2.5 * S, col);
          k.box(u - 2.4, u + 2.4, s * 6.25 - 1.9, s * 6.25 + 1.9, top - 2.5 * S, top - 1.2 * S, col);
          k.box(u - 1.6, u + 1.6, s * 6.25 - 1.2, s * 6.25 + 1.2, top - 1.2 * S, top, col);
          for (let r = y + 3.5 * S; r < top - 4 * S; r += 3.2 * S)
            for (const du of [-1.2, 1.2]) k.box(u + du - 0.45, u + du + 0.45, s * 9.01, s * 9.05, r, r + 1.6 * S, '#3d4448');
        }
        k.box(u - 3, u + 3, -3.5, 3.5, y + 7.5 * S, y + 16.5 * S, col);
        for (const [v0, v1, h] of [[2.2, 3.5, 2], [1.2, 2.2, 0.9]]) for (const s of [-1, 1]) k.box(u - 3, u + 3, Math.min(s * v0, s * v1), Math.max(s * v0, s * v1), y + (7.5 - h) * S, y + 7.5 * S, col);
        for (const dv of [-2.4, -0.8, 0.8, 2.4]) k.box(u - 3.05, u - 3, dv - 0.4, dv + 0.4, y + 10 * S, y + 11.6 * S, '#3d4448');
        if (base < y - 4 * S) k.box(u - 3, u + 3, -3.5, 3.5, base, y - 1.5 * S, col);
      };
      tower(uC, true);
      tower(uI, false);
      // cables: saddle to quarter point, then the top chord, sagging to deck + 5.5 m at mid-span
      const qa = uC + q, qb = uI - q, mid = (uC + uI) / 2;
      const chordY = (u) => D(u) + (u <= qa || u >= qb ? 5 + 3.5 * Math.min(1, (u <= qa ? u - uC : uI - u) / q) : 8.5 - 3 * (1 - ((u - mid) / (qb - mid)) ** 2)) * S;
      for (const s of [-1, 1]) {
        const v = s * half, sadC = [uC, 37 * S - 0.5, s * 7.5], sadI = [uI, 37 * S - 0.5, s * 7.5];
        k.beam(sadC, [qa, chordY(qa), v], 1.0, 0.5, '#6f767b');
        k.beam(sadI, [qb, chordY(qb), v], 1.0, 0.5, '#6f767b');
        k.chain(k.curve(qa, qb, (u) => chordY(u), v, 16), 1.0, 0.6, '#6f767b');
        k.beam(sadI, [uI + 10, k.ground(uI + 10, s * 7.5) + 5 * S, s * 7.5], 1.0, 0.5, '#6f767b');
        k.beam(sadC, [uC - 45, k.ground(uC - 45, s * 7.5) + 1, s * 7.5], 1.0, 0.5, '#6f767b');
        for (let u = uC + 6; u < qa; u += 6) {
          const t = (u - uC) / q, cy = sadC[1] + (chordY(qa) - sadC[1]) * t;
          k.beam([u, chordY(u), v], [u, cy, v + (s * 7.5 - v) * (1 - t)], 0.3, 0.3, grey);
        }
        for (let u = qb + 6; u < uI; u += 6) {
          const t = (uI - u) / q, cy = sadI[1] + (chordY(qb) - sadI[1]) * t;
          k.beam([u, chordY(u), v], [u, cy, v + (s * 7.5 - v) * (1 - t)], 0.3, 0.3, grey);
        }
      }
      k.truss(uC + 3, uI - 3, half, (u) => chordY(u) - D(u), 30, grey, { w: 0.6, t: 0.7, brace: false });
      for (const s of [-1, 1]) k.box(uI + 7, uI + 13, s * 7.5 - 1.5, s * 7.5 + 1.5, k.ground(uI + 10, s * 7.5) - 1, k.ground(uI + 10, s * 7.5) + 5 * S, '#cfccc4');
      for (let u = uC - 20; u > 6; u -= 20) {
        const y = D(u) - 1.5 * S;
        for (const v of [-4.5, 4.5]) k.beam([u, k.ground(u, v) - 1, v], [u, y, v], 1.2, 1.2, '#f1efe8');
        k.beam([u, y, -5], [u, y, 5], 1.2, 1.4, '#f1efe8');
      }
    },
  };

  // Albert Bridge (1895), rail: two 103.7 m riveted hogback through trusses, 12.6 m high at mid-span and about
  // 6.75 m at the ends, with a dense double-intersection lattice; one sandstone central pier; massive sandstone
  // portal pylons with cornice caps at both ends.
  models.albert = {
    deck: 16.5,
    draw(k) {
      const S = k.S, D = (u) => k.deckTop(u), steel = '#a0a6aa', stone = '#c2a57b';
      const pier = 104, ends = [1, k.L - 2];
      k.slab(0, k.L, -4.1, 4.1, 1.6 * S, '#6b5a4a', '#5e5a55');
      for (const v of [-2.55, -1.05, 1.05, 2.55]) k.wall(0, k.L, v, 0.25, 0.2, '#4e4842');
      for (const [a, b] of [[ends[0], pier - 1], [pier + 1, ends[1]]]) {
        const n = 20, h = (u) => (6.75 + 5.85 * (1 - (2 * ((u - a) / (b - a)) - 1) ** 2)) * S;
        k.truss(a, b, 4.1, h, n, steel, { w: 0.6, t: 0.6 });
        for (const v of [-4.1, 4.1])
          for (let i = 0; i < n; i++) {
            const u0 = a + ((b - a) * i) / n, u1 = a + ((b - a) * (i + 1)) / n;
            k.beam(i % 2 ? [u0, D(u0), v] : [u0, D(u0) + h(u0), v], i % 2 ? [u1, D(u1) + h(u1), v] : [u1, D(u1), v], 0.4, 0.4, steel);
          }
      }
      k.ellipse(pier, 0, 3, 7, k.ground(pier) - 1, D(pier) - 1.6 * S, stone);
      k.ellipse(pier, 0, 3.4, 7.4, D(pier) - 3 * S, D(pier) - 1.6 * S, stone);
      k.ellipse(pier, 0, 3.05, 7.05, k.ground(pier) - 1, 1.8 * S, '#5b4e42');
      for (const u of [2, k.L - 3])
        for (const s of [-1, 1]) {
          const g = k.ground(u, s * 6.3) - 1, top = D(u) + 9 * S;
          k.box(u - 1.75, u + 1.75, s * 6.3 - 1.75, s * 6.3 + 1.75, g, top, stone);
          k.box(u - 2.1, u + 2.1, s * 6.3 - 2.1, s * 6.3 + 2.1, top, top + 1.2 * S, '#8e7a5e');
        }
    },
  };

  // The Indooroopilly Railway Bridge (1957): two parallel-chord Warren through trusses of about 104 m, about
  // 10.5 m deep with inclined end posts and 11 panels, on a plain rounded concrete pier beside Albert's.
  models['indooroopilly-rail'] = {
    deck: 16.5,
    draw(k) {
      const S = k.S, D = (u) => k.deckTop(u), steel = '#8e969a';
      const pier = 104, ends = [1, k.L - 2];
      k.slab(0, k.L, -4.75, 4.75, 1.6 * S, '#5e5a55', '#5e5a55');
      for (const v of [-2.55, -1.05, 1.05, 2.55]) k.wall(0, k.L, v, 0.25, 0.2, '#4e4842');
      for (const [a, b] of [[ends[0], pier - 1.5], [pier + 1.5, ends[1]]]) {
        const p = (b - a) / 11, h = (u) => Math.min(1, (u - a) / p, (b - u) / p) * 10.5 * S;
        k.truss(a, b, 4.75, h, 11, steel, { w: 0.9, t: 0.9 });
      }
      k.box(pier - 2, pier + 2, -3.5, 3.5, k.ground(pier) - 1, D(pier) - 1.6 * S, '#b9a47f');
      for (const v of [-3.5, 3.5]) k.column(pier, v, k.ground(pier, v) - 1, D(pier) - 1.6 * S, 2, '#b9a47f', 10);
      for (const u of [0, k.L]) k.box(u - 3, u + 3, -5.5, 5.5, k.ground(u) - 1, D(u) - 1.6 * S, '#bdb7aa');
    },
  };

  // Jack Pesch Bridge (1998), pedestrians and cyclists: a 167 m cable-stayed span between two grey H-frame
  // towers at the water's edges (twin 1.2 m tubes, 22 m above the deck, cross-beams), one stay plane each side
  // picking up the deck every 19 m, heavy backstays to rock anchors, a 4 m path on a 2 m deep steel truss.
  models['jack-pesch'] = {
    deck: 17,
    draw(k) {
      const S = k.S, D = (u) => k.deckTop(u), steel = '#8d9497';
      const [r0, r1] = k.river(), mid = (r0 + r1) / 2, towers = [mid - 83.5, mid + 83.5];
      for (const p of k.b.parts) roadway(k, p, { width: 5, depth: 0.4 * S, top: '#a3a19b', side: steel, under: steel, rail: '#b4b8ba', railH: 1.4 * S });
      k.truss(2, k.L - 2, 1.95, () => 2 * S, Math.round((k.L - 4) / 9.5), steel, { w: 0.4, t: 0.4, base: (u) => D(u) - 2.4 * S, brace: false });
      for (const [i, u] of towers.entries()) {
        const y = D(u), top = y + 22 * S, g = Math.min(k.ground(u, -3), k.ground(u, 3)) - 1;
        for (const s of [-1, 1]) {
          k.beam([u, g, s * 3.2], [u, y, s * 3.1], 1.2, 1.2, steel);
          k.beam([u, y, s * 3.1], [u, top, s * 2.45], 1.2, 1.2, steel);
          k.beam([u, top, s * 2.45], [u, top + 1.5 * S, s * 2.45], 0.8, 0.8, steel);
          const back = u + (i === 0 ? -28 : 28);
          k.cable([u, top, s * 2.45], [back, k.ground(back, s * 3.5) + 0.5, s * 3.5], '#7c8286', 0.55);
          for (const d of [19, 38, 57, 76]) {
            const ua = u + (i === 0 ? d : -d);
            k.cable([u, top - (d / 19 - 1) * 1.2 * S, s * 2.45], [ua, D(ua) + 0.4, s * 2.5], '#7c8286', 0.35);
          }
        }
        k.beam([u, top, -2.45], [u, top, 2.45], 1.0, 1.4, steel);
        k.beam([u, y + 9.5 * S, -2.8], [u, y + 9.5 * S, 2.8], 0.8, 1.0, steel);
        k.beam([u, y - 2.4 * S, -3.2], [u, y - 2.4 * S, 3.2], 1.0, 1.2, steel);
      }
    },
  };

  // The Story Bridge's own model stays in city.js; two fixes from the research. Its north anchor arm runs on
  // to the cliff (82.1 m; the data stopped it at 45 m), and its top chord drops straight from each tower to the
  // cantilever tips 93.9 m out (about deck + 12 m), with a separate camelback suspended span rising to about
  // deck + 16 m in the middle, rather than one smooth sag.
  window.__bridgeModels.adjust = (data) => {
    const s = data.story?.s;
    if (s && s[3] < 960) s[3] = 974;
  };
  window.__bridgeModels.storyChord = (k, T, C, M, v, N, D) => {
    const tip = 93.9;
    if (k <= C) return N + 10 + (D - N - 10) * Math.max(0, (k - T) / (C - T));
    if (k >= M) return N + 10 + (D - N - 10) * Math.max(0, (v - k) / (v - M));
    const a = k - C, b = M - k;
    if (a <= tip) return N + 12 + (D - N - 12) * Math.pow(1 - a / tip, 1.15);
    if (b <= tip) return N + 12 + (D - N - 12) * Math.pow(1 - b / tip, 1.15);
    return N + 12 + 4 * Math.sin((Math.PI * (k - C - tip)) / (M - C - 2 * tip));
  };

  function build(list, ctx) {
    const out = { position: [], normal: [], color: [] };
    window.__bridgeModels.built = [];
    for (const b of list) {
      const k = new Kit(b, ctx, out);
      const [r0, r1] = k.river();
      window.__bridgeModels.built.push({ slug: b.slug, length: Math.round(k.L), river: [Math.round(r0), Math.round(r1)],
        deckMid: +(k.deckTop((r0 + r1) / 2) / k.S).toFixed(1), ends: [+(k.ground(0) / k.S).toFixed(1), +(k.ground(k.L) / k.S).toFixed(1)] });
      const n0 = out.position.length;
      try {
        (models[b.slug] || models.default).draw(k);
      } catch (e) {
        console.warn('bridge model', b.slug, e);
      }
      // a model that produced bad numbers is left out rather than breaking the whole mesh
      if (out.position.slice(n0).some((v) => !Number.isFinite(v))) {
        console.warn('bridge model', b.slug, 'made non-finite positions; left out');
        for (const key of ['position', 'normal', 'color']) out[key].length = n0;
      }
    }
    if (!out.position.length) return null;
    const geo = new ctx.K.BufferGeometry();
    geo.setAttribute('position', new ctx.K.BufferAttribute(new Float32Array(out.position), 3));
    geo.setAttribute('normal', new ctx.K.BufferAttribute(new Float32Array(out.normal), 3));
    geo.setAttribute('color', new ctx.K.BufferAttribute(new Float32Array(out.color), 3));
    geo.computeBoundingSphere();
    return geo;
  }
})();
