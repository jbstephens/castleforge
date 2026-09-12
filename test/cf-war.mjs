/* CASTLE FORGE — BANNERS & BATTLES war-expansion verification.
 * Headless Chrome + CDP, fake standard pads injected before page scripts.
 * Proves: old-save migration (peaceful pre-age-5), training + army cap,
 * war horn stances (follow/hold/charge measurable), telegraphed raids +
 * guard towers + rubble/repair + retreat, difficulty cadence, combat laws
 * (star-pops, keep never destroyed, no game over), full Bramble conquest
 * with wizard blast + dragon flyover, tribute + hat, 2P bands + horns,
 * peace festival, save round-trip, sprite/op budget, zero console errors.
 * Sim-state polling throughout — headless runs this game slow; wall-clock
 * is never trusted for game outcomes.
 * Run:  /opt/homebrew/opt/node@25/bin/node test/cf-war.mjs
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
fs.rmSync(path.join(SC, 'cf-war-profile'), { recursive: true, force: true });   // hermetic: no slot saves from a prior run
const chrome = cp.spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--window-size=1280,720',
   '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
   '--user-data-dir=' + path.join(SC, 'cf-war-profile')]);
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
  /* 500ms default press — headless rAF is slow; short taps fall between polls */
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
async function until(expr, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(150); }
  return false;
}
async function walkTo(pi, targetExpr, close = 48, maxMs = 45000) {
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
/* leave the world in a drivable state between scenes */
async function settle() {
  if (await ev('placing !== null')) { await ev('__press(0, 1)'); await until('placing === null', 3000); }
  if (await ev('panelMode !== null')) { await ev('__press(0, 1)'); await until('panelMode === null', 3000); }
}
/* build through the REAL menu flow: west → dpad (poll-verified) → south → south */
async function buildViaMenu(key) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await settle();
    await ev('__press(0, 2)');
    if (!await until("panelMode === 'build'", 5000)) continue;
    const idx = await ev(`panelItems.findIndex(el => el.querySelector('canvas') && el.querySelector('canvas').dataset.bld === '${key}')`);
    if (idx < 0) { await settle(); continue; }
    let guard = 0;
    while (guard++ < 60 && (await ev('panelSel')) !== idx && (await ev('panelMode')) === 'build') {
      await ev('__press(0, 13, 200)'); await sleep(430);
    }
    if (await ev('panelSel') !== idx) { await settle(); continue; }
    await ev('__press(0, 0)');
    if (!await until('placing !== null', 5000)) { await settle(); continue; }
    await sleep(700);                                   // let the first press RELEASE — edges, not holds
    await ev('__press(0, 0)');
    if (await until(`placing === null && cnt('${key}') >= 1`, 6000)) return true;
    await settle();
  }
  return false;
}
/* walk to a building and press X until a page condition holds */
async function pressAt(bldKey, yOff, close, doneExpr, tries = 5) {
  const t = `(() => { const b = buildings.find(b => b.key === '${bldKey}'); return b ? { x: bldCX(b), y: bldCY(b) + ${yOff} } : null; })()`;
  if (!await walkTo(0, t, close)) return false;
  for (let i = 0; i < tries; i++) {
    await ev('__press(0, 0)');
    if (await until(doneExpr, 2500)) return true;
  }
  return false;
}
const px = async () => await ev('({x: player.x, y: player.y})');

