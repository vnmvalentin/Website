// Tests der Raum-Logik. Uhr und Timer sind von Hand steuerbar (advance), Nachrichten werden
// mitgeschrieben statt über ein Netz geschickt — so laufen ganze Rennen in Millisekunden durch.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_PLAYERS, PLAYER_COLORS } = require('../roomManager');

const { HASH, harness, sock, tok, room, startRace } = require('./harness');

// ── Anlegen und Beitreten ───────────────────────────────────────────────────

test('Raum anlegen: 5-stelliger Code, Ersteller ist Host, Standard-Einstellungen', () => {
  const h = harness();
  const res = h.mgr.create(sock('s1'), { name: '  Anna  ', token: tok(1) });
  assert.equal(res.ok, true);
  assert.match(res.code, /^[A-HJ-NP-Z2-9]{5}$/);
  const state = h.lastState(res.code);
  assert.equal(state.phase, 'lobby');
  assert.equal(state.players[0].name, 'Anna');
  assert.equal(state.hostId, res.you.id);
  assert.deepEqual(state.settings, {
    length: 'short', speedClass: 'normal', biome: 'random', seedMode: 'random', seed: '',
    rounds: 1, playlist: [{ kind: 'random' }], includeDaily: false,
  });
  assert.ok(h.joined.get('s1').has(res.code), 'Socket wurde dem Raum zugeordnet');
});

test('Beitreten, Namen säubern, Raum voll, unbekannter Code', () => {
  const h = harness();
  const code = room(h);
  const joined = h.mgr.join(sock('s2'), { code: code.toLowerCase(), name: 'Bob\n\u0000<b>', token: tok(2) });
  assert.equal(joined.ok, true);
  assert.equal(joined.state.players[1].name, 'Bob <b>', 'Steuerzeichen raus');
  assert.equal(h.mgr.join(sock('sx'), { code: 'ZZZZZ', name: 'X' }).error, 'Raum nicht gefunden.');
  for (let i = 3; i <= MAX_PLAYERS; i++) assert.equal(h.mgr.join(sock(`s${i}`), { code, name: `P${i}`, token: tok(i) }).ok, true);
  assert.equal(h.mgr.join(sock('s99'), { code, name: 'Zu viel', token: tok(99) }).error, 'Der Raum ist voll.');
  const long = h.mgr.create(sock('sl'), { name: 'x'.repeat(100), token: tok(50) });
  assert.equal(long.state.players[0].name.length, 24);
});

test('Spieler bekommen verschiedene Farben; Tokens und Kennungen sind nicht öffentlich vertauscht', () => {
  const h = harness();
  const code = room(h, ['A', 'B', 'C']);
  const players = h.lastState(code).players;
  assert.equal(new Set(players.map((p) => p.color)).size, 3);
  assert.equal(new Set(players.map((p) => p.id)).size, 3);
  assert.ok(!JSON.stringify(h.lastState(code)).includes(tok(1)), 'Token darf nie in der Zustandsnachricht stehen');
});

test('Host geht: nächster verbundener Spieler wird Host; leerer Raum verschwindet', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob', 'Cleo']);
  h.mgr.leave(sock('s1'));
  const state = h.lastState(code);
  assert.equal(state.players.length, 2);
  assert.equal(state.players.find((p) => p.isHost).name, 'Bob');
  assert.ok(h.notices().some((t) => t.includes('Bob ist jetzt Host')));
  h.mgr.leave(sock('s2'));
  h.mgr.leave(sock('s3'));
  assert.equal(h.mgr._rooms.size, 0);
});

