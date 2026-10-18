// main.js — scroll drives the story. Everything on the stage is a function of (step, t),
// plus a clock for idle motion (wingbeats, orbits, line boil).

import { STEPS, OVERVIEW, CHRONICLE, CHRONICLE_NOTES, PEOPLE, DRAGONS, LOC } from './data.js';
import { buildWorld, stateAt, DR } from './world.js';
import { createRenderer } from './render.js';
import { smooth, clamp } from './ink.js';

const N = STEPS.length;
const $ = s => document.querySelector(s);
const canvas = $('#stage'), ctx = canvas.getContext('2d'), wrap = $('#stage-wrap');
const W = buildWorld();
const R = createRenderer();
const reducedPref = matchMedia('(prefers-reduced-motion: reduce)').matches;
const opts = { notes: false, routes: true, reading: false, motion: !reducedPref };

/* ----------------------------- the cards ----------------------------- */
const finalState = W.snaps[N];
const CAST = Object.keys(PEOPLE).length;
const DEAD = finalState.marks.filter(m => m.kind === 'person').length;
const wikiUrl = a => 'https://awoiaf.westeros.org/index.php/Dance_of_the_Dragons#' + a;
const stepsEl = $('#steps');
STEPS.forEach((s, i) => {
  const sec = document.createElement('section');
  sec.className = 'step'; sec.id = 'step-' + i; sec.dataset.step = i; sec.style.height = s.vh + 'vh';
  const deaths = s.ev.filter(e => (e.k === 'ddeath') || (e.k === 'death' && !e.quiet));
  const cost = deaths.map(e => e.k === 'ddeath' ? `† ${DR[e.d].name} (dragon)` : `† ${PEOPLE[e.who].name}`).join(' · ');
  const kick = i === 0 ? 'Opening frame' : i === N - 1 ? 'Closing frame' : `Step ${i} of ${N - 2}`;
  const body = s.card.replace('{DEAD}', DEAD).replace('{CAST}', CAST);
  sec.innerHTML = `<article class="card" aria-labelledby="h-${i}">
    <div class="kick"><span>${kick}</span><span>${s.kicker}</span></div>
    <h2 id="h-${i}">${s.title}</h2>
    <p class="body">${body}</p>
    <p class="beat" data-beat></p>
    ${cost ? `<p class="cost">${cost}</p>` : ''}
    <p class="reading">${s.reading || ''}</p>
    <p class="src">On AWOIAF: ${s.wiki.map(a => `<a href="${wikiUrl(a)}" target="_blank" rel="noopener">${a.replace(/_/g, ' ').replace('.27', '’')}</a>`).join(', ')}</p>
  </article>`;
  stepsEl.appendChild(sec);
});
const sectionEls = [...document.querySelectorAll('.step')];

/* ----------------------------- the scrubber ----------------------------- */
const scrub = $('#scrubber'), fill = $('#scrub-fill'), noteEl = $('#note');
const tickBtns = [];
let lastYear = null;
CHRONICLE.forEach(([idx, name, year, si, t]) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'minor'; b.style.left = ((si + t) / N * 100) + '%';
  b.title = `${name} (${year} AC)`; b.setAttribute('aria-label', `Chronicle: ${name}, ${year} AC`);
  b.addEventListener('click', () => { goTo(si + t, true); showNote(name, CHRONICLE_NOTES[idx]); });
  scrub.appendChild(b);
  if (year !== lastYear) { const y = document.createElement('span'); y.className = 'yr'; y.textContent = year + ' AC'; y.style.left = ((si + t) / N * 100) + '%'; scrub.appendChild(y); lastYear = year; }
});
STEPS.forEach((s, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.style.left = ((i + 0.08) / N * 100) + '%';
  b.title = s.title; b.setAttribute('aria-label', `Go to ${s.title}`);
  b.addEventListener('click', () => goTo(i + 0.06, false));
  scrub.appendChild(b); tickBtns.push(b);
});
let noteTimer = 0;
function showNote(name, text) {
  clearTimeout(noteTimer);
  noteEl.hidden = false; noteEl.textContent = text ? `${name}. ${text}` : name;
  noteTimer = setTimeout(() => { noteEl.hidden = true; }, 7000);
}

