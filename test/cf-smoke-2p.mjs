/* CASTLE FORGE — drop-in 2P co-op smoke test.
 * Headless Chrome + CDP, TWO fake standard-mapping pads injected before page
 * scripts. Proves: 1P unchanged, pad(1) south joins P2, independent sticks,
 * both players interact, menu ownership, camera midpoint + soft leash,
 * hold-east leave, save/reload persistence, global pause, select no-op.
 * Run:  /opt/homebrew/opt/node@25/bin/node test/cf-smoke-2p.mjs
 * Screenshots land in $SC (default: the session scratchpad dir).
 */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import cp from 'node:child_process';
const DIR = path.join(import.meta.dirname, '..');
const SC = process.env.SC || '/private/tmp/claude-501/-Users-johnstephens-Developer-stephensgames-gameconsole/46cb33d6-59b4-4971-af37-cf2f8b42a5c1/scratchpad';
const CONTROLLER = fs.readFileSync(
  process.env.CONTROLLER_JS || path.join(DIR, '..', 'gameconsole', 'lib', 'controller.js'));

const srv = http.createServer((req, res) => {
  try { res.end(fs.readFileSync(path.join(DIR, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]))); }
  catch (e) { res.statusCode = 404; res.end(); }
}).listen(0);
const port = srv.address().port;
const chrome = cp.spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--window-size=1280,720',
   '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
   '--user-data-dir=' + path.join(SC, 'cf-smoke-2p-profile')]);
let wsUrl = null;
chrome.stderr.on('data', d => { const m = String(d).match(/DevTools listening on (ws:\S+)/); if (m) wsUrl = m[1]; });
await new Promise(r => { const t = setInterval(() => { if (wsUrl) { clearInterval(t); r(); } }, 100); });
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
const send = (m, p, sid) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p, sessionId: sid })); });
const errs = [];
ws.onmessage = e => {
  const j = JSON.parse(e.data);
  if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  if (j.method === 'Runtime.exceptionThrown') errs.push(j.params.exceptionDetails.text + ' ' + (j.params.exceptionDetails.exception?.description || ''));
  if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error') errs.push(j.params.args.map(a => a.value ?? a.description).join(' '));
  if (j.method === 'Fetch.requestPaused')      // serve the house controller.js locally — hermetic test
    send('Fetch.fulfillRequest', { requestId: j.params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }],
      body: CONTROLLER.toString('base64') }, j.sessionId);
};
const tg = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = (await send('Target.attachToTarget', { targetId: tg.result.targetId, flatten: true })).result;
await send('Runtime.enable', {}, sessionId);
await send('Page.enable', {}, sessionId);
await send('Fetch.enable', { patterns: [{ urlPattern: '*controller.js*' }] }, sessionId);
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const mk = i => ({ index: i, id: 'Fake (STANDARD GAMEPAD)', connected: true, mapping: 'standard', timestamp: 0,
    axes: [0,0,0,0], buttons: Array.from({length:17}, () => ({ pressed: false, touched: false, value: 0 })) });
  window.__fp = [mk(0), mk(1)];
  navigator.getGamepads = () => window.__fp;
  /* NOTE: 500ms default press — SwiftShader headless runs rAF at ~17fps (worse
     with the pause panel's backdrop-filter up), and a short tap can fall
     entirely between two controller polls. Real pads on the Pi are 60fps. */
  window.__press = (p, b, ms) => { __fp[p].buttons[b] = { pressed: true, touched: true, value: 1 };
    setTimeout(() => { __fp[p].buttons[b] = { pressed: false, touched: false, value: 0 }; }, ms || 500); };
  window.__hold = (p, b, on) => { __fp[p].buttons[b] = { pressed: !!on, touched: !!on, value: on ? 1 : 0 }; };
  window.__axis = (p, a, v) => { __fp[p].axes[a] = v; };
  window.__stop = p => { __fp[p].axes[0] = 0; __fp[p].axes[1] = 0; };
` }, sessionId);
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true }, sessionId)).result?.result?.value;
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  fs.writeFileSync(path.join(SC, n + '.png'), Buffer.from(r.result.data, 'base64')); console.log('  📷', path.join(SC, n + '.png')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const assert = (cond, label) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + label); if (!cond) fails++; };
/* wait for a page-side condition instead of guessing wall-clock delays
   (sim time runs slower than wall time in this headless renderer) */
async function until(expr, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(120); }
  return false;
}

/* steer a player toward a world point with real stick input */
async function walkTo(pi, targetExpr, close = 55, maxMs = 15000) {
  const pv = pi === 0 ? 'player' : 'player2';
  const t0 = Date.now();
  let last = 1e9, stuckN = 0;
  while (Date.now() - t0 < maxMs) {
    const r = await ev(`(() => { const t = ${targetExpr}; if (!t) return null;
      const dx = t.x - ${pv}.x, dy = t.y - ${pv}.y, d = Math.hypot(dx, dy);
      if (d < ${close}) { __stop(${pi}); return { done: true, d }; }
      const m = Math.max(d, 1);
      __axis(${pi}, 0, dx / m); __axis(${pi}, 1, dy / m);
      return { done: false, d }; })()`);
    if (!r) break;
    if (r.done) return true;
    if (last - r.d < 4) { if (++stuckN > 3) {           // wiggle around obstacles
      await ev(`__axis(${pi},0,${Math.random() < .5 ? 1 : -1}); __axis(${pi},1,${Math.random() < .5 ? 1 : -1})`);
      await sleep(350); stuckN = 0; } } else stuckN = 0;
    last = r.d;
    await sleep(160);
  }
  await ev(`__stop(${pi})`);
  return false;
}

await send('Page.navigate', { url: `http://127.0.0.1:${port}/` }, sessionId);
await sleep(3500);