test('Einstellungen: nur Host, nur in der Lobby, ungültige Werte werden ignoriert', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  assert.equal(h.mgr.setSettings(sock('s2'), { length: 'long' }).ok, false);
  assert.equal(h.mgr.setSettings(sock('s1'), { length: 'long', speedClass: 'super', biome: 'ice', seedMode: 'custom', seed: 'mein seed' }).ok, true);
  const withSeries = { length: 'long', speedClass: 'super', biome: 'ice', seedMode: 'custom', seed: 'mein seed', rounds: 1, playlist: [{ kind: 'random' }], includeDaily: false };
  assert.deepEqual(h.lastState(code).settings, withSeries);
  h.mgr.setSettings(sock('s1'), { length: 'riesig', speedClass: 'warp', biome: 'mars', seedMode: 'x', seed: { boese: 1 } });
  assert.deepEqual(h.lastState(code).settings, withSeries);
  h.mgr.start(sock('s1'));
  assert.equal(h.mgr.setSettings(sock('s1'), { length: 'short' }).ok, false, 'nicht während der Runde');
});

// ── Ablauf einer Runde ──────────────────────────────────────────────────────

test('Nur der Host startet; Start verteilt Seed und Einstellungen', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  assert.equal(h.mgr.start(sock('s2')).ok, false);
  h.mgr.setSettings(sock('s1'), { length: 'medium', speedClass: 'fast', biome: 'cave' });
  assert.equal(h.mgr.start(sock('s1')).ok, true);
  const state = h.lastState(code);
  assert.equal(state.phase, 'loading');
  assert.equal(state.round.number, 1);
  // Phase D: Zufallsrunden bauen mit Pfad — immer lang und „super“, das Biom kommt aus den Einstellungen
  assert.deepEqual(state.round.params, { seed: state.round.params.seed, length: 'long', speedClass: 'super', biome: 'cave', gen: 'pfad', gv: 1 });
  assert.match(state.round.params.seed, /^seed/);
  assert.ok(state.players.every((p) => p.state === 'loading'));
  assert.equal(h.mgr.start(sock('s1')).ok, false, 'läuft schon');
});

test('Countdown startet, sobald alle bereit sind; Startzeit liegt in der Zukunft; danach Rennen', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  h.mgr.start(sock('s1'));
  h.mgr.ready(sock('s1'), { hash: HASH, checkpoints: 3 });
  assert.equal(h.lastState(code).phase, 'loading', 'wartet auf Bob');
  h.mgr.ready(sock('s2'), { hash: HASH, checkpoints: 3 });
  const s = h.lastState(code);
  assert.equal(s.phase, 'countdown');
  assert.equal(s.round.startAt - s.serverNow, 4000);
  h.advance(3999);
  assert.equal(h.lastState(code).phase, 'countdown');
  h.advance(2);
  assert.equal(h.lastState(code).phase, 'racing');
  assert.ok(h.lastState(code).players.every((p) => p.state === 'racing'));
});

test('Wer nicht rechtzeitig bereit ist, wird Zuschauer; der Rest startet', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  h.mgr.start(sock('s1'));
  h.mgr.ready(sock('s1'), { hash: HASH, checkpoints: 3 });
  h.advance(60001);                                    // Ladefrist einer Pfad-Runde (60 s)
  const s = h.lastState(code);
  assert.equal(s.phase, 'countdown');
  assert.equal(s.players.find((p) => p.name === 'Bob').state, 'spectator');
});

test('Niemand bereit → zurück in die Lobby', () => {
  const h = harness();
  const code = room(h, ['Anna']);
  h.mgr.start(sock('s1'));
  h.advance(60001);                                    // Ladefrist einer Pfad-Runde (60 s)
  assert.equal(h.lastState(code).phase, 'lobby');
  assert.ok(h.notices().some((t) => t.includes('Niemand war rechtzeitig bereit')));
});

test('Abweichender Level-Hash: Minderheit wird ausgeschlossen und bekommt einen Hinweis', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob', 'Cleo']);
  h.mgr.start(sock('s1'));
  h.mgr.ready(sock('s1'), { hash: HASH, checkpoints: 3 });
  h.mgr.ready(sock('s2'), { hash: HASH, checkpoints: 3 });
  h.mgr.ready(sock('s3'), { hash: 'deadbeef', checkpoints: 3 });
  const s = h.lastState(code);
  assert.equal(s.phase, 'countdown');
  assert.equal(s.players.find((p) => p.name === 'Cleo').state, 'incompatible');
  assert.ok(h.events.some((e) => e.scope === 'socket' && e.socketId === 's3' && e.event === 'sr:notice'));
});

