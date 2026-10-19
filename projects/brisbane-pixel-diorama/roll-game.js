// Roll mode's game: levels, the collection book, combos, live bonuses and best times. Added 20 Oct 2026.
//
// roll.js is the engine (the ball, what it rolls up, the camera and minimap); this file is the game round it, and
// roll-sound.js the sounds. It loads before roll.js, so it can hand it the level (window.__rollLevel), then talks to
// it through window.__roll's events once the map is ready.
//
// - Levels: ?mode=roll opens a menu of levels; each is ?mode=roll&level=<id>, on its own map (the airport level runs
//   on airport.html). A level has a start, a goal (a size, a count of something, a place to reach, or the Skytower)
//   and usually a time limit. Finishing shows your time, your best on this device, and the best ten times anyone has
//   posted (the public relay keeps them: live/worker.js /scores), and you can post yours with three initials.
// - The collection book: every kind of thing you've ever rolled up, on this device (localStorage): the landmarks,
//   the animals, the transport and the street furniture.
// - Combos: five or more of the same kind of thing in quick succession ("Bin chicken combo") give a growth bonus.
// - Live bonuses: once the ball can take a bus, a real bus near it becomes the wanted bus, ringed on the minimap
//   (catch it for a bonus), and when it's raining in Brisbane the roads are slippery (roll.js reads the weather).
(() => {
  const Q = new URLSearchParams(location.search);
  if (Q.get('mode') !== 'roll') return;
  const PAGE = /airport\.html$/.test(location.pathname) ? 'airport' : 'westend';
  const SCORES = (window.__scoresUrl || 'https://brisbane-diorama-live.thomas-a-colin.workers.dev') + '/scores';
  const LEVELS = [
    { id: 'free', page: 'westend', title: 'Roll up Brisbane', blurb: 'Start small on Boundary Street and keep rolling until you take the Brisbane Skytower.', goal: { finish: true } },
    { id: 'southbank', page: 'westend', title: 'South Bank sprint', blurb: 'Start among the picnic tables at South Bank and grow to 20 m across in four minutes.',
      start: [-27.4783, 153.0233], snap: false, goal: { size: 20 }, limit: 240 },
    { id: 'roos', page: 'westend', title: 'Roo round-up', blurb: 'A mob is loose round Toowong Cemetery. Catch five kangaroos in three minutes; they bolt.',
      start: [-27.4742, 152.9823], snap: false, goal: { count: 'animal:roo', n: 5, what: 'Kangaroos' }, limit: 180, fauna: { roo: { n: 70, near: 700 } } },
    { id: 'cbd', page: 'westend', title: 'Rush hour', blurb: 'From the Queen Street Mall, grow to 100 m across in six minutes, towers and all.',
      start: [-27.4699, 153.0253], goal: { size: 100 }, limit: 360 },
    { id: 'river', page: 'westend', title: 'Over the river', blurb: 'Get from Musgrave Park to the City Botanic Gardens in four minutes. Find a bridge, or grow big enough to wade.',
      start: [-27.4797, 153.0147], r0: 3, goal: { reach: [-27.4755, 153.0298], radius: 80, place: 'the Botanic Gardens' }, limit: 240 },
    { id: 'airport', page: 'airport', title: 'Plane spotter', blurb: 'At Brisbane Airport, roll up a plane on the ground in six minutes (or grow to 60 m across if none are in).',
      start: [-27.3858, 153.1182], r0: 3, goal: { count: 'plane', n: 1, what: 'Planes', orSize: 60 }, limit: 360,
      props: 'airport-props.json', streets: 'airport-streets.json', crowds: [[-27.38546, 153.12093], [-27.4029, 153.11099]], finishOn: '' },
  ];
  const level = LEVELS.find((l) => l.id === Q.get('level'));
  if (level && level.page !== PAGE) { // the level lives on the other map
    const q = new URLSearchParams(location.search);
    location.replace((level.page === 'airport' ? 'airport.html' : './') + '?' + q.toString());
    return;
  }
  window.__rollLevel = level ? { ...level, quietFinish: true } : { menu: true };
  const go = (id) => {
    const l = LEVELS.find((x) => x.id === id), q = new URLSearchParams(location.search);
    q.set('mode', 'roll');
    if (id) q.set('level', id); else q.delete('level');
    location.href = (l?.page === 'airport' ? 'airport.html' : PAGE === 'airport' && id ? './' : location.pathname.split('/').pop() || './') + '?' + q.toString();
  };
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } } };

  // --- The collection book --------------------------------------------------------------------------------------------
  const BOOK = [
    ['Landmarks', [['Brisbane City Hall'], ['The Old Windmill'], ['Parliament House'], ['Treasury Building'], ['Customs House'], ['Brisbane Arcade'],
      ['Cathedral of Saint Stephen'], ['Queensland Museum'], ['Gallery of Modern Art'], ['Queensland Performing Arts Centre'], ['State Library of Queensland'],
      ['Old Museum'], ['Boggo Road Gaol'], ['Sir Thomas Brisbane Planetarium'], ['Brisbane Convention and Exhibition Centre'], ['Riparian Plaza'], ['Brisbane Square'],
      ['Brisbane Skytower'], ['Brisbane Domestic Terminal'], ['Brisbane International Terminal'], ['Brisbane Airport - Air Traffic Control Tower', 'The control tower'],
      ['Qantas Hangar 3']].map(([n, label]) => ['landmark:' + n, label || n])],
    ['Animals', [['animal:ibis', 'Ibis'], ['animal:toad', 'Cane toad'], ['animal:magpie', 'Magpie'], ['animal:roo', 'Kangaroo']]],
    ['Getting about', [['person', 'A person'], ['cyclist', 'Cyclist'], ['car', 'Car'], ['bus', 'Bus'], ['metro', 'Brisbane Metro'], ['train', 'Train'],
      ['ferry', 'CityCat'], ['plane', 'Plane'], ['wanted', 'A wanted bus']]],
    ['Street furniture', [['bench', 'Bench'], ['waste_basket', 'Bin'], ['picnic_table', 'Picnic table'], ['bbq', 'Barbecue'], ['drinking_water', 'Drinking fountain'],
      ['bicycle_parking', 'Bike rack'], ['post_box', 'Post box'], ['telephone', 'Phone booth'], ['vending_machine', 'Vending machine'], ['street_lamp', 'Street lamp'],
      ['bus_stop', 'Bus stop sign'], ['street_cabinet', 'Street cabinet'], ['recycling', 'Recycling bin'], ['shelter', 'Shelter'], ['fire_hydrant', 'Hydrant marker']]
      .map(([k, n]) => ['prop:' + k, n])],
    ['Everything else', [['tree', 'Tree'], ['building', 'A building']]],
  ];
  const KNOWN = new Set(BOOK.flatMap(([, items]) => items.map(([k]) => k)));
  let book = store.get('roll-book', {});
  const css = document.createElement('style');
  css.textContent = `
    .rollPanel { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 16px;
      background: color-mix(in srgb, var(--stage, #efe6d6) 55%, transparent); }
    .rollPanel[hidden] { display: none; }
    .rollPanel .sheet { background: var(--panel); color: var(--ink); border-radius: 16px; box-shadow: 0 3px 0 var(--shadow, rgba(0,0,0,.15));
      width: min(760px, 100%); max-height: calc(100vh - 32px); overflow: auto; padding: 20px 22px; font: 500 14px/1.45 'Hanken Grotesk', system-ui, sans-serif; }
    .rollPanel h2 { margin: 0 0 4px; font: 800 26px/1.15 'Hanken Grotesk', system-ui, sans-serif; }
    .rollPanel h3 { margin: 16px 0 6px; font: 700 12px 'JetBrains Mono', monospace; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
    .rollPanel .lede { color: var(--muted); margin: 0 0 12px; }
    .rollLevels { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
    .rollLevels button { text-align: left; border: 0; border-radius: 12px; padding: 12px 13px; background: color-mix(in srgb, var(--ink) 6%, var(--panel));
      color: var(--ink); font: inherit; cursor: pointer; }
    .rollLevels button:hover { background: color-mix(in srgb, var(--ink) 12%, var(--panel)); }
    .rollLevels b { display: block; font-size: 16px; margin-bottom: 3px; }
    .rollLevels small { display: block; color: var(--muted); }
    .rollLevels .best { margin-top: 6px; font: 700 12px 'JetBrains Mono', monospace; color: var(--ink); }
    .rollRow { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
    .rollRow button, .rollRow input { height: 38px; border-radius: 9px; border: 0; padding: 0 14px; font: 700 14px 'Hanken Grotesk', system-ui, sans-serif; }
    .rollRow button { background: color-mix(in srgb, var(--ink) 8%, var(--panel)); color: var(--ink); cursor: pointer; }
    .rollRow button.primary { background: var(--accent, #e8478b); color: var(--on-accent, #fff); }
    .rollRow input { width: 90px; text-transform: uppercase; letter-spacing: .2em; text-align: center; background: color-mix(in srgb, var(--ink) 6%, var(--panel)); color: var(--ink); }
    .rollBoard { width: 100%; border-collapse: collapse; font: 600 13px 'JetBrains Mono', monospace; }
    .rollBoard td { padding: 3px 6px; border-bottom: 1px solid color-mix(in srgb, var(--ink) 8%, transparent); }
    .rollBoard tr.you td { color: var(--accent, #e8478b); }
    .rollBook { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 4px 12px; }
    .rollBook div { color: var(--muted); }
    .rollBook div.got { color: var(--ink); font-weight: 700; }
    .rollBook div.got::before { content: '✓ '; color: var(--accent, #e8478b); }
    .rollBook div:not(.got)::before { content: '· '; }
    #rollGameBtns { position: fixed; top: 14px; right: 150px; z-index: 40; display: flex; gap: 6px; }
    #rollGameBtns button { height: 36px; padding: 0 11px; border: 0; border-radius: 9px; background: var(--panel); color: var(--ink);
      font: 600 13px 'Hanken Grotesk', system-ui, sans-serif; cursor: pointer; box-shadow: 0 2px 0 var(--shadow, rgba(0,0,0,.15)); }
    @media (max-width: 560px) { #rollGameBtns { top: auto; right: auto; left: 10px; bottom: 112px; flex-direction: column; } }
  `;
  document.head.append(css);
  const panel = (id) => { const e = document.createElement('div'); e.className = 'rollPanel'; e.id = id; e.hidden = true; e.innerHTML = '<div class="sheet"></div>'; document.body.append(e); return e; };
  const menu = panel('rollMenu'), result = panel('rollResult'), bookPanel = panel('rollBookPanel');
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const best = store.get('roll-best', {});

  function showBook(back) {
    const got = Object.keys(book).filter((k) => KNOWN.has(k)).length;
    bookPanel.querySelector('.sheet').innerHTML = `<h2>Your collection</h2><p class="lede">${got} of ${KNOWN.size} kinds of thing rolled up, on this device.</p>` +
      BOOK.map(([title, items]) => `<h3>${title}</h3><div class="rollBook">${items.map(([k, n]) => `<div class="${book[k] ? 'got' : ''}">${esc(n)}${book[k]?.n > 1 ? ` <small>×${book[k].n.toLocaleString()}</small>` : ''}</div>`).join('')}</div>`).join('') +
      `<div class="rollRow"><button type="button" class="primary" data-act="close">${back ? 'Back' : 'Keep rolling'}</button></div>`;
    bookPanel.hidden = false;
    if (window.__roll && !back) window.__roll.paused = true;
    bookPanel.querySelector('[data-act=close]').onclick = () => { bookPanel.hidden = true; if (back) back(); else if (window.__roll && !finished) window.__roll.paused = false; };
  }

  async function board(id) {
    try { const r = await fetch(`${SCORES}?level=${id}`, { cache: 'no-store' }); return r.ok ? (await r.json()).scores || [] : []; } catch { return []; }
  }

  // --- The menu -----------------------------------------------------------------------------------------------------
  function showMenu() {
    menu.querySelector('.sheet').innerHTML = `<h2>Roll up Brisbane</h2><p class="lede">Push a sticky ball round the map. Anything smaller than it sticks to it; anything bigger bounces it back. Pick a level.</p>
      <div class="rollLevels">${LEVELS.map((l) => `<button type="button" data-id="${l.id}"><b>${esc(l.title)}</b><small>${esc(l.blurb)}</small>
        <div class="best" data-best="${l.id}">${best[l.id] ? `Your best ${mmss(best[l.id])}` : ''}</div></button>`).join('')}</div>
      <div class="rollRow"><button type="button" data-act="book">Your collection</button><button type="button" data-act="map">Back to the map</button></div>`;
    menu.hidden = false;
    for (const b of menu.querySelectorAll('[data-id]')) b.onclick = () => go(b.dataset.id);
    menu.querySelector('[data-act=book]').onclick = () => { menu.hidden = true; showBook(() => { menu.hidden = false; }); };
    menu.querySelector('[data-act=map]').onclick = () => { const q = new URLSearchParams(location.search); q.delete('mode'); q.delete('level'); location.search = q.toString(); };
    for (const l of LEVELS) board(l.id).then((s) => {
      const el = menu.querySelector(`[data-best="${l.id}"]`);
      if (el && s[0]) el.textContent = `${best[l.id] ? `Your best ${mmss(best[l.id])} · ` : ''}World best ${s[0].n} ${mmss(s[0].t)}`;
    });
  }

  // --- Playing a level --------------------------------------------------------------------------------------------------
  let R = null, finished = false, counts = {}, startClock = 0, endless = false;
  const say = (t, big) => R?.say(t, big, true);
  const sound = (name, arg) => window.__rollSound?.play(name, arg);
  window.__rollGame = {
    goalText: () => {
      if (!level || !R) return null;
      const g = level.goal;
      if (endless || finished) return finished ? 'Level done: keep rolling' : null;
      if (g.finish) return 'Roll up the Skytower';
      if (g.size) return `Goal: ${g.size} m across`;
      if (g.count) return `${g.what}: ${counts[g.count] || 0} of ${g.n}${g.orSize && !planesAround() ? ` (none in: grow to ${g.orSize} m)` : ''}`;
      if (g.reach) { const [x, z] = R.toXZ(...g.reach), [px, , pz] = R.pos, d = Math.hypot(x - px, z - pz); return `Get to ${g.place}: ${d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}`; }
      return null;
    },
    clockText: () => (R && level?.limit && !finished && !endless ? `${mmss(Math.max(0, level.limit - (R.clock - startClock)))} left` : null),
  };
  const planesAround = () => (window.__livePlanes?.drawn || []).some((d) => d.onGround && !window.__livePlanes.gone?.has(d.hex));

  function done(ok, why) {
    if (finished) return;
    finished = true;
    R.paused = true;
    const t = Math.round((R.clock - startClock) * 10) / 10, size = Math.round(2 * R.r);
    if (ok && (!best[level.id] || t < best[level.id])) { best[level.id] = t; store.set('roll-best', best); }
    sound(ok ? 'win' : 'lose');
    const s = result.querySelector('.sheet');
    s.innerHTML = `<h2>${ok ? `${esc(level.title)}: done in ${mmss(t)}` : esc(why || 'Out of time')}</h2>
      <p class="lede">${size} m across, ${R.things.toLocaleString()} things rolled up.${best[level.id] ? ` Your best: ${mmss(best[level.id])}.` : ''}</p>
      <h3>Best times</h3><table class="rollBoard"><tbody><tr><td>Loading…</td></tr></tbody></table>
      ${ok ? `<div class="rollRow"><input maxlength="3" placeholder="ABC" aria-label="Your initials" autocomplete="off"><button type="button" class="primary" data-act="post">Post my time</button></div>` : ''}
      <div class="rollRow"><button type="button" class="primary" data-act="again">Play again</button><button type="button" data-act="keep">Keep rolling</button>
        <button type="button" data-act="levels">Levels</button><button type="button" data-act="book">Your collection</button></div>`;
    result.hidden = false;
    const fill = (rows, mine) => {
      s.querySelector('tbody').innerHTML = rows.length
        ? rows.map((r, i) => `<tr class="${mine && r.n === mine.n && r.t === mine.t ? 'you' : ''}"><td>${i + 1}</td><td>${esc(r.n)}</td><td>${mmss(r.t)}</td><td>${r.s} m</td><td>${esc(r.d)}</td></tr>`).join('')
        : '<tr><td>No times yet: be the first.</td></tr>';
    };
    board(level.id).then((rows) => fill(rows));
    const input = s.querySelector('input');
    if (input) {
      input.value = store.get('roll-initials', '');
      input.addEventListener('keydown', (e) => e.stopPropagation(), true);
      s.querySelector('[data-act=post]').onclick = async (e) => {
        const n = input.value.toUpperCase().replace(/[^A-Z]/g, '');
        if (n.length !== 3) { input.focus(); return; }
        store.set('roll-initials', n);
        e.target.disabled = true; e.target.textContent = 'Posting…';
        try {
          const r = await fetch(`${SCORES}?level=${level.id}`, { method: 'POST', body: JSON.stringify({ name: n, time: t, size }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          fill(j.scores, { n, t: Math.round(t * 10) / 10 });
          e.target.textContent = 'Posted';
        } catch (err) { e.target.textContent = String(err.message || 'Could not post').slice(0, 40); e.target.disabled = false; }
      };
    }
    s.querySelector('[data-act=again]').onclick = () => location.reload();
    s.querySelector('[data-act=levels]').onclick = () => go(null);
    s.querySelector('[data-act=keep]').onclick = () => { result.hidden = true; endless = true; R.paused = false; };
    s.querySelector('[data-act=book]').onclick = () => { result.hidden = true; showBook(() => { result.hidden = false; }); };
  }

  // --- Combos, the wanted bus, the book, and the goals: all from the engine's events ------------------------------------
  const COMBOS = { 'animal:ibis': 'Bin chicken combo', person: 'Crowd surfer', car: 'Traffic jam', tree: 'Clear-felled', 'animal:toad': 'Toad sweep',
    building: 'Demolition crew', prop: 'Street sweeper', 'animal:roo': 'Mob rule', 'animal:magpie': 'Magpie muster', bus: 'Bus jam', landmark: 'Sightseer' };
  let streak = { fam: null, n: 0, at: -9 }, wanted = null, wantedAt = -60, rainSaid = false;
  function onPick(e) {
    const now = R.clock;
    if (e.key) {
      // the book
      const key = e.key.startsWith('landmark:') && !KNOWN.has(e.key) ? 'building' : e.key;
      const was = book[key];
      book[key] = { n: (was?.n || 0) + 1, first: was?.first || new Date().toISOString().slice(0, 10) };
      if (!was && KNOWN.has(key)) { say(`New in your collection: ${BOOK.flatMap(([, i]) => i).find(([k]) => k === key)[1]}`); sound('book'); }
      if (now - (onPick.saved || 0) > 3) { store.set('roll-book', book); onPick.saved = now; }
      // combos: five of a kind (any street furniture counts together) within six seconds of each other
      const fam = e.key.startsWith('prop:') ? 'prop' : e.key.startsWith('landmark:') ? 'landmark' : e.key;
      if (streak.fam === fam && now - streak.at < 6) streak.n++; else streak = { fam, n: 1, at: now };
      streak.at = now;
      if (COMBOS[fam] && (streak.n === 5 || streak.n === 10 || streak.n === 20 || (streak.n > 20 && streak.n % 20 === 0))) {
        const tier = streak.n >= 20 ? 3 : streak.n >= 10 ? 2 : 1;
        R.bonus(R.volume * 0.04 * tier);
        say(`${COMBOS[fam]} ×${streak.n}! Bonus growth`);
        sound('combo', tier);
      }
      // goals
      counts[e.key] = (counts[e.key] || 0) + 1;
      // the wanted bus
      if (wanted && e.bus === wanted.b) {
        R.bonus(R.volume * 0.08);
        say(`Caught the wanted ${wanted.b.metro ? 'Metro' : 'bus'}: the ${wanted.b.ref}! Bonus growth`);
        sound('bonus');
        book.wanted = { n: (book.wanted?.n || 0) + 1, first: book.wanted?.first || new Date().toISOString().slice(0, 10) };
        wanted = null; R.markers.length = 0; wantedAt = now;
      }
    }
  }
  function onFrame(e) {
    const t = R.clock - startClock;
    // the level's goal and clock
    if (level && !finished && !endless) {
      const g = level.goal;
      if (g.size && 2 * e.r >= g.size) done(true);
      if (g.count && (counts[g.count] || 0) >= g.n) done(true);
      if (g.count && g.orSize && !planesAround() && 2 * e.r >= g.orSize) done(true);
      if (g.reach) { const [x, z] = R.toXZ(...g.reach); if (Math.hypot(x - e.x, z - e.z) < g.radius) done(true); }
      if (level.limit && t >= level.limit) done(false, 'Out of time');
    }
    // the reach target's ring on the minimap
    if (level?.goal.reach && !R.markers.length && !finished) { const [x, z] = R.toXZ(...level.goal.reach); R.markers.push({ x, z, colour: '#2f8fe0' }); }
    // planes on the ground, ringed, at the airport
    if (level?.goal.count === 'plane' && !finished && Math.floor(t * 2) !== onFrame.tick) {
      onFrame.tick = Math.floor(t * 2);
      R.markers.length = 0;
      const [px, , pz] = R.pos;
      (window.__livePlanes?.drawn || []).filter((d) => d.onGround && !window.__livePlanes.gone?.has(d.hex))
        .sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz)).slice(0, 3)
        .forEach((d) => R.markers.push({ x: d.x, z: d.z, colour: '#f3b61f' }));
    }
    // the wanted bus: once the ball can take a bus, now and then pick a real one nearby
    if (!level?.goal.reach && level?.goal.count !== 'plane') {
      if (wanted) {
        const d = (window.__liveBuses?.drawn || []).find((q) => q.b === wanted.b);
        if (d) { R.markers.length = 0; R.markers.push({ x: d.x, z: d.z, colour: '#f3b61f' }); }
        if (!d || R.clock - wanted.at > 120) { wanted = null; R.markers.length = 0; wantedAt = R.clock; }
      } else if (2.2 * e.r >= 15.6 && R.clock - wantedAt > 45) {
        const near = (window.__liveBuses?.drawn || []).filter((q) => !q.b.metro && !window.__liveBuses.gone.has(q.b) && Math.hypot(q.x - e.x, q.z - e.z) < 900);
        if (near.length) {
          const q = near[(Math.random() * near.length) | 0];
          wanted = { b: q.b, at: R.clock };
          say(`Wanted: the ${q.b.ref} bus. It's ringed on your map`);
          sound('bonus');
        } else wantedAt = R.clock - 30;
      }
    }
    // rain
    if (!rainSaid && t > 4) { rainSaid = true; if ((window.__liveSky?.weather?.precip ?? 0) > 0.1) say("It's raining in Brisbane: the roads are slippery"); }
  }

  // --- Buttons in the game -----------------------------------------------------------------------------------------------
  const btns = document.createElement('div');
  btns.id = 'rollGameBtns';
  btns.innerHTML = '<button type="button" data-act="levels">Levels</button><button type="button" data-act="book">Collection</button>';
  document.body.append(btns);
  btns.querySelector('[data-act=levels]').onclick = () => go(null);
  btns.querySelector('[data-act=book]').onclick = () => showBook();
  addEventListener('keydown', (e) => { if (e.code === 'KeyB' && !e.target.closest?.('input')) { bookPanel.hidden ? showBook() : bookPanel.querySelector('[data-act=close]')?.click(); } }, true);

  const wait = setInterval(() => {
    if (!window.__roll) return;
    clearInterval(wait);
    R = window.__roll;
    R.on('pick', onPick);
    R.on('frame', onFrame);
    R.on('finish', () => { if (level?.goal.finish) done(true); });
    addEventListener('pagehide', () => store.set('roll-book', book));
    startClock = R.clock;
    if (!level) { R.paused = true; showMenu(); }
    else say(level.blurb);
  }, 200);
})();
