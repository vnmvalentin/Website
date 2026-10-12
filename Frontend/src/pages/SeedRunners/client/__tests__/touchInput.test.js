// Touch-Eingabe: gehaltene Bits je Quelle, kurze Tipps gehen nicht verloren, Richtungen des Steuerkreuzes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT } from '../../sim/inputBits.js';
import { setTouch, releaseTouch, sampleTouch, padRichtung } from '../touchInput.js';

test('Mehrere Finger: jede Quelle hält ihre Bits, bis sie loslässt', () => {
  releaseTouch();
  setTouch('kreuz', INPUT.RIGHT);
  setTouch('jump', INPUT.JUMP);
  assert.equal(sampleTouch(), INPUT.RIGHT | INPUT.JUMP);
  setTouch('jump', 0);
  assert.equal(sampleTouch(), INPUT.RIGHT);
  setTouch('kreuz', INPUT.LEFT | INPUT.UP);
  assert.equal(sampleTouch(), INPUT.LEFT | INPUT.UP);
  setTouch('kreuz', 0);
  assert.equal(sampleTouch(), 0);
});

test('Ein Tipp zwischen zwei Ticks kommt genau einmal an', () => {
  releaseTouch();
  setTouch('jump', INPUT.JUMP);
  setTouch('jump', 0);
  assert.equal(sampleTouch(), INPUT.JUMP);
  assert.equal(sampleTouch(), 0);
});

test('Gehalten ist kein neuer Tipp: erneutes Melden derselben Bits bleibt nach dem Loslassen nicht hängen', () => {
  releaseTouch();
  setTouch('kreuz', INPUT.RIGHT);
  sampleTouch();
  setTouch('kreuz', INPUT.RIGHT);      // Finger bewegt sich, Richtung bleibt
  setTouch('kreuz', 0);
  assert.equal(sampleTouch(), 0);
});

test('releaseTouch lässt alles los, auch gemerkte Tipps', () => {
  setTouch('kreuz', INPUT.RIGHT);
  setTouch('dash', INPUT.DASH);
  releaseTouch();
  assert.equal(sampleTouch(), 0);
});

test('Steuerkreuz: Totzone, vier Richtungen, Diagonalen', () => {
  assert.equal(padRichtung(5, -5, 18), 0);
  assert.equal(padRichtung(60, 0, 18), INPUT.RIGHT);
  assert.equal(padRichtung(-60, 0, 18), INPUT.LEFT);
  assert.equal(padRichtung(0, -60, 18), INPUT.UP);
  assert.equal(padRichtung(0, 60, 18), INPUT.DOWN);
  assert.equal(padRichtung(50, -50, 18), INPUT.RIGHT | INPUT.UP);
  assert.equal(padRichtung(-50, 50, 18), INPUT.LEFT | INPUT.DOWN);
});

test('Steuerkreuz: Ein leicht verrutschter Daumen bleibt beim Laufen seitwärts', () => {
  // 25° unter der Waagerechten: noch kein „Runter“ (schneller fallen)
  assert.equal(padRichtung(60, 28, 18), INPUT.RIGHT);
  // 75°: nur noch hoch
  assert.equal(padRichtung(16, -60, 18), INPUT.UP);
});
