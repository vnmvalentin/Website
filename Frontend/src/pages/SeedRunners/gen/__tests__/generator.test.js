// Tests des Level-Generators: Determinismus (gleicher Seed → byte-identisches Level), Gültigkeit
// über viele Seeds und Klassen, Schwierigkeitskurve, Einführung neuer Mechaniken, Tempo-Klassen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, generateSingle, validateLevel, normalizeParams, dailyParams, BIOME_IDS, LENGTHS, createLevelWorld, CHUNK_BY_ID } from '../index.js';
import { CHUNKS } from '../chunks/index.js';
import { validateTemplate } from '../schema.js';
import { reachForClass } from '../../sim/reach.js';
import { SPEED_CLASS_IDS, SPEED_CLASSES } from '../../sim/classes.js';
import { stepWorld } from '../../sim/world.js';

// ── Chunk-Templates ─────────────────────────────────────────────────────────

test('mindestens 30 Chunk-Templates, alle IDs eindeutig', () => {
  assert.ok(CHUNKS.length >= 30, `nur ${CHUNKS.length} Chunks`);
  assert.equal(new Set(CHUNKS.map((c) => c.id)).size, CHUNKS.length);
});

test('jedes Template besteht die Schema-Prüfung (Übergänge, Marker, Dehnung, Elemente)', () => {
  const errors = CHUNKS.flatMap((c) => validateTemplate(c));
  assert.deepEqual(errors, []);
});

test('jedes Template ist in jeder Tempo-Klasse nutzbar oder bewusst ausgeschlossen', () => {
  // Ein Chunk, dessen Lücke schon im Grundzustand über der Reichweite liegt, fällt in der
  // jeweiligen Klasse raus. Für "Normal" (kleinste Reichweite) darf das nie passieren.
  const reach = reachForClass('normal');
  const safe = { 1: 0.55, 2: 0.62, 3: 0.7, 4: 0.78, 5: 0.86 };
  for (const c of CHUNKS) {
    for (const g of c.gaps) assert.ok(g.width <= safe[c.difficulty] * reach.gap[g.reach] + 1e-9, `${c.id}: Lücke ${g.width}`);
    for (const s of c.stretch) if (s.reach) assert.ok(s.base <= safe[c.difficulty] * reach.gap[s.reach] + 1e-9, `${c.id}: base ${s.base}`);
  }
});

// ── Feedback vom 21.09.2026 ──────────────────────────────────────────────────

test('Bröckelblöcke werden im Verlauf des Levels schneller (0,28 s → 0,18 s), der Solver prüft das Schwerste', () => {
  const delays = (level) => level.entities.filter((e) => e.type === 'crumble').map((e) => ({ delay: e.delay, tx: e.tx }));
  const level = generateLevel({ seed: 'bröckel', length: 'long', speedClass: 'normal', biome: 'cave' });
  const list = delays(level).sort((a, b) => a.tx - b.tx);
  assert.ok(list.length > 0, 'Höhlen-Level mit Bröckelblöcken');
  for (const d of list) assert.ok(d.delay >= 0.18 - 1e-9 && d.delay <= 0.28 + 1e-9, `Verzögerung ${d.delay}`);
  assert.ok(list[0].delay >= list[list.length - 1].delay, 'am Anfang gemütlicher als am Ende');
  const single = generateSingle(CHUNK_BY_ID['crumble-bridge'], { seed: 's', length: 'short', speedClass: 'normal', biome: 'meadow' });
  assert.ok(delays(single).every((d) => d.delay === 0.18), 'Einzel-Chunk (Solver) mit dem schnellsten Wert');
});

test('Chunks mit classes kommen nur in ihrer Klasse vor (Kristallketten je Tempo-Klasse)', () => {
  for (const cls of SPEED_CLASS_IDS) {
    const level = generateLevel({ seed: 'klassen', length: 'long', speedClass: cls, biome: 'random' });
    for (const p of level.placements) {
      const tpl = CHUNK_BY_ID[p.id];
      if (tpl.classes) assert.ok(tpl.classes.includes(cls), `${p.id} in Klasse ${cls}`);
    }
  }
  assert.equal(generateSingle(CHUNK_BY_ID['crystal-chain-fast'], { seed: 'x', speedClass: 'normal' }), null);
});

// ── Determinismus ───────────────────────────────────────────────────────────

