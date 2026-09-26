// Tests der Serie (Phase 4): mehrere Runden mit Punkten, Mischung aus Zufalls-, Tages- und Custom-Leveln.
// Die Raum-Logik selbst (Countdown, Checkpoints, Ziel, Anti-Cheat) ist in roomManager.test.js / antiCheat.test.js
// abgedeckt; hier geht es nur um das, was die Serie dazu tut: Rundenplan, Punkte, Gesamtwertung, Custom-Runden.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HASH, harness, room, sock } = require('./harness');
const { dailyDateOf } = require('../daily');

const flush = () => new Promise((resolve) => setImmediate(resolve));
const LOG = [0, 1, 200, 0];
const CUSTOM_HASH = 'a1'.repeat(32);   // 64 Hex-Zeichen wie ein echter Inhalts-Hash (SHA-256)

function fakeVerify(verdicts = {}) {
  const calls = [];
  const verify = async (job) => {
    calls.push(job);
    const v = verdicts[job.ticks] || { status: 'ok' };
    return v.status === 'ok' ? { status: 'ok', ticks: job.ticks, deaths: 0, splits: [], ...v } : v;
  };
  return { verify, calls };
}

// Ein Level, das der Raum als Custom-Runde findet ('SR-AAA-BBB'); alles andere gibt es nicht (gelöscht/ausgeblendet).
function levelLookup() {
  const calls = [];
  const resolveCustomLevel = (code) => {
    calls.push(code);
    return code === 'SR-AAA-BBB' ? { code, hash: CUSTOM_HASH, name: 'Wiesenlauf', creatorName: 'alice', doc: { width: 30, id: code } } : null;
  };
  return { calls, resolveCustomLevel };
}

const ready = (h, names, hash) => names.forEach((_, i) => assert.equal(h.mgr.ready(sock(`s${i + 1}`), { hash, checkpoints: 0 }).ok, true));

function finish(h, i, ticks, over = {}) {
  return h.mgr.finish(sock(`s${i}`), { ticks, deaths: 0, splits: [], log: LOG, fp: 'abc', ...over });
}

// ── Einstellungen ────────────────────────────────────────────────────────────

test('Einstellungen: Rundenzahl wird auf 1–5 begrenzt, die Liste immer auf diese Länge gebracht', () => {
  const h = harness();
  const code = room(h);
  h.mgr.setSettings(sock('s1'), { rounds: 3 });
  assert.equal(h.lastState(code).settings.rounds, 3);
  assert.deepEqual(h.lastState(code).settings.playlist, [{ kind: 'random' }, { kind: 'random' }, { kind: 'random' }]);

  h.mgr.setSettings(sock('s1'), { rounds: 0 });
  assert.equal(h.lastState(code).settings.rounds, 3, 'außerhalb 1–5 wird ignoriert');
  h.mgr.setSettings(sock('s1'), { rounds: 6 });
  assert.equal(h.lastState(code).settings.rounds, 3);

  h.mgr.setSettings(sock('s1'), { rounds: 2, playlist: [{ kind: 'custom', code: 'sr 7k2 qx9' }, { kind: 'custom', code: 'quatsch' }] });
  assert.deepEqual(h.lastState(code).settings.playlist, [{ kind: 'custom', code: 'SR-7K2-QX9' }, { kind: 'random' }], 'Code wird normalisiert, Unsinn fällt auf Zufall zurück');

  h.mgr.setSettings(sock('s1'), { rounds: 4 });
  assert.deepEqual(
    h.lastState(code).settings.playlist,
    [{ kind: 'custom', code: 'SR-7K2-QX9' }, { kind: 'random' }, { kind: 'random' }, { kind: 'random' }],
    'wächst mit Zufallsrunden, die ersten beiden bleiben',
  );

  h.mgr.setSettings(sock('s1'), { includeDaily: true });
  assert.equal(h.lastState(code).settings.includeDaily, true);
  h.mgr.setSettings(sock('s1'), { includeDaily: 'ja' });
  assert.equal(h.lastState(code).settings.includeDaily, true, 'nur echte Booleans zählen');
});

