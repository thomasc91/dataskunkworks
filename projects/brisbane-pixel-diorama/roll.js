// Roll mode for the Brisbane pixel diorama: a Katamari Damacy-style game. Added 19 Oct 2026.
//
// The Roll button opens the map with ?mode=roll. You push a sticky ball round Brisbane, starting in West End;
// anything smaller than it sticks to it and makes it bigger, and anything bigger bounces it back. It starts 2.4 m
// across, among the people on the footpaths (8,000 simulated walkers, thickest in the CBD, South Bank, West End
// and the Valley) and the benches, bins and picnic tables (OpenStreetMap's street furniture, props.json from
// roll/build_props.py). Both are drawn only in this mode. At 6 m it takes cars, cyclists and small trees, at about 20 m
// houses, at 150 to 250 m the CBD towers, and at about 400 m the Brisbane Skytower.
// The river stops it until it's 80 m across, then it wades. Everything it picks up stays gone until the page reloads:
// the buildings (hidden by id in the renderer's shader, shadows and edge lines too), the trees, the simulated cars,
// the cyclists, and the live buses, Metro and trains.
//
// Arrow keys or WASD: up rolls forward, down rolls back, left and right turn (the camera follows behind). On a touch
// screen or with the mouse, drag: up and down to roll, sideways to turn. Esc or "Back to the map" leaves.
(() => {
  const Q = new URLSearchParams(location.search);
  const rolling = Q.get('mode') === 'roll';
  const go = (on) => { const q = new URLSearchParams(location.search); on ? q.set('mode', 'roll') : q.delete('mode'); location.search = q.toString(); };
  document.getElementById('rollMode')?.addEventListener('click', () => go(true));
  if (!rolling) return;

  const START = [-27.4816, 153.0101]; // Boundary Street, West End, by Vulture Street
  // where people are thickest on the footpaths: the Queen Street Mall, South Bank, Boundary Street and the Valley
  const CROWDS = [[-27.4698, 153.0251], [-27.4810, 153.0230], [-27.4812, 153.0095], [-27.4570, 153.0350]];
  const PEOPLE = 8000, WALK = [1.1, 1.7]; // m/s
  const SHIRTS = ['#e2453b', '#2f5fa8', '#f6c453', '#3a9b5c', '#ffffff', '#1d1f22', '#ff7a2f', '#7a3fa0', '#33b5c8', '#e8d6b9', '#c94f7c'];
  const R0 = 1.2; // m: the ball's radius to begin with
  const PICK = 2.2; // it picks up things up to PICK times its radius in size
  const GROW = 1.2; // how much of a thing's volume the ball gains (more than it really holds: it's a game)
  const SWIM = 40; // m: the radius at which it can wade through the river
  const GOALS = [6, 20, 50, 120, 250, 400]; // m across
  const GOAL_NOTES = ['Cars, cyclists and small trees next.', 'Houses are fair game now.', 'Apartment blocks next.',
    'Now for the office towers.', 'The CBD is in reach.', 'Nothing in Brisbane is bigger than you.'];
  // street furniture: real size [width, height, depth] in m, colour, and what the toast calls it
  const PROPS = {
    bench: [1.8, 0.9, 0.6, '#8a5a3c', 'a bench'], waste_basket: [0.6, 1, 0.6, '#2f5d3a', 'a bin'],
    picnic_table: [2, 0.8, 1.6, '#9a6a44', 'a picnic table'], bbq: [1.4, 1, 0.8, '#5b5f63', 'a barbecue'],
    drinking_water: [0.4, 1, 0.4, '#7f97a6', 'a drinking fountain'], bicycle_parking: [2, 0.8, 0.6, '#c9ced3', 'a bike rack'],
    post_box: [0.5, 1.2, 0.5, '#d4202a', 'a post box'], telephone: [0.9, 2.2, 0.9, '#3b6fb6', 'a phone booth'],
    vending_machine: [1, 1.9, 0.8, '#d23a3a', 'a vending machine'], street_lamp: [0.25, 6, 0.25, '#8f989d', 'a street lamp'],
    bus_stop: [0.3, 2.6, 0.3, '#f2c21b', 'a bus stop sign'], street_cabinet: [1, 1.4, 0.5, '#aab2b7', 'a street cabinet'],
    recycling: [1.2, 1.3, 1, '#e0b83a', 'a recycling bin'], shelter: [4, 2.8, 2, '#b9c1c6', 'a shelter'],
    fire_hydrant: [0.2, 0.9, 0.2, '#f4f4f0', 'a hydrant marker'],
  };
  const PROP_SCALE = 1.4, PROP_GROW = 3; // drawn a little bigger than life, and worth more, so the start isn't slow
  const TYPES = { house: 'a house', detached: 'a house', residential: 'a house', semidetached_house: 'a house', terrace: 'a terrace',
    apartments: 'an apartment block', retail: 'a shop', commercial: 'an office block', office: 'an office block', garage: 'a garage',
    garages: 'some garages', roof: 'a shelter', shed: 'a shed', school: 'a school building', carport: 'a carport', church: 'a church',
    civic: 'a civic building', industrial: 'a warehouse', warehouse: 'a warehouse', hospital: 'a hospital building', hotel: 'a hotel',
    university: 'a university building', public: 'a public building', train_station: 'a station', service: 'a service building' };

  // --- Looks: hide the map's controls, show the game's ----------------------------------------------------------
  const css = document.createElement('style');
  css.textContent = `
    body.rolling header, body.rolling .toolbar, body.rolling #hint, body.rolling #card, body.rolling #labels { display: none !important; }
    #rollHud { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 40; text-align: center; pointer-events: none;
      background: color-mix(in srgb, var(--panel) 92%, transparent); color: var(--ink); border-radius: 12px; padding: 8px 16px 9px;
      box-shadow: 0 2px 0 var(--shadow, rgba(0,0,0,.15)); min-width: 220px; }
    #rollHud .size { font: 800 30px/1.05 'JetBrains Mono', monospace; letter-spacing: -.02em; }
    #rollHud .meta, #rollHud .goal { font: 600 12.5px/1.35 'Hanken Grotesk', system-ui, sans-serif; color: var(--muted); }
    #rollToast { position: fixed; top: 112px; left: 50%; transform: translateX(-50%); z-index: 40; pointer-events: none;
      font: 700 15px 'Hanken Grotesk', system-ui, sans-serif; color: var(--ink); background: var(--panel); border-radius: 9px;
      padding: 6px 12px; opacity: 0; transition: opacity .25s; white-space: nowrap; }
    #rollToast.on { opacity: 1; }
    #rollBanner { position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%); z-index: 41; pointer-events: none; text-align: center;
      font: 800 28px/1.2 'Hanken Grotesk', system-ui, sans-serif; color: var(--ink); background: var(--panel); border-radius: 14px;
      padding: 14px 22px; max-width: min(560px, calc(100vw - 32px)); opacity: 0; transition: opacity .4s; }
    #rollBanner.on { opacity: 1; }
    #rollBanner small { display: block; margin-top: 6px; font: 500 14px/1.4 'Hanken Grotesk', system-ui, sans-serif; color: var(--muted); }
    #rollExit { position: fixed; top: 14px; right: 14px; z-index: 40; height: 36px; padding: 0 12px; border: 0; border-radius: 9px;
      background: var(--panel); color: var(--ink); font: 600 13px 'Hanken Grotesk', system-ui, sans-serif; cursor: pointer;
      box-shadow: 0 2px 0 var(--shadow, rgba(0,0,0,.15)); }
    #rollHelp { position: fixed; bottom: 42px; left: 50%; transform: translateX(-50%); z-index: 40; pointer-events: none; text-align: center;
      font: 600 13px/1.4 'Hanken Grotesk', system-ui, sans-serif; color: var(--muted); background: color-mix(in srgb, var(--panel) 88%, transparent);
      border-radius: 9px; padding: 6px 12px; max-width: calc(100vw - 32px); transition: opacity .6s; }
    @media (max-width: 560px) { #rollHud { top: 10px; min-width: 0; padding: 6px 12px; } #rollHud .size { font-size: 24px; }
      #rollExit { top: 10px; left: 10px; right: auto; } #rollToast { top: 92px; } #rollHelp { bottom: 112px; } }
  `;
  document.head.append(css);
  document.body.classList.add('rolling');
  const el = (tag, id, html = '') => { const e = document.createElement(tag); e.id = id; e.innerHTML = html; document.body.append(e); return e; };
  const hud = el('div', 'rollHud', '<div class="size">2.40 m</div><div class="meta">Loading Brisbane…</div><div class="goal"></div>');
  const toast = el('div', 'rollToast'), banner = el('div', 'rollBanner');
  const exit = el('button', 'rollExit', 'Back to the map');
  exit.type = 'button';
  exit.addEventListener('click', () => go(false));
  const touch = matchMedia('(pointer: coarse)').matches;
  exit.textContent = innerWidth <= 560 ? 'Map' : 'Back to the map';
  const help = el('div', 'rollHelp', touch ? 'Drag up to roll, and sideways to turn. Anything smaller than the ball sticks to it.'
    : 'Arrow keys or WASD to roll and turn, or drag. Anything smaller than the ball sticks to it.');

  async function start() {
    const D = window.__dio, K = window.__terrain?.K, { city, data, life } = D;
    if (!K?.MeshDepthMaterial || !life?.cars) { hud.querySelector('.meta').textContent = 'Roll mode needs the full map.'; return; }
    const T = D.terrain;
    const [ox, oz] = data.origin, [ccx, ccz, cr] = data.circle;
    const MX = 111320 * Math.cos((oz * Math.PI) / 180), MZ = 110540;
    const toXZ = (lat, lng) => [(lng - ox) * MX, -(lat - oz) * MZ];
    const Color = city.sun.color.constructor;
    const layer = life.cars.mesh.layers.mask;
    if (document.getElementById('traffic')?.getAttribute('aria-pressed') !== 'true') document.getElementById('traffic')?.click(); // keeps the frames coming

    // --- Hiding rolled-up buildings: a texture of building ids, read in the buildings' shader and their shadows -----
    const goneData = new Uint8Array(256 * 256 * 4), goneTex = new K.DataTexture(goneData, 256, 256);
    goneTex.needsUpdate = true;
    const uGone = { value: goneTex };
    const hideIn = (sh) => {
      sh.uniforms.uGone = uGone;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform sampler2D uGone;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (texelFetch(uGone, ivec2(int(mod(aBid, 256.0)), int(aBid / 256.0)), 0).r > 0.5) transformed = vec3(0.0);');
    };
    const bmat = city.mats.building, base = bmat.onBeforeCompile;
    bmat.onBeforeCompile = (sh, r) => { base.call(bmat, sh, r); hideIn(sh); };
    bmat.needsUpdate = true;
    const depth = new K.MeshDepthMaterial({ depthPacking: 3201 /* RGBA, as the shadow map's own */ });
    depth.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aBid;');
      hideIn(sh);
    };
    for (const m of city.buildings?.children || []) m.customDepthMaterial = depth;
    // and from the pixel finish's edge lines, which come from a render of every surface's normal (other things have
    // no building id there, so they read 0; building 0 keeps its edges, which nobody will notice)
    const nmat = city.pixelPass?.normalMaterial;
    if (nmat) {
      const nb = nmat.onBeforeCompile;
      nmat.onBeforeCompile = (sh, rr) => {
        nb?.call(nmat, sh, rr);
        sh.uniforms.uGone = uGone;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aBid;\nuniform sampler2D uGone;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (aBid > 0.5 && texelFetch(uGone, ivec2(int(mod(aBid, 256.0)), int(aBid / 256.0)), 0).r > 0.5) transformed = vec3(0.0);');
      };
      nmat.needsUpdate = true;
    }

    // --- What there is to roll up, in grids -----------------------------------------------------------------------
    const CELL = 40;
    const key = (i, j) => i * 100003 + j;
    const add = (grid, x, z, v) => { const k = key(Math.floor(x / CELL), Math.floor(z / CELL)); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(v); };
    function near(grid, x, z, reach, fn) {
      const r = Math.ceil(reach / CELL), gi = Math.floor(x / CELL), gj = Math.floor(z / CELL);
      for (let i = gi - r; i <= gi + r; i++) for (let j = gj - r; j <= gj + r; j++) { const a = grid.get(key(i, j)); if (a) for (const v of a) fn(v); }
    }
    // buildings: each part's outline, drawn height and size, by building id
    const parts = [], byBid = new Map(), bgrid = new Map();
    for (const [h, pts, , , , bid] of data.buildings) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, area = 0, cx = 0, cz = 0;
      const n = pts.length / 2;
      for (let i = 0; i < n; i++) {
        const x = pts[2 * i], z = pts[2 * i + 1], x2 = pts[(2 * i + 2) % pts.length], z2 = pts[(2 * i + 3) % pts.length];
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
        area += x * z2 - x2 * z; cx += x; cz += z;
      }
      const H = h * 1.6, long = Math.max(x1 - x0, z1 - z0);
      const p = { bid, pts, x0, x1, z0, z1, cx: cx / n, cz: cz / n, H, w: x1 - x0, d: z1 - z0,
        size: Math.max(H, 0.55 * long), vol: (Math.abs(area) / 2) * H * 0.7, gone: false };
      parts.push(p);
      if (!byBid.has(bid)) byBid.set(bid, []);
      byBid.get(bid).push(p);
      for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
        for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) { const k = key(i, j); let a = bgrid.get(k); if (!a) bgrid.set(k, (a = [])); a.push(p); }
    }
    // trees: straight from the renderer's instanced trees
    const tgrid = new Map(), trees = [];
    (city.treeMeshes || []).forEach((m, mi) => {
      const a = m.instanceMatrix.array;
      for (let i = 0; i < m.count; i++) {
        const o = i * 16, s = Math.hypot(a[o], a[o + 2]), sy = a[o + 5];
        if (!s) continue;
        const t = { m: mi, i, x: a[o + 12], y: a[o + 13], z: a[o + 14], s, sy, size: Math.max(2 * s, 2 * sy), gone: false };
        trees.push(t);
        add(tgrid, t.x, t.z, t);
      }
    });

    // street furniture, drawn only in this mode
    const pgrid = new Map(), props = [];
    let propMesh = null;
    try {
      const r = await fetch('props.json');
      const pj = r.ok ? await r.json() : null;
      if (pj) {
        const n = pj.props.length / 3;
        propMesh = new K.InstancedMesh(new K.BoxGeometry(1, 1, 1), new K.MeshStandardMaterial({ roughness: 0.8 }), n);
        const A = propMesh.instanceMatrix.array, C = new Color();
        for (let k = 0; k < n; k++) {
          const kind = pj.kinds[pj.props[3 * k]], spec = PROPS[kind], x = pj.props[3 * k + 1], z = pj.props[3 * k + 2];
          if (!spec) continue;
          const [w, h, d, hex, name] = spec, W = w * PROP_SCALE, H = h * 1.6 * PROP_SCALE, Dp = d * PROP_SCALE;
          const a = ((Math.sin(k * 12.9898) * 43758.5453) % 1) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), y = (T ? T.h(x, z) : 0) + H / 2;
          A.set([c * W, 0, -sn * W, 0, 0, H, 0, 0, sn * Dp, 0, c * Dp, 0, x, y, z, 1], k * 16);
          propMesh.setColorAt(k, C.set(hex));
          const p = { k, x, z, y, W, H, D: Dp, size: Math.max(W, H, Dp), vol: W * H * Dp * 0.5, colour: [C.r, C.g, C.b], name, gone: false };
          props.push(p);
          add(pgrid, x, z, p);
        }
        propMesh.instanceMatrix.needsUpdate = true;
        propMesh.castShadow = propMesh.receiveShadow = true; propMesh.frustumCulled = false; propMesh.name = 'props';
        city.scene.add(propMesh);
      }
    } catch { /* no props: the game starts with cars */ }

    // --- People: simulated walkers on the footpaths, for the ball to start on -----------------------------------
    const walkways = [], crowd = CROWDS.map((ll) => toXZ(...ll));
    let wsum = 0;
    for (const [type, , , w, , , p] of data.traffic?.edges || []) {
      if (type !== 0 || w > 12) continue; // not motorways, tunnels or bridges
      let len = 0;
      for (let i = 0; i + 3 < p.length; i += 2) len += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
      if (len < 10) continue;
      const mx = p[0], mz = p[1];
      const busy = 0.15 + crowd.reduce((s, [x, z]) => s + 12 * Math.exp(-Math.hypot(mx - x, mz - z) / 650), 0);
      wsum += len * busy;
      walkways.push({ p, len, w, cum: wsum });
    }
    const people = [], pick01 = (u) => { let lo = 0, hi = walkways.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (walkways[m].cum < u * wsum) lo = m + 1; else hi = m; } return walkways[lo]; };
    for (let n = 0; n < PEOPLE && walkways.length; n++) {
      const wk = pick01(Math.random());
      people.push({ wk, s: Math.random() * wk.len, dir: Math.random() < 0.5 ? 1 : -1, v: WALK[0] + Math.random() * (WALK[1] - WALK[0]),
        side: (Math.random() < 0.5 ? -1 : 1) * (wk.w / 2 + 1.6), i: 0, x: 0, z: 0, gone: false });
    }
    const personGeo = (() => { // 1 unit tall: legs, a shirt (tinted per person), a head
      const g = boxes([[-0.1, 0, -0.14, 0.1, 0.45, 0.14, '#2b2f36'], [-0.12, 0.45, -0.2, 0.12, 0.8, 0.2, '#ffffff'], [-0.09, 0.8, -0.09, 0.09, 1, 0.09, '#d9a885']]);
      return g;
    })();
    const PH = 1.7 * 1.4; // drawn height, like the props a little bigger than life
    const crowdMesh = new K.InstancedMesh(personGeo, new K.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), people.length || 1);
    { const c = new Color(); people.forEach((q, n) => crowdMesh.setColorAt(n, c.set(SHIRTS[n % SHIRTS.length]))); }
    crowdMesh.layers.mask = layer; crowdMesh.frustumCulled = false; crowdMesh.castShadow = false; crowdMesh.name = 'people';
    life.root.add(crowdMesh);
    function walk(dt) {
      const A = crowdMesh.instanceMatrix.array;
      people.forEach((q, n) => {
        const o = n * 16;
        if (q.gone) { for (let k = 0; k < 11; k++) A[o + k] = 0; return; }
        q.s += q.dir * q.v * dt * 1.8; // a bit brisk, like the cars
        if (q.s > q.wk.len) { q.s = q.wk.len; q.dir = -1; }
        if (q.s < 0) { q.s = 0; q.dir = 1; }
        const p = q.wk.p;
        let i = q.i, acc = 0;
        // walk the polyline to s (people move a little each frame, so start from the last segment)
        for (i = 0, acc = 0; i + 3 < p.length; i += 2) { const L = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]); if (acc + L >= q.s) break; acc += L; }
        if (i + 3 >= p.length) i = p.length - 4;
        const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az, L = Math.hypot(dx, dz) || 1, f = Math.min(1, (q.s - acc) / L);
        const ux = dx / L, uz = dz / L, x = ax + dx * f - uz * q.side, z = az + dz * f + ux * q.side;
        q.x = x; q.z = z;
        const hx = ux * q.dir, hz = uz * q.dir, y = ground(x, z);
        A.set([hx * PH, 0, hz * PH, 0, 0, PH, 0, 0, -hz * PH, 0, hx * PH, 0, x, y, z, 1], o);
      });
      crowdMesh.count = people.length;
      crowdMesh.instanceMatrix.needsUpdate = true;
    }

    // --- A cutaway: buildings, trees and props between the camera and the ball are see-through near it -------------
    const V3 = city.camera.position.constructor;
    const uBall = { value: new V3() }, uToCam = { value: new V3(0, 1, 0) }, uCut = { value: 0 }, uNear = { value: 0 };
    function cutaway(mat) {
      if (!mat || mat.userData.cutaway) return;
      mat.userData.cutaway = true;
      const prev = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh, rr) => {
        prev?.call(mat, sh, rr);
        Object.assign(sh.uniforms, { uBall, uToCam, uCut, uNear });
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRollW;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec4 rp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nrp = instanceMatrix * rp;\n#endif\nvRollW = (modelMatrix * rp).xyz; }');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRollW; uniform vec3 uBall; uniform vec3 uToCam; uniform float uCut; uniform float uNear;')
          .replace('void main() {', 'void main() {\nif (uCut > 0.0) { vec3 d = vRollW - uBall; float a = dot(d, uToCam); if (a > uNear && length(d - a * uToCam) < uCut) discard; }');
      };
      mat.needsUpdate = true;
    }
    cutaway(bmat);
    for (const m of city.treeMeshes || []) cutaway(m.material);
    if (propMesh) cutaway(propMesh.material);

    // --- The ball, the prince who pushes it, its shadow, and what's stuck to it -------------------------------------
    function geo(pos, col, nor) {
      const g = new K.BufferGeometry();
      g.setAttribute('position', new K.BufferAttribute(new Float32Array(pos), 3));
      if (nor) g.setAttribute('normal', new K.BufferAttribute(new Float32Array(nor), 3));
      if (col) g.setAttribute('color', new K.BufferAttribute(new Float32Array(col), 3));
      return g;
    }
    const ballGeo = (() => { // an icosphere, twice divided, flat-shaded in Katamari pinks
      const t = (1 + Math.sqrt(5)) / 2;
      let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
        .map((p) => { const l = Math.hypot(...p); return p.map((c) => c / l); });
      let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2],
        [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
      for (let k = 0; k < 2; k++) {
        const mid = new Map(), m = (a, b) => {
          const id = a < b ? a * 1e4 + b : b * 1e4 + a;
          if (!mid.has(id)) { const p = v[a].map((c, i) => (c + v[b][i]) / 2), l = Math.hypot(...p); v.push(p.map((c) => c / l)); mid.set(id, v.length - 1); }
          return mid.get(id);
        };
        f = f.flatMap(([a, b, c]) => { const ab = m(a, b), bc = m(b, c), ca = m(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; });
      }
      const pal = ['#e8478b', '#f07aa8', '#d63a7a', '#f6a5c4', '#ff5fa2', '#c92f6d'].map((h) => new Color(h));
      const pos = [], col = [], nor = [];
      f.forEach(([a, b, c], k) => {
        const n = [0, 1, 2].map((i) => (v[a][i] + v[b][i] + v[c][i]) / 3), l = Math.hypot(...n), cc = pal[(k * 7 + (k >> 3)) % pal.length];
        for (const p of [v[a], v[b], v[c]]) pos.push(...p), nor.push(...n.map((q) => q / l)), col.push(cc.r, cc.g, cc.b);
      });
      return geo(pos, col, nor);
    })();
    function boxes(list) { // [x0, y0, z0, x1, y1, z1, colour]
      const pos = [], nor = [], col = [];
      for (const [x0, y0, z0, x1, y1, z1, hex] of list) {
        const c = new Color(hex), v = (x, y, z) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
        const faces = [[[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0]],
          [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]],
          [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, -1]]];
        for (const [a, b, c2, d, n] of faces) for (const p of [a, b, c2, a, c2, d]) pos.push(...v(...p)), nor.push(...n), col.push(c.r, c.g, c.b);
      }
      return geo(pos, col, nor);
    }
    // the prince: 1 unit tall, facing +x
    const princeGeo = boxes([
      [-0.08, 0, -0.16, 0.08, 0.28, -0.04, '#2f6b2a'], [-0.08, 0, 0.04, 0.08, 0.28, 0.16, '#2f6b2a'], // legs
      [-0.12, 0.28, -0.2, 0.12, 0.58, 0.2, '#5bb342'], // body
      [0.04, 0.42, -0.3, 0.3, 0.5, -0.2, '#5bb342'], [0.04, 0.42, 0.2, 0.3, 0.5, 0.3, '#5bb342'], // arms out to the ball
      [-0.18, 0.58, -0.36, 0.18, 0.86, 0.36, '#7ccf5f'], // the wide head
      [0.18, 0.66, -0.1, 0.19, 0.76, 0.1, '#2b2622'], // face
      [-0.02, 0.86, -0.02, 0.02, 1.1, 0.02, '#e9d24a'], [-0.05, 1.1, -0.05, 0.05, 1.18, 0.05, '#f3d33b'], // antenna
    ]);
    const lambert = (opts = {}) => new K.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, ...opts });
    const ball = new K.Mesh(ballGeo, lambert({ roughness: 0.55 })), prince = new K.Mesh(princeGeo, lambert());
    const disc = (() => {
      const pos = [];
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2, b = ((k + 1) / 24) * Math.PI * 2;
        pos.push(0, 0, 0, Math.cos(b), 0, Math.sin(b), Math.cos(a), 0, Math.sin(a));
      }
      return new K.Mesh(geo(pos), new K.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }));
    })();
    const stuckCars = new K.InstancedMesh(life.cars.mesh.geometry, life.cars.mesh.material, 700);
    const treeMesh = city.treeMeshes?.[0];
    const stuckTrees = treeMesh ? new K.InstancedMesh(treeMesh.geometry, treeMesh.material, 900) : null;
    const unit = new K.BoxGeometry(1, 1, 1);
    const stuckBoxes = new K.InstancedMesh(unit, new K.MeshStandardMaterial({ roughness: 0.8 }), 700);
    for (const m of [ball, prince, disc, stuckCars, stuckTrees, stuckBoxes]) {
      if (!m) continue;
      m.layers.mask = layer; m.frustumCulled = false; m.matrixAutoUpdate = false; m.castShadow = false; m.name = 'roll';
      if (m.isInstancedMesh) m.count = 0;
      life.root.add(m);
    }
    stuckCars.setColorAt(0, new Color('#ffffff')); stuckBoxes.setColorAt(0, new Color('#ffffff'));
    if (stuckTrees) stuckTrees.setColorAt(0, new Color('#5a8f4c'));

    // --- The ball's state -------------------------------------------------------------------------------------------
    const ground = (x, z) => (T ? T.h(x, z) : 0);
    const deck = (x, z, r) => (T ? T.deckAt(x, z, Math.min(30, r)) : null);
    const wet = (x, z) => !!(T && T.inWater(x, z));
    // start on the footpath of the road nearest Boundary Street, West End
    let [px, pz] = toXZ(...START);
    {
      let best = Infinity, bx = px, bz = pz;
      for (const [type, , , w, , , p] of data.traffic?.edges || []) {
        if (type !== 0 || w < 8) continue;
        for (let i = 0; i + 3 < p.length; i += 2) {
          const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
          const d = (ax + dx * t - px) ** 2 + (az + dz * t - pz) ** 2;
          if (d < best) (best = d), (bx = ax + dx * t), (bz = az + dz * t);
        }
      }
      (px = bx), (pz = bz);
      px += 7; // off the road, onto the footpath
    }
    let r = R0, vx = 0, vz = 0, az = 135, py = ground(px, pz) + r;
    const Rm = [1, 0, 0, 0, 1, 0, 0, 0, 1]; // the ball's rotation, row-major
    const stats = { car: 0, tree: 0, building: 0, cyclist: 0, bus: 0, train: 0, names: [], biggest: null };
    let clock = 0, goal = 0, shake = 0, toastAt = -9, bannerAt = -9, things = 0, finished = false;
    const stuck = { car: [], tree: [], box: [] }, CAP = { car: 700, tree: 900, box: 700 };

    function rotate(ax, ay, azz, ang) { // Rm = Rot(axis, ang) · Rm
      const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
      const R = [t * ax * ax + c, t * ax * ay - s * azz, t * ax * azz + s * ay, t * ax * ay + s * azz, t * ay * ay + c, t * ay * azz - s * ax,
        t * ax * azz - s * ay, t * ay * azz + s * ax, t * azz * azz + c];
      const o = Rm.slice();
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) Rm[i * 3 + j] = R[i * 3] * o[j] + R[i * 3 + 1] * o[3 + j] + R[i * 3 + 2] * o[6 + j];
    }
    const mulT = (v) => [Rm[0] * v[0] + Rm[3] * v[1] + Rm[6] * v[2], Rm[1] * v[0] + Rm[4] * v[1] + Rm[7] * v[2], Rm[2] * v[0] + Rm[5] * v[1] + Rm[8] * v[2]];
    const mul = (v) => [Rm[0] * v[0] + Rm[1] * v[1] + Rm[2] * v[2], Rm[3] * v[0] + Rm[4] * v[1] + Rm[5] * v[2], Rm[6] * v[0] + Rm[7] * v[1] + Rm[8] * v[2]];

    // Stick a thing to the ball where it touched: its up along the ball's radius, its length across the roll.
    function stick(kind, wx, wy, wz, dims, colour) {
      let dx = wx - px, dy = wy - py, dz = wz - pz, l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      const u = mulT([dx, dy, dz]); // in the ball's own frame
      let t = Math.abs(u[1]) < 0.9 ? [u[2], 0, -u[0]] : [1, 0, 0], tl = Math.hypot(...t);
      t = t.map((c) => c / tl);
      const s = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
      const sink = kind === 'box' ? r * 0.78 + dims[1] / 2 : r * 0.8;
      const list = stuck[kind];
      list.push({ p: u.map((c) => c * sink), t, u, s, dims, colour });
      if (list.length > CAP[kind]) list.shift(); // the oldest are deep inside by now
    }

    function say(text, big) {
      toast.textContent = text; toast.classList.add('on'); toastAt = clock;
      if (big) { banner.innerHTML = big; banner.classList.add('on'); bannerAt = clock; }
    }
    function grow(vol) { r = Math.cbrt(r ** 3 + vol * GROW * 0.239); }
    const fmt = (m) => (m >= 100 ? `${Math.round(m)} m` : m >= 10 ? `${m.toFixed(1)} m` : `${m.toFixed(2)} m`);
    const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    // --- Picking things up ---------------------------------------------------------------------------------------------
    const carA = () => life.cars.mesh.instanceMatrix.array, carC = life.cars.mesh.instanceColor?.array;
    const goneCars = new Set();
    let treesDirty = new Set(), buildingsDirty = false, picksThisFrame = 0;
    function pickAll() {
      const cap = PICK * r, reach = r * 1.05;
      picksThisFrame = 0;
      let best = null;
      const note = (name, size) => { things++; if (!best || size > best.size) best = { name, size }; };
      // people
      if (cap >= PH) for (const q of people) {
        if (q.gone || picksThisFrame > 150 || Math.abs(q.x - px) > reach + 2 || Math.abs(q.z - pz) > reach + 2) continue;
        if (Math.hypot(q.x - px, q.z - pz) > reach + 0.6) continue;
        q.gone = true; picksThisFrame++; stats.person = (stats.person || 0) + 1;
        const c = crowdMesh.instanceColor.array;
        stick('box', q.x, ground(q.x, q.z) + PH / 2, q.z, [0.6 * 1.4, PH, 0.45 * 1.4], [c[people.indexOf(q) * 3], c[people.indexOf(q) * 3 + 1], c[people.indexOf(q) * 3 + 2]]);
        grow(0.25 * PROP_GROW * 6); note('a person', PH);
      }
      // street furniture
      let propsDirty = false;
      near(pgrid, px, pz, reach + 6, (p) => {
        if (p.gone || picksThisFrame > 150 || Math.hypot(p.x - px, p.z - pz) > reach + p.size * 0.3) return;
        if (p.size > cap) { // a lamp post or shelter too big yet: a knock
          const dx = px - p.x, dz = pz - p.z, l = Math.hypot(dx, dz) || 1, vn = (vx * dx + vz * dz) / l;
          if (vn < 0) { vx -= 1.3 * vn * (dx / l); vz -= 1.3 * vn * (dz / l); }
          return;
        }
        p.gone = true; propsDirty = true; picksThisFrame++;
        const A = propMesh.instanceMatrix.array;
        for (let q = 0; q < 11; q++) A[p.k * 16 + q] = 0;
        stick('box', p.x, p.y, p.z, [p.W, p.H, p.D], p.colour);
        grow(p.vol * PROP_GROW); note(p.name, p.size);
        stats.prop = (stats.prop || 0) + 1;
      });
      if (propsDirty) { propMesh.instanceMatrix.needsUpdate = true; city.invalidate(); }
      // cars (6.6 m, drawn): too big at first, so the ball bumps off them
      if (cap < 6.6) {
        const a = carA(), n = life.cars.mesh.count;
        for (let i = 0; i < n; i++) {
          const o = i * 16;
          if (!a[o] && !a[o + 2]) continue;
          const dx = px - a[o + 12], dz = pz - a[o + 14], l = Math.hypot(dx, dz);
          if (l > r + 2.6 || l < 1e-6) continue;
          const vn = (vx * dx + vz * dz) / l;
          px += (dx / l) * (r + 2.6 - l); pz += (dz / l) * (r + 2.6 - l);
          if (vn < 0) { vx -= 1.4 * vn * (dx / l); vz -= 1.4 * vn * (dz / l); }
        }
      }
      if (cap >= 6.6) {
        const a = carA(), n = life.cars.mesh.count;
        for (let i = 0; i < n && picksThisFrame < 80; i++) {
          const o = i * 16;
          if (goneCars.has(i) || (!a[o] && !a[o + 2])) continue;
          const x = a[o + 12], z = a[o + 14];
          if ((x - px) ** 2 + (z - pz) ** 2 > (reach + 3) ** 2) continue;
          goneCars.add(i); stats.car++; picksThisFrame++;
          stick('car', x, a[o + 13] + 1.2, z, [1, 1, 1], carC ? [carC[i * 3], carC[i * 3 + 1], carC[i * 3 + 2]] : [1, 1, 1]);
          grow(23); note('a car', 6.6);
        }
      }
      // trees
      near(tgrid, px, pz, reach + 12, (t) => {
        if (t.gone || picksThisFrame > 150) return;
        const d = Math.hypot(t.x - px, t.z - pz);
        if (t.size > cap) { // too big: it rolls under the branches and knocks the trunk
          const trunk = r + 0.25 * t.s;
          if (d < trunk && d > 1e-6) {
            const nx = (px - t.x) / d, nz = (pz - t.z) / d, vn = vx * nx + vz * nz;
            px += nx * (trunk - d); pz += nz * (trunk - d);
            if (vn < 0) { vx -= 1.3 * vn * nx; vz -= 1.3 * vn * nz; }
          }
          return;
        }
        if (d > reach + t.s * 0.6) return;
        t.gone = true; stats.tree++; picksThisFrame++;
        const m = city.treeMeshes[t.m], a = m.instanceMatrix.array, o = t.i * 16;
        for (let q = 0; q < 11; q++) a[o + q] = 0;
        treesDirty.add(m);
        const c = m.instanceColor?.array;
        stick('tree', t.x, t.y + t.sy, t.z, [t.s, t.sy, t.s], c ? [c[t.i * 3], c[t.i * 3 + 1], c[t.i * 3 + 2]] : [0.35, 0.56, 0.3]);
        grow(4 * t.s * t.s * 2 * t.sy * 0.35); note('a tree', t.size);
      });
      // cyclists
      for (const d of window.__liveCyclists?.drawn || []) {
        if (cap < 3.6 || Math.hypot(d.x - px, d.z - pz) > reach + 2) continue;
        const k = d.path.riders.indexOf(d.r);
        if (k < 0) continue;
        d.path.riders.splice(k, 1); stats.cyclist++;
        stick('box', d.x, d.y + 1.5, d.z, [3.4, 3.4, 1], [0.9, 0.3, 0.25]);
        grow(6); note('a cyclist', 3.6);
      }
      // live buses and Metro, and trains
      const LB = window.__liveBuses;
      for (const d of LB?.drawn || []) {
        const size = d.b.metro ? 30 : 15.6;
        if (size > cap || LB.gone.has(d.b) || Math.hypot(d.x - px, d.z - pz) > reach + size / 3) continue;
        LB.gone.add(d.b); stats.bus++;
        stick('box', d.x, d.y + 2, d.z, [size, 4.2, 3.3], d.b.metro ? [0.24, 0.56, 0.84] : [0.96, 0.96, 0.94]);
        grow(size * 3.3 * 4.2 * 0.6); note(d.b.metro ? `Metro ${d.b.ref}` : `Bus ${d.b.ref}`, size);
      }
      const LT = window.__liveTrains;
      for (const d of LT?.drawn || []) {
        if (147 > cap || LT.gone.has(d.tr) || Math.hypot(d.x - px, d.z - pz) > reach + 50) continue;
        LT.gone.add(d.tr); stats.train++;
        stick('box', d.x, d.y + 3, d.z, [147, 6.2, 3.2], [0.95, 0.95, 0.93]);
        grow(147 * 3.2 * 6.2 * 0.6); note('a train', 147);
      }
      // buildings: pick up the small ones, bounce off the big ones
      near(bgrid, px, pz, reach + 30, (p) => {
        if (p.gone || p.x1 < px - reach || p.x0 > px + reach || p.z1 < pz - reach || p.z0 > pz + reach) return;
        const [qx, qz, inside] = closest(p, px, pz), d = Math.hypot(px - qx, pz - qz);
        if (!inside && d > r * 0.92) return;
        if (p.size <= cap) {
          const all = byBid.get(p.bid);
          let vol = 0, H = 0;
          for (const q of all) { q.gone = true; vol += q.vol; H = Math.max(H, q.H); }
          goneData[p.bid * 4] = 255; buildingsDirty = true; stats.building++;
          stick('box', p.cx, ground(p.cx, p.cz) + H / 2, p.cz, [Math.max(2, p.w * 0.9), Math.max(2, H), Math.max(2, p.d * 0.9)], tint(p.bid));
          grow(vol);
          const info = data.binfo[p.bid] || [], named = info[0], tall = (info[2] ?? p.H / 1.6);
          const name = named ? (tall > 40 ? `${named} (${Math.round(tall)} m)` : named) : TYPES[info[1]] || 'a building';
          note(name, p.size + (named ? 30 : 0));
          if (named) stats.names.push(named);
          if (named === 'Brisbane Skytower' && !finished) finish();
        } else {
          // too big: push the ball out and bounce it back
          let nx = px - qx, nz = pz - qz, l = Math.hypot(nx, nz);
          if (inside || l < 1e-6) { nx = px - p.cx; nz = pz - p.cz; l = Math.hypot(nx, nz) || 1; }
          nx /= l; nz /= l;
          const push = inside ? r * 0.92 + d : r * 0.92 - d;
          px += nx * push; pz += nz * push;
          const vn = vx * nx + vz * nz;
          if (vn < 0) { vx -= 1.4 * vn * nx; vz -= 1.4 * vn * nz; if (-vn > 4) shake = 0.25; }
        }
      });
      if (best) say(`+ ${best.name}`);
    }
    function closest(p, x, z) { // the nearest point on a building's outline, and whether (x, z) is inside it
      const a = p.pts, n = a.length / 2;
      let bx = 0, bz = 0, bd = Infinity, inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const x1 = a[2 * i], z1 = a[2 * i + 1], x2 = a[2 * j], z2 = a[2 * j + 1];
        if ((z1 > z) !== (z2 > z) && x < ((x2 - x1) * (z - z1)) / (z2 - z1) + x1) inside = !inside;
        const dx = x2 - x1, dz = z2 - z1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz || 1)));
        const qx = x1 + dx * t, qz = z1 + dz * t, d = (x - qx) ** 2 + (z - qz) ** 2;
        if (d < bd) (bd = d), (bx = qx), (bz = qz);
      }
      return [bx, bz, inside];
    }
    const WALLS = ['#f3ede2', '#efe6d6', '#e8eef2', '#dfe6ea', '#f6f1e7', '#c8693f', '#9fb3bf'].map((h) => new Color(h));
    const tint = (bid) => { const c = WALLS[bid % WALLS.length]; return [c.r, c.g, c.b]; };

    function finish() {
      finished = true;
      const named = [...new Set(stats.names)].slice(-3);
      const n = (v, one, many) => (v ? [`${v.toLocaleString()} ${v === 1 ? one : many}`] : []);
      const list = [...n(stats.building, 'building', 'buildings').map((t) => (named.length ? `${t} (${named.join(', ')} among them)` : t)),
        ...n(stats.tree, 'tree', 'trees'), ...n(stats.car, 'car', 'cars'), ...n(stats.bus, 'bus', 'buses'), ...n(stats.train, 'train', 'trains'),
        ...n(stats.cyclist, 'cyclist', 'cyclists'), ...n(stats.person, 'person', 'people'), ...n(stats.prop, 'bit of street furniture', 'bits of street furniture')];
      const all = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0];
      say('+ Brisbane Skytower', `You rolled up Brisbane in ${mmss(clock)}<small>That's ${all}. Keep rolling.</small>`);
    }

    // --- Controls ---------------------------------------------------------------------------------------------------
    const canvas = document.getElementById('c') || city.renderer.domElement;
    const keys = new Set();
    const KEYMAP = { ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape') return go(false);
      const k = KEYMAP[e.code];
      if (!k) return;
      keys.add(k); e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) { keys.delete(k); e.preventDefault(); } }, true);
    addEventListener('blur', () => keys.clear());
    let drag = null;
    // The map's own drag-to-orbit, zoom and hover all stop here: the canvas belongs to the game.
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave', 'wheel', 'dblclick', 'contextmenu', 'click'])
      document.addEventListener(type, (e) => {
        if (e.target !== canvas) return;
        e.stopImmediatePropagation();
        if (type === 'wheel' || type === 'contextmenu') e.preventDefault();
        if (type === 'pointerdown') { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; canvas.setPointerCapture?.(e.pointerId); }
        else if (type === 'pointermove' && drag?.id === e.pointerId) { drag.dx = e.clientX - drag.x; drag.dy = e.clientY - drag.y; }
        else if ((type === 'pointerup' || type === 'pointercancel') && drag?.id === e.pointerId) drag = null;
      }, { capture: true, passive: false });
    canvas.style.touchAction = 'none';

    // --- Every frame ------------------------------------------------------------------------------------------------
    const lifeUpdate = life.update.bind(life);
    life.update = (dt) => {
      lifeUpdate(dt);
      // the cars it has taken stay off the roads
      const a = carA();
      for (const i of goneCars) for (let q = 0; q < 11; q++) a[i * 16 + q] = 0;
      life.cars.mesh.instanceMatrix.needsUpdate = true;
      step(dt);
    };
    function step(dt) {
      if (!dt) return;
      clock += dt;
      // input: forward/back along the camera's view, turning swings the camera round
      let f = (keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0), turn = (keys.has('l') ? 1 : 0) - (keys.has('r') ? 1 : 0);
      if (drag) { f = Math.max(-1, Math.min(1, -drag.dy / 90)); turn = Math.max(-1, Math.min(1, -drag.dx / 110)); }
      if (f || turn) help.style.opacity = 0;
      az = (az + turn * 105 * dt + 360) % 360;
      const ar = (az * Math.PI) / 180, fx = -Math.sin(ar), fz = -Math.cos(ar);
      const vmax = 5 + 1.8 * r, k = Math.min(1, 2.2 * dt);
      vx += (f * vmax * fx - vx) * (f ? k : k * 0.5);
      vz += (f * vmax * fz - vz) * (f ? k : k * 0.5);
      // hills: it runs downhill, and slows climbing
      const e = Math.max(2, r * 0.5), gx = (ground(px + e, pz) - ground(px - e, pz)) / (2 * e), gz = (ground(px, pz + e) - ground(px, pz - e)) / (2 * e);
      vx -= gx * 9.8 * 0.7 * dt; vz -= gz * 9.8 * 0.7 * dt;
      let nx = px + vx * dt, nz = pz + vz * dt;
      // the river, until it's big enough to wade; the edge of the map
      if (r < SWIM && wet(nx, nz) && deck(nx, nz, r) == null) { nx = px; nz = pz; vx *= -0.3; vz *= -0.3; }
      const out = Math.hypot(nx - ccx, nz - ccz) - (cr - r);
      if (out > 0) { const l = Math.hypot(nx - ccx, nz - ccz); nx -= ((nx - ccx) / l) * out; nz -= ((nz - ccz) / l) * out; vx *= 0.5; vz *= 0.5; }
      const mx = nx - px, mz = nz - pz;
      px = nx; pz = nz;
      walk(dt);
      pickAll();
      // roll: about the axis across the motion, by the distance over the radius
      const dist = Math.hypot(mx, mz);
      if (dist > 1e-4) rotate(mz / dist, 0, -mx / dist, dist / r);
      const dk = deck(px, pz, r), g = ground(px, pz);
      const floor = dk != null && dk > g - 1 ? dk - 0.8 : r >= SWIM && wet(px, pz) ? Math.max(g, -2) : g;
      py += (floor + r * 0.96 - py) * Math.min(1, 10 * dt);

      // draw the ball, the prince, the shadow and the stuck things
      const set = (m, R, sx, sy, sz, x, y, z) => {
        m.matrix.set(R[0] * sx, R[1] * sy, R[2] * sz, x, R[3] * sx, R[4] * sy, R[5] * sz, y, R[6] * sx, R[7] * sy, R[8] * sz, z, 0, 0, 0, 1);
        m.matrixWorldNeedsUpdate = true;
      };
      set(ball, Rm, r, r, r, px, py, pz);
      const sp = Math.hypot(vx, vz), hx = sp > 0.5 ? vx / sp : fx, hz = sp > 0.5 ? vz / sp : fz, ps = Math.max(1.8, Math.min(14, r * 0.45));
      const qx = px - hx * (r + ps * 0.35), qz = pz - hz * (r + ps * 0.35), qy = ground(qx, qz);
      set(prince, [hx, 0, -hz, 0, 1, 0, hz, 0, hx], ps, ps, ps, qx, Math.max(qy, py - r * 0.96), qz);
      set(disc, [1, 0, 0, 0, 1, 0, 0, 0, 1], r * 1.05, 1, r * 1.05, px, floor + 0.35, pz);
      for (const [kind, mesh] of [['car', stuckCars], ['tree', stuckTrees], ['box', stuckBoxes]]) {
        if (!mesh) continue;
        const list = stuck[kind], A = mesh.instanceMatrix.array, C = mesh.instanceColor.array;
        list.forEach((o, i) => {
          const t = mul(o.t), u = mul(o.u), s = mul(o.s), p = mul(o.p), [dx, dy, dz] = o.dims;
          A.set([t[0] * dx, t[1] * dx, t[2] * dx, 0, u[0] * dy, u[1] * dy, u[2] * dy, 0, s[0] * dz, s[1] * dz, s[2] * dz, 0, px + p[0], py + p[1], pz + p[2], 1], i * 16);
          C.set(o.colour, i * 3);
        });
        mesh.count = list.length;
        mesh.instanceMatrix.needsUpdate = mesh.instanceColor.needsUpdate = true;
      }
      for (const m of treesDirty) m.instanceMatrix.needsUpdate = true;
      if (buildingsDirty) goneTex.needsUpdate = true;
      if (treesDirty.size || buildingsDirty) city.invalidate();
      treesDirty = new Set(); buildingsDirty = false;

      // the camera: behind the ball, a little ahead of it, zooming out as it grows
      const v = city.view, span = Math.max(32, r * 17) * Math.max(0.55, Math.min(1, innerWidth / innerHeight)); // closer on a phone held upright
      const sk = shake > 0 ? (shake -= dt, (Math.random() - 0.5) * r * 0.25) : 0;
      const el = Math.max(34, Math.min(60, 60 - 6 * Math.log2(Math.max(1, r)))); // steeper while it's small, so less hides it
      Object.assign(v, { cx: px + fx * span * 0.1 + sk, cz: pz + fz * span * 0.1 + sk, span: v.span + (span - v.span) * Math.min(1, 3 * dt), azimuth: az, elevation: el });
      city.updateCamera();
      const er = (el * Math.PI) / 180, ar2 = (az * Math.PI) / 180;
      uToCam.value.set(Math.cos(er) * Math.sin(ar2), Math.sin(er), Math.cos(er) * Math.cos(ar2));
      uBall.value.set(px, py, pz);
      uCut.value = Math.max(5, r * 2.2); uNear.value = r * 1.15;

      // the HUD
      const size = 2 * r;
      while (goal < GOALS.length && size >= GOALS[goal]) {
        say(`${GOALS[goal]} m across`, `${GOALS[goal]} m!<small>${GOAL_NOTES[goal]}</small>`);
        goal++;
      }
      hud.querySelector('.size').textContent = fmt(size);
      hud.querySelector('.meta').textContent = `${things.toLocaleString()} things rolled up · ${mmss(clock)}`;
      hud.querySelector('.goal').textContent = goal < GOALS.length ? `Next: ${GOALS[goal]} m across` : finished ? 'Brisbane is rolled up' : 'Roll up the Skytower';
      if (clock - toastAt > 1.6) toast.classList.remove('on');
      if (clock - bannerAt > (finished ? 9 : 3.2)) banner.classList.remove('on');
    }

    window.__roll = { get r() { return r; }, get pos() { return [px, py, pz]; }, set pos([x, z]) { px = x; pz = z; }, stats, keys,
      grow: (m) => { r = m; }, get az() { return az; }, set az(a) { az = a; } };
    hud.querySelector('.meta').textContent = '0 things rolled up · 0:00';
    city.view.span = 32;
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.life) { clearInterval(wait); start(); }
  }, 200);
})();
