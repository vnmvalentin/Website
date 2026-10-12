import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteRunners } from '../remoteRunners.js';

test('mischt zwischen den beiden Paketen, die den (verzögerten) Anzeigezeitpunkt einrahmen', () => {
  const r = createRemoteRunners({ delayMs: 100 });
  r.push([['a', 0, 50, 1, 10, 1]], 1000);
  r.push([['a', 20, 50, 1, 22, 1]], 1100);
  const s = r.sample('a', 1150);          // Anzeige bei 1050: genau zwischen den Paketen
  assert.equal(s.x, 10);
  assert.equal(s.y, 50);
  assert.equal(s.attempt, 1);
  assert.ok(Math.abs(s.vx - 200) < 1e-9, '20 px in 12 Ticks = 200 px/s');
});

test('ohne neues Paket bleibt die Figur stehen, statt vorauszulaufen; nach langer Stille ist sie weg', () => {
  const r = createRemoteRunners({ delayMs: 100 });
  r.push([['a', 0, 0, 1, 10, 1]], 1000);
  r.push([['a', 20, 0, 1, 22, 1]], 1100);
  assert.equal(r.sample('a', 1600).x, 20);
  assert.equal(r.sample('a', 5000), null);
  assert.equal(r.sample('unbekannt', 1000), null);
});

test('neuer Versuch oder großer Sprung (Respawn): kein Gleiten quer durchs Level', () => {
  const r = createRemoteRunners({ delayMs: 100 });
  r.push([['a', 500, 0, 1, 900, 1]], 1000);
  r.push([['a', 520, 0, 1, 912, 1]], 1100);
  r.push([['a', 16, 0, 1, 5, 2]], 1200);    // Versuch 2 beginnt am Start
  assert.equal(r.sample('a', 1250).x, 16);
  r.push([['a', 900, 0, 1, 40, 2]], 1300);  // Sprung um fast 900 px
  assert.equal(r.sample('a', 1350).x, 900);
});

test('kaputte Einträge werden übersprungen', () => {
  const r = createRemoteRunners();
  r.push([['a', NaN, 0, 1, 1, 1], [5, 1, 1, 1, 1, 1], 'quatsch', ['b', 1, 2, -1, 3]], 0);
  r.push(null, 0);
  assert.deepEqual(r.ids(), []);
});
