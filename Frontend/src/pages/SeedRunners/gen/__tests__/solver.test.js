// Solver-Tests: Der Solver ist das Werkzeug, das die Lösbarkeit der Chunks belegt. Hier laufen nur
// wenige, schnelle Fälle als Regressionsschutz; den vollständigen Durchlauf über alle Chunks und
// Tempo-Klassen macht `npm run seedrunners:solve` (dauert einige Minuten).

import test from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_BY_ID, generateSingle, generateLevel, createLevelWorld } from '../index.js';
import { solveLevel, cloneWorld, STEP_TICKS } from '../solver.js';
import { stepWorld } from '../../sim/world.js';
import { hashWorld } from '../../sim/hash.js';
import { createTestMap } from '../../sim/testMap.js';
import { createWorld } from '../../sim/world.js';
import { SPEED_CLASS_IDS } from '../../sim/classes.js';
import { INPUT } from '../../sim/inputBits.js';
import { generateWorld } from '../world/generate.js';

test('cloneWorld: Kopie und Vorlage entwickeln sich identisch, ohne sich gegenseitig zu stören', () => {
  const level = generateLevel({ seed: 'klon', length: 'short', speedClass: 'normal', biome: 'factory' });
  const a = createLevelWorld(level);
  for (let t = 0; t < 300; t++) stepWorld(a, INPUT.RIGHT | (t % 50 === 0 ? INPUT.JUMP : 0));
  const b = cloneWorld(a);
  assert.equal(hashWorld(a), hashWorld(b));
  for (let t = 0; t < 400; t++) {
    const mask = INPUT.RIGHT | (t % 37 === 0 ? INPUT.JUMP : 0) | (t % 91 === 0 ? INPUT.DASH : 0);
    stepWorld(a, mask);
    stepWorld(b, mask);
    assert.equal(hashWorld(a), hashWorld(b), `Abweichung bei Tick ${t}`);
  }
  // Die Kopie zu verändern darf die Vorlage nicht anfassen
  const before = hashWorld(a);
  for (let t = 0; t < 100; t++) stepWorld(b, INPUT.LEFT);
  assert.equal(hashWorld(a), before);
});

test('cloneWorld funktioniert auch mit der Testkarte (Grapple, Checkpoints)', () => {
  const a = createWorld(createTestMap());
  const b = cloneWorld(a);
  for (let t = 0; t < 500; t++) {
    stepWorld(a, INPUT.RIGHT | (t % 60 === 0 ? INPUT.JUMP : 0));
    stepWorld(b, INPUT.RIGHT | (t % 60 === 0 ? INPUT.JUMP : 0));
  }
  assert.equal(hashWorld(a), hashWorld(b));
});

test('Solver findet gültige Wege: gefundene Eingaben, frisch abgespielt, enden im Ziel ohne Tod', () => {
  // Je ein Chunk aus jeder Familie; die Suche ist deterministisch, das Ergebnis also stabil.
  const ids = ['gap-small', 'wall-shaft', 'grapple-pit', 'key-door', 'portal-hop', 'laser-gates', 'moving-h', 'gravity-ceiling'];
  for (const id of ids) {
    const level = generateSingle(CHUNK_BY_ID[id], { seed: 'solver-test', length: 'short', speedClass: 'normal', biome: 'meadow' });
    const result = solveLevel(level);
    assert.ok(result.solved, `${id} nicht gelöst (weiteste Stelle ${JSON.stringify(result.reached)})`);

    // Unabhängig nachspielen — nicht dem Rückgabewert des Solvers glauben
    const w = createLevelWorld(level);
    for (const mask of result.inputs) {
      stepWorld(w, mask);
      if (w.finished) break;
    }
    assert.ok(w.finished, `${id}: Nachspielen endet nicht im Ziel`);
    assert.equal(w.deaths, 0, `${id}: Nachspielen mit Tod`);
    assert.equal(result.inputs.length % STEP_TICKS, 0);
  }
});

