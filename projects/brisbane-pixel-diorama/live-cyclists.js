// Cyclists for the Brisbane pixel diorama: simulated riders on the bikeways, as many as Brisbane City Council's bike
// counters count. Added 19 Oct 2026.
//
// cycling.json (from cycling/build_cycling.py) has the bikeways from OpenStreetMap, joined into long paths, and the
// council's automatic counters inside the map with their mean daily count for each day of the week (open data,
// CC BY 4.0; last October and November, the latest the council has published). Each path takes its traffic from
// the counters near it (the Bicentennial Bikeway's 2,800 a weekday, fading with distance; quiet paths far from
// any counter get a little), spread over the day the way Brisbane's commuter and weekend riding is: peaks at 7am
// and 5pm on weekdays, a long morning at weekends. Riders = cyclists an hour × the path's length ÷ their speed,
// so a busy path at 7:30am has a rider every 60 m or so. Riders keep to the real clock and day in Brisbane, and
// half of them stay home in the rain.
//
// ?cyclists=off leaves them out.
(() => {
  if (new URLSearchParams(location.search).get('cyclists') === 'off') return;
  const SPEED = [5, 7.5]; // m/s: 18 to 27 km/h
  const REACH = 700; // m over which a counter's count fades to a third
  const BASE = [250, 120]; // cyclists a day on paths and street lanes far from any counter
  const SIZE = 2; // drawn this much bigger than life, so a rider reads next to the (also enlarged) cars
  const CAP = 1500;
  // Share of a day's riders in each hour (Brisbane's counters' usual shape: commuting peaks on weekdays).
  const WEEKDAY = [0.3, 0.1, 0.1, 0.1, 0.4, 2.5, 7.5, 11.5, 8.5, 4.5, 3.8, 3.8, 4, 3.8, 4, 5.5, 8.5, 10.5, 6.5, 3.5, 2.2, 1.4, 0.9, 0.5];
  const WEEKEND = [0.3, 0.1, 0.1, 0.1, 0.3, 2, 6, 10, 11, 10, 8.5, 7, 6, 5.5, 5.5, 5.5, 5.5, 4.5, 3, 1.8, 1.2, 0.8, 0.5, 0.3];
  const JERSEYS = ['#e2453b', '#2f5fa8', '#f6c453', '#3a9b5c', '#ffffff', '#1d1f22', '#ff7a2f', '#7a3fa0', '#33b5c8', '#ffffff'];

  async function start() {
    const D = window.__dio, K = window.__terrain?.K, life = D.life;
    if (!K?.InstancedMesh || !life) return;
    let net;
    try {
      const r = await fetch('cycling.json');
      if (!r.ok) return;
      net = await r.json();
    } catch { return; }
    const { city } = D, T = D.terrain;
    const ground = (x, z) => (T ? T.h(x, z) : 0);
    const brisbane = () => new Date(Date.now() + 10 * 3600e3);

    // --- Paths, and how busy each is ------------------------------------------------------------------------
    const paths = net.paths.map(([flags, ...p]) => {
      const n = p.length / 2, cum = new Float32Array(n);
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
      return { flags, p, cum, len: cum[n - 1], riders: [], daily: [] };
    });
    for (const path of paths) { // the mean of the counters' fading counts along the path, for each day of the week
      const samples = [];
      for (let s = 0; s <= path.len; s += 60) samples.push(at(path, s, {}));
      for (let day = 0; day < 7; day++) {
        let sum = 0;
        for (const q of samples) {
          let best = 0;
          for (const [, , x, z, means] of net.counters) {
            const m = means[day] ?? means.find((v) => v) ?? 0;
            best = Math.max(best, m * Math.exp(-Math.hypot(q.x - x, q.z - z) / REACH));
          }
          sum += best;
        }
        path.daily[day] = Math.max(BASE[path.flags & 4 ? 1 : 0], sum / samples.length);
      }
    }
    function at(path, s, out) { // the point s metres along a path, and its direction
      const { p, cum } = path;
      let i = out.i ?? 0;
      while (i < cum.length - 2 && cum[i + 1] < s) i++;
      while (i > 0 && cum[i] > s) i--;
      out.i = i;
      const L = cum[i + 1] - cum[i] || 1, f = Math.max(0, Math.min(1, (s - cum[i]) / L));
      const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * i + 2], bz = p[2 * i + 3];
      out.x = ax + (bx - ax) * f; out.z = az + (bz - az) * f; out.dx = (bx - ax) / L; out.dz = (bz - az) / L;
      return out;
    }

    // --- Riders: a bike and legs, and a jersey and helmet in the rider's colour --------------------------------
    function boxes(list) {
      const pos = [], nor = [], col = [];
      for (const [x0, y0, z0, x1, y1, z1, c] of list) {
        const v = (x, y, z) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
        const faces = [[[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0]],
          [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]],
          [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, -1]]];
        for (const [a, b, c2, d, nn] of faces) for (const q of [a, b, c2, a, c2, d]) pos.push(...v(...q)), nor.push(...nn), col.push(...c);
      }
      const g = new K.BufferGeometry();
      g.setAttribute('position', new K.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('normal', new K.BufferAttribute(new Float32Array(nor), 3));
      g.setAttribute('color', new K.BufferAttribute(new Float32Array(col), 3));
      return g;
    }
    const dark = [0.16, 0.18, 0.2], tyre = [0.08, 0.08, 0.09], skin = [0.85, 0.66, 0.52];
    const bikeGeo = boxes([
      [-0.85, 0.0, -0.05, -0.35, 0.65, 0.05, tyre], [0.35, 0.0, -0.05, 0.85, 0.65, 0.05, tyre], // wheels
      [-0.6, 0.35, -0.04, 0.6, 0.55, 0.04, dark], // frame
      [-0.15, 0.45, -0.17, 0.12, 0.95, 0.17, dark], // legs
      [0.35, 1.05, -0.08, 0.5, 1.2, 0.08, skin], // arms to the bars
    ]);
    const jerseyGeo = boxes([[-0.3, 0.95, -0.2, 0.35, 1.45, 0.2, [1, 1, 1]], [0.15, 1.45, -0.13, 0.42, 1.7, 0.13, [1, 1, 1]]]);
    const mat = new K.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    const layer = life.cars?.mesh.layers.mask ?? life.cats?.mesh.layers.mask;
    const bikes = new K.InstancedMesh(bikeGeo, mat, CAP), jerseys = new K.InstancedMesh(jerseyGeo, mat, CAP);
    const Color = city.sun.color.constructor, palette = JERSEYS.map((h) => new Color(h));
    for (let i = 0; i < CAP; i++) jerseys.setColorAt(i, palette[i % palette.length]);
    for (const m of [bikes, jerseys]) {
      if (layer != null) m.layers.mask = layer;
      m.frustumCulled = false; m.count = 0; m.receiveShadow = true; m.name = 'cyclists';
      life.root.add(m);
    }

    // --- How many ride each path now, and moving them ---------------------------------------------------------------
    let total = 0;
    function retarget(minutes) { // minutes: another time of day today, for testing
      const d = brisbane(), dow = (d.getUTCDay() + 6) % 7, h = minutes != null ? minutes / 60 : d.getUTCHours() + d.getUTCMinutes() / 60;
      const prof = dow >= 5 ? WEEKEND : WEEKDAY, sum = prof.reduce((a, b) => a + b, 0);
      const a = Math.floor(h), share = (prof[a] + (prof[(a + 1) % 24] - prof[a]) * (h - a)) / sum;
      const wet = (window.__liveSky?.weather?.precip ?? 0) > 0.3 ? 0.5 : 1;
      total = 0;
      for (const path of paths) {
        const perHour = path.daily[dow] * share * wet, want = (perHour * path.len) / (6.2 * 3600);
        // a whole number of riders, the fraction drawn by chance so quiet paths sometimes have one
        let k = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
        k = Math.min(k, CAP - total);
        while (path.riders.length < k) {
          const dir = Math.random() < 0.5 ? 1 : -1;
          path.riders.push({ s: Math.random() * path.len, dir, v: SPEED[0] + Math.random() * (SPEED[1] - SPEED[0]), i: 0 });
        }
        if (path.riders.length > k) path.riders.length = k;
        total += path.riders.length;
      }
    }
    const tmp = {};
    function update(dt) {
      const zoom = Math.max(1, Math.min(3, Math.pow(city.view.span / 1500, 0.6))) * SIZE;
      const A = bikes.instanceMatrix.array, B = jerseys.instanceMatrix.array;
      let n = 0;
      for (const path of paths) {
        for (const r of path.riders) {
          if (n >= CAP) break;
          r.s += r.dir * r.v * dt;
          if (r.s > path.len) r.s -= path.len; // off one end, on again at the other: as if a new rider joined
          if (r.s < 0) r.s += path.len;
          tmp.i = r.i;
          at(path, r.s, tmp);
          r.i = tmp.i;
          if (path.flags & 2) continue; // in a tunnel
          const edge = Math.min(r.s, path.len - r.s), k = zoom * Math.min(1, edge / 12 + 0.05); // grow in and fade out at the ends
          const y = path.flags & 1 && T ? T.deckAt(tmp.x, tmp.z, 8) ?? ground(tmp.x, tmp.z) + 0.3 : ground(tmp.x, tmp.z) + 0.3;
          const fx = tmp.dx * r.dir, fz = tmp.dz * r.dir;
          // keep left, as Brisbane does: a metre to the rider's left of the path's middle
          const ox = fz * 1.0, oz = -fx * 1.0;
          const m = [fx * k, 0, fz * k, 0, 0, k, 0, 0, -fz * k, 0, fx * k, 0, tmp.x + ox, y, tmp.z + oz, 1];
          A.set(m, n * 16); B.set(m, n * 16);
          n++;
        }
      }
      bikes.count = jerseys.count = n;
      bikes.instanceMatrix.needsUpdate = jerseys.instanceMatrix.needsUpdate = true;
    }
    const lifeUpdate = life.update.bind(life);
    life.update = (dt) => { lifeUpdate(dt); if (life.visible) update(dt); };

    retarget();
    setInterval(() => retarget(), 60000);
    const footer = document.querySelector('footer'), credit = document.createElement('span');
    credit.className = 'live-cyclists';
    credit.textContent = " · Cyclists: simulated from Brisbane City Council's bike counts (CC BY 4.0)";
    footer?.append(credit);
    window.__liveCyclists = { paths, get total() { return total; }, retarget };
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.life) { clearInterval(wait); start(); }
  }, 200);
})();
