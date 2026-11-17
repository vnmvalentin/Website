// Tests der Kampf-Auswertung.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, byDay, crownSet, currentStreak, deckStats, deckFit, deckKey, rankedChange, winsBefore } from '../analysis.js';

const card = (id, elixir = 3, lvl = 14) => ({ id, name: id, elixir, lvl });
const DECK = ['knight', 'archers', 'fireball', 'musketeer', 'skeletons', 'ice-spirit', 'the-log', 'hog-rider'].map((id, i) => card(id, [3, 3, 4, 4, 1, 1, 2, 4][i]));
const MK = ['mega-knight', 'bats', 'zap', 'miner', 'wall-breakers', 'inferno-dragon', 'goblin-gang', 'arrows'].map((id) => card(id, 3, 15));
const OTHER = ['golem', 'night-witch', 'baby-dragon', 'lightning', 'tornado', 'lumberjack', 'mega-minion', 'barbarian-barrel'].map((id) => card(id, 4, 14));

let clock = Date.UTC(2026, 10, 14, 20);
/** Ein 1v1-Kampf; jeder Aufruf liegt eine Stunde vor dem vorherigen (neueste zuerst). */
function battle(result, oppCards, extra = {}) {
  clock -= 60 * 60 * 1000;
  const [f, a] = extra.crowns || (result === 'win' ? [2, 1] : result === 'loss' ? [0, 1] : [1, 1]);
  return {
    t: clock, group: extra.group || 'ranked', result, rounds: extra.rounds || null,
    team: [{ tag: 'ME', name: 'Ich', cards: extra.myCards || DECK, tower: null, avgLevel: extra.myLevel ?? 14, crowns: f, leaked: extra.leaked?.[0] ?? null, start: extra.start ?? null, change: extra.change ?? null }],
    opponent: [{ tag: 'OP', name: 'Gegner', cards: oppCards, tower: null, avgLevel: extra.oppLevel ?? 14, crowns: a, leaked: extra.leaked?.[1] ?? null }],
  };
}

test('deckStats: Ø Elixier und ein Umlauf (vier billigste Karten)', () => {
  assert.deepEqual(deckStats(DECK), { avgElixir: 2.8, cycle: 7 });
  assert.deepEqual(deckStats([]), { avgElixir: null, cycle: null });
  assert.deepEqual(deckStats([{ id: 'mirror', elixir: null }, card('zap', 2)]), { avgElixir: 2, cycle: null });
});

test('deckKey hängt nicht von der Reihenfolge ab', () => {
  assert.equal(deckKey(DECK), deckKey([...DECK].reverse()));
});

test('Bilanz und Gruppen', () => {
  const list = [battle('win', OTHER), battle('win', OTHER), battle('win', OTHER), battle('loss', MK), battle('draw', OTHER), battle('win', OTHER, { group: 'ladder' })];
  const a = analyze(list);
  assert.deepEqual([a.count, a.decided, a.wins, a.losses, a.draws], [6, 5, 4, 1, 1]);
  assert.equal(a.winRate, 0.8);
  assert.deepEqual(a.byGroup.map((g) => [g.group, g.n, g.wins]), [['ranked', 4, 3], ['ladder', 1, 1]]);
  assert.equal(a.form.length, 6);
});

test('Form: Ausschlag nach Kronen-Unterschied, im Duell nach gewonnenen Runden', () => {
  const list = [
    battle('win', OTHER, { crowns: [3, 0] }), battle('loss', OTHER, { crowns: [1, 2] }), battle('draw', OTHER),
    battle('win', OTHER, { crowns: [2, 3], rounds: [{ f: 0, a: 3 }, { f: 1, a: 0 }, { f: 1, a: 0 }] }),
  ];
  assert.deepEqual(analyze(list).form.map((f) => [f.result, f.margin]), [['win', 3], ['loss', 1], ['draw', 0], ['win', 1]]);
});