test('Solver meldet einen unlösbaren Chunk als unlösbar (kein Schönreden)', () => {
  const level = generateSingle(CHUNK_BY_ID['gap-small'], { seed: 'x', length: 'short', speedClass: 'normal' });
  // Der Boden nach der Lücke wird weggenommen: Das Ziel liegt im Nichts.
  const p = level.placements[1];
  const rows = level.rows.map((r, y) => (y >= p.dy + p.entry ? r.slice(0, p.x0 + 10) + '.'.repeat(r.length - p.x0 - 10) : r));
  const solved = solveLevel({ ...level, rows }, { beam: 60, maxSteps: 60 });
  assert.equal(solved.solved, false);
});

test('Solver kommt in allen drei Tempo-Klassen durch einen gedehnten Lücken-Chunk', () => {
  for (const speedClass of SPEED_CLASS_IDS) {
    const level = generateSingle(CHUNK_BY_ID['gap-double'], { seed: `k-${speedClass}`, length: 'short', speedClass });
    assert.ok(solveLevel(level).solved, speedClass);
  }
});

// Der Bewegungsgraph allein hat einmal jeden Turm für lösbar erklärt, obwohl der Schacht in jeder Kammer
// von deren Boden gedeckelt war. Nur ein Durchspielen beweist es: ganze Türme, ohne Dash am Start
// (Dash gibt es nur über Kristalle), mit dem Umweg-Abstand, der dem Solver den Weg nach oben zeigt.
test('Solver löst ganze Türme von unten bis oben (ohne Start-Dash)', () => {
  for (const [seed, speedClass, difficulty] of [['tu-0', 'normal', 3], ['tu-1', 'super', 1], ['tu-2', 'fast', 5]]) {
    const lv = generateWorld({ seed, length: 'short', speedClass, difficulty, worldType: 'turm', kernidee: null });
    const r = solveLevel({ params: lv.params, rows: lv.rows, entities: lv.entities }, { geo: true, startDash: 0, maxSteps: 1600 });
    assert.ok(r.solved, `${seed}/${speedClass}/S${difficulty}: nicht gelöst (weiteste Stelle ${JSON.stringify(r.reached)})`);
  }
});

// Schlüssel und Tür in einem LANGEN Level: Wer den Schlüssel nimmt, wechselt das Teilziel vom nahen Schlüssel zum
// fernen Ziel, und die Punktzahl fällt um fast die Restdistanz. Mit einem festen Bonus von 2000 blieb die Suche
// deshalb neben dem Schlüssel stehen (Parcours sp-2 und Höhlen ho-0 blieben als Ganzes ungelöst, obwohl jede
// Teilstrecke ging). Der Bonus wächst jetzt mit der Startdistanz; das Testlevel ist mit dem alten Wert unlösbar.
test('Solver nimmt den Schlüssel auch dann, wenn das Ziel weit weg ist', () => {
  const W = 260;
  const grid = Array.from({ length: 16 }, () => Array(W).fill('.'));
  for (let x = 0; x < W; x++) for (let y = 12; y < 16; y++) grid[y][x] = '#';
  for (let x = 10; x < 14; x++) grid[9][x] = '#';        // Plattform mit dem Schlüssel, 3 Zeilen über dem Boden
  grid[8][11] = 'K';
  for (let y = 0; y < 8; y++) grid[y][30] = '#';         // Wand über der Tür: kein Drüberspringen
  for (let y = 8; y < 12; y++) grid[y][30] = 'Y';
  grid[11][2] = 'S';
  for (let i = 0; i < 3; i++) grid[11][W - 6 + i] = 'E';
  const r = solveLevel({ params: { speedClass: 'normal' }, rows: grid.map((row) => row.join('')), entities: [] }, { geo: true, startDash: 0, beam: 150, maxSteps: 900 });
  assert.ok(r.solved, `nicht gelöst (weiteste Stelle ${JSON.stringify(r.reached)})`);
});
