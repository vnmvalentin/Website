// Generierte Level durch das Dokument-Format: "kein zweites System". Ein prozedurales Level, in ein Dokument
// verwandelt, geprüft, kanonisiert und zurück in ein Engine-Level, muss sich TICK FÜR TICK gleich verhalten.
//
// Vergleichen lässt sich nicht mit hashWorld: Die Elementreihenfolge ist im Dokument kanonisch sortiert, und
// hashWorld hängt an der Reihenfolge (auch an Index-Feldern wie `i`, `mate`, `group`). Deshalb ein Digest, der
// jedes Element unter "Typ@Ort" einsortiert und die Index-Felder weglässt. Dass die Reihenfolge das Verhalten
// nicht ändert, ist genau das, was hier bewiesen wird.
//
// Damit auch späte Elemente drankommen, wird die Figur alle 150 Ticks an eine zufällige Bodenstelle gesetzt;
// dazwischen laufen Zufallseingaben.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel } from '../../gen/index.js';
import { createLevelWorld } from '../../sim/levelWorld.js';
import { stepWorld, warpPlayer } from '../../sim/world.js';
import { hashNumbers } from '../../sim/hash.js';
import { createRng } from '../../sim/rng.js';
import { TILE, PLAYER_H } from '../../sim/config.js';
import { INPUT } from '../../sim/inputBits.js';
import { levelToDoc } from '../format.js';
import { validateDoc } from '../validate.js';

// Generierte Level sind größer als die Grenzen für eigene Level erlauben
const BIG = { maxWidth: 10_000, maxHeight: 1000, maxElements: 5000, maxBytes: 5_000_000, maxCheckpoints: 200, maxAnchors: 1000, maxFinish: 100 };

const INDEX_FIELDS = new Set(['i', 'mate', 'group']);

function digest(world) {
  const p = world.player;
  const head = hashNumbers([
    world.tick, world.checkpointIndex, world.deaths, world.finished ? 1 : 0, world.flags.sw, world.flags.keys,
    p.x, p.y, p.vx, p.vy, p.facing, p.gd, p.coyote, p.jumpBuffer, p.wallLock, p.dashCharges, p.dashTimer, p.airJumps, p.onGround ? 1 : 0,
  ]);
  const els = world.elements.map((el) => {
    const nums = [];
    for (const k of Object.keys(el).sort()) {
      if (INDEX_FIELDS.has(k)) continue;
      const v = el[k];
      if (typeof v === 'number') nums.push(v);
      else if (typeof v === 'boolean') nums.push(v ? 1 : 0);
    }
    return `${el.type}@${el.tx},${el.ty}:${hashNumbers(nums)}`;
  }).sort();
  return `${head}|${els.join(',')}`;
}

/** Stellen, an denen man auf festem Boden steht (eine je Spalte) */
function standSpots(level) {
  const spots = [];
  for (let x = 1; x < level.width - 1; x++) {
    for (let y = 1; y < level.height - 1; y++) {
      const below = level.rows[y + 1][x];
      if (level.rows[y][x] === '.' && (below === '#' || below === 'I')) { spots.push([x, y]); break; }
    }
  }
  return spots;
}

/**
 * Lässt `a` und `b` dieselbe Zufallsfolge aus Teleports und Eingaben durchlaufen.
 * @returns {number} erster Tick mit unterschiedlichem Digest, oder -1
 */
function firstDivergence(a, b, level, seed, ticks) {
  const rng = createRng(seed, 'walk');
  const spots = standSpots(level);
  let mask = 0;
  for (let t = 0; t < ticks; t++) {
    if (t % 150 === 0 && spots.length) {
      const [tx, ty] = spots[rng.intRange(0, spots.length - 1)];
      for (const w of [a, b]) warpPlayer(w, tx * TILE + 3, (ty + 1) * TILE - PLAYER_H);
    }
    if (t % 12 === 0) {
      mask = (rng.chance(0.5) ? INPUT.RIGHT : INPUT.LEFT) | (rng.chance(0.4) ? INPUT.JUMP : 0)
        | (rng.chance(0.15) ? INPUT.DASH : 0) | (rng.chance(0.1) ? INPUT.UP : 0);
    }
    stepWorld(a, mask);
    stepWorld(b, mask);
    if (t % 20 === 0 && digest(a) !== digest(b)) return t;
  }
  return -1;
}