test('Karten-Matchups: erst ab drei Begegnungen und nur mit klarer Tendenz', () => {
  const list = [battle('loss', MK), battle('loss', MK), battle('win', MK), battle('loss', MK), battle('win', OTHER), battle('win', OTHER), battle('win', OTHER)];
  const a = analyze(list);
  assert.deepEqual([a.hardAgainst[0].card.id, a.hardAgainst[0].n, a.hardAgainst[0].wins], ['mega-knight', 4, 1]);
  assert.deepEqual([a.strongAgainst[0].card.id, a.strongAgainst[0].wins], ['golem', 3]);
  assert.equal(a.hardAgainst.some((e) => e.card.id === 'golem'), false);
});

test('Level-Vergleich und verschenktes Elixier', () => {
  const list = [];
  for (let i = 0; i < 4; i += 1) list.push(battle('loss', OTHER, { myLevel: 13.5, oppLevel: 14.5, leaked: [4, 1] }));
  list.push(battle('win', OTHER, { myLevel: 14.5, oppLevel: 14, leaked: [2, 1] }));
  list.push(battle('win', OTHER, { myLevel: 14, oppLevel: 14, leaked: [1, 1] }));
  const a = analyze(list);
  assert.equal(a.level.n, 6);
  assert.deepEqual([a.level.under, a.level.even, a.level.over], [{ n: 4, wins: 0 }, { n: 1, wins: 1 }, { n: 1, wins: 1 }]);
  assert.deepEqual([a.level.avgMine, a.level.avgTheirs], [13.8, 14.3]);
  assert.deepEqual(a.leaked, { n: 6, mine: 3.2, theirs: 1 });
});

test('Zuletzt gespieltes Deck je Modus: Ranked steht vor Trophäenstraße, auch wenn der Ladder-Kampf neuer ist', () => {
  const list = [
    battle('win', OTHER, { group: 'ladder', myCards: MK }),
    battle('loss', OTHER, { group: 'ranked', myCards: DECK }),
    battle('win', OTHER, { group: 'ranked', myCards: OTHER }),
  ];
  const a = analyze(list);
  assert.deepEqual(a.latestDecks.map((d) => [d.group, d.cards[0].id]), [['ranked', 'knight'], ['ladder', 'mega-knight']]);
});

test('Decks: gleiche Karten in anderer Reihenfolge sind ein Deck; Verlauf nur mit bekanntem Stand', () => {
  const list = [
    battle('win', OTHER, { start: 1800, change: 30 }), battle('loss', OTHER, { myCards: [...DECK].reverse(), start: 1828, change: -28 }),
    battle('win', OTHER, { start: 1800, change: 28 }), battle('win', OTHER, { myCards: MK }),
  ];
  const a = analyze(list);
  assert.deepEqual(a.decks.map((d) => [d.n, d.wins]), [[3, 2], [1, 1]]);
  assert.equal(a.decks[0].avgElixir, 2.8);
  assert.deepEqual(a.lines[0].points.map((p) => p.v), [1828, 1800, 1830]);
});

test('2v2 zählt in die Bilanz, aber nicht in Karten- und Deck-Auswertung', () => {
  const twoVsTwo = battle('loss', MK);
  twoVsTwo.team.push({ ...twoVsTwo.team[0], tag: 'PA' });
  twoVsTwo.opponent.push({ ...twoVsTwo.opponent[0], tag: 'OB' });
  const a = analyze([twoVsTwo, twoVsTwo, twoVsTwo]);
  assert.equal(a.losses, 3);
  assert.equal(a.hardAgainst.length, 0);
  assert.equal(a.decks.length, 0);
  assert.equal(a.latestDecks.length, 0);
});

test('deckFit: Ø-Level, schwächste und fehlende Karten', () => {
  const owned = new Map([['knight', { lvl: 14 }], ['archers', { lvl: 11 }], ['n:Neue Karte', { lvl: 9 }]]);
  const fit = deckFit([card('knight'), card('archers'), card('golem'), { id: null, name: 'Neue Karte' }], owned);
  assert.deepEqual([fit.avgLevel, fit.minLevel, fit.missing.map((c) => c.id)], [11.3, 9, ['golem']]);
});