/* ═══════ scene 0: a synthesized PRE-WAR save (old shape, age 4) ═══════ */
console.log('— old-save migration —');
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` }, sessionId);
await sleep(2500);
await ev(`localStorage.setItem('castleforge-save-v1', JSON.stringify({
  v: 1,
  res:  { wood: 120, food: 90, stone: 80, iron: 40, gold: 20, magic: 0, star: 0 },
  life: { wood: 300, food: 200, stone: 120, iron: 60, gold: 30, magic: 0, star: 0 },
  age: 4, pop: 24, goalI: 24, cratesOpened: 8, woodChopped: 60, greeted: 9, chickensPetted: 3,
  cheers: 3, piesFired: 0, wizardMet: false, dragonFound: false, dragonFriend: false,
  starTouched: false, beaconLit: false, hats: [0, 1], hatWorn: 0,
  visitedRegions: { meadow: true, farm: true, forest: true, hills: true }, playT: 1200,
  px: 1632, py: 1700,
  buildings: [
    { k: 'keep',      x: 27, y: 26 }, { k: 'tower',   x: 26, y: 29 }, { k: 'tower',  x: 21, y: 28 },
    { k: 'coop',      x: 20, y: 26 }, { k: 'cottage', x: 23, y: 26 }, { k: 'woodhut', x: 30, y: 24 },
    { k: 'trainyard', x: 22, y: 23 }, { k: 'farmplot', x: 29, y: 30 }, { k: 'woodhut', x: 18, y: 26 },
  ],
})); 'seeded'`);
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` }, sessionId);
await sleep(3200);
assert(await ev('scene') === 'title', 'boots to title with the old save present');
await ev('__press(0, 0)'); await sleep(2200);               // CONTINUE
assert(await ev('scene') === 'play', 'old save CONTINUEs into play');
assert(await ev('age') === 4, 'age 4 restored');
assert(await ev('war === null'), 'war layer is NULL on a pre-war save (peaceful)');
assert(await ev('!document.body.classList.contains("at-war")'), 'no at-war UI pre-age-5');
assert(await ev('buildings.length') === 10, 'all 9 old buildings + campfire restored');
assert(await ev('GOALS.length') === 49, '49 quests total (39 old + 10 War Council)');
assert(await ev('typeof gameOver') === 'undefined', 'no game-over machinery exists');

/* ═══════ scene 1: age 5 dawns → the war layer wakes ═══════ */
console.log('— the war age —');
await ev('setAge(5)'); await sleep(800);
assert(await ev('war !== null'), 'age 5: war layer initialized');
assert(await ev('document.body.classList.contains("at-war")'), 'at-war UI class set (touch HORN unlocks)');
await ev('war.raidT = 9999; 0');                            // raids under test control from here
assert(await until("war.units.some(u => u.team === 2 && u.home === 'bramble')", 15000), 'Bramble garrison musters in the far west');
assert(await ev("war.units.every(u => u.home !== 'thistle' && u.home !== 'cinder')"), 'Thistle + Cinder do NOT exist at age 5');
assert(await ev("war.units.every(u => Math.hypot(u.x - RIVALS.bramble.x, u.y - RIVALS.bramble.y) < 420)"), 'garrison stays at its compound');

/* ═══════ scene 2: the War Council quest line + training ═══════ */
console.log('— war council quests + training —');
await ev('res.wood = 600; res.food = 600; res.stone = 400; res.iron = 300; res.gold = 300; hudDirty = true; 0');
await ev('goalI = 39; updateGoalUI(); 0');                  // jump to the War Council line (first 39 covered live + by cf-smoke-2p)
/* stage the war quarter in OPEN ground north of the village, so X presses
   land on the buildings and not on wandering villagers/chickens */
assert(await walkTo(0, '({ x: 1750, y: 1250 })', 60, 60000), 'P1 walks to open ground for the war quarter');
const cratesBefore = await ev('crates.length');
assert(await buildViaMenu('wartable'), 'WAR TABLE built through the real menu flow');
assert(await until('goalI === 40', 6000), 'quest done: BUILD THE WAR TABLE');
assert(await ev('crates.length') > cratesBefore, 'quest dropped a royal chest');
await ev('crates.splice(0); 0');                            // chests would steal later X presses
assert(await buildViaMenu('range'), 'ARCHERY RANGE built through the real menu flow');
assert(await until('goalI === 41', 6000), 'quest done: BUILD THE ARCHERY RANGE');
await ev('crates.splice(0); 0');

const ironA = await ev('res.iron');
assert(await pressAt('trainyard', 50, 55, "war.units.some(u => u.kind === 'knight' && u.team === 0)"), 'walk to the yard + X trains a KNIGHT');
assert(Math.round(ironA - await ev('res.iron')) === 3, 'knight cost deducted (3⚙ exact; food drifts with the living economy)');
assert(await pressAt('range', 38, 48, "war.units.filter(u => u.kind === 'archer').length >= 1"), 'walk to the range + X trains an ARCHER');
assert(await pressAt('range', 38, 48, 'war.trained >= 3', 6), 'a second archer: war.trained reaches 3');
assert(await until('goalI === 42', 6000), 'quest done: TRAIN 3 SOLDIERS');
await ev('crates.splice(0); 0');

