// The sky over the Brisbane pixel diorama: the real sun and weather now, and night. Added 19 Oct 2026.
//
// - The sun: the time slider now runs the whole day, and the Now button (on when the page opens) keeps it at the
//   time in Brisbane, with the sun where it really is today (its declination and the equation of time for the date,
//   not the fixed mid-October sun the slider had). Dragging the slider leaves Now; the button comes back to it.
// - The weather, in Now mode: Open-Meteo's current conditions for Brisbane (no key, CC BY 4.0), every 10 minutes.
//   Cloud dims the sun and softens the shadows, rain falls as streaks, and the toolbar shows the temperature and sky.
// - Night: from sunset the light fades through twilight to moonlight, the windows light up (the glass in the
//   buildings' pixel textures glows, more of it in the evening than at 3am), the main streets get pools of
//   street light, and the cars and buses get headlights and tail lights.
//
// ?sky=off keeps the original afternoon slider.
(() => {
  const Q = new URLSearchParams(location.search);
  if (Q.get('sky') === 'off') return;
  const LAT = -27.47, LON = 153.02; // Brisbane: AEST (UTC+10) all year
  const WEATHER = 'https://api.open-meteo.com/v1/forecast?latitude=-27.47&longitude=153.02' +
    '&current=temperature_2m,weather_code,cloud_cover,precipitation,wind_speed_10m,wind_direction_10m&timezone=Australia%2FBrisbane';
  const WEATHER_MS = 600000, TICK_MS = 15000;
  const rad = Math.PI / 180;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const brisbane = () => new Date(Date.now() + 10 * 3600e3); // read with getUTC*
  const nowMin = () => { const d = brisbane(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const dayOfYear = () => { const d = brisbane(); return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1; };
  // The sun for a time of day (minutes, AEST) today: NOAA's declination and equation of time, and the renderer's own
  // azimuth convention (its a_() in city.js), unclamped so it can set.
  function sunAt(min, doy = dayOfYear()) {
    const g = ((2 * Math.PI) / 365) * (doy - 1 + (min / 60 - 12) / 24);
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) -
      0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const ha = ((min + eq + 4 * LON - 600) / 4 - 180) * rad, phi = LAT * rad;
    const el = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha));
    let s = Math.acos(clamp((Math.sin(decl) - Math.sin(el) * Math.sin(phi)) / (Math.cos(el) * Math.cos(phi)), -1, 1));
    if (ha > 0) s = 2 * Math.PI - s;
    return { az: 180 - s / rad, el: el / rad };
  }
  // How many windows are lit, by the hour: most in the evening, few in the small hours.
  const LIT = [0.12, 0.09, 0.07, 0.06, 0.07, 0.12, 0.22, 0.3, 0.3, 0.28, 0.28, 0.28, 0.28, 0.28, 0.28, 0.28, 0.3, 0.38, 0.45, 0.46, 0.42, 0.34, 0.25, 0.17];
  const litAt = (min) => { const h = min / 60, a = Math.floor(h) % 24; return LIT[a] + (LIT[(a + 1) % 24] - LIT[a]) * (h - Math.floor(h)); };
  const SKY = { // WMO weather codes, as Open-Meteo gives them
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle',
    55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers',
    95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail',
  };

  function start() {
    const D = window.__dio, K = window.__terrain?.K, { city, data, life } = D;
    const slider = document.getElementById('sun');
    if (!K || !slider || !city.mats?.building) return;
    const T = D.terrain, ground = (x, z) => (T ? T.h(x, z) : 0);
    const Color = city.sun.color.constructor;
    const C = (hex) => new Color(hex);
    const TINT = { day: C('#fff1dc'), gold: C('#ffa257'), sky: C('#fff6ea'), dusk: C('#ffd2a8'), moon: C('#9db2ff'),
      nightSky: C('#34457a'), nightGround: C('#0b0e19'), grey: C('#c9ced3'), nightBg: C('#0d1322') };

    // --- Lit windows: the glass in the buildings' pixel textures, flagged in its alpha, glows at night --------
    const U = city.uniforms, mat = city.mats.building;
    U.uNight = { value: 0 }; U.uLit = { value: 0.4 };
    const tiles = U.uTiles?.value, px = tiles?.image?.data;
    if (px) {
      // The glass colours in city.js's tile art (g G k K e E y Y p P u U and the balcony glass), not the frames.
      const glass = new Set(['#6f8fa0', '#b9d3df', '#3e4e58', '#7d98a8', '#8db8cf', '#d6ecf5', '#3e5463', '#93b3c7', '#7db8b2',
        '#d4efea', '#b98b5f', '#f1d3a6', '#8aa5b3'].map((h) => parseInt(h.slice(1), 16)));
      for (let i = 0; i < px.length; i += 4) if (glass.has((px[i] << 16) | (px[i + 1] << 8) | px[i + 2])) px[i + 3] = 0;
      tiles.needsUpdate = true;
    }
    const base = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      base.call(mat, sh, r);
      Object.assign(sh.uniforms, { uNight: U.uNight, uLit: U.uLit });
      sh.fragmentShader = sh.fragmentShader
        .replace('uniform float uWindows;', 'uniform float uWindows; uniform float uNight; uniform float uLit;')
        .replace('diffuseColor.rgb *= texture(uTiles, vec3(vUV, lay)).rgb;', `vec4 tile = texture(uTiles, vec3(vUV, lay));
            diffuseColor.rgb *= tile.rgb;
            if (uNight > 0.0) {
              // a bay of windows on one floor at a time, and some buildings busier than others
              vec2 cell = floor(vUV * vec2(1.0, 1.0));
              float busy = 0.35 + 1.3 * hash(vec2(vBid * 0.071, 3.7));
              float lit = step(hash(cell + vec2(vBid * 0.0137, fract(vBid * 0.131) * 37.0)), uLit * busy);
              vec3 warm = mix(vec3(1.0, 0.76, 0.46), vec3(0.75, 0.86, 1.0), step(0.78, hash(cell * 1.7 + vBid * 0.29)));
              totalEmissiveRadiance += (1.0 - tile.a) * lit * warm * uNight * 0.8;
            }`);
    };
    mat.needsUpdate = true;

    // --- Street lights: warm pools along the streets, in the still layer -------------------------------------
    const pools = (() => {
      const spots = [];
      for (const e of data.traffic?.edges || []) {
        const [type, , , w, , , p] = e;
        if (type !== 0 || w < 5) continue; // not in tunnels or on bridge decks
        const gap = w >= 7 ? 38 : 55;
        let carry = gap / 2;
        for (let i = 0; i + 3 < p.length; i += 2) {
          const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az);
          for (let s = carry; s < L; s += gap) spots.push(ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L, w);
          carry = (carry - L) % gap; if (carry < 0) carry += gap;
        }
      }
      // a soft pool: bright in the middle, half as bright halfway out, nothing at the rim
      const SEG = 12, pos = [0, 0, 0], col = [1, 0.72, 0.38], idx = [];
      for (const [r, f] of [[0.45, 0.42], [1, 0]])
        for (let k = 0; k < SEG; k++) {
          const a = (k / SEG) * Math.PI * 2;
          pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); col.push(f, f * 0.72, f * 0.38);
        }
      for (let k = 0; k < SEG; k++) {
        const k1 = (k + 1) % SEG;
        idx.push(0, 1 + k1, 1 + k, 1 + k, 1 + k1, 1 + SEG + k1, 1 + k, 1 + SEG + k1, 1 + SEG + k);
      }
      const g = new K.BufferGeometry();
      g.setAttribute('position', new K.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('color', new K.BufferAttribute(new Float32Array(col), 3));
      g.setIndex(idx);
      const m = new K.InstancedMesh(g, new K.MeshBasicMaterial({
        vertexColors: true, blending: 2 /* additive */, transparent: true, depthWrite: false, toneMapped: false }), spots.length / 3);
      const a = m.instanceMatrix.array;
      for (let i = 0, n = 0; i < spots.length; i += 3, n++) {
        const x = spots[i], z = spots[i + 1], r = spots[i + 2] >= 7 ? 8 : 6;
        a.set([r, 0, 0, 0, 0, 1, 0, 0, 0, 0, r, 0, x, ground(x, z) + 1.1, z, 1], n * 16);
      }
      m.instanceMatrix.needsUpdate = true;
      m.frustumCulled = false; m.renderOrder = 5; m.visible = false; m.name = 'street-lights';
      city.scene.add(m);
      return m;
    })();

    // --- Head and tail lights, on the renderer's cars and buses and the live buses ---------------------------
    function lampGeometry(half, y0, y1, w0, w1) {
      const pos = [], col = [];
      const box = (x0, x1, za, zb, c) => {
        const v = [[x0, y0, za], [x1, y0, za], [x1, y1, za], [x0, y1, za], [x0, y0, zb], [x1, y0, zb], [x1, y1, zb], [x0, y1, zb]];
        for (const f of [[0, 1, 2, 3], [5, 4, 7, 6], [1, 5, 6, 2], [4, 0, 3, 7], [3, 2, 6, 7], [4, 5, 1, 0]])
          for (const k of [0, 1, 2, 0, 2, 3]) pos.push(...v[f[k]]), col.push(...c);
      };
      const head = [1, 0.95, 0.75], tail = [1, 0.12, 0.08];
      for (const s of [-1, 1]) {
        box(half - 0.05, half + 0.3, s * w0, s * w1, head);
        box(-half - 0.3, -half + 0.05, s * w0, s * w1, tail);
      }
      const g = new K.BufferGeometry();
      g.setAttribute('position', new K.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('color', new K.BufferAttribute(new Float32Array(col), 3));
      return g;
    }
    // The headlights' beams on the road ahead, fading out. (See-through rather than additive: the moving layer is
    // laid over the still one by its alpha, which additive drawing leaves empty.)
    function beamGeometry(half, w, len) {
      const near = [1, 0.92, 0.7, 0.34], far = [1, 0.92, 0.7, 0], y = 0.08;
      const v = [[half, y, -w], [half, y, w], [half + len, y, w * 2.6], [half + len, y, -w * 2.6]];
      const pos = [], col = [];
      for (const k of [0, 2, 1, 0, 3, 2]) pos.push(...v[k]), col.push(...(k < 2 ? near : far));
      const g = new K.BufferGeometry();
      g.setAttribute('position', new K.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('color', new K.BufferAttribute(new Float32Array(col), 4));
      return g;
    }
    const lampMat = new K.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const beamMat = new K.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, depthWrite: false, side: 2 /* both */ });
    const lamps = [];
    function lampsFor(src, geo, beam) {
      if (!src || lamps.some((l) => l.src === src)) return;
      for (const [g, mt] of [[geo, lampMat], [beam, beamMat]]) {
        const m = new src.constructor(g, mt, src.instanceMatrix.count);
        m.instanceMatrix = src.instanceMatrix; // the same buffer: the lamps move with the vehicles, for free
        m.layers.mask = src.layers.mask; m.frustumCulled = false; m.visible = false; m.name = 'lamps';
        src.parent.add(m);
        lamps.push({ src, m });
      }
    }
    const carLamps = lampGeometry(3.3, 0.55, 1.05, 0.45, 1.25), busLamps = lampGeometry(7.8, 0.5, 1.0, 0.75, 1.55);
    const carBeam = beamGeometry(3.4, 0.9, 10), busBeam = beamGeometry(7.9, 1.1, 12);
    const attachLamps = () => {
      lampsFor(life.cars?.mesh, carLamps, carBeam);
      lampsFor(life.buses?.mesh, busLamps, busBeam);
      lampsFor(window.__liveBuses?.meshes?.buses, busLamps, busBeam);
    };

    // --- Rain: streaks falling through the view ------------------------------------------------------------------
    const RAIN = 2600;
    const rain = new K.InstancedMesh(new K.BoxGeometry(1, 1, 1),
      new K.MeshBasicMaterial({ color: '#b9c8d6', transparent: true, opacity: 0.5, depthWrite: false }), RAIN);
    rain.layers.mask = life.cats?.mesh.layers.mask ?? rain.layers.mask;
    rain.frustumCulled = false; rain.count = 0; rain.name = 'rain';
    life.root.add(rain);
    const drops = Array.from({ length: RAIN }, () => [Math.random(), Math.random(), Math.random()]);
    let rainRate = 0, rainClock = 0;
    function updateRain(dt) {
      rainClock += dt;
      const n = Math.round(rainRate);
      rain.count = n;
      if (!n) return;
      const v = city.view, span = v.span, R = span * 0.8, H = span * 0.45, len = span / 70, w = span / 1400;
      const gy = ground(v.cx, v.cz), a = rain.instanceMatrix.array;
      for (let i = 0; i < n; i++) {
        const [u, q, ph] = drops[i], ang = u * Math.PI * 2, rr = Math.sqrt(q) * R;
        const x = v.cx + Math.cos(ang) * rr, z = v.cz + Math.sin(ang) * rr;
        const y = gy + H - (((rainClock * 0.9 + ph) % 1) * H);
        a.set([w, 0, 0, 0, 0, len, 0, 0, 0, 0, w, 0, x, y, z, 1], i * 16);
      }
      rain.instanceMatrix.needsUpdate = true;
    }

    // --- Every frame: lamps follow their vehicles' counts, rain falls ---------------------------------------------
    let lightsOn = 0;
    const lifeUpdate = life.update.bind(life);
    life.update = (dt) => {
      lifeUpdate(dt);
      for (const { src, m } of lamps) { m.count = src.count; m.visible = lightsOn > 0.1 && src.visible && src.parent?.visible !== false; }
      updateRain(dt);
    };

    // --- The weather ----------------------------------------------------------------------------------------------
    let weather = null;
    const out = document.createElement('output');
    out.id = 'weather';
    Object.assign(out.style, { font: "600 12.5px 'Hanken Grotesk', system-ui, sans-serif", color: 'var(--muted)', whiteSpace: 'nowrap' });
    const footer = document.querySelector('footer'), credit = document.createElement('span');
    async function fetchWeather() {
      try {
        const r = await fetch(WEATHER, { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        const c = (await r.json()).current;
        weather = { temp: c.temperature_2m, code: c.weather_code, cloud: c.cloud_cover ?? 0, precip: c.precipitation ?? 0,
          wind: c.wind_speed_10m, dir: c.wind_direction_10m };
        credit.textContent = ' · Weather: Open-Meteo';
        if (footer && !credit.isConnected) footer.append(credit);
      } catch { weather = null; }
      apply();
    }

    // --- Now, and applying a time of day --------------------------------------------------------------------------
    slider.min = '0'; slider.max = '1439'; slider.step = '1';
    slider.setAttribute('aria-label', 'Time of day');
    const nowBtn = document.createElement('button');
    nowBtn.type = 'button'; nowBtn.id = 'now'; nowBtn.textContent = 'Now';
    nowBtn.title = 'Follow the time and weather in Brisbane now';
    const label = slider.closest('label');
    label?.after(nowBtn);
    nowBtn.after(out);
    let now = Q.get('time') == null, ticking = false;
    if (!now) slider.value = String(clamp(+Q.get('time') || 0, 0, 1439)); // ?time=1260 for 9pm, for testing
    nowBtn.setAttribute('aria-pressed', String(now));
    const setNow = (on) => {
      now = on;
      nowBtn.setAttribute('aria-pressed', String(on));
      if (on) tick();
      else apply();
    };
    nowBtn.addEventListener('click', () => setNow(!now));
    slider.addEventListener('input', () => { if (!ticking && now) setNow(false); else apply(); });
    function tick() {
      if (!now) return;
      ticking = true;
      slider.value = String(nowMin());
      slider.dispatchEvent(new Event('input')); // the renderer's own handler first (label, tints), then apply()
      ticking = false;
      apply();
    }

    function apply() {
      const min = +slider.value, s = sunAt(min), v = city.view, st = city.style;
      const day = smooth(-3, 6, s.el), night = 1 - smooth(-12, -2, s.el);
      lightsOn = 1 - smooth(-4, 5, s.el);
      const w = now ? weather : null, cc = w ? clamp(w.cloud / 100, 0, 1) : 0, wet = w && w.precip > 0.05 ? 1 : 0;
      // the light comes from the sun while it's up, and from a high moon at night
      if (day > 0.02) Object.assign(v, { sunAz: s.az, sunEl: clamp(s.el, 6, 85) });
      else Object.assign(v, { sunAz: (s.az + 180) % 360, sunEl: 50 });
      const k = clamp((30 - s.el) / 24, 0, 1); // golden hour, as the renderer tints it
      city.sun.color.lerpColors(TINT.day, TINT.gold, k).lerp(TINT.moon, night);
      city.sun.intensity = st.sunI * (1 + 0.45 * k) * day * (1 - 0.72 * Math.pow(cc, 1.3)) * (wet ? 0.75 : 1) + 0.5 * night;
      city.hemi.color.lerpColors(TINT.sky, TINT.dusk, k).lerp(TINT.grey, 0.5 * cc * day).lerp(TINT.nightSky, night);
      city.hemi.groundColor.set(st.hemiGround).lerp(TINT.nightGround, night);
      city.hemi.intensity = st.hemiI * (1 - 0.08 * k) * (1 + 0.3 * cc * day) * (1 - 0.7 * night);
      const css = getComputedStyle(document.documentElement).getPropertyValue('--stage').trim() || '#efe6d6';
      const bg = C(css).lerp(TINT.grey, 0.35 * cc * day).lerp(TINT.nightBg, Math.max(night, 0.6 * (1 - day)));
      city.setBackground('#' + bg.getHexString());
      U.uNight.value = lightsOn;
      U.uLit.value = litAt(min);
      pools.visible = lightsOn > 0.03;
      pools.material.color.setScalar(0.38 * lightsOn);
      attachLamps();
      rainRate = w && w.precip > 0.05 ? Math.min(RAIN, 350 + w.precip * 700) : 0;
      out.textContent = w ? `${Math.round(w.temp)}° · ${SKY[w.code] ?? ''}` : '';
      out.hidden = !w;
      city.invalidate();
      city.updateCamera();
      D.requestRender?.();
    }
    // The renderer resets the background when the theme changes; put the sky's back.
    new MutationObserver(() => apply()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(apply));

    setInterval(tick, TICK_MS);
    setInterval(attachLamps, 5000);
    setInterval(fetchWeather, WEATHER_MS);
    window.__liveSky = { sunAt, apply, get weather() { return weather; }, get now() { return now; }, setNow, pools, lamps, rain };
    if (now) tick(); else { slider.dispatchEvent(new Event('input')); apply(); }
    fetchWeather();
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.life) { clearInterval(wait); start(); }
  }, 200);
})();
