// Tests der Replay-Prüfung (replay.js): Ein echter, vom Solver erzeugter Lauf besteht — und jede
// Abweichung (Zeit, Log, Version) wird erkannt. Die Sim ist die GESPIEGELTE aus seedRunners/engine,
// dieselbe, die der Server im Betrieb benutzt.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { verifyRun, loadEngine } = require('../replay');

const toLog = (inputs) => {
  const log = [];
  let last = 0;
  inputs.forEach((mask, tick) => {
    if (mask !== last) {
      log.push(tick, mask);
      last = mask;
    }
  });
  return log;
};

// Ein Mini-Level (Start · Chunk · Ziel) und ein vom Solver gefundener Weg hindurch
async function solvedRun(chunkId) {
  const engine = await loadEngine();
  const solver = await import(pathToFileURL(path.join(__dirname, '..', 'engine', 'gen', 'solver.js')).href);
  const level = engine.generateSingle(engine.CHUNK_BY_ID[chunkId], { seed: 'antiCheat', length: 'short', speedClass: 'normal', biome: 'meadow' });
  const result = solver.solveLevel(level);
  assert.ok(result.solved, `${chunkId} vom Solver gelöst`);
  return { engine, level, ticks: result.ticks, log: toLog(result.inputs) };
}

test('Ein echter Lauf wird bestätigt: Zeit, Tode und Checkpoints kommen aus dem Nachspielen', async () => {
  const { engine, level, ticks, log } = await solvedRun('crumble-stairs');
  const res = await verifyRun({ params: level.params, log, ticks, fp: engine.ENGINE_FINGERPRINT }, { makeLevel: () => level });
  assert.equal(res.status, 'ok');
  assert.equal(res.ticks, ticks);
  assert.equal(res.deaths, 0);
  assert.ok(Array.isArray(res.splits));
  assert.ok(res.ms >= 0);
});

test('Jede Abweichung wird erkannt: falsche Zeit, manipuliertes, leeres oder abgeschnittenes Log', async () => {
  // 'spike-gauntlet' statt 'spring-diagonal': Der gelöste Weg braucht laufend wechselnde Eingaben
  // (Sprünge über eine Reihe von Spikes), ein Viertel davon reicht nie bis zum Ziel — bei
  // 'spring-diagonal' konnte das (seit Dash nur noch über Kristalle auflädt, siehe player.js) der
  // Solver mit einem fast durchgehend gehaltenen Eingabe-Zustand lösen, wodurch selbst ein stark
  // gekürztes Log zufällig noch ins Ziel "hielt" — kein Sicherheitsproblem (weiterhin bit-genaues,
  // deterministisches Nachspielen), aber ein zu schwacher Test für genau diese Behauptung.
  const { engine, level, ticks, log } = await solvedRun('spike-gauntlet');
  const job = { params: level.params, log, ticks, fp: engine.ENGINE_FINGERPRINT };
  const opts = { makeLevel: () => level };

  assert.equal((await verifyRun(job, opts)).status, 'ok');
  for (const wrong of [ticks - 1, ticks + 1, ticks + 120, 60]) {
    const res = await verifyRun({ ...job, ticks: wrong }, opts);
    assert.equal(res.status, 'invalid', `behauptete Zeit ${wrong}`);
  }
  const tampered = log.slice();
  tampered[1] = 0;                                       // erste Eingabe gestrichen: man läuft nie los
  assert.equal((await verifyRun({ ...job, log: tampered }, opts)).status, 'invalid');
  assert.equal((await verifyRun({ ...job, log: [] }, opts)).status, 'invalid');
  assert.equal((await verifyRun({ ...job, log: log.slice(0, Math.floor(log.length / 2 / 2) * 2) }, opts)).status, 'invalid');
});

test('Unbrauchbare Eingaben werden abgelehnt, ohne zu rechnen oder abzustürzen', async () => {
  const engine = await loadEngine();
  const base = { params: { seed: 'x', length: 'short', speedClass: 'normal', biome: 'meadow' }, fp: engine.ENGINE_FINGERPRINT };
  for (const bad of [{ log: [1, 2, 3], ticks: 500 }, { log: 'nope', ticks: 500 }, { log: [], ticks: 0 }, { log: [], ticks: 1.5 }, { log: [], ticks: 10 ** 9 }]) {
    const res = await verifyRun({ ...base, ...bad });
    assert.equal(res.status, 'invalid', JSON.stringify(bad).slice(0, 40));
  }
});

test('Anderer Sim-Stand (Fingerprint) oder keiner: nicht geprüft, nicht bestraft', async () => {
  const { level, ticks, log } = await solvedRun('gap-small');
  for (const fp of ['ffffffffffffffff', '', undefined]) {
    const res = await verifyRun({ params: level.params, log, ticks, fp }, { makeLevel: () => level });
    assert.equal(res.status, 'skipped', String(fp));
    assert.equal(res.reason, 'version');
  }
});

