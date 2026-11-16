// Tests der Viewer Games (viewerGames.js + viewerGamesStore.js): Schätzen, Chat-Wordle, Saison-Bestenliste, Pixel.
// Speicher im Temp-Ordner, Chat-Bot als Attrappe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-viewer-games-test-'));
process.env.CR_VIEWER_GAMES_DB = path.join(tmpDir, 'vg.db');

const vg = require('../viewerGames');
const store = require('../viewerGamesStore');
const { ALL_CARDS } = require('../../core/cards');
const { seasonKeyAt } = require('../../lib/winTrackerRecap');

const said = [];
vg.attachIrc({ say: (ch, msg) => said.push([ch, msg]), refresh: async () => {} });
test.after(() => {
  store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const row = (user, settings) => ({ user_id: user, twitch_login: `kanal${user}`, settings });
const chat = (user, viewer, text, at) => vg.onChatMessage(`#kanal${user}`, { username: viewer, 'display-name': viewer.toUpperCase() }, text, at);

test('Schätzungen aus dem Chat lesen; Punkte nach Genauigkeit und nach Fehltipps', () => {
  assert.equal(vg.parseEstimate('1700'), 1700);
  assert.equal(vg.parseEstimate('1.697'), 1697);
  assert.equal(vg.parseEstimate('1,697'), 1697);
  assert.equal(vg.parseEstimate('1,7k'), 1700);
  assert.equal(vg.parseEstimate(' 720 '), 720);
  for (const no of ['hog', '1.5.2', '-3', '0', '']) assert.equal(vg.parseEstimate(no), null, no);
  assert.deepEqual([0, 0.03, 0.08, 0.15, 0.3, 0.9].map(vg.estimatePoints), [6, 5, 4, 3, 2, 1]);
  assert.deepEqual([0, 3, 7, 12, 18, 30].map(vg.wordlePoints), [6, 5, 4, 3, 2, 1]);
});

test('Wordle-Hinweise: Elixier und Jahr höher/tiefer, Seltenheit und Art gleich/anders', () => {
  const card = (id) => ALL_CARDS.find((c) => c.id === id);
  const h = vg.wordleHints(card('knight'), card('musketeer'));
  assert.deepEqual(h.elixir, { v: 3, r: 'up' }); // gesucht kostet mehr
  assert.deepEqual(h.rarity, { v: 'Common', r: 'no' });
  assert.deepEqual(h.type, { v: 'troop', r: 'eq' });
  assert.equal(h.year.r, 'eq');
  assert.equal(vg.wordleHints(card('fireball'), card('musketeer')).type.r, 'no');
});

test('Werte schätzen: wer am nächsten liegt gewinnt, bei Gleichstand der Frühere; Saison-Bestenliste', () => {
  const t0 = Date.UTC(2026, 10, 16, 18);
  const r = row('u1', { modes: ['stat'], estimateSeconds: 20, pauseSeconds: 5 });
  const v1 = vg.poll(r, t0);
  assert.equal(v1.round.mode, 'stat');
  assert.equal(v1.round.value, null); // der Wert bleibt bis zur Auflösung verborgen
  assert.ok(v1.round.cardName && ['hp', 'damage', 'dps'].includes(v1.round.stat));
  const value = vg._states.get('u1').round.value;
  assert.deepEqual(chat('u1', 'anna', `!tipp ${value + 10}`, t0 + 1000), { answered: true });
  chat('u1', 'ben', `!tipp ${value * 2}`, t0 + 2000);
  chat('u1', 'cem', `!guess ${value - 10}`, t0 + 3000); // gleich weit weg wie Anna, aber später
  assert.equal(chat('u1', 'dora', '!tipp viele', t0 + 4000), null); // keine Zahl
  assert.equal(vg.poll(r, t0 + 5000).round.answers, 3);
  const end = vg.poll(r, t0 + 21000);
  assert.equal(end.round.status, 'solved');
  assert.equal(end.round.winner, 'ANNA');
  assert.equal(end.round.value, value);
  assert.equal(end.round.winnerGuess, value + 10);
  assert.equal(end.round.points, vg.estimatePoints(10 / value));
  assert.equal(end.leaderboard[0].display, 'ANNA');
  assert.match(end.season, /2026/);
  assert.match(said.at(-1)[1], /^@ANNA lag am nächsten/);
  assert.equal(store.topSeason('u1', seasonKeyAt(t0), 5)[0].points, end.round.points);
  // Nach der Pause beginnt eine neue Runde
  assert.notEqual(vg.poll(r, t0 + 27000).round.id, end.round.id);
});

test('Schätzrunde ohne Schätzung: aufgelöst ohne Gewinner', () => {
  const t0 = Date.UTC(2026, 10, 16, 19);
  const r = row('u2', { modes: ['stat'], estimateSeconds: 10 });
  vg.poll(r, t0);
  const end = vg.poll(r, t0 + 11000);
  assert.equal(end.round.status, 'revealed');
  assert.equal(end.round.winner, null);
});

test('Chat-Wordle: Fehltipps mit Hinweisen, doppelte zählen nicht, Treffer gibt Punkte und verrät die Karte', () => {
  const t0 = Date.UTC(2026, 10, 16, 20);
  const r = row('u3', { modes: ['wordle'], wordleSeconds: 120, leaderboardScope: 'all' });
  const v1 = vg.poll(r, t0);
  assert.equal(v1.round.mode, 'wordle');
  assert.equal(v1.round.cardId, null); // geheim
  const secret = ALL_CARDS.find((c) => c.id === vg._states.get('u3').round.cardId);
  const others = ALL_CARDS.filter((c) => c.id !== secret.id).slice(0, 2);
  assert.deepEqual(chat('u3', 'anna', `!tipp ${others[0].name}`, t0 + 1000), { solved: false });
  assert.equal(chat('u3', 'ben', `!tipp ${others[0].name}`, t0 + 2000), null); // schon geraten
  chat('u3', 'ben', `!tipp ${others[1].name}`, t0 + 4000);
  const mid = vg.poll(r, t0 + 5000);
  assert.deepEqual(mid.round.guesses.map((g) => [g.name, g.by]), [[others[1].name, 'BEN'], [others[0].name, 'ANNA']]); // neueste zuerst
  assert.ok(mid.round.guesses[0].hints.elixir);
  assert.deepEqual(chat('u3', 'cem', `!tipp ${secret.name}`, t0 + 6000), { solved: true });
  const end = vg.poll(r, t0 + 6500);
  assert.equal(end.round.cardId, secret.id);
  assert.equal(end.round.points, vg.wordlePoints(2));
  assert.equal(end.leaderboard[0].display, 'CEM'); // Bestenliste über alle Zeiten
  assert.equal(end.season, null);
});

test('Pixel-Raten unverändert: Treffer auf Stufe 1 gibt 6 Punkte; Bestenliste leeren leert beide Wertungen', () => {
  const t0 = Date.UTC(2026, 10, 16, 21);
  const r = row('u4', { modes: ['pixel'], advance: 'time', stageSeconds: 8 });
  const v = vg.poll(r, t0);
  assert.equal(v.round.mode, 'pixel');
  assert.equal(v.round.stage, 0);
  const secret = ALL_CARDS.find((c) => c.id === vg._states.get('u4').round.cardId);
  assert.deepEqual(chat('u4', 'anna', `!tipp ${secret.name}`, t0 + 1000), { solved: true });
  assert.equal(vg.poll(r, t0 + 1500).round.points, 6);
  store.resetScores('u4');
  assert.deepEqual(store.top('u4', 5), []);
  assert.deepEqual(store.topSeason('u4', seasonKeyAt(t0), 5), []);
});

test('Einstellungen: unbekannte Modi fallen weg, Zeiten begrenzt', () => {
  const s = vg.normalizeSettings({ modes: ['stat', 'quatsch', 'wordle'], estimateSeconds: 3, wordleSeconds: 9999, leaderboardScope: 'irgendwas' });
  assert.deepEqual(s.modes, ['stat', 'wordle']);
  assert.equal(s.estimateSeconds, 10);
  assert.equal(s.wordleSeconds, 600);
  assert.equal(s.leaderboardScope, 'season');
});
