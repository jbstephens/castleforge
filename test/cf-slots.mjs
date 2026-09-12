/* CASTLE FORGE — 12-slot named save system verification.
 * Headless Chrome + CDP, fake standard pads injected before page scripts.
 * Proves: MIGRATION LAW (legacy castleforge-save-v1 → slot 1 "THE FIRST
 * KINGDOM", payload untouched, legacy key kept as a backup), pad-driven
 * naming grid + 🎲 randomizer + empty-accepts-default, slot isolation,
 * the 12 cap with no 13th path, archive-delete with NO focused + undo
 * bucket, CHANGE KINGDOM round-trips with autosave, 2P join in a slotted
 * game, keyboard-only full flow, touch taps. Zero console errors.
 * Sim-state polling throughout — wall-clock is never trusted.
 * Run:  /opt/homebrew/opt/node@25/bin/node test/cf-slots.mjs
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
fs.rmSync(path.join(SC, 'cf-slots-profile'), { recursive: true, force: true });   // hermetic runs
const chrome = cp.spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--window-size=1280,720',
   '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
   '--user-data-dir=' + path.join(SC, 'cf-slots-profile')]);
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
  if (j.method === 'Fetch.requestPaused')
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
async function until(expr, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(150); }
  return false;
}
const kd = async code => { await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}', bubbles: true })); 0`); await sleep(280); };
async function walkTo(pi, targetExpr, close = 55, maxMs = 25000) {
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
    if (last - r.d < 4) { if (++stuckN > 3) {
      await ev(`__axis(${pi},0,${Math.random() < .5 ? 1 : -1}); __axis(${pi},1,${Math.random() < .5 ? 1 : -1})`);
      await sleep(350); stuckN = 0; } } else stuckN = 0;
    last = r.d;
    await sleep(160);
  }
  await ev(`__stop(${pi})`);
  return false;
}
/* pad-navigate the slot grid to index i (adaptive, real dpad presses) */
async function navToSlot(i) {
  for (let g = 0; g < 24; g++) {
    const cur = await ev('slotSel');
    if (cur === i) return true;
    const dc = (i % 4) - (cur % 4), dr = ((i / 4) | 0) - ((cur / 4) | 0);
    const b = dr > 0 ? 13 : dr < 0 ? 12 : dc > 0 ? 15 : 14;
    await ev(`__press(0, ${b}, 200)`);
    await sleep(520);
  }
  return (await ev('slotSel')) === i;
}
/* pad-navigate the letter grid to (row, col) */
async function navToKey(r, k) {
  for (let g = 0; g < 30; g++) {
    const cur = await ev('({ r: nameRow, k: nameCol })');
    if (cur.r === r && cur.k === k) return true;
    const b = cur.r !== r ? ((r - cur.r + 4) % 4 <= 2 ? 13 : 12) : (k > cur.k ? 15 : 14);
    await ev(`__press(0, ${b}, 200)`);
    await sleep(500);
  }
  return false;
}
const KB_POS = {};                               // letter → [row, col]
'ABCDEFGHI'.split('').forEach((c, i) => KB_POS[c] = [0, i]);
'JKLMNOPQR'.split('').forEach((c, i) => KB_POS[c] = [1, i]);
'STUVWXYZ'.split('').forEach((c, i) => KB_POS[c] = [2, i]);
KB_POS[' '] = [2, 8]; KB_POS.DEL = [2, 9]; KB_POS.BACK = [3, 0]; KB_POS.RAND = [3, 1]; KB_POS.DONE = [3, 2];
async function padType(word) {
  for (const ch of word) {
    const [r, k] = KB_POS[ch];
    if (!await navToKey(r, k)) return false;
    const n = await ev('nameText.length');
    await ev('__press(0, 0)');
    if (!await until(`nameText.length === ${n + 1}`, 4000)) return false;
    await sleep(300);
  }
  return true;
}
/* pause → CHANGE KINGDOM (real pad presses through the panel) */
async function backToTitle() {
  await ev('__press(0, 9)');
  if (!await until("panelMode === 'pause'", 6000)) return false;
  await sleep(500);
  const idx = await ev("panelItems.findIndex(el => el.textContent.includes('CHANGE KINGDOM'))");
  if (idx < 0) return false;
  let guard = 0;
  while (guard++ < 8 && (await ev('panelSel')) !== idx) { await ev('__press(0, 13, 200)'); await sleep(520); }
  await ev('__press(0, 0)');
  return await until("scene === 'title'", 6000);
}
/* a real touch tap on a DOM element (CDP touch events → synthesized click) */
async function tap(expr) {
  const r = await ev(`(() => { const el = ${expr}; if (!el) return null;
    const b = el.getBoundingClientRect(); return { x: (b.x + b.width / 2) | 0, y: (b.y + b.height / 2) | 0 }; })()`);
  if (!r) return false;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] }, sessionId);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
  await sleep(500);
  return true;
}
const NAME_VALID = `NAME_A.some(a => nameText.startsWith(a)) && NAME_B.some(b => nameText.endsWith(b)) && nameText.length <= 12`;

