// Saisonrückblick: Saisongrenzen (erster Montag, 9:00 UTC) und Kennzahlen
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { seasonStartMs, seasonWindow, seasonLabel, seasonKeyAt, seasonKeysSince, modeGroup, modeOf, computeRecap } = require('../winTrackerRecap');

test('Saisonstart: erster Montag des Monats, 9:00 UTC', () => {
  assert.equal(new Date(seasonStartMs(2026, 9)).toISOString(), '2026-10-05T09:00:00.000Z'); // 1.10.2026 ist Donnerstag
  assert.equal(new Date(seasonStartMs(2026, 5)).toISOString(), '2026-06-01T09:00:00.000Z'); // 1.6.2026 ist Montag
  const w = seasonWindow('2026-12');
  assert.equal(new Date(w.end).toISOString(), '2027-01-04T09:00:00.000Z');
  assert.equal(seasonLabel('2026-12'), 'Dezember 2026');
  assert.equal(seasonLabel('2026-12', 'en'), 'December 2026');
  assert.equal(seasonWindow('2026-13'), null);
  assert.equal(seasonWindow('kaputt'), null);
});

test('Zeitpunkt → Saison: vor dem ersten Montag gehört er noch zur Vormonats-Saison', () => {
  assert.equal(seasonKeyAt(Date.UTC(2026, 9, 5, 8, 59)), '2026-09');
  assert.equal(seasonKeyAt(Date.UTC(2026, 9, 5, 9, 0)), '2026-10');
  assert.equal(seasonKeyAt(Date.UTC(2027, 0, 2)), '2026-12');
  assert.deepEqual(seasonKeysSince(Date.UTC(2026, 7, 20), Date.UTC(2026, 9, 15)), ['2026-10', '2026-09', '2026-08']);
  assert.deepEqual(seasonKeysSince(Date.UTC(2020, 0, 20), Date.UTC(2026, 9, 15), 2), ['2026-10', '2026-09']);
});

test('Modusgruppen aus echten game_mode-Werten', () => {
  assert.equal(modeGroup('Ranked1v1_NewArena2'), 'ranked');
  assert.equal(modeGroup('Ladder'), 'ladder');
  assert.equal(modeGroup('TeamVsTeam'), '2v2');
  assert.equal(modeGroup('7xElixir_Friendly'), 'friendly');
  assert.equal(modeGroup('Friendly'), 'friendly');
  assert.equal(modeGroup('Challenge_AllCards_EventDeck_NoSet'), 'events');
});

test('Kennzahlen: Serie chronologisch, Remis bricht die Serie, Trophäen nur aus Ranked/Ladder', () => {
  const t0 = Date.UTC(2026, 9, 6, 18); // 20 Uhr in Berlin
  const b = (i, result, extra = {}) => ({ battle_time_ms: t0 + i * 600000, result, trophy_change: 0, crowns_for: 1, game_mode: 'Ranked1v1_NewArena2', ...extra });
  const r = computeRecap([
    b(3, 'win', { crowns_for: 3, trophy_change: 30 }),
    b(0, 'win', { trophy_change: 30 }),
    b(1, 'win', { trophy_change: 30 }),
    b(2, 'draw'),
    b(4, 'loss', { trophy_change: -25 }),
    b(5, 'win', { game_mode: '7xElixir_Friendly', trophy_change: 14 }),
    b(6, 'win', { game_mode: 'Ladder', trophy_change: 31 }),
  ]);
  assert.deepEqual([r.matches, r.wins, r.losses, r.draws], [7, 5, 1, 1]);
  assert.equal(r.winRate, 83);
  assert.equal(r.longestWinStreak, 2);
  assert.equal(r.threeCrownWins, 1);
  // +30-Siege davor sind Ligastufen (Liga 1–6), Medaillen zählen erst ab dem ersten echten Medaillen-Match (−25)
  assert.equal(r.rankedMedals, -25);
  assert.deepEqual([r.climb.matches, r.climb.wins, r.climb.losses, r.climb.reachedUc], [4, 3, 0, true]);
  assert.equal(r.ladderTrophies, 31);
  assert.deepEqual(r.bestDay, { date: '2026-10-06', wins: 5 });
  assert.equal(r.topHour, 20);
  assert.deepEqual(r.modes[0], { mode: 'ranked', count: 5, wins: 3, losses: 1, draws: 1, subs: [], label: null });
  assert.equal(computeRecap([]).winRate, null);
});