test('Bilanz je Tag: neuester Tag zuerst, Medaillen und Trophäen getrennt, Unentschieden zählen nicht', () => {
  const at = (iso, result, extra) => ({ ...battle(result, OTHER, extra), t: Date.parse(iso) });
  const list = [
    at('2026-11-14T18:00:00Z', 'win', { start: 1800, change: 30 }), at('2026-11-14T09:00:00Z', 'loss', { start: 1828, change: -28 }),
    at('2026-11-14T08:00:00Z', 'draw'), at('2026-11-13T20:00:00Z', 'win', { group: 'ladder', change: 31 }),
    at('2026-11-13T19:00:00Z', 'win', { group: 'party', change: 5 }),
    // Liga 1–6: die API meldet pauschal 30, gezählt wird eine Stufe
    at('2026-11-13T18:00:00Z', 'win', { change: 30 }), at('2026-11-13T17:00:00Z', 'win', { change: 30 }),
  ];
  const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
  assert.deepEqual(byDay(list, utcDay).map((d) => [d.key, d.n, d.wins, d.medals, d.steps, d.trophies]),
    [['2026-11-14', 2, 1, 2, 0, 0], ['2026-11-13', 4, 4, 0, 2, 31]]);
  assert.deepEqual(byDay([]), []);
  assert.equal(analyze(list).days.reduce((s, d) => s + d.n, 0), 6);
});

test('Ranked: Stufen unterhalb von UC, Medaillen ab UC', () => {
  // Echte Form aus dem Battlelog (Liga 4): Sieger trophyChange 30, Verlierer nichts, kein Stand
  assert.deepEqual(rankedChange(battle('win', OTHER, { change: 30 })), { kind: 'steps', delta: 1 });
  assert.deepEqual(rankedChange(battle('loss', OTHER)), { kind: 'steps', delta: -1 });
  assert.equal(rankedChange(battle('draw', OTHER)), null);
  // Liga aus der API entscheidet vor dem Stand
  assert.deepEqual(rankedChange({ ...battle('win', OTHER, { change: 30 }), league: 4 }), { kind: 'steps', delta: 1 });
  assert.deepEqual(rankedChange({ ...battle('win', OTHER, { change: 31 }), league: 7 }), { kind: 'medals', delta: 31 });
  // Ohne Liga: Stand im Kampf = Ultimate Champion
  assert.deepEqual(rankedChange(battle('loss', OTHER, { start: 1900, change: -27 })), { kind: 'medals', delta: -27 });
  assert.equal(rankedChange(battle('win', OTHER, { group: 'ladder', change: 31 })), null);
});

test('Laufende Serie: zählt die neuesten entschiedenen Kämpfe mit gleichem Ausgang', () => {
  assert.deepEqual(currentStreak([battle('win', OTHER), battle('draw', OTHER), battle('win', OTHER), battle('loss', OTHER), battle('win', OTHER)]), { result: 'win', n: 2 });
  assert.deepEqual(currentStreak([battle('loss', OTHER), battle('win', OTHER)]), { result: 'loss', n: 1 });
  assert.equal(currentStreak([battle('draw', OTHER)]), null);
  assert.equal(analyze([]).streak, null);
});