test('gleicher Seed → byte-identisches Level (Hash, Raster, Elemente)', () => {
  for (const seed of ['0', 'hallo', '12345', 'daily-2026-09-21']) {
    for (const speedClass of SPEED_CLASS_IDS) {
      const a = generateLevel({ seed, length: 'medium', speedClass, biome: 'random' });
      const b = generateLevel({ seed, length: 'medium', speedClass, biome: 'random' });
      assert.equal(a.hash, b.hash);
      assert.equal(JSON.stringify(a), JSON.stringify(b), `${seed}/${speedClass}`);
    }
  }
});

test('andere Seeds, Längen, Klassen und Biome ergeben andere Level', () => {
  const base = { seed: 'x', length: 'medium', speedClass: 'normal', biome: 'meadow' };
  const hashes = new Set([
    generateLevel(base).hash,
    generateLevel({ ...base, seed: 'y' }).hash,
    generateLevel({ ...base, length: 'short' }).hash,
    generateLevel({ ...base, speedClass: 'fast' }).hash,
    generateLevel({ ...base, biome: 'ice' }).hash,
  ]);
  assert.equal(hashes.size, 5);
});

test('Zahl und Text als Seed sind dasselbe; der Tages-Seed ist an das Datum gebunden', () => {
  assert.equal(generateLevel({ seed: 42 }).hash, generateLevel({ seed: '42' }).hash);
  assert.equal(generateLevel(dailyParams('2026-09-21')).hash, generateLevel(dailyParams('2026-09-21')).hash);
  assert.notEqual(generateLevel(dailyParams('2026-09-21')).hash, generateLevel(dailyParams('2026-09-22')).hash);
});

test('Level-Erzeugung nutzt weder Zufall noch Uhr', () => {
  const realRandom = Math.random;
  const realNow = Date.now;
  try {
    Math.random = () => { throw new Error('Math.random in der Level-Erzeugung'); };
    Date.now = () => { throw new Error('Date.now in der Level-Erzeugung'); };
    const level = generateLevel({ seed: 'strikt', length: 'short', speedClass: 'fast', biome: 'random' });
    assert.ok(level.rows.length > 0);
    const world = createLevelWorld(level);
    for (let t = 0; t < 200; t++) stepWorld(world, 0);
  } finally {
    Math.random = realRandom;
    Date.now = realNow;
  }
});

// ── Gültigkeit ──────────────────────────────────────────────────────────────

