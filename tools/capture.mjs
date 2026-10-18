// Make the card thumbnails: open each piece in headless Edge over the DevTools protocol, wait in real time,
// and save a 1280x800 JPEG to the piece's "thumb" path.
//
//   node tools/capture.mjs http://localhost:8150/ [slug ...]
//
// Serve the site folder first (any static server). Each piece can set "capture" in site.json:
//   wait    ms to wait before the shot (default 6000)
//   query   appended to the entry URL
//   hide    CSS selectors to hide, css extra CSS to inject, click "sel|sel" to click, scroll px, delay ms before those run
//           (these go through tools/shot.html, which loads the piece in a same-origin iframe)
//   dark    true to render with prefers-color-scheme: dark
//   skip    true to keep the existing thumbnail
// Real time, not --virtual-time-budget: camera tweens and drawn-on animations don't advance under virtual time.
// Windows only (Edge path). Needs Node 22 for the built-in WebSocket.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = 1280, H = 800, PORT = 9339;
const [baseArg, ...only] = process.argv.slice(2);
if (!baseArg) { console.error('usage: node tools/capture.mjs <site base url> [slug ...]'); process.exit(1); }
const base = baseArg.replace(/\/?$/, '/');
const site = JSON.parse(readFileSync(path.join(ROOT, 'site.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const profile = mkdtempSync(path.join(tmpdir(), 'dsk-capture-'));
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--force-color-profile=srgb', '--mute-audio',
  `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });

async function pageSocket() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Edge did not open a DevTools port');
}

let ws;
try {
  ws = new WebSocket(await pageSocket());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const waiting = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    waiting.set(id, m => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  for (const p of site.pieces) {
    if (only.length && !only.includes(p.slug)) continue;
    const cap = p.capture || {};
    if (cap.skip) { console.log(`${p.slug}: skipped`); continue; }
    let url = base + p.entry + (cap.query || '');
    if (cap.hide || cap.css || cap.click || cap.scroll) {
      const q = new URLSearchParams({ src: '../' + p.entry + (cap.query || ''), delay: String(cap.delay ?? 1500) });
      for (const k of ['hide', 'css', 'click', 'scroll']) if (k in cap) q.set(k, String(cap[k]));
      url = base + 'tools/shot.html?' + q;
    }
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: cap.dark ? 'dark' : 'light' }] });
    await send('Page.navigate', { url });
    await sleep(cap.wait ?? 6000);
    const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 84 });
    const buf = Buffer.from(data, 'base64');
    writeFileSync(path.join(ROOT, p.thumb), buf);
    console.log(`${p.slug}: ${Math.round(buf.length / 1024)} KB`);
  }
} finally {
  try { ws?.close(); } catch { /* already closed */ }
  try { execFileSync('taskkill', ['/pid', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Edge may still hold a lock */ }
}