/* ── title: join hint visible (pad 1 connected, unjoined) ── */
console.log('— title —');
assert(await ev('scene') === 'title', 'boots to title');
assert(await ev('!!window.ArcadeController'), 'controller.js loaded (local intercept)');
assert(await ev('getComputedStyle(document.getElementById("p2hint")).display') === 'block', 'P2 join hint shown on title');
await shot('cf2-title');

/* ── 1P unchanged ── */
console.log('— 1P baseline —');
await ev('__press(0, 9)'); await sleep(900);            // START on title = ignored (south confirms)
await ev('__press(0, 0)'); await sleep(1800);           // pad0 south = begin
assert(await ev('scene') === 'play', 'pad0 south starts the game');
assert(await ev('player2.active') === false, 'no P2 before a join press');
await ev('__press(1, 2)'); await sleep(500);            // pad1 west pre-join: must do nothing
assert(await ev('panelMode') === null, 'pad1 buttons inert before join (west opens nothing)');
const p0a = await ev('player.x');
await ev('__axis(0, 0, 1)'); await sleep(1000); await ev('__stop(0)');
assert(await ev('player.x') - p0a > 80, '1P stick still walks P1');
await ev('__press(0, 2)'); await sleep(600);            // west = build menu
assert(await ev('panelMode') === 'build' && await ev('panelOwner') === 0, '1P build menu opens, owner P1');
await ev('__press(0, 1)'); await sleep(500);            // east = close
assert(await ev('panelMode') === null, '1P build menu closes');

/* ── P2 join ── */
console.log('— P2 join —');
await ev('__press(1, 0)'); await sleep(600);            // pad1 south = join
assert(await ev('player2.active') === true, 'pad1 south joins P2');
assert(await ev('getComputedStyle(document.getElementById("p2hint")).display') === 'none', 'join hint hides once joined');
assert(await ev('Math.hypot(player2.x - player.x, player2.y - player.y) < 160'), 'P2 spawns beside P1');

/* ── independent sticks ── */
console.log('— independent movement —');
const before = await ev('({ p1: player.x, p2: player2.x })');
await ev('__axis(0, 0, -1); __axis(1, 0, 1)'); await sleep(1500);
await ev('__stop(0); __stop(1)');
const after = await ev('({ p1: player.x, p2: player2.x })');
assert(after.p1 - before.p1 < -100, 'P1 stick moves P1 left  (Δ ' + Math.round(after.p1 - before.p1) + ')');
assert(after.p2 - before.p2 > 100, 'P2 stick moves P2 right (Δ ' + Math.round(after.p2 - before.p2) + ')');

/* ── P2 interacts: chop a real tree with real input ── */
console.log('— P2 chops —');
const woodBefore = await ev('woodChopped');
const treeExpr = `objects.filter(o => !o.dead && (o.kind === 'oak' || o.kind === 'pine'))
  .reduce((b, o) => { const d = Math.hypot(o.x - player2.x, o.y - player2.y); return !b || d < b.d ? { x: o.x, y: o.y - 10, d } : b; }, null)`;
assert(await walkTo(1, treeExpr), 'P2 walks to the nearest tree');
await ev('__press(1, 0)'); await sleep(500);            // pad1 south = chop
assert(await ev('woodChopped') > woodBefore, 'P2 south chops (woodChopped ' + woodBefore + ' → ' + await ev('woodChopped') + ')');

/* ── P2 owns the build menu; P1 keeps walking ── */
console.log('— menu ownership —');
await ev('__press(1, 2)'); await sleep(700);            // pad1 west
assert(await ev('panelMode') === 'build' && await ev('panelOwner') === 1, 'P2 west opens build menu, owner P2');
await shot('cf2-p2menu');
/* walk P1 toward the camera center (walking outward is exactly what the leash
   cancels, so an outward walk is not a fair "still walking" probe) */