test('Ein einzelnes Rennen (rounds 1) ist eine Serie der Länge 1: gleiche Anzeige wie vor Phase 4', () => {
  const h = harness();
  const code = room(h, ['Anna']);
  h.mgr.start(sock('s1'));
  const s = h.lastState(code);
  assert.deepEqual(s.series, { index: 1, total: 1, plan: [{ kind: 'random' }], naechste: null, hasNext: false, standings: null });
  assert.equal(s.round.kind, 'random');
  assert.equal(s.round.custom, null);
});

test('"Tages-Level einbauen" setzt genau eine Runde auf "daily"; die anderen bleiben, was der Host geplant hat', () => {
  const h = harness({}, { randomInt: () => 1 });   // Position fest auf Index 1
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { rounds: 3, includeDaily: true });
  h.mgr.start(sock('s1'));
  const kinds = h.lastState(code).series.plan.map((e) => e.kind);
  assert.deepEqual(kinds, ['random', 'daily', 'random']);
});

// ── Rundenplan, Punkte, Gesamtwertung ────────────────────────────────────────

test('Serie über zwei Runden: Punkte je Runde, Gesamtwertung nach Punkten, "Nächste Runde" bis zum Ende', async () => {
  const { verify } = fakeVerify();
  const { resolveCustomLevel, calls } = levelLookup();
  const h = harness({}, { verify, resolveCustomLevel });
  const code = room(h, ['Anna', 'Bob', 'Cleo']);
  h.mgr.setSettings(sock('s1'), { rounds: 2, playlist: [{ kind: 'random' }, { kind: 'custom', code: 'SR-AAA-BBB' }] });
  h.mgr.start(sock('s1'));

  let s = h.lastState(code);
  assert.equal(s.round.kind, 'random');
  assert.equal(s.series.index, 1);
  assert.equal(s.series.total, 2);
  assert.deepEqual(s.series.plan, [{ kind: 'random' }, { kind: 'custom', code: 'SR-AAA-BBB' }]);
  assert.equal(s.series.hasNext, false, 'die erste Runde läuft noch, "hasNext" gilt nur im Ergebnis');
  // Alle drei stehen schon mit 0 Punkten in der Wertung, bevor überhaupt eine Runde gespielt wurde
  assert.deepEqual(s.series.standings.map((r) => [r.name, r.points]).sort(), [['Anna', 0], ['Bob', 0], ['Cleo', 0]]);

  // Runde 1 (Zufall): Anna 1., Bob 2., Cleo gibt auf → Punkte 3/2/0
  ready(h, ['Anna', 'Bob', 'Cleo'], HASH);
  h.advance(4000);    // Countdown → Rennen
  h.advance(3000);    // 3 s Renn-Zeit, genug für die Zielzeiten unten
  finish(h, 1, 200);
  finish(h, 2, 250);
  h.mgr.giveUp(sock('s3'));
  await flush();
  s = h.lastState(code);
  assert.equal(s.phase, 'results');
  assert.deepEqual(s.results.map((r) => [r.name, r.points]), [['Anna', 3], ['Bob', 2], ['Cleo', 0]]);
  assert.equal(s.series.hasNext, true);
  assert.deepEqual(s.series.standings.map((r) => [r.name, r.points]), [['Anna', 3], ['Bob', 2], ['Cleo', 0]]);
  assert.equal(calls.length, 0, 'die Custom-Runde ist erst dran, wenn sie beginnt');

  // Nur der Host darf weiter, und nur mit mode "next"
  assert.equal(h.mgr.start(sock('s2'), { mode: 'next' }).ok, false);
  assert.equal(h.mgr.start(sock('s1'), { mode: 'next' }).ok, true);
  s = h.lastState(code);
  assert.equal(s.round.kind, 'custom');
  assert.deepEqual(s.round.custom, { code: 'SR-AAA-BBB', name: 'Wiesenlauf', creatorName: 'alice' });
  assert.equal(calls.length, 1, 'jetzt wurde das Level aufgelöst');
  assert.equal(s.series.index, 2);
  assert.equal(s.series.hasNext, false, 'letzte Runde');
  // Das Dokument selbst steht nicht im Zustand (nur Code/Name/Ersteller) — es kommt per HTTP
  assert.ok(!JSON.stringify(s).includes('"width"'), 'kein Dokument in der Zustands-Nachricht');

  // Runde 2 (Custom): Bob 1., Anna 2. — der Hash ist autoritativ, keine Mehrheitsabstimmung nötig
  assert.equal(h.mgr.ready(sock('s1'), { hash: CUSTOM_HASH, checkpoints: 0 }).ok, true);
  assert.equal(h.mgr.ready(sock('s2'), { hash: CUSTOM_HASH, checkpoints: 0 }).ok, true);
  assert.equal(h.mgr.ready(sock('s3'), { hash: 'b2'.repeat(32), checkpoints: 0 }).ok, true, 'syntaktisch gültig, aber ein anderer Hash als der autoritative');
  assert.equal(h.lastState(code).players.find((p) => p.name === 'Cleo').state, 'incompatible', 'falscher Hash, obwohl in der Minderheit korrekt gezählt hätte werden können');
  h.advance(4000);    // Countdown → Rennen
  h.advance(3000);
  finish(h, 2, 100);
  finish(h, 1, 200);
  await flush();
  s = h.lastState(code);
  assert.deepEqual(s.results.map((r) => [r.name, r.points]), [['Bob', 2], ['Anna', 1]], 'Cleo war Zuschauerin, keine Punkte, kein Eintrag');
  assert.equal(s.series.hasNext, false);
  const byName = (list) => Object.fromEntries(list.map((r) => [r.name, r.points]));
  assert.deepEqual(byName(s.series.standings), { Anna: 4, Bob: 4, Cleo: 0 }, 'Punkte über beide Runden summiert');

  // Gleichstand Anna/Bob (je 4 Punkte): die Zeitsumme entscheidet
  const standings = s.series.standings;
  const anna = standings.find((r) => r.name === 'Anna');
  const bob = standings.find((r) => r.name === 'Bob');
  assert.equal(anna.timeSum, 200 + 200);
  assert.equal(bob.timeSum, 250 + 100);
  assert.ok(bob.timeSum < anna.timeSum, 'Bob hat die kleinere Zeitsumme');
  assert.equal(standings[0].name, 'Bob', 'bei Punktgleichstand gewinnt die kleinere Zeitsumme');

  // Am Ende der Serie geht "next" nicht mehr; der Host kann eine neue Serie beginnen oder zur Lobby
  assert.equal(h.mgr.start(sock('s1'), { mode: 'next' }).ok, true, 'ohne hasNext beginnt "next" schlicht eine neue Serie');
  assert.equal(h.lastState(code).series.index, 1, 'neue Serie, wieder bei Runde 1');
});