test('Ungültiger Hash wird abgelehnt', () => {
  const h = harness();
  room(h, ['Anna']);
  h.mgr.start(sock('s1'));
  assert.equal(h.mgr.ready(sock('s1'), { hash: 'zzz' }).ok, false);
  assert.equal(h.mgr.ready(sock('s1'), {}).ok, false);
});

test('Checkpoints: aufsteigend, nicht in der Zukunft, Wiederholungen harmlos; Live-Platzierung folgt dem Fortschritt', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  startRace(h, code, 2);
  h.advance(10_000);                                    // 10 s = 1200 Ticks
  assert.equal(h.mgr.checkpoint(sock('s2'), { index: 1, tick: 1000 }).ok, true);
  assert.equal(h.mgr.checkpoint(sock('s1'), { index: 1, tick: 1100 }).ok, true);
  assert.equal(h.mgr.checkpoint(sock('s1'), { index: 1, tick: 1100 }).ok, true, 'Wiederholung');
  assert.equal(h.mgr.checkpoint(sock('s1'), { index: 2, tick: 1150 }).ok, true);
  let players = h.lastState(code).players;
  assert.equal(players.find((p) => p.name === 'Anna').place, 1, 'weiter vorn: mehr Checkpoints');
  assert.equal(players.find((p) => p.name === 'Bob').place, 2);
  // Gleicher Fortschritt: wer den Checkpoint früher erreichte, liegt vorn
  h.mgr.checkpoint(sock('s2'), { index: 2, tick: 1120 });
  players = h.lastState(code).players;
  assert.equal(players.find((p) => p.name === 'Bob').place, 1);

  assert.equal(h.mgr.checkpoint(sock('s1'), { index: 3, tick: 99999 }).ok, false, 'Zeit in der Zukunft');
  assert.equal(h.mgr.checkpoint(sock('s1'), { index: 99, tick: 1200 }).ok, false, 'Index über der Gesamtzahl');
  assert.equal(h.mgr.checkpoint(sock('s1'), { index: 3, tick: 500 }).ok, false, 'Zeit vor dem letzten Checkpoint');
  assert.equal(h.mgr.checkpoint(sock('s1'), { index: 1.5, tick: 1200 }).ok, false);
});

test('Ziel: Frist von 60 s für die anderen, danach DNF; Ergebnis mit Abstand, Tode und besten Zwischenzeiten', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob', 'Cleo']);
  startRace(h, code, 3);
  h.advance(30_000);   // 3600 Ticks
  h.mgr.checkpoint(sock('s1'), { index: 1, tick: 900 });
  h.mgr.checkpoint(sock('s2'), { index: 1, tick: 950 });
  h.mgr.checkpoint(sock('s1'), { index: 2, tick: 2000 });
  h.mgr.checkpoint(sock('s2'), { index: 2, tick: 1900 });

  const fin = h.mgr.finish(sock('s1'), { ticks: 3000, deaths: 2, splits: [[1, 900], [2, 2000]] });
  assert.equal(fin.ok, true);
  h.advance(5_000);
  assert.equal(h.mgr.finish(sock('s2'), { ticks: 3400, deaths: 5, splits: [[1, 950], [2, 1900]] }).ok, true);
  assert.equal(h.lastState(code).phase, 'racing', 'Cleo ist noch unterwegs');

  h.advance(54_999);
  assert.equal(h.lastState(code).phase, 'racing');
  h.advance(2);
  const s = h.lastState(code);
  assert.equal(s.phase, 'results');
  const r = s.results;
  assert.deepEqual(r.map((e) => [e.name, e.place]), [['Anna', 1], ['Bob', 2], ['Cleo', 3]]);
  assert.equal(r[0].ticks, 3000);
  assert.equal(r[0].gap, 0);
  assert.equal(r[1].gap, 400);
  assert.equal(r[0].deaths, 2);
  assert.equal(r[2].dnf, true);
  assert.equal(r[2].ticks, null);
  assert.deepEqual(r[0].bestSplits, [1], 'Anna war bei Checkpoint 1 schneller');
  assert.deepEqual(r[1].bestSplits, [2], 'Bob bei Checkpoint 2');
});