/* ----------------------------- scroll → (step, t) ----------------------------- */
let sections = [], mobile = false;
function measure() {
  mobile = innerWidth <= 820;
  sections = sectionEls.map(el => { const r = el.getBoundingClientRect(); return { top: r.top + scrollY, h: r.height }; });
}
const readLine = () => innerHeight * (mobile ? 0.62 : 0.5);
function scrollG() {
  const line = scrollY + readLine();
  if (!sections.length || line < sections[0].top) return 0;
  for (let i = 0; i < sections.length; i++) { const s = sections[i]; if (line < s.top + s.h) return i + (line - s.top) / s.h; }
  return N - 1e-4;
}
function goTo(G, far) {
  measure();
  const i = clamp(Math.floor(G), 0, N - 1), f = G - i, s = sections[i];
  const y = s.top + f * s.h - readLine() + 2;
  const jump = far || !opts.motion || Math.abs(G - Gs) > 1.5;
  scrollTo({ top: y, behavior: jump ? 'instant' : 'smooth' });
}

/* ----------------------------- the camera ----------------------------- */
function fitBox(b, safe) { return [b[0], b[1], Math.max(b[2], b[3] * safe.w / safe.h)]; }
function interpZoom(p0, p1, rho = 1.2) { // van Wijk and Nuij, as in d3.interpolateZoom (w = view width)
  const [ux0, uy0, w0] = p0, [ux1, uy1, w1] = p1, dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy, r2 = rho * rho, r4 = r2 * r2;
  if (d2 < 1e-9) { const S = Math.log(w1 / w0) / rho; return t => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)]; }
  const d1 = Math.sqrt(d2), b0 = (w1 * w1 - w0 * w0 + r4 * d2) / (2 * w0 * r2 * d1), b1 = (w1 * w1 - w0 * w0 - r4 * d2) / (2 * w1 * r2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1), S = (r1 - r0) / rho;
  return t => { const s = t * S, c0 = Math.cosh(r0), u = w0 / (r2 * d1) * (c0 * Math.tanh(rho * s + r0) - Math.sinh(r0)); return [ux0 + u * dx, uy0 + u * dy, w0 * c0 / Math.cosh(rho * s + r0)]; };
}
const ENTRY = 0.1;
function camAt(si, t, safe) {
  const keys = STEPS[si].cam.map(k => ({ t: k.t, c: fitBox(k.box, safe) }));
  if (!opts.motion) return keys[keys.length - 1].c;
  if (si > 0 && t < ENTRY) { const pk = STEPS[si - 1].cam, p = fitBox(pk[pk.length - 1].box, safe); return interpZoom(p, keys[0].c)(smooth(0, ENTRY, t)); }
  if (t <= keys[0].t) return keys[0].c;
  for (let j = 0; j < keys.length - 1; j++) if (t < keys[j + 1].t) return interpZoom(keys[j].c, keys[j + 1].c)(smooth(keys[j].t, keys[j + 1].t, t));
  return keys[keys.length - 1].c;
}

/* ----------------------------- the loop ----------------------------- */
let cw = 0, ch = 0, dpr = 1, safe = null;
function resize() {
  const r = wrap.getBoundingClientRect();
  cw = Math.round(r.width); ch = Math.round(r.height);
  dpr = Math.min(1.5, devicePixelRatio || 1);
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  measure();
  safe = mobile ? { x: 8, y: 8, w: cw - 16, h: ch * 0.56 - 44 } : { x: Math.min(cw * 0.4, 420), y: 12, w: cw - Math.min(cw * 0.4, 420) - 16, h: ch - 60 };
  renderDiptych(true);
}
let Gs = 0, lastNow = performance.now(), clock = 0, hover = null, lastStep = -1, lastBeat = '', counts = [20];
function countsAt(si, t) { return W.countLog.filter(([s, tt]) => s < si || (s === si && tt <= t)).map(c => c[2]); }
function frame(now) { update(now); requestAnimationFrame(frame); }
function update(now) {
  const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
  if (opts.motion) clock += dt;
  const Gt = scrollG();
  if (Math.abs(Gt - Gs) > 1.5 || !opts.motion) Gs = Gt; else Gs += (Gt - Gs) * (1 - Math.exp(-dt * 11));
  const si = clamp(Math.floor(Gs), 0, N - 1), t = opts.motion ? clamp(Gs - si, 0, 1) : 1;
  const state = stateAt(W, si, t);
  const cam = camAt(si, t, safe);
  counts = countsAt(si, t);
  const hits = R.render(ctx, cw, ch, dpr, { state, si, t, cam, safe, clock, boil: Math.floor(clock * 8) % 3, routes: opts.routes, notes: opts.notes, reduced: !opts.motion, hoverId: hover && hover.id, counts, step: STEPS[si], desk: getComputedStyle(document.documentElement).getPropertyValue('--stage-desk').trim() || '#e9e4d8' });
  window.__hits = hits;
  // the active card's beat caption
  const caps = STEPS[si].caps || [];
  let beat = ''; for (const [ct, txt] of caps) if (t >= ct) beat = txt;
  if (si !== lastStep || beat !== lastBeat) {
    const el = sectionEls[si].querySelector('[data-beat]');
    if (el) el.textContent = beat;
    if (si !== lastStep) { tickBtns.forEach((b, i) => b.classList.toggle('on', i === si)); $('#live').textContent = `${STEPS[si].title}. ${STEPS[si].kicker}.`; if (lastStep >= 0) history.replaceState(null, '', '#s' + si); }
    lastStep = si; lastBeat = beat;
  }
  fill.style.width = (Gs / N * 100) + '%';
}

