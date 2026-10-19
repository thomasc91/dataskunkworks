// Live trains for the Brisbane pixel diorama: every Queensland Rail train on the map at its real GPS position, from
// TransLink's open feed (CC BY 4.0) through the same relay as the ferries (live-config.js picks it). Added
// 19 Oct 2026.
//
// The model has no railway, so this layer also lays the tracks and platforms, from OpenStreetMap (rail.json, made
// by rail/build_rail.py): ballast and rails draped on the ground, platforms as raised slabs. Trains ride the
// bridge decks and disappear into tunnels.
//
// Each train reports about every 20 s. It's drawn LAG seconds behind real time, so it can glide between two known
// fixes: both fixes are snapped to the track, and the train follows the shortest way along the track between
// them (a Dijkstra search on the track graph), so it takes the right line through junctions. Its six cars follow
// the track behind it, round the curves, along the way it actually came. A train that hasn't moved yet faces its
// next stop.
//
// Hover a train for where it's going, where it came from and its next stop (OSM tags the platforms with TransLink's
// stop ids, which name them). ?trains=off leaves the trains out.
(() => {
  if (new URLSearchParams(location.search).get('trains') === 'off') return;
  const RELAY = (window.__liveRelay || 'http://localhost:4011') + '/trains';
  const POLL_MS = 10000, RETRY_MS = 60000;
  const LAG = 45; // s behind real time: fixes come about 20 s apart and arrive up to ~10 s old
  const STALE = 180; // s: a train whose last fix is older than this (at render time) is dropped
  const SNAP = 60; // m a GPS fix may be from the track and still be snapped to it
  const CAR = 23.5, GAP = 0.9, CARS = 6, S = 1.6; // a Queensland Rail six-car set, about 147 m
  const CAP = 60; // trains the meshes hold
  const Y = { ballast: 0.55, rails: 0.62, car: 0.7 }; // drawn metres above the ground
  // TransLink's route codes name both ends of a service, two letters each (BRIP: the city to Ipswich).
  const PLACES = {
    BR: 'the city', BD: 'the Airport', BN: 'Beenleigh', CA: 'Caboolture', CL: 'Cleveland', DB: 'Doomben', EX: 'Exhibition',
    FG: 'Ferny Grove', GY: 'Gympie North', IP: 'Ipswich', NA: 'Nambour', RP: 'Kippa-Ring', RW: 'Rosewood', SH: 'Shorncliffe',
    SP: 'Springfield Central', VL: 'Varsity Lakes',
  };

  async function start() {
    const D = window.__dio, K = window.__terrain?.K, life = D.life;
    const cats = life?.cats;
    if (!K || !cats) return;
    let rail;
    try {
      const r = await fetch('rail.json');
      if (!r.ok) return;
      rail = await r.json();
    } catch { return; }
    const { city, data } = D;
    const [ox, oz] = data.origin, [ccx, ccz, cr] = data.circle;
    const MX = 111320 * Math.cos((oz * Math.PI) / 180), MZ = 110540;
    const toXZ = (lat, lng) => [(lng - ox) * MX, -(lat - oz) * MZ];
    const T = D.terrain;
    const ground = (x, z) => (T ? T.h(x, z) : 0);
    const Color = city.sun.color.constructor;
    const rgb = (hex) => { const c = new Color(hex); return [c.r, c.g, c.b]; };

    // --- The track graph -------------------------------------------------------------------------------------
    const N = rail.nodes, E = rail.edges;
    const elen = E.map(([a, b]) => Math.hypot(N[b][0] - N[a][0], N[b][1] - N[a][1]) || 0.01);
    const adj = N.map(() => []);
    E.forEach(([a, b], e) => { adj[a].push([e, b]); adj[b].push([e, a]); });
    const CELL = 50, grid = new Map();
    E.forEach(([a, b], e) => {
      const [x0, z0] = N[a], [x1, z1] = N[b];
      for (let i = Math.floor(Math.min(x0, x1) / CELL); i <= Math.floor(Math.max(x0, x1) / CELL); i++)
        for (let j = Math.floor(Math.min(z0, z1) / CELL); j <= Math.floor(Math.max(z0, z1) / CELL); j++) {
          const k = i * 100003 + j;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(e);
        }
    });
    function snap(x, z) { // -> {e, t, x, z} on the nearest track within SNAP, or null
      let best = null, bd = SNAP;
      const gi = Math.floor(x / CELL), gj = Math.floor(z / CELL), r = Math.ceil(SNAP / CELL);
      for (let i = gi - r; i <= gi + r; i++)
        for (let j = gj - r; j <= gj + r; j++)
          for (const e of grid.get(i * 100003 + j) || []) {
            const [a, b] = E[e], [ax, az] = N[a], [bx, bz] = N[b];
            const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
            const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
            if (d < bd) (bd = d), (best = { e, t, x: px, z: pz });
          }
      return best;
    }
    // Shortest way along the track from P to Q (both snapped): [{x, z, e}, ...] with each point's segment edge.
    function route(P, Q) {
      const [qa, qb] = E[Q.e];
      if (P.e === Q.e) return [{ x: P.x, z: P.z, e: P.e }, { x: Q.x, z: Q.z, e: Q.e }];
      const dist = new Map(), prev = new Map(), heap = [];
      const push = (n, d, from) => {
        if (d >= (dist.get(n) ?? Infinity)) return;
        dist.set(n, d); prev.set(n, from);
        heap.push([d, n]);
        for (let i = heap.length - 1; i > 0; ) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
      };
      const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          for (let i = 0; ; ) {
            const l = 2 * i + 1, r = l + 1;
            let m = i;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === i) break;
            [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
          }
        }
        return top;
      };
      const [pa, pb] = E[P.e];
      push(pa, P.t * elen[P.e], { e: P.e, start: true });
      push(pb, (1 - P.t) * elen[P.e], { e: P.e, start: true });
      const goal = { [qa]: Q.t * elen[Q.e], [qb]: (1 - Q.t) * elen[Q.e] };
      let bestEnd = null, bestCost = Infinity;
      while (heap.length) {
        const [d, n] = pop();
        if (d > (dist.get(n) ?? Infinity) || d > bestCost || d > 6000) continue;
        if (n in goal && d + goal[n] < bestCost) (bestCost = d + goal[n]), (bestEnd = n);
        for (const [e, m] of adj[n]) push(m, d + elen[e], { e, from: n });
      }
      if (bestEnd == null) return null;
      const nodes = [];
      for (let n = bestEnd, guard = 0; guard < 10000; guard++) {
        const p = prev.get(n);
        nodes.unshift({ n, e: p.e });
        if (p.start) break;
        n = p.from;
      }
      const pts = [{ x: P.x, z: P.z, e: nodes[0].e }];
      for (let i = 0; i < nodes.length; i++) pts.push({ x: N[nodes[i].n][0], z: N[nodes[i].n][1], e: nodes[i + 1]?.e ?? Q.e });
      pts.push({ x: Q.x, z: Q.z, e: Q.e });
      return pts;
    }
    const plen = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); return s; };
    // From a point on edge e, walk the track for `len` metres heading away from node `away`, keeping as straight as
    // the junctions allow.
    function walk(x, z, e, away, len) {
      const pts = [];
      let node = E[e][0] === away ? E[e][1] : E[e][0], px = x, pz = z, left = len, edge = e;
      for (let guard = 0; guard < 400 && left > 0; guard++) {
        const [nx, nz] = N[node], d = Math.hypot(nx - px, nz - pz);
        if (d >= left) { const f = left / d; pts.push({ x: px + (nx - px) * f, z: pz + (nz - pz) * f, e: edge }); return pts; }
        pts.push({ x: nx, z: nz, e: edge });
        left -= d;
        const hx = (nx - px) / (d || 1), hz = (nz - pz) / (d || 1);
        let best = null, bestDot = -2;
        for (const [e2, m] of adj[node]) {
          if (e2 === edge) continue;
          const vx = N[m][0] - nx, vz = N[m][1] - nz, l = Math.hypot(vx, vz) || 1, dot = (vx * hx + vz * hz) / l;
          if (dot > bestDot) (bestDot = dot), (best = [e2, m]);
        }
        if (!best || bestDot < 0.5) { // end of the line: carry straight on
          pts.push({ x: nx + hx * left, z: nz + hz * left, e: -1 });
          return pts;
        }
        (px = nx), (pz = nz), ([edge, node] = best);
      }
      return pts;
    }

    // --- Tracks and platforms (still, in the cached layer) ---------------------------------------------------
    {
      const pos = [], col = [];
      const add = (p, c, lift) => { for (let i = 0; i < p.length; i += 3) pos.push(p[i], p[i + 1] + lift, p[i + 2]), col.push(...c); };
      // Tunnels aren't drawn, and bridges are the model's own decks, except a few short ones it has no deck for.
      const deck = (a, b) => T && T.deckAt((N[a][0] + N[b][0]) / 2, (N[a][1] + N[b][1]) / 2) != null;
      const ground_ = E.filter(([a, b, f]) => !(f & 2) && !(f & 1 && deck(a, b)));
      const segs = (w) => ground_.map(([a, b]) => [w, [N[a][0], N[a][1], N[b][0], N[b][1]]]);
      const ribbon = (list) => {
        if (T) return T.roads(list);
        const out = [];
        for (const [w, [ax, az, bx, bz]] of list) {
          const L = Math.hypot(bx - ax, bz - az) || 1, ox = (-(bz - az) / L) * w / 2, oz = ((bx - ax) / L) * w / 2;
          const c = [[ax + ox, az + oz], [bx + ox, bz + oz], [bx - ox, bz - oz], [ax - ox, az - oz]];
          for (const k of [0, 1, 2, 0, 2, 3]) out.push(c[k][0], 0, c[k][1]);
        }
        return out;
      };
      add(ribbon(segs(4)), rgb('#958b7e'), Y.ballast); // ballast
      add(ribbon(segs(1.8)), rgb('#5d5650'), Y.rails); // sleepers and rails
      const top = rgb('#cfcac0'), side = rgb('#a7a196');
      for (const ring of rail.platforms) {
        const v = [];
        for (let i = 0; i + 1 < ring.length - 2; i += 2) v.push(new K.Vector2(ring[i], ring[i + 1]));
        if (v.length < 3) continue;
        let g = 0;
        for (const p of v) g += ground(p.x, p.y);
        const y0 = g / v.length + Y.rails, y1 = y0 + 1.1 * S;
        for (const [a, b, c] of K.ShapeUtils.triangulateShape(v, [])) for (const p of [v[a], v[c], v[b]]) pos.push(p.x, y1, p.y), col.push(...top);
        for (let i = 0; i < v.length; i++) {
          const p = v[i], q = v[(i + 1) % v.length];
          for (const [x, y, z] of [[p.x, y0, p.y], [q.x, y0, q.y], [q.x, y1, q.y], [p.x, y0, p.y], [q.x, y1, q.y], [p.x, y1, p.y]]) pos.push(x, y, z), col.push(...side);
        }
      }
      const geo = new K.BufferGeometry();
      geo.setAttribute('position', new K.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('color', new K.BufferAttribute(new Float32Array(col), 3));
      geo.computeVertexNormals();
      const mesh = new K.Mesh(geo, new K.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: K.DoubleSide }));
      mesh.receiveShadow = true;
      mesh.name = 'railway';
      city.scene.add(mesh);
      city.invalidate();
    }

    // --- The trains: instanced cars, a cab at each end of the set ---------------------------------------------
    function carGeometry(cab) {
      const pos = [], nor = [], col = [];
      const box = (x0, y0, z0, x1, y1, z1, c) => {
        const v = (x, y, z) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
        const faces = [[[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0]],
          [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]],
          [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, -1]]];
        for (const [a, b, c2, d, n] of faces) for (const p of [a, b, c2, a, c2, d]) pos.push(...v(...p)), nor.push(...n), col.push(...c);
      };
      const L = CAR / 2, W = 1.6, white = rgb('#f2f2ee'), band = rgb('#2f3a40'), skirt = rgb('#5b6066'), roof = rgb('#c9ccce'), teal = rgb('#1f8f8f'), cabC = rgb('#f2c21b');
      const h = (m) => m * S;
      const nose = cab ? 1.6 : 0; // the cab end (+x) is the front of the set
      box(-L, h(0.3), -W, L - nose, h(0.9), W, skirt);
      box(-L, h(0.9), -W, L - nose, h(1.9), W, white);
      box(-L, h(1.9), -W, L - nose, h(2.05), W, teal);
      box(-L, h(2.05), -W, L - nose, h(3.05), W, band);
      box(-L, h(3.05), -W, L - nose, h(3.6), W, white);
      box(-L + 0.3, h(3.6), -W + 0.3, L - nose - 0.3, h(3.85), W - 0.3, roof);
      if (cab) {
        box(L - nose, h(0.3), -W, L, h(2.05), W, cabC);
        box(L - nose, h(2.05), -W + 0.2, L - 0.3, h(3.05), W - 0.2, band);
        box(L - nose, h(3.05), -W, L - 0.4, h(3.5), W, cabC);
      }
      const g = new K.BufferGeometry();
      g.setAttribute('position', new K.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('normal', new K.BufferAttribute(new Float32Array(nor), 3));
      g.setAttribute('color', new K.BufferAttribute(new Float32Array(col), 3));
      return g;
    }
    const IM = cats.mesh.constructor, mat = new K.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const cabs = new IM(carGeometry(true), mat, CAP * 2), mids = new IM(carGeometry(false), mat, CAP * (CARS - 2));
    for (const m of [cabs, mids]) {
      m.layers.mask = cats.mesh.layers.mask; // the moving layer
      m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; m.visible = false;
      m.name = 'live-trains';
      life.root.add(m);
    }
    // One car: centred at (x, y, z), its length along (fx, fy, fz) (the front of the car), cross-section scaled by k.
    function place(arr, o, x, y, z, fx, fy, fz, k) {
      const l = Math.hypot(fx, fy, fz) || 1;
      (fx /= l), (fy /= l), (fz /= l);
      let sx = -fz, sz = fx; // side, level
      const sl = Math.hypot(sx, sz) || 1;
      (sx /= sl), (sz /= sl);
      const ux = -sz * fy, uy = sz * fx - sx * fz, uz = sx * fy; // up = side × front, square to a sloping car
      arr.set([fx, fy, fz, 0, ux * k, uy * k, uz * k, 0, sx * k, 0, sz * k, 0, x, y, z, 1], o);
    }

    // --- Trains, their fixes and the legs between them -----------------------------------------------------
    const trains = new Map(); // id -> {name, route, fixes: [{t, x, z, p (snapped), status, stop}], legs: Map, dir}
    function merge(json) {
      for (const v of json.vessels || []) {
        let tr = trains.get(v.id);
        if (!tr) trains.set(v.id, (tr = { name: v.name, route: v.route, fixes: [], legs: new Map(), heading: null }));
        tr.name = v.name; tr.route = v.route;
        for (const [t, lat, lng, status, stop] of v.fixes) {
          if (tr.fixes.some((f) => f.t === t)) continue;
          const [x, z] = toXZ(lat, lng);
          tr.fixes.push({ t, x, z, p: snap(x, z), status, stop });
        }
        tr.fixes.sort((a, b) => a.t - b.t);
      }
      const oldest = Date.now() / 1000 - 300;
      for (const [id, tr] of trains) {
        tr.fixes = tr.fixes.filter((f) => f.t >= oldest);
        if (!tr.fixes.length) trains.delete(id);
      }
    }
    function leg(tr, i) { // the path from fix i to fix i + 1
      const a = tr.fixes[i], b = tr.fixes[i + 1], key = `${a.t}-${b.t}`;
      if (!tr.legs.has(key)) {
        let pts = a.p && b.p ? route(a.p, b.p) : null;
        const straight = Math.hypot(b.x - a.x, b.z - a.z);
        if (!pts || plen(pts) > 3 * straight + 300) pts = [{ x: a.p?.x ?? a.x, z: a.p?.z ?? a.z, e: a.p?.e ?? -1 }, { x: b.p?.x ?? b.x, z: b.p?.z ?? b.z, e: b.p?.e ?? -1 }];
        tr.legs.set(key, { pts, len: plen(pts) });
      }
      return tr.legs.get(key);
    }
    // Where along a path s metres from its start: [x, z, e, heading x, heading z].
    function along(pts, s) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.z - a.z);
        if (s <= d || i === pts.length - 1) {
          const f = d ? Math.min(1, s / d) : 0;
          return [a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f, a.e, (b.x - a.x) / (d || 1), (b.z - a.z) / (d || 1)];
        }
        s -= d;
      }
      return [pts[0].x, pts[0].z, pts[0].e, 1, 0];
    }
    const stopXZ = (id) => { const s = rail.stops[id]; return s ? toXZ(s[1], s[2]) : null; };
    // The train at time t: its head, and the track behind it (back along the way it came) as a path.
    function state(tr, t) {
      const fx = tr.fixes, last = fx[fx.length - 1];
      if (t - last.t > STALE) return null;
      let i = fx.length - 1, u = 1;
      for (let k = 0; k + 1 < fx.length; k++) if (t < fx[k + 1].t) { i = k; u = Math.max(0, (t - fx[k].t) / (fx[k + 1].t - fx[k].t)); break; }
      if (t < fx[0].t) (i = 0), (u = 0);
      const behind = [];
      let head;
      if (i + 1 < fx.length) {
        const L = leg(tr, i), at = along(L.pts, L.len * u);
        head = { x: at[0], z: at[1], e: at[2] };
        if (L.len > 1) tr.heading = [at[3], at[4]];
        // back along this leg to its start
        let s = L.len * u;
        for (let k = L.pts.length - 1; k >= 0; k--) {
          const p = L.pts[k];
          let d = 0;
          for (let j = 1; j <= k; j++) d += Math.hypot(L.pts[j].x - L.pts[j - 1].x, L.pts[j].z - L.pts[j - 1].z);
          if (d < s) behind.push(p);
        }
      } else {
        const p = last.p || { x: last.x, z: last.z, e: -1 };
        head = { x: p.x, z: p.z, e: p.e };
        if (!tr.heading && p.e >= 0) { // never seen moving: face the next stop
          const [a, b] = E[p.e], vx = N[b][0] - N[a][0], vz = N[b][1] - N[a][1], l = Math.hypot(vx, vz) || 1, st = stopXZ(last.stop);
          const sgn = st && (st[0] - p.x) * vx + (st[1] - p.z) * vz < 0 ? -1 : 1;
          tr.heading = [(sgn * vx) / l, (sgn * vz) / l];
        }
      }
      // earlier legs, newest first
      for (let k = i - 1; k >= 0 && behind.length < 400; k--) {
        const L = leg(tr, k);
        for (let j = L.pts.length - 2; j >= 0; j--) behind.push(L.pts[j]);
      }
      return { head, behind, fix: fx[Math.min(fx.length - 1, i + (u > 0.5 ? 1 : 0))] };
    }

    // --- Drawing, every frame ----------------------------------------------------------------------------------
    const drawn = [];
    function update() {
      const t = Date.now() / 1000 - LAG;
      const zoom = Math.max(1, Math.min(3, Math.pow(city.view.span / 1500, 0.6))); // wider zoomed out, like the cars
      const CA = cabs.instanceMatrix.array, MA = mids.instanceMatrix.array;
      let nc = 0, nm = 0;
      drawn.length = 0;
      for (const tr of trains.values()) {
        if (nc + 2 > CAP * 2) break;
        const st = state(tr, t);
        if (!st || !tr.heading) continue;
        // the path from the head back: head, then the way it came, then on along the track if that runs out
        const path = [{ ...st.head }, ...st.behind];
        const need = CARS * (CAR + GAP) + 5;
        let have = plen(path);
        if (have < need) {
          const tail = path[path.length - 1], prev = path[path.length - 2];
          const e = snap(tail.x, tail.z)?.e ?? -1;
          if (e >= 0) {
            // walk away from the node ahead of the tail (the direction the train came from)
            const hx = prev ? tail.x - prev.x : -tr.heading[0], hz = prev ? tail.z - prev.z : -tr.heading[1];
            const [a, b] = E[e], toB = (N[b][0] - tail.x) * hx + (N[b][1] - tail.z) * hz > 0;
            path.push(...walk(tail.x, tail.z, e, toB ? a : b, need - have));
          }
          have = plen(path);
          if (have < need) continue;
        }
        let hidden = 0;
        const cars = [];
        for (let c = 0; c < CARS; c++) {
          const f = along(path, c * (CAR + GAP)), b = along(path, c * (CAR + GAP) + CAR);
          const mx = (f[0] + b[0]) / 2, mz = (f[1] + b[1]) / 2, on = snap(mx, mz), flags = on ? E[on.e][2] : 0;
          // in a tunnel, or off the edge of the model: not drawn
          const hide = flags & 2 || Math.hypot(mx - ccx, mz - ccz) > cr - CAR / 2;
          if (hide) hidden++;
          const y = (x, z) => (flags & 1 && T ? T.deckAt(x, z) ?? ground(x, z) + Y.car : ground(x, z) + Y.car); // bridges: on the deck
          const yf = y(f[0], f[1]), yb = y(b[0], b[1]);
          cars.push({ x: mx, y: (yf + yb) / 2, z: mz, fx: f[0] - b[0], fy: yf - yb, fz: f[1] - b[1], hide });
        }
        if (hidden === CARS) continue;
        cars.forEach((c, k) => {
          const kk = c.hide ? 0 : zoom;
          if (k === 0) place(CA, nc++ * 16, c.x, c.y, c.z, c.fx, c.fy, c.fz, kk);
          else if (k === CARS - 1) place(CA, nc++ * 16, c.x, c.y, c.z, -c.fx, -c.fy, -c.fz, kk); // the rear cab faces back
          else place(MA, nm++ * 16, c.x, c.y, c.z, c.fx, c.fy, c.fz, kk);
        });
        drawn.push({ tr, x: cars[2].x, y: cars[2].y, z: cars[2].z, fix: st.fix });
      }
      cabs.count = nc; mids.count = nm;
      cabs.instanceMatrix.needsUpdate = mids.instanceMatrix.needsUpdate = true;
    }
    const lifeUpdate = life.update.bind(life);
    life.update = (dt) => { lifeUpdate(dt); if (live && life.visible) update(); };

    // --- Live or not, polling, credits ---------------------------------------------------------------------------
    let live = false;
    const footer = document.querySelector('footer'), credit = document.createElement('span');
    credit.className = 'live-trains';
    function setLive(on) {
      live = on;
      cabs.visible = mids.visible = on;
      if (on && footer && !credit.isConnected) footer.append(credit);
      if (!on) credit.remove();
      window.__liveIntro?.('trains', on);
      D.requestRender?.();
    }
    let timer = 0;
    async function poll() {
      clearTimeout(timer);
      if (document.hidden) { timer = setTimeout(poll, POLL_MS); return; }
      try {
        const r = await fetch(RELAY, { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        merge(await r.json());
        if (!live) setLive(true);
        credit.textContent = trains.size ? ' · Trains: live GPS, TransLink (CC BY 4.0)' : ' · Trains: live from TransLink (CC BY 4.0), none running right now';
        timer = setTimeout(poll, POLL_MS);
      } catch {
        if (live && ![...trains.values()].some((tr) => Date.now() / 1000 - LAG - tr.fixes[tr.fixes.length - 1].t < STALE)) setLive(false);
        timer = setTimeout(poll, live ? POLL_MS : RETRY_MS);
      }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

    // --- Hover a train for where it's going and its next stop ---------------------------------------------------
    const canvas = document.getElementById('c') || city.renderer.domElement;
    const v3 = new (city.camera.position.constructor)();
    const tip = document.createElement('div');
    tip.className = 'panel train-tip';
    tip.hidden = true;
    Object.assign(tip.style, {
      position: 'fixed', zIndex: 31, pointerEvents: 'none', padding: '8px 11px', maxWidth: '280px',
      font: "600 13px/1.35 'Hanken Grotesk', system-ui, sans-serif", boxShadow: '0 2px 0 var(--shadow)',
    });
    document.body.append(tip);
    const stopName = (id) => {
      const s = rail.stops[id];
      return s ? s[0].replace(/,?\s*[Pp]latform\s*(\d+)/, ', platform $1') : '';
    };
    function lines(d) {
      const code = (d.tr.route || '').slice(0, 4), from = PLACES[code.slice(0, 2)], to = PLACES[code.slice(2, 4)];
      const where = stopName(d.fix.stop), status = { 0: 'Arriving at', 1: 'At', 2: 'Next stop:' }[d.fix.status] ?? 'Next stop:';
      return [[to ? `Train to ${to}` : 'Train'], ...(from ? [[`From ${from}`, true]] : []), ...(where ? [[`${status} ${where}`, true]] : []),
        ['Queensland Rail', true]];
    }
    canvas.addEventListener('pointermove', (e) => {
      if (!live || e.buttons || e.pointerType !== 'mouse') { tip.hidden = true; return; }
      const r = canvas.getBoundingClientRect();
      let best = null, bd = 26;
      for (const d of drawn) {
        v3.set(d.x, d.y + 3, d.z).project(city.camera);
        const dist = Math.hypot(r.left + ((v3.x + 1) / 2) * r.width - e.clientX, r.top + ((1 - v3.y) / 2) * r.height - e.clientY);
        if (v3.z < 1 && dist < bd) (bd = dist), (best = d);
      }
      if (!best) { tip.hidden = true; return; }
      tip.replaceChildren(...lines(best).map(([text, muted], i) => {
        const el = document.createElement('div');
        el.textContent = text;
        if (muted) Object.assign(el.style, { color: 'var(--muted)', fontWeight: 500, marginTop: i ? '2px' : 0 });
        return el;
      }));
      tip.hidden = false;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.min(e.clientX + 14, innerWidth - w - 8) + 'px';
      tip.style.top = Math.min(e.clientY + 14, innerHeight - h - 8) + 'px';
    });
    canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
    canvas.addEventListener('pointerdown', () => { tip.hidden = true; });

    window.__liveTrains = { trains, drawn, get live() { return live; }, relay: RELAY, snap, route };
    poll();
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.life) { clearInterval(wait); start(); }
  }, 200);
})();
