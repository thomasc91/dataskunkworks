// Live ferries for the Brisbane pixel diorama: the CityCats, CityHoppers and cross-river ferries at their
// real GPS positions, from TransLink's open feed (CC BY 4.0) through a relay: live/ferry_relay.py on Thomas's PC,
// live/worker.js on Cloudflare elsewhere (live-config.js picks).
//
// Each boat is drawn LAG seconds behind real time, so it can glide between two known GPS fixes (about 30 s
// apart). Boats near the CityCat line follow the river between fixes, so they never cut across a bend;
// cross-river ferries go straight. The boats and wakes are the renderer's own CityCat models, placed with
// the same matrix maths as its simulation (Eo and the wake in city.js).
//
// If the relay isn't answering, nothing changes and the simulated CityCats keep running. ?ferries=off forces
// the simulation; ?ferries=<url> uses another relay.
(() => {
  const param = new URLSearchParams(location.search).get('ferries');
  if (param === 'off') return;
  const RELAY = param || (window.__liveRelay || 'http://localhost:4011') + '/ferries';
  const POLL_MS = 10000, RETRY_MS = 60000;
  const LAG = 50; // s behind real time: fixes come about 30 s apart and arrive up to ~45 s old
  const COAST = 20; // s a boat may carry on past its last fix before it holds still
  const STALE = 180; // s: a boat whose last fix is older than this (at render time) is dropped
  const RIVER = 150; // m: fixes this close to the CityCat line follow the river between fixes
  const CAP = 40; // boats the live meshes hold
  const WATER = 0.6, MAX_SPEED = 10.5, WAKE_BACK = 16; // the renderer's Hu, vc and us
  const WAKE_FROM = 1, WAKE_FULL = 2.5; // m/s: no wake below the first (berthed boats jitter), full wake from the second

  function start() {
    const D = window.__dio;
    const cats = D?.life?.cats;
    if (!cats) return;
    const { data } = D;
    const [ox, oz] = data.origin;
    const MX = 111320 * Math.cos((oz * Math.PI) / 180), MZ = 110540;
    const toXZ = (lat, lng) => [(lng - ox) * MX, -(lat - oz) * MZ];
    const [ccx, ccz, cr] = data.circle;

    // --- The CityCat line, for snapping and following the river --------------------------------------
    const line = data.citycat.line, n = line.length >> 1;
    const LX = new Float64Array(n), LZ = new Float64Array(n), CUM = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      LX[i] = line[2 * i]; LZ[i] = line[2 * i + 1];
      CUM[i] = i ? CUM[i - 1] + Math.hypot(LX[i] - LX[i - 1], LZ[i] - LZ[i - 1]) : 0;
    }
    function project(x, z) { // -> { s: metres along the line, off: signed metres to its left, d }
      let best = { d: Infinity, s: 0, off: 0 };
      for (let i = 0; i + 1 < n; i++) {
        const vx = LX[i + 1] - LX[i], vz = LZ[i + 1] - LZ[i], L2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((x - LX[i]) * vx + (z - LZ[i]) * vz) / L2));
        const px = LX[i] + t * vx, pz = LZ[i] + t * vz, d = Math.hypot(x - px, z - pz);
        if (d < best.d) {
          const len = Math.sqrt(L2), nx = -vz / len, nz = vx / len;
          best = { d, s: CUM[i] + t * len, off: (x - px) * nx + (z - pz) * nz };
        }
      }
      return best;
    }
    function along(s, off, out) {
      s = Math.max(0, Math.min(CUM[n - 1], s));
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (CUM[m] <= s) lo = m; else hi = m; }
      const seg = CUM[hi] - CUM[lo] || 1, t = (s - CUM[lo]) / seg;
      const vx = LX[hi] - LX[lo], vz = LZ[hi] - LZ[lo], len = Math.hypot(vx, vz) || 1;
      out[0] = LX[lo] + vx * t - (vz / len) * off;
      out[1] = LZ[lo] + vz * t + (vx / len) * off;
      return out;
    }

    // --- Boats -------------------------------------------------------------------------------------
    const boats = new Map(); // id -> { name, route, fixes: [{t, x, z, s, off, river}], heading }
    function merge(json) {
      for (const v of json.vessels || []) {
        let b = boats.get(v.id);
        if (!b) boats.set(v.id, (b = { name: v.name, route: v.route, fixes: [], heading: null }));
        b.name = v.name; b.route = v.route;
        for (const [t, lat, lng, status, stop] of v.fixes) {
          if (b.fixes.some((f) => f.t === t)) continue;
          const [x, z] = toXZ(lat, lng), p = project(x, z);
          b.fixes.push({ t, x, z, s: p.s, off: p.off, river: p.d <= RIVER, status, stop });
        }
        b.fixes.sort((a, c) => a.t - c.t);
      }
      const oldest = Date.now() / 1000 - 300;
      for (const [id, b] of boats) {
        b.fixes = b.fixes.filter((f) => f.t >= oldest);
        if (!b.fixes.length) boats.delete(id);
      }
    }

    // Where a boat is at time t, following the river between two river fixes, straight otherwise.
    function between(a, b, u, out) {
      const straight = Math.hypot(b.x - a.x, b.z - a.z);
      if (a.river && b.river && Math.abs(b.s - a.s) <= 1.6 * straight + 60) {
        return along(a.s + (b.s - a.s) * u, a.off + (b.off - a.off) * u, out);
      }
      out[0] = a.x + (b.x - a.x) * u; out[1] = a.z + (b.z - a.z) * u;
      return out;
    }
    function posAt(b, t, out) {
      const fx = b.fixes, last = fx[fx.length - 1];
      if (t - last.t > STALE) return false;
      if (t <= fx[0].t) { out[0] = fx[0].x; out[1] = fx[0].z; return true; }
      for (let i = 0; i + 1 < fx.length; i++) {
        if (t < fx[i + 1].t) return between(fx[i], fx[i + 1], (t - fx[i].t) / (fx[i + 1].t - fx[i].t), out), true;
      }
      if (fx.length > 1 && t - last.t <= COAST) { // coast on at the last leg's pace
        const a = fx[fx.length - 2];
        return between(a, last, 1 + (t - last.t) / (last.t - a.t), out), true;
      }
      out[0] = last.x; out[1] = last.z;
      return true;
    }

    // --- Meshes: the renderer's own CityCat hull and wake, in instanced meshes that hold every ferry ---
    const IM = cats.mesh.constructor;
    const hull = new IM(cats.mesh.geometry, cats.mesh.material, CAP);
    const wake = new IM(cats.wake.geometry, cats.wake.material, CAP);
    for (const [m, src] of [[hull, cats.mesh], [wake, cats.wake]]) {
      m.castShadow = src.castShadow; m.receiveShadow = src.receiveShadow;
      m.renderOrder = src.renderOrder; m.frustumCulled = false; m.count = 0; m.visible = false;
      m.name = 'live-' + (src.name || 'ferries');
      m.layers.mask = src.layers.mask; // the moving layer, redrawn every frame (not the cached still layer)
      src.parent.add(m);
    }
    function placeBoat(arr, o, x, z, w, v, l) { // Eo(arr, o, x, WATER, z, w, v, 0, l) from city.js
      arr[o] = w * l; arr[o + 1] = 0; arr[o + 2] = v * l; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = l; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = -v * l; arr[o + 9] = 0; arr[o + 10] = w * l; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = WATER; arr[o + 14] = z; arr[o + 15] = 1;
    }

    const p0 = [0, 0], p1 = [0, 0], pc = [0, 0];
    const drawn = []; // what's on screen this frame, for the tooltips: {name, route, x, z, status, stop}
    function fixAt(b, t) { // the latest fix at or before t: its status is the boat's status then
      let f = b.fixes[0];
      for (const g of b.fixes) if (g.t <= t) f = g;
      return f;
    }
    function liveUpdate(scale) {
      const t = Date.now() / 1000 - LAG;
      const H = hull.instanceMatrix.array, W = wake.instanceMatrix.array;
      let k = 0;
      drawn.length = 0;
      for (const b of boats.values()) {
        if (k >= CAP || !posAt(b, t, pc)) continue;
        if (Math.hypot(pc[0] - ccx, pc[1] - ccz) > cr) continue; // off the model
        posAt(b, t - 1, p0); posAt(b, t + 1, p1);
        const dx = p1[0] - p0[0], dz = p1[1] - p0[1], speed = Math.hypot(dx, dz) / 2;
        if (speed > 0.4) {
          const target = Math.atan2(dz, dx);
          if (b.heading === null) b.heading = target;
          else b.heading += Math.atan2(Math.sin(target - b.heading), Math.cos(target - b.heading)) * 0.08;
        } else if (b.heading === null) { // berthed since we first saw it: lie along the river
          const f = b.fixes[b.fixes.length - 1];
          along(f.s - 10, 0, p0); along(f.s + 10, 0, p1);
          b.heading = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        }
        const w = Math.cos(b.heading), v = Math.sin(b.heading), C = scale;
        placeBoat(H, k * 16, pc[0], pc[1], w, v, C);
        // The wake only shows while the boat is under way, growing in from WAKE_FROM to WAKE_FULL.
        const wk = Math.max(0, Math.min(1, (speed - WAKE_FROM) / (WAKE_FULL - WAKE_FROM)));
        if (wk === 0) W.fill(0, k * 16, k * 16 + 16);
        else {
          const M = 60 * Math.pow(Math.min(speed, MAX_SPEED) / MAX_SPEED, 1.5) * C * wk, Cw = C * wk;
          const bx = pc[0] - w * WAKE_BACK * C, bz = pc[1] - v * WAKE_BACK * C;
          W.set([w * M, 0, v * M, 0, 0, 1, 0, 0, -v * Cw, 0, w * Cw, 0, bx, WATER + 0.04, bz, 1], k * 16);
        }
        const f = fixAt(b, t);
        drawn.push({ name: b.name, route: b.route, x: pc[0], z: pc[1], status: f.status, stop: f.stop });
        k++;
      }
      hull.count = wake.count = k;
      hull.instanceMatrix.needsUpdate = wake.instanceMatrix.needsUpdate = true;
      const was = shown;
      shown = k;
      if ((was > 0) !== (k > 0)) caption();
    }

    // --- Switching between the simulation and live -----------------------------------------------------
    let live = false, shown = 0;
    const simUpdate = cats.update.bind(cats);
    cats.update = (dt, scale) => (live ? liveUpdate(scale) : simUpdate(dt, scale));
    const footer = document.querySelector('footer');
    const credit = document.createElement('span');
    credit.className = 'live-ferries';
    function setLive(on) {
      live = on;
      cats.mesh.visible = cats.wake.visible = !on;
      hull.visible = wake.visible = on;
      if (on && footer && !credit.isConnected) footer.append(credit);
      if (!on) { credit.remove(); drawn.length = 0; }
      window.__liveIntro?.('ferries', on);
      D.requestRender?.();
    }
    function caption() {
      credit.textContent = shown
        ? ` · Ferries: live GPS, TransLink (CC BY 4.0), about a minute behind`
        : ` · Ferries: live from TransLink (CC BY 4.0), none running right now`;
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
        caption();
        timer = setTimeout(poll, POLL_MS);
      } catch {
        // Relay unreachable: keep any boats we have until they go stale, then hand back to the simulation.
        const newest = Math.max(0, ...[...boats.values()].map((b) => b.fixes[b.fixes.length - 1].t));
        if (live && Date.now() / 1000 - LAG - newest > STALE) setLive(false);
        timer = setTimeout(poll, live ? POLL_MS : RETRY_MS);
      }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    window.__liveFerries = { boats, drawn, get live() { return live; }, get shown() { return shown; }, relay: RELAY };
    poll();
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.life) { clearInterval(wait); start(); }
  }, 200);
})();
