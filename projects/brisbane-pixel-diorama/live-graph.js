// Following a network between GPS fixes, for the live trains, buses and Metro (live-trains.js, live-buses.js). Added
// 19 Oct 2026, from the trains layer.
//
//   const G = window.__liveGraph(nodes, edges, {snap: 60, oneway: false})
//
// nodes are [[x, z], ...] and edges [[a, b, flags], ...] in the model's metres; with oneway, an edge flagged 8 may
// only be followed from a to b. G gives:
//   snap(x, z, hx, hz)   the nearest point on the network within `snap` metres, or null: {e, t, x, z}. With a heading
//                        (hx, hz), edges running the other way count as 25 m further away, so a bus on a divided road
//                        snaps to its own side.
//   route(P, Q, max)     the shortest way along the network from P to Q (both snapped), no longer than max metres:
//                        [{x, z, e}, ...], each point with the edge its segment starts on, or null
//   walk(x, z, e, away, len)  from a point on edge e, len metres heading away from node `away`, as straight as the
//                        junctions allow (for the cars of a train behind its head)
//   along(pts, s)        the point s metres along a path: [x, z, e, heading x, heading z]
//   plen(pts)            a path's length
window.__liveGraph = (N, E, { snap: SNAP = 60, oneway = false } = {}) => {
  const elen = E.map(([a, b]) => Math.hypot(N[b][0] - N[a][0], N[b][1] - N[a][1]) || 0.01);
  const one = (e) => oneway && E[e][2] & 8;
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

  function snap(x, z, hx, hz) {
    let best = null, bd = SNAP;
    const gi = Math.floor(x / CELL), gj = Math.floor(z / CELL), r = Math.ceil(SNAP / CELL);
    for (let i = gi - r; i <= gi + r; i++)
      for (let j = gj - r; j <= gj + r; j++)
        for (const e of grid.get(i * 100003 + j) || []) {
          const [a, b] = E[e], [ax, az] = N[a], [bx, bz] = N[b];
          const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
          const px = ax + dx * t, pz = az + dz * t;
          let d = Math.hypot(x - px, z - pz);
          if (hx != null && one(e) && dx * hx + dz * hz < 0) d += 25;
          if (d < bd) (bd = d), (best = { e, t, x: px, z: pz });
        }
    return best;
  }

  function route(P, Q, max = 6000) {
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
    const [pa, pb] = E[P.e], [qa, qb] = E[Q.e];
    if (!one(P.e)) push(pa, P.t * elen[P.e], { e: P.e, start: true });
    push(pb, (1 - P.t) * elen[P.e], { e: P.e, start: true });
    const goal = { [qa]: Q.t * elen[Q.e] };
    if (!one(Q.e)) goal[qb] = (1 - Q.t) * elen[Q.e];
    let bestEnd = null, bestCost = Infinity;
    while (heap.length) {
      const [d, n] = pop();
      if (d > (dist.get(n) ?? Infinity) || d > bestCost || d > max) continue;
      if (n in goal && d + goal[n] < bestCost) (bestCost = d + goal[n]), (bestEnd = n);
      for (const [e, m] of adj[n]) if (!one(e) || E[e][0] === n) push(m, d + elen[e], { e, from: n });
    }
    if (bestEnd == null || bestCost > max) return null;
    const nodes = [];
    for (let n = bestEnd, guard = 0; guard < 20000; guard++) {
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

  return { snap, route, walk, along, plen, adj, elen };
};
