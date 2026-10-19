// Live ships for the Brisbane pixel diorama (West End and the airport): every vessel round Brisbane sending AIS,
// at its real position, size and heading, from aisstream.io through the relay (live-config.js picks it). Added
// 19 Oct 2026.
//
// AIS is the radio system ships use to say where they are: position, speed, course and heading every few seconds
// under way (every 3 minutes at anchor), and name, type, size and destination every 6 minutes. The relay keeps what
// each ship last said; the page draws each one from its last fix, carried on along its course at its speed
// (ships hold a course), easing onto each new fix. A ship is a hull in its type's colour (container and bulk ships
// red, tankers black, tugs red, ferries and pleasure craft white) sized from its AIS dimensions, with its bridge
// and superstructure aft or amidships as the type has them. The CityCats and ferries are left to their own layer.
//
// Hover a ship for its name, type, destination and speed. ?ships=off leaves them out.
(() => {
  if (new URLSearchParams(location.search).get('ships') === 'off') return;
  const RELAY = (window.__liveRelay || 'http://localhost:4011') + '/ships';
  const POLL_MS = 30000, RETRY_MS = 120000;
  const AHEAD = 240; // s a ship is carried on past its last fix along its course
  const WATER = 0.6; // the renderer's water level, as the ferries
  const CAP = 300;
  const KIND = (t) => (t >= 70 && t <= 79 ? 'cargo' : t >= 80 && t <= 89 ? 'tanker' : t >= 60 && t <= 69 ? 'passenger' : t >= 40 && t <= 49 ? 'fast ferry'
    : t === 31 || t === 32 || t === 52 ? 'tug' : t === 50 ? 'pilot' : t === 51 ? 'rescue' : t === 35 ? 'naval' : t === 36 ? 'sailing'
      : t === 37 ? 'pleasure' : t === 30 ? 'fishing' : t === 33 ? 'dredger' : 'vessel');
  // hull colour, default length and beam (m), and where the superstructure sits: [from, to] along the hull (0 stern, 1 bow) and its height
  const LOOK = {
    cargo: ['#8a2f2a', 180, 30, [0.04, 0.2], 2.4], tanker: ['#2b2b2e', 180, 32, [0.03, 0.17], 2.2], passenger: ['#f2f2f0', 60, 12, [0.1, 0.8], 1.8],
    'fast ferry': ['#f2f2f0', 35, 10, [0.2, 0.75], 1.5], tug: ['#c4372e', 28, 10, [0.35, 0.7], 1.6], pilot: ['#1d2a44', 18, 5, [0.3, 0.65], 1.3],
    rescue: ['#e8662a', 15, 5, [0.3, 0.7], 1.3], naval: ['#7b8288', 120, 16, [0.3, 0.6], 2.2], sailing: ['#f4f4f2', 12, 4, [0.35, 0.6], 0.8],
    pleasure: ['#f4f4f2', 12, 4, [0.3, 0.65], 1], fishing: ['#3c6e8f', 20, 6, [0.5, 0.75], 1.4], dredger: ['#b8862b', 90, 18, [0.05, 0.25], 2],
    vessel: ['#5f6a72', 20, 6, [0.3, 0.65], 1.2],
  };
  const STATUS = { 1: 'At anchor', 5: 'Moored', 6: 'Aground' };

  async function start() {
    const D = window.__dio, K = window.__terrain?.K, life = D.life;
    if (!K?.InstancedMesh || !life) return;
    const { city, data } = D;
    const [ox, oz] = data.origin, [ccx, ccz, cr] = data.circle;
    const MX = 111320 * Math.cos((oz * Math.PI) / 180), MZ = 110540;
    const toXZ = (lat, lng) => [(lng - ox) * MX, -(lat - oz) * MZ];
    const Color = city.sun.color.constructor;

    // --- Meshes: a hull with a pointed bow, and a white superstructure, both unit-sized and scaled per ship -----
    function geometry(parts) {
      const pos = [], nor = [];
      for (const pts of parts) { // each part: a prism from a floor outline (x, z) between y0 and y1
        const [y0, y1, ring] = pts;
        for (let i = 1; i + 1 < ring.length; i++) for (const k of [0, i, i + 1]) pos.push(ring[k][0], y1, ring[k][1]), nor.push(0, 1, 0);
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length], nx = -(b[1] - a[1]), nz = b[0] - a[0], l = Math.hypot(nx, nz) || 1;
          for (const [x, y, z] of [[a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], [a[0], y0, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]]])
            pos.push(x, y, z), nor.push(nx / l, 0, nz / l);
        }
      }
      const g = new K.BufferGeometry();
      g.setAttribute('position', new K.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('normal', new K.BufferAttribute(new Float32Array(nor), 3));
      return g;
    }
    // hull: x from -0.5 (stern) to 0.5 (bow), beam -0.5..0.5, waterline 0 to deck 1 (outlines run anticlockwise seen from above)
    const hullGeo = geometry([[-0.15, 1, [[-0.5, -0.5], [-0.5, 0.5], [0.3, 0.5], [0.5, 0], [0.3, -0.5]]]]);
    const boxGeo = geometry([[0, 1, [[-0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0.5, -0.5]]]]);
    const mat = new K.MeshStandardMaterial({ roughness: 0.7, side: K.DoubleSide });
    const hulls = new K.InstancedMesh(hullGeo, mat, CAP), tops = new K.InstancedMesh(boxGeo, new K.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.6, side: K.DoubleSide }), CAP);
    const layer = life.cats?.mesh.layers.mask ?? life.cars?.mesh.layers.mask;
    for (const m of [hulls, tops]) {
      if (layer != null) m.layers.mask = layer;
      m.frustumCulled = false; m.count = 0; m.visible = false; m.castShadow = false; m.receiveShadow = true; m.name = 'live-ships';
      life.root.add(m);
    }
    const tint = Object.fromEntries(Object.entries(LOOK).map(([k, v]) => [k, new Color(v[0])]));
    // a box: centre (x, y, z), heading (hx, hz) along its length, size L x H x B
    const place = (arr, o, x, y, z, hx, hz, L, H, B) =>
      arr.set([hx * L, 0, hz * L, 0, 0, H, 0, 0, -hz * B, 0, hx * B, 0, x, y, z, 1], o);

    // --- Ships and where they are now ------------------------------------------------------------------------
    const fleet = new Map(); // mmsi -> {name, type, len, beam, dest, fix, x, z, hx, hz, shown}
    function merge(json) {
      const seen = new Set();
      for (const s of json.ships || []) {
        const f = s.fixes?.[s.fixes.length - 1];
        if (!f) continue;
        seen.add(s.mmsi);
        let v = fleet.get(s.mmsi);
        if (!v) fleet.set(s.mmsi, (v = { x: null }));
        Object.assign(v, { mmsi: s.mmsi, name: s.name, type: s.type, len: s.len, beam: s.beam, dest: s.dest, fix: f });
      }
      for (const m of [...fleet.keys()]) if (!seen.has(m)) fleet.delete(m);
    }
    function predicted(v, now) { // the last fix carried on along its course for a while
      const [t, lat, lng, sog, cog] = v.fix, [x, z] = toXZ(lat, lng);
      const dt = Math.max(0, Math.min(AHEAD, now - t)), sp = (sog ?? 0) * 0.5144;
      if (sp < 0.2 || cog == null) return [x, z];
      const a = (cog * Math.PI) / 180; // course: clockwise from north; the model's x is east and z south
      return [x + Math.sin(a) * sp * dt, z - Math.cos(a) * sp * dt];
    }

    const drawn = [];
    let last = 0;
    function update() {
      const now = Date.now() / 1000, dt = last ? Math.min(0.5, now - last) : 0;
      last = now;
      const zoom = Math.max(1, Math.min(3, Math.pow(city.view.span / 1500, 0.6)));
      const HA = hulls.instanceMatrix.array, TA = tops.instanceMatrix.array, C = hulls.instanceColor?.array;
      let n = 0;
      drawn.length = 0;
      for (const v of fleet.values()) {
        if (n >= CAP) break;
        const kind = KIND(v.type ?? 0), look = LOOK[kind];
        const L = v.len || look[1], B = v.beam || look[2];
        if (/passenger|fast ferry/.test(kind) && L < 35 && life.cats) continue; // the CityCats' layer has these
        const [px, pz] = predicted(v, now);
        if (v.x == null) (v.x = px), (v.z = pz);
        else { const e = Math.min(1, dt / 4); v.x += (px - v.x) * e; v.z += (pz - v.z) * e; } // ease onto each new fix
        if (Math.hypot(v.x - ccx, v.z - ccz) > cr - L / 2) continue;
        const [, , , sog, cog, hdg] = v.fix, dir = hdg ?? cog;
        if (dir != null && (hdg != null || (sog ?? 0) > 0.5)) { const a = (dir * Math.PI) / 180; v.hx = Math.sin(a); v.hz = -Math.cos(a); }
        if (v.hx == null) (v.hx = 1), (v.hz = 0);
        const k = L < 25 ? zoom : 1; // small boats grow when zoomed out, like the cars; ships are big enough
        const len = L * k, beam = B * k, H = Math.max(0.8, Math.min(9, L * 0.05)) * 1.6 * k;
        place(HA, n * 16, v.x, WATER, v.z, v.hx, v.hz, len, H, beam);
        const [a, b] = look[3], mid = (a + b) / 2 - 0.5;
        place(TA, n * 16, v.x + v.hx * mid * len, WATER + H, v.z + v.hz * mid * len, v.hx, v.hz, (b - a) * len, H * (look[4] - 1), beam * 0.8);
        if (C) tint[kind].toArray(C, n * 3);
        drawn.push({ v, kind, x: v.x, y: WATER + H, z: v.z });
        n++;
      }
      hulls.count = tops.count = n;
      hulls.instanceMatrix.needsUpdate = tops.instanceMatrix.needsUpdate = true;
      if (hulls.instanceColor) hulls.instanceColor.needsUpdate = true;
    }
    hulls.setColorAt(0, tint.vessel); // makes the colour buffer
    const lifeUpdate = life.update.bind(life);
    life.update = (dt) => { lifeUpdate(dt); if (live && life.visible) update(); };

    // --- Polling and credits --------------------------------------------------------------------------------
    let live = false, timer = 0;
    const footer = document.querySelector('footer'), credit = document.createElement('span');
    credit.className = 'live-ships';
    function setLive(on) {
      live = on;
      hulls.visible = tops.visible = on;
      if (on && footer && !credit.isConnected) footer.append(credit);
      if (!on) { credit.remove(); drawn.length = 0; }
      window.__liveIntro?.('ships', on);
      D.requestRender?.();
    }
    async function poll() {
      clearTimeout(timer);
      if (document.hidden) { timer = setTimeout(poll, POLL_MS); return; }
      try {
        const r = await fetch(RELAY, { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        const json = await r.json();
        if (json.error && !json.ships?.length) throw new Error(json.error); // no key yet: stay off quietly
        merge(json);
        if (!live) setLive(true);
        credit.textContent = ' · Ships: live AIS from aisstream.io';
        timer = setTimeout(poll, POLL_MS);
      } catch {
        if (live && !fleet.size) setLive(false);
        timer = setTimeout(poll, RETRY_MS);
      }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

    // --- Hover a ship ------------------------------------------------------------------------------------------
    const canvas = document.getElementById('c') || city.renderer.domElement;
    const v3 = new (city.camera.position.constructor)();
    const tip = document.createElement('div');
    tip.className = 'panel ship-tip';
    tip.hidden = true;
    Object.assign(tip.style, {
      position: 'fixed', zIndex: 31, pointerEvents: 'none', padding: '8px 11px', maxWidth: '280px',
      font: "600 13px/1.35 'Hanken Grotesk', system-ui, sans-serif", boxShadow: '0 2px 0 var(--shadow)',
    });
    document.body.append(tip);
    const title = (s) => (s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    function lines({ v, kind }) {
      const [, , , sog, , , status] = v.fix, kn = sog ?? 0;
      const state = STATUS[status] ?? (kn > 0.5 ? `${kn.toFixed(kn < 10 ? 1 : 0)} knots` : 'Stopped');
      const size = v.len ? `, ${v.len} m` : '';
      return [[title(v.name) || `Vessel ${v.mmsi}`], [`${kind[0].toUpperCase() + kind.slice(1)}${size}`, true],
        ...(v.dest ? [[`To ${title(v.dest)}`, true]] : []), [state, true]];
    }
    canvas.addEventListener('pointermove', (e) => {
      if (!live || e.buttons || e.pointerType !== 'mouse') { tip.hidden = true; return; }
      const r = canvas.getBoundingClientRect();
      let best = null, bd = 22;
      for (const d of drawn) {
        v3.set(d.x, d.y, d.z).project(city.camera);
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
      tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px';
      tip.style.top = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8) + 'px';
    });
    canvas.addEventListener('pointerleave', () => { tip.hidden = true; });

    window.__liveShips = { fleet, drawn, merge, get live() { return live; }, relay: RELAY, setLive };
    poll();
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.life) { clearInterval(wait); start(); }
  }, 200);
})();
