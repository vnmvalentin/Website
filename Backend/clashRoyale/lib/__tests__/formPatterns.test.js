// Tests der Muster in den eigenen Kämpfen (formPatterns.js). Reine Funktion, keine Datenbank.
const test = require('node:test');
const assert = require('node:assert/strict');
const { formPatterns, fromScoutBattle, validTimeZone, SESSION_GAP_MS } = require('../formPatterns');

const MIN = 60 * 1000;
const H = 60 * MIN;
// Kampffolge: Ergebnisse als Zeichenkette ("WWLL…"), 5 Minuten Abstand, ab einem Startzeitpunkt (UTC)
const run = (start, results, extra = () => ({})) => [...results].map((r, i) => ({
  t: start + i * 5 * MIN, result: r === 'W' ? 'win' : r === 'L' ? 'loss' : 'draw', ...extra(i),
}));

test('Sitzungen und „nach Niederlagen in Folge“: nur innerhalb einer Sitzung, erster Kampf zählt nicht', () => {
  const day = Date.UTC(2026, 10, 10, 18);
  const p = formPatterns([...run(day, 'WLLW'), ...run(day + SESSION_GAP_MS + 2 * H, 'LW')]);
  assert.equal(p.sessions, 2);
  assert.equal(p.n, 6);
  // Sitzung 1: L nach W, L nach 1 L, W nach 2 L · Sitzung 2: W nach 1 L (das L am Anfang zählt nicht mit)
  assert.deepEqual(p.afterLosses.map((b) => [b.key, b.n, b.wins]), [['afterWin', 1, 0], ['after1', 2, 1], ['after2', 1, 1], ['after3', 0, 0]]);
  assert.deepEqual(p.sessionPos.map((b) => b.n), [5, 1, 0, 0]);
  assert.equal(p.currentLossStreak, 0);
});

test('Tilt-Tipp: nach zwei oder mehr Niederlagen deutlich schlechter als im Schnitt', () => {
  // Jede Sitzung: W W L L L L — nach 2+ Niederlagen immer verloren, Schnitt 33 %
  const sessions = Array.from({ length: 5 }, (_, i) => run(Date.UTC(2026, 10, 1 + i, 17), 'WWLLLL')).flat();
  const p = formPatterns(sessions);
  const tilt = p.tips.find((x) => x.key === 'tilt');
  assert.ok(tilt, JSON.stringify(p.tips));
  assert.equal(tilt.winRate, 0);
  assert.equal(tilt.n, 10);
  assert.equal(p.currentLossStreak, 4);
  assert.equal(p.tips[0].key, 'lossStreakNow'); // Warnung steht vorn
});

test('Ermüdung: spät in der Sitzung deutlich schlechter als zu Beginn', () => {
  // 3 Sitzungen à 12: die ersten drei gewonnen, ab dem 7. Kampf fast alles verloren
  const s = 'WWWWLWLLLLLL';
  const p = formPatterns([0, 1, 2].map((i) => run(Date.UTC(2026, 10, 3 + i, 12), s)).flat());
  const f = p.tips.find((x) => x.key === 'fatigue');
  assert.ok(f, JSON.stringify(p.tips));
  assert.equal(f.early, 1);
  assert.equal(f.from, 7);
});

test('Tageszeit in der Zeitzone des Betrachters; Tipp nur bei deutlichem Unterschied', () => {
  // 10 Kämpfe um 09:00 UTC (alle gewonnen), 10 um 21:00 UTC (alle verloren)
  const morning = Array.from({ length: 10 }, (_, i) => ({ t: Date.UTC(2026, 10, 1 + i, 9), result: 'win' }));
  const evening = Array.from({ length: 10 }, (_, i) => ({ t: Date.UTC(2026, 10, 1 + i, 21), result: 'loss' }));
  const berlin = formPatterns([...morning, ...evening], { tz: 'Europe/Berlin' });
  assert.deepEqual(berlin.timeOfDay.map((b) => [b.key, b.n]), [['night', 0], ['morning', 10], ['afternoon', 0], ['evening', 10]]);
  assert.deepEqual(berlin.tips.find((x) => x.key === 'bestTime'), { key: 'bestTime', tone: 'info', best: 'morning', bestRate: 1, worst: 'evening', worstRate: 0 });
  // In Los Angeles (UTC−8) liegen dieselben Kämpfe um 01:00 und 13:00
  const la = formPatterns([...morning, ...evening], { tz: 'America/Los_Angeles' });
  assert.deepEqual(la.timeOfDay.map((b) => b.n), [10, 0, 10, 0]);
  // ausgeglichen → kein Tipp
  const even = formPatterns(Array.from({ length: 20 }, (_, i) => ({ t: Date.UTC(2026, 10, 1 + i, i % 2 ? 9 : 21), result: i % 4 < 2 ? 'win' : 'loss' })));
  assert.equal(even.tips.some((x) => x.key === 'bestTime'), false);
});

