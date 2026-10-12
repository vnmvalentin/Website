// Hardcore-Modus (30.09.2026): Ein Tod in der Runde → sofort DNF. Der Browser meldet den Tod (giveUp { died }), der Server
// sichert zusätzlich Zielmeldung und Nachspielen ab.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, sock, room, startRace } = require('./harness');

const flush = () => new Promise((r) => setImmediate(r));

test('Einstellung: nur boolesch; gilt nur im Modus Rennen und steht an der Runde', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  h.mgr.setSettings(sock('s1'), { hardcore: 'ja' });
  assert.equal(h.lastState(code).settings.hardcore, false);
  h.mgr.setSettings(sock('s1'), { hardcore: true, mode: 'timeattack' });
  assert.equal(h.lastState(code).settings.hardcore, true);
  startRace(h, code, 2);
  assert.equal(h.lastState(code).round.hardcore, false, 'Zeitjagd kennt kein Hardcore');
});

test('Gemeldeter Tod: sofort DNF „ausgeschieden“; ohne Hardcore ändert died nichts am Aufgeben', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  h.mgr.setSettings(sock('s1'), { hardcore: true });
  startRace(h, code, 2);
  assert.equal(h.lastState(code).round.hardcore, true);
  h.advance(5000);
  const res = h.mgr.giveUp(sock('s2'), { died: true });
  assert.equal(res.ok, true);
  assert.equal(res.eliminated, true);
  const bob = h.lastState(code).players.find((p) => p.name === 'Bob');
  assert.equal(bob.state, 'dnf');
  assert.equal(bob.died, true);
  assert.equal(h.mgr.finish(sock('s1'), { ticks: 500, deaths: 0, splits: [] }).ok, true);
  const s = h.lastState(code);
  assert.equal(s.phase, 'results');
  assert.equal(s.results.find((r) => r.name === 'Bob').died, true);
  assert.equal(s.results.find((r) => r.name === 'Anna').died, false);
});

test('Zielmeldung mit Toden zählt im Hardcore nicht (DNF), ohne Hardcore schon', () => {
  const h = harness();
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { hardcore: true });
  startRace(h, code, 1);
  h.advance(5000);
  h.mgr.finish(sock('s1'), { ticks: 500, deaths: 1, splits: [] });
  const s = h.lastState(code);
  assert.equal(s.phase, 'results');
  assert.equal(s.results[0].dnf, true);
  assert.equal(s.results[0].died, true);

  const h2 = harness();
  const code2 = room(h2, ['Anna']);
  startRace(h2, code2, 1);
  h2.advance(5000);
  h2.mgr.finish(sock('s1'), { ticks: 500, deaths: 1, splits: [] });
  assert.equal(h2.lastState(code2).results[0].dnf, false);
});

test('Nachspielen findet einen verschwiegenen Tod: Zeit wird gestrichen', async () => {
  const h = harness({}, { verify: async (job) => ({ status: 'ok', ticks: job.ticks, deaths: 1, splits: [] }) });
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { hardcore: true });
  startRace(h, code, 1);
  h.advance(5000);
  h.mgr.finish(sock('s1'), { ticks: 500, deaths: 0, splits: [], log: [0, 0], fp: 'abc' });
  await flush();
  const r = h.lastState(code).results[0];
  assert.equal(r.dnf, true);
  assert.equal(r.invalid, true);
  assert.equal(r.died, true);
  assert.ok(h.notices().some((t) => t.includes('Hardcore')));
});

test('„Zum Checkpoint“ im Input-Log: im Hardcore DNF, ohne Hardcore erlaubt', () => {
  const log = [0, 0, 300, 128, 301, 0];   // Tick 300: Taste gedrückt (INPUT.RESTART)
  const h = harness();
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { hardcore: true });
  startRace(h, code, 1);
  h.advance(5000);
  h.mgr.finish(sock('s1'), { ticks: 500, deaths: 0, splits: [], log });
  const r = h.lastState(code).results[0];
  assert.equal(r.dnf, true);
  assert.equal(r.died, true);

  const h2 = harness();
  const code2 = room(h2, ['Anna']);
  startRace(h2, code2, 1);
  h2.advance(5000);
  h2.mgr.finish(sock('s1'), { ticks: 500, deaths: 0, splits: [], log });
  assert.equal(h2.lastState(code2).results[0].dnf, false);
});