test('Mit echtem Generator: Das Level entsteht aus den Parametern, ein leeres Log führt nicht ins Ziel', async () => {
  const engine = await loadEngine();
  for (const params of [
    { seed: 'daily-2026-09-21', length: 'medium', speedClass: 'normal', biome: 'random' },
    { seed: 'abc', length: 'short', speedClass: 'super', biome: 'ice' },
    { seed: 'abc', length: 'short', speedClass: 'super', biome: 'ice' },   // zweites Mal: aus dem Zwischenspeicher
  ]) {
    const res = await verifyRun({ params, log: [], ticks: 5000, fp: engine.ENGINE_FINGERPRINT });
    assert.equal(res.status, 'invalid');
    assert.match(res.reason, /Ziel/);
  }
});

test('Die Sim im Backend ist dieselbe wie im Frontend: gleicher Level-Hash für dieselben Parameter', async () => {
  const engine = await loadEngine();
  const front = await import(pathToFileURL(path.join(__dirname, '..', '..', '..', 'Frontend', 'src', 'pages', 'SeedRunners', 'gen', 'index.js')).href);
  for (const params of [
    { seed: 'daily-2026-09-21', length: 'medium', speedClass: 'normal', biome: 'random' },
    { seed: '42', length: 'long', speedClass: 'fast', biome: 'factory' },
  ]) {
    assert.equal(engine.generateLevel(params).hash, front.generateLevel(params).hash);
  }
});

// ── Eigene Level (Editor-Verifizierung) ──────────────────────────────────────

const INPUT_RIGHT = 2;

/** Ein kurzes ebenes Level aus dem Editor-Modul und ein Lauf, der es gewinnt: nur nach rechts halten */
async function customRun(opts = {}) {
  const engine = await loadEngine();
  const doc = engine.emptyDoc({ width: opts.width ?? 40, height: 20 });
  if (opts.mutate) opts.mutate(doc);
  const res = engine.validateDoc(doc, { smoke: false });
  assert.ok(res.ok, res.errors?.join(' | '));
  const log = [opts.startAt ?? 0, INPUT_RIGHT];
  const replayed = engine.runReplay(engine.createLevelWorld(res.level), log, 20000);
  assert.ok(replayed.finished, 'der Testlauf erreicht das Ziel');
  return { engine, doc: res.doc, hash: res.hash, log, ticks: replayed.ticks, deaths: replayed.deaths };
}

test('Eigenes Level: ein echter Lauf wird bestätigt (SIM_FINGERPRINT), Zeit und Tode kommen aus dem Nachspielen', async () => {
  const { engine, doc, hash, log, ticks } = await customRun();
  const res = await verifyRun({ kind: 'custom', doc, hash, log, ticks, fp: engine.SIM_FINGERPRINT });
  assert.equal(res.status, 'ok');
  assert.equal(res.ticks, ticks);
  assert.equal(res.deaths, 0);
});

test('Eigenes Level: der Generator-Stand zählt nicht — nur die Physik (SIM) entscheidet über "nicht geprüft"', async () => {
  const { engine, doc, hash, log, ticks } = await customRun();
  assert.notEqual(engine.SIM_FINGERPRINT, engine.ENGINE_FINGERPRINT);
  const job = { kind: 'custom', doc, hash, log, ticks };
  assert.equal((await verifyRun({ ...job, fp: engine.ENGINE_FINGERPRINT })).status, 'skipped', 'ENGINE-Fingerprint ist der falsche für ein eigenes Level');
  for (const fp of ['ffffffffffffffff', '', undefined]) assert.equal((await verifyRun({ ...job, fp })).status, 'skipped');
});

test('Eigenes Level: falsche Zeit, kein Ziel, manipuliertes Log, fremder Hash, ungültiges Dokument', async () => {
  const { engine, doc, hash, log, ticks } = await customRun();
  const job = { kind: 'custom', doc, hash, log, ticks, fp: engine.SIM_FINGERPRINT };
  for (const wrong of [ticks - 1, ticks + 1, ticks + 120]) assert.equal((await verifyRun({ ...job, ticks: wrong })).status, 'invalid', `Zeit ${wrong}`);
  assert.equal((await verifyRun({ ...job, log: [] })).status, 'invalid', 'leeres Log: nie im Ziel');
  assert.equal((await verifyRun({ ...job, log: [0, 1] })).status, 'invalid', 'läuft nach links');

  const other = await customRun({ mutate: (d) => { d.tiles[5] = d.tiles[5].slice(0, 10) + '#' + d.tiles[5].slice(11); } });   // schwebender Block, behindert den Lauf nicht
  assert.notEqual(other.hash, hash);
  const wrongHash = await verifyRun({ ...job, hash: other.hash });
  assert.equal(wrongHash.status, 'invalid');
  assert.match(wrongHash.reason, /Hash/);

  const broken = await verifyRun({ ...job, doc: { ...doc, tiles: doc.tiles.slice(1) } });
  assert.equal(broken.status, 'invalid');
  assert.match(broken.reason, /ungültig/);
  assert.equal((await verifyRun({ ...job, doc: null })).status, 'invalid');
});

