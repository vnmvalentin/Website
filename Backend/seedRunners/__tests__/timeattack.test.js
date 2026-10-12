// Zeitjagd (10 Minuten, beste Zeit zählt), Sitzungswertung, DNF-Frist im Zustand und Positions-Relay (Geister/Zuschauen).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, sock, room, startRace, HASH } = require('./harness');

const TEN_MIN = 10 * 60 * 1000;

function timeattackRace(h, names) {
  const code = room(h, names);
  assert.equal(h.mgr.setSettings(sock('s1'), { mode: 'timeattack' }).ok, true);
  startRace(h, code, names.length);
  return code;
}

const player = (h, code, name) => h.lastState(code).players.find((p) => p.name === name);

test('Modus: nur "race" und "timeattack" sind gültig; der Modus gilt für die gestartete Serie', () => {
  const h = harness();
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { mode: 'timeattack' });
  assert.equal(h.lastState(code).settings.mode, 'timeattack');
  h.mgr.setSettings(sock('s1'), { mode: 'quatsch' });
  assert.equal(h.lastState(code).settings.mode, 'timeattack', 'unbekannter Modus wird ignoriert');
  h.mgr.start(sock('s1'));
  assert.equal(h.lastState(code).round.mode, 'timeattack');
  assert.equal(h.lastState(code).series.mode, 'timeattack');
});

test('Zeitjagd: 10 Minuten ab Start, mehrere Läufe, nur eine schnellere Zeit ersetzt die Bestzeit', () => {
  const h = harness();
  const code = timeattackRace(h, ['Anna', 'Bob']);
  const s0 = h.lastState(code);
  assert.equal(s0.round.endAt, s0.round.startAt + TEN_MIN);
  assert.equal(s0.round.dnfAt, null, 'keine DNF-Frist in der Zeitjagd');

  h.advance(20_000);
  let res = h.mgr.finish(sock('s1'), { ticks: 1800, attempt: 1, log: [0, 2], fp: 'x' });
  assert.equal(res.ok, true);
  assert.equal(res.improved, true);
  let anna = player(h, code, 'Anna');
  assert.equal(anna.state, 'racing', 'bleibt im Rennen und darf weiter versuchen');
  assert.equal(anna.finishTicks, 1800);
  assert.equal(anna.runs, 1);
  assert.equal(anna.place, 1, 'mit Bestzeit vor allen ohne Zeit');

  // Wiederholte Meldung desselben Versuchs (Reconnect) zählt nicht noch einmal
  h.mgr.finish(sock('s1'), { ticks: 1800, attempt: 1 });
  assert.equal(player(h, code, 'Anna').runs, 1);

  // Langsamerer zweiter Lauf: zählt als Lauf, Bestzeit bleibt
  h.advance(20_000);
  res = h.mgr.finish(sock('s1'), { ticks: 2000, attempt: 2 });
  assert.equal(res.improved, false);
  anna = player(h, code, 'Anna');
  assert.equal(anna.finishTicks, 1800);
  assert.equal(anna.runs, 2);

  // Schnellerer dritter Lauf ersetzt sie
  h.advance(20_000);
  h.mgr.finish(sock('s1'), { ticks: 1500, attempt: 3, log: [0, 1] });
  assert.equal(player(h, code, 'Anna').finishTicks, 1500);

  // Nachgereichte Meldung eines älteren Versuchs (war verloren gegangen): zählt als Bestzeit, aber nicht als weiterer Lauf
  h.mgr.finish(sock('s1'), { ticks: 1400, attempt: 2, log: [0, 5] });
  assert.equal(player(h, code, 'Anna').finishTicks, 1400);
  assert.equal(player(h, code, 'Anna').runs, 3);
  h.mgr.finish(sock('s1'), { ticks: 1500, attempt: 3, log: [0, 1] });
  assert.equal(player(h, code, 'Anna').finishTicks, 1400);

  // Kein Ende nach 60 s wie im Rennen — erst nach 10 Minuten
  h.advance(120_000);
  assert.equal(h.lastState(code).phase, 'racing');
  h.advance(TEN_MIN);
  const end = h.lastState(code);
  assert.equal(end.phase, 'results');
  const [first, second] = end.results;
  assert.equal(first.name, 'Anna');
  assert.equal(first.ticks, 1400);
  assert.equal(first.runs, 3);
  assert.equal(first.dnf, false);
  assert.equal(second.name, 'Bob');
  assert.equal(second.dnf, true, 'ohne Zeit nach Ablauf DNF');
});