/* ═══════ scene 1: MIGRATION LAW — the family's real kingdom rides on this ═══════ */
console.log('— migration —');
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` }, sessionId);
await sleep(2500);
await ev(`localStorage.clear(); localStorage.setItem('castleforge-save-v1', JSON.stringify({
  v: 1,
  res:  { wood: 200, food: 150, stone: 120, iron: 80, gold: 60, magic: 30, star: 25 },
  life: { wood: 900, food: 700, stone: 400, iron: 200, gold: 150, magic: 80, star: 40 },
  age: 7, pop: 52, goalI: 40, cratesOpened: 20, woodChopped: 60, greeted: 15, chickensPetted: 6,
  cheers: 3, piesFired: 4, wizardMet: true, dragonFound: true, dragonFriend: true,
  starTouched: true, beaconLit: true, hats: [0, 1, 2, 3], hatWorn: 3,
  visitedRegions: { meadow: true, farm: true, forest: true, hills: true, glade: true, peaks: true, crater: true },
  playT: 4200, px: 1632, py: 1700,
  buildings: [
    { k: 'keep', x: 27, y: 26 }, { k: 'tower', x: 26, y: 29 }, { k: 'cottage', x: 23, y: 26 },
    { k: 'woodhut', x: 30, y: 24 }, { k: 'farmplot', x: 29, y: 30 }, { k: 'coop', x: 20, y: 26 },
  ],
  war: { dif: 'standard', conq: ['bramble'], tr: 5, wc: 3, rr: 2, fd: false,
    kh: { bramble: 0, thistle: 20, cinder: 36 }, units: [{ k: 'knight', o: 0 }, { k: 'archer', o: 0 }] },
})); 'seeded'`);
const legacyRaw = await ev("localStorage.getItem('castleforge-save-v1')");
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` }, sessionId);
await sleep(3200);
assert(await ev('scene') === 'title', 'boots to the slot picker');
const mig = await ev(`(() => {
  const a = JSON.parse(localStorage.getItem('castleforge-save-v1'));
  const b = JSON.parse(localStorage.getItem('castleforge-slot-1') || 'null');
  if (!b) return { ok: false };
  const extra = Object.keys(b).filter(k => !(k in a)).sort();
  const same = Object.keys(a).every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]));
  return { ok: true, name: b.name, extra, same }; })()`);