/* ----------------------------- hover ----------------------------- */
const tip = $('#tip');
const SIDE = { green: 'the greens', black: 'the blacks', royal: 'the crown', none: 'no side' };
canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = null, bd = Infinity;
  for (const h of window.__hits || []) { const d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d < bd) { bd = d; best = h; } }
  hover = best;
  if (!best) { tip.hidden = true; return; }
  const si = clamp(Math.floor(Gs), 0, N - 1), st = stateAt(W, si, clamp(Gs - si, 0, 1));
  let head = '', lines = [];
  if (best.type === 'dragon' || best.type === 'scar') {
    const d = DR[best.id], D = st.dragons[best.id], rider = D.rider ? PEOPLE[D.rider].name : null;
    head = d.name;
    lines.push(best.type === 'scar' ? 'Died here.' : rider ? `Ridden by ${rider} (${SIDE[st.people[D.rider].side]})` : d.wild ? 'Wild, never ridden' : 'No rider');
    lines.push(`Length ${Math.round(d.size * 100)}% of Vhagar's`, d.note);
  } else if (best.type === 'person' || best.type === 'mark') {
    const p = PEOPLE[best.id], P = st.people[best.id];
    head = p.name;
    lines.push(best.type === 'mark' ? `Died here, in "${STEPS[best.m.si].title}"` : `For ${SIDE[P.side]}${P.captive ? ', a captive' : ''}`);
  } else if (best.type === 'place') { head = LOC[best.id].name; const c = st.control[best.id]; if (c) lines.push(`Held by ${SIDE[c]}`); }
  tip.innerHTML = `<b>${head}</b>` + lines.filter(Boolean).map(l => `<span>${l}</span>`).join('');
  tip.hidden = false;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = Math.min(cw - tw - 8, x + 14) + 'px'; tip.style.top = Math.min(ch - th - 8, y + 14) + 'px';
});
canvas.addEventListener('pointerleave', () => { hover = null; tip.hidden = true; });

/* ----------------------------- keys and toggles ----------------------------- */
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, textarea, summary')) return;
  const si = clamp(Math.floor(Gs), 0, N - 1);
  if (['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey)) { e.preventDefault(); goTo(Math.min(N - 1 + 0.98, si + 1 + 0.04)); }
  else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); goTo(Gs - si > 0.15 ? si + 0.04 : Math.max(0, si - 1 + 0.04)); }
  else if (e.key === 'Home') { e.preventDefault(); goTo(0.02, true); }
  else if (e.key === 'End') { e.preventDefault(); goTo(N - 1 + 0.9, true); }
  else if (e.key === 'm' || e.key === 'M') toggle('notes');
});
function toggle(k) {
  opts[k] = !opts[k];
  $('#tg-' + k).setAttribute('aria-pressed', String(opts[k]));
  if (k === 'reading') document.body.classList.toggle('reading', opts.reading);
}
['notes', 'routes', 'reading', 'motion'].forEach(k => $('#tg-' + k).addEventListener('click', () => toggle(k)));
$('#tg-motion').setAttribute('aria-pressed', String(opts.motion));