const p1b = await ev('player.x');
const inward = await ev('Math.sign(cam.x - player.x) || 1');
await ev(`__axis(0, 0, ${inward})`); await sleep(1400); await ev('__stop(0)');
assert(Math.abs(await ev('player.x') - p1b) > 60, 'P1 keeps walking during P2\'s menu');
await ev('__press(1, 12)'); await sleep(700);           // pad1 dpad-up drives the menu
assert(await ev('panelMode') === 'build', 'P2 dpad drives own menu without closing it');
await ev('__press(1, 1)');                              // pad1 east closes own menu
assert(await until('panelMode === null'), 'P2 east closes own menu (not a leave — needs a 1s hold)');
assert(await ev('player2.active') === true, 'short east tap did NOT make P2 leave');

/* ── camera midpoint + soft leash ── */
console.log('— camera leash —');
await ev('__axis(0, 0, -1); __axis(1, 0, 1); __axis(0, 1, -0.4); __axis(1, 1, 0.4)');
await sleep(5000);
await ev('__stop(0); __stop(1)'); await sleep(400);
const view = await ev(`({
  p1x: (player.x - cam.x) * SCALE, p1y: (player.y - cam.y) * SCALE,
  p2x: (player2.x - cam.x) * SCALE, p2y: (player2.y - cam.y) * SCALE,
  hw: VW / 2, hh: VH / 2, sep: Math.round(Math.hypot(player2.x - player.x, player2.y - player.y)) })`);
assert(Math.abs(view.p1x) < view.hw && Math.abs(view.p1y) < view.hh, 'P1 still on screen after hard separation (sep ' + view.sep + 'px world)');
assert(Math.abs(view.p2x) < view.hw && Math.abs(view.p2y) < view.hh, 'P2 still on screen after hard separation');
const mid = await ev('Math.abs(cam.x - (player.x + player2.x) / 2) < 40');
assert(mid, 'camera sits at the pair midpoint');
/* bring them back together for the family portrait */
await ev('__axis(0, 0, 1); __axis(1, 0, -1)'); await sleep(1800); await ev('__stop(0); __stop(1)'); await sleep(600);
await shot('cf2-both');

/* ── pause is global from either pad; select is a no-op ── */
console.log('— pause + reserved buttons —');
await ev('__press(1, 9)');
assert(await until('panelMode === "pause"'), 'pad1 START pauses');
await sleep(300); await ev('__press(0, 1)');
assert(await until('panelMode === null'), 'pad0 east closes the shared pause');
await sleep(300); await ev('__press(0, 9)');
assert(await until('panelMode === "pause"'), 'pad0 START pauses');
await sleep(300); await ev('__press(1, 1)');
assert(await until('panelMode === null'), 'pad1 east closes the shared pause');
await sleep(300); await ev('__press(0, 8)'); await ev('__press(1, 8)'); await sleep(1200);
assert(await ev('panelMode') === null, 'SELECT alone is not bound by the game (shell-reserved combo safe)');

/* ── P2 leave: hold east 1s ── */
console.log('— P2 leave —');
await ev('__hold(1, 1, true)');
const left = await until('player2.active === false', 5000);   // 1s of SIM time ≈ ~1.8s wall here
await ev('__hold(1, 1, false)');
assert(left, 'hold-east 1s (sim time): P2 waves goodbye');
assert(await ev('getComputedStyle(document.getElementById("p2hint")).display') === 'block', 'join hint returns after leave');

/* ── save/reload restores P2 ── */
console.log('— save persistence —');
await ev('__press(1, 0)'); await sleep(600);            // rejoin
assert(await ev('player2.active') === true, 'P2 rejoins');
await ev('__axis(1, 1, 1)'); await sleep(800); await ev('__stop(1)');
await sleep(6800);                                      // let the 6s autosave capture the new position
const savedPos = await ev('({ x: player2.x, y: player2.y })');
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` }, sessionId);
await sleep(3000);
assert(await ev('scene') === 'title', 'reload lands on title');
await ev('__press(0, 0)'); await sleep(1800);           // CONTINUE THE KINGDOM
assert(await ev('scene') === 'play', 'continue loads the save');
assert(await ev('player2.active') === true, 'P2 presence restored from the save');
const loadedPos = await ev('({ x: player2.x, y: player2.y })');
const drift = Math.hypot(loadedPos.x - savedPos.x, loadedPos.y - savedPos.y);
assert(drift < 90, 'P2 position restored (drift ' + Math.round(drift) + 'px)');

/* ── keyboard stays P1-only and functional ── */
console.log('— keyboard regression —');
await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', bubbles: true })); 0`);
await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', bubbles: true })); 0`);
await sleep(400);
assert(await ev('panelMode') === 'build' && await ev('panelOwner') === 0, 'keyboard C opens build menu as P1');
await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })); 0`);
await sleep(400);
assert(await ev('panelMode') === null, 'keyboard Escape closes it');

console.log('— console errors —');
assert(errs.length === 0, 'zero console errors (' + errs.length + ')');
if (errs.length) console.log(errs.slice(0, 5));

console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILURES`);
chrome.kill(); srv.close(); process.exit(fails === 0 ? 0 : 1);
