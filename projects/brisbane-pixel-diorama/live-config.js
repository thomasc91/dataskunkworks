// Where the live layers (live-ferries.js, live-trains.js, live-buses.js, live-planes.js) get their data. On Thomas's PC that's the
// local relay, live/ferry_relay.py on port 4011, which the local apps hub runs. Anywhere else (GitHub Pages, a Claude
// artifact) it's the public relay, live/worker.js on Cloudflare. ?live=<url> points them all at another relay, and
// ?ferries=off, ?buses=off or ?planes=off keeps that layer simulated (?trains=off leaves the trains out).
// Roll mode's best times always go to the public relay, so everyone's are on one board.
window.__scoresUrl = 'https://brisbane-diorama-live.thomas-a-colin.workers.dev';

window.__liveRelay = new URLSearchParams(location.search).get('live') ||
  (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    ? 'http://localhost:4011'
    : 'https://brisbane-diorama-live.thomas-a-colin.workers.dev');

// The header's line about what's simulated, kept true as each live layer comes and goes.
(() => {
  const on = { ferries: false, trains: false, buses: false, ships: false, planes: false, traffic: false };
  let base = null;
  const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0]);
  window.__liveIntro = (layer, live) => {
    on[layer] = live;
    const p = document.querySelector('p.sub');
    if (!p) return;
    base ??= p.textContent;
    const own = window.DIORAMA_INTRO; // {sim, planes}: this page's own simulated and live-planes wording
    if (own) { p.textContent = base.replace(own.sim, on.planes ? own.planes : own.sim); return; }
    const live_ = ['ferries', 'trains', 'buses', 'ships', 'planes'].filter((k) => on[k]);
    const sim = [on.buses ? 'cars' : 'traffic', ...(on.ferries ? [] : ['CityCats']), ...(on.planes ? [] : ['planes'])];
    const clause = `the ${list(live_)} are live, and ${sim.length > 1 ? `the ${list(sim)} are` : sim[0] === 'cars' ? 'the cars are' : 'the road traffic is'} simulated${on.traffic ? ' at live traffic levels' : ''}`;
    p.textContent = live_.length ? base.replace('the traffic, CityCats and planes are simulated', clause) : base;
  };
})();