test('Alle im Ziel → Runde endet sofort, ohne auf die Frist zu warten', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  startRace(h, code, 2);
  h.advance(20_000);
  h.mgr.finish(sock('s2'), { ticks: 2000, deaths: 0, splits: [] });
  assert.equal(h.lastState(code).phase, 'racing');
  h.mgr.finish(sock('s1'), { ticks: 2100, deaths: 1, splits: [] });
  assert.equal(h.lastState(code).phase, 'results');
  assert.equal(h.lastState(code).results[0].name, 'Bob');
});

test('Zielmeldung wird geprüft: zu früh, zu viele Ticks, kaputte Zwischenzeiten; zweite Meldung ändert nichts', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  startRace(h, code, 2);
  h.advance(10_000);
  assert.equal(h.mgr.finish(sock('s1'), { ticks: 30, deaths: 0 }).ok, false, 'unter 0,5 s');
  assert.equal(h.mgr.finish(sock('s1'), { ticks: 5000, deaths: 0 }).ok, false, 'mehr Ticks als vergangen');
  assert.equal(h.mgr.finish(sock('s1'), { ticks: 'schnell' }).ok, false);
  assert.equal(h.mgr.finish(sock('s1'), { ticks: 1000, deaths: 0, splits: [[2, 500], [1, 600]] }).ok, true, 'kaputte Splits werden verworfen, Ziel zählt');
  assert.equal(h.mgr.finish(sock('s1'), { ticks: 900, deaths: 0 }).ok, true, 'Wiederholung wird ignoriert');
  h.mgr.finish(sock('s2'), { ticks: 1100, deaths: 0 });
  const r = h.lastState(code).results;
  assert.equal(r[0].ticks, 1000);
  assert.deepEqual(r[0].splits, [], 'ungültige Zwischenzeiten übernommen wäre falsch');
});

test('Vor dem Start gibt es keine Meldungen; Zuschauer und Nicht-Racer werden abgewiesen', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  h.mgr.start(sock('s1'));
  h.mgr.ready(sock('s1'), { hash: HASH, checkpoints: 3 });
  assert.equal(h.mgr.finish(sock('s1'), { ticks: 1000 }).ok, false, 'noch Ladephase');
  h.advance(60001);                                    // Ladefrist einer Pfad-Runde (60 s)
  h.advance(4000);
  assert.equal(h.lastState(code).players.find((p) => p.name === 'Bob').state, 'spectator');
  assert.equal(h.mgr.finish(sock('s2'), { ticks: 100 }).ok, false);
  assert.equal(h.mgr.checkpoint(sock('s2'), { index: 1, tick: 10 }).ok, false);
});

test('Aufgeben: Spieler wird DNF; sind alle durch, endet die Runde', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  startRace(h, code, 2);
  h.advance(5000);
  h.mgr.giveUp(sock('s2'));
  assert.equal(h.lastState(code).phase, 'racing');
  h.mgr.giveUp(sock('s1'));
  const s = h.lastState(code);
  assert.equal(s.phase, 'results');
  assert.ok(s.results.every((e) => e.dnf));
});