test('Custom-Level ist weg (gelöscht/ausgeblendet): die Runde wird zur Zufallsrunde, die Serie läuft weiter', () => {
  const h = harness({}, { resolveCustomLevel: () => null });
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { rounds: 1, playlist: [{ kind: 'custom', code: 'SR-ZZZ-ZZZ' }] });
  h.mgr.start(sock('s1'));
  const s = h.lastState(code);
  assert.equal(s.round.kind, 'random');
  assert.equal(s.round.custom, null);
  assert.deepEqual(s.series.plan, [{ kind: 'random' }], 'der Plan selbst wurde umgeschrieben');
  assert.ok(h.notices().some((t) => t.includes('SR-ZZZ-ZZZ') && t.includes('nicht mehr verfügbar')));
});

test('Ohne Level-Dienst (resolveCustomLevel fehlt) werden Custom-Runden zu Zufallsrunden, der Raum läuft weiter', () => {
  const h = harness();   // kein resolveCustomLevel in den Deps
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { playlist: [{ kind: 'custom', code: 'SR-AAA-BBB' }] });
  h.mgr.start(sock('s1'));
  assert.equal(h.lastState(code).round.kind, 'random');
});

test('Anti-Cheat einer Custom-Runde bekommt das Dokument mit, nicht nur Parameter', async () => {
  const { verify, calls } = fakeVerify();
  const { resolveCustomLevel } = levelLookup();
  const h = harness({}, { verify, resolveCustomLevel });
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { playlist: [{ kind: 'custom', code: 'SR-AAA-BBB' }] });
  h.mgr.start(sock('s1'));
  ready(h, ['Anna'], CUSTOM_HASH);
  h.advance(4000);
  h.advance(3000);
  finish(h, 1, 200);
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'custom');
  assert.deepEqual(calls[0].doc, { width: 30, id: 'SR-AAA-BBB' });
  assert.equal(calls[0].hash, CUSTOM_HASH);
  assert.equal(h.lastState(code).results[0].verified, true);
});

