// The sky over the Brisbane pixel diorama: the real sun and weather now. Added 19 Oct 2026.
//
// - The sun: the Now button (on when the page opens) keeps the time slider at the time in Brisbane, with the sun
//   where it really is today (its declination and the equation of time for the date, not the fixed mid-October sun
//   the slider had). The slider keeps its daylight range, 6am to 5:15pm; outside it, Now shows the map as it always
//   opened, at 2pm in clear weather. Dragging the slider leaves Now; the button comes back to it.
// - The weather, in Now mode in daylight: Open-Meteo's current conditions for Brisbane (no key, CC BY 4.0), every
//   10 minutes. Cloud dims the sun and softens the shadows and rain falls as streaks. The toolbar always shows the
//   temperature and sky.
//
// (A night mode, with lit windows, street lights and headlights, was tried on 19 Oct 2026 and taken out: Thomas
// preferred the daylight look.) ?sky=off keeps the original slider.
(() => {
  const Q = new URLSearchParams(location.search);
  if (Q.get('sky') === 'off') return;
  const LAT = -27.47, LON = 153.02; // Brisbane: AEST (UTC+10) all year
  const WEATHER = 'https://api.open-meteo.com/v1/forecast?latitude=-27.47&longitude=153.02' +
    '&current=temperature_2m,weather_code,cloud_cover,precipitation,wind_speed_10m,wind_direction_10m&timezone=Australia%2FBrisbane';
  const WEATHER_MS = 600000, TICK_MS = 15000;
  const rad = Math.PI / 180;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const brisbane = () => new Date(Date.now() + 10 * 3600e3); // read with getUTC*
  const nowMin = () => { const d = brisbane(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const dayOfYear = () => { const d = brisbane(); return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1; };
  // The sun for a time of day (minutes, AEST) today: NOAA's declination and equation of time, and the renderer's own
  // azimuth convention (its a_() in city.js).
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
  const SKY = { // WMO weather codes, as Open-Meteo gives them
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle',
    55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers',
    95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail',
  };

  function start() {
    const D = window.__dio, K = window.__terrain?.K, { city, life } = D;
    const slider = document.getElementById('sun');
    if (!K?.InstancedMesh || !slider) return;
    const T = D.terrain, ground = (x, z) => (T ? T.h(x, z) : 0);
    const Color = city.sun.color.constructor;
    const C = (hex) => new Color(hex);
    const TINT = { day: C('#fff1dc'), gold: C('#ffa257'), sky: C('#fff6ea'), dusk: C('#ffd2a8'), grey: C('#c9ced3') };
    const LO = +slider.min, HI = +slider.max, AFTERNOON = +slider.value; // the slider's daylight range, and where it opened (2pm)

    // --- Rain: streaks falling through the view ------------------------------------------------------------------
    const RAIN = 2600;
    const rain = new K.InstancedMesh(new K.BoxGeometry(1, 1, 1),
      new K.MeshBasicMaterial({ color: '#b9c8d6', transparent: true, opacity: 0.5, depthWrite: false }), RAIN);
    rain.layers.mask = life.cats?.mesh.layers.mask ?? life.cars?.mesh.layers.mask ?? rain.layers.mask;
    rain.frustumCulled = false; rain.count = 0; rain.name = 'rain';
    life.root.add(rain);
    const drops = Array.from({ length: RAIN }, () => [Math.random(), Math.random(), Math.random()]);
    let rainRate = 0, rainClock = 0;
    const lifeUpdate = life.update.bind(life);
    life.update = (dt) => {
      lifeUpdate(dt);
      rainClock += dt;
      const n = Math.round(rainRate);
      rain.count = n;
      if (!n) return;
      const v = city.view, span = v.span, R = span * 0.8, H = span * 0.45, len = span / 70, w = span / 1400;
      const gy = ground(v.cx, v.cz), a = rain.instanceMatrix.array;
      for (let i = 0; i < n; i++) {
        const [u, q, ph] = drops[i], ang = u * Math.PI * 2, rr = Math.sqrt(q) * R;
        a.set([w, 0, 0, 0, 0, len, 0, 0, 0, 0, w, 0, v.cx + Math.cos(ang) * rr, gy + H - ((rainClock * 0.9 + ph) % 1) * H, v.cz + Math.sin(ang) * rr, 1], i * 16);
      }
      rain.instanceMatrix.needsUpdate = true;
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
    slider.step = '1';
    const nowBtn = document.createElement('button');
    nowBtn.type = 'button'; nowBtn.id = 'now'; nowBtn.textContent = 'Now';
    nowBtn.title = 'Follow the sun and weather in Brisbane now (after dark, the afternoon)';
    const label = slider.closest('label');
    label?.after(nowBtn);
    nowBtn.after(out);
    let now = Q.get('time') == null, ticking = false, dark = false;
    if (!now) slider.value = String(clamp(+Q.get('time') || 0, LO, HI)); // ?time=480 for 8am, for testing
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
      const m = nowMin();
      dark = m < LO || m > HI;
      slider.value = String(dark ? AFTERNOON : m);
      slider.dispatchEvent(new Event('input')); // the renderer's own handler first (its label and tints), then apply()
      ticking = false;
      apply();
    }

    function apply() {
      const s = sunAt(+slider.value), v = city.view, st = city.style;
      const w = now && !dark ? weather : null, cc = w ? clamp(w.cloud / 100, 0, 1) : 0, wet = w && w.precip > 0.05;
      Object.assign(v, { sunAz: s.az, sunEl: clamp(s.el, 4, 85) });
      const k = clamp((30 - v.sunEl) / 24, 0, 1); // golden hour, as the renderer tints it
      city.sun.color.lerpColors(TINT.day, TINT.gold, k);
      city.sun.intensity = st.sunI * (1 + 0.45 * k) * (1 - 0.72 * Math.pow(cc, 1.3)) * (wet ? 0.75 : 1);
      city.hemi.color.lerpColors(TINT.sky, TINT.dusk, k).lerp(TINT.grey, 0.5 * cc);
      city.hemi.intensity = st.hemiI * (1 - 0.08 * k) * (1 + 0.3 * cc);
      const css = getComputedStyle(document.documentElement).getPropertyValue('--stage').trim() || '#efe6d6';
      city.setBackground(cc > 0 ? '#' + C(css).lerp(TINT.grey, 0.35 * cc).getHexString() : css);
      rainRate = wet ? Math.min(RAIN, 350 + w.precip * 700) : 0;
      out.textContent = weather ? `${Math.round(weather.temp)}° · ${SKY[weather.code] ?? ''}` : '';
      out.hidden = !weather;
      city.invalidate();
      city.updateCamera();
      D.requestRender?.();
    }
    // The renderer resets the background when the theme changes; put the cloud's grey back.
    new MutationObserver(() => apply()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(apply));

    setInterval(tick, TICK_MS);
    setInterval(fetchWeather, WEATHER_MS);
    window.__liveSky = { sunAt, apply, get weather() { return weather; }, get now() { return now; }, setNow, rain };
    if (now) tick(); else { slider.dispatchEvent(new Event('input')); apply(); }
    fetchWeather();
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.life) { clearInterval(wait); start(); }
  }, 200);
})();