test('Zeitjagd: Checkpoints zählen je Versuch; eine Meldung aus einem alten Versuch ist überholt', () => {
  const h = harness();
  const code = timeattackRace(h, ['Anna']);
  h.advance(10_000);
  assert.equal(h.mgr.checkpoint(sock('s1'), { index: 1, tick: 300, attempt: 1 }).ok, true);
  assert.equal(h.mgr.checkpoint(sock('s1'), { index: 2, tick: 600, attempt: 1 }).ok, true);
  assert.equal(player(h, code, 'Anna').cp, 2);
  // Neuer Versuch: fängt wieder bei 0 an, kleinere Ticks sind erlaubt
  assert.equal(h.mgr.checkpoint(sock('s1'), { index: 1, tick: 200, attempt: 2 }).ok, true);
  assert.equal(player(h, code, 'Anna').cp, 1);
  // Nachzügler aus Versuch 1 ändert nichts
  assert.equal(h.mgr.checkpoint(sock('s1'), { index: 3, tick: 900, attempt: 1 }).ok, true);
  assert.equal(player(h, code, 'Anna').cp, 1);
});

test('Zeitjagd: "Beenden" behält die Bestzeit; sind alle fertig, endet die Runde vor Ablauf', () => {
  const h = harness();
  const code = timeattackRace(h, ['Anna', 'Bob']);
  h.advance(30_000);
  h.mgr.finish(sock('s1'), { ticks: 2400, attempt: 1 });
  h.mgr.giveUp(sock('s1'));
  assert.equal(player(h, code, 'Anna').state, 'finished');
  h.mgr.giveUp(sock('s2'));
  const s = h.lastState(code);
  assert.equal(s.phase, 'results');
  assert.equal(s.results[0].name, 'Anna');
  assert.equal(s.results[0].ticks, 2400);
  assert.equal(s.results[1].dnf, true);
});

test('Zeitjagd: nachgespielt wird das Log des BESTEN Laufs', async () => {
  const jobs = [];
  const h = harness({}, { verify: async (job) => { jobs.push(job); return { status: 'ok', ticks: job.ticks, deaths: 0, splits: [] }; } });
  const code = timeattackRace(h, ['Anna']);
  h.advance(30_000);
  h.mgr.finish(sock('s1'), { ticks: 3000, attempt: 1, log: [0, 1], fp: 'abc' });
  h.mgr.finish(sock('s1'), { ticks: 2000, attempt: 2, log: [0, 2], fp: 'abc' });
  h.mgr.finish(sock('s1'), { ticks: 2500, attempt: 3, log: [0, 3], fp: 'abc' });
  h.mgr.giveUp(sock('s1'));
  await new Promise((r) => setImmediate(r));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].ticks, 2000);
  assert.deepEqual(jobs[0].log, [0, 2]);
  assert.equal(h.lastState(code).results[0].verified, true);
});

test('Rennen: sobald jemand im Ziel ist, steht die DNF-Frist (dnfAt) im Zustand', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  startRace(h, code, 2);
  assert.equal(h.lastState(code).round.dnfAt, null);
  h.advance(5000);
  h.mgr.finish(sock('s1'), { ticks: 500 });
  const s = h.lastState(code);
  assert.equal(s.round.dnfAt, h.now() + 60_000);
  assert.equal(s.round.endAt, null);
});