test('Zeitlimit des Rennens beendet die Runde für alle Übriggebliebenen', () => {
  const h = harness();
  const code = room(h, ['Anna']);
  startRace(h, code, 1);
  // (Pfad-Runden sind lang: Zeitlimit 26 min)
  h.advance(26 * 60 * 1000 - 1);
  assert.equal(h.lastState(code).phase, 'racing');
  h.advance(2);
  assert.equal(h.lastState(code).phase, 'results');
});

// ── Nächste Runde ───────────────────────────────────────────────────────────

test('Revanche behält den Seed, "neue Runde" würfelt einen neuen; nur der Host darf', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  startRace(h, code, 2);
  const seed1 = h.lastState(code).round.params.seed;
  h.advance(3000);
  h.mgr.giveUp(sock('s1'));
  h.mgr.giveUp(sock('s2'));
  assert.equal(h.lastState(code).phase, 'results');

  assert.equal(h.mgr.start(sock('s2'), { mode: 'same' }).ok, false);
  assert.equal(h.mgr.start(sock('s1'), { mode: 'same' }).ok, true);
  assert.equal(h.lastState(code).round.params.seed, seed1);
  assert.equal(h.lastState(code).round.number, 2);
  assert.ok(h.lastState(code).results === null && h.lastState(code).players.every((p) => p.cp === 0 && p.finishTicks === null));

  h.mgr.ready(sock('s1'), { hash: HASH, checkpoints: 3 });
  h.mgr.ready(sock('s2'), { hash: HASH, checkpoints: 3 });
  h.advance(4000);
  h.mgr.giveUp(sock('s1'));
  h.mgr.giveUp(sock('s2'));
  h.mgr.start(sock('s1'), { mode: 'new' });
  assert.notEqual(h.lastState(code).round.params.seed, seed1);
  assert.equal(h.lastState(code).round.number, 3);
});

test('Zurück in die Lobby nur aus dem Ergebnis, nur für den Host', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  assert.equal(h.mgr.toLobby(sock('s1')).ok, false, 'nicht aus der Lobby');
  startRace(h, code, 2);
  h.advance(1000);
  h.mgr.giveUp(sock('s1'));
  h.mgr.giveUp(sock('s2'));
  assert.equal(h.mgr.toLobby(sock('s2')).ok, false);
  assert.equal(h.mgr.toLobby(sock('s1')).ok, true);
  const s = h.lastState(code);
  assert.equal(s.phase, 'lobby');
  assert.ok(s.players.every((p) => p.state === 'lobby'));
});

test('Tages-Seed: Seed aus dem Datum, Länge/Klasse/Biom fest; "neue Runde" würfelt trotzdem', () => {
  const h = harness();
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { seedMode: 'daily', length: 'long', speedClass: 'super', biome: 'ice' });
  h.mgr.start(sock('s1'));
  assert.deepEqual(h.lastState(code).round.params, { seed: 'daily-2026-09-21', length: 'medium', speedClass: 'normal', biome: 'random' });
});

test('Eigener Seed wird übernommen; leerer eigener Seed fällt auf Zufall zurück', () => {
  const h = harness();
  const code = room(h, ['Anna']);
  h.mgr.setSettings(sock('s1'), { seedMode: 'custom', seed: 'hallo welt' });
  h.mgr.start(sock('s1'));
  assert.equal(h.lastState(code).round.params.seed, 'hallo welt');
  const h2 = harness();
  const code2 = room(h2, ['Anna']);
  h2.mgr.setSettings(sock('s1'), { seedMode: 'custom', seed: '   ' });
  h2.mgr.start(sock('s1'));
  assert.match(h2.lastState(code2).round.params.seed, /^seed/);
});

// ── Verbindung ──────────────────────────────────────────────────────────────