/* stable + cavalry are age-6 tech — prove the gate, then the training */
await settle();
await ev('__press(0, 2)'); await until("panelMode === 'build'", 4000);
assert(await ev("panelItems.every(el => !el.querySelector('canvas') || el.querySelector('canvas').dataset.bld !== 'stable')"), 'STABLE hidden at age 5');
await settle();
await ev('setAge(6)'); await sleep(600);
await walkTo(0, '({ x: 1950, y: 1060 })', 60, 40000);       // isolated patch — no other interactable within reach
assert(await buildViaMenu('stable'), 'age 6: STABLE built through the real menu');
assert(await pressAt('stable', 38, 48, "war.units.some(u => u.kind === 'cavalry')"), 'walk to the stable + X trains CAVALRY');
assert(await until("war.units.some(u => u.team === 2 && u.home === 'thistle')", 25000), "age 6: Lady Thistle's garrison appears");

/* cheer the band — X in open ground beside your soldiers */
console.log('— cheering —');
await settle();
await walkTo(0, '({ x: 1600, y: 1150 })', 60, 30000);       // clear of every interactable building
await sleep(1500);                                          // the band settles into formation
let cheered = false;
for (let i = 0; i < 8 && !cheered; i++) {
  await ev('__press(0, 0)');
  cheered = await until('war.warCheers >= 3', 1800);
}
assert(cheered, 'X by your soldiers = CHEER (3/3)');
assert(await until('goalI === 43', 6000), 'quest done: CHEER YOUR WAR BAND');
await ev('crates.splice(0); 0');

/* ═══════ scene 3: the scripted gentle first raid ═══════ */
console.log('— first raid: telegraph + defense —');
await settle();
assert(await ev('goalI === WARQ_RAID'), 'REPEL A RAID is the active quest (the game hurries a gentle raid in)');
assert(await until('war.raid !== null', 60000), 'the scripted first raid musters');
assert(await ev("war.raid && war.raid.state === 'telegraph'"), 'raid opens in TELEGRAPH state');
assert(await ev('war.raid.n0') === 3, 'first raid is gentle: 3 raiders');
assert(await ev("war.raid.rk === 'bramble'"), 'it marches from Sir Bramble (the WEST)');
await sleep(2500);
assert(await ev("war.raid && war.raid.state === 'telegraph' && war.raid.t < 20"), 'still telegraphing while t < 20s');
await shot('cfw-telegraph');
await ev('__press(0, 4)');                                  // horn: follow → HOLD (keep the band home)
assert(await until("war.stance[0] === 'hold'", 4000), 'war horn press 1: HOLD HERE');
await ev('if (war.raid) war.raid.t = 19.2; 0');             // advance the raid timer via sim
assert(await until("war.raid && war.raid.state === 'attack'", 15000), 'telegraph ends → attack begins');
assert(await ev('war.raid.t') >= 19.9, 'attack began only after the full 20s telegraph');
assert(await until('villagers.some(r => r.waveT > 0)', 20000), 'villagers cheer from the windows during the defense');
assert(await until('war.chickenScatters > 0', 45000), 'chickens scatter squawking as raiders pass the coop');
assert(await until('war.arrows.some(a => a.team === 0) || war.units.some(u => u.raid && u.hp < u.maxhp)', 60000), 'guard towers open fire on the raiders');
assert(await until('buildings.some(b => b.rubble)', 120000), 'raiders bonk a building into RUBBLE');
await walkTo(0, '({ x: 1500, y: 1750 })', 160, 25000);      // bring the camera to the defense for the shot
await sleep(800);
await shot('cfw-raid');
await ev('__press(0, 4)');                                  // hold → CHARGE
assert(await until("war.stance[0] === 'charge'", 4000), 'war horn cycles to CHAAARGE');
assert(await until('war.raid === null', 150000), 'the raid ends (beaten raiders retreat / pop home)');
assert(await ev('war.raidsRepelled') >= 1, 'raid counted as repelled');
assert(await until('goalI === 44', 6000), 'quest done: REPEL A RAID');
assert(await ev('scene') === 'play', 'no game over — still playing');
await ev('crates.splice(0); 0');
await ev("war.stance[0] = 'follow'; for (const u of war.units) if (u.team === 0) u.rt = 0; 0");

