// Tests der Anti-Cheat-Anbindung im Raum: Der Sieger (beim Tages-Level alle) wird nachgespielt, eine nicht
// bestätigte Zeit zählt nicht, der Nächste rückt auf. Die Prüfung selbst (replay.js) ist hier ein
// Doppelgänger — ihr eigenes Verhalten testet replay.test.js.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, room, startRace, sock, tok } = require('./harness');
const { dailyDateOf } = require('../daily');

const flush = () => new Promise((resolve) => setImmediate(resolve));
const LOG = [0, 1, 200, 0];

// Prüfer, der pro Zeit ein festes Urteil fällt (Standard: bestätigt)
function fakeVerify(verdicts = {}) {
  const calls = [];
  const verify = async (job) => {
    calls.push(job);
    const v = verdicts[job.ticks] || { status: 'ok' };
    return v.status === 'ok' ? { status: 'ok', ticks: job.ticks, deaths: 1, splits: [[1, 100]], ...v } : v;
  };
  return { verify, calls };
}

function raceOf(h, code, finishes) {
  startRace(h, code, finishes.length);
  h.advance(60_000);
  finishes.forEach(({ ticks, log = LOG, fp = 'abc123' }, i) => {
    assert.equal(h.mgr.finish(sock(`s${i + 1}`), { ticks, deaths: 0, splits: [], log, fp }).ok, true);
  });
}

test('Der Sieger wird nachgespielt und bekommt den Haken; die Zeit kommt aus dem Nachspielen', async () => {
  const { verify, calls } = fakeVerify();
  const h = harness({}, { verify });
  const code = room(h, ['Anna', 'Bob']);
  raceOf(h, code, [{ ticks: 3000 }, { ticks: 3400 }]);
  assert.equal(h.lastState(code).phase, 'results');
  assert.equal(h.lastState(code).results[0].verified, null, 'sofort da, Bestätigung folgt');
  await flush();

  const r = h.lastState(code).results;
  assert.equal(r[0].name, 'Anna');
  assert.equal(r[0].verified, true);
  assert.deepEqual(r[0].splits, [[1, 100]], 'Zwischenzeiten stammen aus dem Nachspielen');
  assert.equal(r[0].deaths, 1);
  assert.equal(calls.length, 1, 'nur der Sieger, nicht Bob');
  assert.deepEqual(calls[0].log, LOG);
  assert.equal(calls[0].fp, 'abc123');
  assert.equal(r[1].verified, null);
});

test('Nicht bestätigte Zeit zählt nicht: Sieger rückt weg, der Nächste wird geprüft und gewinnt', async () => {
  const { verify, calls } = fakeVerify({ 3000: { status: 'invalid', reason: 'Zeit weicht ab' } });
  const h = harness({}, { verify });
  const code = room(h, ['Anna', 'Bob', 'Cleo']);
  raceOf(h, code, [{ ticks: 3000 }, { ticks: 3400 }, { ticks: 3900 }]);
  await flush();

  const r = h.lastState(code).results;
  assert.deepEqual(r.map((e) => [e.name, e.place]), [['Bob', 1], ['Cleo', 2], ['Anna', 3]]);
  assert.equal(r[0].verified, true);
  assert.equal(r[2].invalid, true);
  assert.equal(r[2].dnf, true);
  assert.equal(r[2].ticks, null);
  assert.equal(r[1].gap, 500, 'Abstand zum neuen Sieger');
  assert.equal(calls.length, 2, 'Anna (ungültig) und Bob (gültig), Cleo nicht');
  assert.ok(h.notices().some((t) => t.startsWith('Anna:')), 'Hinweis an den Raum');
});