test('Decks, Gain/Tilt-Tage, Kurve und Höchstwerte', () => {
  const ids = (x) => JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ id: `${x}${i}`, name: `${x}${i}`, variant: null })));
  const A = ids('a');
  const Arev = JSON.stringify(JSON.parse(A).reverse()); // gleiche Karten, andere Reihenfolge = dasselbe Deck
  const B = ids('b');
  const day1 = Date.UTC(2026, 9, 6, 12);
  const day2 = Date.UTC(2026, 9, 7, 12);
  const m = (t, result, change, deck = '') => ({ battle_time_ms: t, result, trophy_change: change, crowns_for: 1, game_mode: 'Ranked1v1_NewArena2', deck });
  const battles = [
    m(day1, 'win', 31, A), m(day1 + 1, 'win', 30, Arev), m(day1 + 2, 'loss', -25, A), m(day1 + 3, 'win', 30, A),
    m(day2, 'loss', -25, B), m(day2 + 1, 'loss', -25, B), m(day2 + 2, 'loss', -25, B), m(day2 + 3, 'win', 30, ''),
  ];
  const r = computeRecap(battles, { endMedals: 1500, snapshots: [{ season_medals: 1450, pol_rank: 900, league_number: 7 }, { season_medals: 1520, pol_rank: 640, league_number: 7 }] });
  assert.equal(r.decksTracked, 7);
  assert.deepEqual(r.decks.map((d) => [d.matches, d.wins, d.losses, d.winRate]), [[4, 3, 1, 75], [3, 0, 3, 0]]);
  assert.equal(r.longestLossStreak, 3);
  assert.deepEqual([r.biggestGain.date, r.biggestGain.net], ['2026-10-06', 66]);
  // Tilt = Absturz vom Hoch zum späteren Tief am Tag (drei Niederlagen), nicht die Tagesbilanz (−45)
  assert.deepEqual([r.biggestTilt.date, r.biggestTilt.net], ['2026-10-07', -75]);
  assert.deepEqual([r.biggestTilt.wins, r.biggestTilt.losses, r.biggestTilt.metric], [0, 3, 'medals']);
  assert.deepEqual([r.biggestTilt.from, r.biggestTilt.to], [1545, 1470]);
  assert.equal(r.curve.metric, 'medals');
  // 31, 61, 36, 66, 41, 16, −9, 21
  assert.deepEqual([r.curve.end, r.curve.max, r.curve.min], [21, 66, -9]);
  assert.equal(r.curve.points.length, 9);
  // rückwärts: Start in UC = 1500 − 21 = 1479, Höchststand 1479 + 66 = 1545 schlägt den Verlauf (1520)
  assert.deepEqual([r.medals.start, r.medals.end, r.medals.gain], [1479, 1500, 21]);
  assert.deepEqual(r.peak, { medals: 1545, rank: 640, league: 7 });
});

test('Gain/Tilt zählen nur die Matches der Kennzahl (Freundschaftsspiele verfälschen die Tagesbilanz nicht)', () => {
  const t = Date.UTC(2026, 9, 9, 12);
  const m = (i, result, change, game_mode) => ({ battle_time_ms: t + i, result, trophy_change: change, crowns_for: 1, game_mode });
  const r = computeRecap([
    m(0, 'loss', -30, 'Ranked1v1_NewArena2'), m(1, 'loss', -30, 'Ranked1v1_NewArena2'), m(2, 'win', 28, 'Ranked1v1_NewArena2'),
    ...Array.from({ length: 9 }, (_, i) => m(10 + i, 'win', 3, '7xElixir_Friendly')),
  ]);
  // Tilt: die zwei Ranked-Niederlagen (0–2), Freundschaftsspiele zählen nicht mit
  assert.deepEqual([r.biggestTilt.net, r.biggestTilt.wins, r.biggestTilt.losses], [-60, 0, 2]);
  assert.equal(r.bestDay.wins, 10, 'bester Tag (meiste Siege) zählt weiter alle Modi');
});

test('Kurve wird ausgedünnt, Hoch- und Tiefpunkt bleiben', () => {
  const battles = Array.from({ length: 500 }, (_, i) => ({
    battle_time_ms: i * 1000, result: i === 250 ? 'win' : i % 2 ? 'win' : 'loss',
    trophy_change: i === 250 ? 999 : i % 2 ? 30 : -30, crowns_for: 1, game_mode: 'Ladder',
  }));
  const r = computeRecap(battles);
  assert.equal(r.curve.metric, 'trophies');
  assert.ok(r.curve.points.length <= 125);
  assert.ok(r.curve.points.some((p) => p.v === r.curve.max));
  assert.equal(r.peak, null);
});