test('Tages-Runde in einer Serie: wie eine Zufallsrunde erzeugt, aber alle Läufe werden geprüft und kommen in die Tagesrangliste', async () => {
  const { verify, calls } = fakeVerify();
  const verified = [];
  const h = harness({}, { verify, dailyDateOf, onVerifiedRun: (run) => verified.push(run) });
  const code = room(h, ['Anna', 'Bob']);
  h.mgr.setSettings(sock('s1'), { includeDaily: true });
  h.mgr.start(sock('s1'));
  assert.equal(h.lastState(code).round.kind, 'daily');
  assert.equal(h.lastState(code).round.params.seed, 'daily-2026-09-21');
  ready(h, ['Anna', 'Bob'], HASH);
  h.advance(4000);
  h.advance(3000);
  finish(h, 1, 200);
  finish(h, 2, 250);
  await flush();
  assert.equal(calls.length, 2, 'beim Tages-Level werden alle geprüft, nicht nur der Sieger');
  assert.deepEqual(verified.map((v) => v.name), ['Anna', 'Bob']);
});

test('Niemand bereit mitten in einer Serie: zurück in die Lobby, die Serie (samt Punktestand) ist vorbei', () => {
  const h = harness();
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { rounds: 2 });
  h.mgr.start(sock('s1'));
  h.advance(60001);                                    // Ladefrist einer Pfad-Runde (60 s)
  const s = h.lastState(code);
  assert.equal(s.phase, 'lobby');
  assert.equal(s.series, null);
});

test('Zurück in die Lobby beendet eine laufende Serie; danach beginnt "Runde starten" eine neue', () => {
  const h = harness();
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { rounds: 2 });
  h.mgr.start(sock('s1'));
  ready(h, ['Anna'], HASH);
  h.advance(4000);
  h.mgr.giveUp(sock('s1'));
  assert.equal(h.lastState(code).series.hasNext, true);
  assert.equal(h.mgr.toLobby(sock('s1')).ok, true);
  assert.equal(h.lastState(code).series, null);
  h.mgr.start(sock('s1'));
  assert.deepEqual(h.lastState(code).series.plan, [{ kind: 'random' }, { kind: 'random' }], 'frischer Plan, keine alten Punkte');
});