assert(mig.ok, 'legacy save migrated into slot 1');
assert(mig.name === 'THE FIRST KINGDOM', 'migrated slot named THE FIRST KINGDOM');
assert(mig.same, 'every legacy payload field preserved byte-for-byte');
assert(JSON.stringify(mig.extra) === '["name","savedAt"]', 'only name + savedAt added (' + JSON.stringify(mig.extra) + ')');
assert(await ev("localStorage.getItem('castleforge-save-v1')") === legacyRaw, 'legacy key left in place, untouched (backup)');
assert(await ev("localStorage.getItem('castleforge-active-slot')") === '1', 'active slot points at the migrated kingdom');
const cell1 = await ev("({ n: slotCells[0].querySelector('.sn').textContent, a: slotCells[0].querySelector('.sa').textContent, glyph: !!slotCells[0].querySelector('canvas') })");
assert(cell1.n === 'THE FIRST KINGDOM' && cell1.a.includes('AGE 7'), 'picker shows "THE FIRST KINGDOM — AGE 7" (' + cell1.a + ')');
assert(cell1.glyph, 'filled slot carries its castle glyph');
assert(await ev("slotCells.filter(el => el.classList.contains('empty')).length") === 11, 'the other 11 slots read — NEW KINGDOM —');
await ev('__press(0, 0)'); await sleep(2600);            // south on slot 1 = play it
assert(await ev('scene') === 'play', 'south on the filled slot continues the kingdom');
assert(await ev('age') === 7 && await ev('beaconLit') === true, 'age 7 + lit beacon restored');
assert(await ev('war !== null && war.conquered.includes("bramble")'), 'war layer + conquest restored');
assert(await ev('kingdomName') === 'THE FIRST KINGDOM', 'kingdomName live in play');
await ev('war.raidT = 9999; 0');                         // keep raids out of the storage tests

/* the ledger wears the kingdom name */
await ev('__press(0, 3)');                               // north = ROYAL LEDGER
assert(await until("panelMode === 'stats'", 5000), 'ledger opens');
assert(await ev("panelEl.textContent.includes('KINGDOM') && panelEl.textContent.includes('THE FIRST KINGDOM')"), 'ledger shows the kingdom name');
await shot('cfs-ledger');
await ev('__press(0, 1)'); await until('panelMode === null');

/* ═══════ scene 2: CHANGE KINGDOM round-trips + autosaves ═══════ */
console.log('— change kingdom —');
await ev('res.wood = 777; hudDirty = true; 0');
assert(await backToTitle(), 'pause → CHANGE KINGDOM returns to the picker');
assert(await ev('titleMode') === 'slots', 'picker mode active');
const savedWood = await ev("JSON.parse(localStorage.getItem('castleforge-slot-1')).res.wood");
assert(Math.abs(savedWood - 777) < 20, 'CHANGE KINGDOM autosaved before leaving (wood ' + savedWood + ' ≈ 777 in slot 1; woodhut drift allowed)');

/* ═══════ scene 3: the naming screen, driven by pad ═══════ */
console.log('— naming by pad —');
assert(await navToSlot(1), 'dpad navigates to slot 2');
await ev('__press(0, 0)'); await sleep(900);
assert(await ev("titleMode === 'name'"), 'south on an empty slot opens the naming screen');
assert(await ev(NAME_VALID), 'default name is a kid-joy list combo (' + await ev('nameText') + ')');
assert(await ev('({ r: nameRow, k: nameCol })').then(p => p.r === 3 && p.k === 2), 'DONE starts focused (mash-friendly)');
/* 🎲 the randomizer */
const seen = new Set([await ev('nameText')]);
assert(await navToKey(3, 1), 'dpad reaches 🎲 RANDOM');
for (let i = 0; i < 3; i++) {
  await ev('__press(0, 0)'); await sleep(800);
  assert(await ev(NAME_VALID), '🎲 roll ' + (i + 1) + ' is a valid list combo (' + await ev('nameText') + ')');
  seen.add(await ev('nameText'));
}
assert(seen.size >= 2, '🎲 actually randomizes (' + seen.size + ' distinct of 4)');
/* erase with ○ (east = backspace shortcut), then type BEN on the grid */
for (let i = 0; i < 14 && await ev('nameText.length > 0'); i++) { await ev('__press(0, 1, 200)'); await sleep(480); }
assert(await ev("nameText === ''"), '○ backspaces the whole name away');
assert(await padType('BEN'), 'pad types B-E-N on the letter grid');
assert(await ev('nameText') === 'BEN', 'name box reads BEN');
await shot('cfs-naming');
assert(await navToKey(3, 2), 'dpad returns to ✓ BEGIN!');
await ev('__press(0, 0)'); await sleep(2600);
assert(await ev('scene') === 'play', 'DONE starts the fresh kingdom');
assert(await ev('kingdomName') === 'BEN' && await ev('activeSlot') === 2, 'kingdom BEN lives in slot 2');
assert(await ev("JSON.parse(localStorage.getItem('castleforge-slot-2')).name") === 'BEN', 'slot 2 saved immediately with its name');
assert(await ev('age') === 1 && await ev('goalI') === 0, 'fresh kingdom starts at the campfire');