test('Ohne Input-Log lässt sich nichts bestätigen: Der Lauf zählt nicht', async () => {
  const { verify, calls } = fakeVerify();
  const h = harness({}, { verify });
  const code = room(h, ['Anna', 'Bob']);
  raceOf(h, code, [{ ticks: 3000, log: null }, { ticks: 3400 }]);
  await flush();
  const r = h.lastState(code).results;
  assert.deepEqual(r.map((e) => e.name), ['Bob', 'Anna']);
  assert.equal(r[1].invalid, true);
  assert.equal(calls.length, 1, 'für Anna wurde gar nichts nachgespielt');
});

test('Nicht geprüft (anderer Sim-Stand, Prüfer ausgefallen): Die Zeit bleibt, ohne Haken und ohne Strafe', async () => {
  for (const status of ['skipped', 'error', 'busy']) {
    const { verify, calls } = fakeVerify({ 3000: { status, reason: 'x' } });
    const h = harness({}, { verify });
    const code = room(h, ['Anna', 'Bob']);
    raceOf(h, code, [{ ticks: 3000 }, { ticks: 3400 }]);
    await flush();
    const r = h.lastState(code).results;
    assert.deepEqual(r.map((e) => e.name), ['Anna', 'Bob'], status);
    assert.equal(r[0].verified, null, status);
    assert.equal(r[0].invalid, false, status);
    assert.equal(calls.length, 1, `${status}: der Sieger steht, die anderen werden nicht geprüft`);
  }
});

test('Tages-Level: alle Läufe werden geprüft, geprüfte kommen in die Tagesrangliste', async () => {
  const { verify, calls } = fakeVerify({ 3400: { status: 'invalid', reason: 'x' } });
  const verified = [];
  const h = harness({}, { verify, dailyDateOf, onVerifiedRun: (run) => verified.push(run) });
  const code = room(h, ['Anna', 'Bob', 'Cleo']);
  h.mgr.setSettings(sock('s1'), { seedMode: 'daily' });
  raceOf(h, code, [{ ticks: 3000 }, { ticks: 3400 }, { ticks: 3900 }]);
  await flush();

  assert.equal(calls.length, 3, 'alle drei');
  assert.deepEqual(verified.map((v) => v.name), ['Anna', 'Cleo'], 'Bobs Lauf war ungültig');
  assert.equal(verified[0].dateKey, '2026-09-21');
  assert.equal(verified[0].token, tok(1), 'Token für die Identität — nicht im Zustand, nur hier');
  assert.deepEqual(verified[0].log, LOG);
  assert.ok(!JSON.stringify(h.lastState(code)).includes(tok(1)), 'Token bleibt privat');
});

test('Ein normaler Raum (kein Tages-Level) schickt nichts in die Tagesrangliste', async () => {
  const { verify } = fakeVerify();
  const verified = [];
  const h = harness({}, { verify, dailyDateOf, onVerifiedRun: (run) => verified.push(run) });
  const code = room(h, ['Anna']);
  raceOf(h, code, [{ ticks: 3000 }]);
  await flush();
  assert.equal(verified.length, 0);
});

test('Ging der Raum inzwischen weiter (nächste Runde), wird ein spätes Urteil verworfen', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const verify = async (job) => { await gate; return { status: 'invalid', reason: 'spät', ticks: job.ticks }; };
  const h = harness({}, { verify });
  const code = room(h, ['Anna']);
  raceOf(h, code, [{ ticks: 3000 }]);
  assert.equal(h.mgr.start(sock('s1')).ok, true, 'Host startet die nächste Runde, bevor das Urteil da ist');
  release();
  await flush();
  const s = h.lastState(code);
  assert.equal(s.phase, 'loading');
  assert.equal(s.players[0].state, 'loading', 'das späte "ungültig" hat den neuen Lauf nicht berührt');
});

test('Ohne Prüfer (verify nicht gesetzt) läuft alles wie vorher', async () => {
  const h = harness();
  const code = room(h, ['Anna']);
  raceOf(h, code, [{ ticks: 3000 }]);
  await flush();
  const r = h.lastState(code).results;
  assert.equal(r[0].verified, null);
  assert.equal(r[0].invalid, false);
});