test('Aufstieg Liga 1–6 (+30/0) zählt nicht als Medaillen, UC-Einstieg und Startstand werden erkannt', () => {
  const t = Date.UTC(2026, 9, 10, 12);
  const m = (i, result, change) => ({ battle_time_ms: t + i * 60000, result, trophy_change: change, crowns_for: 1, game_mode: 'Ranked1v1_NewArena' });
  const climb = Array.from({ length: 20 }, (_, i) => m(i, i % 4 === 3 ? 'loss' : 'win', i % 4 === 3 ? 0 : 30));
  const uc = [m(30, 'win', 32), m(31, 'loss', -29), m(32, 'win', 30), m(33, 'win', 28)];
  const r = computeRecap([...climb, ...uc], { endMedals: 1761 });
  assert.equal(r.curve.ucFrom, t + 30 * 60000);
  assert.deepEqual([r.climb.matches, r.climb.wins, r.climb.losses], [20, 15, 5]);
  assert.equal(r.rankedMedals, 61, 'nur die 4 UC-Matches');
  assert.deepEqual(r.medals, { start: 1700, end: 1761, gain: 61, approx: true });
  assert.equal(r.curve.points.length, 5);
  assert.deepEqual(r.curve.points[1], { t: t + 30 * 60000, v: 32, c: 32, r: 'win', i: 1 });
  assert.equal(r.curve.count, 4);
  assert.equal(r.peak.medals, 1761);
  assert.equal(r.peak.league, 7);
  // Ohne UC: Kennzahl ist nicht "Medaillen"
  assert.notEqual(computeRecap(climb).curve.metric, 'medals');
  assert.equal(computeRecap(climb).rankedMedals, 0);
});

test('Verlauf: Liga-Aufstiege werden markiert, Verlauf unter UC verwirft ein zufälliges Muster', () => {
  const t = Date.UTC(2026, 9, 12, 12);
  const m = (i, result, change) => ({ battle_time_ms: t + i * 60000, result, trophy_change: change, crowns_for: 1, game_mode: 'Ranked1v1_NewArena' });
  const snaps = [
    { at: t - 1, league_number: 4, season_medals: 0 },
    { at: t + 5 * 60000, league_number: 5, season_medals: 0 },
    { at: t + 20 * 60000, league_number: 7, season_medals: 1712 },
  ];
  const r = computeRecap([m(0, 'win', 30), m(1, 'win', 30), m(6, 'win', 30), m(21, 'loss', -31), m(22, 'win', 30)], { snapshots: snaps });
  assert.deepEqual(r.curve.leagueMarks.map((x) => x.league), [5, 7]);
  assert.equal(r.curve.approx, false);
  assert.deepEqual([r.medals.start, r.medals.end, r.medals.approx], [1712, 1711, false]);
});

test('Tilt am Tag zählt den Absturz, auch wenn der Tag am Ende im Plus ist', () => {
  const t = Date.UTC(2026, 9, 13, 8);
  const m = (i, result, change) => ({ battle_time_ms: t + i * 60000, result, trophy_change: change, crowns_for: 1, game_mode: 'Ranked1v1_NewArena' });
  const day = [m(0, 'loss', -30), m(1, 'loss', -30), m(2, 'loss', -30), m(3, 'win', 30), m(4, 'win', 30), m(5, 'win', 30), m(6, 'win', 30)];
  const r = computeRecap([m(-100, 'win', 31), ...day], { endMedals: 1700 });
  assert.deepEqual([r.biggestTilt.date, r.biggestTilt.net, r.biggestTilt.from, r.biggestTilt.to], ['2026-10-13', -90, 1670, 1580]);
  assert.deepEqual([r.biggestGain.net, r.biggestGain.wins, r.biggestGain.losses], [120, 4, 0]);
});

test('starting_trophies macht die Kurve exakt: Lücke im Sync = Sprung, der Start bleibt richtig', () => {
  const t = Date.UTC(2026, 9, 11, 12);
  const m = (i, result, change, start) => ({ battle_time_ms: t + i * 60000, result, trophy_change: change, crowns_for: 1, game_mode: 'Ranked1v1_NewArena', starting_trophies: start });
  // Einstieg mit 1700, dann fehlen Matches (1729 → 1500), weiter ab 1500
  const r = computeRecap([m(0, 'win', 29, 1700), m(1, 'loss', -30, 1729), m(50, 'win', 30, 1500), m(51, 'win', 31, 1530)], { endMedals: 1561 });
  assert.deepEqual(r.medals, { start: 1700, end: 1561, gain: -139, approx: false });
  assert.equal(r.curve.offset + r.curve.min, 1530, 'Tief nach der Lücke');
  assert.equal(r.peak.medals, 1729);
  // Alte Matches ohne Angabe werden vom ersten bekannten Stand aus zurückgerechnet
  const r2 = computeRecap([m(0, 'win', 29, null), m(1, 'loss', -30, null), m(2, 'win', 30, 1699)], { endMedals: 5000 });
  assert.deepEqual(r2.medals, { start: 1700, end: 1729, gain: 29, approx: true });
});