/* progress BEN a little: walk to a tree and chop it (real input) */
const treeExpr = `objects.filter(o => !o.dead && (o.kind === 'oak' || o.kind === 'pine'))
  .reduce((b, o) => { const d = Math.hypot(o.x - player.x, o.y - player.y); return !b || d < b.d ? { x: o.x, y: o.y - 10, d } : b; }, null)`;
assert(await walkTo(0, treeExpr), 'BEN\'s ruler walks to a tree');
for (let i = 0; i < 4 && !(await ev('woodChopped > 0')); i++) { await ev('__press(0, 0)'); await sleep(700); }
assert(await ev('woodChopped') > 0, 'chopped wood in BEN (woodChopped ' + await ev('woodChopped') + ')');
await ev('save(); 0');
const benWood = await ev('woodChopped');

/* ═══════ scene 4: slot isolation ═══════ */
console.log('— isolation —');
assert(await backToTitle(), 'back to the picker');
await shot('cfs-picker');                                 // 2 filled + 10 empty — the front door
assert(await navToSlot(0), 'dpad back to slot 1');
await ev('__press(0, 0)'); await sleep(2600);
assert(await ev('scene') === 'play' && await ev('kingdomName') === 'THE FIRST KINGDOM', 'slot 1 loads THE FIRST KINGDOM');
assert(await ev('age') === 7 && await ev('woodChopped') === 60, 'slot 1 state untouched by BEN\'s chopping (age 7, wood 60)');
await ev('war.raidT = 9999; 0');
assert(await backToTitle(), 'and back again');
assert(await navToSlot(1), 'over to slot 2');
await ev('__press(0, 0)'); await sleep(2600);
assert(await ev('kingdomName') === 'BEN' && await ev('age') === 1, 'slot 2 still BEN, age 1');
assert(await ev('woodChopped') === benWood, 'BEN\'s chopped wood survived the round-trip (' + benWood + ')');
assert(await backToTitle(), 'back to the picker once more');

/* ═══════ scene 5: an empty name accepts the random default ═══════ */
console.log('— empty name → default —');
assert(await navToSlot(2), 'to slot 3');
await ev('__press(0, 0)'); await sleep(900);
assert(await ev("titleMode === 'name'"), 'naming opens for slot 3');
for (let i = 0; i < 14 && await ev('nameText.length > 0'); i++) { await ev('__press(0, 1, 200)'); await sleep(480); }
assert(await ev("nameText === ''"), 'name erased to empty');
assert(await navToKey(3, 2), 'over to DONE');
await ev('__press(0, 0)'); await sleep(2600);
assert(await ev('scene') === 'play', 'DONE on an empty name still begins');
const defName = await ev('kingdomName');
assert(await ev(`NAME_A.some(a => kingdomName.startsWith(a)) && NAME_B.some(b => kingdomName.endsWith(b))`),
  'empty name became a random default (' + defName + ')');
assert(await backToTitle(), 'back to the picker');