// Phase D: Zufallsrunden einer Serie sind beim Start ausgewürfelt (Pfad, lang, super); die Parameter der nächsten Runde
// verrät der Zustand erst auf dem Ergebnisbildschirm — dort bauen die Browser das Level vor.
test('Phase D: Serie würfelt die Pfad-Runden vorab aus, die nächste erscheint erst im Ergebnis', async () => {
  const { verify } = fakeVerify();
  const h = harness({}, { verify });
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { rounds: 2, playlist: [{ kind: 'random' }, { kind: 'random' }] });
  h.mgr.start(sock('s1'));
  let s = h.lastState(code);
  assert.equal(s.round.params.gen, 'pfad');
  assert.equal(s.round.params.length, 'long');
  assert.equal(s.round.params.speedClass, 'super');
  assert.equal(s.series.naechste, null, 'während der Runde noch nicht verraten');
  ready(h, ['Anna'], HASH);
  h.advance(4000);
  h.advance(3000);
  finish(h, 1, 200);
  await flush();
  s = h.lastState(code);
  assert.equal(s.phase, 'results');
  const naechste = s.series.naechste;
  assert.ok(naechste && naechste.gen === 'pfad' && naechste.seed !== s.round.params.seed, 'nächste Runde mit eigenem Seed');
  h.mgr.start(sock('s1'), { mode: 'next' });
  s = h.lastState(code);
  assert.deepEqual(s.round.params, naechste, 'die angekündigte Runde ist genau die, die startet');
});

test('Phase D: Tages-Runde in der Serie nimmt die Parameter des Tages (ab dem Stichtag Pfad)', () => {
  const h = harness();
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { rounds: 1, seedMode: 'daily' });
  h.mgr.start(sock('s1'));
  const p = h.lastState(code).round.params;
  assert.ok(dailyDateOf(p), `Tages-Parameter nicht erkannt: ${JSON.stringify(p)}`);
});

test('Ein bestimmtes Zufallslevel (kind "seed", z. B. ein Favorit) spielt genau diesen Seed mit Pfad, lang und super', async () => {
  const { verify } = fakeVerify();
  const h = harness({}, { verify });
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { rounds: 2, playlist: [{ kind: 'seed', seed: 'lieblings-seed', biome: 'ice' }, { kind: 'seed', seed: '  x\n', biome: 'mond' }] });
  let s = h.lastState(code);
  assert.deepEqual(s.settings.playlist, [{ kind: 'seed', seed: 'lieblings-seed', biome: 'ice', gv: 1 }, { kind: 'seed', seed: 'x', biome: 'random', gv: 1 }], 'Seed bereinigt, unbekanntes Biom wird "random", fehlende Generator-Version = 1');
  h.mgr.setSettings(sock('s1'), { playlist: [{ kind: 'seed', seed: 'zukunft', biome: 'ice', gv: 99 }, { kind: 'seed', seed: 'lieblings-seed', biome: 'ice' }] });
  assert.equal(h.lastState(code).settings.playlist[0].kind, 'random', 'unbekannte Generator-Version = Zufall');
  h.mgr.setSettings(sock('s1'), { playlist: [{ kind: 'seed', seed: '   ', biome: 'ice' }, { kind: 'seed', seed: 'lieblings-seed', biome: 'ice' }] });
  assert.equal(h.lastState(code).settings.playlist[0].kind, 'random', 'leerer Seed = Zufall');

  h.mgr.start(sock('s1'));
  s = h.lastState(code);
  assert.equal(s.round.kind, 'random');
  assert.equal(s.series.plan[1].kind, 'seed');
  ready(h, ['Anna'], HASH);
  h.advance(4000);
  h.advance(3000);
  finish(h, 1, 200);
  await flush();
  s = h.lastState(code);
  assert.deepEqual(s.series.naechste, { seed: 'lieblings-seed', length: 'long', speedClass: 'super', biome: 'ice', gen: 'pfad', gv: 1 }, 'wird wie jede Pfad-Runde vorgebaut');
  h.mgr.start(sock('s1'), { mode: 'next' });
  assert.deepEqual(h.lastState(code).round.params, { seed: 'lieblings-seed', length: 'long', speedClass: 'super', biome: 'ice', gen: 'pfad', gv: 1 });
});
