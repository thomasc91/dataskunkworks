// Roll mode for the Brisbane pixel diorama: a Katamari Damacy-style game. Added 19 Oct 2026.
//
// The Roll button opens the map with ?mode=roll. You push a sticky ball round Brisbane, starting in West End;
// anything smaller than it sticks to it and makes it bigger, and anything bigger bounces it back. It starts 2.4 m
// across, among the people on the footpaths (8,000 simulated walkers, thickest in the CBD, South Bank, West End
// and the Valley) and the benches, bins and picnic tables (OpenStreetMap's street furniture, props.json from
// roll/build_props.py). Both are drawn only in this mode. At 6 m it takes cars, cyclists and small trees, at about 20 m
// houses, at 150 to 250 m the CBD towers, and at about 400 m the Brisbane Skytower.
// Wildlife lives in the parks: ibis (round the bins too), cane toads, magpies, which swoop a small ball (it's
// swooping season), and mobs of kangaroos, which bolt when it comes near. CityCats can be rolled up from the bank
// once the ball is about 23 m across. The river stops it until it's 80 m across, then it wades. Everything it picks
// up stays gone until the page reloads: the buildings (hidden by id in the renderer's shader, shadows and edge lines
// too), the trees, the simulated cars, the cyclists, the animals, and the live buses, Metro, trains and CityCats.
//
// Arrow keys or WASD: up rolls forward, down rolls back, left and right turn (the camera follows behind). On a touch
// screen or with the mouse, drag: up and down to roll, sideways to turn. The camera: scroll or + and - to zoom,
// right-drag or Q, E, R and F to look around, pinch on a touch screen. A minimap shows the streets round the ball,
// with the street it's on and the suburb (street names from OpenStreetMap: streets.json, roll/build_streets.py).
// Esc or "Back to the map" leaves.
(() => {
  const Q = new URLSearchParams(location.search);
  const rolling = Q.get('mode') === 'roll';
  const go = (on) => { const q = new URLSearchParams(location.search); on ? q.set('mode', 'roll') : q.delete('mode'); location.search = q.toString(); };
  document.getElementById('rollMode')?.addEventListener('click', () => go(true));
  if (!rolling) return;
  // A level (roll-game.js reads ?level= and sets this before the map is ready) can move the start, the crowds and the
  // wildlife, and name the files of street furniture and street names for another map.
  const LEVEL = window.__rollLevel || {};

  const START = LEVEL.start || [-27.4816, 153.0101]; // Boundary Street, West End, by Vulture Street
  // where people are thickest on the footpaths: the Queen Street Mall, South Bank, Boundary Street and the Valley
  const CROWDS = LEVEL.crowds || [[-27.4698, 153.0251], [-27.4810, 153.0230], [-27.4812, 153.0095], [-27.4570, 153.0350]];
  const PEOPLE = 8000, WALK = [1.1, 1.7]; // m/s
  const SHIRTS = ['#e2453b', '#2f5fa8', '#f6c453', '#3a9b5c', '#ffffff', '#1d1f22', '#ff7a2f', '#7a3fa0', '#33b5c8', '#e8d6b9', '#c94f7c'];
  const R0 = LEVEL.r0 || 1.2; // m: the ball's radius to begin with
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
  // Wildlife: how many, real length and height (m), walking and fleeing speeds (m/s), how near the ball sends them off,
  // drawn scale, worth (m³ of growth), and what the toast calls them. Magpies swoop instead of fleeing.
  const MAGPIE_CATCH = 2.5; // m: the radius from which the ball can catch a magpie mid-swoop (until then it gets knocked about)
  const FAUNA = {
    ibis: { n: 700, len: 0.75, tall: 0.78, walk: 0.45, flee: 2.4, fear: 5, scale: 1.6, worth: 1.5, label: 'an ibis' },
    toad: { n: 900, len: 0.2, tall: 0.12, walk: 0.15, flee: 1.1, fear: 2.5, hop: 0.22, scale: 2.4, worth: 0.25, label: 'a cane toad' },
    magpie: { n: 450, len: 0.42, tall: 0.32, walk: 0.5, flee: 0, fear: 0, scale: 1.8, worth: 0.4, label: 'a magpie' },
    roo: { n: 160, len: 1.4, tall: 1.6, walk: 0.35, flee: 7, fear: 18, hop: 0.9, scale: 1.4, worth: 6, label: 'a kangaroo', mob: 7 },
  };
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
    #rollHelp { position: fixed; bottom: 76px; left: 50%; transform: translateX(-50%); z-index: 40; pointer-events: none; text-align: center;
      font: 600 13px/1.4 'Hanken Grotesk', system-ui, sans-serif; color: var(--muted); background: color-mix(in srgb, var(--panel) 88%, transparent);
      border-radius: 9px; padding: 6px 12px; max-width: calc(100vw - 32px); transition: opacity .6s; }
    #rollMap { position: fixed; left: 14px; bottom: 58px; z-index: 40; pointer-events: none; text-align: center; }
    #rollMap canvas { display: block; width: 190px; height: 190px; border-radius: 50%; box-shadow: 0 2px 0 var(--shadow, rgba(0,0,0,.15)), 0 0 0 3px var(--panel); }
    #rollMap .street { margin-top: 8px; max-width: 220px; font: 700 13px/1.3 'Hanken Grotesk', system-ui, sans-serif; color: var(--ink);
      background: color-mix(in srgb, var(--panel) 92%, transparent); border-radius: 8px; padding: 4px 9px; display: inline-block; }
    #rollMap .street small { display: block; font-weight: 500; color: var(--muted); }
    @media (max-width: 560px) { #rollHud { top: 10px; min-width: 0; padding: 6px 12px; } #rollHud .size { font-size: 24px; }
      #rollExit { top: 10px; left: 10px; right: auto; } #rollToast { top: 92px; } #rollHelp { bottom: 112px; }
      #rollMap { left: auto; right: 10px; top: 10px; bottom: auto; } #rollMap canvas { width: 92px; height: 92px; }
      #rollMap .street { max-width: 120px; font-size: 11px; margin-top: 5px; } }
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
  const help = el('div', 'rollHelp', touch ? 'Drag up to roll, and sideways to turn; pinch to zoom. Anything smaller than the ball sticks to it.'
    : 'Arrow keys or WASD to roll and turn, or drag. Scroll to zoom, right-drag to look round. Anything smaller than the ball sticks to it.');
  const mapBox = el('div', 'rollMap', '<canvas width="380" height="380"></canvas><div class="street"></div>');

  async function start() {
    const D = window.__dio, K = window.__terrain?.K, { city, data, life } = D;
    if (!K?.MeshDepthMaterial || !life?.cars) { hud.querySelector('.meta').textContent = 'Roll mode needs the full map.'; return; }
    const T = D.terrain;
    // events for the game and sound layers (roll-game.js, roll-sound.js): pick, bump, drop, swooped, goal, finish, frame
    const handlers = {};
    const on = (type, fn) => (handlers[type] ||= []).push(fn);
    const emit = (type, d = {}) => { for (const fn of handlers[type] || []) try { fn(d); } catch (e) { console.error(e); } };
    const markers = []; // {x, z, colour}: rings on the minimap, for a level's target or a bonus
    let paused = false;
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
      const r = await fetch(LEVEL.props || 'props.json');
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
          const p = { k, kind, x, z, y, W, H, D: Dp, size: Math.max(W, H, Dp), vol: W * H * Dp * 0.5, colour: [C.r, C.g, C.b], name, gone: false };
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

    // --- Wildlife: ibis, cane toads, magpies and kangaroos in the parks ---------------------------------------------
    const ground = (x, z) => (T ? T.h(x, z) : 0);
    const wet = (x, z) => !!(T && T.inWater(x, z));
    const ring0 = (g) => (typeof g[0] === 'number' ? g : g[0]);
    const inPoly = (a, x, z) => { let c = false; for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) if ((a[i + 1] > z) !== (a[j + 1] > z) && x < ((a[j] - a[i]) * (z - a[i + 1])) / (a[j + 1] - a[i + 1]) + a[i]) c = !c; return c; };
    const startXZ = toXZ(...START);
    const parks = (data.green || []).map((g) => {
      const a = ring0(g);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, area = 0;
      for (let i = 0; i < a.length; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); z0 = Math.min(z0, a[i + 1]); z1 = Math.max(z1, a[i + 1]); }
      for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) area += a[j] * a[i + 1] - a[i] * a[j + 1];
      const near = Math.hypot((x0 + x1) / 2 - startXZ[0], (z0 + z1) / 2 - startXZ[1]);
      return { a, x0, x1, z0, z1, area: Math.abs(area) / 2, w: Math.min(Math.abs(area) / 2, 250000) * (0.3 + 3 * Math.exp(-near / 2500)) };
    }).filter((q) => q.area > 800);
    const pickPark = (list) => { let u = Math.random() * list.reduce((s, q) => s + q.w, 0); for (const q of list) if ((u -= q.w) <= 0) return q; return list[0]; };
    const spotIn = (q) => {
      for (let k = 0; k < 30; k++) {
        const x = q.x0 + Math.random() * (q.x1 - q.x0), z = q.z0 + Math.random() * (q.z1 - q.z0);
        if (inPoly(q.a, x, z) && !wet(x, z)) return [x, z];
      }
      return null;
    };
    const fauna = []; // {kind, x, z, y, h, home, ...}
    const bins = props.filter((p) => /a bin|recycling/.test(p.name));
    const bigParks = parks.filter((q) => q.area > 120000);
    for (const [kind, spec0] of Object.entries(FAUNA)) {
      const want = LEVEL.fauna?.[kind] || {}, spec = { ...spec0, n: want.n ?? spec0.n };
      const nearParks = want.near ? parks.filter((q) => Math.hypot((q.x0 + q.x1) / 2 - startXZ[0], (q.z0 + q.z1) / 2 - startXZ[1]) < want.near) : null;
      for (let n = 0, tries = 0; n < spec.n && tries < spec.n * 50; tries++) {
        let at = null;
        if (kind === 'ibis' && bins.length && Math.random() < 0.4) { const b = bins[(Math.random() * bins.length) | 0]; at = [b.x + (Math.random() - 0.5) * 8, b.z + (Math.random() - 0.5) * 8]; }
        else at = spotIn(pickPark(nearParks?.length ? nearParks : kind === 'roo' && bigParks.length ? bigParks : parks));
        if (!at || wet(...at)) continue;
        const group = kind === 'roo' ? spec.mob : 1;
        for (let g = 0; g < group && n < spec.n; g++, n++) {
          const x = at[0] + (g ? (Math.random() - 0.5) * 30 : 0), z = at[1] + (g ? (Math.random() - 0.5) * 30 : 0);
          fauna.push({ kind, spec, x, z, y: 0, h: Math.random() * 6.28, home: [x, z], t: Math.random() * 3, moving: false, phase: Math.random() * 6.28,
            gone: false, state: 'ground', cool: 5 + Math.random() * 20, size: Math.max(spec.len, spec.tall) * spec.scale });
        }
      }
    }
    const faunaGeo = {
      ibis: boxes([[-0.25, 0.35, -0.12, 0.2, 0.6, 0.12, '#f1efe8'], [-0.33, 0.38, -0.1, -0.2, 0.5, 0.1, '#2a2a2a'], [0.14, 0.5, -0.04, 0.24, 0.74, 0.04, '#232323'],
        [0.19, 0.66, -0.05, 0.3, 0.78, 0.05, '#1c1c1c'], [0.3, 0.6, -0.02, 0.5, 0.66, 0.02, '#1c1c1c'], [-0.05, 0, -0.08, 0.0, 0.36, -0.04, '#2a2a2a'], [-0.05, 0, 0.04, 0.0, 0.36, 0.08, '#2a2a2a']]),
      toad: boxes([[-0.1, 0.0, -0.075, 0.09, 0.09, 0.075, '#7a6a3a'], [0.07, 0.01, -0.055, 0.13, 0.08, 0.055, '#6d5e33'], [-0.06, 0.07, -0.05, 0.04, 0.115, 0.05, '#5f5230'],
        [-0.12, 0, -0.1, -0.04, 0.03, -0.07, '#8a7a48'], [-0.12, 0, 0.07, -0.04, 0.03, 0.1, '#8a7a48']]),
      magpie: boxes([[-0.15, 0.12, -0.06, 0.12, 0.26, 0.06, '#151515'], [-0.02, 0.22, -0.056, 0.08, 0.27, 0.056, '#f4f4f0'], [-0.1, 0.16, -0.066, 0.02, 0.22, 0.066, '#f4f4f0'],
        [0.1, 0.2, -0.045, 0.18, 0.3, 0.045, '#111111'], [0.18, 0.23, -0.015, 0.25, 0.26, 0.015, '#9aa0a4'], [-0.29, 0.16, -0.04, -0.15, 0.21, 0.04, '#151515'],
        [-0.02, 0, -0.03, 0.01, 0.13, -0.015, '#222222'], [-0.02, 0, 0.015, 0.01, 0.13, 0.03, '#222222']]),
      roo: boxes([[-0.25, 0, -0.18, 0.15, 0.5, 0.18, '#8a6f55'], [0.0, 0, -0.1, 0.38, 0.07, 0.1, '#6f5a45'], [-0.95, 0.1, -0.08, -0.25, 0.3, 0.08, '#8a6f55'],
        [-0.28, 0.45, -0.2, 0.2, 1.05, 0.2, '#9b8064'], [0.05, 0.75, -0.15, 0.27, 1.15, 0.15, '#b8a088'], [0.2, 0.75, -0.13, 0.36, 0.82, 0.13, '#8a6f55'],
        [0.15, 1.18, -0.1, 0.42, 1.4, 0.1, '#9b8064'], [0.4, 1.24, -0.04, 0.47, 1.32, 0.04, '#2b2622'], [0.18, 1.4, -0.1, 0.26, 1.58, -0.04, '#8a6f55'], [0.18, 1.4, 0.04, 0.26, 1.58, 0.1, '#8a6f55']]),
    };
    const faunaMesh = {}, faunaMat = new K.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    for (const kind of Object.keys(FAUNA)) {
      const list = fauna.filter((a) => a.kind === kind);
      const m = new K.InstancedMesh(faunaGeo[kind], faunaMat, list.length || 1);
      m.layers.mask = layer; m.frustumCulled = false; m.castShadow = false; m.name = 'fauna-' + kind;
      life.root.add(m);
      faunaMesh[kind] = { m, list };
    }
    const FCOL = { ibis: [0.95, 0.94, 0.9], toad: [0.48, 0.42, 0.23], magpie: [0.1, 0.1, 0.1], roo: [0.6, 0.5, 0.39] };
    function animals(dt) {
      for (const { m, list } of Object.values(faunaMesh)) {
        const A = m.instanceMatrix.array;
        list.forEach((a, n) => {
          const o = n * 16, sp = a.spec;
          if (a.gone) { for (let k = 0; k < 11; k++) A[o + k] = 0; return; }
          const db = Math.hypot(a.x - px, a.z - pz);
          if (a.state === 'swoop') { // a magpie diving at the ball and away again
            a.st += dt / 2.4;
            const t = Math.min(1, a.st), [sx, sz] = a.from, ex = 2 * a.aim[0] - sx, ez = 2 * a.aim[1] - sz;
            a.x = sx + (ex - sx) * t; a.z = sz + (ez - sz) * t;
            a.y = ground(a.aim[0], a.aim[1]) + 2 * r + 0.6 + 11 * (2 * t - 1) ** 2;
            a.h = Math.atan2(ez - sz, ex - sx);
            if (!a.hit && t > 0.45) { a.hit = true; swooped(a); }
            if (t >= 1) { a.state = 'ground'; a.cool = 25 + Math.random() * 20; a.home = [a.x, a.z]; if (wet(a.x, a.z)) [a.x, a.z] = a.from; }
          } else {
            let speed = 0;
            a.cool -= dt;
            if (a.kind === 'magpie' && r < 6 && db < 32 && a.cool <= 0 && Math.random() < dt * 0.6) {
              a.state = 'swoop'; a.st = 0; a.hit = false; a.from = [a.x, a.z]; a.aim = [px, pz];
            } else if (sp.fear && db < sp.fear + r * 1.5) { // too close: off it goes
              a.h = Math.atan2(a.z - pz, a.x - px) + (Math.random() - 0.5) * 0.4; speed = sp.flee; a.moving = true;
            } else {
              a.t -= dt;
              if (a.t <= 0) { a.t = 1 + Math.random() * 3; a.moving = Math.random() < 0.55; a.h += (Math.random() - 0.5) * 2.2; }
              const hx = a.home[0] - a.x, hz = a.home[1] - a.z, roam = a.kind === 'roo' ? 70 : 25;
              if (Math.hypot(hx, hz) > roam) a.h = Math.atan2(hz, hx);
              speed = a.moving ? sp.walk : 0;
            }
            let hopY = 0;
            if (sp.hop && speed > 0) { a.phase += dt * (a.kind === 'roo' ? 5 + speed : 9); hopY = Math.abs(Math.sin(a.phase)) * sp.hop * sp.scale; }
            const nx = a.x + Math.cos(a.h) * speed * dt, nz = a.z + Math.sin(a.h) * speed * dt;
            if (!wet(nx, nz)) { a.x = nx; a.z = nz; } else a.h += Math.PI * 0.8;
            a.y = ground(a.x, a.z) + hopY;
          }
          const S = sp.scale, c = Math.cos(a.h), s2 = Math.sin(a.h);
          A.set([c * S, 0, s2 * S, 0, 0, S, 0, 0, -s2 * S, 0, c * S, 0, a.x, a.y, a.z, 1], o);
        });
        m.count = list.length;
        m.instanceMatrix.needsUpdate = true;
      }
    }
    function swooped(a) {
      if (r >= MAGPIE_CATCH && Math.hypot(a.x - px, a.z - pz) < r * 2) return; // big enough: pickAll takes it mid-air
      const side = Math.random() < 0.5 ? -1 : 1, d = Math.hypot(a.x - a.from[0], a.z - a.from[1]) || 1;
      vx += (-(a.z - a.from[1]) / d) * side * 5; vz += ((a.x - a.from[0]) / d) * side * 5; shake = 0.3;
      say('Swooped by a magpie!', null, true);
      emit('swooped');
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
    const deck = (x, z, r) => (T ? T.deckAt(x, z, Math.min(30, r)) : null);
    // start on the footpath of the road nearest Boundary Street, West End (or right where a level says, off the river)
    let [px, pz] = toXZ(...START);
    if (LEVEL.snap === false) while (wet(px, pz)) px += 5;
    else {
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
    const stats = { car: 0, tree: 0, building: 0, cyclist: 0, bus: 0, train: 0, ferry: 0, names: [], biggest: null };
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
    let seq = 0;
    function stick(kind, wx, wy, wz, dims, colour, vol = 0, name = 'something', key = '') {
      let dx = wx - px, dy = wy - py, dz = wz - pz, l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      const u = mulT([dx, dy, dz]); // in the ball's own frame
      let t = Math.abs(u[1]) < 0.9 ? [u[2], 0, -u[0]] : [1, 0, 0], tl = Math.hypot(...t);
      t = t.map((c) => c / tl);
      const s = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
      const sink = kind === 'box' ? r * 0.78 + dims[1] / 2 : r * 0.8;
      const list = stuck[kind];
      list.push({ p: u.map((c) => c * sink), t, u, s, dims, colour, vol, name, key, seq: ++seq });
      if (list.length > CAP[kind]) list.shift(); // the oldest are deep inside by now
    }

    let prioAt = -9;
    function say(text, big, prio = false) { // prio: the game's own news (combos, bonuses, the collection) outranks pick-ups for a moment
      if (prio) prioAt = clock;
      else if (!big && clock - prioAt < 1.8) return;
      toast.textContent = text; toast.classList.add('on'); toastAt = clock;
      if (big) { banner.innerHTML = big; banner.classList.add('on'); bannerAt = clock; }
    }
    function grow(vol) { r = Math.cbrt(r ** 3 + vol * GROW * 0.239); }
    const fmt = (m) => (m >= 100 ? `${Math.round(m)} m` : m >= 10 ? `${m.toFixed(1)} m` : `${m.toFixed(2)} m`);
    const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    // --- Picking things up ---------------------------------------------------------------------------------------------
    const carA = () => life.cars.mesh.instanceMatrix.array, carC = life.cars.mesh.instanceColor?.array;
    const goneCars = new Set(), goneCats = new Set();
    let treesDirty = new Set(), buildingsDirty = false, picksThisFrame = 0;
    function pickAll() {
      const cap = PICK * r, reach = r * 1.05;
      picksThisFrame = 0;
      let best = null;
      const note = (name, size, key = '', extra = {}) => {
        things++;
        if (!best || size > best.size) best = { name, size };
        emit('pick', { name, size, key, ...extra });
      };
      // people
      if (cap >= PH) for (const q of people) {
        if (q.gone || picksThisFrame > 150 || Math.abs(q.x - px) > reach + 2 || Math.abs(q.z - pz) > reach + 2) continue;
        if (Math.hypot(q.x - px, q.z - pz) > reach + 0.6) continue;
        q.gone = true; picksThisFrame++; stats.person = (stats.person || 0) + 1;
        const c = crowdMesh.instanceColor.array;
        stick('box', q.x, ground(q.x, q.z) + PH / 2, q.z, [0.6 * 1.4, PH, 0.45 * 1.4], [c[people.indexOf(q) * 3], c[people.indexOf(q) * 3 + 1], c[people.indexOf(q) * 3 + 2]], 0.25 * PROP_GROW * 6, 'a person', 'person');
        grow(0.25 * PROP_GROW * 6); note('a person', PH, 'person');
      }
      // animals (a magpie only when it's low enough to touch)
      for (const a of fauna) {
        if (a.gone || a.size > cap || Math.abs(a.x - px) > reach + 3 || Math.abs(a.z - pz) > reach + 3) continue;
        if (a.state === 'swoop' && r < MAGPIE_CATCH) continue; // a diving magpie is too quick for a small ball
        if (Math.hypot(a.x - px, a.z - pz) > reach + a.size * 0.3 || a.y - py > r + a.size) continue;
        a.gone = true; picksThisFrame++; stats[a.kind] = (stats[a.kind] || 0) + 1;
        const S = a.spec.scale;
        stick('box', a.x, a.y + (a.spec.tall * S) / 2, a.z, [a.spec.len * S, a.spec.tall * S, Math.max(0.15, a.spec.len * 0.4) * S], FCOL[a.kind], a.spec.worth * PROP_GROW, a.spec.label, 'animal:' + a.kind);
        grow(a.spec.worth * PROP_GROW); note(a.spec.label + (a.state === 'swoop' ? ' in mid-swoop' : ''), a.size + (a.kind === 'roo' ? 5 : 0), 'animal:' + a.kind);
      }
      // street furniture
      let propsDirty = false;
      near(pgrid, px, pz, reach + 6, (p) => {
        if (p.gone || picksThisFrame > 150 || Math.hypot(p.x - px, p.z - pz) > reach + p.size * 0.3) return;
        if (p.size > cap) { // a shelter or phone booth too big yet: a knock (the ball squeezes past thin poles)
          if (Math.min(p.W, p.D) < 0.6) return;
          const dx = px - p.x, dz = pz - p.z, l = Math.hypot(dx, dz) || 1, vn = (vx * dx + vz * dz) / l;
          if (vn < 0) { vx -= 1.3 * vn * (dx / l); vz -= 1.3 * vn * (dz / l); }
          return;
        }
        p.gone = true; propsDirty = true; picksThisFrame++;
        const A = propMesh.instanceMatrix.array;
        for (let q = 0; q < 11; q++) A[p.k * 16 + q] = 0;
        stick('box', p.x, p.y, p.z, [p.W, p.H, p.D], p.colour, p.vol * PROP_GROW, p.name, 'prop:' + p.kind);
        grow(p.vol * PROP_GROW); note(p.name, p.size, 'prop:' + p.kind);
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
          stick('car', x, a[o + 13] + 1.2, z, [1, 1, 1], carC ? [carC[i * 3], carC[i * 3 + 1], carC[i * 3 + 2]] : [1, 1, 1], 23, 'a car', 'car');
          grow(23); note('a car', 6.6, 'car');
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
        stick('tree', t.x, t.y + t.sy, t.z, [t.s, t.sy, t.s], c ? [c[t.i * 3], c[t.i * 3 + 1], c[t.i * 3 + 2]] : [0.35, 0.56, 0.3], 4 * t.s * t.s * 2 * t.sy * 0.35, 'a tree', 'tree');
        grow(4 * t.s * t.s * 2 * t.sy * 0.35); note('a tree', t.size, 'tree');
      });
      // cyclists
      for (const d of window.__liveCyclists?.drawn || []) {
        if (cap < 3.6 || Math.hypot(d.x - px, d.z - pz) > reach + 2) continue;
        const k = d.path.riders.indexOf(d.r);
        if (k < 0) continue;
        d.path.riders.splice(k, 1); stats.cyclist++;
        stick('box', d.x, d.y + 1.5, d.z, [3.4, 3.4, 1], [0.9, 0.3, 0.25], 6, 'a cyclist', 'cyclist');
        grow(6); note('a cyclist', 3.6, 'cyclist');
      }
      // live buses and Metro, and trains
      const LB = window.__liveBuses;
      for (const d of LB?.drawn || []) {
        const size = d.b.metro ? 30 : 15.6;
        if (size > cap || LB.gone.has(d.b) || Math.hypot(d.x - px, d.z - pz) > reach + size / 3) continue;
        LB.gone.add(d.b); stats.bus++;
        stick('box', d.x, d.y + 2, d.z, [size, 4.2, 3.3], d.b.metro ? [0.24, 0.56, 0.84] : [0.96, 0.96, 0.94], size * 3.3 * 4.2 * 0.6, d.b.metro ? `Metro ${d.b.ref}` : `Bus ${d.b.ref}`, d.b.metro ? 'metro' : 'bus');
        grow(size * 3.3 * 4.2 * 0.6); note(d.b.metro ? `Metro ${d.b.ref}` : `Bus ${d.b.ref}`, size, d.b.metro ? 'metro' : 'bus', { bus: d.b });
      }
      const LT = window.__liveTrains;
      for (const d of LT?.drawn || []) {
        if (147 > cap || LT.gone.has(d.tr) || Math.hypot(d.x - px, d.z - pz) > reach + 50) continue;
        LT.gone.add(d.tr); stats.train++;
        stick('box', d.x, d.y + 3, d.z, [147, 6.2, 3.2], [0.95, 0.95, 0.93], 147 * 3.2 * 6.2 * 0.6, 'a train', 'train');
        grow(147 * 3.2 * 6.2 * 0.6); note('a train', 147, 'train');
      }
      // CityCats: 25 m long, so from about 23 m across, from the bank or a terminal (or wading, from 80 m)
      if (cap >= 25) {
        const LF = window.__liveFerries, title = (t) => String(t || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
        if (LF?.live) for (const d of LF.drawn) {
          if (LF.gone.has(d.b) || Math.hypot(d.x - px, d.z - pz) > reach + 10) continue;
          LF.gone.add(d.b); stats.ferry++;
          stick('box', d.x, 2.5, d.z, [25, 4.5, 9], [0.96, 0.96, 0.95], 25 * 9 * 4.5 * 0.5, 'a CityCat', 'ferry');
          grow(25 * 9 * 4.5 * 0.5); note(d.name ? `the CityCat ${title(d.name)}` : 'a CityCat', 60, 'ferry');
        }
        else if (life.cats?.mesh?.visible) {
          const a = life.cats.mesh.instanceMatrix.array;
          for (let i = 0; i < life.cats.mesh.count; i++) {
            const o = i * 16;
            if (goneCats.has(i) || (!a[o] && !a[o + 2]) || Math.hypot(a[o + 12] - px, a[o + 14] - pz) > reach + 10) continue;
            goneCats.add(i); stats.ferry++;
            stick('box', a[o + 12], 2.5, a[o + 14], [25, 4.5, 9], [0.96, 0.96, 0.95], 25 * 9 * 4.5 * 0.5, 'a CityCat', 'ferry');
            grow(25 * 9 * 4.5 * 0.5); note('a CityCat', 60, 'ferry');
          }
        }
      }
      // aircraft on the ground (the airport map): jets about 45 m, helicopters 15
      const LP = window.__livePlanes;
      if (LP?.gone) for (const d of LP.drawn) {
        if (!d.onGround || LP.gone.has(d.hex)) continue;
        const size = d.heli ? 15 : 45;
        if (size > cap || Math.hypot(d.x - px, d.z - pz) > reach + size / 3) continue;
        LP.gone.add(d.hex); stats.plane = (stats.plane || 0) + 1;
        const nm = [d.airline?.[0], (d.info?.flight || '').trim()].filter(Boolean).join(' ') || (d.heli ? 'a helicopter' : 'a plane');
        stick('box', d.x, d.y + 3, d.z, [size, size * 0.18, size * 0.85], [0.95, 0.95, 0.96], size * size * 4, nm, 'plane');
        grow(size * size * 4); note(nm, size + 40, 'plane');
      }
      // things a crash knocked loose, once they've landed
      for (const o of loose) {
        if (o.gone || o.flying || o.size > cap || Math.hypot(o.x - px, o.z - pz) > reach + o.size * 0.3) continue;
        o.gone = true;
        stick('box', o.x, o.y + o.dims[1] / 2, o.z, o.dims, o.colour, o.vol, o.name, o.key);
        grow(o.vol); note(o.name, o.size, o.key, { again: true });
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
          const info0 = data.binfo[p.bid] || [];
          stick('box', p.cx, ground(p.cx, p.cz) + H / 2, p.cz, [Math.max(2, p.w * 0.9), Math.max(2, H), Math.max(2, p.d * 0.9)], tint(p.bid), vol,
            info0[0] || TYPES[info0[1]] || 'a building', info0[0] ? 'landmark:' + info0[0] : 'building');
          grow(vol);
          const info = data.binfo[p.bid] || [], named = info[0], tall = (info[2] ?? p.H / 1.6);
          const name = named ? (tall > 40 ? `${named} (${Math.round(tall)} m)` : named) : TYPES[info[1]] || 'a building';
          note(name, p.size + (named ? 30 : 0), named ? 'landmark:' + named : 'building', { landmark: named || null });
          if (named) stats.names.push(named);
          if (named === (LEVEL.finishOn ?? 'Brisbane Skytower') && !finished) finish();
        } else {
          // too big: push the ball out and bounce it back
          let nx = px - qx, nz = pz - qz, l = Math.hypot(nx, nz);
          if (inside || l < 1e-6) { nx = px - p.cx; nz = pz - p.cz; l = Math.hypot(nx, nz) || 1; }
          nx /= l; nz /= l;
          const push = inside ? r * 0.92 + d : r * 0.92 - d;
          px += nx * push; pz += nz * push;
          const vn = vx * nx + vz * nz;
          if (vn < 0) {
            vx -= 1.4 * vn * nx; vz -= 1.4 * vn * nz;
            if (-vn > 4) shake = 0.25;
            if (-vn > 2) emit('bump', { speed: -vn });
            if (-vn > 7 + r * 0.15) crash(-vn, nx, nz);
          }
        }
      });
      if (best) say(`+ ${best.name}`);
    }
    // A hard crash knocks the last few things off: they fly out and land, and can be rolled up again.
    const loose = [];
    const looseMesh = new K.InstancedMesh(new K.BoxGeometry(1, 1, 1), new K.MeshStandardMaterial({ roughness: 0.8 }), 400);
    looseMesh.layers.mask = layer; looseMesh.frustumCulled = false; looseMesh.count = 0; looseMesh.name = 'loose';
    looseMesh.setColorAt(0, new Color('#ffffff'));
    life.root.add(looseMesh);
    let crashCool = 0;
    function crash(speed, nx, nz) {
      if (crashCool > 0) return;
      crashCool = 1.2;
      const all = [...stuck.car, ...stuck.tree, ...stuck.box].sort((a, b) => b.seq - a.seq);
      const n = Math.min(all.length, Math.max(1, Math.min(6, Math.floor((speed - 5) / 3))));
      let lost = 0;
      for (const o of all.slice(0, n)) {
        for (const list of Object.values(stuck)) { const i = list.indexOf(o); if (i >= 0) list.splice(i, 1); }
        r = Math.max(R0, Math.cbrt(Math.max(R0 ** 3, r ** 3 - o.vol * GROW * 0.239)));
        const w = mul(o.p), dims = o.dims.length === 3 && o.dims[0] === 1 && o.dims[1] === 1 ? [6.6, 2.4, 2.8] : o.dims; // a car's stuck at its model's size
        const a = Math.random() * Math.PI * 2, out = 4 + speed * 0.6;
        loose.push({ x: px + w[0], y: py + w[1], z: pz + w[2], vx: nx * out + Math.cos(a) * 3, vy: 6 + Math.random() * 4, vz: nz * out + Math.sin(a) * 3,
          dims, colour: o.colour, vol: o.vol, name: o.name, key: o.key, size: Math.max(...dims), flying: true, gone: false });
        lost++;
      }
      if (loose.length > 400) loose.splice(0, loose.length - 400);
      if (lost) { say(`Crash! You lost ${lost === 1 ? 'something' : lost + ' things'}`, null, true); emit('drop', { n: lost, speed }); shake = 0.4; }
    }
    function updateLoose(dt) {
      crashCool -= dt;
      const A = looseMesh.instanceMatrix.array, C = looseMesh.instanceColor.array;
      let n = 0;
      for (const o of loose) {
        if (o.gone) continue;
        if (o.flying) {
          o.vy -= 14 * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
          const g = ground(o.x, o.z);
          if (o.y <= g && o.vy < 0) { o.y = g; o.flying = false; }
        }
        const [dx, dy, dz] = o.dims;
        A.set([dx, 0, 0, 0, 0, dy, 0, 0, 0, 0, dz, 0, o.x, o.y + dy / 2, o.z, 1], n * 16);
        C.set(o.colour, n * 3);
        n++;
      }
      looseMesh.count = n;
      looseMesh.instanceMatrix.needsUpdate = looseMesh.instanceColor.needsUpdate = true;
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
        ...n(stats.ferry, 'CityCat', 'CityCats'), ...n(stats.cyclist, 'cyclist', 'cyclists'), ...n(stats.person, 'person', 'people'),
        ...n(stats.roo, 'kangaroo', 'kangaroos'), ...n(stats.ibis, 'ibis', 'ibis'), ...n(stats.magpie, 'magpie', 'magpies'), ...n(stats.toad, 'cane toad', 'cane toads'),
        ...n(stats.prop, 'bit of street furniture', 'bits of street furniture')];
      const all = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0];
      if (!LEVEL.quietFinish) say('+ Brisbane Skytower', `You rolled up Brisbane in ${mmss(clock)}<small>That's ${all}. Keep rolling.</small>`);
      emit('finish', { time: clock, size: 2 * r, things, summary: all });
    }

    // --- Controls ---------------------------------------------------------------------------------------------------
    const canvas = document.getElementById('c') || city.renderer.domElement;
    const keys = new Set();
    const KEYMAP = { ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r',
      KeyQ: 'ol', KeyE: 'or', KeyR: 'tu', KeyF: 'td', Equal: 'zi', NumpadAdd: 'zi', Minus: 'zo', NumpadSubtract: 'zo' };
    let zoom = 1, tilt = 0; // the player's own camera: zoom (x the automatic span) and tilt (degrees on the automatic angle)
    addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, textarea')) return; // typing initials, not rolling
      if (e.code === 'Escape') return go(false);
      const k = KEYMAP[e.code];
      if (!k) return;
      keys.add(k); e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) { keys.delete(k); e.preventDefault(); } }, true);
    addEventListener('blur', () => keys.clear());
    let drag = null, look = null, pinch = null;
    const pointers = new Map(), spread = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
    // The map's own drag-to-orbit, zoom and hover all stop here: the canvas belongs to the game. A left drag (or one
    // finger) steers; a right or middle drag looks round; the wheel, or two fingers, zoom.
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave', 'wheel', 'dblclick', 'contextmenu', 'click'])
      document.addEventListener(type, (e) => {
        if (e.target !== canvas) return;
        e.stopImmediatePropagation();
        if (type === 'wheel' || type === 'contextmenu') e.preventDefault();
        if (type === 'wheel') { zoom = Math.max(0.5, Math.min(5, zoom * Math.exp(e.deltaY * 0.0015))); return; }
        if (type === 'pointerdown') {
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          canvas.setPointerCapture?.(e.pointerId);
          if (pointers.size === 2) { pinch = { d: spread(), z: zoom }; drag = null; }
          else if (e.button === 1 || e.button === 2) look = { id: e.pointerId, x: e.clientX, y: e.clientY, az, tilt };
          else drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
        } else if (type === 'pointermove' && pointers.has(e.pointerId)) {
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pinch && pointers.size >= 2) zoom = Math.max(0.5, Math.min(5, (pinch.z * pinch.d) / spread()));
          else if (look?.id === e.pointerId) { az = (look.az - (e.clientX - look.x) * 0.35 + 720) % 360; tilt = Math.max(-25, Math.min(30, look.tilt + (e.clientY - look.y) * 0.15)); }
          else if (drag?.id === e.pointerId) { drag.dx = e.clientX - drag.x; drag.dy = e.clientY - drag.y; }
        } else if (type === 'pointerup' || type === 'pointercancel') {
          pointers.delete(e.pointerId);
          if (pointers.size < 2) pinch = null;
          if (drag?.id === e.pointerId) drag = null;
          if (look?.id === e.pointerId) look = null;
        }
      }, { capture: true, passive: false });
    canvas.style.touchAction = 'none';

    // --- The minimap, and the street the ball is on ------------------------------------------------------------------
    const mapCanvas = mapBox.querySelector('canvas'), mctx = mapCanvas.getContext('2d'), streetEl = mapBox.querySelector('.street');
    const MW = mapCanvas.width, polys = (list) => (list || []).map((g) => {
      const a = ring0(g);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < a.length; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); z0 = Math.min(z0, a[i + 1]); z1 = Math.max(z1, a[i + 1]); }
      return { a, x0, x1, z0, z1 };
    });
    const greens = polys(data.green), waters = polys(data.water);
    const roads = (data.roads || []).map(([w, a]) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < a.length; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); z0 = Math.min(z0, a[i + 1]); z1 = Math.max(z1, a[i + 1]); }
      return { w, a, x0, x1, z0, z1 };
    });
    const css2 = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
    let mapClock = 0, streetClock = 0;
    function drawMap(azDeg) {
      const R = Math.max(110, r * 22), s = MW / (2 * R), ar = (azDeg * Math.PI) / 180, c = Math.cos(ar) * s, sn = Math.sin(ar) * s;
      const x0 = px - R * 1.42, x1 = px + R * 1.42, z0 = pz - R * 1.42, z1 = pz + R * 1.42, vis = (q) => q.x1 > x0 && q.x0 < x1 && q.z1 > z0 && q.z0 < z1;
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.fillStyle = '#e8dcc6'; mctx.fillRect(0, 0, MW, MW);
      // screen = rotate so the way the camera looks is up; world (x east, z south)
      mctx.setTransform(c, sn, -sn, c, MW / 2 - (c * px - sn * pz), MW / 2 - (sn * px + c * pz));
      const fill = (q, col) => { const a = q.a; mctx.beginPath(); mctx.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 2) mctx.lineTo(a[i], a[i + 1]); mctx.closePath(); mctx.fillStyle = col; mctx.fill(); };
      for (const q of greens) if (vis(q)) fill(q, '#b7cf95');
      for (const q of waters) if (vis(q)) fill(q, '#7fb8cb');
      if (R < 700) for (const p of parts) if (!p.gone && p.x1 > x0 && p.x0 < x1 && p.z1 > z0 && p.z0 < z1) fill({ a: p.pts }, '#cbbfa8');
      mctx.strokeStyle = '#ffffff'; mctx.lineCap = 'round'; mctx.lineJoin = 'round';
      for (const q of roads) if (vis(q)) {
        mctx.lineWidth = Math.max(q.w, 1.6 / s);
        const a = q.a; mctx.beginPath(); mctx.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 2) mctx.lineTo(a[i], a[i + 1]); mctx.stroke();
      }
      // animals worth chasing, as dots
      const dot = (x, z, rad, col) => { mctx.beginPath(); mctx.arc(x, z, rad, 0, Math.PI * 2); mctx.fillStyle = col; mctx.fill(); };
      if (R < 600) for (const a of fauna) if (!a.gone && a.x > x0 && a.x < x1 && a.z > z0 && a.z < z1 && a.kind !== 'toad') dot(a.x, a.z, 2.6 / s, a.kind === 'roo' ? '#9b6a3c' : a.kind === 'magpie' ? '#1d1d1d' : '#f7f7f2');
      for (const m of markers) { // a level's target or a bonus: a ring, pinned to the rim when it's off the map
        let mx = m.x, mz = m.z;
        const d = Math.hypot(mx - px, mz - pz), lim = R * 0.9;
        if (d > lim) { mx = px + ((mx - px) / d) * lim; mz = pz + ((mz - pz) / d) * lim; }
        mctx.beginPath(); mctx.arc(mx, mz, 9 / s, 0, Math.PI * 2); mctx.lineWidth = 4 / s; mctx.strokeStyle = m.colour || '#f3b61f'; mctx.stroke();
      }
      dot(px, pz, Math.max(r, 5 / s), '#e8478b');
      // a north mark on the rim
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      const nx = -Math.sin(ar), ny = -Math.cos(ar), rim = MW / 2 - 16;
      mctx.fillStyle = css2('--ink', '#2b2622'); mctx.font = "800 22px 'Hanken Grotesk', system-ui, sans-serif"; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
      mctx.fillText('N', MW / 2 + nx * rim, MW / 2 + ny * rim);
    }
    // the street: the nearest named road or path within reach, from OpenStreetMap; the suburb: the nearest suburb label
    const sgrid = new Map(), SC = 60;
    let streetNames = [];
    fetch(LEVEL.streets || 'streets.json').then((r) => (r.ok ? r.json() : null)).then((sj) => {
      if (!sj) return;
      streetNames = sj.names;
      for (const [ni, ...a] of sj.ways)
        for (let i = 0; i + 3 < a.length; i += 2) {
          const seg = [ni, a[i], a[i + 1], a[i + 2], a[i + 3]];
          for (let gi = Math.floor(Math.min(a[i], a[i + 2]) / SC); gi <= Math.floor(Math.max(a[i], a[i + 2]) / SC); gi++)
            for (let gj = Math.floor(Math.min(a[i + 1], a[i + 3]) / SC); gj <= Math.floor(Math.max(a[i + 1], a[i + 3]) / SC); gj++) {
              const k = key(gi, gj); let l = sgrid.get(k); if (!l) sgrid.set(k, (l = [])); l.push(seg);
            }
        }
    }).catch(() => {});
    const suburbs = (data.labels || []).filter((l) => l[4] === 'suburb' || l[4] === 'centre');
    const places = (data.labels || []).filter((l) => l[4] === 'place' && !/Bridge$/.test(l[0])); // parks and landmarks: shown when the ball is near
    function whereAmI() {
      let best = null, bd = (r + 35) ** 2;
      const gi = Math.floor(px / SC), gj = Math.floor(pz / SC), k = Math.ceil((r + 35) / SC);
      for (let i = gi - k; i <= gi + k; i++) for (let j = gj - k; j <= gj + k; j++)
        for (const [ni, ax, az2, bx, bz] of sgrid.get(key(i, j)) || []) {
          const dx = bx - ax, dz = bz - az2, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az2) * dz) / (dx * dx + dz * dz || 1)));
          const d = (ax + dx * t - px) ** 2 + (az2 + dz * t - pz) ** 2;
          if (d < bd) (bd = d), (best = streetNames[ni]);
        }
      let sub = null, sd = Infinity;
      for (const [name, x, z] of suburbs) { const d = Math.hypot(x - px, z - pz); if (d < sd) (sd = d), (sub = name); }
      for (const [name, x, z] of places) if (Math.hypot(x - px, z - pz) < 260 + r) { sub = name; break; }
      if (wet(px, pz)) best = 'Brisbane River';
      const html = best ? `${best}<small>${sub ?? ''}</small>` : `${sub ?? 'Brisbane'}`;
      if (streetEl.innerHTML !== html) streetEl.innerHTML = html;
    }

    // --- Every frame ------------------------------------------------------------------------------------------------
    const lifeUpdate = life.update.bind(life);
    life.update = (dt) => {
      lifeUpdate(dt);
      // the cars it has taken stay off the roads
      const a = carA();
      for (const i of goneCars) for (let q = 0; q < 11; q++) a[i * 16 + q] = 0;
      life.cars.mesh.instanceMatrix.needsUpdate = true;
      if (goneCats.size && life.cats?.mesh) { // and the simulated CityCats it has taken stay off the river
        const c = life.cats.mesh.instanceMatrix.array, w = life.cats.wake?.instanceMatrix.array;
        for (const i of goneCats) for (let q = 0; q < 11; q++) { c[i * 16 + q] = 0; if (w) w[i * 16 + q] = 0; }
        life.cats.mesh.instanceMatrix.needsUpdate = true;
        if (life.cats.wake) life.cats.wake.instanceMatrix.needsUpdate = true;
      }
      step(dt);
    };
    function step(dt) {
      if (!dt) return;
      if (!paused) clock += dt;
      // input: forward/back along the camera's view, turning swings the camera round
      let f = (keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0), turn = (keys.has('l') ? 1 : 0) - (keys.has('r') ? 1 : 0);
      turn += (keys.has('ol') ? 1 : 0) - (keys.has('or') ? 1 : 0);
      tilt = Math.max(-25, Math.min(30, tilt + ((keys.has('tu') ? 1 : 0) - (keys.has('td') ? 1 : 0)) * 40 * dt));
      if (keys.has('zi')) zoom = Math.max(0.5, zoom * Math.exp(-1.5 * dt));
      if (keys.has('zo')) zoom = Math.min(5, zoom * Math.exp(1.5 * dt));
      if (drag) { f = Math.max(-1, Math.min(1, -drag.dy / 90)); turn = Math.max(-1, Math.min(1, -drag.dx / 110)); }
      if (paused) f = turn = 0;
      if (f || turn) help.style.opacity = 0;
      az = (az + turn * 105 * dt + 360) % 360;
      const ar = (az * Math.PI) / 180, fx = -Math.sin(ar), fz = -Math.cos(ar);
      // in the rain the roads are slippery: the ball takes longer to speed up, slow down and turn its run
      const slick = (window.__liveSky?.weather?.precip ?? 0) > 0.1 ? 0.4 : 1;
      const vmax = 5 + 1.8 * r, k = Math.min(1, 2.2 * dt * slick);
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
      animals(dt);
      updateLoose(dt);
      pickAll();
      emit('frame', { dt, speed: Math.hypot(vx, vz), r, x: px, z: pz, clock });
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
      const v = city.view, span = Math.max(32, r * 17) * Math.max(0.55, Math.min(1, innerWidth / innerHeight)) * zoom; // closer on a phone held upright
      const sk = shake > 0 ? (shake -= dt, (Math.random() - 0.5) * r * 0.25) : 0;
      const el = Math.max(15, Math.min(85, Math.max(34, Math.min(60, 60 - 6 * Math.log2(Math.max(1, r)))) + tilt)); // steeper while it's small, so less hides it
      Object.assign(v, { cx: px + fx * span * 0.1 + sk, cz: pz + fz * span * 0.1 + sk, span: v.span + (span - v.span) * Math.min(1, 3 * dt), azimuth: az, elevation: el });
      city.updateCamera();
      const er = (el * Math.PI) / 180, ar2 = (az * Math.PI) / 180;
      uToCam.value.set(Math.cos(er) * Math.sin(ar2), Math.sin(er), Math.cos(er) * Math.cos(ar2));
      uBall.value.set(px, py, pz);
      uCut.value = Math.max(5, r * 2.2); uNear.value = r * 1.15;

      mapClock -= dt;
      if (mapClock <= 0) { mapClock = 0.15; drawMap(az); }
      streetClock -= dt;
      if (streetClock <= 0) { streetClock = 0.4; whereAmI(); }

      // the HUD
      const size = 2 * r;
      while (goal < GOALS.length && size >= GOALS[goal]) {
        if (!LEVEL.quietGoals) say(`${GOALS[goal]} m across`, `${GOALS[goal]} m!<small>${GOAL_NOTES[goal]}</small>`);
        emit('goal', { size: GOALS[goal] });
        goal++;
      }
      hud.querySelector('.size').textContent = fmt(size);
      hud.querySelector('.meta').textContent = `${things.toLocaleString()} things rolled up · ${window.__rollGame?.clockText?.() ?? mmss(clock)}`;
      hud.querySelector('.goal').textContent = window.__rollGame?.goalText?.() ??
        (goal < GOALS.length ? `Next: ${GOALS[goal]} m across` : finished ? 'Brisbane is rolled up' : 'Roll up the Skytower');
      if (clock - toastAt > 1.6) toast.classList.remove('on');
      if (clock - bannerAt > (finished ? 9 : 3.2)) banner.classList.remove('on');
    }

    window.__roll = { get r() { return r; }, get pos() { return [px, py, pz]; }, set pos([x, z]) { px = x; pz = z; }, stats, keys, fauna,
      on, say, markers, toXZ, get clock() { return clock; }, get things() { return things; }, get paused() { return paused; }, set paused(v) { paused = v; },
      bonus: (vol) => grow(vol), get volume() { return r ** 3 / 0.239; }, level: LEVEL, loose, crash: (speed = 15) => crash(speed, 0, 1),
      grow: (m) => { r = m; }, get az() { return az; }, set az(a) { az = a; } };
    hud.querySelector('.meta').textContent = '0 things rolled up · 0:00';
    city.view.span = 32;
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.life) { clearInterval(wait); start(); }
  }, 200);
})();
