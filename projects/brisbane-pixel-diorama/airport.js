// The airfield for the Brisbane Airport diorama (airport.html): aprons, taxiways and runways, which the map data
// from the city diorama kit doesn't draw. airport-features.json (airport/build_airport.py) has them from
// OpenStreetMap, in the map's own metres. Added 19 Oct 2026.
//
// Runways get their real markings, laid out as on an ICAO precision runway: threshold bars across each end, the
// touchdown-zone bars and the two big aiming-point blocks 300 m in, a dashed centre line and edge lines. Lines
// are drawn a little wider than real (about 1.5 m, not 0.9) so they read at the map's scale. Everything is flat at
// ground level, layered just above the parks and below the roads that cross the aprons.
(() => {
  const Y = { apron: 0.38, taxiway: 0.41, stopway: 0.42, runway: 0.43, paint: 0.47 };
  const COL = {
    apron: '#bdb9b1', taxiway: '#7a7c7e', runway: '#505457', stopway: '#64676a', white: '#f4f4f0', yellow: '#e2b82c',
  };
  const LINE = 1.5; // m, painted lines (real ones are 0.9 m; this keeps them visible)

  async function start() {
    const D = window.__dio, K = window.__terrain?.K;
    if (!K) return;
    let f;
    try {
      const r = await fetch('airport-features.json');
      if (!r.ok) return;
      f = await r.json();
    } catch { return; }
    const { city } = D, Color = city.sun.color.constructor;
    const pos = [], col = [];
    const rgb = {};
    for (const [k, v] of Object.entries(COL)) { const c = new Color(v); rgb[k] = [c.r, c.g, c.b]; }
    const tri = (a, b, c, y, k) => {
      // wound to face up, so the double-sided material lights it from above (a face seen from behind is lit
      // with its normal flipped, which turns concrete brown)
      if ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) < 0) [b, c] = [c, b];
      for (const p of [a, b, c]) pos.push(p[0], y, p[1]), col.push(...rgb[k]);
    };
    const quad = (a, b, c, d, y, k) => { tri(a, b, c, y, k); tri(a, c, d, y, k); };
    const disc = (x, z, r, y, k, n = 10) => {
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        tri([x, z], [x + Math.cos(a0) * r, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, z + Math.sin(a1) * r], y, k);
      }
    };
    // A strip along a polyline, w wide, with round joints so bends don't notch.
    function strip(line, w, y, k, caps = true) {
      for (let i = 0; i + 3 < line.length; i += 2) {
        const ax = line[i], az = line[i + 1], bx = line[i + 2], bz = line[i + 3];
        const L = Math.hypot(bx - ax, bz - az) || 1, ox = (-(bz - az) / L) * w / 2, oz = ((bx - ax) / L) * w / 2;
        quad([ax + ox, az + oz], [bx + ox, bz + oz], [bx - ox, bz - oz], [ax - ox, az - oz], y, k);
      }
      if (caps) for (let i = 0; i < line.length; i += 2) disc(line[i], line[i + 1], w / 2, y, k);
    }

    // Aprons: polygons with holes.
    const V2 = K.Vector2;
    for (const poly of f.aprons || []) {
      const vec = (ring) => {
        const a = [];
        for (let i = 0; i + 1 < ring.length; i += 2) a.push(new V2(ring[i], ring[i + 1]));
        if (a.length > 1 && a[0].equals(a[a.length - 1])) a.pop();
        return a;
      };
      const outer = vec(poly[0]), holes = poly.slice(1).map(vec).filter((h) => h.length >= 3);
      if (outer.length < 3) continue;
      const all = outer.concat(...holes);
      for (const [a, b, c] of K.ShapeUtils.triangulateShape(outer, holes)) tri([all[a].x, all[a].y], [all[b].x, all[b].y], [all[c].x, all[c].y], Y.apron, 'apron');
    }
    // Taxiways, with a yellow centre line.
    for (const t of f.taxiways || []) {
      strip(t.line, t.width, Y.taxiway, 'taxiway');
      strip(t.line, LINE * 0.8, Y.paint, 'yellow');
    }
    // Runways (and their stopways), with markings in each runway's own frame: u along from one end, v across.
    for (const rw of f.runways || []) {
      const L = rw.line, w = rw.width;
      if (rw.stopway) { strip(L, w, Y.stopway, 'stopway', false); continue; }
      strip(L, w, Y.runway, 'runway', false);
      const ax = L[0], az = L[1], bx = L[L.length - 2], bz = L[L.length - 1];
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, vx = -uz, vz = ux;
      const P = (u, v) => [ax + ux * u + vx * v, az + uz * u + vz * v];
      const box = (u0, u1, v0, v1) => quad(P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1), Y.paint, 'white');
      for (const s of [-1, 1]) box(0, len, s * (w / 2 - 1.5) - LINE / 2, s * (w / 2 - 1.5) + LINE / 2); // edge lines
      for (const end of [0, 1]) {
        const at = (d) => (end ? len - d : d); // metres in from this end
        const span = (d0, d1, v0, v1) => box(Math.min(at(d0), at(d1)), Math.max(at(d0), at(d1)), v0, v1);
        // threshold bars: 12 on a 45 m runway, 16 on a 60 m one, in two groups either side of the centre line
        const n = w >= 60 ? 8 : 6, bw = 1.8, gap = 1.8;
        for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
          const v0 = s * (3 + i * (bw + gap)), v1 = s * (3 + i * (bw + gap) + bw);
          span(6, 36, Math.min(v0, v1), Math.max(v0, v1));
        }
        // aiming point blocks, 300 m in
        for (const s of [-1, 1]) span(300, 345, Math.min(s * 9, s * 18), Math.max(s * 9, s * 18));
        // touchdown zone bars: three pairs at 150 m, two at 450 m and 600 m, one at 750 m and 900 m
        for (const [d, bars] of [[150, 3], [450, 2], [600, 2], [750, 1], [900, 1]])
          for (const s of [-1, 1]) for (let i = 0; i < bars; i++) {
            const v0 = s * (6 + i * 3), v1 = s * (6 + i * 3 + 1.8);
            span(d, d + 22.5, Math.min(v0, v1), Math.max(v0, v1));
          }
      }
      for (let u = 60; u + 30 < len - 60; u += 50) box(u, u + 30, -LINE / 2, LINE / 2); // centre line dashes
    }

    const geo = new K.BufferGeometry();
    geo.setAttribute('position', new K.BufferAttribute(new Float32Array(pos), 3));
    const nor = new Float32Array(pos.length);
    for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
    geo.setAttribute('normal', new K.BufferAttribute(nor, 3));
    geo.setAttribute('color', new K.BufferAttribute(new Float32Array(col), 3));
    geo.computeBoundingSphere();
    const mesh = new K.Mesh(geo, new K.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: K.DoubleSide }));
    mesh.receiveShadow = true;
    mesh.name = 'airfield';
    city.scene.add(mesh);
    city.invalidate();
    D.requestRender?.();
    window.__airfield = { mesh, runways: f.runways.length, taxiways: f.taxiways.length, aprons: f.aprons.length };
  }

  const wait = setInterval(() => {
    if (window.__ready && window.__dio?.city) { clearInterval(wait); start(); }
  }, 200);
})();
