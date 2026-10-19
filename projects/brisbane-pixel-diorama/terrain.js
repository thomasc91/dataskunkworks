// Terrain for the Brisbane pixel diorama: the ground follows Queensland's bare-earth elevation model, so Mt
// Coot-tha and the inner-city hills rise out of the map. terrain.json and terrain.bin hold a 10 m height grid
// over the model's circle (made by terrain/build_terrain.py); heights are drawn 1.6 times taller, like the
// buildings, so the whole model shares one vertical scale.
//
// city.js calls window.__terrain.load() once the city data is in, then asks it where things sit: the ground
// mesh, water at its own level, roads draped on the ground, building bases, bridge decks, trees, cars,
// labels, plane shadows and the camera's target height. If the files are missing (the published artifact) or
// the page has ?terrain=off, load() returns null and city.js draws the flat map exactly as before.
(() => {
  const T = (window.__terrain = { on: false, load: async () => null });
  if (new URLSearchParams(location.search).get('terrain') === 'off') return;
  const files = Promise.all([
    fetch('terrain.json').then((r) => (r.ok ? r.json() : null)),
    fetch('terrain.bin').then((r) => (r.ok ? r.arrayBuffer() : null)),
    new URLSearchParams(location.search).get('bridges') === 'off' ? null // ?bridges=off: the plain decks
      : fetch('bridges.json').then((r) => (r.ok ? r.json() : null), () => null), // the hand-built bridges (bridges.js)
  ]).catch(() => [null, null, null]);

  T.load = async (data, K) => {
    const [meta, buf, bridges] = await files;
    if (!meta || !buf) return null;
    const t0 = performance.now();
    if (bridges) window.__bridgeModels?.adjust?.(data); // fixes to the data's hand-built bridges (bridges.js)
    const api = build(data, K, meta, buf, bridges);
    // The elevation data's licence (CC BY-SA) asks for its credit wherever it's shown.
    const foot = document.querySelector('footer');
    if (foot && meta.source?.credit) {
      const full = document.createElement('span'), short = document.createElement('span');
      full.className = 'long';
      full.textContent = ` · Elevation: ${meta.source.credit.replace(/^Includes material /, 'includes material ')}`;
      short.className = 'short';
      short.textContent = ' · Elevation © State of Queensland and others';
      foot.append(full, short);
      const css = document.createElement('style'); // phones show the short credit, where the footer drops its long parts
      css.textContent = 'footer .short { display: none; } @media (max-width: 640px) { footer .short { display: inline; } }';
      document.head.append(css);
    }
    T.on = true;
    T.api = api;
    T.buildMs = Math.round(performance.now() - t0);
    return api;
  };

  const WATER_Y = 0.6; // the renderer draws water this far above its level (and the ferries sit on it)
  const BASE_Y = -60; // bottom of the model's sides, as the flat disc had
  const ROAD_DEV = 0.1; // drawn metres a road may stray from the ground before it is split
  const MASK = 4096; // texels across the park mask
  const ROCK = '#b88c6c'; // bare cliff faces: Brisbane tuff, the Kangaroo Point cliffs' stone

  function build(data, K, meta, buf, bridgeList) {
    const S = meta.scale;
    const { x0, z0, step: d, nx, nz } = meta.grid;
    const N = nx * nz;
    const raw = new Int16Array(buf, 0, N);
    const widx = new Uint8Array(buf, N * 2, N);
    const levels = meta.waterLevels;
    const Y = new Float32Array(N); // the ground as drawn (carved under water)
    const SURF = new Float32Array(N); // the surface: water level on water, else the ground
    for (let k = 0; k < N; k++) {
      Y[k] = raw[k] * 0.1 * S;
      SURF[k] = widx[k] ? levels[widx[k] - 1] * S : Y[k];
    }
    const [cx, cz, R] = data.circle;

    // Heights at any point, interpolated on the same two triangles per cell as the ground mesh, so whatever is
    // placed with h() sits exactly on the drawn ground.
    function sample(G, x, z) {
      let fx = (x - x0) / d, fz = (z - z0) / d;
      fx = fx < 0 ? 0 : fx > nx - 1.0001 ? nx - 1.0001 : fx;
      fz = fz < 0 ? 0 : fz > nz - 1.0001 ? nz - 1.0001 : fz;
      const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * nx + i;
      const a = G[k], b = G[k + 1], c = G[k + nx];
      if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
      const e = G[k + nx + 1];
      return e + (c - e) * (1 - u) + (b - e) * (1 - v);
    }
    const h = (x, z) => sample(Y, x, z);
    const hs = (x, z) => sample(SURF, x, z);
    function water(x, z) {
      const i = Math.round((x - x0) / d), j = Math.round((z - z0) / d);
      return i >= 0 && j >= 0 && i < nx && j < nz && widx[j * nx + i] > 0;
    }
    // Inside a water body's outline, exactly: the grid settles most points, and points in a cell that straddles
    // a shore are tested against the outlines of the water at its corners (even-odd over all their rings).
    const wbox = (data.water || []).map((poly) => {
      let x0b = Infinity, z0b = Infinity, x1b = -Infinity, z1b = -Infinity;
      for (let k = 0; k < poly[0].length; k += 2) {
        x0b = Math.min(x0b, poly[0][k]), x1b = Math.max(x1b, poly[0][k]);
        z0b = Math.min(z0b, poly[0][k + 1]), z1b = Math.max(z1b, poly[0][k + 1]);
      }
      return [x0b, z0b, x1b, z1b];
    });
    function inPoly(p, x, z) {
      const b = wbox[p];
      if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) return false;
      let c = false;
      for (const r of data.water[p]) {
        const n = r.length >> 1;
        for (let a = 0, q = n - 1; a < n; q = a++) {
          const za = r[2 * a + 1], zq = r[2 * q + 1];
          if (za > z !== zq > z && x < ((r[2 * q] - r[2 * a]) * (z - za)) / (zq - za) + r[2 * a]) c = !c;
        }
      }
      return c;
    }
    function inWater(x, z) {
      const fx = (x - x0) / d, fz = (z - z0) / d;
      const i = Math.floor(fx), j = Math.floor(fz);
      if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return false;
      const k = j * nx + i, ws = [widx[k], widx[k + 1], widx[k + nx], widx[k + nx + 1]];
      if (ws.every((w) => w === 0)) return false;
      if (ws.every((w) => w > 0) && ws.every((w) => w === ws[0])) return true;
      return [...new Set(ws)].some((w) => w > 0 && inPoly(w - 1, x, z));
    }
    // Trees: none stand in the water, and none sit below its surface on the drop at a riverbank.
    function treeY(x, z) {
      return Math.max(hs(x, z), WATER_Y + 0.3);
    }
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < N; k++) (lo = Math.min(lo, Y[k])), (hi = Math.max(hi, SURF[k]));

    // --- The ground: a mesh on the grid, clipped to the circle, with the cut sides down to the base -------
    let mesh = null;
    function ground(city) {
      const vid = new Int32Array(N).fill(-1);
      const P = [], NRM = [], TOP = [], STEEP = [], IDX = [];
      // How steep the ground is at a node: its steepest step to a neighbour, as drawn (rise over run).
      function steep(k) {
        const i = k % nx, j = (k / nx) | 0, y = Y[k];
        let m = 0;
        if (i > 0) m = Math.max(m, Math.abs(Y[k - 1] - y));
        if (i < nx - 1) m = Math.max(m, Math.abs(Y[k + 1] - y));
        if (j > 0) m = Math.max(m, Math.abs(Y[k - nx] - y));
        if (j < nz - 1) m = Math.max(m, Math.abs(Y[k + nx] - y));
        return m / d;
      }
      const inside = (x, z) => (x - cx) * (x - cx) + (z - cz) * (z - cz) <= R * R;
      function normal(i, j) {
        const k = j * nx + i;
        const l = Y[i > 0 ? k - 1 : k], r = Y[i < nx - 1 ? k + 1 : k];
        const u = Y[j > 0 ? k - nx : k], w = Y[j < nz - 1 ? k + nx : k];
        const gx = (r - l) / ((i > 0 && i < nx - 1 ? 2 : 1) * d), gz = (w - u) / ((j > 0 && j < nz - 1 ? 2 : 1) * d);
        const n = Math.hypot(gx, 1, gz);
        return [-gx / n, 1 / n, -gz / n];
      }
      const node = (k) => {
        const i = k % nx, j = (k / nx) | 0;
        return { k, x: x0 + i * d, y: Y[k], z: z0 + j * d, n: normal(i, j), s: widx[k] ? 0 : steep(k) };
      };
      function vert(p) {
        if (p.k != null && vid[p.k] >= 0) return vid[p.k];
        const id = P.length / 3;
        P.push(p.x, p.y, p.z), NRM.push(p.n[0], p.n[1], p.n[2]), TOP.push(255), STEEP.push(p.s);
        if (p.k != null) vid[p.k] = id;
        return id;
      }
      // Where an edge from an inside point a to an outside point b crosses the circle, on the triangle's plane.
      function cut(a, b) {
        const fx = a.x - cx, fz = a.z - cz, dx = b.x - a.x, dz = b.z - a.z;
        const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - R * R;
        const t = (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
        const n = [0, 1, 2].map((q) => a.n[q] + (b.n[q] - a.n[q]) * t), l = Math.hypot(...n) || 1;
        return { x: a.x + dx * t, y: a.y + (b.y - a.y) * t, z: a.z + dz * t, n: n.map((q) => q / l), s: a.s + (b.s - a.s) * t, cut: true };
      }
      const rim = [];
      function tri(ka, kb, kc) {
        const v = [node(ka), node(kb), node(kc)];
        const ins = v.map((p) => inside(p.x, p.z));
        const m = ins.filter(Boolean).length;
        if (m === 3) return IDX.push(vert(v[0]), vert(v[1]), vert(v[2]));
        if (m === 0) return;
        const poly = [];
        for (let e = 0; e < 3; e++) {
          const a = v[e], b = v[(e + 1) % 3];
          if (ins[e]) poly.push(a);
          if (ins[e] !== ins[(e + 1) % 3]) poly.push(ins[e] ? cut(a, b) : cut(b, a));
        }
        const ids = poly.map(vert);
        for (let q = 1; q + 1 < ids.length; q++) IDX.push(ids[0], ids[q], ids[q + 1]);
        for (let q = 0; q < poly.length; q++) {
          const a = poly[q], b = poly[(q + 1) % poly.length];
          if (a.cut && b.cut) rim.push(a, b);
        }
      }
      const i0 = Math.max(0, Math.floor((cx - R - x0) / d) - 1), i1 = Math.min(nx - 2, Math.ceil((cx + R - x0) / d) + 1);
      const j0 = Math.max(0, Math.floor((cz - R - z0) / d) - 1), j1 = Math.min(nz - 2, Math.ceil((cz + R - z0) / d) + 1);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const k = j * nx + i;
          tri(k, k + nx, k + 1);
          tri(k + 1, k + nx, k + nx + 1);
        }
      // The sides: a wall under each rim chord, facing out, down to the base.
      for (let q = 0; q < rim.length; q += 2) {
        let a = rim[q], b = rim[q + 1];
        const mx = (a.x + b.x) / 2 - cx, mz = (a.z + b.z) / 2 - cz;
        if ((b.x - a.x) * mz - (b.z - a.z) * mx > 0) [a, b] = [b, a]; // wind so the wall faces outward
        const base = P.length / 3;
        for (const [p, y] of [[a, a.y], [b, b.y], [b, BASE_Y], [a, BASE_Y]]) {
          const rx = p.x - cx, rz = p.z - cz, l = Math.hypot(rx, rz) || 1;
          P.push(p.x, y, p.z), NRM.push(rx / l, 0, rz / l), TOP.push(0), STEEP.push(0);
        }
        IDX.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      const geo = new K.BufferGeometry();
      geo.setAttribute('position', new K.BufferAttribute(new Float32Array(P), 3));
      geo.setAttribute('normal', new K.BufferAttribute(new Float32Array(NRM), 3));
      geo.setAttribute('aTop', new K.BufferAttribute(new Uint8Array(TOP), 1, true));
      geo.setAttribute('aSteep', new K.BufferAttribute(Uint8Array.from(STEEP, (v) => Math.min(255, Math.round(v * 50))), 1, true));
      geo.setIndex(new K.BufferAttribute(new Uint32Array(IDX), 1));
      geo.computeBoundingSphere();

      // Parks and bush as a mask on the ground (they can't be flat shapes on a hill): drawn once into a
      // texture, sampled with a threshold so their edges stay crisp.
      const W = (nx - 1) * d, H = (nz - 1) * d;
      const cv = document.createElement('canvas');
      cv.width = cv.height = MASK;
      const g2 = cv.getContext('2d', { willReadFrequently: true });
      g2.setTransform(MASK / W, 0, 0, MASK / H, (-x0 * MASK) / W, (-z0 * MASK) / H);
      g2.fillStyle = '#fff';
      for (const poly of data.green || []) {
        g2.beginPath();
        for (const ring of poly) {
          g2.moveTo(ring[0], ring[1]);
          for (let k = 2; k < ring.length; k += 2) g2.lineTo(ring[k], ring[k + 1]);
          g2.closePath();
        }
        g2.fill('evenodd');
      }
      const img = g2.getImageData(0, 0, MASK, MASK).data, px = new Uint8Array(MASK * MASK);
      for (let k = 0; k < px.length; k++) px[k] = img[k * 4];
      cv.width = cv.height = 1;
      // DataTexture(data, w, h, RedFormat, UnsignedByteType, mapping, ClampToEdge x2, Linear x2)
      const tex = new K.DataTexture(px, MASK, MASK, 1028, 1009, undefined, 1001, 1001, 1006, 1006);
      tex.needsUpdate = true;
      api.maskTex = tex;

      const mat = city.mats.ground;
      const rock = new city.mats.ground.color.constructor(ROCK);
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, {
          uTMask: { value: tex },
          uTGreen: { value: city.mats.green.color },
          uTRock: { value: rock },
          uTOrigin: { value: new K.Vector2(x0, z0) },
          uTSize: { value: new K.Vector2(W, H) },
        });
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aTop; attribute float aSteep; uniform vec2 uTOrigin; uniform vec2 uTSize; varying vec2 vTUv; varying float vTTop; varying float vTSteep;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTUv = (position.xz - uTOrigin) / uTSize; vTTop = aTop; vTSteep = aSteep * 5.1;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D uTMask; uniform vec3 uTGreen; uniform vec3 uTRock; varying vec2 vTUv; varying float vTTop; varying float vTSteep;')
          .replace('#include <color_fragment>', [
            '#include <color_fragment>',
            'diffuseColor.rgb = mix(diffuseColor.rgb, uTGreen, smoothstep(0.4, 0.6, texture2D(uTMask, vTUv).r) * vTTop);',
            // Ground next to a step steeper than about 56 degrees as drawn (the cliffs, the quarry) shows bare rock.
            'diffuseColor.rgb = mix(diffuseColor.rgb, uTRock, smoothstep(1.3, 1.7, vTSteep) * vTTop);',
          ].join('\n'));
      };
      mat.needsUpdate = true;
      mesh = new K.Mesh(geo, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      api.mesh = mesh;
      api.stats.groundTris = IDX.length / 3;
      return mesh;
    }

    // --- Water: each body flat at its own level (the river and tidal creeks at sea level) --------------
    function waterMesh(city) {
      const pos = [], idx = [];
      (data.water || []).forEach((poly, p) => {
        const y = (levels[p] ?? 0) * S + WATER_Y;
        const vec = (ring) => {
          const a = [];
          for (let k = 0; k < ring.length; k += 2) a.push(new K.Vector2(ring[k], ring[k + 1]));
          return a;
        };
        const contour = vec(poly[0]), holes = poly.slice(1).map(vec);
        const faces = K.ShapeUtils.triangulateShape(contour, holes); // drops repeated end points in place
        const base = pos.length / 3, all = contour.concat(...holes);
        for (const v of all) pos.push(v.x, y, v.y);
        for (const [a, b, c] of faces) {
          const A = all[a], B = all[b], C = all[c];
          const up = (B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y) > 0; // faces +y, seen from above
          idx.push(base + a, base + (up ? b : c), base + (up ? c : b));
        }
      });
      const geo = new K.BufferGeometry();
      geo.setAttribute('position', new K.BufferAttribute(new Float32Array(pos), 3));
      const nor = new Float32Array(pos.length);
      for (let k = 1; k < nor.length; k += 3) nor[k] = 1;
      geo.setAttribute('normal', new K.BufferAttribute(nor, 3));
      geo.setIndex(new K.BufferAttribute(new Uint32Array(idx), 1));
      city.mats.water.side = K.DoubleSide;
      const m = new K.Mesh(geo, city.mats.water);
      m.receiveShadow = true;
      city.scene.add(m);
      return m;
    }

    // --- Roads: each segment split where the ground bends, every corner on the ground ----------------------
    function splits(ax, az, bx, bz, L) {
      const ts = [0];
      const at = (t) => h(ax + (bx - ax) * t, az + (bz - az) * t);
      (function rec(t0, h0, t1, h1, depth) {
        const len = (t1 - t0) * L;
        if (len > 2.5 && depth < 14) {
          let bend = len > 20;
          for (const f of [0.25, 0.5, 0.75]) {
            if (bend) break;
            bend = Math.abs(at(t0 + (t1 - t0) * f) - (h0 + (h1 - h0) * f)) > ROAD_DEV;
          }
          if (bend) {
            const tm = (t0 + t1) / 2, hm = at(tm);
            rec(t0, h0, tm, hm, depth + 1);
            rec(tm, hm, t1, h1, depth + 1);
            return;
          }
        }
        ts.push(t1);
      })(0, at(0), 1, at(1), 0);
      return ts;
    }
    function roads(list) {
      const out = [];
      for (const [w, p] of list) {
        for (let e = 0; e + 3 < p.length; e += 2) {
          const ax = p[e], az = p[e + 1], bx = p[e + 2], bz = p[e + 3];
          const vx = bx - ax, vz = bz - az, L = Math.hypot(vx, vz) || 1;
          const ox = ((-vz / L) * w) / 2, oz = ((vx / L) * w) / 2;
          const ts = splits(ax, az, bx, bz, L);
          for (let q = 0; q + 1 < ts.length; q++) {
            const sx = ax + vx * ts[q], sz = az + vz * ts[q], ex = ax + vx * ts[q + 1], ez = az + vz * ts[q + 1];
            const c = [[sx + ox, sz + oz], [ex + ox, ez + oz], [ex - ox, ez - oz], [sx - ox, sz - oz]].map(([x, z]) => [x, h(x, z), z]);
            for (const k of [0, 1, 2, 0, 2, 3]) out.push(c[k][0], c[k][1], c[k][2]);
          }
        }
      }
      api.stats.roadQuads = out.length / 18;
      return new Float32Array(out);
    }

    // --- Buildings: each one stands on the ground at its footprint's mean height; its walls run down to the
    // lowest ground under it, so a house on a slope gets a taller downhill side, like a Queenslander on stumps.
    const bref = [];
    {
      const sum = [], cnt = [];
      (data.buildings || []).forEach((b, w) => {
        const id = b[5] ?? w, ring = b[1];
        for (let k = 0; k < ring.length; k += 2) {
          sum[id] = (sum[id] || 0) + hs(ring[k], ring[k + 1]);
          cnt[id] = (cnt[id] || 0) + 1;
        }
      });
      for (let id = 0; id < sum.length; id++) bref[id] = cnt[id] ? sum[id] / cnt[id] : 0;
    }
    function bmin(ring) {
      let m = Infinity, sx = 0, sz = 0;
      const n = ring.length >> 1;
      for (let k = 0; k < n; k++) {
        const x = ring[2 * k], z = ring[2 * k + 1], j = (k + 1) % n;
        m = Math.min(m, h(x, z), h((x + ring[2 * j]) / 2, (z + ring[2 * j + 1]) / 2));
        (sx += x), (sz += z);
      }
      return Math.min(m, h(sx / n, sz / n));
    }

    // --- Bridges: a deck runs from the ground at one end to the ground at the other. Over the river its
    // height is the model's own (metres above the water, as in the flat map); over land it rises that much
    // above the line between its ends.
    const SX = [], SZ = [], SF = [], SN = [], cells = new Map();
    const cellKey = (x, z) => Math.floor(x / 16) * 100000 + Math.floor(z / 16);
    // The hand-built river bridges (bridges.js, from bridges.json) claim their ways, known by their end points:
    // the plain deck and piers are left out for them, and a model can set its real deck height.
    const MODELS = window.__bridgeModels;
    const claimed = new Map(), modelled = MODELS ? bridgeList?.bridges || [] : [];
    const wayKey = (x0, z0, x1, z1) => `${x0},${z0},${x1},${z1}`;
    for (const b of modelled) {
      b.parts = [];
      for (const i of b.ids) {
        const p = data.bridges[i]?.[3];
        if (p) claimed.set(wayKey(p[0], p[1], p[p.length - 2], p[p.length - 1]), { b, way: i, width: data.bridges[i][0] });
      }
    }
    function deck(P, Sc, flat, Tp) {
      const n = P.length, F = Sc[n - 1] || 1;
      const cl = claimed.get(wayKey(P[0][0], P[0][1], P[n - 1][0], P[n - 1][1]));
      const real = cl && MODELS.models[cl.b.slug]?.deck; // metres above the river at mid-span
      const Tm = real && Tp > 0 ? real * S : Tp; // the deck height used; the flat ramp keeps its shape
      const Ha = hs(P[0][0], P[0][1]), Hb = hs(P[n - 1][0], P[n - 1][1]);
      let river = false;
      for (let i = 0; i < n && Tp > 0 && !river; i++) river = flat(Sc[i]) >= 0.3 * Tp && water(P[i][0], P[i][1]);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const c = Ha + ((Hb - Ha) * Sc[i]) / F, f = flat(Sc[i]), r = Tp > 0 ? f / Tp : 0;
        out[i] = river ? c + Math.max(Tm - c, 0) * r : c + Tm * r;
        const key = cellKey(P[i][0], P[i][1]);
        let list = cells.get(key);
        if (!list) cells.set(key, (list = []));
        list.push(SX.length);
        SX.push(P[i][0]), SZ.push(P[i][1]), SF.push(f), SN.push(out[i]);
      }
      api.stats.bridges++;
      if (river) api.stats.riverBridges++;
      if (cl) {
        out.skip = true;
        cl.b.parts.push({ way: cl.way, width: cl.width, P, S: Sc, deck: out, ramp: Sc.map((s) => (Tp > 0 ? flat(s) / Tp : 0)) });
      }
      return out;
    }
    // The bridge sample nearest a point with about the same flat deck height (so a road under a bridge
    // doesn't pick up the deck above it).
    function nearestDeck(x, z, f) {
      let best = -1, bd = 14 * 14;
      const gx = Math.floor(x / 16), gz = Math.floor(z / 16);
      for (let a = gx - 1; a <= gx + 1; a++)
        for (let b = gz - 1; b <= gz + 1; b++)
          for (const s of cells.get(a * 100000 + b) || []) {
            const dd = (SX[s] - x) ** 2 + (SZ[s] - z) ** 2;
            if (dd < bd && Math.abs(SF[s] - f) <= 2) (bd = dd), (best = s);
          }
      return best;
    }

    // --- Traffic: streets split so the cars follow the ground; on bridges they follow the new decks ---------
    function densify(edges) {
      return edges.map((e) => {
        const kind = e[0], pts = e[6], dk = e[7];
        if (kind === 1) return e;
        const P = [pts[0], pts[1]], D = dk ? [dk[0]] : null;
        for (let k = 0; k + 3 < pts.length; k += 2) {
          const ax = pts[k], az = pts[k + 1], bx = pts[k + 2], bz = pts[k + 3], L = Math.hypot(bx - ax, bz - az);
          let ts;
          if (kind === 2) {
            const n = Math.max(1, Math.ceil(L / 10));
            ts = Array.from({ length: n + 1 }, (_, q) => q / n);
          } else ts = splits(ax, az, bx, bz, L || 1);
          for (let q = 1; q < ts.length; q++) {
            const t = ts[q];
            P.push(ax + (bx - ax) * t, az + (bz - az) * t);
            if (D) D.push(dk[k >> 1] + (dk[(k >> 1) + 1] - dk[k >> 1]) * t);
          }
        }
        const out = e.slice();
        out[6] = P;
        if (D) out[7] = D;
        return out;
      });
    }
    function carY(kind, dk, x, z) {
      if (kind === 2 && dk != null) {
        const f = dk * S, s = nearestDeck(x, z, f);
        return s >= 0 ? f + (SN[s] - SF[s]) + 0.82 : hs(x, z) + f + 0.82;
      }
      return (kind === 1 ? hs(x, z) : h(x, z)) + 0.65;
    }

    // The Kangaroo Point Bridge has its own line in the data (kpb) rather than bridge ways: when its model is
    // here, its deck is worked out the way city.js would (ramps of 45 and 70 m), and city.js leaves it out.
    const kpbModel = modelled.find((b) => b.line === 'kpb');
    function kpbPart() {
      const kp = data.kpb, line = kp.line, P = [];
      for (let k = 0; k + 3 < line.length; k += 2) {
        const n = Math.max(1, Math.ceil(Math.hypot(line[k + 2] - line[k], line[k + 3] - line[k + 1]) / 12));
        for (let q = 0; q < n; q++) P.push([line[k] + ((line[k + 2] - line[k]) * q) / n, line[k + 1] + ((line[k + 3] - line[k + 1]) * q) / n]);
      }
      P.push([line[line.length - 2], line[line.length - 1]]);
      const Sc = [0];
      for (let i = 1; i < P.length; i++) Sc.push(Sc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      const F = Sc[Sc.length - 1], A = Math.min(45, F * 0.35), B = Math.min(70, F * 0.35);
      const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
      const real = MODELS.models['kangaroo-point']?.deck ?? kp.deck, Tm = real * S;
      const Ha = hs(...P[0]), Hb = hs(...P[P.length - 1]);
      const deckY = new Float32Array(P.length), ramp = [];
      for (let i = 0; i < P.length; i++) {
        const r = sm(Sc[i] / A) * sm((F - Sc[i]) / B), c = Ha + ((Hb - Ha) * Sc[i]) / F;
        deckY[i] = c + Math.max(Tm - c, 0) * r;
        ramp.push(r);
      }
      kpbModel.parts.push({ way: -1, width: kpbModel.width, P, S: Sc, deck: deckY, ramp });
    }

    // The hand-built bridges, once every deck is known (bridges.js draws them into one mesh).
    function models(city) {
      if (kpbModel && data.kpb) kpbPart();
      const list = modelled.filter((b) => b.parts.length);
      if (!list.length) return;
      const geo = MODELS.build(list, { K, S, h, hs, inWater, isWater: water, WATER_Y });
      if (!geo) return;
      const m = new K.Mesh(geo, new K.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: K.DoubleSide }));
      m.castShadow = m.receiveShadow = true;
      m.name = 'bridge-models';
      city.scene.add(m);
      api.bridgeMesh = m;
      api.stats.bridgeModels = list.map((b) => b.slug);
    }

    // --- Camera and pointer ------------------------------------------------------------------------------
    // The height the camera orbits around: the ground near the middle of the view, averaged over a patch that
    // grows with the view, so zooming in on Mt Coot-tha keeps the summit on screen without the view jolting.
    function hc(x, z, span) {
      const r = Math.min(1500, Math.max(30, span * 0.2));
      let s = hs(x, z) * 2, n = 2;
      for (let a = 0; a < 12; a++) {
        const t = (a / 12) * Math.PI * 2;
        for (const f of [0.5, 1]) (s += hs(x + Math.cos(t) * r * f, z + Math.sin(t) * r * f)), n++;
      }
      return s / n;
    }
    // Where a view ray first meets the ground or water (for zooming at the cursor).
    function ray(o, v) {
      if (v.y > -1e-6) return [o.x, o.z];
      const t0 = (hi + 5 - o.y) / v.y, t1 = (lo - 5 - o.y) / v.y;
      const gap = (t) => o.y + v.y * t - hs(o.x + v.x * t, o.z + v.z * t);
      const steps = Math.max(8, Math.ceil((Math.hypot(v.x, v.z) * (t1 - t0)) / 4));
      let prev = t0;
      for (let q = 1; q <= steps; q++) {
        const t = t0 + ((t1 - t0) * q) / steps;
        if (gap(t) <= 0) {
          let a = prev, b = t;
          for (let it = 0; it < 24; it++) {
            const m = (a + b) / 2;
            gap(m) > 0 ? (a = m) : (b = m);
          }
          const m = (a + b) / 2;
          return [o.x + v.x * m, o.z + v.z * m];
        }
        prev = t;
      }
      const e = -o.y / v.y;
      return [o.x + v.x * e, o.z + v.z * e];
    }
    // A plane's shadow, cast along the sun onto the ground below it.
    function shadow(x, z, sx, sz, alt, off) {
      let y = off;
      for (let it = 0; it < 3; it++) y = hs(x - sx * (alt - y), z - sz * (alt - y)) + off;
      return [x - sx * (alt - y), y, z - sz * (alt - y)];
    }

    const api = {
      scale: S, h, hs, isWater: water, inWater, treeY, hc, ray, shadow, ground, water: waterMesh, roads, bref, bmin,
      deck, densify, carY, models, ownsKpb: !!(kpbModel && data.kpb), storyChord: MODELS && bridgeList ? MODELS.storyChord : null,
      mesh: null, lo, hi, meta,
      stats: { bridges: 0, riverBridges: 0 },
    };
    return api;
  }
})();
