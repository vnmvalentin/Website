// Determinismus: gleiche Eingabefolge → bitgleicher Zustand, egal wie oft, egal auf welchem
// Bildschirmtakt. Das ist die Grundlage für den späteren Anti-Cheat-Replay (der Server rechnet
// einen Lauf headless nach) und dafür, dass Zeiten verschiedener Spieler vergleichbar sind.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, resetRun } from '../world.js';
import { hashWorld } from '../hash.js';
import { INPUT } from '../inputBits.js';
import { createTestMap } from '../testMap.js';
import { FixedStepper } from '../../client/loop.js';
import { createInputLatch, DEFAULT_BINDINGS } from '../../client/inputLatch.js';

// Test-eigener Pseudozufall (LCG): die Sim selbst kennt keinen Zufall. Er erzeugt hier nur eine
// wilde, aber reproduzierbare Tastenfolge, die alle Zweige der Bewegung berührt.
function scriptedInput(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  // Eine Taste wird nur mit kleiner Wahrscheinlichkeit gewechselt → realistische Halte- und Tippfolgen
  const bits = [INPUT.LEFT, INPUT.RIGHT, INPUT.UP, INPUT.DOWN, INPUT.JUMP, INPUT.DASH, INPUT.GRAPPLE];
  let mask = INPUT.RIGHT;
  const table = [];
  return (tick) => {
    while (table.length <= tick) {
      for (const bit of bits) if (next() < 0.03) mask ^= bit;
      table.push(mask);
    }
    return table[tick];
  };
}

const TEST_TICKS = 4000;

test('gleiche Eingaben ergeben in jedem Tick denselben Hash', () => {
  const input = scriptedInput(12345);
  const a = createWorld(createTestMap());
  const b = createWorld(createTestMap());
  for (let t = 0; t < TEST_TICKS; t++) {
    stepWorld(a, input(t));
    stepWorld(b, input(t));
    assert.equal(hashWorld(a), hashWorld(b), `Abweichung bei Tick ${t}`);
  }
});

test('der Hash reagiert auf Eingaben (kein Dauer-Konstantwert)', () => {
  const a = createWorld(createTestMap());
  const b = createWorld(createTestMap());
  for (let t = 0; t < 200; t++) {
    stepWorld(a, INPUT.RIGHT);
    stepWorld(b, t === 100 ? INPUT.RIGHT | INPUT.JUMP : INPUT.RIGHT);
  }
  assert.notEqual(hashWorld(a), hashWorld(b));
});

test('Lauf zurücksetzen und erneut abspielen liefert dasselbe Ergebnis', () => {
  const input = scriptedInput(777);
  const w = createWorld(createTestMap());
  for (let t = 0; t < 2500; t++) stepWorld(w, input(t));
  const first = hashWorld(w);
  resetRun(w);
  for (let t = 0; t < 2500; t++) stepWorld(w, input(t));
  assert.equal(hashWorld(w), first);
});

test('die Sim liest weder Uhr noch Zufall', () => {
  // Zufall und Uhr würden sich hier als Abweichung zwischen zwei Läufen zeigen, wenn wir sie
  // zwischen den Läufen verändern: Math.random und Date.now werden durch wechselnde Werte ersetzt.
  const input = scriptedInput(4242);
  const run = () => {
    const w = createWorld(createTestMap());
    for (let t = 0; t < 1500; t++) stepWorld(w, input(t));
    return hashWorld(w);
  };
  const realRandom = Math.random;
  const realNow = Date.now;
  const realPerf = performance.now.bind(performance);
  try {
    let n = 0;
    Math.random = () => (n++ % 97) / 97;
    Date.now = () => 1_700_000_000_000 + n++ * 13;
    const first = run();
    Math.random = () => 0.31337;
    Date.now = () => 42;
    // performance.now lässt sich nicht überall überschreiben; die Sim benutzt es ohnehin nicht
    assert.equal(run(), first);
  } finally {
    Math.random = realRandom;
    Date.now = realNow;
    assert.equal(typeof realPerf(), 'number');
  }
});

// ── Bildschirmtakt ──────────────────────────────────────────────────────────

