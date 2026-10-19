// Ferry terminals for the Brisbane pixel diorama, on their real OpenStreetMap outlines (terminals.json, made by
// live/build_terminals.py). Like the landmark models in the city diorama kit, each one is hand-built on its
// mapped footprint: the outline becomes the floating pontoon and gangway deck, and a shelter roof on posts
// sits over the pontoon section (the outline's wide part). Heights are real metres times the map's 1.6.
//
// It also publishes the terminals and their TransLink stop ids as window.__ferryTerminals, which the live
// ferries layer uses to name the stop a ferry is at, and for the terminal tooltips.
(() => {
  const WATER = 0.6; // the renderer's water level for boats (Hu in city.js)
  const S = 1.6; // the map's height scale
  const DECK = { bottom: 0.25, top: 1.35 }; // pontoon deck, metres above WATER (unscaled: it floats)
  const ROOF = { clear: 2.9, thick: 0.45, overhang: 0.6, post: 0.35 };
  const COL = { deck: '#a7aeb2', side: '#4b5156', roof: '#f1f0ea', fascia: '#2f5fa8', post: '#5c6469' };

  async function start() {
    const D = window.__dio;
    let data;
    try {
      const r = await fetch('terminals.json', { cache: 'no-store' });
      if (!r.ok) return;
      data = await r.json();
    } catch { return; } // the published artifact has no terminals.json: nothing to add
    const { city } = D;
    const ref = city.buildingMeshes[0];
    const Mesh = ref.constructor, Geometry = ref.geometry.constructor, Attr = ref.geometry.attributes.position.constructor;
    const Material = city.mats.building.constructor, Color = city.sun.color.constructor;
    const lin = (hex) => { const c = new Color(hex); return [c.r, c.g, c.b]; };
    const pos = [], nor = [], col = [];

    function tri(a, b, c, rgb, up) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) return;
      nx /= l; ny /= l; nz /= l;
      if (up && ny < 0) { [b, c] = [c, b]; nx = -nx; ny = -ny; nz = -nz; }
      for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); nor.push(nx, ny, nz); col.push(rgb[0], rgb[1], rgb[2]); }
    }
    function quad(a, b, c, d, rgb) { tri(a, b, c, rgb); tri(a, c, d, rgb); }
    // Walls of a ring (world [x, z] points) from y0 to y1, facing out from its centre.
    function walls(ring, y0, y1, rgb) {
      const mx = ring.reduce((s, p) => s + p[0], 0) / ring.length, mz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const nx = b[1] - a[1], nz = -(b[0] - a[0]); // one of the two normals
        const out = (a[0] + b[0]) / 2 - mx, oz = (a[1] + b[1]) / 2 - mz;
        const flip = nx * out + nz * oz < 0;
        const p = [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]];
        if (flip) quad(p[1], p[0], p[3], p[2], rgb); else quad(p[0], p[1], p[2], p[3], rgb);
      }
    }
    function box(t, u0, v0, u1, v1, y0, y1, side, top) {
      const c = Math.cos(t.rot), s = Math.sin(t.rot);
      const w = (u, v) => [t.x + u * c - v * s, t.z + u * s + v * c];
      const ring = [w(u0, v0), w(u1, v0), w(u1, v1), w(u0, v1)];
      walls(ring, y0, y1, side);
      const T = ring.map(([x, z]) => [x, y1, z]);
      tri(T[0], T[1], T[2], top, true); tri(T[0], T[2], T[3], top, true);
      const B = ring.map(([x, z]) => [x, y0, z]);
      tri(B[0], B[2], B[1], side); tri(B[0], B[3], B[2], side);
    }

    const deck = lin(COL.deck), side = lin(COL.side), roof = lin(COL.roof), fascia = lin(COL.fascia), post = lin(COL.post);
    const y0 = WATER + DECK.bottom, y1 = WATER + DECK.top;
    for (const t of data.terminals) {
      // The pontoon and gangway deck, on the real outline.
      walls(t.outline, y0, y1, side);
      for (const [a, b, c] of t.tris) {
        tri([t.outline[a][0], y1, t.outline[a][1]], [t.outline[b][0], y1, t.outline[b][1]], [t.outline[c][0], y1, t.outline[c][1]], deck, true);
      }
      const R = t.roof; // {x, z, rot, len, wid}: the pontoon's shelter, found by build_terminals.py
      if (!R) continue;
      // The shelter: posts along both long sides, a blue fascia band and a white roof.
      const u0 = -R.len / 2, u1 = R.len / 2, v0 = -R.wid / 2, v1 = R.wid / 2, p = ROOF.post;
      const r0 = y1 + ROOF.clear * S, r1 = r0 + ROOF.thick * S;
      const bays = Math.max(1, Math.round(R.len / 9)); // a post every 9 m or so
      for (let i = 0; i <= bays; i++) {
        const u = u0 + ((u1 - u0 - p) * i) / bays;
        box(R, u, v0 + 0.4, u + p, v0 + 0.4 + p, y1, r0, post, post);
        box(R, u, v1 - 0.4 - p, u + p, v1 - 0.4, y1, r0, post, post);
      }
      const o = ROOF.overhang;
      box(R, u0 - o, v0 - o, u1 + o, v1 + o, r0, r0 + 0.18 * S, fascia, fascia); // fascia band
      box(R, u0 - o + 0.15, v0 - o + 0.15, u1 + o - 0.15, v1 + o - 0.15, r0 + 0.18 * S, r1, roof, roof);
    }

    const g = new Geometry();
    g.setAttribute('position', new Attr(new Float32Array(pos), 3));
    g.setAttribute('normal', new Attr(new Float32Array(nor), 3));
    g.setAttribute('color', new Attr(new Float32Array(col), 3));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, new Material({ vertexColors: true, roughness: 0.85 }));
    mesh.name = 'ferry-terminals';
    mesh.castShadow = mesh.receiveShadow = true;
    city.scene.add(mesh);
    window.__ferryTerminals = { terminals: data.terminals, stops: data.stops };
    city.invalidate?.();
    D.requestRender?.();
    tooltips(city, data);
  }

  // Hover a ferry for its name and where it is, or a terminal for its name. Boats come from the live layer
  // (window.__liveFerries.drawn), so with no live data only the terminals answer.
  function tooltips(city, data) {
    const canvas = document.getElementById('c') || city.renderer.domElement;
    const Vec3 = city.camera.position.constructor, v3 = new Vec3();
    const tip = document.createElement('div');
    tip.className = 'panel ferry-tip';
    tip.hidden = true;
    Object.assign(tip.style, {
      position: 'fixed', zIndex: 30, pointerEvents: 'none', padding: '8px 11px', maxWidth: '260px',
      font: "600 13px/1.35 'Hanken Grotesk', system-ui, sans-serif", boxShadow: '0 2px 0 var(--shadow)',
    });
    document.body.append(tip);
    const STATUS = { 0: 'Arriving at', 1: 'At', 2: 'Heading to' };
    const kind = (route) => (route === 'F1' ? 'CityCat' : route ? `Ferry, route ${route}` : 'Ferry');
    const stopName = (id) => data.stops[id]?.name || (id ? `stop ${id}` : '');
    function screen(x, y, z) {
      v3.set(x, y, z).project(city.camera);
      const r = canvas.getBoundingClientRect();
      return [r.left + ((v3.x + 1) / 2) * r.width, r.top + ((1 - v3.y) / 2) * r.height, v3.z];
    }
    function show(lines, x, y) {
      tip.replaceChildren(...lines.map(([text, muted], i) => {
        const d = document.createElement('div');
        d.textContent = text;
        if (muted) Object.assign(d.style, { color: 'var(--muted)', fontWeight: 500, marginTop: i ? '2px' : 0 });
        return d;
      }));
      tip.hidden = false;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.min(x + 14, innerWidth - w - 8) + 'px';
      tip.style.top = Math.min(y + 14, innerHeight - h - 8) + 'px';
    }
    canvas.addEventListener('pointermove', (e) => {
      if (e.buttons || e.pointerType !== 'mouse') { tip.hidden = true; return; }
      let best = null, bd = 18;
      for (const b of window.__liveFerries?.live ? window.__liveFerries.drawn : []) {
        const [sx, sy, sz] = screen(b.x, WATER + 2, b.z);
        const d = Math.hypot(sx - e.clientX, sy - e.clientY);
        if (sz < 1 && d < bd) { bd = d; best = { boat: b }; }
      }
      if (!best) {
        bd = 22;
        for (const t of data.terminals) {
          const [sx, sy, sz] = screen(t.x, WATER + 3, t.z);
          const d = Math.hypot(sx - e.clientX, sy - e.clientY);
          if (sz < 1 && d < bd) { bd = d; best = { terminal: t }; }
        }
      }
      if (!best) { tip.hidden = true; return; }
      if (best.boat) {
        const b = best.boat, where = b.stop ? `${STATUS[b.status] ?? 'Heading to'} ${stopName(b.stop)}` : '';
        show([[b.name], [kind(b.route), true], ...(where ? [[where, true]] : [])], e.clientX, e.clientY);
      } else {
        show([[best.terminal.name], ['Ferry terminal', true]], e.clientX, e.clientY);
      }
    });
    canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
    canvas.addEventListener('pointerdown', () => { tip.hidden = true; });
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.city) { clearInterval(wait); start(); }
  }, 200);
})();