test('Wiederverbinden mit Token: derselbe Spieler, mitten im Rennen bleibt der Fortschritt', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  startRace(h, code, 2);
  h.advance(10_000);
  h.mgr.checkpoint(sock('s2'), { index: 1, tick: 900 });
  h.mgr.disconnect(sock('s2'));
  assert.equal(h.lastState(code).players.find((p) => p.name === 'Bob').connected, false);
  assert.equal(h.lastState(code).phase, 'racing');

  h.advance(30_000);
  const back = h.mgr.join(sock('s2b'), { code, name: 'Bob', token: tok(2) });
  assert.equal(back.ok, true);
  assert.equal(back.reconnected, true);
  const bob = h.lastState(code).players.find((p) => p.name === 'Bob');
  assert.equal(bob.connected, true);
  assert.equal(bob.cp, 1);
  assert.equal(bob.state, 'racing');
  assert.equal(h.lastState(code).players.length, 2, 'kein doppelter Spieler');
  // Nach dem Wiederverbinden funktionieren Meldungen wieder
  assert.equal(h.mgr.checkpoint(sock('s2b'), { index: 2, tick: 2500 }).ok, true);
  // und die alte Frist läuft nicht mehr ab
  h.advance(3 * 60 * 1000);
  assert.equal(h.lastState(code).players.find((p) => p.name === 'Bob').state, 'racing');
});

test('Wer mitten im Rennen zwei Minuten wegbleibt, wird DNF; in der Lobby wird er entfernt', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob', 'Cleo']);
  h.mgr.disconnect(sock('s3'));
  h.advance(2 * 60 * 1000 + 1);
  assert.equal(h.lastState(code).players.length, 2, 'Cleo aus der Lobby entfernt');

  const h2 = harness();
  const code2 = room(h2, ['Anna', 'Bob']);
  startRace(h2, code2, 2);
  h2.advance(5000);
  h2.mgr.disconnect(sock('s2'));
  h2.advance(2 * 60 * 1000 + 1);
  assert.equal(h2.lastState(code2).players.find((p) => p.name === 'Bob').state, 'dnf');
  h2.mgr.finish(sock('s1'), { ticks: 15000, deaths: 0 });
  assert.equal(h2.lastState(code2).phase, 'results', 'Bob ist durch, Anna im Ziel → Ende');
});

test('Host trennt sich: Host wechselt sofort zu einem Verbundenen', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  h.mgr.disconnect(sock('s1'));
  assert.equal(h.lastState(code).players.find((p) => p.isHost).name, 'Bob');
});

test('Zweiter Tab mit demselben Token übernimmt den Platz; der alte Tab wird benachrichtigt', () => {
  const h = harness();
  const code = room(h, ['Anna']);
  h.mgr.join(sock('s1b'), { code, name: 'Anna', token: tok(1) });
  assert.equal(h.lastState(code).players.length, 1);
  assert.ok(h.events.some((e) => e.scope === 'socket' && e.socketId === 's1' && e.event === 'sr:kicked'));
  // Der Abbruch des alten Sockets darf den neuen nicht abschalten
  h.mgr.disconnect(sock('s1'));
  assert.equal(h.lastState(code).players[0].connected, true);
});

test('Späte Beitritte mitten in der Runde schauen zu und spielen in der nächsten mit', () => {
  const h = harness();
  const code = room(h, ['Anna']);
  startRace(h, code, 1);
  h.mgr.join(sock('s2'), { code, name: 'Spät', token: tok(2) });
  assert.equal(h.lastState(code).players.find((p) => p.name === 'Spät').state, 'spectator');
  assert.equal(h.mgr.finish(sock('s2'), { ticks: 100 }).ok, false);
  h.advance(5000);
  h.mgr.giveUp(sock('s1'));
  h.mgr.start(sock('s1'), { mode: 'new' });
  assert.equal(h.lastState(code).players.find((p) => p.name === 'Spät').state, 'loading');
});

test('Wer den Raum mitten im Rennen verlässt, ist DNF und steht in der Tabelle', () => {
  const h = harness();
  const code = room(h, ['Anna', 'Bob']);
  startRace(h, code, 2);
  h.advance(10_000);
  h.mgr.leave(sock('s2'));
  h.mgr.finish(sock('s1'), { ticks: 1100, deaths: 0 });
  const r = h.lastState(code).results;
  assert.deepEqual(r.map((e) => [e.name, e.dnf]), [['Anna', false], ['Bob', true]]);
});