/* repair the rubble with X + half cost */
console.log('— repair —');
const rubIdx = await ev('buildings.findIndex(b => b.rubble)');
const rubKey = await ev(`buildings[${rubIdx}] ? buildings[${rubIdx}].key : null`);
assert(rubIdx >= 0, 'a rubbled building awaits repair (' + rubKey + ')');
const rub = `({ x: bldCX(buildings[${rubIdx}]), y: bldCY(buildings[${rubIdx}]) + 30 })`;
assert(await walkTo(0, rub, 50, 60000), 'P1 walks to the rubble');
const resR0 = await ev('({ ...res })');
await ev('__press(0, 0)');
assert(await until(`!buildings[${rubIdx}].rubble`, 6000), 'X repairs the rubble');
const resR1 = await ev('({ ...res })');
const half = await ev(`halfCost(BLD['${rubKey}'].cost)`) || {};
let costOk = Object.keys(half).length > 0;
for (const [k, v] of Object.entries(half)) if (Math.abs((resR0[k] - resR1[k]) - v) > 2) costOk = false;
assert(costOk, 'repair charged half cost ± economy drift (' + JSON.stringify(half) + ')');

/* banner tent + army cap */
console.log('— banner tent + army cap —');
assert(await buildViaMenu('tent'), 'BANNER TENT built through the real menu');
assert(await until('goalI === 45', 6000), 'quest done: BUILD A BANNER TENT');
await ev('crates.splice(0); 0');
assert(await ev('armyCap()') === 9, 'army cap = 6 + 3 per tent (9)');
await ev("while (countArmy(0) < 9) spawnUnit('knight', 0, player.x + rnd(-60,60), player.y + rnd(-60,60)); 0");
const capIron = await ev('res.iron');
assert(await pressAt('stable', 38, 48, 'false', 2) === false, '(cap press made at the stable)');
assert(await ev('countArmy(0)') === 9, 'training denied at the cap (still 9/9)');
assert(await ev('res.iron') === capIron, 'no cost charged on a denied training');
await ev('(() => { let n = 0; war.units = war.units.filter(u => u.team !== 0 || UNIT[u.kind].hero || ++n <= 6); })()');

/* ═══════ scene 4: the WAR COUNCIL panel + difficulty ═══════ */
console.log('— war council difficulty —');
assert(await walkTo(0, "(() => { const b = buildings.find(b => b.key === 'wartable'); return { x: bldCX(b), y: bldCY(b) + 38 }; })()", 48), 'P1 walks to the WAR TABLE');
await ev('__press(0, 0)');
assert(await until("panelMode === 'war'", 5000), 'X opens the WAR COUNCIL panel');
assert(await ev('panelOwner') === 0, 'war panel owned by its opener (P1)');
await shot('cfw-wartable');
await ev('__press(0, 12)'); await sleep(600);               // up: STANDARD → GENTLE
await ev('__press(0, 0)'); await sleep(800);
assert(await ev("war.difficulty === 'gentle'"), 'council sets GENTLE via pad');
await settle();
await ev('war.raidT = 1; 0');
assert(await until('war.raid !== null', 15000), 'gentle raid musters');
const gentleN = await ev('war.raid.n0');
assert(gentleN <= 3, 'GENTLE raid is tiny (n0 ' + gentleN + ')');
await ev("if (war.raid) war.raid.t = 19.5; war.stance[0] = 'charge'; for (const u of war.units) if (u.team === 0) u.rt = 0; 0");
assert(await until('war.raid === null', 150000), 'gentle raid beaten');
const gentleGap = await ev('war.raidT');
assert(gentleGap > 300, 'GENTLE cadence is rare (next in ' + Math.round(gentleGap) + 's > 300s)');
await ev("war.difficulty = 'standard'; war.raidT = 1; 0");  // cadence/size comparison (panel path proven above)
assert(await until('war.raid !== null', 15000), 'standard raid musters');
const stdN = await ev('war.raid.n0');
assert(stdN > gentleN, 'STANDARD raid bigger than GENTLE (' + stdN + ' > ' + gentleN + ')');
await ev("if (war.raid) war.raid.t = 19.5; war.stance[0] = 'charge'; for (const u of war.units) if (u.team === 0) u.rt = 0; 0");
assert(await until('war.raid === null', 240000), 'standard raid beaten too');
const stdGap = await ev('war.raidT');
assert(stdGap < 241 && stdGap < gentleGap, 'STANDARD cadence quicker (' + Math.round(stdGap) + 's < ' + Math.round(gentleGap) + 's)');
assert(await ev('war.raidsRepelled') >= 3, 'every ended raid counts as repelled — no losing');
await ev("war.raidT = 9999; war.stance[0] = 'follow'; for (const u of war.units) if (u.team === 0) u.rt = 0; 0");

