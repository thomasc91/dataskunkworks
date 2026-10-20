// Hand-built landmarks for the Brisbane pixel diorama, on their real places (landmarks.json, made by
// landmarks/build_landmarks.py from OpenStreetMap): the Wheel of Brisbane, whose rim turns while the traffic runs;
// the Brisbane sign at the Cultural Forecourt; the Nepalese Peace Pagoda; the Shrine of Remembrance and its eternal
// flame; the XXXX sign on the brewery roof; the Grand Arbour's bougainvillea; Streets Beach; and open bowls with
// their pitches for the Gabba and Suncorp Stadium, in place of the model's solid blocks. Like the ferry terminals,
// heights are real metres times the map's 1.6; the wheel is scaled 1.6 all round so it stays round. Sizes follow
// published figures and photos (notes on each model). Added 20 Oct 2026.
//
// Roll mode (roll.js) can roll them up: window.__landmarks lists each one's footprint, and hiding one collapses
// its triangles (and stops the wheel).
(() => {
  const S = 1.6; // the map's height scale
  const file = fetch('landmarks.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const mean = (a, k) => { let s = 0; for (let i = k; i < a.length; i += 2) s += a[i]; return s / (a.length / 2); };
  const inPoly = (a, x, z) => { let c = false; for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) if ((a[i + 1] > z) !== (a[j + 1] > z) && x < ((a[j] - a[i]) * (z - a[i + 1])) / (a[j + 1] - a[i + 1]) + a[i]) c = !c; return c; };
  // a rectangle round (x, z), u along (ux, uz) and v to its left, as a [x, z, ...] ring
  const rect = (x, z, ux, uz, u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].flatMap(([u, v]) => [x + u * ux - v * uz, z + u * uz + v * ux]);
  // A building entry shrunk to nothing at its centre. It keeps its type, so the facade draws stay in step, and its id.
  const flatten = (b) => {
    const r = b[1], x = mean(r, 0), z = mean(r, 1);
    b[0] = 0; b[1] = [x, z, x, z, x, z]; b[4] = 0; b.length = Math.min(b.length, 6);
  };
  const circle = (x, z, r, n = 24) =>Array.from({ length: n }, (_, i) => [x + r * Math.cos((2 * Math.PI * i) / n), z + r * Math.sin((2 * Math.PI * i) / n)]).flat();

  // Footprints the models stand on, where the model's own trees are taken out.
  function clearings(L) {
    const w = L.wheel, sg = L.sign, pg = L.pagoda;
    return [
      rect(w.x, w.z, w.dir[0], w.dir[1], -30, 30, -10, 10),
      rect(sg.x, sg.z, sg.dir[0], sg.dir[1], -sg.len / 2 - 8, sg.len / 2 + 8, -10, 14), // the forecourt in front, open to the river
      rect(pg.x, pg.z, pg.dir[0], pg.dir[1], -pg.size / 2 - 1, pg.size / 2 + 1, -pg.size / 2 - 1, pg.size / 2 + 1),
      circle(L.shrine.x, L.shrine.z, 10),
      ...L.stadiums.map((s) => s.outline), ...L.beach.lagoon, ...L.beach.sand,
    ];
  }

  // Before city.js builds the map: leave out the model's plain blocks for the stadiums and the pagoda, and the trees
  // where the models stand, and add labels for the new places.
  const T0 = window.__terrain;
  if (T0) {
    const load = T0.load;
    T0.load = async (data, K) => {
      const L = await file;
      if (L) {
        // Flattened in place rather than taken out: city.js picks each building's facade with a seeded random draw,
        // in order, so removing entries would give every later building a different facade.
        const drop = new Set(L.replaces || []);
        for (const b of data.buildings) if (drop.has(b[5])) flatten(b);
        const clear = clearings(L).map((a) => {
          let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
          for (let i = 0; i < a.length; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); z0 = Math.min(z0, a[i + 1]); z1 = Math.max(z1, a[i + 1]); }
          return { a, x0, x1, z0, z1 };
        });
        if (Array.isArray(data.trees) && typeof data.trees[0] === 'number') {
          const keep = [];
          for (let i = 0; i < data.trees.length; i += 2) {
            const x = data.trees[i], z = data.trees[i + 1];
            if (!clear.some((c) => x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && inPoly(c.a, x, z))) keep.push(x, z);
          }
          data.trees = keep;
        }
        const lag = L.beach.lagoon[0];
        data.labels = [...(data.labels || []),
          ['The Wheel of Brisbane', L.wheel.x, L.wheel.z, 62, 'place'],
          ['Shrine of Remembrance', L.shrine.x, L.shrine.z, 14, 'place'],
          ...(lag ? [['Streets Beach', mean(lag, 0), mean(lag, 1), 3, 'place']] : [])];
      }
      return load(data, K);
    };
  }

  // --- Geometry: triangles with flat normals and vertex colours -------------------------------------------------
  class Geo {
    constructor() { this.p = []; this.n = []; this.c = []; }
    get count() { return this.p.length / 3; }
    // a triangle facing `want`, whichever way round its corners come
    tri(a, b, c, rgb, want) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) return;
      nx /= l; ny /= l; nz /= l;
      if (want && nx * want[0] + ny * want[1] + nz * want[2] < 0) { [b, c] = [c, b]; nx = -nx; ny = -ny; nz = -nz; }
      for (const q of [a, b, c]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.c.push(rgb[0], rgb[1], rgb[2]); }
    }
    quad(a, b, c, d, rgb, want) { this.tri(a, b, c, rgb, want); this.tri(a, c, d, rgb, want); }
    // a convex ring of [x, y, z] corners pushed along `off`: sides facing out, both ends capped
    prism(ring, off, side, cap = side) {
      const n = ring.length, m = [0, 0, 0];
      for (const q of ring) { m[0] += q[0] / n; m[1] += q[1] / n; m[2] += q[2] / n; }
      const top = ring.map((q) => [q[0] + off[0], q[1] + off[1], q[2] + off[2]]);
      for (let i = 0; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n];
        this.quad(a, b, top[(i + 1) % n], top[i], side, [(a[0] + b[0]) / 2 - m[0], (a[1] + b[1]) / 2 - m[1], (a[2] + b[2]) / 2 - m[2]]);
      }
      const neg = off.map((v) => -v);
      for (let i = 1; i + 1 < n; i++) { this.tri(ring[0], ring[i], ring[i + 1], cap, neg); this.tri(top[0], top[i], top[i + 1], cap, off); }
    }
    // an upright box in a frame {x, z, ux, uz}: u along (ux, uz), v to its left, from y0 to y1
    box(f, u0, v0, u1, v1, y0, y1, side, top = side) {
      const P = (u, v) => [f.x + u * f.ux - v * f.uz, y0, f.z + u * f.uz + v * f.ux];
      this.prism([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], [0, y1 - y0, 0], side, top);
    }
    // an axis-aligned box in local coordinates
    lbox(x0, x1, y0, y1, z0, z1, rgb, top = rgb) { this.prism([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, y1 - y0, 0], rgb, top); }
    // a square beam w across from a to b
    beam(a, b, w, rgb) {
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]);
      if (L < 1e-6) return;
      const t = d.map((v) => v / L);
      let p = Math.abs(t[1]) < 0.9 ? [t[2], 0, -t[0]] : [1, 0, 0];
      const pl = Math.hypot(p[0], p[1], p[2]);
      p = p.map((v) => v / pl);
      const q = [t[1] * p[2] - t[2] * p[1], t[2] * p[0] - t[0] * p[2], t[0] * p[1] - t[1] * p[0]], h = w / 2;
      this.prism([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s1, s2]) => [0, 1, 2].map((k) => a[k] + (p[k] * s1 + q[k] * s2) * h)), d, rgb);
    }
    cyl(x, z, r, y0, y1, n, side, top = side) {
      const ring = [];
      for (let i = 0; i < n; i++) ring.push([x + r * Math.cos((2 * Math.PI * i) / n), y0, z + r * Math.sin((2 * Math.PI * i) / n)]);
      this.prism(ring, [0, y1 - y0, 0], side, top);
    }
    // a level ring between radii r0 and r1, y0 to y1
    annulus(x, z, r0, r1, y0, y1, n, rgb, top = rgb) {
      const P = (r, a, y) => [x + r * Math.cos(a), y, z + r * Math.sin(a)];
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n, b = (2 * Math.PI * (i + 1)) / n, out = [Math.cos((a + b) / 2), 0, Math.sin((a + b) / 2)];
        this.quad(P(r1, a, y0), P(r1, b, y0), P(r1, b, y1), P(r1, a, y1), rgb, out);
        this.quad(P(r0, a, y0), P(r0, b, y0), P(r0, b, y1), P(r0, a, y1), rgb, out.map((v) => -v));
        this.quad(P(r0, a, y1), P(r1, a, y1), P(r1, b, y1), P(r0, b, y1), top, [0, 1, 0]);
        this.quad(P(r0, a, y0), P(r1, a, y0), P(r1, b, y0), P(r0, b, y0), rgb, [0, -1, 0]);
      }
    }
    // a level polygon (a [x, z, ...] ring, maybe concave) at height y, facing up
    flat(ring, y, rgb, K) {
      const pts = [];
      for (let i = 0; i < ring.length; i += 2) pts.push(new K.Vector2(ring[i], ring[i + 1]));
      for (const [a, b, c] of K.ShapeUtils.triangulateShape(pts, [])) this.tri([pts[a].x, y, pts[a].y], [pts[b].x, y, pts[b].y], [pts[c].x, y, pts[c].y], rgb, [0, 1, 0]);
    }
    // walls round a [x, z, ...] ring (either way round), from y0(x, z) up to y1(x, z), facing out
    walls(ring, y0, y1, rgb) {
      const n = ring.length / 2;
      let A = 0;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += ring[2 * i] * ring[2 * j + 1] - ring[2 * j] * ring[2 * i + 1]; }
      const s = Math.sign(A) || 1;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = ring[2 * i], az = ring[2 * i + 1], bx = ring[2 * j], bz = ring[2 * j + 1];
        this.quad([ax, y0(ax, az), az], [bx, y0(bx, bz), bz], [bx, y1(bx, bz), bz], [ax, y1(ax, az), az], rgb, [s * (bz - az), 0, -s * (bx - ax)]);
      }
    }
  }

  window.__landmarkGeo = Geo; // towers.js builds its tower tops with it

  // 5 by 7 pixel letters, top row first
  const GLYPH = {
    B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  };
  // A word in pixel letters standing in frame f, read from v's side: letters run along +u from u0, each pixel
  // pu along and py high, from y0 up, v0 to v1 deep. colours: one per letter.
  function word(G, f, text, u0, pu, py, y0, v0, v1, colours) {
    [...text].forEach((ch, k) => {
      const g = GLYPH[ch], col = colours[k % colours.length];
      g.forEach((row, r) => {
        const yA = y0 + (6 - r) * py;
        for (let c = 0; c < 5; c++) {
          if (row[c] !== '1') continue;
          let e = c;
          while (e + 1 < 5 && row[e + 1] === '1') e++;
          G.box(f, u0 + (k * 6 + c) * pu, v0, u0 + (k * 6 + e + 1) * pu, v1, yA, yA + py, col);
          c = e;
        }
      });
    });
  }

  async function start() {
    const D = window.__dio, K = window.__terrain?.K;
    const L = await file;
    if (!L || !K || !D?.city) return;
    const { city } = D;
    const T = D.terrain;
    const ground = (x, z) => (T ? T.h(x, z) : 0);
    const bmin = (ring) => (T?.bmin ? T.bmin(ring) : 0);
    const Color = city.sun.color.constructor;
    const rgb = (hex) => { const c = new Color(hex); return [c.r, c.g, c.b]; };
    const G = new Geo(), items = [];
    // each model's triangles are one run of the static mesh, so roll mode can hide it
    const run = (name, label, pts, H, extra = {}) => {
      const it = { name, label, key: 'landmark:' + name, pts, H, from: extra.from ?? 0, to: G.count, gone: false, ...extra };
      items.push(it);
      return it;
    };

    // --- The Wheel of Brisbane: 60 m tall, 42 enclosed gondolas, on two A-frames, by the river at South Bank
    // (opened 2008). The rim, its spokes and the gondolas turn on the moving layer; the legs stay in the still one.
    let wheelGroup = null, spin = null, gondolas = null;
    {
      const W = L.wheel, [ux, uz] = W.dir, nx = -uz, nz = ux, g = ground(W.x, W.z);
      const HUB = 33 * S, R = 27 * S, STATIONS = 42;
      const at = (u, v, y) => [W.x + u * ux + v * nx, g + y, W.z + u * uz + v * nz];
      const white = rgb('#f2f2ee'), grey = rgb('#a5abb0'), deck = rgb('#c9cdd0');
      const from = G.count;
      G.box({ x: W.x, z: W.z, ux, uz }, -13, -9, 13, 9, -1, 1.2 * S, deck); // the boarding deck
      for (const s of [-1, 1]) {
        const top = at(0, s * 3.6, HUB);
        for (const e of [-1, 1]) G.beam(at(e * 17 * S, s * 7.5, 0), top, 1.6, white);
        G.beam(at(-8.5 * S, s * 5.55, HUB / 2), at(8.5 * S, s * 5.55, HUB / 2), 1.0, white);
      }
      G.beam(at(0, -4.6, HUB), at(0, 4.6, HUB), 2.4, grey); // the axle
      run('The Wheel of Brisbane', 'The Wheel of Brisbane (60 m)', rect(W.x, W.z, ux, uz, -17 * S - 1, 17 * S + 1, -8.5, 8.5), HUB + R + 6,
        { from, vol: 26000, colour: white, hide: () => { if (wheelGroup) wheelGroup.visible = false; } });

      // The turning part, in the wheel's own frame: x along the rim's line, y up, z across, centred on the hub.
      const Group = D.life?.root?.constructor;
      if (Group && city.addMoving) {
        const RG = new Geo();
        for (const z of [-2.6, 2.6]) {
          for (let i = 0; i < 84; i++) {
            const a = (2 * Math.PI * i) / 84, b = (2 * Math.PI * (i + 1)) / 84;
            RG.beam([R * Math.cos(a), R * Math.sin(a), z], [R * Math.cos(b), R * Math.sin(b), z], 1.1, white);
          }
          for (let i = 0; i < 21; i++) {
            const a = (2 * Math.PI * i) / 21 + (z > 0 ? Math.PI / 21 : 0);
            RG.beam([2.4 * Math.cos(a), 2.4 * Math.sin(a), z * 0.6], [R * Math.cos(a), R * Math.sin(a), z], 0.5, white);
          }
        }
        for (let i = 0; i < STATIONS; i++) {
          const a = (2 * Math.PI * i) / STATIONS;
          RG.beam([R * Math.cos(a), R * Math.sin(a), -2.6], [R * Math.cos(a), R * Math.sin(a), 2.6], 0.8, white);
        }
        const hubRing = Array.from({ length: 12 }, (_, i) => [2.8 * Math.cos((Math.PI * i) / 6), 2.8 * Math.sin((Math.PI * i) / 6), -1.9]);
        RG.prism(hubRing, [0, 0, 3.8], grey);
        const GG = new Geo(); // a gondola, hanging from its pivot: white, with a band of glass all round
        GG.beam([0, 0.3, 0], [0, -1.3, 0], 0.4, grey);
        GG.lbox(-1.4, 1.4, -1.5, -1.1, -1.3, 1.3, rgb('#d8dcdf'));
        GG.lbox(-1.6, 1.6, -5.0, -1.5, -1.5, 1.5, white);
        GG.lbox(-1.65, 1.65, -3.9, -2.0, -1.55, 1.55, rgb('#3f5d78'));
        const geo = (q) => {
          const b = new K.BufferGeometry();
          b.setAttribute('position', new K.BufferAttribute(new Float32Array(q.p), 3));
          b.setAttribute('normal', new K.BufferAttribute(new Float32Array(q.n), 3));
          b.setAttribute('color', new K.BufferAttribute(new Float32Array(q.c), 3));
          b.computeBoundingSphere();
          return b;
        };
        const mat = new K.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
        wheelGroup = new Group();
        spin = new Group();
        spin.add(new K.Mesh(geo(RG), mat));
        gondolas = new K.InstancedMesh(geo(GG), mat, STATIONS);
        gondolas.frustumCulled = false;
        wheelGroup.add(spin, gondolas);
        wheelGroup.position.set(W.x, g + HUB, W.z);
        wheelGroup.rotation.y = Math.atan2(-uz, ux);
        wheelGroup.name = 'wheel-of-brisbane';
        const RP = R + 0.7, PERIOD = 180; // the ride's four turns take about 12 minutes
        let turn = 0;
        const place = () => {
          spin.rotation.z = turn;
          const A = gondolas.instanceMatrix.array;
          for (let i = 0; i < STATIONS; i++) {
            const a = (2 * Math.PI * i) / STATIONS + turn;
            A.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, RP * Math.cos(a), RP * Math.sin(a), 0, 1], i * 16);
          }
          gondolas.instanceMatrix.needsUpdate = true;
        };
        place();
        city.addMoving(wheelGroup);
        const life = D.life, lifeUpdate = life.update.bind(life);
        life.update = (dt) => { lifeUpdate(dt); if (wheelGroup.visible) { turn = (turn + (dt * 2 * Math.PI) / PERIOD) % (2 * Math.PI); place(); } };
      }
    }

    // --- The Brisbane sign: BRISBANE in letters about 3 m tall along 27 m of the Cultural Forecourt, each letter
    // a different artist's colours, with the river and the city behind it for photos (2018, made permanent).
    {
      const B = L.sign, [ux, uz] = B.dir, g = bmin(rect(B.x, B.z, ux, uz, -B.len / 2, B.len / 2, -1, 1));
      const f = { x: B.x, z: B.z, ux, uz }, len = B.len - 0.6, pu = len / 47, py = (3 * S) / 7, base = 0.3 * S;
      const from = G.count;
      G.box(f, -B.len / 2, -0.9, B.len / 2, 0.9, g - 0.5, g + base, rgb('#3a3f46'));
      word(G, f, 'BRISBANE', -len / 2, pu, py, g + base, -0.35, 0.35,
        ['#e8457c', '#f4a52a', '#2fb3a8', '#f2d43c', '#7a5cc8', '#e2533a', '#3c8fd8', '#5fb85a'].map(rgb));
      run('The Brisbane sign', 'The Brisbane sign', rect(B.x, B.z, ux, uz, -B.len / 2, B.len / 2, -1, 1), base + 7 * py,
        { from, vol: 300, colour: rgb('#e8457c') });
    }

    // --- The Nepalese Peace Pagoda: built for Nepal's pavilion at Expo 88 and kept at South Bank. Carved timber
    // and brick in two storeys under tiered roofs, with a gilded finial; about 13 m tall on an 11 m square.
    {
      const P = L.pagoda, [ux, uz] = P.dir, h = P.size / 2, ring = rect(P.x, P.z, ux, uz, -h, h, -h, h), g = bmin(ring);
      const f = { x: P.x, z: P.z, ux, uz }, Y = (m) => g + m * S;
      const stone = rgb('#b9b0a2'), brick = rgb('#a5462f'), wood = rgb('#4a2b1b'), roof = rgb('#4d3428'), roofTop = rgb('#5e4232'), gold = rgb('#e2b13c');
      const sq = (half, y0, y1, side, top = side) => G.box(f, -half, -half, half, half, Y(y0), Y(y1), side, top);
      const from = G.count;
      sq(h, -0.6, 0.9, stone);
      sq(3.9, 0.9, 4.3, brick);
      for (const a of [-3.9, -1.3, 1.3, 3.9]) for (const b of [-3.9, 3.9]) { // carved posts round the ground storey
        G.box(f, a - 0.35, b - 0.35, a + 0.35, b + 0.35, Y(0.9), Y(4.3), wood);
        G.box(f, b - 0.35, a - 0.35, b + 0.35, a + 0.35, Y(0.9), Y(4.3), wood);
      }
      [[5.6, 4.3], [4.7, 4.65], [3.8, 5.0], [3.0, 5.35]].forEach(([half, y], i, a) => sq(half, y, y + 0.35, roof, i === a.length - 1 ? roofTop : roof));
      sq(2.6, 5.7, 7.9, brick);
      for (const a of [-2.6, 2.6]) for (const b of [-2.6, 2.6]) G.box(f, a - 0.3, b - 0.3, a + 0.3, b + 0.3, Y(5.7), Y(7.9), wood);
      [[4.0, 7.9], [3.2, 8.25], [2.4, 8.6], [1.6, 8.95], [0.9, 9.3]].forEach(([half, y]) => sq(half, y, y + 0.35, roof, roofTop));
      G.cyl(P.x, P.z, 0.45, Y(9.65), Y(10.3), 8, gold);
      G.cyl(P.x, P.z, 0.75, Y(10.3), Y(11.0), 8, gold);
      G.cyl(P.x, P.z, 0.3, Y(11.0), Y(12.6), 8, gold);
      run('Nepalese Peace Pagoda', 'The Nepalese Peace Pagoda', ring, 12.6 * S, { from, vol: 900, colour: brick });
    }

    // --- The Shrine of Remembrance, Anzac Square (1930): a circle of 18 Doric columns in Helidon sandstone on a
    // raised base over the crypt, with the eternal flame burning in a bronze urn in the middle.
    {
      const C = L.shrine, g = bmin(circle(C.x, C.z, 8.5, 16)), Y = (m) => g + m * S;
      const stone = rgb('#d3bb8c'), light = rgb('#e2d0a6'), bronze = rgb('#7d5c30');
      const from = G.count;
      G.cyl(C.x, C.z, 8.6, Y(-0.8), Y(2.4), 32, stone, light);
      G.cyl(C.x, C.z, 7.2, Y(2.4), Y(2.8), 32, light);
      for (let i = 0; i < 18; i++) {
        const a = (2 * Math.PI * i) / 18;
        G.cyl(C.x + 5.4 * Math.cos(a), C.z + 5.4 * Math.sin(a), 0.45, Y(2.8), Y(8.8), 8, light);
      }
      G.annulus(C.x, C.z, 4.5, 6.0, Y(8.8), Y(10.0), 36, stone, light);
      G.annulus(C.x, C.z, 4.3, 6.3, Y(10.0), Y(10.35), 36, light);
      G.box({ x: C.x, z: C.z, ux: 1, uz: 0 }, -0.6, -0.6, 0.6, 0.6, Y(2.8), Y(3.8), stone, light);
      G.cyl(C.x, C.z, 0.55, Y(3.8), Y(4.6), 10, bronze);
      G.box({ x: C.x, z: C.z, ux: 1, uz: 0 }, -0.25, -0.25, 0.25, 0.25, Y(4.6), Y(5.2), rgb('#ff8a1c'));
      G.box({ x: C.x, z: C.z, ux: 1, uz: 0 }, -0.12, -0.12, 0.12, 0.12, Y(5.2), Y(5.5), rgb('#ffd34d'));
      run('Shrine of Remembrance', 'The Shrine of Remembrance', circle(C.x, C.z, 8.6, 16), 10.35 * S, { from, vol: 2600, colour: stone });
    }

    // --- The XXXX sign: red letters on the Castlemaine Perkins brewery roof at Milton, facing the railway.
    {
      const X = L.xxxx, [onx, onz] = X.out, ux = onz, uz = -onx;
      const mx = (X.a[0] + X.b[0]) / 2 - onx * 3, mz = (X.a[1] + X.b[1]) / 2 - onz * 3;
      const roof = (T?.bref?.[X.bid] ?? bmin([X.a[0], X.a[1], X.b[0], X.b[1]])) + X.h * S;
      const f = { x: mx, z: mz, ux, uz }, pu = 1.1, py = 0.85 * S, w = 23 * pu, y0 = roof + 1.4 * S;
      const red = rgb('#d4262c'), board = rgb('#f4f1ea'), steel = rgb('#5d6267');
      const from = G.count;
      for (const u of [-w / 2 + 1, -w / 6, w / 6, w / 2 - 1]) G.box(f, u - 0.3, -0.9, u + 0.3, -0.3, roof - 0.2, y0, steel);
      G.box(f, -w / 2 - 0.7, -0.6, w / 2 + 0.7, -0.15, y0 - 0.5, y0 + 7 * py + 0.5, board);
      word(G, f, 'XXXX', -w / 2, pu, py, y0, -0.15, 0.35, [red]);
      run('The XXXX sign', 'The XXXX sign', rect(mx, mz, ux, uz, -w / 2, w / 2, -1, 1), 8 * py, { from, vol: 400, colour: red, bid: X.bid });
    }

    // --- Stadiums: an open bowl of seating stepping up from the field to the rim, under a ring of roof, on the
    // stadium's own outline. The Gabba (1895, rebuilt 1993 to 2005): a cricket and AFL oval, the pitch running
    // north to south between the Vulture Street and Stanley Street ends, with six light towers. Suncorp Stadium
    // (Lang Park, rebuilt 2003): a rectangular rugby league field under a roof over every stand.
    for (const st of L.stadiums) {
      const O = st.outline, F = st.field, g = bmin(O), cx = mean(F, 0), cz = mean(F, 1), N = 120;
      const hit = (ring, th) => { // the farthest crossing of ring by the ray from the field's middle
        const dx = Math.cos(th), dz = Math.sin(th);
        let best = 0;
        for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
          const ax = ring[j], az = ring[j + 1], ex = ring[i] - ax, ez = ring[i + 1] - az, wx = ax - cx, wz = az - cz;
          const det = -dx * ez + ex * dz;
          if (Math.abs(det) < 1e-9) continue;
          const t = (-wx * ez + ex * wz) / det, s = (dx * wz - dz * wx) / det;
          if (s >= 0 && s <= 1 && t > best) best = t;
        }
        return best;
      };
      // the field's long axis
      let sxx = 0, szz = 0, sxz = 0;
      for (let i = 0; i < F.length; i += 2) { const x = F[i] - cx, z = F[i + 1] - cz; sxx += x * x; szz += z * z; sxz += x * z; }
      const ax = 0.5 * Math.atan2(2 * sxz, sxx - szz), axU = Math.cos(ax), axV = Math.sin(ax);
      const oval = st.kind === 'oval', rim = st.h, ROWS = oval ? 8 : 9;
      const seatA = rgb(oval ? '#93a5b8' : '#8798ab'), seatB = rgb(oval ? '#8394a8' : '#78899c'), riser = rgb('#b3afa5');
      const facade = rgb('#d8d2c5'), band = rgb('#b5ae9f'), roofTop = rgb('#f1f1ec'), roofUnder = rgb('#c4c6c4'), back = rgb('#8f918e');
      const grass = rgb('#5d9c47'), apron = rgb('#4f8a3d'), line = rgb('#f4f4ee');
      const from = G.count;
      const rays = [];
      for (let k = 0; k < N; k++) {
        const th = (2 * Math.PI * k) / N, rf = hit(F, th), ro = hit(O, th);
        rays.push({ c: Math.cos(th), s: Math.sin(th), rf, rs: Math.min(rf + (oval ? 4 : 3), ro - 12), ro });
      }
      const P = (k, r, y) => { const q = rays[k % N]; return [cx + q.c * r, y, cz + q.s * r]; };
      const yF = g + 0.45, yRow = (j) => g + (1.2 + (rim * 0.8 - 1.2) * (j / ROWS)) * S, yRim = g + rim * S;
      for (let k = 0; k < N; k++) {
        const a = rays[k], b = rays[(k + 1) % N], out = [(a.c + b.c) / 2, 0, (a.s + b.s) / 2], inn = out.map((v) => -v);
        G.tri([cx, yF, cz], P(k, a.rs, yF), P(k + 1, b.rs, yF), apron, [0, 1, 0]);
        G.tri([cx, yF + 0.04, cz], P(k, a.rf, yF + 0.04), P(k + 1, b.rf, yF + 0.04), grass, [0, 1, 0]);
        const rin = (q) => q.ro - 5, rr = (q) => q.ro - 5 - (q.ro - 5 - q.rs) * (oval ? 0.42 : 0.55);
        for (let j = 0; j < ROWS; j++) {
          const ra = (q) => q.rs + ((rin(q) - q.rs) * j) / ROWS, rb = (q) => q.rs + ((rin(q) - q.rs) * (j + 1)) / ROWS;
          G.quad(P(k, ra(a), j ? yRow(j) : yF), P(k + 1, ra(b), j ? yRow(j) : yF), P(k + 1, ra(b), yRow(j + 1)), P(k, ra(a), yRow(j + 1)), riser, inn);
          G.quad(P(k, ra(a), yRow(j + 1)), P(k + 1, ra(b), yRow(j + 1)), P(k + 1, rb(b), yRow(j + 1)), P(k, rb(a), yRow(j + 1)), j % 2 ? seatB : seatA, [0, 1, 0]);
        }
        G.quad(P(k, rin(a), yRow(ROWS)), P(k + 1, rin(b), yRow(ROWS)), P(k + 1, rin(b), yRim), P(k, rin(a), yRim), back, inn);
        G.quad(P(k, a.ro, g - 0.5), P(k + 1, b.ro, g - 0.5), P(k + 1, b.ro, yRim - 3 * S), P(k, a.ro, yRim - 3 * S), facade, out);
        G.quad(P(k, a.ro, yRim - 3 * S), P(k + 1, b.ro, yRim - 3 * S), P(k + 1, b.ro, yRim), P(k, a.ro, yRim), band, out);
        // the roof: out past the wall and in over the upper rows
        const y1 = yRim + 0.8 * S, o = 1.5;
        G.quad(P(k, rr(a), y1), P(k + 1, rr(b), y1), P(k + 1, b.ro + o, y1), P(k, a.ro + o, y1), roofTop, [0, 1, 0]);
        G.quad(P(k, rr(a), yRim), P(k + 1, rr(b), yRim), P(k + 1, b.ro + o, yRim), P(k, a.ro + o, yRim), roofUnder, [0, -1, 0]);
        G.quad(P(k, rr(a), yRim), P(k + 1, rr(b), yRim), P(k + 1, rr(b), y1), P(k, rr(a), y1), roofTop, inn);
        G.quad(P(k, a.ro + o, yRim), P(k + 1, b.ro + o, yRim), P(k + 1, b.ro + o, y1), P(k, a.ro + o, y1), roofTop, out);
        if (oval) { // the boundary rope, 3 m in from the field's edge
          G.quad(P(k, a.rf - 3.4, yF + 0.08), P(k + 1, b.rf - 3.4, yF + 0.08), P(k + 1, b.rf - 2.6, yF + 0.08), P(k, a.rf - 2.6, yF + 0.08), line, [0, 1, 0]);
        }
      }
      const fl = { x: cx, z: cz, ux: axU, uz: axV };
      if (oval) {
        // the square and the pitch, north to south
        const ns = { x: cx, z: cz, ux: 0, uz: 1 };
        G.box(ns, -13, -11, 13, 11, yF, yF + 0.1, rgb('#86b866'));
        G.box(ns, -10.06, -1.52, 10.06, 1.52, yF, yF + 0.16, rgb('#dccb98'));
        // six light towers round the rim
        const tallTop = g + 46 * S, lamp = rgb('#fff4c4'), steel = rgb('#9aa0a5');
        for (const d of [30, 90, 150, 210, 270, 330]) {
          const th = ax + (d * Math.PI) / 180, ro = hit(O, th) + 4, x = cx + Math.cos(th) * ro, z = cz + Math.sin(th) * ro;
          G.beam([x, ground(x, z) - 0.5, z], [x, tallTop, z], 2.0, steel);
          const tf = { x, z, ux: -Math.sin(th), uz: Math.cos(th) };
          G.box(tf, -4.5, -0.4, 4.5, 0.6, tallTop - 1, tallTop + 7 * S, steel);
          G.box(tf, -4.2, 0.6, 4.2, 0.9, tallTop - 0.5, tallTop + 7 * S - 0.6, lamp);
        }
      } else {
        // mown stripes and the lines of a rugby league field: try lines 100 m apart, 68 m wide, posts on the tries
        for (let k = -6; k < 6; k++) G.box(fl, k * 10, -34, k * 10 + 10, 34, yF, yF + 0.08, rgb(k % 2 ? '#5d9c47' : '#69a952'));
        G.box(fl, -60.4, -34.4, 60.4, -33.6, yF, yF + 0.14, line);
        G.box(fl, -60.4, 33.6, 60.4, 34.4, yF, yF + 0.14, line);
        for (let u = -60; u <= 60; u += 10) if (u !== -60 && u !== 60 && Math.abs(u) !== 55) G.box(fl, u - (Math.abs(u) === 50 ? 0.6 : 0.35), -34, u + (Math.abs(u) === 50 ? 0.6 : 0.35), 34, yF, yF + 0.14, line);
        for (const u of [-60, 60]) G.box(fl, u - 0.4, -34, u + 0.4, 34, yF, yF + 0.14, line);
        for (const u of [-50, 50]) {
          for (const v of [-2.8, 2.8]) G.box(fl, u - 0.25, v - 0.25, u + 0.25, v + 0.25, yF, yF + 16 * S, line);
          G.box(fl, u - 0.2, -2.8, u + 0.2, 2.8, yF + 3 * S, yF + 3 * S + 0.5, line);
        }
      }
      const it = run(st.name, st.name, O, rim * S, { from, colour: facade });
      let A = 0;
      for (let i = 0, j = O.length - 2; i < O.length; j = i, i += 2) A += O[j] * O[i + 1] - O[i] * O[j + 1];
      it.vol = Math.abs(A / 2) * rim * S * 0.3; // mostly air inside
    }

    // --- The Grand Arbour: about 1 km of curling steel tendrils over South Bank's walkway, under a canopy of
    // magenta bougainvillea (1999). Tendrils every 3.2 m, swapping sides; rolled up four at a time.
    {
      const steel = rgb('#5a5e62'), pinks = ['#c4378a', '#d9579f', '#a82d71'].map(rgb), leaf = rgb('#4d8a3b'), STEP = 3.2;
      let n = 0, from = G.count, group = [];
      const flush = () => {
        if (!group.length) return;
        const [a, b] = [group[0], group[group.length - 1]], L2 = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ux = L2 > 0.5 ? (b[0] - a[0]) / L2 : a[2], uz = L2 > 0.5 ? (b[1] - a[1]) / L2 : a[3];
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        run('Grand Arbour', 'a piece of the Grand Arbour', rect(mx, mz, ux, uz, -L2 / 2 - 1.6, L2 / 2 + 1.6, -3.6, 3.6), 7.6 * S, { from, vol: 60, colour: pinks[0], thin: true });
        from = G.count;
        group = [];
      };
      for (const path of L.arbour) {
        let acc = 0, next = STEP / 2;
        for (let i = 0; i + 3 < path.length; i += 2) {
          const ax = path[i], az = path[i + 1], bx = path[i + 2], bz = path[i + 3], len = Math.hypot(bx - ax, bz - az);
          if (len < 1e-6) continue;
          const tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz, nz = tx;
          while (next <= acc + len) {
            const q = (next - acc) / len, x = ax + (bx - ax) * q, z = az + (bz - az) * q, s = n % 2 ? 1 : -1;
            const fx = x + nx * s * 2.9, fz = z + nz * s * 2.9, y0 = ground(fx, fz);
            const mid = [fx, y0 + 4.4 * S, fz], head = [x + nx * s * 0.8, y0 + 7.0 * S, z + nz * s * 0.8];
            G.beam([fx, y0 - 0.4, fz], mid, 0.45, steel);
            G.beam(mid, head, 0.45, steel);
            // the canopy: each tendril's bougainvillea reaches over the middle of the walk to meet the other side's
            const cf = { x, z, ux: tx, uz: tz }, v0 = s > 0 ? -0.4 : -3.2, v1 = s > 0 ? 3.2 : 0.4;
            G.box(cf, -1.9, v0, 1.9, v1, y0 + 6.6 * S, y0 + 7.4 * S, pinks[n % 3]);
            G.box(cf, -1.2, s > 0 ? 2.0 : -3.6, 1.2, s > 0 ? 3.6 : -2.0, y0 + 6.0 * S, y0 + 6.7 * S, n % 3 === 0 ? leaf : pinks[(n + 1) % 3]);
            group.push([x, z, tx, tz]);
            n++;
            if (group.length === 4) flush();
            next += STEP;
          }
          acc += len;
        }
        flush();
      }
    }

    // --- Streets Beach: South Bank's free lagoon, with its sand (1992). Not one to roll up: it's the ground.
    {
      const top = (ring, lift) => { let m = -Infinity; for (let i = 0; i < ring.length; i += 2) m = Math.max(m, ground(ring[i], ring[i + 1])); return m + lift; };
      for (const r of L.beach.sand) { const y = top(r, 0.15); G.walls(r, (x, z) => ground(x, z) - 0.3, () => y, rgb('#d9c48f')); G.flat(r, y, rgb('#ecdcaa'), K); }
      for (const r of L.beach.lagoon) { const y = top(r, 0.25); G.walls(r, (x, z) => ground(x, z) - 0.3, () => y, rgb('#dcd7cb')); G.flat(r, y, rgb('#4cc4d0'), K); }
    }

    // --- One mesh for everything that stays still
    const geo = new K.BufferGeometry();
    const pos = new K.BufferAttribute(new Float32Array(G.p), 3);
    geo.setAttribute('position', pos);
    geo.setAttribute('normal', new K.BufferAttribute(new Float32Array(G.n), 3));
    geo.setAttribute('color', new K.BufferAttribute(new Float32Array(G.c), 3));
    geo.computeBoundingSphere();
    const mesh = new K.Mesh(geo, new K.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    mesh.name = 'landmarks';
    mesh.castShadow = mesh.receiveShadow = true;
    city.scene.add(mesh);
    for (const it of items) {
      const own = it.hide;
      it.hide = () => {
        if (it.gone) return;
        it.gone = true;
        pos.array.fill(0, it.from * 3, it.to * 3);
        pos.needsUpdate = true;
        own?.();
        city.invalidate?.();
      };
    }
    window.__landmarks = { items, wheel: wheelGroup };
    city.invalidate?.();
    D.requestRender?.();
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.city) { clearInterval(wait); start(); }
  }, 200);
})();