test('Wechsel in einen anderen Raum verlässt den alten; aufräumen entfernt verlassene Räume', () => {
  const h = harness();
  const a = room(h, ['Anna']);
  const other = h.mgr.create(sock('s9'), { name: 'Ben', token: tok(9) });
  h.mgr.join(sock('s9'), { code: a, name: 'Ben', token: tok(9) });
  assert.equal(h.mgr._rooms.has(other.code), false, 'leerer alter Raum wurde entfernt');
  assert.equal(h.lastState(a).players.length, 2);

  h.mgr.disconnect(sock('s1'));
  h.mgr.disconnect(sock('s9'));
  h.advance(29 * 60 * 1000);
  h.mgr.sweep();
  assert.equal(h.mgr._rooms.size, 0, 'nach Ablauf der Gnadenfrist ist der Raum ohnehin weg');
});

test('ping liefert die Serverzeit zurück', () => {
  const h = harness();
  const res = h.mgr.ping(sock('s1'), { t: 12345 });
  assert.equal(res.t, 12345);
  assert.equal(res.serverNow, h.now());
});

test('Aktionen ohne Raum werden abgewiesen, nicht ignoriert oder abgestürzt', () => {
  const h = harness();
  for (const call of [
    () => h.mgr.setSettings(sock('x'), {}),
    () => h.mgr.start(sock('x')),
    () => h.mgr.ready(sock('x'), { hash: HASH }),
    () => h.mgr.checkpoint(sock('x'), { index: 1, tick: 5 }),
    () => h.mgr.finish(sock('x'), { ticks: 100 }),
    () => h.mgr.giveUp(sock('x')),
    () => h.mgr.toLobby(sock('x')),
  ]) assert.equal(call().ok, false);
  assert.equal(h.mgr.leave(sock('x')).ok, true);
  h.mgr.disconnect(sock('x'));
  assert.deepEqual(h.mgr.stats(), { rooms: 0, players: 0 });
});

test('Wunschfarbe: beim Anlegen/Beitreten, wenn frei; wechseln zwischen den Runden, nie auf eine vergebene Farbe', () => {
  const h = harness();
  const created = h.mgr.create(sock('s1'), { name: 'Anna', token: tok(1), color: '#14b8a6' });
  const code = created.code;
  h.mgr.join(sock('s2'), { code, name: 'Bob', token: tok(2), color: '#14b8a6' });      // schon vergeben
  h.mgr.join(sock('s3'), { code, name: 'Cleo', token: tok(3), color: '#123456' });     // keine Spielerfarbe
  const farbe = (name) => h.lastState(code).players.find((p) => p.name === name).color;
  assert.equal(farbe('Anna'), '#14b8a6');
  assert.notEqual(farbe('Bob'), '#14b8a6');
  assert.ok(PLAYER_COLORS.includes(farbe('Cleo')));

  assert.equal(h.mgr.setColor(sock('s2'), { color: '#14b8a6' }).ok, false, 'Annas Farbe bekommt Bob nicht');
  assert.equal(h.mgr.setColor(sock('s2'), { color: 'lila' }).ok, false);
  const frei = PLAYER_COLORS.find((c) => ![farbe('Anna'), farbe('Bob'), farbe('Cleo')].includes(c));
  assert.equal(h.mgr.setColor(sock('s2'), { color: frei }).ok, true);
  assert.equal(farbe('Bob'), frei);

  startRace(h, code, 3);
  assert.equal(h.mgr.setColor(sock('s1'), { color: PLAYER_COLORS.find((c) => ![farbe('Anna'), farbe('Bob'), farbe('Cleo')].includes(c)) }).ok, false, 'nicht mitten im Rennen');
});