/* ═══════ scene 5: 2P — both bands, both horns ═══════ */
console.log('— 2P war —');
await ev('__press(1, 0)'); await sleep(1000);
assert(await ev('player2.active') === true, 'P2 joins mid-war');
assert(await walkTo(1, "(() => { const b = buildings.find(b => b.key === 'stable'); return { x: bldCX(b), y: bldCY(b) + 38 }; })()", 48), 'P2 walks to the stable');
let p2Trained = false;
for (let i = 0; i < 4 && !p2Trained; i++) { await ev('__press(1, 0)'); p2Trained = await until('war.units.some(u => u.team === 1)', 2500); }
assert(p2Trained, 'P2 trains a soldier of their own (blue band)');
const st0 = await ev('war.stance[0]');
await ev('__press(1, 4)'); await sleep(800);
assert(await ev("war.stance[1] === 'hold'") && await ev('war.stance[0]') === st0, "P2 horn is independent of P1's");
await ev('__press(1, 4)'); await sleep(700); await ev('__press(1, 4)'); await sleep(700);
assert(await ev("war.stance[1] === 'follow'"), 'P2 horn cycles back to FOLLOW');
/* P2 waves goodbye so the camera can follow P1's march west */
await ev('__hold(1, 1, true)');
assert(await until('player2.active === false', 8000), 'P2 leaves (their soldier keeps guarding home)');
await ev('__hold(1, 1, false)');

/* ═══════ scene 6: the kingdom fights with you — staging ═══════ */
console.log('— wizard + dragon prerequisites —');
await ev(`(() => { const c = freeTilesNear(player.x, player.y, 2)[0]; placeBuildingAt('wizardtower', c.tx, c.ty); })()`);
assert(await until("war.units.some(u => u.kind === 'wizard')", 15000), 'wizard tower standing → WIZZO joins the band');
await ev(`(() => { const c = freeTilesNear(player.x + 200, player.y, 2)[0]; placeBuildingAt('perch', c.tx, c.ty);
  dragonFound = true; dragonFriend = true; dragon.found = true; dragon.mode = 'follow';
  dragon.x = player.x + 80; dragon.y = player.y - 60; })()`);
assert(await ev("cnt('perch') === 1 && dragon.mode === 'follow'"), 'dragon perch + Sparky riding along (staged)');

/* ═══════ scene 7: CONQUEST — march west, beat Bramble for real ═══════ */
console.log('— the march on Bramble —');
assert(await ev('goalI === 45'), 'DEFEAT SIR BRAMBLE is the active quest');
/* muster a full band for the campaign (raids cost soldiers — retrain, like a real player) */
await ev(`res.food = 400; res.iron = 200; res.gold = 200; hudDirty = true;
  while (countArmy(0) < 8) spawnUnit(pick(['knight', 'knight', 'archer', 'cavalry']), 0, player.x + rnd(-90, 90), player.y + rnd(-90, 90)); 0`);
assert(await ev('countArmy(0)') >= 8, 'the band is mustered for war (8 strong)');
const bandCentroid = `(() => { let x=0,y=0,n=0; for (const u of war.units) if (u.team===0) { x+=u.x; y+=u.y; n++; }
  return n ? { x:x/n, y:y/n, n } : null; })()`;
