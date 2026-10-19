// Where the live layers (live-ferries.js, live-planes.js) get their data. On Thomas's PC that's the local relay,
// live/ferry_relay.py on port 4011, which the local apps hub runs. Anywhere else (GitHub Pages, a Claude
// artifact) it's the public relay, live/worker.js on Cloudflare. ?live=<url> points both at another relay, and
// ?ferries=off or ?planes=off keeps that layer simulated.
window.__liveRelay = new URLSearchParams(location.search).get('live') ||
  (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    ? 'http://localhost:4011'
    : 'https://brisbane-diorama-live.thomas-a-colin.workers.dev');

// The header's line about what's simulated, kept true as each live layer comes and goes.
(() => {
  const on = { ferries: false, planes: false };
  let base = null;
  window.__liveIntro = (layer, live) => {
    on[layer] = live;
    const p = document.querySelector('p.sub');
    if (!p) return;
    base ??= p.textContent;
    const clause = on.ferries && on.planes
      ? 'the ferries and planes are live, and the road traffic is simulated'
      : on.ferries
        ? 'the ferries are live GPS from TransLink, and the traffic and planes are simulated'
        : on.planes
          ? 'the planes are live, and the traffic and CityCats are simulated'
          : null;
    const own = window.DIORAMA_INTRO; // {sim, planes}: this page's own simulated and live-planes wording
    if (own) p.textContent = base.replace(own.sim, on.planes ? own.planes : own.sim);
    else p.textContent = clause ? base.replace('the traffic, CityCats and planes are simulated', clause) : base;
  };
})();
