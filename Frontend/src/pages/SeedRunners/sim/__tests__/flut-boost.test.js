// Flut (elements/flut.js) und Boost-Streifen (elements/boost.js) — neue Elemente vom 14.11.2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../world.js';
import { parseMap } from '../tilemap.js';
import { classTuning } from '../classes.js';
import { INPUT } from '../inputBits.js';
import { hashWorld } from '../hash.js';
import { normalizeParams, ELEMENT_SCHEMA } from '../elements/schema.js';
import { ELEMENT_TYPES } from '../elements/index.js';

/** Ebene Bahn: Boden in Zeile 12, Start bei Spalte 3; optional ein Checkpoint */
function bahn(entities, { w = 60, cp = null } = {}) {
  const rows = [];
  for (let y = 0; y < 16; y++) {
    let z = '';
    for (let x = 0; x < w; x++) z += y >= 12 ? '#' : (y === 11 && x === 3 ? 'S' : (y === 11 && x === cp ? 'C' : '.'));
    rows.push(z);
  }
  return createWorld(parseMap(rows, { entities }), { tuning: classTuning('normal') });
}
const lauf = (w, n, maske) => { for (let i = 0; i < n && !w.deaths && !w.finished; i++) stepWorld(w, maske); return w; };
const flut = (w) => w.elements.find((e) => e.type === 'flut');

test('Flut: schläft, bis man ihr Rechteck betritt — dann läuft sie nach der Verzögerung los und tötet, wen sie einholt', () => {
  // Wand von links nach rechts über die Spalten 8–40, 40 px/s (langsamer als Laufen, 140 px/s)
  const w = bahn([{ type: 'flut', tx: 8, ty: 6, w: 32, h: 6, dir: 'right', speed: 40, delay: 0.5 }]);
  lauf(w, 60, 0);
  assert.equal(flut(w).start, -1, 'ohne Betreten schläft sie');
  assert.equal(flut(w).voll, 0);
  // Hineinlaufen und stehen bleiben: Sie startet, wartet die Verzögerung ab, holt einen ein
  lauf(w, 80, INPUT.RIGHT);
  assert.ok(flut(w).start >= 0, 'ausgelöst');
  const startTick = flut(w).start;
  lauf(w, 30, 0);
  assert.equal(w.deaths, 0, 'in der Verzögerung passiert nichts');
  lauf(w, 2400, 0);
  assert.equal(w.deaths, 1);
  assert.equal(w.deathReason, 'flut');
  // Nach dem Tod (Neustart am Start, vor der Flut) schläft sie wieder
  assert.equal(flut(w).start, -1, `nach dem Tod schläft die Flut wieder (ausgelöst war sie bei Tick ${startTick})`);
});

test('Flut: wer weiterläuft, entkommt einer langsameren Front; ist das Rechteck voll, bleibt sie stehen', () => {
  const w = bahn([{ type: 'flut', tx: 8, ty: 6, w: 20, h: 6, dir: 'right', speed: 60, delay: 0.2 }]);
  lauf(w, 600, INPUT.RIGHT);
  assert.equal(w.deaths, 0, 'schneller als die Front');
  lauf(w, 1200, 0);
  assert.equal(flut(w).voll, 20 * 16, 'voll und nicht weiter');
  assert.equal(w.deaths, 0, 'hinter dem Rechteck ist man sicher');
});

test('Flut nach oben steigt wie Lava vom Boden des Rechtecks', () => {
  // Das Rechteck reicht zwei Zeilen unter die Lauffläche (in den Boden hinein): Die Lava braucht einen Moment bis zu den Füßen
  const w = bahn([{ type: 'flut', tx: 6, ty: 4, w: 10, h: 10, dir: 'up', speed: 30, delay: 0 }]);
  let ausgeloest = -1;
  for (let t = 0; t < 400 && !w.deaths; t++) {
    stepWorld(w, t < 60 ? INPUT.RIGHT : 0);
    if (ausgeloest < 0 && flut(w).start >= 0) ausgeloest = t;
  }
  assert.ok(ausgeloest >= 0, 'beim Betreten ausgelöst');
  assert.equal(w.deaths, 1);
  assert.equal(w.deathReason, 'flut');
  // 2 Zeilen = 32 px bei 30 px/s: gut eine Sekunde nach dem Auslösen
  assert.ok(w.tick - ausgeloest > 100, `eingeholt nach ${w.tick - ausgeloest} Ticks`);
});