test('der Validator akzeptiert Level über viele Seeds, Längen und Tempo-Klassen', () => {
  const failures = [];
  let generated = 0;
  const plan = [['short', 120], ['medium', 40], ['long', 10]];
  for (const speedClass of SPEED_CLASS_IDS) {
    for (const [length, seeds] of plan) {
      for (let s = 0; s < seeds; s++) {
        const level = generateLevel({ seed: `t-${s}`, length, speedClass, biome: 'random' });
        generated++;
        const errs = validateLevel(level);
        if (errs.length) failures.push(`${speedClass}/${length}/t-${s}: ${errs[0]}`);
      }
    }
  }
  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} von ${generated} Leveln ungültig`);
});

test('Längen: Chunk-Zahl folgt Länge und Tempo-Klasse; Checkpoints in gleichmäßigen Abständen', () => {
  for (const speedClass of SPEED_CLASS_IDS) {
    for (const length of Object.keys(LENGTHS)) {
      const level = generateLevel({ seed: 'länge', length, speedClass });
      const progression = level.placements.filter((p) => p.kind === 'chunk').length;
      assert.equal(progression, Math.round(LENGTHS[length] * SPEED_CLASSES[speedClass].lengthFactor));
      const kinds = level.placements.map((p) => p.kind);
      assert.equal(kinds[0], 'start');
      assert.equal(kinds[kinds.length - 1], 'finish');
      assert.notEqual(kinds[kinds.length - 2], 'checkpoint', 'kein Checkpoint direkt vor dem Ziel');
      assert.ok(kinds.filter((k) => k === 'checkpoint').length >= 1);
    }
  }
});

test('Biome: alle kommen vor, und jedes ist wählbar', () => {
  const seen = new Set();
  for (let s = 0; s < 60; s++) seen.add(generateLevel({ seed: `b${s}`, length: 'short' }).biome);
  assert.equal(seen.size, BIOME_IDS.length);
  for (const biome of BIOME_IDS) assert.equal(generateLevel({ seed: 'b', biome, length: 'short' }).biome, biome);
});

test('normalizeParams fängt Unsinn ab', () => {
  const p = normalizeParams({ seed: '', length: 'riesig', speedClass: 'warp', biome: 'mars' });
  assert.deepEqual(p, { seed: '0', length: 'medium', speedClass: 'normal', biome: 'random' });
});

// ── Schwierigkeitskurve und Einführung ──────────────────────────────────────

test('Schwierigkeitskurve steigt: Anfang leichter als Mitte leichter als Ende', () => {
  let first = 0, middle = 0, last = 0, n = 0;
  for (let s = 0; s < 40; s++) {
    const chunks = generateLevel({ seed: `k${s}`, length: 'long' }).placements.filter((p) => p.kind === 'chunk');
    const q = Math.floor(chunks.length / 4);
    const avg = (list) => list.reduce((a, c) => a + c.difficulty, 0) / list.length;
    first += avg(chunks.slice(0, q));
    middle += avg(chunks.slice(q * 1.5, q * 2.5));
    last += avg(chunks.slice(-q));
    n++;
  }
  assert.ok(first / n + 0.5 < middle / n, `Anfang ${first / n} vs. Mitte ${middle / n}`);
  assert.ok(middle / n + 0.4 < last / n, `Mitte ${middle / n} vs. Ende ${last / n}`);
});

test('Kombinations-Chunks kommen nur im hinteren Teil vor', () => {
  for (let s = 0; s < 40; s++) {
    const chunks = generateLevel({ seed: `c${s}`, length: 'long' }).placements.filter((p) => p.kind === 'chunk');
    chunks.forEach((c, i) => {
      if (CHUNKS.find((t) => t.id === c.id).combo) assert.ok(i / (chunks.length - 1) >= 0.44, `${c.id} bei ${i}/${chunks.length}`);
    });
  }
});

test('neue Mechaniken werden meist zuerst in einer sicheren Erstbegegnung gezeigt', () => {
  // Erste Chunk-Begegnung mit einer Mechanik: entweder der Einführungs-Chunk oder leicht (≤ 2).
  let firsts = 0;
  let gentle = 0;
  for (let s = 0; s < 60; s++) {
    const seen = new Set();
    for (const p of generateLevel({ seed: `i${s}`, length: 'long' }).placements.filter((q) => q.kind === 'chunk')) {
      const tpl = CHUNKS.find((t) => t.id === p.id);
      for (const tag of tpl.tags) {
        if (seen.has(tag) || !['spikes', 'wall', 'grapple', 'laser', 'saw', 'wind', 'portal', 'ring', 'gravity', 'crumble'].includes(tag)) continue;
        seen.add(tag);
        firsts++;
        if (tpl.intro === tag || tpl.difficulty <= 3) gentle++;
      }
    }
  }
  assert.ok(gentle / firsts > 0.8, `nur ${Math.round((gentle / firsts) * 100)} % sanfte Erstbegegnungen`);
});

// ── Tempo-Klassen ───────────────────────────────────────────────────────────

test('Tempo-Klassen: Reichweiten wachsen, Lücken im Level werden breiter', () => {
  const r = SPEED_CLASS_IDS.map((c) => reachForClass(c));
  for (const key of Object.keys(r[0].gap)) {
    assert.ok(r[0].gap[key] < r[1].gap[key] && r[1].gap[key] < r[2].gap[key], `${key}: ${r.map((x) => x.gap[key].toFixed(1))}`);
  }
  assert.ok(Math.abs(r[0].height.jump - r[2].height.jump) < 0.05, 'Sprunghöhe bleibt gleich');

  const meanGap = (speedClass) => {
    let total = 0, count = 0;
    for (let s = 0; s < 40; s++) {
      for (const p of generateLevel({ seed: `g${s}`, length: 'medium', speedClass }).placements) {
        for (const g of p.gaps) { total += g.width; count++; }
      }
    }
    return total / count;
  };
  const normal = meanGap('normal');
  const fast = meanGap('fast');
  const fastest = meanGap('super');
  assert.ok(normal < fast && fast < fastest, `mittlere Lückenbreite ${normal.toFixed(2)} < ${fast.toFixed(2)} < ${fastest.toFixed(2)}`);
});

test('ein erzeugtes Level lässt sich laden und ein paar Sekunden simulieren', () => {
  const level = generateLevel({ seed: 'spiel', length: 'short', speedClass: 'super' });
  const w = createLevelWorld(level);
  assert.equal(w.cfg.runMaxSpeed, 231);
  for (let t = 0; t < 600; t++) stepWorld(w, 2);
  assert.ok(w.player.x > 100);
});
