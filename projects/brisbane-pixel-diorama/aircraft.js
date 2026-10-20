// Aircraft models for the Brisbane pixel diorama's live planes (live-planes.js), added 20 Oct 2026.
//
// The map used to draw every aircraft with the renderer's one airliner model, scaled by its ADS-B size category, so a
// Cessna 172 looked like a small 737. Here each ICAO type code maps to a family and its real length and span (or rotor
// size), and the family's builder makes a pixel model from those: high-wing and low-wing light aircraft, light twins,
// single turboprops, King Air-style twins, Dash 8 and ATR-style regionals, rear-engined jets and business jets,
// narrowbodies, widebodies, four-engined jets, military airlifters, and light, medium and large helicopters and the
// Chinook. Types not listed fall back on the ADS-B category.
//
// Models are authored in real metres (x forward, y up, z to the left), then drawn 1.4 times real size, as the old
// airliner was; aircraft under 20 m are drawn bigger still (1.4 times the square root of 20 m times their length), so
// a Cessna is about 18 m long on the map and can still be seen. Each model has a white body (vertex colours), parts
// in the operator's colour (the fin, a stripe, a helicopter's cabin), spinning propellers and rotors, and a pixel
// shadow made from its outline.
(() => {
  const RAD = Math.PI / 180;
  const C = {
    white: [0.96, 0.96, 0.95], wing: [0.84, 0.86, 0.88], engine: [0.58, 0.6, 0.64], dark: [0.15, 0.18, 0.23],
    black: [0.11, 0.11, 0.12], metal: [0.7, 0.72, 0.75], grey: [0.78, 0.8, 0.82], olive: [0.42, 0.45, 0.36],
  };

  // --- Triangles with flat normals ------------------------------------------------------------------------------------
  class Buf {
    constructor() { this.p = []; this.n = []; this.c = []; }
    tri(a, b, c, col, want) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) return;
      nx /= l; ny /= l; nz /= l;
      if (want && nx * want[0] + ny * want[1] + nz * want[2] < 0) { [b, c] = [c, b]; nx = -nx; ny = -ny; nz = -nz; }
      const k = col || C.white;
      for (const q of [a, b, c]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.c.push(k[0], k[1], k[2]); }
    }
    quad(a, b, c, d, col, want) { this.tri(a, b, c, col, want); this.tri(a, c, d, col, want); }
    box(x0, y0, z0, x1, y1, z1, col) {
      [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)]; [y0, y1] = [Math.min(y0, y1), Math.max(y0, y1)]; [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)];
      const P = (i, j, k) => [i ? x1 : x0, j ? y1 : y0, k ? z1 : z0];
      this.quad(P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1), col, [1, 0, 0]);
      this.quad(P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0), col, [-1, 0, 0]);
      this.quad(P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0), col, [0, 1, 0]);
      this.quad(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1), col, [0, -1, 0]);
      this.quad(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1), col, [0, 0, 1]);
      this.quad(P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0), col, [0, 0, -1]);
    }
    // a flat convex plate through pts (3D), t thick, facing `up` on its top side
    plate(pts, t, col, up = [0, 1, 0]) {
      const [a, b, , d] = [pts[0], pts[1], pts[2], pts[pts.length - 1]];
      let n = [(b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]), (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]), (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])];
      const l = Math.hypot(...n) || 1;
      n = n.map((v) => v / l);
      if (n[0] * up[0] + n[1] * up[1] + n[2] * up[2] < 0) n = n.map((v) => -v);
      const top = pts.map((p) => [p[0] + (n[0] * t) / 2, p[1] + (n[1] * t) / 2, p[2] + (n[2] * t) / 2]);
      const bot = pts.map((p) => [p[0] - (n[0] * t) / 2, p[1] - (n[1] * t) / 2, p[2] - (n[2] * t) / 2]);
      const m = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
      for (let i = 1; i + 1 < pts.length; i++) { this.tri(top[0], top[i], top[i + 1], col, n); this.tri(bot[0], bot[i], bot[i + 1], col, n.map((v) => -v)); }
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length, out = [(pts[i][0] + pts[j][0]) / 2 - m[0], (pts[i][1] + pts[j][1]) / 2 - m[1], (pts[i][2] + pts[j][2]) / 2 - m[2]];
        this.quad(bot[i], bot[j], top[j], top[i], col, out);
      }
    }
    // a body of octagonal sections along x: secs = [[x, yCentre, halfWidth, halfHeight], ...], centred on z = zc
    loft(secs, col, zc = 0) {
      const ring = ([x, y, a, b]) => Array.from({ length: 8 }, (_, k) => { const t = Math.PI / 8 + (k * Math.PI) / 4; return [x, y + b * Math.sin(t), zc + a * Math.cos(t)]; });
      const R = secs.map(ring);
      for (let i = 0; i + 1 < R.length; i++)
        for (let k = 0; k < 8; k++) {
          const j = (k + 1) % 8, t = Math.PI / 8 + ((k + 0.5) * Math.PI) / 4;
          this.quad(R[i][k], R[i][j], R[i + 1][j], R[i + 1][k], col, [0, Math.sin(t), Math.cos(t)]);
        }
      const dir = Math.sign(secs[0][0] - secs[1][0]) || 1;
      for (const [r, w] of [[R[0], dir], [R[R.length - 1], -dir]]) for (let k = 1; k + 1 < 8; k++) this.tri(r[0], r[k], r[k + 1], col, [w, 0, 0]);
    }
    // a square beam w thick from a to b
    beam(a, b, w, col) {
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
      if (L < 1e-6) return;
      const t = d.map((v) => v / L);
      let p = Math.abs(t[1]) < 0.9 ? [t[2], 0, -t[0]] : [1, 0, 0];
      const pl = Math.hypot(...p);
      p = p.map((v) => v / pl);
      const q = [t[1] * p[2] - t[2] * p[1], t[2] * p[0] - t[0] * p[2], t[0] * p[1] - t[1] * p[0]], h = w / 2;
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s1, s2]) => [0, 1, 2].map((k) => a[k] + (p[k] * s1 + q[k] * s2) * h));
      const e = c.map((v) => [v[0] + d[0], v[1] + d[1], v[2] + d[2]]);
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, mid = [0, 1, 2].map((k) => (c[i][k] + c[j][k]) / 2 - a[k]); this.quad(c[i], c[j], e[j], e[i], col, mid); }
      this.quad(c[0], c[1], c[2], c[3], col, t.map((v) => -v));
      this.quad(e[0], e[1], e[2], e[3], col, t);
    }
  }
  class Kit { constructor() { this.body = new Buf(); this.livery = new Buf(); this.spin = []; } }

  // spinning parts, built round their own pivot: a propeller (about x) and a rotor (about y)
  function prop(r, blades, chord) {
    const b = new Buf();
    for (let i = 0; i < blades; i++) {
      const a = (i * 2 * Math.PI) / blades, ca = Math.cos(a), sa = Math.sin(a), w = chord / 2;
      b.plate([[0, w * -sa + 0.15 * r * ca, w * ca + 0.15 * r * sa], [0, -w * sa + r * ca, w * ca + r * sa], [0, w * sa + r * ca, -w * ca + r * sa], [0, w * sa + 0.15 * r * ca, -w * ca + 0.15 * r * sa]], Math.max(0.08, chord * 0.25), C.black, [1, 0, 0]);
    }
    b.loft([[0.05 + r * 0.22, 0, 0.02, 0.02], [0, 0, r * 0.12, r * 0.12], [-0.05, 0, r * 0.12, r * 0.12]], C.metal);
    return b;
  }
  function rotor(R, blades, chord, col = C.dark) {
    const b = new Buf();
    for (let i = 0; i < blades; i++) {
      const a = (i * 2 * Math.PI) / blades, ca = Math.cos(a), sa = Math.sin(a), w = chord / 2;
      b.plate([[0.3 * ca - w * sa, 0, 0.3 * sa + w * ca], [R * ca - w * sa, 0, R * sa + w * ca], [R * ca + w * sa, 0, R * sa - w * ca], [0.3 * ca + w * sa, 0, 0.3 * sa - w * ca]], Math.max(0.12, chord * 0.3), col);
    }
    b.box(-0.35, -0.2, -0.35, 0.35, 0.25, 0.35, C.metal);
    return b;
  }

  // a pair of wings (or tailplanes): root leading edge at x, y; half span `half` from z0 out; chords; sweep and dihedral in degrees
  function wings(buf, { x, y, half, cr, ct, sweep = 0, dih = 0, t, col = C.wing, z0 = 0 }) {
    const ts = Math.tan(sweep * RAD), td = Math.tan(dih * RAD), span = half - z0;
    for (const s of [1, -1]) {
      const le = [x - span * ts, y + span * td, s * half];
      buf.plate([[x, y, s * z0], le, [le[0] - ct, le[1], s * half], [x - cr, y, s * z0]], t ?? Math.max(0.15, cr * 0.1), col);
    }
    return { tipLE: (s) => [x - span * ts, y + span * td, s * half], leAt: (z) => x - (Math.abs(z) - z0) * ts, yAt: (z) => y + (Math.abs(z) - z0) * td };
  }
  // a fin: root from xr (rear) forward by cr at height y0, swept back, `h` high
  function fin(buf, { xr, y0, cr, ct, h, sweep, t }) {
    const ts = Math.tan(sweep * RAD), front = xr + cr, tipF = front - h * ts;
    buf.plate([[xr, y0, 0], [front, y0, 0], [tipF, y0 + h, 0], [tipF - ct, y0 + h, 0]], t, null, [0, 0, 1]);
    return { tipFront: tipF, top: y0 + h };
  }
  function nacelle(buf, x0, x1, y, z, r, col = C.engine) { // x0 front, x1 back
    const L = x0 - x1;
    buf.loft([[x0, y, r * 0.92, r * 0.92], [x0 - 0.15 * L, y, r, r], [x1 + 0.15 * L, y, r * 0.85, r * 0.85], [x1, y, r * 0.45, r * 0.45]], col, z);
    buf.box(x0 - 0.02, y - r * 0.7, z - r * 0.7, x0 + 0.03, y + r * 0.7, z + r * 0.7, C.dark);
  }

  // --- Fixed-wing aircraft with a tube fuselage: airliners, regionals, business jets, King Airs, airlifters ----------
  function jet(P) {
    const { L, S } = P, D = P.D ?? Math.max(1.5, 0.096 * L), k = new Kit(), B = k.body, V = k.livery;
    const nose = P.nose ?? 0.11;
    B.loft([
      [L / 2, -0.06 * D, 0.08 * D, 0.08 * D], [L / 2 - 0.025 * L, -0.04 * D, 0.36 * D, 0.34 * D], [L / 2 - 0.06 * L, -0.01 * D, 0.47 * D, 0.47 * D],
      [L / 2 - nose * L, 0, 0.5 * D, 0.5 * D], [-L / 2 + 0.3 * L, 0, 0.5 * D, 0.5 * D], [-L / 2 + 0.1 * L, 0.16 * D, 0.3 * D, 0.32 * D], [-L / 2, 0.3 * D, 0.08 * D, 0.12 * D],
    ], C.white);
    B.box(L / 2 - 0.062 * L, 0.1 * D, -0.43 * D, L / 2 - 0.034 * L, 0.3 * D, 0.43 * D, C.dark); // cockpit windows
    if (D > 2.2 && P.windows !== false) for (const s of [1, -1]) B.box(-L / 2 + 0.3 * L, 0.08 * D, s * 0.462 * D, L / 2 - 0.13 * L, 0.19 * D, s * 0.48 * D, C.dark);
    // wings
    const high = !!P.high, wy = high ? 0.44 * D : -0.3 * D, cr = P.cr ?? 0.2 * L, ct = P.ct ?? cr * 0.3, sweep = P.sweep ?? 26, wx = P.wx ?? 0.1 * L;
    const W = wings(B, { x: wx, y: wy, half: S / 2, cr, ct, sweep, dih: P.dih ?? (high ? -1 : 5), t: Math.max(0.2, cr * 0.09) });
    if (high) B.box(wx - cr * 0.95, 0.3 * D, -0.3 * D, wx + 0.02 * L, 0.52 * D, 0.3 * D, C.white); // wing fairing
    if (P.winglet) for (const s of [1, -1]) { const tl = W.tipLE(s); V.plate([[tl[0] - ct, tl[1], tl[2]], [tl[0], tl[1], tl[2]], [tl[0] - ct * 0.55, tl[1] + 0.05 * S, tl[2]], [tl[0] - ct * 1.05, tl[1] + 0.05 * S, tl[2]]], 0.2, null, [0, 0, s]); }
    // engines under the wings (fans or propellers), or at the back
    const E = P.eng || { f: [0.34] };
    if (E.rear) {
      const len = E.len ?? 0.14 * L, r = (E.dia ?? 0.06 * L) / 2, back = -L / 2 + 0.13 * L, y = 0.28 * D;
      for (const s of [1, -1]) {
        const z = s * (0.5 * D + 1.2 * r);
        nacelle(B, back + len, back, y, z, r);
        B.box(back + len * 0.25, y - r * 0.3, Math.min(z, s * 0.4 * D), back + len * 0.7, y + r * 0.3, Math.max(z, s * 0.4 * D), C.engine);
      }
      if (E.rear === 3) nacelle(B, back + len, back - 0.02 * L, 0.62 * D, 0, r);
    } else {
      for (const f of E.f) for (const s of [1, -1]) {
        const z = s * f * S / 2, le = W.leAt(z), y = W.yAt(z);
        if (E.props) {
          const r = (E.dia ?? 0.05 * L) / 2, front = le + 0.3 * cr, back = le - cr * (high ? 1.05 : 0.95), yc = high ? y - 0.35 * r : y + 0.15 * r;
          nacelle(B, front, back, yc, z, r, C.white);
          k.spin.push({ buf: prop(E.prop ?? 0.065 * L, E.blades ?? 4, E.chord ?? Math.max(0.2, 0.012 * L)), axis: 'x', at: [front + 0.1, yc, z], speed: 32 });
        } else {
          const len = E.len ?? 0.12 * L, r = (E.dia ?? 0.055 * L) / 2, front = le + 0.5 * len, yc = y - 1.15 * r;
          nacelle(B, front, front - len, yc, z, r);
          B.box(front - len * 0.75, yc + 0.5 * r, z - 0.12 * r, front - len * 0.2, y, z + 0.12 * r, C.engine); // pylon
        }
      }
    }
    // tail
    const fh = P.fh ?? 0.17 * L, fcr = P.fcr ?? 0.17 * L, fsw = P.fsweep ?? (E.props ? 28 : 36);
    const F = fin(V, { xr: -L / 2 + 0.005 * L, y0: 0.28 * D, cr: fcr, ct: fcr * 0.42, h: fh, sweep: fsw, t: Math.max(0.22, 0.008 * L) });
    const hsHalf = P.hs ?? (P.T ? 0.16 : 0.2) * S, hcr = 0.1 * L;
    if (P.T) wings(B, { x: F.tipFront + 0.03 * L, y: F.top - 0.1, half: hsHalf, cr: hcr * 0.85, ct: hcr * 0.45, sweep: E.props ? 8 : 30, dih: 0, t: 0.2, col: C.white });
    else wings(B, { x: -L / 2 + 0.2 * L, y: 0.24 * D, half: hsHalf, cr: hcr, ct: hcr * 0.45, sweep: E.props ? 6 : 32, dih: E.props ? 0 : 6, t: 0.2, col: C.white });
    if (P.gear) for (const [x, z] of [[L / 2 - 0.13 * L, 0], [wx - cr * 0.6, 0.12 * S], [wx - cr * 0.6, -0.12 * S]]) {
      B.beam([x, -0.4 * D, z], [x, -0.5 * D - 0.9, z], 0.2, C.metal);
      B.box(x - 0.35, -0.5 * D - 1.25, z - 0.12, x + 0.35, -0.5 * D - 0.6, z + 0.12, C.black);
    }
    return k;
  }

  // --- Light aircraft: a cabin, a nose engine (or two on the wings), high or low wing --------------------------------
  function ga(P) {
    const { L, S } = P, D = P.D ?? 1.15, k = new Kit(), B = k.body, V = k.livery, twin = !!P.twin;
    B.loft([
      [L / 2, 0, twin ? 0.08 : 0.12, twin ? 0.08 : 0.12], [L / 2 - 0.05 * L, 0, 0.36 * D, 0.36 * D], [L / 2 - 0.15 * L, 0.02 * D, 0.45 * D, 0.5 * D],
      [L / 2 - 0.3 * L, 0.12 * D, 0.5 * D, 0.62 * D], [L / 2 - 0.52 * L, 0.12 * D, 0.5 * D, 0.6 * D], [-L / 2 + 0.08 * L, 0.26 * D, 0.14 * D, 0.2 * D], [-L / 2, 0.3 * D, 0.07 * D, 0.14 * D],
    ], C.white);
    B.box(L / 2 - 0.31 * L, 0.32 * D, -0.43 * D, L / 2 - 0.2 * L, 0.68 * D, 0.43 * D, C.dark); // windscreen
    for (const s of [1, -1]) B.box(L / 2 - 0.5 * L, 0.3 * D, s * 0.47 * D, L / 2 - 0.3 * L, 0.62 * D, s * 0.53 * D, C.dark); // side windows
    V.box(L / 2 - 0.15 * L, -0.12 * D, -0.52 * D, L / 2 - 0.55 * L, 0.02 * D, 0.52 * D); // stripe
    const high = !!P.high, cr = P.cr ?? 0.19 * L, wy = high ? 0.8 * D : -0.42 * D, wx = high ? L / 2 - 0.27 * L : L / 2 - 0.3 * L;
    const W = wings(B, { x: wx, y: wy, half: S / 2, cr, ct: cr * (P.taper ?? (high ? 0.75 : 0.8)), sweep: 0, dih: high ? 1.7 : 6, t: Math.max(0.16, cr * 0.12), col: C.white });
    if (high && !P.cantilever) for (const s of [1, -1]) B.beam([wx - 0.4 * cr, -0.35 * D, s * 0.48 * D], [wx - 0.4 * cr, wy - 0.1, s * 0.3 * S], 0.12, C.white);
    for (const s of [1, -1]) { const tl = W.tipLE(s); V.box(tl[0] - cr * (P.taper ?? 0.8) - 0.05, tl[1] - 0.12, s * (S / 2 - 0.5) - 0.01, tl[0] + 0.05, tl[1] + 0.12, s * (S / 2) + s * 0.05); } // wing tips
    if (twin) for (const s of [1, -1]) {
      const z = s * 0.16 * S, le = W.leAt(z), y = W.yAt(z) + (high ? -0.25 : 0.12), front = le + 0.85, r = P.nr ?? 0.4;
      nacelle(B, front, le - cr * 0.9, y, z, r, C.white);
      k.spin.push({ buf: prop(P.prop ?? 0.9, P.blades ?? 2, 0.18), axis: 'x', at: [front + 0.08, y, z], speed: 34 });
    } else k.spin.push({ buf: prop(P.prop ?? 0.11 * L, P.blades ?? 2, 0.18), axis: 'x', at: [L / 2 + 0.06, 0, 0], speed: 34 });
    if (!P.retract) for (const [x, z, main] of [[L / 2 - 0.12 * L, 0, false], [wx - 0.55 * cr, 0.55 * D + 0.55, true], [wx - 0.55 * cr, -0.55 * D - 0.55, true]]) {
      const yb = -0.62 * D - 0.55;
      B.beam([x, -0.4 * D, main ? Math.sign(z) * 0.4 * D : 0], [x, yb + 0.25, z], 0.1, C.metal);
      B.box(x - 0.25, yb - 0.02, z - 0.1, x + 0.25, yb + 0.48, z + 0.1, C.black);
    }
    const fh = P.fh ?? 0.19 * L, fcr = 0.2 * L;
    const F = fin(V, { xr: -L / 2, y0: 0.26 * D, cr: fcr, ct: fcr * 0.5, h: fh, sweep: 32, t: 0.14 });
    if (P.T) wings(B, { x: F.tipFront + 0.05 * L, y: F.top - 0.05, half: 0.15 * S, cr: 0.1 * L, ct: 0.08 * L, t: 0.12, col: C.white });
    else wings(B, { x: -L / 2 + 0.15 * L, y: 0.24 * D, half: 0.16 * S, cr: 0.12 * L, ct: 0.09 * L, t: 0.12, col: C.white });
    return k;
  }

  // --- Helicopters ------------------------------------------------------------------------------------------------------
  function heli(P) {
    const k = new Kit(), B = k.body, V = k.livery;
    P = { ...P, R: P.R ?? P.S }; // the table's second number is a helicopter's rotor diameter
    const Lf = P.L, R = P.R / 2, W = P.W ?? 1.6, H = P.H ?? 1.7, Lc = (P.cabin ?? 0.45) * Lf, tail = -(Lf - 0.6 * Lc);
    if (P.tandem) { // the Chinook: a long box, two rotors on pylons, no tail rotor
      V.loft([[Lf / 2, -0.1 * H, 0.3 * W, 0.35 * H], [Lf / 2 - 0.08 * Lf, 0, 0.5 * W, 0.5 * H], [-Lf / 2 + 0.05 * Lf, 0.05 * H, 0.5 * W, 0.5 * H], [-Lf / 2, 0.2 * H, 0.4 * W, 0.3 * H]], null);
      B.box(Lf / 2 - 0.11 * Lf, 0.05 * H, -0.42 * W, Lf / 2 - 0.05 * Lf, 0.35 * H, 0.42 * W, C.dark);
      B.box(Lf / 2 - 0.2 * Lf, 0.4 * H, -0.25 * W, Lf / 2 - 0.05 * Lf, 0.7 * H, 0.25 * W, C.olive);
      B.box(-Lf / 2, 0.4 * H, -0.3 * W, -Lf / 2 + 0.22 * Lf, 1.35 * H, 0.3 * W, C.olive);
      for (const [x, y] of [[Lf / 2 - 0.12 * Lf, 0.78 * H], [-Lf / 2 + 0.1 * Lf, 1.45 * H]]) k.spin.push({ buf: rotor(R, 3, 0.04 * P.R), axis: 'y', at: [x, y, 0], speed: 14 });
      for (const [x, z] of [[Lf / 2 - 0.15 * Lf, 0.4 * W], [Lf / 2 - 0.15 * Lf, -0.4 * W], [-Lf / 2 + 0.2 * Lf, 0.4 * W], [-Lf / 2 + 0.2 * Lf, -0.4 * W]]) B.box(x - 0.4, -0.5 * H - 0.6, z - 0.15, x + 0.4, -0.5 * H, z + 0.15, C.black);
      return k;
    }
    // the cabin, in the operator's colour, and its windows
    V.loft([[0.62 * Lc, -0.05 * H, 0.3 * W, 0.35 * H], [0.48 * Lc, -0.02 * H, 0.46 * W, 0.47 * H], [0.25 * Lc, 0, 0.5 * W, 0.5 * H], [-0.28 * Lc, 0.03 * H, 0.5 * W, 0.5 * H], [-0.4 * Lc, 0.15 * H, 0.36 * W, 0.36 * H]], null);
    B.box(0.38 * Lc, 0.02 * H, -0.42 * W, 0.6 * Lc, 0.38 * H, 0.42 * W, C.dark); // windscreen
    for (const s of [1, -1]) B.box(-0.15 * Lc, 0.05 * H, s * 0.46 * W, 0.35 * Lc, 0.38 * H, s * 0.52 * W, C.dark);
    // engine and gearbox on top, the tail boom, fin, tailplane and tail rotor
    B.box(-0.4 * Lc, 0.42 * H, -0.32 * W, 0.18 * Lc, 0.78 * H, 0.32 * W, C.grey);
    if (P.light) { // a Robinson's thin boom and open cabin top
      B.loft([[-0.35 * Lc, 0.25 * H, 0.1 * W, 0.12 * H], [tail, 0.4 * H, 0.05 * W, 0.06 * H]], C.grey);
    } else B.loft([[-0.38 * Lc, 0.2 * H, 0.3 * W, 0.32 * H], [tail + 0.6, 0.35 * H, 0.1 * W, 0.12 * H], [tail, 0.38 * H, 0.07 * W, 0.08 * H]], C.white);
    const F = fin(V, { xr: tail - 0.2, y0: 0.3 * H, cr: 0.09 * Lf, ct: 0.05 * Lf, h: 0.13 * Lf, sweep: 35, t: 0.12 });
    wings(B, { x: tail + 0.18 * Lf, y: 0.35 * H, half: 0.11 * P.R, cr: 0.05 * Lf, ct: 0.04 * Lf, t: 0.1, col: C.white });
    // (the tail rotor turns about its own axle, which `rot` stands on its side)
    k.spin.push({ buf: rotor(0.085 * P.R, P.tailBlades ?? 2, 0.05, C.dark), axis: 'y', at: [tail + 0.05 * Lf, F.top - 0.04 * Lf, 0.18], speed: 40, rot: [Math.PI / 2, 0, 0] });
    // the main rotor
    B.box(-0.12 * Lc, 0.78 * H, -0.12, 0.08 * Lc, 0.95 * H + 0.15, 0.12, C.metal);
    k.spin.push({ buf: rotor(R, P.blades ?? 4, Math.max(0.25, 0.028 * P.R)), axis: 'y', at: [-0.02 * Lc, 0.95 * H + 0.3, 0], speed: 18 });
    // skids or wheels
    const yb = -0.5 * H - (P.wheels ? 0.45 : 0.55);
    if (P.wheels) {
      for (const s of [1, -1]) { B.box(-0.3 * Lc, -0.5 * H, s * 0.45 * W, 0.05 * Lc, -0.2 * H, s * 0.75 * W, C.white); B.box(-0.2 * Lc, yb, s * 0.55 * W, -0.05 * Lc, -0.5 * H, s * 0.68 * W, C.black); }
      B.box(0.4 * Lc, yb, -0.06, 0.5 * Lc, -0.45 * H, 0.06, C.black);
    } else for (const s of [1, -1]) {
      B.box(-0.35 * Lc, yb, s * 0.5 * W - 0.07, 0.42 * Lc, yb + 0.12, s * 0.5 * W + 0.07, C.metal);
      for (const x of [-0.2 * Lc, 0.25 * Lc]) B.beam([x, -0.45 * H, s * 0.3 * W], [x, yb + 0.06, s * 0.5 * W], 0.1, C.metal);
    }
    return k;
  }

  // --- Types: family, length and span (m), and anything the family needs ------------------------------------------------
  const T = {};
  const add = (fam, base, list) => { for (const [codes, L, S, extra] of list) for (const c of codes.split(' ')) T[c] = { fam, ...base, L, S, ...(extra || {}) }; };
  // light aircraft, high wing (Cessnas and others) and low wing
  add('ga', { high: true }, [['C150 C152', 7.3, 10.1], ['C162', 6.9, 9.1, { cantilever: true }], ['C170 C172 C72R', 8.3, 11], ['C175 C177 C77R', 8.4, 10.8, { cantilever: true }],
    ['C180 C185', 7.8, 11], ['C182 C82R', 8.8, 11], ['C206 P206 T206 U206', 8.6, 11], ['C207', 9.8, 11], ['C210 P210 T210', 8.6, 11.2, { cantilever: true, retract: true }],
    ['GA8', 8.9, 12.4], ['C208', 11.5, 15.9, { D: 1.7, blades: 3, prop: 1.35 }], ['C08T', 12.7, 15.9, { D: 1.7, blades: 3, prop: 1.35 }], ['J230 J170 JAB4 JABI', 6.7, 9.6, { cantilever: true }],
    ['DHC2', 9.2, 14.6, { D: 1.4, blades: 3 }], ['A210', 6.5, 10.4]]);
  add('ga', {}, [['P28A P28B PA28 P28T', 7.3, 10.7, { taper: 1 }], ['P28R', 7.6, 10.8, { taper: 1, retract: true }], ['P32R PA32 P32T', 8.4, 11, { taper: 1, retract: true }],
    ['SR20 SR22 S22T', 7.9, 11.7, { retract: false, blades: 3 }], ['DA40 DA50', 8, 11.9, { T: true }], ['BE33 BE35 BE36 BE3', 8.4, 10.2, { retract: true, blades: 3 }],
    ['M20P M20T M20J', 7.6, 10.7, { retract: true }], ['TB20 TB21 TB10 TB9', 7.7, 9.8], ['AA5 AA1', 6.8, 9.5], ['RV6 RV7 RV8 RV9 RV12 RV14', 6.2, 7.6],
    ['RV10', 7.4, 9.6], ['CT4', 7.2, 7.9], ['G115', 7.4, 10], ['PA38', 7.1, 10.4, { T: true }], ['TOBA TBM7 TBM8 TBM9', 10.7, 12.8, { D: 1.4, retract: true, blades: 4, prop: 1.15 }],
    ['PC12', 14.4, 16.3, { D: 1.6, retract: true, blades: 4, prop: 1.3, T: true }], ['PC21 PC9 PC7', 11.2, 9.1, { D: 1.2, retract: true, blades: 4, prop: 1.2 }],
    ['M600 P46T PA46', 9, 13.1, { retract: true, blades: 3 }], ['EA50', 11.1, 11.6, { retract: true }]]);
  // light twins
  add('ga', { twin: true }, [['PA44', 8.4, 11.8, { T: true, retract: true }], ['PA34', 8.7, 11.9, { retract: true }], ['PA31 P31T', 9.9, 12.4, { D: 1.3, retract: true, blades: 3 }],
    ['PA30 PA39 PA23 PA27', 7.6, 11.2, { retract: true }], ['BE55 BE58 BE95', 9.1, 11.5, { retract: true, blades: 3 }], ['BE76', 8.9, 11.6, { T: true, retract: true }],
    ['DA42', 8.6, 13.4, { T: true, retract: true, blades: 3 }], ['DA62', 9.2, 14.6, { T: true, retract: true, blades: 3 }], ['C310 C320 C340', 9.7, 11.3, { retract: true }],
    ['C402 C404 C414 C421 C425 C441', 11.1, 13.5, { D: 1.4, retract: true, blades: 3 }], ['P68', 9.4, 12, { high: true, cantilever: true }], ['AC50 AC6T AEST', 10.4, 15.1, { high: true, cantilever: true, retract: true }],
    ['BN2P BN2T', 10.9, 14.9, { high: true, cantilever: true, D: 1.2 }]]);
  // twin turboprops, low wing (King Airs and the like)
  add('jet', { eng: { props: true, f: [0.3], blades: 4 }, sweep: 2, dih: 6, cr: 0.16 * 14, windows: false, T: true, nose: 0.14 }, [
    ['B350 B35T', 14.2, 17.7], ['BE20 BE30 BE2T', 13.3, 16.6], ['BE9L BE9T BE10 BE99', 10.8, 15.3], ['B190 BE19', 17.6, 17.7], ['SW4 SW3', 18.1, 17.4, { T: false }],
    ['JS31 JS32', 14.4, 15.9, { T: false }], ['JS41', 19.3, 18.3, { T: false }], ['E120', 20, 19.8], ['PAY1 PAY2 PAY3 PAY4', 10.6, 13, { T: false }],
    ['SF34', 19.7, 21.4, { T: false, D: 2.3, windows: true }], ['F406', 11.9, 15.1, { T: false }], ['P180', 14.4, 14, { T: true }]]);
  for (const c of Object.keys(T)) if (T[c].fam === 'jet' && T[c].eng?.props) { T[c].cr = T[c].cr === 0.16 * 14 ? 0.16 * T[c].L : T[c].cr; T[c].eng = { ...T[c].eng, prop: T[c].L * 0.085, dia: T[c].L * 0.07 }; }
  // regional turboprops, high wing
  add('jet', { high: true, eng: { props: true, f: [0.28], blades: 6 }, sweep: 3, T: true, nose: 0.1 }, [
    ['DH8A DH8B', 22.3, 25.9, { D: 2.7, eng: { props: true, f: [0.28], blades: 4, prop: 2, dia: 1.4 } }], ['DH8C', 25.7, 27.4, { D: 2.7, eng: { props: true, f: [0.28], blades: 4, prop: 2, dia: 1.4 } }],
    ['DH8D', 32.8, 28.4, { D: 2.7, eng: { props: true, f: [0.29], blades: 6, prop: 2.05, dia: 1.6 } }], ['AT43 AT45 AT46', 22.7, 24.6, { D: 2.6, eng: { props: true, f: [0.3], blades: 4, prop: 1.95, dia: 1.4 } }],
    ['AT72 AT75 AT76', 27.2, 27, { D: 2.6, eng: { props: true, f: [0.3], blades: 6, prop: 1.95, dia: 1.4 } }], ['F50 F27', 25.2, 29, { D: 2.7, T: false, eng: { props: true, f: [0.27], blades: 6, prop: 1.85, dia: 1.4 } }],
    ['DHC6', 15.8, 19.8, { D: 1.6, T: false, gear: true, windows: false, eng: { props: true, f: [0.24], blades: 3, prop: 1.3, dia: 0.9 } }],
    ['D228', 16.6, 17, { D: 1.6, T: false, windows: false, eng: { props: true, f: [0.24], blades: 4, prop: 1.37, dia: 0.9 } }],
    ['C27J CN35 C295', 22.7, 28.7, { D: 3, T: false, fh: 0.24 * 22.7, windows: false, eng: { props: true, f: [0.27], blades: 6, prop: 2.05, dia: 1.6 } }]]);
  for (const c of Object.keys(T)) if (T[c].high && T[c].fam === 'jet') T[c].cr = T[c].cr ?? 0.1 * T[c].L;
  // military airlifters: high wing, four engines
  add('jet', { high: true, sweep: 2, D: 4.3, windows: false, T: false }, [
    ['C130 C30J L100', 29.8, 40.4, { fh: 0.27 * 29.8, cr: 4.2, eng: { props: true, f: [0.24, 0.5], blades: 6, prop: 2.05, dia: 1.4 } }],
    ['A400', 45.1, 42.4, { D: 5.6, T: true, fh: 0.2 * 45.1, cr: 6, sweep: 15, eng: { props: true, f: [0.24, 0.5], blades: 8, prop: 2.65, dia: 1.8 } }],
    ['C17', 53, 51.8, { D: 6.9, T: true, fh: 0.2 * 53, cr: 0.17 * 53, sweep: 25, eng: { f: [0.3, 0.55], len: 6, dia: 2.6 } }]]);
  // jets with their engines at the back, and business jets
  add('jet', { eng: { rear: 2 }, T: true, sweep: 25, winglet: false }, [
    ['F70', 30.9, 28.1, { D: 3.3 }], ['F100', 35.5, 28.1, { D: 3.3 }], ['B712', 37.8, 28.4, { D: 3.6 }], ['MD81 MD82 MD83 MD87 MD88 MD90', 45, 32.8, { D: 3.6 }],
    ['CRJ1 CRJ2', 26.8, 21.2, { D: 2.7 }], ['CRJ7', 32.5, 23.2, { D: 2.7 }], ['CRJ9 CRJX', 36.2, 24.9, { D: 2.7 }], ['E135 E145 E35L', 29.9, 20, { D: 2.3, winglet: true }],
    ['GLEX GL5T GLEX GL6T', 30.3, 28.7, { D: 2.7, winglet: true }], ['GL7T GL8T', 33.8, 31.7, { D: 2.8, winglet: true }], ['GLF4 GLF5 GLF6 GA5C GA6C GA7C GA8C', 29.4, 28.5, { D: 2.5, winglet: true }],
    ['G280 CL30 CL35 CL60', 20.9, 20, { D: 2.4, winglet: true }], ['C680 C68A C700', 19.4, 21, { D: 2.2, winglet: true }], ['C750', 22, 19.4, { D: 2.2 }],
    ['C560 C56X C550 C55B', 15.8, 17.2, { D: 1.8 }], ['C25A C25B C25C C525 C510 C501', 14.4, 14.4, { D: 1.6, T: false }], ['LJ35 LJ40 LJ45 LJ60 LJ75', 17.7, 14.6, { D: 1.8, winglet: true }],
    ['E50P E55P', 15.6, 16.2, { D: 1.8 }], ['PC24', 16.9, 17, { D: 1.8, winglet: true }], ['H25B H25C BE40 PRM1', 15.6, 15.7, { D: 1.8 }], ['HDJT', 13, 12.1, { D: 1.5 }],
    ['FA7X FA8X FA50 F900', 23.4, 26.2, { D: 2.5, eng: { rear: 3 }, winglet: true }], ['F2TH FA10 FA20', 20.2, 19.3, { D: 2.4 }]]);
  for (const c of Object.keys(T)) if (T[c].eng?.rear) { T[c].sweep = T[c].L < 25 ? 22 : 26; T[c].eng = { ...T[c].eng, dia: T[c].L < 25 ? 0.075 * T[c].L : 0.055 * T[c].L }; T[c].cr = 0.17 * T[c].L; T[c].wx = 0.02 * T[c].L; }
  // narrowbody jets
  add('jet', { winglet: true }, [
    ['A318', 31.4, 34.1], ['A319 A19N', 33.8, 35.8], ['A320 A20N', 37.6, 35.8], ['A321 A21N', 44.5, 35.8], ['B736', 31.2, 35.8], ['B737 B37M', 33.6, 35.8],
    ['B738 B38M P8', 39.5, 35.8], ['B739 B39M', 42.1, 35.8], ['B3XM', 43.8, 35.9], ['BCS1', 35, 35.1, { winglet: false }], ['BCS3', 38.7, 35.1, { winglet: false }],
    ['E170 E75L E75S E175', 31.7, 26, { D: 3 }], ['E190 E195', 37, 28.7, { D: 3 }], ['E290 E295', 39, 34, { D: 3 }], ['B752', 47.3, 38.1, { D: 3.8 }], ['B753', 54.4, 38.1, { D: 3.8 }],
    ['C919', 38.9, 35.8], ['B733 B734 B735', 33.4, 28.9, { winglet: false }], ['A310', 46.7, 43.9, { D: 5.6, winglet: false }]]);
  for (const c of Object.keys(T)) if (T[c].fam === 'jet' && !T[c].eng && !T[c].high) { T[c].D = T[c].D ?? 3.9; T[c].eng = { f: [0.34], len: 0.12 * T[c].L, dia: 0.052 * T[c].L }; }
  // widebodies
  add('jet', { sweep: 31, winglet: true, D: 5.8 }, [
    ['A332 A338', 58.8, 60.3, { D: 5.6 }], ['A333 A339', 63.7, 60.3, { D: 5.6 }], ['A359', 66.8, 64.8, { D: 6 }], ['A35K', 73.8, 64.8, { D: 6 }], ['A306', 54.1, 44.8, { D: 5.6, winglet: false }],
    ['B762 B763 B764', 54.9, 47.6, { D: 5, winglet: false }], ['B772 B77L', 63.7, 64.8, { D: 6.2, winglet: false }], ['B773 B77W', 73.9, 64.8, { D: 6.2, winglet: false }],
    ['B778 B779', 76.7, 71.8, { D: 6.2, winglet: false }], ['B788', 56.7, 60.1, { winglet: false }], ['B789', 62.8, 60.1, { winglet: false }], ['B78X', 68.3, 60.1, { winglet: false }]]);
  for (const c of Object.keys(T)) if (T[c].sweep === 31 && !T[c].eng) T[c].eng = { f: [0.32], len: 0.105 * T[c].L, dia: 0.053 * T[c].L };
  // four-engined jets
  add('jet', { sweep: 33, winglet: true }, [
    ['A388', 72.7, 79.8, { D: 7.1, eng: { f: [0.3, 0.56], len: 6.5, dia: 3 } }], ['B741 B742 B743 B744 B74S', 70.7, 64.4, { D: 6.5, eng: { f: [0.33, 0.62], len: 6.5, dia: 2.8 } }],
    ['B748', 76.3, 68.4, { D: 6.5, winglet: false, eng: { f: [0.33, 0.62], len: 7, dia: 3.1 } }], ['A342 A343 A345 A346', 63.7, 60.3, { D: 5.6, eng: { f: [0.3, 0.58], len: 5, dia: 2.3 } }]]);
  // helicopters: length, rotor diameter, cabin width and height, blades
  add('heli', { light: true }, [['R22', 8.8, 7.7, { W: 1.1, H: 1.5, blades: 2 }], ['R44 R66', 8.9, 10.1, { W: 1.3, H: 1.6, blades: 2 }],
    ['B06 B06T B206', 9.5, 10.2, { W: 1.3, H: 1.6, blades: 2, light: false }], ['H269 S300', 6.8, 8.2, { W: 1.1, H: 1.4, blades: 3 }],
    ['H500 MD52 HU30', 7.6, 8.1, { W: 1.4, H: 1.5, blades: 5, light: false }], ['EN28 EN48', 8.9, 9.8, { W: 1.3, H: 1.5, blades: 3 }], ['CABR', 7.8, 6.7, { W: 1.1, H: 1.5, blades: 2 }]]);
  add('heli', {}, [['AS50 AS55 AS3B EC30', 10.9, 10.7, { W: 1.9, H: 1.9, blades: 3 }], ['EC20', 9.6, 10.2, { W: 1.6, H: 1.7, blades: 3 }],
    ['EC35 EC45 BK17', 11.6, 11, { W: 1.7, H: 1.9, blades: 4 }], ['B407 B427 B429 B505', 10.6, 10.7, { W: 1.6, H: 1.8, blades: 4 }],
    ['A109 A119', 11.4, 11, { W: 1.6, H: 1.8, blades: 4, wheels: true }], ['MD60 MD90', 10.5, 10.3, { W: 1.5, H: 1.7, blades: 5 }],
    ['H160', 13.4, 13.4, { W: 2, H: 2.1, blades: 5, wheels: true }], ['AS65 AS66 EC55', 11.6, 11.9, { W: 2, H: 2, blades: 4, wheels: true }],
    ['A139', 13.8, 13.8, { W: 2.2, H: 2.2, blades: 5, wheels: true, tailBlades: 4 }], ['A169', 12.6, 12.1, { W: 2.1, H: 2.1, blades: 5, wheels: true }],
    ['A189', 17.6, 14.6, { W: 2.3, H: 2.3, blades: 5, wheels: true, tailBlades: 4 }], ['S76', 13.2, 13.4, { W: 2.1, H: 2.1, blades: 4, wheels: true, tailBlades: 4 }],
    ['S92 H92', 17.1, 17.2, { W: 2.4, H: 2.4, blades: 4, wheels: true, tailBlades: 4 }], ['B412 B212 UH1 UH1Y', 12.7, 14, { W: 2.4, H: 2.2, blades: 4 }],
    ['EC25 EC75 AS32 EC225', 16.8, 16.2, { W: 2.3, H: 2.3, blades: 5, wheels: true, tailBlades: 4 }], ['NH90', 16.1, 16.3, { W: 2.5, H: 2.4, blades: 4, wheels: true, tailBlades: 4 }],
    ['H60 S70 UH60', 15.3, 16.4, { W: 2.4, H: 2.2, blades: 4, wheels: true, tailBlades: 4 }], ['EH10 AW10', 19.5, 18.6, { W: 2.7, H: 2.6, blades: 5, wheels: true, tailBlades: 4 }],
    ['TIGR', 14, 13, { W: 1.1, H: 2, blades: 4, wheels: true }], ['EXPL MD90', 9.9, 10.3, { W: 1.6, H: 1.8, blades: 5 }]]);
  add('heli', { tandem: true }, [['H47 CH47', 15.5, 18.3, { W: 3.8, H: 3.6 }]]);

  // when the type is unknown: by ADS-B category
  const BY_CAT = { A1: 'C172', A2: 'DH8C', A3: 'B738', A4: 'B752', A5: 'B789', A6: 'GLEX', A7: 'AS50', B1: 'P28A', B4: 'C162', B6: 'C162' };
  const HELI = new Set(Object.keys(T).filter((c) => T[c].fam === 'heli'));

  function specFor(info) {
    let type = (info.type || '').toUpperCase();
    if (!T[type]) type = (info.heli ? 'AS50' : BY_CAT[info.cat]) || 'B738';
    if ((info.cat === 'A7' || info.heli) && !HELI.has(type)) type = 'AS50'; // a rotorcraft whose type we don't know
    return { key: type, ...T[type], heli: T[type].fam === 'heli' };
  }
  // how much bigger than real the map draws it: 1.4 times, more for aircraft under 20 m
  const drawScale = (L) => (L >= 20 ? 1.4 : 1.4 * Math.sqrt(20 / L));

  // The model for a type: arrays for the body (with colours), the livery, each spinning part, and the shadow, all
  // scaled to drawn metres, plus `base`: how far the model reaches below its origin.
  const cache = new Map();
  function build(key) {
    if (cache.has(key)) return cache.get(key);
    const P = T[key], k = P.fam === 'heli' ? heli(P) : P.fam === 'ga' ? ga(P) : jet(P);
    const ds = drawScale(P.fam === 'heli' ? Math.max(P.L, P.S) : P.L);
    const scaled = (b) => ({ p: b.p.map((v) => v * ds), n: b.n.slice(), c: b.c.slice() });
    let minY = Infinity;
    for (const b of [k.body, k.livery]) for (let i = 1; i < b.p.length; i += 3) minY = Math.min(minY, b.p[i] * ds);
    const out = { key, body: scaled(k.body), livery: scaled(k.livery), base: -minY, length: P.L * ds,
      spin: k.spin.map((s) => ({ ...scaled(s.buf), axis: s.axis, at: s.at.map((v) => v * ds), speed: s.speed, rot: s.rot })), shadow: shadowOf([k.body, k.livery], ds) };
    cache.set(key, out);
    return out;
  }
  // a pixel outline in plan: every cell under the model filled once (so the transparent shadow doesn't darken where
  // parts overlap), as runs of cells along x
  function shadowOf(bufs, ds) {
    const tris = [];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const b of bufs) for (let i = 0; i < b.p.length; i += 9) {
      const t = [[b.p[i] * ds, b.p[i + 2] * ds], [b.p[i + 3] * ds, b.p[i + 5] * ds], [b.p[i + 6] * ds, b.p[i + 8] * ds]];
      const area = (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1]);
      if (Math.abs(area) < 1e-6) continue;
      tris.push(t);
      for (const [x, z] of t) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    }
    const cell = Math.max(0.35, (x1 - x0) / 110), nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1, grid = new Uint8Array(nx * nz);
    for (const t of tris) {
      const bx0 = Math.max(0, Math.floor((Math.min(t[0][0], t[1][0], t[2][0]) - x0) / cell)), bx1 = Math.min(nx - 1, Math.ceil((Math.max(t[0][0], t[1][0], t[2][0]) - x0) / cell));
      const bz0 = Math.max(0, Math.floor((Math.min(t[0][1], t[1][1], t[2][1]) - z0) / cell)), bz1 = Math.min(nz - 1, Math.ceil((Math.max(t[0][1], t[1][1], t[2][1]) - z0) / cell));
      for (let i = bx0; i <= bx1; i++) for (let j = bz0; j <= bz1; j++) {
        const px = x0 + (i + 0.5) * cell, pz = z0 + (j + 0.5) * cell;
        const s = (a, b) => (b[0] - a[0]) * (pz - a[1]) - (b[1] - a[1]) * (px - a[0]);
        const d1 = s(t[0], t[1]), d2 = s(t[1], t[2]), d3 = s(t[2], t[0]);
        if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) grid[j * nx + i] = 1;
      }
    }
    const p = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (!grid[j * nx + i]) continue;
      let e = i;
      while (e + 1 < nx && grid[j * nx + e + 1]) e++;
      const ax = x0 + i * cell, bx = x0 + (e + 1) * cell, az = z0 + j * cell, bz = az + cell;
      p.push(ax, 0, az, ax, 0, bz, bx, 0, bz, ax, 0, az, bx, 0, bz, bx, 0, az);
      i = e;
    }
    return { p, n: p.map((_, i) => (i % 3 === 1 ? 1 : 0)) };
  }

  window.__aircraft = { specFor, build, types: T, drawScale };
})();