test('Crown-Series-Set: Runden-Decks der neuesten Duelle, keine Karte doppelt, höchstens vier', () => {
  const D = (ids) => ids.map((id) => card(id));
  const A = D(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']);
  const B = D(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']);
  const C = D(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
  const OLD = D(['a1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8']); // teilt a1 mit A → ersetzt
  const E = D(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8']);
  const duelB = (decks, rounds) => { const b = battle('win', OTHER, { group: 'crown', rounds }); b.team[0].decks = decks; return b; };
  const list = [
    duelB([A, B], [{ f: 1, a: 0 }, { f: 1, a: 0 }]),
    duelB([C, A, B], [{ f: 0, a: 1 }, { f: 1, a: 0 }, { f: 1, a: 0 }]),
    duelB([OLD, E], [{ f: 1, a: 0 }, { f: 0, a: 1 }]),
    battle('win', OTHER),
  ];
  const s = crownSet(list);
  assert.deepEqual(s.decks.map((d) => d.cards[0].id), ['a1', 'b1', 'c1', 'e1']);
  assert.deepEqual(s.decks.map((d) => [d.rounds, d.wins]), [[2, 2], [2, 2], [1, 0], [1, 0]]);
  assert.equal(s.battles, 3);
  assert.equal(crownSet([battle('win', OTHER)]), null);
});

test('Crown-Series-Set aus gemerkten Duellen, wenn sie nicht mehr unter den letzten Kämpfen sind', () => {
  const D = (ids) => ids.map((id) => card(id));
  const A = D(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']);
  const B = D(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']);
  const C = D(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
  const recent = [battle('win', OTHER), battle('loss', MK)];
  // so kommen die Duelle aus dem Speicher: verkleinert auf Runden-Decks und Rundenergebnis
  const slim = (decks, rounds) => { const b = battle('win', OTHER, { group: 'crown', rounds }); return { t: b.t, group: 'crown', result: 'win', rounds, team: [{ tag: 'ME', decks }] }; };
  const older = slim([A, B], [{ f: 1, a: 0 }, { f: 1, a: 0 }]);
  const oldest = slim([C, A], [{ f: 0, a: 1 }, { f: 1, a: 0 }]);
  assert.equal(analyze(recent).crownSet, null);
  const a = analyze(recent, { crown: [older, oldest] });
  assert.deepEqual(a.crownSet.decks.map((d) => d.cards[0].id), ['a1', 'b1', 'c1']);
  assert.deepEqual(a.crownSet.decks.map((d) => [d.rounds, d.wins]), [[2, 2], [1, 1], [1, 0]]);
  assert.equal(a.crownSet.t, older.t);
  assert.equal(a.count, 2); // die gemerkten Duelle zählen nur fürs Set, nicht für Bilanz und Form
  // Steht ein Duell in beiden Listen, zählt es einmal
  const full = battle('win', OTHER, { group: 'crown', rounds: [{ f: 1, a: 0 }, { f: 1, a: 0 }] });
  full.team[0].decks = [A, B];
  const both = analyze([full, ...recent], { crown: [{ t: full.t, group: 'crown', result: 'win', rounds: full.rounds, team: [{ tag: 'ME', decks: [A, B] }] }] });
  assert.equal(both.crownSet.battles, 1);
  assert.deepEqual(both.crownSet.decks.map((d) => [d.rounds, d.wins]), [[1, 1], [1, 1]]);
});

test('Siege vor dem Kampf: fehlender Stand heißt in Läufen 0, bei Spaß-Events nichts', () => {
  const run = (group, me, opp, extra = {}) => ({ group, mode: '', team: [{ start: me }], opponent: [{ start: opp }], ...extra });
  const both = (b) => [winsBefore(b, b.team[0], true), winsBefore(b, b.opponent[0])];
  // Grand Challenge: API lässt startingTrophies bei 0 weg — beide Seiten
  assert.deepEqual(both(run('party', undefined, undefined, { mode: 'Challenge_AllCards_EventDeck_NoSet' })), [0, 0]);
  assert.deepEqual(both(run('party', 4, undefined, { challenge: 'grand', mode: 'Challenge_AllCards_EventDeck_NoSet' })), [4, 0]);
  // challengeWinCountBefore gilt nur für den eigenen Spieler
  assert.deepEqual(both(run('party', undefined, undefined, { challengeWins: 3 })), [3, 0]);
  // Crown Series und Turniere zählen Siege ab 1
  assert.deepEqual(both(run('crown', undefined, 2)), [0, 2]);
  assert.deepEqual(both(run('tournament', 5, undefined)), [5, 0]);
  // Event mit Siegzählung erkennt man an der anderen Seite; Spaß-Events ohne Stand bekommen nichts
  assert.deepEqual(both(run('party', 3, undefined, { mode: 'Chaos_1v1_MegaDraft_S3' })), [3, 0]);
  assert.deepEqual(both(run('party', undefined, undefined, { mode: 'Showdown_Friendly' })), [null, null]);
  // Global Tournament: nur was die API ausdrücklich nennt
  assert.deepEqual(both(run('tournament', undefined, undefined, { challenge: 'global', challengeWins: 7 })), [7, null]);
  // andere Modi: keine Siege
  assert.deepEqual(both(run('ladder', 9000, 8900)), [null, null]);
  assert.deepEqual(both(run('ranked', undefined, undefined)), [null, null]);
});
