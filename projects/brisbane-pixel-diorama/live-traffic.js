// Live traffic levels for the Brisbane pixel diorama's simulated cars. Added 19 Oct 2026.
//
// The cars are still simulated, but how many are on the roads, and where, follows Brisbane City Council's live
// traffic signal data (open data, CC BY 4.0): every minute, each of the city's signals reports how saturated each
// of its approaches is (SCATS's degree of saturation). Every five minutes the page reads the last few minutes for
// every signal (a 55 KB download, straight from the council's open data portal) and averages each signal's lanes.
// A street near busy signals keeps all its cars; one near quiet signals shows only some, down to about one in
// twelve at 3am. Roads far from any signal (the motorways, back streets) follow the city-wide median.
//
// traffic.json (from traffic/build_traffic.py) has where the signals are. ?traffic=off keeps every car, and so does roll
// mode (roll.js), which wants every car there is to roll up.
(() => {
  const Q = new URLSearchParams(location.search);
  if (Q.get('traffic') === 'off' || Q.get('mode') === 'roll') return;
  const FEED = 'https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/traffic-data-at-intersection/exports/csv' +
    '?select=tsc,ds1,ds2,ds3,ds4&delimiter=,';
  const POLL_MS = 300000, RETRY_MS = 60000;
  const FULL = 45; // % saturation at which a street shows all its cars (a weekday peak's median is about this)
  const LEAST = 0.08; // the fewest cars shown, as a share
  const CELL = 200, REACH = 800; // m: the density grid, and how far a signal's level spreads

  async function start() {
    const D = window.__dio, life = D.life, cars = life?.cars;
    if (!cars?.mesh) return;
    let signals;
    try {
      const r = await fetch('traffic.json');
      if (!r.ok) return;
      signals = (await r.json()).signals;
    } catch { return; }
    const [cx, cz, cr] = D.data.circle;
    const x0 = cx - cr - CELL, z0 = cz - cr - CELL, NX = Math.ceil((2 * cr + 2 * CELL) / CELL) + 1;
    const grid = new Float32Array(NX * NX).fill(1), target = new Float32Array(NX * NX).fill(1);
    const n = cars.mesh.count, keep = new Float32Array(n);
    for (let i = 0; i < n; i++) keep[i] = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1; // each car's own draw

    // --- The live levels --------------------------------------------------------------------------------------
    let live = false, median = null;
    function rebuild(levels) { // levels: tsc -> mean saturation (%)
      const pts = signals.filter(([t]) => levels.has(t)).map(([t, x, z]) => [x, z, levels.get(t)]);
      const all = [...levels.values()].sort((a, b) => a - b);
      median = all[all.length >> 1] ?? 0;
      const share = (ds) => Math.max(LEAST, Math.min(1, ds / FULL));
      for (let j = 0; j < NX; j++)
        for (let i = 0; i < NX; i++) {
          const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
          let w = 0, s = 0;
          for (const [px, pz, ds] of pts) {
            const d = Math.hypot(px - x, pz - z);
            if (d > REACH) continue;
            const k = 1 / (1 + (d / 250) ** 2);
            w += k; s += k * ds;
          }
          // blend towards the city-wide median where signals are sparse
          const near = Math.min(1, w / 1.5), ds = w ? (s / w) * near + median * (1 - near) : median;
          target[j * NX + i] = share(ds);
        }
    }
    const lifeUpdate = life.update.bind(life);
    life.update = (dt) => {
      lifeUpdate(dt);
      if (!live || !life.visible) return;
      const ease = Math.min(1, dt / 8); // changes fade in over a few seconds
      for (let k = 0; k < grid.length; k++) grid[k] += (target[k] - grid[k]) * ease;
      const a = cars.mesh.instanceMatrix.array, m = Math.min(n, cars.mesh.count);
      for (let i = 0; i < m; i++) {
        const o = i * 16, gi = Math.floor((a[o + 12] - x0) / CELL), gj = Math.floor((a[o + 14] - z0) / CELL);
        const share = gi >= 0 && gj >= 0 && gi < NX && gj < NX ? grid[gj * NX + gi] : 1;
        if (keep[i] >= share) for (let q = 0; q < 11; q++) a[o + q] = 0; // not on the road right now
      }
      cars.mesh.instanceMatrix.needsUpdate = true;
    };

    const footer = document.querySelector('footer'), credit = document.createElement('span');
    credit.className = 'live-traffic';
    let timer = 0;
    async function poll() {
      clearTimeout(timer);
      if (document.hidden) { timer = setTimeout(poll, POLL_MS); return; }
      try {
        const r = await fetch(FEED, { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        const sums = new Map();
        for (const line of (await r.text()).split('\n').slice(1)) {
          const f = line.split(','), t = f[0]?.replace(/^﻿/, '');
          if (!t) continue;
          let s = sums.get(t);
          if (!s) sums.set(t, (s = [0, 0]));
          for (let k = 1; k <= 4; k++) if (f[k] !== undefined && f[k].trim() !== '') { s[0] += +f[k]; s[1]++; }
        }
        const levels = new Map([...sums].filter(([, s]) => s[1]).map(([t, s]) => [t, s[0] / s[1]]));
        if (levels.size < 50) throw new Error('too few signals');
        rebuild(levels);
        if (!live) { for (let k = 0; k < grid.length; k++) grid[k] = target[k]; live = true; }
        credit.textContent = " · Traffic levels: live from Brisbane City Council's traffic signals (CC BY 4.0)";
        if (footer && !credit.isConnected) footer.append(credit);
        window.__liveIntro?.('traffic', true);
        timer = setTimeout(poll, POLL_MS);
      } catch {
        timer = setTimeout(poll, RETRY_MS); // keep the last levels; with none yet, every car stays
      }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !timer) poll(); });
    window.__liveTraffic = { grid, target, get median() { return median; }, get live() { return live; } };
    poll();
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.life) { clearInterval(wait); start(); }
  }, 200);
})();
