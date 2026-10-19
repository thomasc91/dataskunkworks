// Live planes for the Brisbane pixel diorama: every aircraft flying over the map, at its real position, from open
// ADS-B data through the same relay as the ferries (live-config.js picks it): adsb.fi on Thomas's PC, adsb.lol on
// the public relay, credited with a link to whichever served it. Added 19 Oct 2026.
//
// The relay sends each aircraft's latest position every 5 s (15 s from the public relay), stamped with when it was
// received, and says how often in `poll`. Each plane is drawn that long and a little more behind real time, gliding between its fixes, and carried on along its track and speed when
// it's new or a fix is late, so it moves smoothly from the first frame. Planes bank into turns.
//
// Height: up to 300 m the plane is at its real altitude, drawn 1.6 times taller like everything else, so a
// helicopter or a low approach sits in true proportion to the towers. Above that the height is eased into about
// 1,000 drawn metres, so a jet at 10,000 ft still flies over the map instead of off the top of the screen. Its
// shadow falls on the ground below its real position, and hovering it gives its real altitude.
//
// The planes and their shadows are the renderer's own simulated-plane models (a small helicopter is built here),
// with the tail in the airline's colour. While the relay answers, the simulated planes stop; if it doesn't, they
// carry on as before. ?planes=off keeps the simulation.
//
// The hover card also says where a flight is going: the relay looks each callsign up in adsbdb.com's route
// database and only passes a route on when the plane is near its path. For helicopters and private aircraft it
// gives the registered owner (LifeFlight, the police and so on).
//
// A page can set window.DIORAMA_PLANES = {area, ground}: area asks the relay for another map's surroundings (the
// airport), and ground also draws aircraft on the ground, taxiing and parked, sitting on their wheels and facing
// their real heading.
(() => {
  if (new URLSearchParams(location.search).get('planes') === 'off') return;
  const OPT = window.DIORAMA_PLANES || {}, GROUND = !!OPT.ground;
  const RELAY = (window.__liveRelay || 'http://localhost:4011') + '/planes' + (OPT.area ? `?area=${OPT.area}` : '');
  const WHEELS = 4.8, SKIDS = 2.6; // model units (before scaling) from the engines' underside (plane) or the skids (helicopter) up to its origin
  let POLL_MS = 5000, LAG = 6; // s behind real time: the relay's poll plus about a second, from its answer
  const RETRY_MS = 60000;
  const COAST = 30; // s a plane is carried on along its track past its last fix
  const GONE = 45; // s without a fix before a plane is dropped
  const SHOW = 9000; // m from the middle of the map: planes further out aren't drawn
  const FADE = 700; // m over which they grow in at that edge
  const S = 1.6, TRUE_TO = 300, CEILING = 1000; // the height scale, the true-scale limit (m) and the eased ceiling
  const FT = 0.3048, KT = 0.514444, GEOID = 40; // GNSS heights are above the ellipsoid, about 40 m above sea level here

  // Airlines by ICAO callsign prefix: name, IATA code and tail colour.
  const AIRLINES = {
    QFA: ['Qantas', 'QF', '#e0001b'], QLK: ['QantasLink', 'QF', '#e0001b'], JST: ['Jetstar', 'JQ', '#ff5a00'],
    VOZ: ['Virgin Australia', 'VA', '#c8102e'], RXA: ['Rex', 'ZL', '#b5121b'], NWK: ['Network Aviation', 'QF', '#e0001b'],
    ANZ: ['Air New Zealand', 'NZ', '#141414'], FJI: ['Fiji Airways', 'FJ', '#6b3f2a'], UAE: ['Emirates', 'EK', '#d71a21'],
    QTR: ['Qatar Airways', 'QR', '#5c0632'], SIA: ['Singapore Airlines', 'SQ', '#16305f'], CPA: ['Cathay Pacific', 'CX', '#006564'],
    ETD: ['Etihad', 'EY', '#a6875a'], UAL: ['United', 'UA', '#0f3a7d'], DAL: ['Delta', 'DL', '#b2162f'], AAL: ['American', 'AA', '#8a9aa6'],
    AXM: ['AirAsia', 'AK', '#e2001a'], MAS: ['Malaysia Airlines', 'MH', '#0a2a74'], EVA: ['EVA Air', 'BR', '#00704a'],
    PAL: ['Philippine Airlines', 'PR', '#0033a0'], VJC: ['VietJet', 'VJ', '#d71920'], HVN: ['Vietnam Airlines', 'VN', '#00718f'],
    ANG: ['Air Niugini', 'PX', '#d4202c'], ACI: ['Aircalin', 'SB', '#00a3e0'], THY: ['Turkish Airlines', 'TK', '#c8102e'],
    CES: ['China Eastern', 'MU', '#1c3f94'], CSN: ['China Southern', 'CZ', '#1e70b8'], KAL: ['Korean Air', 'KE', '#7fb6dd'],
    AIC: ['Air India', 'AI', '#a3122d'], JAL: ['Japan Airlines', 'JL', '#cc0000'], ANA: ['All Nippon Airways', 'NH', '#13448f'],
    TGW: ['Scoot', 'TR', '#ffd400'], QJE: ['QantasLink', 'QF', '#e0001b'], FDX: ['FedEx', 'FX', '#4d148c'],
    POL: ['Queensland Police', '', '#1f4e9c'], RSCU: ['LifeFlight', '', '#d8342c'],
  };
  // Aircraft types by ICAO type code.
  const TYPES = {
    B738: 'Boeing 737-800', B38M: 'Boeing 737 MAX 8', B737: 'Boeing 737-700', B739: 'Boeing 737-900', B712: 'Boeing 717',
    B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10', B77W: 'Boeing 777-300ER', B772: 'Boeing 777-200',
    B763: 'Boeing 767-300', B744: 'Boeing 747-400', A320: 'Airbus A320', A20N: 'Airbus A320neo', A321: 'Airbus A321',
    A21N: 'Airbus A321neo', A332: 'Airbus A330-200', A333: 'Airbus A330-300', A339: 'Airbus A330-900', A359: 'Airbus A350-900',
    A35K: 'Airbus A350-1000', A388: 'Airbus A380', BCS3: 'Airbus A220-300', E190: 'Embraer E190', E290: 'Embraer E190-E2',
    DH8D: 'Dash 8 Q400', DH8C: 'Dash 8-300', DH8B: 'Dash 8-200', AT76: 'ATR 72-600', AT72: 'ATR 72', SF34: 'Saab 340',
    F100: 'Fokker 100', F70: 'Fokker 70', PC12: 'Pilatus PC-12', PC24: 'Pilatus PC-24', C208: 'Cessna Caravan',
    B350: 'King Air 350', BE20: 'King Air 200', C172: 'Cessna 172', C182: 'Cessna 182', PA31: 'Piper Navajo',
    PA28: 'Piper Cherokee', SR22: 'Cirrus SR22', EC35: 'Airbus H135', EC45: 'Airbus H145', EC30: 'Airbus H130',
    A139: 'AW139', A169: 'AW169', B412: 'Bell 412', B429: 'Bell 429', B407: 'Bell 407', B06: 'Bell 206', AS50: 'Airbus AS350',
    R44: 'Robinson R44', R22: 'Robinson R22', S76: 'Sikorsky S-76', H160: 'Airbus H160', BK17: 'BK 117',
  };
  const HELI_TYPES = new Set(['EC35', 'EC45', 'EC30', 'A139', 'A169', 'B412', 'B429', 'B407', 'B06', 'AS50', 'R44', 'R22', 'S76', 'H160', 'BK17']);
  const SIZE = { A1: 0.45, A2: 0.65, A3: 1, A4: 1.1, A5: 1.3, A6: 0.8, B1: 0.4, B4: 0.4, B6: 0.4 };
  const TAILS = ['#d8342c', '#1f4e9c', '#e07b28', '#169c8c', '#7a3fa0', '#d9a91f'];

  function start() {
    const D = window.__dio, sim = D?.life?.planes;
    if (!sim?.slots?.length) return;
    const { city, data } = D;
    const [ox, oz] = data.origin;
    const MX = 111320 * Math.cos((oz * Math.PI) / 180), MZ = 110540;
    const [ccx, ccz] = data.circle;
    const ground = (x, z) => (D.terrain ? D.terrain.hs(x, z) : 0);

    // --- Models: the renderer's plane (body, tail fin, shadow outline) and a helicopter built here ------------
    const ref = sim.slots[0], body = ref.g.children[0], fin = ref.g.children[1];
    const Group = ref.g.constructor, Mesh = body.constructor, Geometry = body.geometry.constructor;
    const Attr = body.geometry.attributes.position.constructor, Color = fin.material.color.constructor;
    const layerMask = body.layers.mask; // the moving layer
    // A helicopter, about twice real size like the planes (they're drawn big enough to see from afar): the cabin
    // in the operator's colour, the rest grey, and a rotor that turns.
    const heli = (() => {
      const geo = (boxes) => {
        const pos = [], nor = [], col = [];
        for (const [x0, y0, z0, x1, y1, z1, c] of boxes) {
          const v = (x, y, z) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
          const faces = [[[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0]],
            [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]],
            [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, -1]]];
          for (const [a, b, c2, d, n] of faces) for (const p of [a, b, c2, a, c2, d]) pos.push(...v(...p)), nor.push(...n), col.push(c, c, c);
        }
        const g = new Geometry();
        g.setAttribute('position', new Attr(new Float32Array(pos), 3));
        g.setAttribute('normal', new Attr(new Float32Array(nor), 3));
        g.setAttribute('color', new Attr(new Float32Array(col), 3));
        return g;
      };
      return {
        livery: geo([[-3, -1.5, -1.4, 3.6, 1.6, 1.4, 1], [-10, 0.6, -0.25, -8.6, 2.8, 0.25, 1]]), // cabin and fin
        body: geo([
          [3.6, -1.2, -1.2, 4.6, 1.0, 1.2, 0.35], // windscreen
          [-9.5, -0.2, -0.35, -3, 0.6, 0.35, 0.9], // tail boom
          [-2.6, -2.5, -1.75, 3.2, -2.2, -1.45, 0.4], [-2.6, -2.5, 1.45, 3.2, -2.2, 1.75, 0.4], // skids
          [-0.4, 1.6, -0.4, 0.4, 2.3, 0.4, 0.4], // rotor mast
        ]),
        rotor: geo([[-11, 2.3, -0.35, 11, 2.5, 0.35, 0.3], [-0.35, 2.3, -11, 0.35, 2.5, 11, 0.3]]),
      };
    })();

    const pool = [], used = new Map(); // hex -> model
    function model(isHeli) {
      let m = pool.find((p) => !p.inUse && p.heli === isHeli);
      if (!m) {
        const g = new Group();
        g.rotation.order = 'YXZ';
        const finMat = fin.material.clone();
        if (isHeli) {
          const r = new Mesh(heli.rotor, body.material);
          g.add(new Mesh(heli.body, body.material), new Mesh(heli.livery, finMat), r);
          m = { g, rotor: r, finMat, heli: true };
        } else {
          g.add(new Mesh(body.geometry, body.material), new Mesh(fin.geometry, finMat));
          m = { g, finMat, heli: false };
        }
        m.sh = new Mesh(ref.sh.geometry, sim.shadowMat);
        for (const o of [g, m.sh]) o.traverse((c) => { c.layers.mask = layerMask; c.castShadow = false; c.frustumCulled = false; });
        D.life.root.add(g, m.sh);
        pool.push(m);
      }
      m.inUse = true;
      return m;
    }

    // --- Aircraft state ------------------------------------------------------------------------------------
    const planes = new Map(); // hex -> {info, fixes: [{t, x, z, h, trk, gs, rate}], heading, roll}
    const toXZ = (lat, lng) => [(lng - ox) * MX, -(lat - oz) * MZ];
    function heightM(a) {
      if (a.alt_ft === 'ground') return GROUND ? 0 : null;
      if (typeof a.geom_ft === 'number') return a.geom_ft * FT - GEOID;
      if (typeof a.alt_ft === 'number') return a.alt_ft * FT;
      return null;
    }
    function merge(json) {
      for (const a of json.aircraft || []) {
        const h = heightM(a);
        const trk = a.track ?? a.hdg ?? (GROUND ? planes.get(a.hex)?.fixes.at(-1)?.trkDeg ?? 0 : null);
        if (h == null || trk == null || (a.gs_kt == null && !GROUND)) continue;
        let p = planes.get(a.hex);
        if (!p) planes.set(a.hex, (p = { fixes: [], heading: null, roll: 0 }));
        p.info = a;
        if (p.fixes.length && p.fixes[p.fixes.length - 1].t >= a.t) continue;
        const [x, z] = toXZ(a.lat, a.lng);
        const onGround = a.alt_ft === 'ground';
        p.fixes.push({ t: a.t, x, z, h, trk: (trk * Math.PI) / 180, trkDeg: trk, gs: (a.gs_kt || 0) * KT, rate: onGround ? 0 : ((a.rate || 0) * FT) / 60, onGround });
        if (p.fixes.length > 4) p.fixes.shift();
      }
      const now = Date.now() / 1000;
      for (const [hex, p] of planes) if (now - p.fixes[p.fixes.length - 1].t > GONE) planes.delete(hex);
    }
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    function carry(f, dt, out) { // along the track at the fix's speed (dt may be negative)
      out.x = f.x + Math.sin(f.trk) * f.gs * dt;
      out.z = f.z - Math.cos(f.trk) * f.gs * dt;
      out.h = Math.max(0, f.h + f.rate * dt);
      out.trk = f.trk;
      out.gs = f.gs;
    }
    function stateAt(p, T, out) {
      const fx = p.fixes, last = fx[fx.length - 1];
      if (T >= last.t) return carry(last, Math.min(T - last.t, COAST), out);
      if (T <= fx[0].t) return carry(fx[0], Math.max(T - fx[0].t, -COAST), out);
      let i = 0;
      while (fx[i + 1].t <= T) i++;
      const a = fx[i], b = fx[i + 1], u = (T - a.t) / (b.t - a.t);
      out.x = a.x + (b.x - a.x) * u;
      out.z = a.z + (b.z - a.z) * u;
      out.h = a.h + (b.h - a.h) * u;
      out.trk = a.trk + wrap(b.trk - a.trk) * u;
      out.gs = a.gs + (b.gs - a.gs) * u;
    }
    function drawnY(h) {
      return h <= TRUE_TO ? h * S : TRUE_TO * S + (CEILING - TRUE_TO * S) * (1 - Math.exp(-(h - TRUE_TO) / 2500));
    }
    const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

    // --- Drawing, in place of the simulated planes while live -----------------------------------------------
    const st = {}, st2 = {}, drawn = [];
    let lastT = 0;
    function liveUpdate(dt, zoom) {
      const now = Date.now() / 1000, T = now - LAG;
      const sun = sim.sunDir(), sx = sun.x / Math.max(0.05, sun.y), sz = sun.z / Math.max(0.05, sun.y);
      const sunEl = (Math.asin(Math.max(-1, Math.min(1, sun.y))) * 180) / Math.PI;
      sim.shadowMat.opacity = 0.38 * smooth((sunEl - 8) / 12);
      for (const m of pool) m.inUse = false;
      drawn.length = 0;
      for (const [hex, p] of planes) {
        stateAt(p, T, st);
        const d = Math.hypot(st.x - ccx, st.z - ccz);
        if (d > SHOW) continue;
        const info = p.info, isHeli = info.cat === 'A7' || HELI_TYPES.has(info.type);
        if (!GROUND && !isHeli && (info.gs_kt ?? 0) < 25) continue; // parked or taxiing: only the airport map shows those
        const m = used.get(hex)?.heli === isHeli ? used.get(hex) : model(isHeli);
        m.inUse = true;
        used.set(hex, m);
        // heading from the motion, banked by the turn rate (about 25 degrees in a standard airliner turn)
        stateAt(p, T + 1, st2);
        const moving = Math.hypot(st2.x - st.x, st2.z - st.z) > 1.5; // m/s; slower than that, face the reported heading
        const yaw = moving ? Math.atan2(-(st2.z - st.z), st2.x - st.x) : Math.atan2(Math.cos(st.trk), Math.sin(st.trk));
        const turn = wrap(st2.trk - st.trk); // rad/s, clockwise positive
        const roll = Math.max(-0.55, Math.min(0.55, Math.atan((st.gs * turn) / 9.81)));
        p.roll += (roll - p.roll) * Math.min(1, dt * 2);
        const onGround = info.alt_ft === 'ground';
        const size = (isHeli ? 1 : SIZE[info.cat] ?? 1) * (onGround ? Math.min(zoom, 1.4) : zoom) * smooth((SHOW - d) / FADE);
        const y = Math.max(onGround ? 0 : drawnY(st.h, st.x, st.z), ground(st.x, st.z) + (isHeli ? SKIDS : WHEELS) * size);
        m.g.position.set(st.x, y, st.z);
        m.g.rotation.set(isHeli || onGround ? 0 : p.roll, yaw, 0);
        m.g.scale.setScalar(size);
        if (m.rotor) m.rotor.rotation.y = onGround && st.gs < 1 ? 0 : (now * 18) % (Math.PI * 2);
        const al = AIRLINES[(info.flight || '').slice(0, 3)] || AIRLINES[(info.flight || '').slice(0, 4)];
        m.finMat.color.set(al ? al[2] : isHeli ? '#e8e6e0' : TAILS[parseInt(hex, 16) % TAILS.length]);
        const sh = D.terrain ? D.terrain.shadow(st.x, st.z, sx, sz, y, 0.75) : [st.x - sx * (y - 0.75), 0.75, st.z - sz * (y - 0.75)];
        m.sh.position.set(sh[0], sh[1], sh[2]);
        m.sh.rotation.y = yaw;
        m.sh.scale.setScalar(size * (isHeli ? 0.4 : 1));
        drawn.push({ hex, info, x: st.x, y, z: st.z, h: st.h, gs: st.gs, trk: st.trk, heli: isHeli, airline: al, onGround });
      }
      for (const m of pool) m.g.visible = m.sh.visible = m.inUse;
      for (const [hex, m] of used) if (!m.inUse) used.delete(hex);
      lastT = now;
    }

    // --- Switching between the simulation and live --------------------------------------------------------
    let live = false;
    const simUpdate = sim.update.bind(sim);
    sim.update = (dt, zoom) => (live ? liveUpdate(dt, zoom) : simUpdate(dt, zoom));
    const footer = document.querySelector('footer');
    const credit = document.createElement('span');
    credit.className = 'live-planes';
    credit.style.pointerEvents = 'auto';
    function setLive(on) {
      live = on;
      for (const s of sim.slots) if (on) (s.on = false), (s.g.visible = s.sh.visible = false);
      for (const m of pool) if (!on) m.g.visible = m.sh.visible = false;
      if (on && footer && !credit.isConnected) footer.append(credit);
      if (!on) credit.remove();
      window.__liveIntro?.('planes', on);
      D.requestRender?.();
    }
    function caption() {
      // counted from the latest fixes (the drawn list is empty until the first frame after the first answer)
      const over = [...planes.values()].filter((p) => { const f = p.fixes.at(-1); return Math.hypot(f.x - ccx, f.z - ccz) <= data.circle[2]; }).length;
      const what = GROUND ? 'none at the airport right now' : 'none over the map right now';
      const a = document.createElement('a');
      a.href = source.link || 'https://adsb.fi/';
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = source.source || 'adsb.fi';
      a.style.color = 'inherit';
      const b = document.createElement('a');
      Object.assign(b, { href: 'https://www.adsbdb.com/', target: '_blank', rel: 'noopener', textContent: 'adsbdb' });
      b.style.color = 'inherit';
      credit.replaceChildren(` · Planes: live from `, a, `, routes from `, b, over ? '' : `, ${what}`);
    }

    let timer = 0, source = {};
    async function poll() {
      clearTimeout(timer);
      if (document.hidden) { timer = setTimeout(poll, POLL_MS); return; }
      try {
        const r = await fetch(RELAY, { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        const json = await r.json();
        if (json.error && !json.aircraft?.length) throw new Error(json.error);
        if (json.poll) (POLL_MS = Math.max(5000, json.poll * 1000)), (LAG = json.poll + 1);
        source = json;
        merge(json);
        if (!live) setLive(true);
        caption();
        timer = setTimeout(poll, POLL_MS);
      } catch {
        // Relay unreachable: keep the planes we have while their fixes last, then hand back to the simulation.
        if (live && ![...planes.values()].some((p) => Date.now() / 1000 - p.fixes[p.fixes.length - 1].t < GONE)) setLive(false);
        timer = setTimeout(poll, live ? POLL_MS : RETRY_MS);
      }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

    // --- Hover a plane for its flight, type, height and speed ---------------------------------------------
    const canvas = document.getElementById('c') || city.renderer.domElement;
    const v3 = new (city.camera.position.constructor)();
    const tip = document.createElement('div');
    tip.className = 'panel plane-tip';
    tip.hidden = true;
    Object.assign(tip.style, {
      position: 'fixed', zIndex: 31, pointerEvents: 'none', padding: '8px 11px', maxWidth: '280px',
      font: "600 13px/1.35 'Hanken Grotesk', system-ui, sans-serif", boxShadow: '0 2px 0 var(--shadow)',
    });
    document.body.append(tip);
    const COMPASS = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east',
      'south-south-east', 'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'];
    const fmt = (n) => Math.round(n).toLocaleString('en-AU');
    function lines(p) {
      const i = p.info, call = i.flight || '', al = p.airline;
      const num = al && al[1] && /^[A-Z]{3,4}\d/.test(call) ? `${al[1]}${call.replace(/^[A-Z]+/, '')}` : '';
      const title = al ? `${al[0]}${num ? ' ' + num : call && !/^\d/.test(call.slice(3)) ? ' ' + call : ''}` : call || i.reg || 'Aircraft';
      const type = [TYPES[i.type] || i.type || (p.heli ? 'Helicopter' : ''), i.reg].filter(Boolean).join(' · ');
      const place = (e) => (e.city && e.iata ? `${e.city} (${e.iata})` : e.city || e.iata || e.icao || '?');
      const route = i.route ? [[`${place(i.route.from)} → ${place(i.route.to)}`]] : [];
      const owner = !al && i.owner ? [[i.owner, true]] : [];
      const climb = (i.rate || 0) > 300 ? ', climbing' : (i.rate || 0) < -300 ? ', descending' : '';
      const ft = p.h / FT, deg = (((p.trk * 180) / Math.PI) % 360 + 360) % 360;
      if (p.onGround) {
        const kmh = p.gs * 3.6;
        return [[title], ...route, ...(type ? [[type, true]] : []), ...owner,
          [kmh > 60 ? `On the runway, ${fmt(kmh)} km/h` : kmh > 4 ? `Taxiing, ${fmt(kmh)} km/h` : 'Parked', true]];
      }
      return [[title], ...route, ...(type ? [[type, true]] : []), ...owner,
        [`${fmt(ft)} ft (${fmt(p.h)} m)${climb}`, true],
        [`${fmt(p.gs * 3.6)} km/h, heading ${COMPASS[Math.round(deg / 22.5) % 16]}`, true]];
    }
    canvas.addEventListener('pointermove', (e) => {
      if (!live || e.buttons || e.pointerType !== 'mouse') { tip.hidden = true; return; }
      const r = canvas.getBoundingClientRect();
      let best = null, bd = 22;
      for (const p of drawn) {
        v3.set(p.x, p.y, p.z).project(city.camera);
        const sx = r.left + ((v3.x + 1) / 2) * r.width, sy = r.top + ((1 - v3.y) / 2) * r.height;
        const d = Math.hypot(sx - e.clientX, sy - e.clientY);
        if (v3.z < 1 && d < bd) (bd = d), (best = p);
      }
      if (!best) { tip.hidden = true; return; }
      document.querySelector('.ferry-tip')?.setAttribute('hidden', '');
      tip.replaceChildren(...lines(best).map(([text, muted], i) => {
        const d = document.createElement('div');
        d.textContent = text;
        if (muted) Object.assign(d.style, { color: 'var(--muted)', fontWeight: 500, marginTop: i ? '2px' : 0 });
        return d;
      }));
      tip.hidden = false;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.min(e.clientX + 14, innerWidth - w - 8) + 'px';
      tip.style.top = Math.min(e.clientY + 14, innerHeight - h - 8) + 'px';
    });
    canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
    canvas.addEventListener('pointerdown', () => { tip.hidden = true; });

    window.__livePlanes = { planes, drawn, get live() { return live; }, relay: RELAY, get lastT() { return lastT; } };
    poll();
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.life) { clearInterval(wait); start(); }
  }, 200);
})();