test('Gegnerkarten und eigene Karten mit schlechter Bilanz, Level-Nachteil', () => {
  const c = (id) => ({ id, name: id });
  const deckA = ['knight', 'archers', 'fireball', 'musketeer', 'skeletons', 'ice-spirit', 'the-log', 'hog-rider'].map(c);
  const deckB = ['valkyrie', 'archers', 'fireball', 'musketeer', 'skeletons', 'ice-spirit', 'the-log', 'hog-rider'].map(c);
  const vsMk = ['mega-knight', 'bats', 'zap', 'miner', 'wall-breakers', 'inferno-dragon', 'goblin-gang', 'arrows'].map(c);
  const vsOther = ['golem', 'night-witch', 'baby-dragon', 'lightning', 'tornado', 'lumberjack', 'mega-minion', 'barbarian-barrel'].map(c);
  const battles = [];
  const add = (count, wins, myCards, oppCards, levelDiff = 0) => {
    for (let i = 0; i < count; i++) battles.push({ t: Date.UTC(2026, 9, 1) + battles.length * 3 * H, result: i < wins ? 'win' : 'loss', myCards, oppCards, levelDiff });
  };
  add(40, 32, deckA, vsOther); // Deck A gegen andere: 80 %
  add(20, 3, deckB, vsOther); // mit Valkyrie: 15 %
  add(15, 2, deckA, vsMk, -0.5); // gegen Mega Knight, mit niedrigeren Leveln: 13 %
  const p = formPatterns(battles);
  assert.equal(p.hardCards[0].card.id, 'mega-knight');
  assert.ok(p.weakCards.some((e) => e.card.id === 'valkyrie'), JSON.stringify(p.weakCards));
  assert.equal(p.levels.under.n, 15);
  assert.deepEqual(['hardCards', 'weakCards', 'underLevel'].filter((k) => p.tips.some((x) => x.key === k)), ['hardCards', 'weakCards', 'underLevel']);
  // Ein einziges Deck → keine „eigenen Karten mit schlechter Bilanz“
  assert.deepEqual(formPatterns(battles.map((b) => ({ ...b, myCards: deckA }))).weakCards, []);
});

test('Zufall ist kein Muster: 90 % Siegquote, eine Niederlage in vier Kämpfen gegen eine Karte → kein Tipp', () => {
  // Echter Fall (Nov. 2026): 32 Kämpfe, 29 Siege; gegen Furnace 3–1. Vorher hieß es „dort tust du dich schwer“.
  const c = (id) => ({ id, name: id });
  const deck = ['knight', 'archers', 'fireball', 'musketeer', 'skeletons', 'ice-spirit', 'the-log', 'hog-rider'].map(c);
  const furnace = ['furnace', 'bats', 'zap', 'miner', 'wall-breakers', 'inferno-dragon', 'goblin-gang', 'arrows'].map(c);
  const other = ['golem', 'night-witch', 'baby-dragon', 'lightning', 'tornado', 'lumberjack', 'mega-minion', 'barbarian-barrel'].map(c);
  const battles = Array.from({ length: 32 }, (_, i) => ({
    t: Date.UTC(2026, 9, 1) + i * 3 * H, result: i === 0 || i === 10 || i === 20 ? 'loss' : 'win', myCards: deck, oppCards: i < 4 ? furnace : other,
  }));
  const p = formPatterns(battles);
  assert.deepEqual(p.hardCards, []);
  assert.deepEqual(p.tips, []);
});

test('Wenige Kämpfe: Zahlen ja, Tipps nein; Unentschieden zählen nicht', () => {
  const p = formPatterns(run(Date.UTC(2026, 10, 1, 18), 'WLDLW'));
  assert.equal(p.n, 4);
  assert.deepEqual(p.tips, []);
  assert.deepEqual(formPatterns([]).tips, []);
  assert.equal(formPatterns(null).winRate, null);
});

test('Hilfen: Kampf der Stats in neutrale Form (nur 1v1), Zeitzonen prüfen', () => {
  const b = { t: 1, result: 'win', team: [{ cards: Array(8).fill({ id: 'knight' }), avgLevel: 14 }], opponent: [{ cards: Array(8).fill({ id: 'zap' }), avgLevel: 14.5 }] };
  assert.deepEqual(fromScoutBattle(b).levelDiff, -0.5);
  assert.equal(fromScoutBattle({ ...b, team: [b.team[0], b.team[0]] }), null);
  assert.equal(validTimeZone('Europe/Berlin'), 'Europe/Berlin');
  assert.equal(validTimeZone('Mars/Olympus'), null);
  assert.equal(validTimeZone(''), null);
});