const SAMPLE = [];
for (let s = 0; s < 6; s++) {
  for (const speedClass of ['normal', 'fast', 'super']) {
    SAMPLE.push(generateLevel({ seed: `rt-${s}`, length: s % 2 ? 'medium' : 'short', speedClass, biome: 'random' }));
  }
}

test('Alle generierten Level bestehen die Dokument-Prüfung (Struktur, Schema, Portale, Anker)', () => {
  let count = 0;
  for (let s = 0; s < 60; s++) {
    for (const speedClass of ['normal', 'fast', 'super']) {
      const level = generateLevel({ seed: `valid-${s}`, length: ['short', 'medium', 'long'][s % 3], speedClass, biome: 'random' });
      const res = validateDoc(levelToDoc(level), { limits: BIG, smoke: false });
      assert.ok(res.ok, `Seed valid-${s} ${speedClass}: ${res.errors?.join(' | ')}`);
      count++;
    }
  }
  assert.equal(count, 180);
});

test('Ein Level durchs Dokument verhält sich Tick für Tick wie das generierte (Teleports, Zufallseingaben)', () => {
  const kinds = new Set();
  for (const [i, level] of SAMPLE.entries()) {
    const res = validateDoc(levelToDoc(level), { limits: BIG });
    assert.ok(res.ok, res.errors?.join(' | '));
    const a = createLevelWorld(level, { emit: (type) => kinds.add(type) });
    const b = createLevelWorld(res.level);
    assert.equal(b.elements.length, a.elements.length, 'gleiche Zahl Elemente');
    const at = firstDivergence(a, b, level, `seed-${i}`, 6000);
    assert.equal(at, -1, `Level ${i} (${level.params.speedClass}, Seed ${level.params.seed}) weicht bei Tick ${at} ab`);
  }
  // Die Stichprobe muss die Elemente auch wirklich ausgelöst haben, sonst beweist sie wenig
  const wanted = ['death', 'checkpoint', 'spring', 'crumbleStart', 'laserOn', 'ring', 'crystal', 'switch'];
  const missing = wanted.filter((k) => !kinds.has(k));
  assert.ok(kinds.size >= 8 && missing.length <= 2, `Ereignisse in der Stichprobe: ${[...kinds].join(', ')} (fehlend: ${missing.join(', ')})`);
});

test('Kontrolle: Der Vergleich erkennt eine Abweichung, wenn das Dokument-Level anders spielt', () => {
  const level = SAMPLE.find((l) => l.entities.some((e) => e.type === 'saw' && e.path));
  assert.ok(level, 'Stichprobe braucht ein Level mit Pfad-Säge');
  const res = validateDoc(levelToDoc(level), { limits: BIG });
  assert.ok(res.ok);

  // (a) eine Säge minimal schneller
  const faster = { ...res.level, entities: res.level.entities.map((e) => ({ ...e })) };
  const saw = faster.entities.find((e) => e.type === 'saw' && e.path);
  saw.speed += 5;
  assert.notEqual(firstDivergence(createLevelWorld(level), createLevelWorld(faster), level, 'control-a', 600), -1, 'schnellere Säge');

  // (b) ein Element weniger
  const fewer = { ...res.level, entities: res.level.entities.slice(1) };
  assert.notEqual(firstDivergence(createLevelWorld(level), createLevelWorld(fewer), level, 'control-b', 600), -1, 'fehlendes Element');

  // (c) andere Tempo-Klasse
  const other = { ...res.level, params: { speedClass: level.params.speedClass === 'normal' ? 'fast' : 'normal' } };
  assert.notEqual(firstDivergence(createLevelWorld(level), createLevelWorld(other), level, 'control-c', 600), -1, 'andere Klasse');
});
