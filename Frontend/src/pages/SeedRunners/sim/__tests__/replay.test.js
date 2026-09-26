// Tests des Nachspielens (sim/replay.js): Ein aufgezeichneter Lauf ergibt beim Abspielen bit-genau denselben
// Zustand — das ist die Grundlage des serverseitigen Anti-Cheats (Backend/seedRunners/replay.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_BY_ID, generateSingle, createLevelWorld } from '../../gen/index.js';
import { solveLevel } from '../../gen/solver.js';
import { stepWorld } from '../world.js';
import { hashWorld } from '../hash.js';
import { createReplay, runReplay } from '../replay.js';
import { createInputLog } from '../../room/inputLog.js';
import { SIM_FINGERPRINT, GEN_FINGERPRINT, ENGINE_FINGERPRINT } from '../../version.js';

test('createReplay: vor dem ersten Eintrag Maske 0, dann der jeweils letzte Wechsel', () => {
  const at = createReplay([5, 1, 10, 3, 10, 7, 20, 0]);
  assert.equal(at(0), 0);
  assert.equal(at(4), 0);
  assert.equal(at(5), 1);
  assert.equal(at(9), 1);
  assert.equal(at(10), 7, 'zwei Wechsel im selben Tick: der letzte gilt');
  assert.equal(at(19), 7);
  assert.equal(at(500), 0);
  assert.equal(createReplay([])(123), 0);
});

test('Ein aufgezeichneter Lauf wird bit-genau nachgespielt (Zielzeit, Tode, Zustands-Hash)', () => {
  const level = generateSingle(CHUNK_BY_ID['spring-diagonal'], { seed: 'replay', length: 'short', speedClass: 'normal', biome: 'meadow' });
  const solved = solveLevel(level);
  assert.ok(solved.solved);

  // Lauf wie im Browser aufzeichnen: pro Tick abtasten, aufzeichnen, dann Sim-Schritt
  const live = createLevelWorld(level);
  const log = createInputLog();
  for (const mask of solved.inputs) {
    log.record(live.tick, mask);
    stepWorld(live, mask);
    if (live.finished) break;
  }
  assert.ok(live.finished);

  const replayed = createLevelWorld(level);
  const res = runReplay(replayed, log.toArray(), live.finishTick + 1);
  assert.equal(res.finished, true);
  assert.equal(res.ticks, live.finishTick);
  assert.equal(res.deaths, live.deaths);
  assert.equal(hashWorld(replayed), hashWorld(live));
});

test('runReplay bricht bei maxTicks ab und meldet "nicht im Ziel"', () => {
  const level = generateSingle(CHUNK_BY_ID['gap-small'], { seed: 'replay2', length: 'short', speedClass: 'normal', biome: 'meadow' });
  const world = createLevelWorld(level);
  const res = runReplay(world, [], 240);
  assert.equal(res.finished, false);
  assert.equal(res.ticks, null);
  assert.equal(res.tick, 240);
});

test('Die drei Fingerprints sind 16-stellige Hex-Werte (erzeugt von simSpiegel.js) und verschieden', () => {
  for (const fp of [SIM_FINGERPRINT, GEN_FINGERPRINT, ENGINE_FINGERPRINT]) assert.match(fp, /^[0-9a-f]{16}$/);
  // sim, gen und "alles" sind verschiedene Texte, ihre Hashes also auch
  assert.equal(new Set([SIM_FINGERPRINT, GEN_FINGERPRINT, ENGINE_FINGERPRINT]).size, 3);
});