/* ═══════ scene 6: all 12 fillable, and no 13th path ═══════ */
console.log('— the 12 cap —');
await ev(`for (let i = 4; i <= 12; i++) localStorage.setItem('castleforge-slot-' + i, JSON.stringify({
  v: 1, name: 'FILLER ' + i, savedAt: Date.now(),
  res: { wood: i }, life: { wood: i }, age: (i % 7) + 1, pop: 4, goalI: 2, cratesOpened: 0, woodChopped: i,
  greeted: 0, chickensPetted: 0, cheers: 0, piesFired: 0, wizardMet: false, dragonFound: false,
  dragonFriend: false, starTouched: false, beaconLit: false, hats: [], hatWorn: -1,
  visitedRegions: { meadow: true }, playT: 60, px: 1632, py: 1700, buildings: [] }));
  openSlotPicker(); 0`);
assert(await ev('SLOT_MAX') === 12, 'SLOT_MAX is 12');
assert(await ev('slotCells.length') === 12, 'the picker renders exactly 12 slots');
assert(await ev("slotCells.filter(el => el.classList.contains('empty')).length") === 0, 'all 12 slots filled');
await shot('cfs-picker-full');
const selBefore = await ev('slotSel');
for (let i = 0; i < 12; i++) { await ev('__press(0, 15, 180)'); await sleep(420); }
assert(await ev('slotSel') === selBefore, '12 rights wrap back around — no 13th cell to land on');
assert(await ev("localStorage.getItem('castleforge-slot-13')") === null, 'no slot-13 key exists anywhere');
assert(await navToSlot(11), 'to slot 12');
await ev('__press(0, 0)'); await sleep(2600);
assert(await ev('scene') === 'play' && await ev('kingdomName') === 'FILLER 12' && await ev('age') === 6,
  'slot 12 (the last one) loads its own kingdom');
await ev('war.raidT = 9999; 0');
assert(await backToTitle(), 'back to the picker');

/* ═══════ scene 7: delete = the royal archives ═══════ */
console.log('— archive-delete —');
assert(await navToSlot(11), 'on slot 12');
const slot12Raw = await ev("localStorage.getItem('castleforge-slot-12')");
await ev('__press(0, 2)'); await sleep(900);              // west = archive?
assert(await ev("titleMode === 'del'"), 'west on a filled slot opens the archive confirm');
assert(await ev('delSel') === 1, 'NO is focused — archiving is a choice, not an accident');
await shot('cfs-delete');
await ev('__press(0, 0)'); await sleep(900);              // south on NO
assert(await ev("titleMode === 'slots'"), 'NO returns to the picker');
assert(await ev("localStorage.getItem('castleforge-slot-12')") !== null, 'the kingdom survives NO');
await ev('__press(0, 2)'); await sleep(900);              // west again
await ev('__press(0, 14, 200)'); await sleep(500);        // left → YES
assert(await ev('delSel') === 0, 'dpad moves focus to YES');
await ev('__press(0, 0)'); await sleep(1000);             // confirm
assert(await ev("localStorage.getItem('castleforge-archive-12')") === slot12Raw, 'archive bucket holds the exact JSON (undo-able)');
assert(await ev("localStorage.getItem('castleforge-slot-12')") === null, 'slot 12 emptied');
assert(await ev("slotCells[11].classList.contains('empty')"), 'picker shows slot 12 as — NEW KINGDOM — again');

/* ═══════ scene 8: 2P in a slotted world ═══════ */
console.log('— 2P —');
assert(await navToSlot(1), 'back over to BEN');
await ev('__press(1, 0)'); await sleep(2800);             // P2 confirms the shared slot choice
assert(await ev('scene') === 'play', 'P2 south launches the picked slot');
assert(await ev('player2.active') === true, 'P2 dropped straight into the kingdom');
await ev('__hold(1, 1, true)');
assert(await until('player2.active === false', 8000), 'P2 waves goodbye (hold ○)');
await ev('__hold(1, 1, false)'); await sleep(500);
await ev('__press(1, 0)'); await sleep(900);
assert(await ev('player2.active') === true, 'P2 rejoins mid-game — drop-in intact in a slotted world');
assert(await backToTitle(), 'back to the picker');