assert(await walkTo(0, '({ x: 900, y: 1850 })', 80, 120000), 'P1 marches west into the Whisperwood');
await sleep(3000);
let cf = await ev(bandCentroid);
let pNow = await px();
assert(cf && Math.hypot(cf.x - pNow.x, cf.y - pNow.y) < 240, 'FOLLOW: the band marches with you (centroid ' + (cf ? Math.round(Math.hypot(cf.x - pNow.x, cf.y - pNow.y)) : '?') + 'px away)');
/* HOLD: anchor the band, walk away, band stays put */
await ev('__press(0, 4)'); await until("war.stance[0] === 'hold'", 4000);
await sleep(1000);
const held = await ev(bandCentroid);
await ev('__axis(0, 0, 1)'); await sleep(2600); await ev('__stop(0)');
const held2 = await ev(bandCentroid);
assert(Math.hypot(held2.x - held.x, held2.y - held.y) < 120, 'HOLD: the band stands its ground (moved ' + Math.round(Math.hypot(held2.x - held.x, held2.y - held.y)) + 'px while you walked 250px off)');
await ev('__press(0, 4)'); await until("war.stance[0] === 'charge'", 4000); await sleep(700);
await ev('__press(0, 4)'); await until("war.stance[0] === 'follow'", 4000); await sleep(700);   // back to follow for the approach
assert(await walkTo(0, '({ x: RIVALS.bramble.x + 340, y: RIVALS.bramble.y + 60 })', 80, 90000), "P1 arrives at Bramble's gates (outside tower range)");
await sleep(1500);
await shot('cfw-rivalkeep');
/* the garrison engages; the wizard's SPARKLE BLAST fires on the cluster */
let blasted = await until('(war.wizBlasts || 0) >= 1', 45000);
if (!blasted) {          // battle went too quick for the windup — stage a fresh cluster for the wizard
  await ev(`(() => { const w = war.units.find(u => u.kind === 'wizard'); const x = (w ? w.x : player.x) + 180, y = (w ? w.y : player.y);
    for (let i = 0; i < 3; i++) spawnUnit('raider', 2, x + rnd(-40, 40), y + rnd(-40, 40), 'bramble'); })()`);
  blasted = await until('(war.wizBlasts || 0) >= 1', 45000);
}
assert(blasted, 'wizard SPARKLE BLAST fires in the battle (windup → rainbow poof)');
/* CHARGE — and the dragon answers */
const kh0 = await ev('war.keepHP.bramble');
let charged = false;
for (let i = 0; i < 5 && !charged; i++) {
  await ev('__press(0, 4)');
  charged = await until("war.stance[0] === 'charge'", 2000);
  await sleep(700);
}
assert(charged, 'the horn sounds CHAAARGE at the gates');
assert(await until('war.flyover !== null', 8000), 'DRAGON FLYOVER triggers on CHARGE near the keep (perch owned)');
assert(await until('war.flyover && war.flyover.t > 2', 12000), 'Sparky mid-swoop');
await shot('cfw-flyover');
assert(await until('(war.flyoverHits || 0) >= 1', 15000), 'the swoop lands: rainbow-fire bonks the defenders');
assert(await until(`war.keepHP.bramble <= ${kh0} - 8 || war.conquered.includes('bramble')`, 10000), 'flyover bonked the keep (-8)');
await shot('cfw-battle');

/* sprite/op budget at the biggest staged moment */
console.log('— sprite budget (headless numbers; the Pi is the final judge) —');
await ev(`(() => {
  const P = CanvasRenderingContext2D.prototype;
  window.__ops = { fill: 0, stroke: 0, fillRect: 0, fillText: 0, drawImage: 0 };
  if (!P.__warWrapped) {
    P.__warWrapped = 1;
    for (const k of Object.keys(__ops)) { const o = P[k]; P[k] = function (...a) { window.__ops[k]++; return o.apply(this, a); }; }
  }
  window.__fcnt = 0;
  (function loop() { window.__fcnt++; requestAnimationFrame(loop); })();
})()`);
await ev('for (const k of Object.keys(__ops)) __ops[k] = 0; __fcnt = 0; window.__t0 = performance.now(); 0');
await sleep(2500);
const perf = await ev(`(() => { const el = performance.now() - __t0; const o = {};
  for (const k of Object.keys(__ops)) o[k] = Math.round(__ops[k] / Math.max(1, __fcnt));
  return { frames: __fcnt, ms: +(el / Math.max(1, __fcnt)).toFixed(1), ops: o,
    units: war.units.length, arrows: war.arrows.length, particles: particles.length }; })()`);
console.log('  units on field:', perf.units, '| arrows in flight:', perf.arrows, '| particles:', perf.particles);
console.log('  per-frame ops:', JSON.stringify(perf.ops), '| avg frame', perf.ms + 'ms over', perf.frames, 'frames (headless SwiftShader)');
assert(perf.units <= 51, 'unit count within the ~24/side budget (' + perf.units + ')');