test('Eigenes Level: das Zeitlimit von 20 Minuten gilt', async () => {
  const { CUSTOM_MAX_TICKS } = require('../replay');
  const { engine, doc, hash, log } = await customRun();
  const base = { kind: 'custom', doc, hash, log, fp: engine.SIM_FINGERPRINT };
  assert.equal(CUSTOM_MAX_TICKS, 120 * 60 * 20);
  const over = await verifyRun({ ...base, ticks: CUSTOM_MAX_TICKS + 1 });
  assert.equal(over.status, 'invalid');
  assert.match(over.reason, /20 Minuten/);
  assert.equal((await verifyRun({ ...base, ticks: 0 })).status, 'invalid');
  assert.equal((await verifyRun({ ...base, ticks: 1.5 })).status, 'invalid');
});

test('Ein Seed-Auftrag bleibt beim ENGINE-Fingerprint, auch nach der Erweiterung um eigene Level', async () => {
  const engine = await loadEngine();
  const res = await verifyRun({ params: { seed: 'x', length: 'short', speedClass: 'normal', biome: 'meadow' }, log: [], ticks: 5000, fp: engine.SIM_FINGERPRINT });
  assert.equal(res.status, 'skipped', 'SIM-Fingerprint reicht für ein Seed-Level nicht');
});

// Phase D: Für Pfad-Parameter baut die Prüfung das Pfad-Level (dasselbe wie der Browser, gen/index.js levelFuerParams) —
// ein Log, das nicht ins Ziel führt, fällt durch, ein fremder Fingerprint wird übersprungen.
test('Phase D: Pfad-Runden werden mit dem Pfad-Level nachgespielt', async () => {
  const engine = await loadEngine();
  const params = { seed: 'phase-d', length: 'long', speedClass: 'super', biome: 'random', gen: 'pfad' };
  const level = engine.levelFuerParams(params);
  assert.equal(level.version, 3, 'Pfad-Level (Weltgenerator v3)');
  assert.equal(engine.levelFuerParams({ ...params, length: 'short', speedClass: 'normal' }).hash, level.hash, 'Länge/Tempo lassen sich nicht unterschieben');
  const res = await verifyRun({ params, log: [0, 2, 60, 0], ticks: 500, fp: engine.ENGINE_FINGERPRINT });
  assert.equal(res.status, 'invalid');
  assert.match(res.reason, /führt nicht ins Ziel/);
  const alt = await verifyRun({ params, log: [0, 2], ticks: 500, fp: 'veraltet' });
  assert.equal(alt.status, 'skipped');
});

// Phase D, die eigentliche Zusage: Ein ECHTER Lauf durch ein Live-Pfad-Level (die geplanten Züge nacheinander gespielt,
// zum Schluss auf die Zielmarke) besteht die Prüfung — mit genau seiner Zeit. Ein Tick weniger behauptet fällt durch.
test('Phase D: ein echter Lauf durch ein Pfad-Level besteht die Server-Prüfung', async () => {
  const engine = await loadEngine();
  const imp = (rel) => import(pathToFileURL(path.join(__dirname, '..', 'engine', rel)).href);
  const { WELT_BAU } = await imp('gen/world/generate.js');
  const { WEGE } = await imp('gen/world/typen/pfad.js');
  const { zugEingabe, zugFertig } = await imp('gen/world/pfad/zuege.js');
  const { stepWorld } = await imp('sim/world.js');
  const { INPUT } = await imp('sim/inputBits.js');
  const params = { seed: 'phase-d', length: 'long', speedClass: 'super', biome: 'random', gen: 'pfad' };
  const level = engine.levelFuerParams(params);
  const { schritte } = WEGE.get(WELT_BAU.get(level));
  const welt = engine.createLevelWorld(level);
  const masken = [];
  const schritt = (m) => { masken.push(m); stepWorld(welt, m); };
  for (const s of schritte) {
    const ein = zugEingabe(s.zug, s.kanteX);
    const z = {};
    for (let t = 0; t < 3000; t++) { schritt(ein(welt, t, z)); if (welt.finished || welt.deaths || zugFertig(welt, t, z)) break; }
    if (welt.finished || welt.deaths) break;
  }
  const ziel = level.meta.finish[1] || level.meta.finish[0];
  for (let t = 0; t < 600 && !welt.finished; t++) schritt((welt.player.x + 5) / 16 < ziel.x ? INPUT.RIGHT : INPUT.LEFT);
  assert.ok(welt.finished && welt.deaths === 0, 'der gespielte Lauf kommt ohne Tod ins Ziel');
  const log = toLog(masken);
  const ok = await verifyRun({ params, log, ticks: welt.finishTick, fp: engine.ENGINE_FINGERPRINT });
  assert.equal(ok.status, 'ok', ok.reason);
  assert.equal(ok.ticks, welt.finishTick);
  const falsch = await verifyRun({ params, log, ticks: welt.finishTick - 1, fp: engine.ENGINE_FINGERPRINT });
  assert.equal(falsch.status, 'invalid');
});
