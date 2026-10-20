// Ride replay for the Brisbane pixel diorama (20 Oct 2026): a bike ride played back on the map, with the route drawn
// as it's ridden, the camera following the rider, the time of day, speed, height and heart rate, and the sun where it
// was at that time of day.
//
// The ride comes from ride.json, Thomas's latest Strava ride, written on his PC by Claude Code from the Strava
// connector (ask Claude to refresh it after a new ride). It's personal location data (his rides start at home), so
// ride.json is gitignored and never copied to the public site. Any copy can also replay a GPX file: the
// Ride button opens one when there's no ride.json, and the replay panel has "Open a GPX file" (Strava exports one
// from a ride's menu).
//
// The route is a Catmull-Rom curve through the GPS points, sampled every 3 m and draped on the ground (or a bridge
// deck over the river); the travelled part is drawn over the rest as the replay goes. Points outside the map's
// circle aren't drawn. ?ride=1 starts the replay as the page opens.
(() => {
  const Q = new URLSearchParams(location.search);
  if (Q.get('mode') === 'roll') return;
  const SPEEDS = [10, 20, 40, 80, 160]; // times real time
  const ORANGE = '#fc4c02', PALE = '#f6c3a4';
  const fileReady = fetch('ride.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  // --- A ride: {name, start (Date, local), elapsed, pts: [{t, x, z, alt, hr, v, d}]} ------------------------------------
  function fromJson(j) {
    const f = j.fields, at = (k) => f.indexOf(k);
    const pts = j.points.map((p) => ({ t: p[at('t')], x: p[at('x')], z: p[at('z')], alt: p[at('alt')], hr: p[at('hr')], v: p[at('v')], d: p[at('d')] }));
    return { name: j.name, start: j.start_local, elapsed: pts.at(-1).t, distance: j.distance, gain: j.elevation_gain, pts };
  }
  function fromGpx(text, data) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const tp = [...doc.getElementsByTagName('trkpt')];
    if (tp.length < 2) throw new Error('no track points');
    const [ox, oz] = data.origin, MX = 111320 * Math.cos((oz * Math.PI) / 180), MZ = 110540;
    const t0 = Date.parse(tp[0].getElementsByTagName('time')[0]?.textContent || '');
    const pts = [];
    let d = 0, gain = 0;
    tp.forEach((e, i) => {
      const lat = +e.getAttribute('lat'), lon = +e.getAttribute('lon');
      const x = (lon - ox) * MX, z = -(lat - oz) * MZ, tt = Date.parse(e.getElementsByTagName('time')[0]?.textContent || '');
      const alt = +(e.getElementsByTagName('ele')[0]?.textContent ?? NaN), hr = +(e.getElementsByTagNameNS('*', 'hr')[0]?.textContent ?? NaN);
      const prev = pts.at(-1);
      if (prev) { d += Math.hypot(x - prev.x, z - prev.z); if (alt > prev.alt) gain += alt - prev.alt; }
      const t = Number.isFinite(tt) && Number.isFinite(t0) ? (tt - t0) / 1000 : i;
      pts.push({ t, x, z, alt: Number.isFinite(alt) ? alt : 0, hr: Number.isFinite(hr) ? hr : null, v: 0, d });
    });
    for (let i = 1; i < pts.length; i++) pts[i].v = (pts[i].d - pts[i - 1].d) / Math.max(1, pts[i].t - pts[i - 1].t);
    const name = doc.getElementsByTagName('name')[0]?.textContent?.trim() || 'Ride';
    const startIso = Number.isFinite(t0) ? new Date(t0 + 10 * 3600e3).toISOString().slice(0, 19) : null; // AEST
    return { name, start: startIso, elapsed: pts.at(-1).t, distance: d, gain: Math.round(gain), pts };
  }

  async function start() {
    const D = window.__dio, K = window.__terrain?.K;
    if (!D?.city || !K) return;
    const { city, data } = D, T = D.terrain;
    const [ccx, ccz, cr] = data.circle;
    const onMap = (x, z) => Math.hypot(x - ccx, z - ccz) <= cr - 2;
    const groundY = (x, z) => {
      if (!T) return 0.6;
      const g = T.h(x, z), deck = T.deckAt?.(x, z, 7);
      if (deck != null && (T.inWater(x, z) || deck - g < 6)) return deck; // on a bridge deck (not one passing overhead)
      return Math.max(g, T.inWater(x, z) ? 0.6 : g);
    };

    // --- The toolbar button and the panel ---------------------------------------------------------------------------
    const roll = document.getElementById('rollMode');
    const btn = document.createElement('button');
    btn.id = 'rideMode'; btn.type = 'button';
    btn.title = 'Replay a bike ride on the map (with no ride saved here, it opens a GPX file)';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5.5" cy="16" r="3.5"/><circle cx="18.5" cy="16" r="3.5"/><path d="M5.5 16l4-7h6l3 7M9.5 9l3 7 3-7M8 6h3"/></svg><span class="text">Ride</span>';
    roll?.after(btn);
    const picker = document.createElement('input');
    picker.type = 'file'; picker.accept = '.gpx,application/gpx+xml'; picker.hidden = true;
    document.body.append(picker);

    const css = document.createElement('style');
    css.textContent = `
      #rideHud { position: absolute; top: max(14px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); z-index: 30;
        width: min(560px, calc(100% - 32px)); box-sizing: border-box; padding: 11px 15px 12px; }
      #rideHud[hidden] { display: none; }
      #rideHud .kicker { display: flex; justify-content: space-between; gap: 8px; }
      #rideHud h2 { margin: 4px 0 0; font: 800 20px/1.1 'Hanken Grotesk', system-ui, sans-serif; }
      #rideHud .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 10px 0 8px; }
      #rideHud .stat b { display: block; font: 800 19px/1.1 'JetBrains Mono', monospace; letter-spacing: -.02em; }
      #rideHud .stat span { font: 600 10.5px/1.2 'Hanken Grotesk', system-ui, sans-serif; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
      #rideHud .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      #rideHud input[type=range] { flex: 1; min-width: 120px; accent-color: ${ORANGE}; }
      #rideHud button { height: 30px; padding: 0 10px; border: 0; border-radius: 8px; background: var(--chip, rgba(0,0,0,.06)); color: var(--ink);
        font: 600 12.5px 'Hanken Grotesk', system-ui, sans-serif; cursor: pointer; }
      #rideHud button.on { background: ${ORANGE}; color: #fff; }
      #rideHud .gpx { margin-top: 7px; font: 500 11.5px 'Hanken Grotesk', system-ui, sans-serif; color: var(--muted); }
      #rideHud .gpx a { color: inherit; cursor: pointer; text-decoration: underline; }
      body.riding header, body.riding #hint { display: none !important; }
      @media (max-width: 640px) { #rideHud .stats { grid-template-columns: repeat(3, 1fr); } #rideHud .stat.hr, #rideHud .stat.alt { display: none; } }
    `;
    document.head.append(css);
    const hud = document.createElement('section');
    hud.id = 'rideHud'; hud.className = 'panel'; hud.hidden = true;
    hud.innerHTML = `
      <div class="kicker"><span class="when"></span><span class="clock"></span></div>
      <h2 class="name"></h2>
      <div class="stats">
        <div class="stat"><b class="dist">0.0</b><span>km</span></div>
        <div class="stat"><b class="speed">0</b><span>km/h</span></div>
        <div class="stat"><b class="time">0:00</b><span>riding</span></div>
        <div class="stat alt"><b class="altv">0</b><span>m high</span></div>
        <div class="stat hr"><b class="hrv">–</b><span>bpm</span></div>
      </div>
      <div class="row">
        <button type="button" data-act="play">Pause</button>
        <input type="range" class="scrub" min="0" max="1000" value="0" aria-label="Where in the ride">
        <button type="button" data-act="speed" title="Replay speed">40×</button>
        <button type="button" data-act="follow" class="on" title="Keep the rider in view">Follow</button>
        <button type="button" data-act="exit">Done</button>
      </div>
      <div class="gpx">Replay another ride: <a data-act="gpx">open a GPX file</a></div>`;
    document.body.append(hud);
    const $ = (s) => hud.querySelector(s);

    // --- The scene: the route (pale, then orange where ridden), the rider and a pin over them, on the moving layer -----
    const group = new (D.life.root.constructor)();
    group.name = 'ride-replay'; group.visible = false;
    const mat = (hex) => new K.MeshStandardMaterial({ color: new (city.sun.color.constructor)(hex), roughness: 0.7 });
    const routeAll = new K.Mesh(new K.BufferGeometry(), mat(PALE)), routeDone = new K.Mesh(new K.BufferGeometry(), mat(ORANGE));
    routeAll.frustumCulled = routeDone.frustumCulled = false;
    // the rider: wheels, frame, rider in a navy jersey (it shows against the orange route) and a white helmet, real size at 1
    const rider = new (D.life.root.constructor)();
    const part = (w, h, d, x, y, z, hex) => { const m = new K.Mesh(new K.BoxGeometry(w, h, d), mat(hex)); m.position.set(x, y, z); rider.add(m); };
    part(0.08, 0.7, 0.7, 0, 0.35, -0.55, '#222222'); part(0.08, 0.7, 0.7, 0, 0.35, 0.55, '#222222'); // wheels
    part(0.1, 0.12, 1.1, 0, 0.62, 0, '#3a3f46'); part(0.1, 0.5, 0.1, 0, 0.8, -0.2, '#3a3f46'); // frame, seat post
    part(0.42, 0.62, 0.36, 0, 1.25, -0.08, '#1d3557'); part(0.3, 0.55, 0.3, 0, 0.82, -0.05, '#111111'); // jersey, legs
    part(0.12, 0.08, 0.5, 0.18, 1.2, 0.3, '#1d3557'); part(0.12, 0.08, 0.5, -0.18, 1.2, 0.3, '#1d3557'); // arms
    part(0.3, 0.26, 0.34, 0, 1.68, 0.05, '#f4f4f4'); // helmet
    const pin = new (D.life.root.constructor)();
    { const m = new K.Mesh(new K.BoxGeometry(0.5, 1, 0.5), mat(ORANGE)); m.position.y = 0.5; pin.add(m);
      const top = new K.Mesh(new K.BoxGeometry(3, 3, 3), mat(ORANGE)); top.position.y = 1.05; top.scale.set(1, 0.1, 1); pin.add(top); }
    group.add(routeAll, routeDone, rider, pin);
    city.addMoving(group);

    // --- Loading a ride: the curve, its samples and the route meshes ------------------------------------------------
    let ride = null, samples = [], cum = [];
    function load(r) {
      ride = r;
      const P = r.pts;
      // Catmull-Rom through the points, sampled so the route has a point every 3 m or so
      samples = [];
      for (let i = 0; i + 1 < P.length; i++) {
        const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], e = P[Math.min(P.length - 1, i + 2)];
        const n = Math.max(1, Math.ceil(Math.hypot(c.x - b.x, c.z - b.z) / 3));
        for (let k = 0; k < n; k++) {
          const u = k / n, u2 = u * u, u3 = u2 * u;
          const cr2 = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
          samples.push({ x: cr2(a.x, b.x, c.x, e.x), z: cr2(a.z, b.z, c.z, e.z), t: b.t + (c.t - b.t) * u });
        }
      }
      samples.push({ x: P.at(-1).x, z: P.at(-1).z, t: P.at(-1).t });
      for (const s of samples) s.y = groundY(s.x, s.z);
      // the ribbon: a quad per sample step, inside the circle; cum[i] counts the vertices drawn up to sample i
      const pos = [];
      cum = [0];
      const W = 2.4; // half the ribbon's width, drawn metres
      for (let i = 0; i + 1 < samples.length; i++) {
        const a = samples[i], b = samples[i + 1];
        if (onMap(a.x, a.z) && onMap(b.x, b.z)) {
          const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, ox = (-(b.z - a.z) / L) * W, oz = ((b.x - a.x) / L) * W;
          const q = [[a.x + ox, a.y, a.z + oz], [b.x + ox, b.y, b.z + oz], [b.x - ox, b.y, b.z - oz], [a.x - ox, a.y, a.z - oz]];
          for (const k of [0, 1, 2, 0, 2, 3]) pos.push(q[k][0], q[k][1], q[k][2]);
        }
        cum.push(pos.length / 3);
      }
      const geo = () => { const g = new K.BufferGeometry(); g.setAttribute('position', new K.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('normal', new K.BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); return g; };
      routeAll.geometry.dispose(); routeDone.geometry.dispose();
      routeAll.geometry = geo(); routeDone.geometry = geo();
      routeAll.position.y = 1.2; routeDone.position.y = 1.6; // over the roads (0.45 up)
      $('.name').textContent = r.name;
      const st = r.start ? new Date(r.start + 'Z') : null;
      $('.when').textContent = st ? st.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) + ` · ${(r.distance / 1000).toFixed(1)} km · ${r.gain} m up` : '';
      $('.scrub').max = String(Math.round(r.elapsed));
    }
    // where the ride is at time t: position, heading, and the stats from the nearest point
    function at(t) {
      let lo = 0, hi = samples.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].t <= t) lo = m; else hi = m; }
      const a = samples[lo], b = samples[hi], f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
      const P = ride.pts;
      let i = 0, j = P.length - 1;
      while (j - i > 1) { const m = (i + j) >> 1; if (P[m].t <= t) i = m; else j = m; }
      const p = P[i], q = P[j], g = q.t > p.t ? Math.min(1, Math.max(0, (t - p.t) / (q.t - p.t))) : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, k: lo, head: Math.atan2(b.x - a.x, b.z - a.z),
        d: p.d + (q.d - p.d) * g, v: p.v + (q.v - p.v) * g, alt: p.alt + (q.alt - p.alt) * g, hr: p.hr == null ? null : Math.round(p.hr + (q.hr - p.hr) * g) };
    }

    // --- Playing ---------------------------------------------------------------------------------------------------------
    let playing = false, active = false, t = 0, speed = 40, follow = true, last = 0, raf = 0, head = 0;
    let sunWasNow = false, sunStep = null, lastMin = -1;
    const sun = document.getElementById('sun');
    const mmss = (s) => `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    function show() {
      const s = at(t), v = city.view, k = Math.min(20, Math.max(1, v.span / 180)), r = Math.min(12, Math.max(3, v.span / 120)) * 1.6; // the pin's scale, and the rider's (as big as the map's cars up close)
      rider.position.set(s.x, s.y, s.z);
      head += (((s.head - head + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 0.25; // ease the heading round
      rider.rotation.y = head;
      rider.scale.setScalar(r);
      rider.visible = pin.visible = onMap(s.x, s.z);
      pin.position.set(s.x, s.y + 2.2 * r, s.z);
      pin.scale.set(k, 14 * k, k);
      routeDone.geometry.setDrawRange(0, cum[Math.min(cum.length - 1, s.k + 1)]);
      $('.dist').textContent = (s.d / 1000).toFixed(1);
      $('.speed').textContent = Math.round(s.v * 3.6);
      $('.time').textContent = mmss(t);
      $('.altv').textContent = Math.round(s.alt);
      $('.hrv').textContent = s.hr ?? '–';
      $('.scrub').value = String(Math.round(t));
      // the clock and the sun at the time of day the ride was at this point
      if (ride.start) {
        const st = new Date(ride.start + 'Z'), min = st.getUTCHours() * 60 + st.getUTCMinutes() + (st.getUTCSeconds() + t) / 60;
        const hh = Math.floor(min / 60) % 24, mm = Math.floor(min % 60);
        $('.clock').textContent = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
        const m = Math.round(min);
        if (sun && m !== lastMin && m >= +sun.min && m <= +sun.max) { lastMin = m; sun.value = String(m); sun.dispatchEvent(new Event('input')); }
      }
      if (follow) {
        const e = 0.12;
        v.cx += (s.x - v.cx) * e; v.cz += (s.z - v.cz) * e;
      }
    }
    function frame(now) {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (playing) {
        t = Math.min(ride.elapsed, t + dt * speed);
        if (t >= ride.elapsed) setPlaying(false);
      }
      show();
      D.requestRender?.();
      raf = requestAnimationFrame(frame);
    }
    function setPlaying(on) { playing = on; $('[data-act=play]').textContent = on ? 'Pause' : t >= ride.elapsed ? 'Again' : 'Play'; }
    function open() {
      if (!ride) return;
      active = true;
      document.body.classList.add('riding');
      hud.hidden = false; group.visible = true;
      btn.setAttribute('aria-pressed', 'true');
      sunWasNow = !!window.__liveSky?.now;
      window.__liveSky?.setNow?.(false);
      if (sun) { sunStep = sun.step; sun.step = '1'; }
      const s = at(t), v = city.view;
      Object.assign(v, { cx: s.x, cz: s.z, span: Math.min(Math.max(v.span, 500), 900), elevation: Math.max(v.elevation, 34) });
      head = s.head;
      last = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
      setPlaying(true);
    }
    function close() {
      active = false; playing = false;
      document.body.classList.remove('riding');
      hud.hidden = true; group.visible = false;
      btn.setAttribute('aria-pressed', 'false');
      cancelAnimationFrame(raf);
      if (sun && sunStep != null) sun.step = sunStep;
      if (sunWasNow) window.__liveSky?.setNow?.(true);
      D.requestRender?.();
    }
    btn.addEventListener('click', () => { if (active) close(); else if (ride) open(); else picker.click(); });
    $('[data-act=play]').onclick = () => { if (t >= ride.elapsed) t = 0; setPlaying(!playing); };
    $('[data-act=speed]').onclick = (e) => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; e.target.textContent = `${speed}×`; };
    $('[data-act=follow]').onclick = (e) => { follow = !follow; e.target.classList.toggle('on', follow); };
    $('[data-act=exit]').onclick = close;
    $('[data-act=gpx]').onclick = () => picker.click();
    $('.scrub').addEventListener('input', (e) => { t = +e.target.value; });
    addEventListener('keydown', (e) => {
      if (!active || e.target.closest?.('input:not([type=range])')) return;
      if (e.code === 'Space') { e.preventDefault(); $('[data-act=play]').click(); }
      if (e.key === 'Escape') close();
    });
    picker.addEventListener('change', async () => {
      const f = picker.files?.[0];
      picker.value = '';
      if (!f) return;
      try { load(fromGpx(await f.text(), data)); t = 0; open(); }
      catch (err) { alert(`That file has no ride in it we can read (${err.message}).`); }
    });

    const j = await fileReady;
    if (j) { load(fromJson(j)); btn.title = `Replay ${j.name} (${j.start_local.slice(0, 10)}) on the map`; }
    window.__ride = { get ride() { return ride; }, get t() { return t; }, set t(v) { t = v; }, open, close, load, fromGpx: (x) => fromGpx(x, data), get playing() { return playing; } };
    if (Q.get('ride') && ride) open();
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.city) { clearInterval(wait); start(); }
  }, 200);
})();