// Simuliert einen Monitor: Bilder mit Abstand `frameMs` (plus Jitter) laufen durch den
// Schrittgeber; gerechnet wird, bis genau `targetTicks` Ticks gelaufen sind.
function playAtFrameRate(frameMs, jitterMs, targetTicks, input) {
  const world = createWorld(createTestMap());
  const stepper = new FixedStepper();
  let jitterSeed = 99;
  const jitter = () => {
    jitterSeed = (Math.imul(jitterSeed, 1664525) + 1013904223) >>> 0;
    return (jitterSeed / 0x100000000 - 0.5) * 2 * jitterMs;
  };
  let now = 1000;
  let ticks = 0;
  while (ticks < targetTicks) {
    now += frameMs + jitter();
    const n = stepper.advance(now);
    for (let i = 0; i < n && ticks < targetTicks; i++) {
      stepWorld(world, input(ticks));
      ticks++;
    }
  }
  return hashWorld(world);
}

test('60 Hz, 144 Hz und 240 Hz (mit Jitter) ergeben nach gleich vielen Ticks denselben Zustand', () => {
  const input = scriptedInput(2024);
  const reference = playAtFrameRate(1000 / 144, 0.5, 3000, input);
  for (const [name, frameMs, jitter] of [
    ['30 Hz', 1000 / 30, 3],
    ['60 Hz', 1000 / 60, 1],
    ['75 Hz', 1000 / 75, 1],
    ['120 Hz', 1000 / 120, 0.5],
    ['240 Hz', 1000 / 240, 0.3],
  ]) {
    assert.equal(playAtFrameRate(frameMs, jitter, 3000, input), reference, name);
  }
});

test('Schrittgeber: über 10 Sekunden 1200 Ticks (±1), egal bei welcher Bildrate', () => {
  for (const hz of [30, 60, 75, 144, 165, 240]) {
    const stepper = new FixedStepper();
    let total = 0;
    const frameMs = 1000 / hz;
    for (let f = 0; f <= Math.round(hz * 10); f++) total += stepper.advance(1000 + f * frameMs);
    assert.ok(Math.abs(total - 1200) <= 1, `${hz} Hz: ${total} Ticks`);
  }
});

test('Schrittgeber: nach einer langen Pause wird nicht alles nachgeholt', () => {
  const stepper = new FixedStepper({ maxTicksPerFrame: 12 });
  stepper.advance(1000);
  assert.equal(stepper.advance(1016), 1);
  assert.equal(stepper.advance(1016 + 5000), 12, 'Pause von 5 s: höchstens 12 Ticks');
  assert.ok(stepper.alpha >= 0 && stepper.alpha < 1);
});

// ── Tasten-Latch ────────────────────────────────────────────────────────────

test('Latch: ein Tipp zwischen zwei Abtastungen geht nicht verloren', () => {
  const latch = createInputLatch(DEFAULT_BINDINGS);
  latch.keyDown('Space');
  latch.keyUp('Space');
  assert.equal(latch.sample() & INPUT.JUMP, INPUT.JUMP, 'Druck kommt einmal an …');
  assert.equal(latch.sample() & INPUT.JUMP, 0, '… und danach ist die Taste wieder oben');
});

test('Latch: gehaltene Tasten bleiben gedrückt, mehrere Tasten je Aktion lösen sich einzeln', () => {
  const latch = createInputLatch(DEFAULT_BINDINGS);
  latch.keyDown('KeyA');
  latch.keyDown('ArrowLeft');
  assert.equal(latch.sample() & INPUT.LEFT, INPUT.LEFT);
  latch.keyUp('KeyA');
  assert.equal(latch.sample() & INPUT.LEFT, INPUT.LEFT, 'Pfeil links hält die Aktion');
  latch.keyUp('ArrowLeft');
  assert.equal(latch.sample() & INPUT.LEFT, 0);
});

test('Latch: releaseAll (Fokusverlust) löst alles, unbelegte Tasten werden ignoriert', () => {
  const latch = createInputLatch(DEFAULT_BINDINGS);
  latch.keyDown('KeyD');
  latch.keyDown('KeyE');
  latch.releaseAll();
  assert.equal(latch.sample(), 0);
  assert.equal(latch.keyDown('KeyQ'), false, 'KeyQ ist nicht belegt');
});