test('Flut: ein Checkpoint VOR der Flut setzt sie zurück, der Lauf bleibt bitgleich wiederholbar', () => {
  const baue = () => bahn([{ type: 'flut', tx: 14, ty: 6, w: 30, h: 6, dir: 'right', speed: 50, delay: 0.3 }], { cp: 8 });
  const a = baue();
  const b = baue();
  const eingabe = (t) => (t < 160 ? INPUT.RIGHT : 0);
  const hashes = [];
  for (let t = 0; t < 1500; t++) {
    stepWorld(a, eingabe(t));
    stepWorld(b, eingabe(t));
    if (t % 100 === 0) hashes.push([hashWorld(a), hashWorld(b)]);
  }
  for (const [x, y] of hashes) assert.equal(x, y);
  assert.ok(a.deaths >= 1, 'eingeholt');
  assert.equal(a.checkpointIndex, 1);
  assert.equal(flut(a).start, -1, 'nach dem Respawn am Checkpoint schläft sie');
});

test('Boost-Streifen: gibt am Boden Tempo in seine Richtung, das sich danach abbaut; ein Sprung vom Streifen trägt weiter', () => {
  const max = classTuning('normal').runMaxSpeed ?? 140;
  const mit = bahn([8, 9, 10].map((tx) => ({ type: 'boost', tx, ty: 11, dir: 'right' })));
  const ohne = bahn([]);
  let spitze = 0;
  for (let t = 0; t < 200; t++) {
    // (Absprung erst AUF dem Streifen, Spalten 8–10 — vorher gesprungen flöge man darüber hinweg)
    const m = INPUT.RIGHT | (t >= 86 && t < 126 ? INPUT.JUMP : 0);
    stepWorld(mit, m);
    stepWorld(ohne, m);
    spitze = Math.max(spitze, mit.player.vx);
  }
  assert.ok(spitze > max * 2, `Spitzentempo ${spitze}`);
  assert.ok(mit.player.x > ohne.player.x + 40, `mit Streifen ${mit.player.x.toFixed(0)}, ohne ${ohne.player.x.toFixed(0)}`);
  // …und am Ende läuft man wieder im normalen Tempo
  for (let t = 0; t < 240; t++) stepWorld(mit, INPUT.RIGHT);
  assert.ok(Math.abs(mit.player.vx - (classTuning('normal').runMaxSpeed ?? 140)) < 1, `Tempo ${mit.player.vx}`);
});

test('Boost-Streifen nach links bremst nicht den, der schon schneller ist, und wirkt nur am Boden', () => {
  const w = bahn([{ type: 'boost', tx: 20, ty: 9, dir: 'right' }]);     // schwebt zwei Kacheln über dem Boden
  let spitze = 0;
  for (let t = 0; t < 300; t++) { stepWorld(w, INPUT.RIGHT); spitze = Math.max(spitze, w.player.vx); }
  assert.ok(spitze <= 141, `ohne Bodenkontakt kein Boost (Spitze ${spitze})`);
});

test('Schema: Flut und Boost-Streifen sind eingetragen, stehen am Ende der Liste und weisen Unsinn ab', () => {
  const typen = Object.keys(ELEMENT_SCHEMA);
  assert.deepEqual(typen.slice(-2), ['flut', 'boost'], 'neue Typen ans Ende (kanonische Reihenfolge bestehender Level)');
  for (const t of ['flut', 'boost']) assert.ok(ELEMENT_TYPES[t], `${t} fehlt im Register`);
  assert.equal(normalizeParams('flut', { type: 'flut', tx: 1, ty: 1, w: 6, h: 4, dir: 'right', speed: 80 }).ok, true);
  assert.equal(normalizeParams('flut', { type: 'flut', tx: 1, ty: 1, speed: 0 }).ok, false);
  assert.equal(normalizeParams('flut', { type: 'flut', tx: 1, ty: 1, dir: 'upLeft' }).ok, false);
  assert.equal(normalizeParams('boost', { type: 'boost', tx: 1, ty: 1, dir: 'left' }).ok, true);
  assert.equal(normalizeParams('boost', { type: 'boost', tx: 1, ty: 1, factor: 9 }).ok, false);
});