/* finish the conquest — the royal sword joins the bonking (the designed kid path) */
let conquered = await until("war.conquered.includes('bramble')", 30000);
if (!conquered) {
  assert(await walkTo(0, '({ x: RIVALS.bramble.x + 74, y: RIVALS.bramble.y + 20 })', 40, 40000), 'P1 walks right up to the rival keep');
  for (let i = 0; i < 90 && !conquered; i++) {
    await ev('__press(0, 0)');
    conquered = await until("war.conquered.includes('bramble')", 900);
  }
}
assert(conquered, 'SIR BRAMBLE SURRENDERS — band + dragon + royal sword bonks win the day');
assert(await ev('scene') === 'play', 'surrender is a beat, not a scene change');
assert(await until('goalI === 46', 8000), 'quest done: DEFEAT SIR BRAMBLE');
await ev('crates.splice(0); 0');
assert(await ev('hats.includes(6)'), "Bramble's LEAF CAP granted");
const gold0 = await ev('res.gold');
await sleep(5000);
const gold1 = await ev('res.gold');
assert(gold1 > gold0, 'tribute trickle flows (+' + (gold1 - gold0).toFixed(2) + '🪙 with zero gold buildings)');
await sleep(2500);
await shot('cfw-surrender');

/* combat laws: the keep can NEVER be destroyed; fallen units retrain */
console.log('— combat laws —');
assert(await ev(`(() => { const kb = buildings.find(b => b.key === 'keep');
  for (let i = 0; i < 40; i++) damageBld(kb, 1);
  return !kb.rubble; })()`), 'your keep shrugged off 40 bonks — never destroyed');
const armyNow = await ev('countArmy(0)');
await ev("res.food = 200; res.iron = 100; res.gold = 100; hudDirty = true; trainUnit('knight', 0, player.x, player.y + 40); 0");
assert(await ev('countArmy(0)') === armyNow + 1, 'popped slots retrain — nothing is ever lost (army ' + armyNow + ' → ' + (armyNow + 1) + ')');

