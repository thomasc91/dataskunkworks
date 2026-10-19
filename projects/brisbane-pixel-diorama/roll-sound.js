// Roll mode's sounds, made in the browser with WebAudio: no sound files. Added 20 Oct 2026.
//
// A blip for each thing the ball picks up, lower for bigger things (a rolling rumble was tried and taken out, 20 Oct); a
// thud for a bump and a clatter when a crash knocks things loose; a magpie's warble when one swoops; chimes for
// combos, bonuses and new things in the collection; and a fanfare at the end of a level. Browsers only allow sound
// after a click or key, so it starts on the first one. The Sound button or M mutes it (remembered on this device).
(() => {
  if (new URLSearchParams(location.search).get('mode') !== 'roll') return;
  let muted = false;
  try { muted = localStorage.getItem('roll-muted') === '1'; } catch { /* private window */ }
  let ctx = null, master = null;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.45;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  addEventListener('pointerdown', ensure, true);
  addEventListener('keydown', ensure, true);

  function tone(freq, dur, { type = 'triangle', vol = 0.3, to = null, at = 0, attack = 0.005 } = {}) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, { vol = 0.3, freq = 800, at = 0 } = {}) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + at, n = Math.ceil(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f).connect(g).connect(master);
    s.start(t);
  }
  const note = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI note to Hz
  let lastPick = 0;
  const SOUNDS = {
    pick({ size = 2, r = 2 } = {}) { // smaller things against the ball: higher and shorter
      if (!ctx || ctx.currentTime - lastPick < 0.035) return;
      lastPick = ctx.currentTime;
      const rel = Math.max(0.05, Math.min(1.5, size / (2.2 * r)));
      const f = 1500 - rel * 900 + Math.random() * 120;
      tone(f, 0.08 + rel * 0.08, { to: f * 1.5, vol: 0.18 });
    },
    bump({ speed = 5 } = {}) { tone(110, 0.18, { type: 'sine', to: 45, vol: Math.min(0.5, 0.08 + speed * 0.03) }); noise(0.08, { vol: 0.12, freq: 300 }); },
    drop({ n = 1 } = {}) { for (let i = 0; i < Math.min(5, n); i++) tone(700 - i * 90, 0.09, { at: i * 0.07, vol: 0.16, type: 'square', to: 500 - i * 60 }); noise(0.25, { vol: 0.2, freq: 500 }); },
    swooped() { // a magpie's warble, then the whoosh
      [74, 79, 76, 81, 78].forEach((n, i) => tone(note(n + 12), 0.11, { at: i * 0.09, vol: 0.12, type: 'sine', to: note(n + 13) }));
      noise(0.35, { vol: 0.18, freq: 1800, at: 0.1 });
    },
    combo(tier = 1) { [60, 64, 67, 72, 76].slice(0, 2 + tier).forEach((n, i) => tone(note(n + 12), 0.14, { at: i * 0.07, vol: 0.16 })); },
    bonus() { tone(note(84), 0.18, { vol: 0.16, type: 'sine' }); tone(note(91), 0.3, { at: 0.12, vol: 0.14, type: 'sine' }); },
    book() { [88, 91, 96].forEach((n, i) => tone(note(n), 0.1, { at: i * 0.05, vol: 0.1, type: 'sine' })); },
    goal() { [60, 64, 67, 72].forEach((n, i) => tone(note(n + 12), 0.2, { at: i * 0.1, vol: 0.18 })); },
    win() { [60, 64, 67, 72, 67, 72, 76].forEach((n, i) => tone(note(n + 12), i === 6 ? 0.6 : 0.16, { at: i * 0.12, vol: 0.2 })); },
    lose() { [67, 63, 60, 55].forEach((n, i) => tone(note(n), 0.3, { at: i * 0.18, vol: 0.18, type: 'sine' })); },
    roo() { tone(70, 0.12, { type: 'sine', to: 40, vol: 0.3 }); },
  };
  window.__rollSound = { play: (name, arg) => { ensure(); SOUNDS[name]?.(arg); }, get muted() { return muted; } };

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('roll-muted', m ? '1' : '0'); } catch { /* private window */ }
    if (master) master.gain.value = m ? 0 : 0.45;
    if (btn) btn.textContent = m ? 'Sound off' : 'Sound on';
  }
  let btn = null;
  addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.target.closest?.('input')) setMuted(!muted); }, true);

  const wait = setInterval(() => {
    const R = window.__roll, box = document.getElementById('rollGameBtns');
    if (!R || !box) return;
    clearInterval(wait);
    btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = muted ? 'Sound off' : 'Sound on';
    btn.onclick = () => { ensure(); setMuted(!muted); };
    box.append(btn);
    R.on('pick', (e) => { SOUNDS.pick({ size: e.size, r: R.r }); if (e.key === 'animal:roo') SOUNDS.roo(); });
    R.on('bump', (e) => SOUNDS.bump(e));
    R.on('drop', (e) => SOUNDS.drop(e));
    R.on('swooped', () => SOUNDS.swooped());
    R.on('goal', () => SOUNDS.goal());
  }, 200);
})();
