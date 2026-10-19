// Live buses and Brisbane Metro for the Brisbane pixel diorama: every TransLink bus on the map at its real GPS
// position, from TransLink's open feed (CC BY 4.0) through the same relay as the ferries and trains (live-config.js
// picks it). They take over from the simulated buses. Added 19 Oct 2026.
//
// Buses report about every 30 s. Each is drawn LAG seconds behind real time, so it can glide between two known
// fixes along the roads: both fixes are snapped to the bus network (buses.json, made by buses/build_buses.py from
// the roads OpenStreetMap's bus routes use, plus the busways), and the bus follows the shortest way between them,
// keeping to one-way streets (live-graph.js). The Metro's three sections bend round corners behind its front.
// Buses ride the bridge decks and disappear into the busway tunnels.
//
// Hover a bus for its route, the route's two ends and its next stop (Brisbane City Council's stop list names
// TransLink's stop ids). ?buses=off keeps the simulated buses.
(() => {
  if (new URLSearchParams(location.search).get('buses') === 'off') return;
  const RELAY = (window.__liveRelay || 'http://localhost:4011') + '/buses';
  const POLL_MS = 10000, RETRY_MS = 60000;
  const LAG = 50; // s behind real time: fixes come about 30 s apart and arrive up to ~15 s old
  const STALE = 180; // s: a bus whose last fix is older than this (at render time) is dropped
  const SNAP = 40; // m a GPS fix may be from a road and still be snapped to it
  const BUS = 15.6; // m: the renderer's bus
  const SEC = 9.4, GAP = 0.5, SECS = 3; // the Metro: a 24.4 m Hess lighTram in three sections, drawn 1.25 times long like the buses
  const CAP = 600; // buses the meshes hold
  const Y = 0.65; // drawn metres above the road, as the renderer's cars

  async function start() {
    const D = window.__dio, K = window.__terrain?.K, life = D.life, sim = life?.buses;
    if (!K || !sim || !window.__liveGraph) return;
    let net;
    try {
      const r = await fetch('buses.json');
      if (!r.ok) return;
      net = await r.json();
    } catch { return; }
    const { city, data } = D;
    const [ox, oz] = data.origin, [ccx, ccz, cr] = data.circle;
    const MX = 111320 * Math.cos((oz * Math.PI) / 180), MZ = 110540;
    const toXZ = (lat, lng) => [(lng - ox) * MX, -(lat - oz) * MZ];
    const T = D.terrain;
    const ground = (x, z) => (T ? T.h(x, z) : 0);
    const Color = city.sun.color.constructor;
    const rgb = (hex) => { const c = new Color(hex); return [c.r, c.g, c.b]; };
    const N = net.nodes, E = net.edges;
    const { snap, route, walk, along, plen } = window.__liveGraph(N, E, { snap: SNAP, oneway: true });

    // --- Meshes: the renderer's bus, and the Metro's sections (a cab at each end) -----------------------------
    function metroGeometry(cab) {
      const pos = [], nor = [], col = [];
      const box = (x0, y0, z0, x1, y1, z1, c) => {
        const v = (x, y, z) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
        const faces = [[[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0]],
          [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]],
          [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, -1]]];
        for (const [a, b, c2, d, n] of faces) for (const p of [a, b, c2, a, c2, d]) pos.push(...v(...p)), nor.push(...n), col.push(...c);
      };
      // From photos and renders: a white roof, charcoal body and glass, and light blue at the front and along the skirt.
      const L = SEC / 2, W = 1.6, blue = rgb('#3d8fd6'), body = rgb('#3b4148'), glass = rgb('#1d2227'), white = rgb('#eef0f2'), pod = rgb('#d3d8dc');
      const nose = cab ? 0.7 : 0;
      box(-L, 0.3, -W, L - nose, 0.75, W, blue);
      box(-L, 0.75, -W, L - nose, 1.5, W, body);
      box(-L, 1.5, -W, L - nose, 3.3, W, glass);
      box(-L, 3.3, -W, L - nose, 4.0, W, white);
      box(-L + 1.2, 4.0, -W + 0.35, L - nose - 1.2, 4.35, W - 0.35, pod); // roof batteries
      if (cab) {
        box(L - nose, 0.3, -W, L, 1.35, W, blue);
        box(L - nose, 1.35, -W + 0.1, L - 0.15, 3.5, W - 0.1, glass);
        box(L - nose, 3.5, -W, L - 0.25, 4.0, W, white);
      }
      const g = new K.BufferGeometry();
      g.setAttribute('position', new K.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('normal', new K.BufferAttribute(new Float32Array(nor), 3));
      g.setAttribute('color', new K.BufferAttribute(new Float32Array(col), 3));
      return g;
    }
    const IM = sim.mesh.constructor, mmat = new K.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
    const buses = new IM(sim.mesh.geometry, sim.mesh.material, CAP);
    const ends = new IM(metroGeometry(true), mmat, 80), mids = new IM(metroGeometry(false), mmat, 40);
    for (const m of [buses, ends, mids]) {
      m.layers.mask = sim.mesh.layers.mask; // the moving layer
      m.castShadow = sim.mesh.castShadow; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; m.visible = false;
      m.name = 'live-buses';
      life.root.add(m);
    }
    // A body centred at (x, y, z), its length along (fx, fy, fz) (its front) scaled by kl, its cross-section by k.
    function place(arr, o, x, y, z, fx, fy, fz, k, kl = 1) {
      const l = Math.hypot(fx, fy, fz) || 1;
      (fx /= l), (fy /= l), (fz /= l);
      let sx = -fz, sz = fx;
      const sl = Math.hypot(sx, sz) || 1;
      (sx /= sl), (sz /= sl);
      const ux = -sz * fy, uy = sz * fx - sx * fz, uz = sx * fy; // up = side × front
      arr.set([fx * kl, fy * kl, fz * kl, 0, ux * k, uy * k, uz * k, 0, sx * k, 0, sz * k, 0, x, y, z, 1], o);
    }

    // --- Buses, their fixes and the legs between them ------------------------------------------------------
    const fleet = new Map(); // id -> {name, route, metro, fixes: [{t, x, z, p, status, stop}], legs: Map, heading}
    function merge(json) {
      for (const v of json.vessels || []) {
        let b = fleet.get(v.id);
        const ref = (v.route || '').split('-')[0];
        if (!b) fleet.set(v.id, (b = { name: v.name, ref, metro: /^M\d/.test(ref), fixes: [], legs: new Map(), heading: null }));
        b.ref = ref;
        for (const [t, lat, lng, status, stop] of v.fixes) {
          if (b.fixes.some((f) => f.t === t)) continue;
          const [x, z] = toXZ(lat, lng);
          const prev = b.fixes.filter((f) => f.t < t).pop(), d = prev ? Math.hypot(x - prev.x, z - prev.z) : 0;
          // snap with the heading since the last fix, so a bus on a divided road keeps to its own side
          const p = d > 15 ? snap(x, z, (x - prev.x) / d, (z - prev.z) / d) : snap(x, z);
          b.fixes.push({ t, x, z, p, status, stop });
        }
        b.fixes.sort((a, c) => a.t - c.t);
      }
      const oldest = Date.now() / 1000 - 300;
      for (const [id, b] of fleet) {
        b.fixes = b.fixes.filter((f) => f.t >= oldest);
        if (!b.fixes.length) fleet.delete(id);
      }
    }
    function leg(b, i) {
      const a = b.fixes[i], c = b.fixes[i + 1], key = `${a.t}-${c.t}`;
      if (!b.legs.has(key)) {
        const straight = Math.hypot(c.x - a.x, c.z - a.z);
        let pts = a.p && c.p ? route(a.p, c.p, 2.5 * straight + 300) : null;
        if (!pts) pts = [{ x: a.p?.x ?? a.x, z: a.p?.z ?? a.z, e: a.p?.e ?? -1 }, { x: c.p?.x ?? c.x, z: c.p?.z ?? c.z, e: c.p?.e ?? -1 }];
        b.legs.set(key, { pts, len: plen(pts) });
        if (b.legs.size > 12) b.legs.delete(b.legs.keys().next().value);
      }
      return b.legs.get(key);
    }
    // The bus at time t: its front, and the road behind it (back along the way it came) as a path.
    function state(b, t) {
      const fx = b.fixes, last = fx[fx.length - 1];
      if (t - last.t > STALE) return null;
      let i = fx.length - 1, u = 1;
      for (let k = 0; k + 1 < fx.length; k++) if (t < fx[k + 1].t) { i = k; u = Math.max(0, (t - fx[k].t) / (fx[k + 1].t - fx[k].t)); break; }
      if (t < fx[0].t) (i = 0), (u = 0);
      const behind = [];
      let head;
      if (i + 1 < fx.length) {
        const L = leg(b, i), s = L.len * u, at = along(L.pts, s);
        head = { x: at[0], z: at[1] };
        if (L.len > 2) b.heading = [at[3], at[4]];
        let d = 0;
        const cum = [0];
        for (let k = 1; k < L.pts.length; k++) cum.push((d += Math.hypot(L.pts[k].x - L.pts[k - 1].x, L.pts[k].z - L.pts[k - 1].z)));
        for (let k = L.pts.length - 1; k >= 0; k--) if (cum[k] < s) behind.push(L.pts[k]);
      } else {
        const p = last.p || { x: last.x, z: last.z, e: -1 };
        head = { x: p.x, z: p.z };
        if (!b.heading && p.e >= 0) { // never seen moving: face the way the road runs, or the next stop
          const [a, c, f] = E[p.e], vx = N[c][0] - N[a][0], vz = N[c][1] - N[a][1], l = Math.hypot(vx, vz) || 1, st = net.stops[last.stop];
          const sgn = !(f & 8) && st && (st[1] - p.x) * vx + (st[2] - p.z) * vz < 0 ? -1 : 1;
          b.heading = [(sgn * vx) / l, (sgn * vz) / l];
        }
      }
      for (let k = i - 1; k >= 0 && behind.length < 200; k--) {
        const L = leg(b, k);
        for (let j = L.pts.length - 2; j >= 0; j--) behind.push(L.pts[j]);
      }
      return { head, behind, fix: fx[Math.min(fx.length - 1, i + (u > 0.5 ? 1 : 0))] };
    }

    // --- Drawing, every frame ----------------------------------------------------------------------------------
    const drawn = [];
    const yAt = (x, z) => {
      const on = snap(x, z), f = on ? E[on.e][2] : 0;
      return { y: f & 1 && T ? T.deckAt(x, z) ?? ground(x, z) + Y : ground(x, z) + Y, tunnel: !!(f & 2) };
    };
    function update() {
      const t = Date.now() / 1000 - LAG;
      const zoom = Math.max(1, Math.min(3, Math.pow(city.view.span / 1500, 0.6))); // bigger zoomed out, like the cars
      const BA = buses.instanceMatrix.array, EA = ends.instanceMatrix.array, MA = mids.instanceMatrix.array;
      let nb = 0, ne = 0, nm = 0;
      drawn.length = 0;
      for (const b of fleet.values()) {
        if (nb >= CAP || ne + 2 > 80) break;
        const st = state(b, t);
        if (!st || !b.heading) continue;
        const parts = b.metro ? SECS : 1, len = b.metro ? SEC : BUS, gap = b.metro ? GAP : 0;
        const path = [{ ...st.head, e: -1 }, ...st.behind];
        const need = parts * (len + gap) + 2;
        let have = plen(path);
        if (have < need) { // not enough road behind it yet: carry the path on back along the road, or straight
          const tail = path[path.length - 1], prev = path[path.length - 2];
          const hx = prev ? tail.x - prev.x : -b.heading[0], hz = prev ? tail.z - prev.z : -b.heading[1];
          const e = snap(tail.x, tail.z)?.e ?? -1;
          if (e >= 0) {
            const [a, c] = E[e], toC = (N[c][0] - tail.x) * hx + (N[c][1] - tail.z) * hz > 0;
            path.push(...walk(tail.x, tail.z, e, toC ? a : c, need - have));
          }
          have = plen(path);
          if (have < need) {
            const l = Math.hypot(hx, hz) || 1;
            path.push({ x: tail.x + (hx / l) * (need - have + 1), z: tail.z + (hz / l) * (need - have + 1), e: -1 });
          }
        }
        let hidden = 0;
        const bodies = [];
        for (let c = 0; c < parts; c++) {
          const f = along(path, c * (len + gap)), r = along(path, c * (len + gap) + len);
          const mx = (f[0] + r[0]) / 2, mz = (f[1] + r[1]) / 2;
          const yf = yAt(f[0], f[1]), yr = yAt(r[0], r[1]);
          const hide = (yf.tunnel && yr.tunnel) || Math.hypot(mx - ccx, mz - ccz) > cr - len / 2;
          if (hide) hidden++;
          bodies.push({ x: mx, y: (yf.y + yr.y) / 2, z: mz, fx: f[0] - r[0], fy: yf.y - yr.y, fz: f[1] - r[1], hide });
        }
        if (hidden === parts) continue;
        if (b.metro) {
          bodies.forEach((c, k) => {
            const kk = c.hide ? 0 : zoom;
            if (k === 0) place(EA, ne++ * 16, c.x, c.y, c.z, c.fx, c.fy, c.fz, kk);
            else if (k === parts - 1) place(EA, ne++ * 16, c.x, c.y, c.z, -c.fx, -c.fy, -c.fz, kk);
            else place(MA, nm++ * 16, c.x, c.y, c.z, c.fx, c.fy, c.fz, kk);
          });
        } else {
          const c = bodies[0];
          place(BA, nb++ * 16, c.x, c.y, c.z, c.fx, c.fy, c.fz, c.hide ? 0 : zoom, zoom);
        }
        const m = bodies[bodies.length >> 1];
        drawn.push({ b, x: m.x, y: m.y, z: m.z, fix: st.fix });
      }
      buses.count = nb; ends.count = ne; mids.count = nm;
      buses.instanceMatrix.needsUpdate = ends.instanceMatrix.needsUpdate = mids.instanceMatrix.needsUpdate = true;
    }
    const lifeUpdate = life.update.bind(life);
    life.update = (dt) => { lifeUpdate(dt); if (live && life.visible) update(); };

    // --- Live or not, polling, credits ---------------------------------------------------------------------------
    let live = false;
    const footer = document.querySelector('footer'), credit = document.createElement('span');
    credit.className = 'live-buses';
    function setLive(on) {
      live = on;
      buses.visible = ends.visible = mids.visible = on;
      sim.mesh.visible = !on;
      if (on && footer && !credit.isConnected) footer.append(credit);
      if (!on) { credit.remove(); drawn.length = 0; }
      window.__liveIntro?.('buses', on);
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
        credit.textContent = fleet.size ? ' · Buses: live GPS, TransLink (CC BY 4.0)' : ' · Buses: live from TransLink (CC BY 4.0), none running right now';
        timer = setTimeout(poll, POLL_MS);
      } catch {
        if (live && ![...fleet.values()].some((b) => Date.now() / 1000 - LAG - b.fixes[b.fixes.length - 1].t < STALE)) setLive(false);
        timer = setTimeout(poll, live ? POLL_MS : RETRY_MS);
      }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

    // --- Hover a bus for its route and next stop ------------------------------------------------------------
    const canvas = document.getElementById('c') || city.renderer.domElement;
    const v3 = new (city.camera.position.constructor)();
    const tip = document.createElement('div');
    tip.className = 'panel bus-tip';
    tip.hidden = true;
    Object.assign(tip.style, {
      position: 'fixed', zIndex: 31, pointerEvents: 'none', padding: '8px 11px', maxWidth: '280px',
      font: "600 13px/1.35 'Hanken Grotesk', system-ui, sans-serif", boxShadow: '0 2px 0 var(--shadow)',
    });
    document.body.append(tip);
    function lines(d) {
      const { b } = d, ends_ = net.routes[b.ref], stop = net.stops[d.fix.stop]?.[0];
      const status = { 0: 'Arriving at', 1: 'At', 2: 'Next stop:' }[d.fix.status] ?? 'Next stop:';
      return [[b.metro ? `Metro ${b.ref}` : `Bus ${b.ref}`], ...(ends_ ? [[`${ends_[0]} – ${ends_[1]}`, true]] : []),
        ...(stop ? [[`${status} ${stop}`, true]] : []), [b.metro ? 'Brisbane Metro' : 'TransLink bus', true]];
    }
    canvas.addEventListener('pointermove', (e) => {
      if (!live || e.buttons || e.pointerType !== 'mouse') { tip.hidden = true; return; }
      const r = canvas.getBoundingClientRect();
      let best = null, bd = 18;
      for (const d of drawn) {
        v3.set(d.x, d.y + 2, d.z).project(city.camera);
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

    window.__liveBuses = { fleet, drawn, meshes: { buses, ends, mids }, get live() { return live; }, relay: RELAY };
    poll();
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.life) { clearInterval(wait); start(); }
  }, 200);
})();