/* ═══════ scene 8: save round-trip with the war live ═══════ */
console.log('— war save round-trip —');
await ev('save(); 0');
const preSave = await ev("({ dif: war.difficulty, conq: war.conquered.length, tr: war.trained, army: countArmy(0) + countArmy(1) })");
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` }, sessionId);
await sleep(3000);
await ev('__press(0, 0)'); await sleep(2500);
assert(await ev('scene') === 'play' && await ev('war !== null'), 'reload + CONTINUE: war layer restored');
const postSave = await ev("({ dif: war.difficulty, conq: war.conquered.length, tr: war.trained, army: countArmy(0) + countArmy(1) })");
assert(postSave.dif === preSave.dif && postSave.conq === preSave.conq && postSave.tr === preSave.tr,
  'difficulty/conquests/trained persisted (' + JSON.stringify(postSave) + ')');
assert(postSave.army === preSave.army, 'the army marched through the save (' + preSave.army + ' → ' + postSave.army + ')');
assert(await ev("war.conquered.includes('bramble') && war.keepHP.bramble <= 0"), 'Bramble stays conquered');
await ev('war.raidT = 9999; 0');

/* ═══════ scene 9: Thistle + Cinder → THE PEACE FESTIVAL ═══════ */
console.log('— the realm becomes one —');
await ev('setAge(7)'); await sleep(700);
assert(await until("war.units.some(u => u.team === 2 && u.home === 'cinder')", 25000), "age 7: King Cinder's garrison appears");
assert(await until("war.units.some(u => u.kind === 'drake')", 30000), "Cinder's drake circles his keep");
await ev("for (let i = 0; i < 30 && !war.conquered.includes('thistle'); i++) hitKeep('thistle', 2); 0");
assert(await until("war.conquered.includes('thistle')", 6000), 'Lady Thistle surrenders (keep-bonk path)');
assert(await until('goalI === 47', 8000), 'quest done: DEFEAT LADY THISTLE');
await ev('crates.splice(0); 0');
await ev("for (let i = 0; i < 40 && !war.conquered.includes('cinder'); i++) hitKeep('cinder', 2); 0");
assert(await until("war.conquered.includes('cinder')", 6000), 'King Cinder surrenders (drake and all)');
assert(await ev('war.festival !== null'), 'all three lords beaten → THE PEACE FESTIVAL begins');
assert(await until('war.festival && war.festival.t > 2.5', 25000), 'fireworks over the kingdom');
await shot('cfw-festival');
assert(await until('war.festivalDone === true', 90000), 'THE REALM IS ONE — festival beat completes');
assert(await until('goalI === 49', 15000), 'all 49 quests done — free play forever');
assert(await ev('hats.length') >= 5, 'war hats collected (' + await ev('hats.length') + ' total)');
assert(await ev('scene') === 'play', 'still no game over — ever');

/* ═══════ scene 9b: max-load battle — the sprite/perf budget worst case ═══════ */
console.log('— max-load battle (24 vs 24) —');
await ev(`(() => {
  for (let i = 0; i < 24; i++) {
    const k = i < 12 ? 'knight' : i < 18 ? 'archer' : 'cavalry';
    spawnUnit(k, i % 2, player.x + rnd(-140, 140), player.y + rnd(-100, 100));
  }
  for (let i = 0; i < 24; i++) {
    const k = i % 3 === 2 ? 'rcav' : i % 3 === 1 ? 'rarcher' : 'raider';
    spawnUnit(k, 2, player.x + 260 + rnd(-80, 80), player.y + rnd(-140, 140), 'cinder');
  }
  war.stance[0] = 'charge'; war.stance[1] = 'charge';
  for (const u of war.units) u.rt = 0;
})()`);
await sleep(2500);
await ev(`(() => {          // fresh page context after the reload — re-install the op counters
  const P = CanvasRenderingContext2D.prototype;
  window.__ops = { fill: 0, stroke: 0, fillRect: 0, fillText: 0, drawImage: 0 };
  if (!P.__warWrapped) {
    P.__warWrapped = 1;
    for (const k of Object.keys(__ops)) { const o = P[k]; P[k] = function (...a) { window.__ops[k]++; return o.apply(this, a); }; }
  }
  window.__fcnt = 0;
  (function loop() { window.__fcnt++; requestAnimationFrame(loop); })();
})()`);
await ev('for (const k of Object.keys(__ops)) __ops[k] = 0; __fcnt = 0; window.__t0 = performance.now(); 0');
await sleep(3000);
const perf2 = await ev(`(() => { const el = performance.now() - __t0; const o = {};
  for (const k of Object.keys(__ops)) o[k] = Math.round(__ops[k] / Math.max(1, __fcnt));
  return { frames: __fcnt, ms: +(el / Math.max(1, __fcnt)).toFixed(1), ops: o,
    units: war.units.length, arrows: war.arrows.length, particles: particles.length }; })()`);
console.log('  MAX battle — units:', perf2.units, '| arrows:', perf2.arrows, '| particles:', perf2.particles);
console.log('  per-frame ops:', JSON.stringify(perf2.ops), '| avg frame', perf2.ms + 'ms over', perf2.frames, 'frames (headless SwiftShader)');
await shot('cfw-bigbattle');
assert(perf2.units >= 30, 'max battle actually staged (' + perf2.units + ' units on field)');
await ev('war.units = war.units.filter(u => u.team !== 2); 0');   // clear the staged enemies

/* ═══════ scene 10: touch layout + keyboard horn ═══════ */
console.log('— touch UI + keyboard —');
await ev("document.body.classList.add('input-touch'); document.body.classList.remove('input-kb'); 0");
await sleep(400);
assert(await ev("getComputedStyle(document.getElementById('tbHorn')).display") === 'flex', 'HORN button shows in the touch layout at war');
await shot('cfw-touch');
await ev("document.body.classList.remove('input-touch'); document.body.classList.add('input-kb'); 0");
await ev("war.stance[0] = 'follow'; 0");
await ev("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', bubbles: true })); 0");
await sleep(600);
assert(await ev("war.stance[0] === 'hold'"), 'keyboard H sounds the war horn');

console.log('— console errors —');
assert(errs.length === 0, 'zero console errors (' + errs.length + ')');
if (errs.length) console.log(errs.slice(0, 8));

console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILURES`);
chrome.kill(); srv.close(); process.exit(fails === 0 ? 0 : 1);
