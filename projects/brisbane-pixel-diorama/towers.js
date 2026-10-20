// Brisbane's tallest towers, reshaped from photos for the Brisbane pixel diorama (added 20 Oct 2026).
//
// The map drew every tower as one straight prism at its mapped height, and missed the towers finished since 2019.
// Here each one is rebuilt from photos on Wikimedia Commons (towers/photos.md lists them) and published heights
// (towers/research.md): stacked tiers for setbacks, tapers and sloping tops, on the mapped footprint or a fitted
// shape, with the facade that matches its glass. Crowns, masts, fins and bands are separate pixel geometry on top.
//
// How: before city.js builds the map, each tower's own entries in westend.json are flattened in place (kept, so the
// facade draws below stay in step) and its tiers are added at the end of the list. city.js picks a tower's facade
// with a seeded random draw per entry, so each tier is preceded by as many invisible entries as it takes for the
// draw to land on the facade the tower needs. New towers get new building ids and cards. Heights are real metres
// times the map's 1.6, like everything else.
(() => {
  const S = 1.6;
  // city.js's facade choices for towers (type 3), in its order; apartments (type 1) always get the apartment tiles
  const DRAW = ['office', 'office', 'office', 'bronze', 'dark', 'dark', 'white', 'white', 'teal'];
  const ORIGIN = [153.025, -27.47], MX = 111320 * Math.cos((ORIGIN[1] * Math.PI) / 180), MZ = 110540;
  const at = (lat, lon) => [(lon - ORIGIN[0]) * MX, -(lat - ORIGIN[1]) * MZ];

  // --- Footprints: rings of [x, z] in westend.json's metres ---------------------------------------------------------
  const centroid = (r) => { let a = 0, x = 0, z = 0; for (let i = 0; i < r.length; i++) { const [x1, z1] = r[i], [x2, z2] = r[(i + 1) % r.length], c = x1 * z2 - x2 * z1; a += c; x += (x1 + x2) * c; z += (z1 + z2) * c; } return Math.abs(a) < 1e-9 ? [r[0][0], r[0][1]] : [x / (3 * a), z / (3 * a)]; };
  // the ring's own frame: centre, long axis (ux, uz), and its length and width along those axes
  function frameOf(r, deg) {
    const [cx, cz] = centroid(r);
    let a;
    if (deg != null) a = (deg * Math.PI) / 180;
    else {
      let sxx = 0, szz = 0, sxz = 0;
      for (const [x, z] of r) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
      a = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    }
    const ux = Math.cos(a), uz = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of r) { const u = (x - cx) * ux + (z - cz) * uz, v = -(x - cx) * uz + (z - cz) * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    return { x: cx + ((u0 + u1) / 2) * ux - ((v0 + v1) / 2) * uz, z: cz + ((u0 + u1) / 2) * uz + ((v0 + v1) / 2) * ux, ux, uz, len: u1 - u0, wid: v1 - v0 };
  }
  const local = (f, pts) => pts.map(([u, v]) => [f.x + u * f.ux - v * f.uz, f.z + u * f.uz + v * f.ux]);
  const toLocal = (f, [x, z]) => [(x - f.x) * f.ux + (z - f.z) * f.uz, -(x - f.x) * f.uz + (z - f.z) * f.ux];
  const scale = (r, s, c = centroid(r)) => r.map(([x, z]) => [c[0] + (x - c[0]) * s, c[1] + (z - c[1]) * s]);
  // scaled along and across a frame, and shifted along it (du) and across (dv)
  const scale2 = (r, f, su, sv, du = 0, dv = 0) => local(f, r.map((p) => { const [u, v] = toLocal(f, p); return [u * su + du, v * sv + dv]; }));
  // keep the part of the ring where (p - c)·n <= d (n a unit vector)
  function clip(r, [nx, nz], d, c) {
    const out = [], side = (p) => (p[0] - c[0]) * nx + (p[1] - c[1]) * nz - d;
    for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length], sp = side(p), sq = side(q);
      if (sp <= 0) out.push(p);
      if ((sp <= 0) !== (sq <= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    return out;
  }
  // shapes in a frame's local metres: a rectangle with rounded (r > 0) or cut (cut > 0) corners, or an ellipse
  function shape(f, kind, L, W, o = {}) {
    const a = L / 2, b = W / 2, pts = [];
    if (kind === 'ellipse') { const n = o.n || 24; for (let i = 0; i < n; i++) { const t = (2 * Math.PI * i) / n; pts.push([a * Math.cos(t), b * Math.sin(t)]); } }
    else if (kind === 'round') {
      const r = Math.min(o.r ?? b, a, b), n = o.n || 4;
      for (const [cu, cv, t0] of [[a - r, b - r, 0], [-a + r, b - r, 90], [-a + r, -b + r, 180], [a - r, -b + r, 270]])
        for (let i = 0; i <= n; i++) { const t = ((t0 + (90 * i) / n) * Math.PI) / 180; pts.push([cu + r * Math.cos(t), cv + r * Math.sin(t)]); }
    } else {
      const c = o.cut || 0;
      if (c) pts.push([a, b - c], [a - c, b], [-a + c, b], [-a, b - c], [-a, -b + c], [-a + c, -b], [a - c, -b], [a, -b + c]);
      else pts.push([a, b], [-a, b], [-a, -b], [a, -b]);
    }
    return local(f, pts);
  }

  // --- Tiers: {ring, from, to, facade, bid?} in real metres --------------------------------------------------------
  const tier = (ring, from, to, facade, bid) => ({ ring, from, to, facade, bid });
  // straight sections, each [from, to, ring]
  const stack = (facade, ...secs) => secs.map(([from, to, ring]) => tier(ring, from, to, facade));
  // a taper in steps: the footprint scaled from s0 at `from` to s1 at `to`
  function taper(ring, from, to, s0, s1, step, facade) {
    const out = [], n = Math.max(1, Math.round((to - from) / step));
    for (let i = 0; i < n; i++) out.push(tier(scale(ring, s0 + ((s1 - s0) * (i + 0.5)) / n), from + ((to - from) * i) / n, from + ((to - from) * (i + 1)) / n, facade));
    return out;
  }
  // a sloping top in steps: at `from` the whole footprint, rising to `to` along direction (nx, nz), keeping the far side
  function slope(ring, from, to, [nx, nz], step, facade, keep = 0.12) {
    const c = centroid(ring), ds = ring.map(([x, z]) => (x - c[0]) * nx + (z - c[1]) * nz), d0 = Math.min(...ds), d1 = Math.max(...ds);
    const out = [], n = Math.max(1, Math.round((to - from) / step));
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n, r = clip(ring, [-nx, -nz], -(d0 + (d1 - d0) * Math.min(t, 1 - keep)), c);
      if (r.length >= 3) out.push(tier(r, from + ((to - from) * i) / n, from + ((to - from) * (i + 1)) / n, facade));
    }
    return out;
  }

  // --- The towers ----------------------------------------------------------------------------------------------------
  // Each: name, kind, h (real height to the top), floors, bids (its entries in westend.json, flattened), and
  // parts(k) returning its tiers; k.ring is its mapped footprint (the tallest entry's), k.f that footprint's frame,
  // k.parts all its entries ({ring, h}), k.newBid(...) a new building card. A tower the map lacks has no bids and
  // places itself by latitude and longitude.
  // top(g, k) adds pixel details: g is landmarks.js's geometry kit, k.Y(m) the drawn height of m real metres up.
  const TOWERS = [];
  window.__towerSpecs = TOWERS;
  const tower = (spec) => TOWERS.push(spec);

  // --- Before city.js builds the map --------------------------------------------------------------------------------
  function mulberry(seed) {
    let f = seed;
    return () => { f |= 0; f = (f + 1831565813) | 0; let w = Math.imul(f ^ (f >>> 15), 1 | f); w = (w + Math.imul(w ^ (w >>> 7), 61 | w)) ^ w; return ((w ^ (w >>> 14)) >>> 0) / 4294967296; };
  }
  const flatRing = (r) => r.flatMap(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100]);
  const pairs = (a) => { const r = []; for (let i = 0; i < a.length; i += 2) r.push([a[i], a[i + 1]]); return r; };
  const placed = []; // what each tower became: {spec, bid, rings, tiers}

  function adjust(data) {
    const B = data.buildings, info = data.binfo;
    // where city.js's facade draws will be once it has drawn for every entry already there
    const draw = mulberry(20261006);
    for (const b of B) { draw(); if ((b[2] ?? 2) === 3) draw(); }
    const byBid = new Map();
    B.forEach((b) => { if (b[0] > 0) { if (!byBid.has(b[5])) byBid.set(b[5], []); byBid.get(b[5]).push(b); } });
    const flatten = (b) => { const r = pairs(b[1]), [x, z] = r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]); b[0] = 0; b[1] = [x, z, x, z, x, z]; b[4] = 0; b.length = Math.min(b.length, 6); };
    const newBid = (name, kind, h, floors) => { info.push([name, kind, h, floors ?? null, 0]); return info.length - 1; };
    for (const spec of TOWERS) {
      try {
        const own = (spec.bids || []).flatMap((id) => byBid.get(id) || []);
        const parts = own.map((b) => ({ ring: pairs(b[1]), h: b[0], bid: b[5] })).sort((p, q) => q.h - p.h);
        const ring = parts[0]?.ring;
        const k = { ring, f: ring && frameOf(ring), parts, at, newBid };
        let bid = spec.bids?.[0];
        if (bid == null) bid = newBid(spec.name, spec.kind, spec.h, spec.floors);
        else info[bid] = [spec.name, spec.kind ?? info[bid][1], spec.h, spec.floors ?? info[bid][3], 0];
        k.bid = bid;
        const tiers = spec.parts(k).filter((t) => t && t.ring && t.ring.length >= 3 && t.to > t.from);
        if (!tiers.length) continue;
        own.forEach(flatten);
        const [px, pz] = centroid(tiers[0].ring);
        for (const t of tiers) {
          const id = t.bid ?? bid, entry = [t.to, flatRing(t.ring), t.facade === 'apartment' ? 1 : 3, 0, t.from, id];
          if (t.facade === 'apartment') { draw(); B.push(entry); continue; }
          // steer the draw: an invisible entry for each draw that would give the wrong facade
          for (let n = 0; n < 200; n++) {
            draw();
            if (DRAW[Math.floor(draw() * DRAW.length)] === t.facade) break;
            B.push([0, [px, pz, px, pz, px, pz], 3, 0, 0, id]);
          }
          B.push(entry);
        }
        placed.push({ spec, bid, tiers, ring: tiers[0].ring, pk: k });
      } catch (e) {
        console.warn('tower', spec.name, e);
      }
    }
  }
  const T0 = window.__terrain;
  if (T0) {
    const load = T0.load;
    T0.load = async (data, K) => { adjust(data); return load(data, K); };
  }

  // --- Details, once the map is built ---------------------------------------------------------------------------------
  async function start() {
    const D = window.__dio, K = window.__terrain?.K, Geo = window.__landmarkGeo;
    if (!K || !Geo || !D?.city) return;
    const { city } = D, T = D.terrain;
    const Color = city.sun.color.constructor;
    const rgb = (hex) => { const c = new Color(hex); return [c.r, c.g, c.b]; };
    const G = new Geo(), items = [];
    for (const p of placed) {
      if (!p.spec.top) continue;
      const base = T?.bref?.[p.bid] ?? 0, from = G.count;
      const k = { ...p.pk, ...p, Y: (m) => base + m * S, rgb, ring: p.ring, f: frameOf(p.ring), K };
      try { p.spec.top(G, k, helpers(G, k)); } catch (e) { console.warn('tower top', p.spec.name, e); continue; }
      items.push({ name: p.spec.name, bid: p.bid, quiet: true, from, to: G.count, gone: false });
    }
    if (!G.count) return;
    const geo = new K.BufferGeometry();
    const pos = new K.BufferAttribute(new Float32Array(G.p), 3);
    geo.setAttribute('position', pos);
    geo.setAttribute('normal', new K.BufferAttribute(new Float32Array(G.n), 3));
    geo.setAttribute('color', new K.BufferAttribute(new Float32Array(G.c), 3));
    geo.computeBoundingSphere();
    const mesh = new K.Mesh(geo, new K.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    mesh.name = 'tower-tops';
    mesh.castShadow = mesh.receiveShadow = true;
    city.scene.add(mesh);
    for (const it of items) it.hide = () => { if (it.gone) return; it.gone = true; pos.array.fill(0, it.from * 3, it.to * 3); pos.needsUpdate = true; city.invalidate?.(); };
    window.__towers = { items, placed };
    city.invalidate?.();
    D.requestRender?.();
  }

  // Pixel-detail helpers for a tower's top, in real metres up (y) and the footprint's frame.
  function helpers(G, k) {
    const { Y } = k;
    const grow = (r, m) => { const c = centroid(r); return r.map(([x, z]) => { const d = Math.hypot(x - c[0], z - c[1]) || 1; return [x + ((x - c[0]) / d) * m, z + ((z - c[1]) / d) * m]; }); };
    return {
      grow,
      // a band round the footprint, standing out m metres, from y0 to y1
      band(r, y0, y1, hex, m = 0.25) { G.walls(flatRing(grow(r, m)), () => Y(y0), () => Y(y1), k.rgb(hex)); },
      // a thin wall following the footprint (a parapet, a crown screen), t thick, inside the edge
      screen(r, y0, y1, hex, t = 0.6) {
        const inner = grow(r, -t), c = k.rgb(hex);
        for (let i = 0; i < r.length; i++) {
          const j = (i + 1) % r.length;
          G.prism([[r[i][0], Y(y0), r[i][1]], [r[j][0], Y(y0), r[j][1]], [inner[j][0], Y(y0), inner[j][1]], [inner[i][0], Y(y0), inner[i][1]]], [0, Y(y1) - Y(y0), 0], c);
        }
      },
      // a slab on top (a roof cap, an overhang)
      slab(r, y0, y1, hex, top = hex) { const c = k.rgb(hex), t = k.rgb(top), [cx, cz] = centroid(r); const ring = r.map(([x, z]) => [x, Y(y0), z]); fan(G, ring, [0, Y(y1) - Y(y0), 0], c, t, [cx, Y(y0), cz]); },
      mast(x, z, y0, y1, w, hex) { G.beam([x, Y(y0), z], [x, Y(y1), z], w, k.rgb(hex)); },
      beam(a, b, w, hex) { G.beam([a[0], Y(a[1]), a[2]], [b[0], Y(b[1]), b[2]], w, k.rgb(hex)); },
      // vertical fins at every `every`th corner of the footprint, standing out m metres
      // a flat panel standing m metres off the face of the footprint that looks most towards a compass bearing
      panel(r, bearing, y0, y1, hex, m = 0.5) {
        const b = (bearing * Math.PI) / 180, want = [Math.sin(b), -Math.cos(b)], c = centroid(r);
        let best = null;
        for (let i = 0; i < r.length; i++) {
          const a = r[i], q = r[(i + 1) % r.length], L = Math.hypot(q[0] - a[0], q[1] - a[1]);
          if (L < 1) continue;
          let nx = (q[1] - a[1]) / L, nz = -(q[0] - a[0]) / L;
          if (nx * ((a[0] + q[0]) / 2 - c[0]) + nz * ((a[1] + q[1]) / 2 - c[1]) < 0) { nx = -nx; nz = -nz; }
          const s = nx * want[0] + nz * want[1];
          if (!best || s > best.s) best = { s, a, q, nx, nz };
        }
        if (!best) return;
        const { a, q, nx, nz } = best, o = (p, d) => [p[0] + nx * d, p[1] + nz * d];
        const ring = [o(a, m), o(q, m), o(q, m + 0.5), o(a, m + 0.5)].map(([x, z]) => [x, Y(y0), z]);
        G.prism(ring, [0, Y(y1) - Y(y0), 0], k.rgb(hex));
      },
      fins(r, y0, y1, hex, every = 1, w = 0.6, m = 0.3) { const g = grow(r, m); g.forEach(([x, z], i) => { if (i % every === 0) G.beam([x, Y(y0), z], [x, Y(y1), z], w, k.rgb(hex)); }); },
    };
  }
  // a prism over a possibly concave ring: walls, and a fan-triangulated cap (fine for the near-convex roofs here)
  function fan(G, ring, off, side, top, c) {
    const n = ring.length, up = ring.map((q) => [q[0] + off[0], q[1] + off[1], q[2] + off[2]]);
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n];
      G.quad(a, b, up[(i + 1) % n], up[i], side, [(a[0] + b[0]) / 2 - c[0], 0, (a[2] + b[2]) / 2 - c[2]]);
    }
    for (let i = 1; i + 1 < n; i++) { G.tri(up[0], up[i], up[i + 1], top, [0, 1, 0]); G.tri(ring[0], ring[i], ring[i + 1], side, [0, -1, 0]); }
  }

  // ================================================================================================================
  // The towers, tallest first. Photos: Wikimedia Commons (towers/photos.md); heights and plans: towers/research.md.
  // Heights are above the ground (CTBUH); Wikipedia's list gives some above sea level, up to 14 m more.
  // ================================================================================================================

  // a frame at a latitude and longitude, its long axis on a compass bearing
  const frameAt = (lat, lon, bearing) => { const [x, z] = at(lat, lon), b = (bearing * Math.PI) / 180; return { x, z, ux: Math.sin(b), uz: -Math.cos(b) }; };
  const dirOf = (bearing) => { const b = (bearing * Math.PI) / 180; return [Math.sin(b), -Math.cos(b)]; };
  // an ellipse whose long sides are sawtoothed: every other point stands out by `tooth` metres
  function sawEllipse(f, L, W, tooth, n = 28) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (2 * Math.PI * i) / n, side = Math.abs(Math.sin(t)) > 0.45 && i % 2 ? tooth : 0;
      pts.push([(L / 2) * Math.cos(t) * (1 + side / (L / 2)), (W / 2 + side) * Math.sin(t)]);
    }
    return local(f, pts);
  }

  // Brisbane Skytower, 222 Margaret St (2019): 269.6 m, 90 floors, the city's tallest. A rounded triangle of blue
  // glass, ringed by thin white bands in its upper two thirds, with a low parapet at the top.
  tower({
    name: 'Brisbane Skytower', kind: 'apartments', h: 269.6, floors: 90, bids: [47784],
    parts: (k) => stack('dark', [0, 267, k.ring]),
    top(g, k, t) {
      for (let y = 96; y < 262; y += 13.6) t.band(k.ring, y, y + 0.7, '#e9eef2');
      t.screen(k.ring, 267, 269.6, '#33506b', 0.5);
    },
  });

  // Brisbane Quarter, 300 George St: three towers the map drew as one building. The One (2021, 261.7 m, 82 floors), a
  // shaft of bright blue glass with a crown 10 m over its top floor; 300 George Street (2019, 182.2 m, 41 floors),
  // offices in dark glass; and the W Brisbane hotel (2018, 126.3 m, 34 floors), dark glass with a white perforated
  // screen on its river end.
  tower({
    name: 'The One', kind: 'apartments', h: 262, floors: 82, bids: [56585],
    parts(k) {
      const [one, george, w] = k.parts;
      const georgeBid = k.newBid('300 George Street', 'office', 182.2, 41), wBid = k.newBid('W Brisbane', 'hotel', 126.3, 34);
      k.w = w.ring;
      return [
        ...stack('office', [0, 252, one.ring]),
        tier(george.ring, 0, 176, 'dark', georgeBid),
        tier(scale(george.ring, 0.9), 176, 182.2, 'dark', georgeBid),
        tier(w.ring, 0, 126.3, 'dark', wBid),
      ];
    },
    top(g, k, t) {
      t.band(k.ring, 130, 132, '#2b4a6a', 0.15);
      t.screen(k.ring, 252, 262, '#5b88b5', 0.5);
      if (k.w) t.panel(k.w, 230, 6, 124, '#f1f1ec', 0.5);
    },
  });

  // 1 William Street (2016): offices to 179.1 m in a fat tower of dark blue glass with bronze fins, rounded at both
  // ends; then a glazed crown sliced off at an angle, high on the inland side and facing the river, to about 217 m;
  // and a needle spire to 259.8 m.
  const HIGH_1WS = dirOf(48);
  const ring1WS = (k) => shape(k.f, 'round', k.f.len * 0.95, k.f.wid * 0.76, { r: k.f.wid * 0.38, n: 5 });
  tower({
    name: '1 William Street', kind: 'office', h: 259.8, floors: 46, bids: [47830],
    parts(k) { const r = ring1WS(k); return [...stack('dark', [0, 179.1, r]), ...slope(r, 179.1, 217, HIGH_1WS, 3, 'dark', 0.15)]; },
    top(g, k, t) {
      const r = ring1WS(k), [x, z] = centroid(r), half = k.f.wid * 0.38;
      t.fins(r, 4, 177, '#8a6446', 2, 0.5, 0.2);
      t.band(r, 177, 179.1, '#a77a4e', 0.3);
      t.mast(x + HIGH_1WS[0] * half * 0.8, z + HIGH_1WS[1] * half * 0.8, 200, 259.8, 0.8, '#c9cdd0');
    },
  });

  // Infinity Tower, 43 Herschel St (2014): 249 m, 81 floors, a rounded column of white bands and blades over dark
  // glass, narrowing gently through its top third to a 12 m crown.
  tower({
    name: 'Infinity', kind: 'apartments', h: 249, floors: 81, bids: [56579],
    parts: (k) => [...stack('white', [0, 180, k.ring]), ...taper(k.ring, 180, 236.5, 1, 0.86, 6, 'white')],
    top(g, k, t) { t.screen(scale(k.ring, 0.86), 236.5, 249, '#f2f2ee', 0.5); },
  });

  // Soleil, 495 Adelaide St (2012): 243 m, a thin blade of dark glass between white frames, stepping in on its long
  // sides towards the top, under an open crown.
  tower({
    name: 'Soleil', kind: 'apartments', h: 243, floors: 79, bids: [56542],
    parts: (k) => stack('dark', [0, 168, k.ring], [168, 212, scale2(k.ring, k.f, 0.88, 0.94)], [212, 232.4, scale2(k.ring, k.f, 0.74, 0.86)]),
    top(g, k, t) { t.screen(scale2(k.ring, k.f, 0.74, 0.86), 232.4, 243, '#3a4651', 0.6); t.fins(k.ring, 4, 168, '#e6e9ec', 1, 0.5, 0.2); },
  });

  // Queen's Wharf (2024), between George St and the river: the Queen's Wharf Residences (231 m, 66 floors, a slim
  // oval of dark glass); Tower 1, the Dorsett and Rosewood hotels (182 m, 45 floors, a rounded lozenge); and the Star
  // Grand hotel's two curved towers (111 m), bronze glass, that make a drum on the river side with the Sky Deck, a
  // 250 m crescent of terraces 100 m up, on top and bridging to the other two. The map had them as 5 m blocks.
  tower({
    name: "Queen's Wharf Residences", kind: 'apartments', h: 231, floors: 66, bids: [47833],
    parts: (k) => stack('dark', [0, 216, k.ring]),
    top(g, k, t) { t.screen(k.ring, 216, 231, '#2f4355', 0.5); },
  });
  tower({
    name: "Queen's Wharf Tower 1", kind: 'hotel', h: 182, floors: 45, bids: [48013],
    parts: (k) => stack('dark', [0, 176, k.ring]),
    top(g, k, t) { t.screen(k.ring, 176, 182, '#2f4355', 0.5); },
  });
  tower({
    name: 'The Star Grand', kind: 'hotel', h: 111, floors: 26, bids: [48008, 48014],
    parts: (k) => k.parts.map((p) => tier(p.ring, 0, 104, 'bronze')),
    top(g, k, t) {
      const rings = k.tiers.map((x) => x.ring);
      for (const r of rings) { t.slab(t.grow(r, 1.2), 104, 106, '#f1f1ec'); t.screen(t.grow(r, 1.2), 106, 109, '#cfd8dc', 0.4); }
      // the Sky Deck's bridges: Tower 1 to the north crescent, between the crescents, and on to the Residences
      const c = (name) => { const p = placed.find((q) => q.spec.name === name); return p && centroid(p.ring); };
      const t1 = c("Queen's Wharf Tower 1"), t4 = c("Queen's Wharf Residences"), [a, b] = rings.map(centroid);
      for (const [p, q] of [[t1, a], [a, b], [b, t4]]) if (p && q) t.beam([p[0], 105, p[1]], [q[0], 105, q[1]], 6, '#e9ecee');
    },
  });

  // Aurora, 420 Queen St (2006): 207 m, 69 floors. White frames and dark glass to its roof at 197 m, under a flat
  // slab that overhangs the top floors like a hat, with a crown to 207 m. (The map drew it twice.)
  tower({
    name: 'Aurora Tower', kind: 'apartments', h: 207, floors: 69, bids: [43888, 56540],
    parts: (k) => stack('apartment', [0, 191, k.ring]).concat(stack('dark', [191, 197, scale(k.ring, 0.94)])),
    top(g, k, t) { t.slab(t.grow(k.ring, 2.2), 197, 199.5, '#f1f1ec'); t.screen(scale(k.ring, 0.6), 199.5, 207, '#d8dcdf', 0.5); },
  });

  // Riparian Plaza, 71 Eagle St (Harry Seidler, 2005): 200 m to the roof, 53 floors, set at 45° to the river. A finned
  // car park base, a dark recessed transfer floor, white offices with long grey-tinted windows, apartments with
  // curved balconies at the top, and a 50 m mast to 249.8 m.
  tower({
    name: 'Riparian Plaza', kind: 'commercial', h: 200, floors: 53, bids: [43845],
    parts: (k) => stack('white', [0, 58, k.ring]).concat(stack('dark', [58, 63, scale(k.ring, 0.9)]), stack('white', [63, 150, scale(k.ring, 0.97)]),
      stack('apartment', [150, 188, scale(k.ring, 0.97)]), stack('white', [188, 200, scale(k.ring, 0.82)])),
    top(g, k, t) {
      t.fins(k.ring, 2, 56, '#d9d6cf', 1, 0.6, 0.3);
      for (let y = 152; y < 188; y += 6.2) t.band(scale(k.ring, 0.97), y, y + 0.5, '#f4f4ef', 1.2);
      const [x, z] = centroid(k.ring);
      t.mast(x, z, 200, 249.8, 1.0, '#c9cdd0');
    },
  });

  // One One One Eagle Street (2012): 194.7 m. Branching steel columns behind clear glass, narrowing at the top to an
  // open canopy.
  tower({
    name: 'One One One Eagle Street', kind: 'office', h: 194.7, floors: 54, bids: [43847],
    parts: (k) => [...stack('office', [0, 170, k.ring]), ...taper(k.ring, 170, 190, 1, 0.8, 5, 'office')],
    top(g, k, t) { t.screen(scale(k.ring, 0.8), 190, 194.7, '#9fc4da', 0.5); t.fins(k.ring, 4, 170, '#cfe3ee', 1, 0.4, 0.15); },
  });

  // 443 Queen Street (WOHA with Architectus, 2023): 184 m, Brisbane's subtropical tower: clusters of screened
  // pavilions rising as fluted shafts to pinnacles, green with planted lift lobbies, on a podium of stepped white
  // strata by the river beside Customs House. Not in the map, or in OpenStreetMap.
  tower({
    name: '443 Queen Street', kind: 'apartments', h: 184, floors: 47, bids: [],
    parts(k) {
      const f = frameAt(-27.46497, 153.031491, 15), box = (u0, u1, v0, v1) => local(f, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      k.f443 = f;
      const shafts = [[-23, -11, -11, 10, 160], [-12, 1, -14, 14, 184], [0, 13, -14, 14, 178], [12, 23, -11, 11, 168]];
      return [
        tier(box(-26, 26, -21, 21), 0, 26, 'white'),
        ...shafts.flatMap(([u0, u1, v0, v1, h]) => [
          tier(box(u0, u1, v0, v1), 26, h - 6, 'dark'),
          tier(box(u0 + 2, u1 - 2, v0 + 3, v1 - 3), h - 6, h, 'dark'),
        ]),
      ];
    },
    top(g, k, t) {
      const r0 = k.tiers[0].ring;
      for (const y of [6, 12, 18, 24]) t.band(r0, y, y + 1.2, '#4d8a3b', 0.8);
      for (const tr of k.tiers.slice(1)) if (tr.from === 26) for (let y = 40; y < tr.to - 8; y += 21) t.band(tr.ring, y, y + 1.6, '#4d8a3b', 0.7);
    },
  });

  // Central Plaza 1, 345 Queen St (Kisho Kurokawa, 1988): 174 m. White with blue glass, a chamfered square rising to a
  // crystalline crown of gables.
  tower({
    name: 'Central Plaza 1', kind: 'office', h: 174, floors: 44, bids: [43868],
    parts: (k) => [...stack('white', [0, 156, k.ring]), ...taper(k.ring, 156, 174, 0.92, 0.3, 4.5, 'white')],
    top(g, k, t) { t.fins(k.ring, 1, 156, '#5b86a8', 1, 0.8, 0.2); },
  });

  // 205 North Quay (Hassell and REX, 2024): 172 m (the approved height; CTBUH lists 150.8 m from before it was
  // finished). A pure 74 by 26 m slab of dark glass along Herschel St, screened in copper-coloured ovals and fins,
  // under a roof lid. Not in the map, or in OpenStreetMap.
  tower({
    name: '205 North Quay', kind: 'office', h: 172, floors: 37, bids: [],
    parts: (k) => { k.f205 = frameAt(-27.46789, 153.01868, 48); return stack('dark', [0, 166, shape(k.f205, 'rect', 74, 26)]); },
    top(g, k, t) {
      const r = k.tiers[0].ring;
      t.fins(r, 0, 166, '#c9864f', 1, 1.0, 0.3);
      t.slab(t.grow(r, 1.0), 168.5, 172, '#b8794a');
      for (const c of r) t.beam([c[0], 166, c[1]], [c[0], 168.5, c[1]], 0.6, '#b8794a');
      for (let y = 20; y < 166; y += 24) t.band(r, y, y + 0.8, '#c9864f', 0.25);
    },
  });

  // 275 George Street (2009): offices to 132 m, a plant crown to 142 m and a spire to 171 m.
  tower({
    name: '275 George Street', kind: 'office', h: 171, floors: 32, bids: [47978],
    parts: (k) => stack('office', [0, 132, k.ring]).concat(stack('dark', [132, 142, scale(k.ring, 0.85)])),
    top(g, k, t) { const [x, z] = centroid(k.ring); t.mast(x, z, 142, 171, 0.9, '#d8dcdf'); },
  });

  // Waterfront Place, 1 Eagle St (1989): 162 m, an ellipse of blue glass with sawtooth long faces (ten corner offices
  // a floor) under three stepped tiers. The map had only the tiers, standing on the ground as thin slivers.
  tower({
    name: 'Waterfront Place', kind: 'office', h: 162, floors: 40, bids: [56539],
    parts(k) {
      const f = frameAt(-27.4703, 153.03052, 11);
      return [tier(sawEllipse(f, 77, 39, 2.5), 0, 140, 'dark'), tier(shape(f, 'ellipse', 62, 30), 140, 146, 'dark'),
        tier(shape(f, 'ellipse', 54, 22), 146, 154, 'dark'), tier(shape(f, 'ellipse', 45, 14), 154, 162, 'dark')];
    },
  });

  // 360 Queen Street (Blight Rayner, 2025): 157 m of glass on a carved base, with a roof garden.
  tower({
    name: '360 Queen Street', kind: 'office', h: 157, floors: 37, bids: [43863],
    parts: (k) => stack('office', [0, 154, scale(k.ring, 0.8)]),
    top(g, k, t) { t.slab(scale(k.ring, 0.8), 154, 155.5, '#cfd5d8', '#4d8a3b'); },
  });

  // 480 Queen Street (BVN with Donovan Hill, 2016): 153 m, a broad nine-storey block with a narrower glass tower on it.
  tower({
    name: '480 Queen Street', kind: 'office', h: 153, floors: 34, bids: [43891],
    parts(k) { const c = centroid(k.ring), f = { ...frameOf(k.ring), x: c[0], z: c[1] }; return stack('office', [0, 45, k.ring], [45, 153, shape(f, 'rect', 46, 37)]); },
  });

  // Riverside Centre, 123 Eagle St (Harry Seidler, 1986): a rounded triangle in pale granite with long bands of window.
  tower({ name: 'Riverside Centre', kind: 'office', h: 142, floors: 40, bids: [43853], parts: (k) => stack('white', [0, 142, k.ring]) });
  // 180 Brisbane, 180 Ann St (2015): bright blue glass.
  tower({ name: '180 Brisbane', kind: 'office', h: 152, floors: 34, bids: [43749], parts: (k) => stack('office', [0, 152, k.ring]) });
  // Skyline Apartments, 30 Macrossan St (2007): the map drew it twice.
  tower({ name: 'Skyline Apartments', kind: 'apartments', h: 150, floors: 48, bids: [46470, 56543], parts: (k) => stack('apartment', [0, 150, k.ring]) });

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.city) { clearInterval(wait); start(); }
  }, 200);

  Object.assign(window.__towerKit = {}, { at, centroid, frameOf, local, toLocal, scale, scale2, clip, shape, tier, stack, taper, slope, tower });
})();