/* ----------------------------- the diptych ----------------------------- */
let dipDone = false;
function renderDiptych(force) {
  const box = $('#diptych').getBoundingClientRect();
  if (!force && (dipDone || box.top > innerHeight * 2)) return;
  for (const [id, si] of [['#dip-a', 0], ['#dip-b', N - 1]]) {
    const c = $(id), r = c.getBoundingClientRect();
    if (r.width < 10) continue;
    const d = Math.min(1.5, devicePixelRatio || 1);
    c.width = Math.round(r.width * d); c.height = Math.round(r.height * d);
    const sf = { x: 6, y: 6, w: r.width - 12, h: r.height - 12 };
    const st = stateAt(W, si, 1), g = c.getContext('2d');
    R.render(g, r.width, r.height, d, { state: st, si, t: 1, cam: fitBox(OVERVIEW, sf), safe: sf, clock: 21.7, boil: 0, routes: si > 0, notes: false, reduced: true, counts: countsAt(si, 1), step: STEPS[si], minPx: 10, desk: getComputedStyle(document.documentElement).getPropertyValue('--stage-desk').trim() || '#e9e4d8', dip: true });
  }
  dipDone = true;
}
addEventListener('scroll', () => renderDiptych(false), { passive: true });

/* ----------------------------- the roll ----------------------------- */
(() => {
  const fates = {};
  for (const m of finalState.marks) if (m.kind === 'dragon') fates[m.d] = STEPS[m.si].title;
  const rd = $('#roll-dragons');
  rd.innerHTML = '<tr><th>Dragon</th><th>Length (Vhagar = 100)</th><th>Rider at the start</th><th>Fate</th><th>Colour (source)</th></tr>' +
    DRAGONS.slice().sort((a, b) => b.size - a.size).map(d => `<tr><td>${d.name}</td><td>${Math.round(d.size * 100)}</td><td>${d.rider ? PEOPLE[d.rider].name : d.wild ? 'wild' : 'none'}</td><td>${fates[d.id] ? '† ' + fates[d.id] : d.unhatched ? 'hatched in the Vale, 130–131' : 'survived'}</td><td>${d.note}</td></tr>`).join('');
  const pf = {};
  for (const m of finalState.marks) if (m.kind === 'person') pf[m.who] = STEPS[m.si].title;
  const rp = $('#roll-people');
  rp.innerHTML = '<tr><th>Person</th><th>Side at the start</th><th>Fate</th></tr>' +
    Object.entries(PEOPLE).map(([id, p]) => `<tr><td>${p.name}</td><td>${SIDE[p.side]}</td><td>${pf[id] ? '† ' + pf[id] : id === 'viserys_i' ? 'died before the war' : 'survived'}</td></tr>`).join('');
})();

/* ----------------------------- debug hook (timing, stills) ----------------------------- */
window.__dance = {
  time(G, n = 10) { // render synchronously at global position G, n times; returns ms per frame
    const si = clamp(Math.floor(G), 0, N - 1), t = clamp(G - si, 0, 1), t0 = performance.now();
    for (let i = 0; i < n; i++) { const st = stateAt(W, si, t); R.render(ctx, cw, ch, dpr, { state: st, si, t, cam: camAt(si, t, safe), safe, clock: clock + i / 60, boil: i % 3, routes: opts.routes, notes: opts.notes, reduced: false, counts: countsAt(si, t), step: STEPS[si] }); }
    return (performance.now() - t0) / n;
  },
  still(G) { this.time(G, 1); return canvas.toDataURL('image/jpeg', 0.8).length; },
  tick(n = 1) { for (let i = 0; i < n; i++) update(performance.now() + i * 16); return { G: Gs, step: lastStep }; }, // one frame without rAF (hidden tabs)
};

/* ----------------------------- start ----------------------------- */
addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 120); });
resize();
setTimeout(() => { // a timeout, not rAF, so a page opened in a background tab still starts
  R.warm();
  $('#loading')?.remove();
  const m = location.hash.match(/^#s(\d+(?:\.\d+)?)$/);
  if (m) { const G = parseFloat(m[1]); setTimeout(() => { goTo(Math.min(N - 0.01, G + (G % 1 ? 0 : 0.06)), true); Gs = G; }, 50); }
  update(performance.now());
  requestAnimationFrame(frame);
}, 30);