/* ═══════ scene 9: keyboard-only full flow ═══════ */
console.log('— keyboard only —');
assert(await ev("scene === 'title' && titleMode === 'slots'"), 'at the picker for the keyboard run');
for (const k of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight']) await kd(k);
assert(await ev('slotSel') === 11, 'arrow keys navigate the grid (slot 12)');
await kd('KeyX');                                          // X on the empty slot
assert(await until("titleMode === 'name'", 4000), 'X opens the naming screen');
for (let i = 0; i < 14 && await ev('nameText.length > 0'); i++) await kd('Backspace');
for (const k of ['KeyM', 'KeyO', 'KeyO', 'Space', 'KeyS', 'KeyH', 'KeyI', 'KeyR', 'KeyE']) await kd(k);
assert(await ev('nameText') === 'MOO SHIRE', 'keyboard players just type (MOO SHIRE)');
await kd('Enter'); await sleep(2600);
assert(await ev('scene') === 'play' && await ev('kingdomName') === 'MOO SHIRE', 'Enter begins the typed kingdom');
assert(await ev("JSON.parse(localStorage.getItem('castleforge-slot-12')).name") === 'MOO SHIRE', 'saved under slot 12 with its typed name');
/* keyboard round-trip home: P pauses, arrows + X pick CHANGE KINGDOM */
await kd('KeyP');
assert(await until("panelMode === 'pause'", 5000), 'keyboard P pauses');
const ck = await ev("panelItems.findIndex(el => el.textContent.includes('CHANGE KINGDOM'))");
for (let i = 0; i < 8 && (await ev('panelSel')) !== ck; i++) await kd('ArrowDown');
await kd('KeyX');
assert(await until("scene === 'title'", 6000), 'keyboard completes CHANGE KINGDOM');

/* ═══════ scene 10: touch taps pick + name a slot ═══════ */
console.log('— touch —');
assert(await navToSlot(10), 'on slot 11 (FILLER 11)');    // free it up by pad first
await ev('__press(0, 2)'); await sleep(900);
await ev('__press(0, 14, 200)'); await sleep(500);
await ev('__press(0, 0)'); await sleep(1000);
assert(await ev("slotCells[10].classList.contains('empty')"), 'slot 11 archived to make room');
assert(await tap('slotCells[10]'), 'tap lands on slot 11');
assert(await until("titleMode === 'name'", 4000), 'touch tap on an empty slot opens naming');
await tap('nameCells[3][1]');                              // 🎲
assert(await ev(NAME_VALID), 'tapped 🎲 gives a valid combo (' + await ev('nameText') + ')');
const preDel = await ev('nameText');
await tap('nameCells[2][9]');                              // ⌫
const trimmed = await ev('nameText');
assert(trimmed === preDel.slice(0, -1), 'tapped ⌫ erases one letter');
await tap('nameCells[0][0]');                              // A
assert(await ev('nameText') === trimmed + 'A', 'tapped letter A appends');
const touchName = await ev("(nameText.trim() || 'X')");
await tap('nameCells[3][2]');                              // ✓ BEGIN!
assert(await until("scene === 'play'", 6000), 'tapped DONE starts the kingdom');
assert(await ev('kingdomName') === touchName.slice(0, 12), 'touch-named kingdom lives (' + await ev('kingdomName') + ')');
assert(await ev("JSON.parse(localStorage.getItem('castleforge-slot-11')).name") === await ev('kingdomName'), 'saved in slot 11');

console.log('— console errors —');
assert(errs.length === 0, 'zero console errors (' + errs.length + ')');
if (errs.length) console.log(errs.slice(0, 8));

console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILURES`);
chrome.kill(); srv.close(); process.exit(fails === 0 ? 0 : 1);