test('Sitzung: Punkte und Siege über mehrere Einzelrennen; zurück in die Lobby beginnt alles neu, auch die Rundennummer', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  startRace(h, code, 2);
  assert.equal(h.lastState(code).session, null, 'vor der ersten beendeten Runde keine Sitzungswertung');
  h.advance(5000);
  h.mgr.finish(sock('s1'), { ticks: 500 });
  h.mgr.finish(sock('s2'), { ticks: 550 });
  let s = h.lastState(code);
  assert.equal(s.session.rounds, 1);
  assert.deepEqual(s.session.standings.map((r) => [r.name, r.points, r.wins]), [['Anna', 2, 1], ['Bob', 1, 0]]);

  // Zweites Einzelrennen: Bob gewinnt
  h.mgr.start(sock('s1'), { mode: 'new' });
  h.mgr.ready(sock('s1'), { hash: HASH, checkpoints: 3 });
  h.mgr.ready(sock('s2'), { hash: HASH, checkpoints: 3 });
  h.advance(4000);
  h.advance(5000);
  h.mgr.finish(sock('s2'), { ticks: 400 });
  h.mgr.finish(sock('s1'), { ticks: 450 });
  s = h.lastState(code);
  assert.equal(s.roundNumber, 2);
  assert.equal(s.session.rounds, 2);
  assert.deepEqual(s.session.standings.map((r) => [r.name, r.points, r.wins]), [['Anna', 3, 1], ['Bob', 3, 1]]);

  h.mgr.toLobby(sock('s1'));
  s = h.lastState(code);
  assert.equal(s.session, null);
  assert.equal(s.roundNumber, 0);
  const alteIds = new Set(h.events.filter((e) => e.event === 'sr:state' && e.payload.round).map((e) => e.payload.round.id));
  h.mgr.start(sock('s1'));
  assert.equal(h.lastState(code).round.number, 1, 'neue Sitzung zählt wieder ab Runde 1');
  assert.ok(!alteIds.has(h.lastState(code).round.id), 'die Runden-id ist trotzdem neu (Schlüssel für Versuche im Browser)');
});

test('Positionen: gebündelt höchstens alle 100 ms, nur von Läufern im Rennen, Unsinn wird verworfen', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  // Vor dem Rennen: nichts
  h.mgr.position(sock('s1'), { x: 10, y: 20, t: 5 });
  startRace(h, code, 2);
  const posEvents = () => h.events.filter((e) => e.event === 'sr:pos');
  assert.equal(posEvents().length, 0);

  h.mgr.position(sock('s1'), { x: 10.6, y: 20.2, f: -1, t: 50, a: 1 });
  h.mgr.position(sock('s2'), { x: 30, y: 40, t: 50 });
  h.mgr.position(sock('s1'), { x: 12, y: 20, f: -1, t: 60, a: 1 });   // überschreibt die erste
  h.mgr.position(sock('s2'), { x: NaN, y: 0, t: 1 });                  // verworfen
  h.mgr.position(sock('s2'), { x: 1, y: 1, t: -5 });                   // verworfen
  assert.equal(posEvents().length, 0, 'erst nach dem Takt');
  h.advance(100);
  assert.equal(posEvents().length, 1);
  const ids = Object.fromEntries(h.lastState(code).players.map((p) => [p.name, p.id]));
  assert.deepEqual(posEvents()[0].payload.list, [[ids.Anna, 12, 20, -1, 60, 1], [ids.Bob, 30, 40, 1, 50, 0]]);

  // Ohne neue Positionen wird nichts verschickt
  h.advance(1000);
  assert.equal(posEvents().length, 1);

  // Wer im Ziel ist, fällt aus der Liste
  h.advance(3000);
  h.mgr.finish(sock('s1'), { ticks: 400 });
  h.mgr.position(sock('s1'), { x: 1, y: 1, t: 1 });
  h.mgr.position(sock('s2'), { x: 31, y: 40, t: 70 });
  h.advance(100);
  assert.deepEqual(posEvents()[1].payload.list, [[ids.Bob, 31, 40, 1, 70, 0]]);
});
