// Tests der reinen Bausteine des Raums: Zeitformat, Uhrenabgleich, Input-Log (samt Nachspielen
// gegen die echte Sim — die Grundlage des Anti-Cheat-Replays).

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTicks, formatGap } from '../format.js';
import { createClockSync } from '../clockSync.js';
import { createInputLog, createReplay } from '../inputLog.js';
import { generateLevel, createLevelWorld } from '../../gen/index.js';
import { stepWorld } from '../../sim/world.js';
import { hashWorld } from '../../sim/hash.js';
import { INPUT } from '../../sim/inputBits.js';

test('formatTicks: 120 Ticks = 1 s; Hundertstel abgeschnitten, nicht gerundet; Minuten', () => {
  assert.equal(formatTicks(0), '0:00.00');
  assert.equal(formatTicks(120), '0:01.00');
  assert.equal(formatTicks(150), '0:01.25');
  assert.equal(formatTicks(120 * 60 + 12), '1:00.10');
  assert.equal(formatTicks(120 * 754 + 60), '12:34.50');
  assert.equal(formatTicks(119), '0:00.99');
  assert.equal(formatTicks(null), '–');
  assert.equal(formatTicks(NaN), '–');
});

test('formatGap: Abstand mit Plus, gleichauf als Strich', () => {
  assert.equal(formatGap(0), '–');
  assert.equal(formatGap(390), '+0:03.25');
  assert.equal(formatGap(null), '–');
});

// ── Uhrenabgleich ───────────────────────────────────────────────────────────

test('Uhrenabgleich: findet den Versatz, auch wenn die Client-Uhr stark falsch geht', () => {
  const sync = createClockSync();
  const clientAheadBy = 7 * 60 * 1000;   // Client-Uhr 7 Minuten vor dem Server
  const oneWay = 20;                      // symmetrische Laufzeit
  const t0 = 1_000_000 + clientAheadBy;
  sync.addSample(t0, t0 + 2 * oneWay, 1_000_000 + oneWay);
  assert.equal(sync.offset, -clientAheadBy);
  // Startzeit des Servers → lokale Zeit
  assert.equal(sync.toLocal(1_005_000), 1_005_000 + clientAheadBy);
});

test('Uhrenabgleich: nimmt die Messung mit der kleinsten Laufzeit, nicht den Mittelwert', () => {
  const sync = createClockSync();
  const truth = 500;   // Server geht 500 ms vor
  // Symmetrische Messung: RTT 40
  sync.addSample(10_000, 10_040, 10_020 + truth);
  // Ausreißer mit ungleichen Wegen (Hinweg 10, Rückweg 200): RTT 210, Versatz stark verfälscht
  sync.addSample(20_000, 20_210, 20_010 + truth);
  sync.addSample(30_000, 30_150, 30_140 + truth);
  assert.equal(sync.offset, truth);
  assert.equal(sync.rtt, 40);
  assert.equal(sync.count, 3);
});

test('Uhrenabgleich: ohne Messung gleiche Uhren angenommen; Unsinn wird ignoriert; nur die letzten Messungen zählen', () => {
  const sync = createClockSync();
  assert.equal(sync.offset, null);
  assert.equal(sync.toLocal(123), 123);
  sync.addSample(100, 90, 95);          // negative Laufzeit
  sync.addSample(100, 200, NaN);
  assert.equal(sync.count, 0);
  // Erste (beste) Messung fällt nach 10 weiteren heraus
  sync.addSample(0, 10, 5 + 1000);
  for (let i = 1; i <= 10; i++) sync.addSample(i * 100, i * 100 + 50, i * 100 + 25 + 2000);
  assert.equal(sync.count, 10);
  assert.equal(sync.offset, 2000);
});

// ── Input-Log ───────────────────────────────────────────────────────────────

test('Input-Log speichert nur Wechsel; gehaltene Tasten kosten nichts', () => {
  const log = createInputLog();
  for (let t = 0; t < 1000; t++) log.record(t, t < 500 ? INPUT.RIGHT : INPUT.RIGHT | INPUT.JUMP);
  assert.deepEqual(log.toArray(), [0, INPUT.RIGHT, 500, INPUT.RIGHT | INPUT.JUMP]);
  assert.equal(log.length, 2);
  // Vor dem ersten Eintrag gilt Maske 0: Tick 0 ohne Eingabe wird nicht gespeichert
  const empty = createInputLog();
  empty.record(0, 0);
  empty.record(1, 0);
  assert.deepEqual(empty.toArray(), []);
});

test('Nachspielen liefert die Maske jedes Ticks zurück', () => {
  const log = createInputLog();
  const script = (t) => (t < 10 ? 0 : t < 20 ? INPUT.RIGHT : t < 21 ? INPUT.RIGHT | INPUT.JUMP : INPUT.LEFT);
  for (let t = 0; t < 40; t++) log.record(t, script(t));
  const replay = createReplay(log.toArray());
  for (let t = 0; t < 40; t++) assert.equal(replay(t), script(t), `Tick ${t}`);
});

test('Ein aufgezeichneter Lauf lässt sich nachspielen und ergibt bitgleich denselben Zustand (Grundlage des Anti-Cheat)', () => {
  const level = generateLevel({ seed: 'replay', length: 'short', speedClass: 'fast', biome: 'factory' });
  // Wilder, aber reproduzierbarer Lauf mit allen Tasten
  const script = (t) => INPUT.RIGHT
    | ((t % 41) < 20 ? INPUT.JUMP : 0)
    | ((t % 97) === 0 ? INPUT.DASH : 0)
    | ((t % 200) > 150 ? INPUT.GRAPPLE | INPUT.UP : 0)
    | ((t % 613) === 0 ? INPUT.RESTART : 0);

  const original = createLevelWorld(level);
  const log = createInputLog();
  for (let t = 0; t < 6000; t++) {
    const mask = script(t);
    log.record(original.tick, mask);
    stepWorld(original, mask);
  }

  const replayed = createLevelWorld(level);
  const replay = createReplay(log.toArray());
  for (let t = 0; t < 6000; t++) stepWorld(replayed, replay(replayed.tick));

  assert.equal(hashWorld(replayed), hashWorld(original));
  assert.ok(log.length > 50, 'der Lauf hatte genug Wechsel, um etwas zu beweisen');
  assert.ok(log.toArray().length < 6000 * 2 / 4, 'das Log ist deutlich kleiner als ein Eintrag pro Tick');
});