test('Modi aufschlüsseln: Spielart der API vor Modusname, Sondermodi als eigene Gruppe', () => {
  const g = (game_mode, extra = {}) => modeOf({ game_mode, ...extra });
  // echte Werte aus dem Okt. 2026
  assert.deepEqual(g('202610_Event_Spooky_Chess', { seasonal_prefix: 'spookychesstrail' }), { group: 's:spookychesstrail', sub: null });
  assert.deepEqual(g('TeamVsTeam', { battle_arena: '2v2League_202609Arena2' }), { group: 's:2v2league', sub: null });
  assert.equal(g('Ranked1v1_NewArena').group, 'ranked');
  assert.equal(g('Ladder').group, 'ladder');
  // ohne gespeicherte Spielart (ältere Matches): am Namen
  assert.deepEqual(g('Friendly'), { group: 'friendly', sub: 'Classic' });
  assert.deepEqual(g('7xElixir_Friendly'), { group: 'party', sub: '7x Elixir' });
  assert.deepEqual(g('Chaos_1v1_MegaDraft_All'), { group: 'party', sub: 'Mega Draft' });
  assert.deepEqual(g('Challenge_AllCards_EventDeck_NoSet'), { group: 'challenge', sub: 'All Cards' });
  assert.deepEqual(g('202410_Event_Blackout'), { group: 'events', sub: 'Blackout' });
  // mit Spielart: ein Freundschaftskampf im Draft-Modus (so laufen die Turniere hier) ist ein Freundschaftskampf
  assert.deepEqual(g('DraftMode', { battle_type: 'friendly' }), { group: 'friendly', sub: 'Draft' });
  assert.deepEqual(g('7xElixir_Friendly', { battle_type: 'clanMate' }), { group: 'friendly', sub: 'clanMate' });
  assert.equal(g('Friendly', { battle_type: 'tournament' }).group, 'tournament');
  assert.equal(g('7xElixir_Friendly', { battle_type: 'casual1v1' }).group, 'party');
});

test('Sondermodus: eigene Auswertung mit Punkten, Qualifikation zählt nicht als Punkte, Ranked bleibt unberührt', () => {
  const t = Date.UTC(2026, 9, 20, 12);
  const sc = (i, result, change, start) => ({ battle_time_ms: t + i * 60000, result, trophy_change: change, crowns_for: 1,
    game_mode: '202610_Event_Spooky_Chess', seasonal_prefix: 'spookychesstrail', starting_trophies: start });
  const rk = (i, result, change) => ({ battle_time_ms: t + i * 60000, result, trophy_change: change, crowns_for: 1, game_mode: 'Ranked1v1_NewArena' });
  const r = computeRecap([
    sc(0, 'win', 1, null), sc(1, 'win', 1, null), // Qualifikation (Fortschritt +1)
    sc(10, 'win', 36, 1800), sc(11, 'loss', -39, 1836), sc(12, 'win', 35, 1797),
    rk(20, 'win', 31), rk(21, 'loss', -29),
  ], { specials: { 's:spookychesstrail': { label: 'Spooky Chess League', best: 1954 } } });
  assert.equal(r.rankedMedals, 2, 'Spooky-Punkte zählen nicht als Medaillen');
  const row = r.modes.find((m) => m.mode === 's:spookychesstrail');
  assert.deepEqual([row.count, row.wins, row.losses, row.label], [5, 4, 1, 'Spooky Chess League']);
  assert.equal(r.specials.length, 1);
  const sp = r.specials[0];
  assert.equal(sp.key, 's:spookychesstrail');
  assert.equal(sp.curve.metric, 'points');
  assert.equal(sp.curve.count, 3, 'nur die drei Matches mit Punkten');
  assert.deepEqual(sp.medals, { start: 1800, end: 1832, gain: 32, approx: false });
  assert.deepEqual(sp.peak, { points: 1954 }, 'Höchststand aus dem Modus-Fortschritt schlägt die Kurve (1836)');
  assert.deepEqual([sp.wins, sp.losses], [4, 1]);
  assert.equal(sp.modes, undefined);
});
