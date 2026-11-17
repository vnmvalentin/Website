// Win-Tracker-Challenges: Erkennung am Battle, Runs (Siege/Niederlagen je Versuch), Overlay-Stand
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyBattle, buildRuns, challengeState } = require('../challengeModes');

let t = 0;
const B = (result, winsBefore = null) => ({ battle_time_ms: ++t * 1000, result, challenge_wins_before: winsBefore });

test('Erkennung: Titel, Event-Name, Modusname; Freundschaftsspiele und andere Challenges nicht', () => {
  assert.equal(classifyBattle({ type: 'challenge', challengeTitle: '20 Win Challenge' }), '20win');
  assert.equal(classifyBattle({ type: 'challenge', challengeTitle: 'Classic Challenge' }), 'classic');
  assert.equal(classifyBattle({ type: 'grandChallenge', gameMode: 'GrandChallenge_Ladder' }), 'grand');
  assert.equal(classifyBattle({ type: 'challenge', eventTag: '#X', gameMode: 'Foo' }, [{ eventTag: '#X', title: '20-Win Challenge' }]), '20win');
  assert.equal(classifyBattle({ type: 'friendly', gameMode: 'Classic_Challenge' }), null);
  assert.equal(classifyBattle({ type: 'pathOfLegend', gameMode: 'Ranked1v1_NewArena' }), null);
  assert.equal(classifyBattle({ type: '', gameMode: 'Challenge_AllCards_EventDeck_NoSet' }), null);
});

test('Runs: 3 Niederlagen beenden den Run, Unentschieden zählt als Niederlage', () => {
  const runs = buildRuns(['win', 'win', 'loss', 'win', 'loss', 'draw', 'loss', 'win'].map((r) => B(r)), '20win');
  assert.equal(runs.length, 2);
  assert.deepEqual([runs[0].wins, runs[0].losses, runs[0].finished], [3, 3, true]);
  assert.deepEqual([runs[1].wins, runs[1].losses, runs[1].finished], [1, 1, false]);
});

test('Runs: Siegziel beendet den Run, challengeWinCountBefore erkennt Neustart und Lücken', () => {
  const twelve = buildRuns(Array.from({ length: 13 }, () => B('win')), 'classic');
  assert.equal(twelve.length, 2);
  assert.equal(twelve[0].wins, 12);
  assert.equal(buildRuns([B('win', 0), B('win', 1), B('win', 0)], 'classic').length, 2);
  const gap = buildRuns([B('win', 0), B('loss', 5)], 'classic');
  assert.deepEqual([gap[0].wins, gap[0].losses], [5, 1]);
});

test('Overlay-Stand: Versuch in der Session, frischer Run nach altem Ende', () => {
  const runs = [
    { startMs: 1, lastMs: 5, wins: 14, losses: 3, finished: true },
    { startMs: 6, lastMs: 9, wins: 3, losses: 1, finished: false },
  ];
  const s = challengeState(runs, '20win', 0);
  assert.deepEqual([s.wins, s.losses, s.attempt, s.bestWins, s.maxWins, s.maxLosses], [3, 1, 2, 14, 20, 3]);
  const fresh = challengeState([runs[0]], '20win', 10);
  assert.deepEqual([fresh.wins, fresh.losses, fresh.attempt, fresh.finished], [0, 0, 1, false]);
  const ongoing = challengeState([runs[1]], 'grand', 8);
  assert.equal(ongoing.attempt, 1);
});

test('Manueller Reset: laufender Run beginnt bei 0, Crown Series behält den echten Lauf', () => {
  // Grand-Run 4:2, dritte Niederlage nie gesehen — ohne Reset-Schnitt hinge der Run für immer fest.
  const rows = ['win', 'win', 'loss', 'win', 'win', 'loss'].map((r) => B(r));
  const resetMs = t * 1000 + 500;
  const stuck = challengeState(buildRuns(rows, 'grand'), 'grand', resetMs);
  assert.deepEqual([stuck.wins, stuck.losses], [4, 2]);
  const cut = challengeState(buildRuns(rows, 'grand', undefined, resetMs), 'grand', resetMs);
  assert.deepEqual([cut.wins, cut.losses, cut.results, cut.attempt, cut.bestWins], [0, 0, '', 1, 0]);
  // Nach dem Reset gespielte Matches bilden einen neuen Run
  const after = [...rows, B('win'), B('loss')];
  const next = challengeState(buildRuns(after, 'grand', undefined, resetMs), 'grand', resetMs);
  assert.deepEqual([next.wins, next.losses, next.results, next.attempt], [1, 1, 'wl', 1]);
  // Crown Series: Siege stehen im Duell selbst — der Lauf über den Reset hinweg bleibt vollständig
  const duel = [B('win', 0), B('loss', 1), B('win', 1), B('win', 2)];
  const duelRuns = buildRuns(duel, 'duel', undefined, duel[2].battle_time_ms);
  assert.deepEqual([duelRuns.length, duelRuns[0].wins, duelRuns[0].losses], [1, 3, 1]);
});

test('Classic/Grand/20 Win: Siege kommen aus der API, auch über Sync-Lücken; Reset schneidet weiter', () => {
  const { countsWinsInStartingTrophies, isCrownSeries } = require('../challengeModes');
  for (const key of ['classic', 'grand', '20win', 'duel', 'grandduel']) assert.equal(countsWinsInStartingTrophies(key), true, key);
  assert.equal(countsWinsInStartingTrophies('global'), false); // ungeprüft
  assert.deepEqual(['duel', 'grandduel', 'grand'].map(isCrownSeries), [true, true, false]);
  // Echter Verlauf (#9C28LGR0, 16.11.2026): 2W 3W 4W 5W 6W — das Overlay sah die ersten Siege nie
  const seen = [B('win', 2), B('win', 3), B('win', 4), B('win', 5), B('win', 6)];
  const run = challengeState(buildRuns(seen, 'grand'), 'grand', 0);
  assert.deepEqual([run.wins, run.losses, run.attempt], [7, 0, 1]);
  // Reset mitten im Run: erst frisch, das nächste Match bringt den echten Stand mit
  const resetMs = t * 1000 + 500;
  assert.equal(challengeState(buildRuns(seen, 'grand', undefined, resetMs), 'grand', resetMs).wins, 0);
  const after = [...seen, B('loss', 7)];
  const next = challengeState(buildRuns(after, 'grand', undefined, resetMs), 'grand', resetMs);
  assert.deepEqual([next.wins, next.losses, next.results], [7, 1, 'l']);
});

// ── Crown Series + Global Tournament (API-Formen live geprüft 13.11.2026, siehe challengeModes.js) ──
const { roundsResult } = require('../crApi');
const EVENTS = [{ eventTag: '#2UR9289L', title: 'Duel' }, { eventTag: '#2PRCRPQL', title: 'Grand Challenge' }];
const H = 60 * 60 * 1000;

test('Crown Series: Erkennung am Modusnamen oder Event-Titel, Clankrieg- und Freundschaftsduelle nicht', () => {
  assert.equal(classifyBattle({ type: 'unknown', gameMode: 'Competitive_Multideck', eventTag: '#2UR9289L' }, EVENTS), 'duel');
  assert.equal(classifyBattle({ type: 'unknown', gameMode: 'Competitive_Multideck' }, []), 'duel');
  assert.equal(classifyBattle({ type: 'unknown', gameMode: 'Foo', eventTag: '#G' }, [{ eventTag: '#G', title: 'Grand Duel' }]), 'grandduel');
  assert.equal(classifyBattle({ type: 'riverRaceDuel', gameMode: 'CW_Duel_1v1' }), null);
  assert.equal(classifyBattle({ type: 'friendly', gameMode: 'Duel_1v1_Friendly' }), null);
  assert.equal(classifyBattle({ type: 'clanMate', gameMode: 'Duel_1v1_Friendly', eventTag: '#2UR9289L' }, EVENTS), null);
  // Grand Challenge bleibt Grand Challenge
  assert.equal(classifyBattle({ type: 'trail', gameMode: 'Challenge_AllCards_EventDeck_NoSet', eventTag: '#2PRCRPQL' }, EVENTS), 'grand');
});

test('Global Tournament: Kennzeichen der API oder Titel; selbst erstellte Turniere nicht', () => {
  assert.equal(classifyBattle({ type: 'challenge', isLadderTournament: true, gameMode: 'Ladder' }), 'global');
  assert.equal(classifyBattle({ type: 'challenge', challengeTitle: 'Global Tournament' }), 'global');
  assert.equal(classifyBattle({ type: 'tournament', gameMode: 'Tournament' }), null);
  assert.equal(classifyBattle({ type: 'pathOfLegend', gameMode: 'Ranked1v1_NewArena2', isLadderTournament: false }), null);
});

test('Duell-Ergebnis: gewonnene Runden zählen, nicht die Kronensumme', () => {
  const rounds = (...c) => ({ rounds: c.map((crowns) => ({ crowns })) });
  assert.equal(roundsResult(rounds(0, 1, 1), rounds(3, 0, 0)), 'win'); // 2:3 Kronen, 2:1 Runden
  assert.equal(roundsResult(rounds(3, 0, 0), rounds(0, 1, 1)), 'loss');
  assert.equal(roundsResult(rounds(1, 1), rounds(0, 0)), 'win');
  assert.equal(roundsResult({ crowns: 3 }, { crowns: 0 }), null); // gewöhnliches Match
});

test('Crown Series: Lauf aus Siegen-vor-dem-Duell, 8 Siege oder 3 Niederlagen, neues Wochenende = neuer Lauf', () => {
  // Echter Verlauf (#VCJPC8UPV, 13.11.2026): -W 1W 2W 3W 4W 5W 6L 6W 7W
  let ms = 0;
  const D = (result, before, gapH = 0.2) => ({ battle_time_ms: (ms += gapH * H), result, challenge_wins_before: before });
  const real = buildRuns([D('win', 0), D('win', 1), D('win', 2), D('win', 3), D('win', 4), D('win', 5), D('loss', 6), D('win', 6), D('win', 7)], 'duel');
  assert.equal(real.length, 1);
  assert.deepEqual([real[0].wins, real[0].losses, real[0].finished], [8, 1, true]);
  // Sync-Lücke: erstes gesehenes Duell steht schon bei 2 Siegen
  const gap = buildRuns([D('win', 2), D('win', 3)], 'duel');
  assert.deepEqual([gap[0].wins, gap[0].losses], [4, 0]);
  // 3 Niederlagen ohne Sieg beenden den Lauf, das vierte Duell ist ein neuer
  assert.equal(buildRuns([D('loss', 0), D('loss', 0), D('loss', 0), D('loss', 0)], 'duel').length, 2);
  // Offener Lauf (0 Siege, 1 Niederlage) vom letzten Wochenende wird nicht fortgesetzt
  const weekends = buildRuns([D('loss', 0), D('loss', 0, 100)], 'duel');
  assert.equal(weekends.length, 2);
  // … und das Overlay zeigt nach der Pause einen frischen Lauf
  const stale = challengeState([{ startMs: 0, lastMs: 0, wins: 5, losses: 1, finished: false }], 'duel', 0, undefined, 100 * H);
  assert.deepEqual([stale.wins, stale.losses, stale.attempt, stale.maxWins, stale.maxLosses], [0, 0, 2, 8, 3]);
  // Grand Duels: 12 Siege / 4 Niederlagen
  const grand = challengeState(buildRuns([D('loss', 0), D('loss', 0), D('loss', 0)], 'grandduel'), 'grandduel', 0, undefined, ms);
  assert.deepEqual([grand.maxWins, grand.maxLosses, grand.losses, grand.finished], [12, 4, 3, false]);
});

test('Global Tournament: kein Siegziel, Niederlagen laut API überschreibbar', () => {
  const rows = [...Array.from({ length: 25 }, () => B('win')), ...Array.from({ length: 4 }, () => B('loss'))];
  const runs = buildRuns(rows, 'global');
  assert.deepEqual([runs.length, runs[0].wins, runs[0].losses, runs[0].finished], [1, 25, 4, false]);
  const s = challengeState(runs, 'global', 0);
  assert.deepEqual([s.maxWins, s.maxLosses], [0, 5]);
  const three = buildRuns(rows, 'global', { maxLosses: 3 });
  assert.equal(three[0].finished, true);
  assert.equal(challengeState(three, 'global', 0, { maxLosses: 3 }).maxLosses, 3);
});

test('King Grand Duel: genau 20 Duelle, keine Niederlagen-Grenze, Spielfolge bleibt erhalten', () => {
  const { grandDuelRules } = require('../challengeModes');
  assert.equal(grandDuelRules(8), undefined); // Queen's League und darunter: 12 Siege / 4 Niederlagen
  assert.equal(grandDuelRules(0), undefined);
  const king = grandDuelRules(9);
  assert.deepEqual(king, { maxWins: 0, maxLosses: 0, maxGames: 20 });
  let ms = 0;
  const D = (result, before) => ({ battle_time_ms: (ms += 1000), result, challenge_wins_before: before });
  // 6 Niederlagen am Stück beenden den Lauf nicht (in den unteren Ligen wäre nach 4 Schluss)
  const rows = [D('win', 0), ...Array.from({ length: 6 }, () => D('loss', 1)), D('win', 1)];
  const open = buildRuns(rows, 'grandduel', king);
  assert.deepEqual([open.length, open[0].wins, open[0].losses, open[0].finished, open[0].results], [1, 2, 6, false, 'wllllllw']);
  assert.equal(buildRuns(rows, 'grandduel').length, 2);
  // Nach dem 20. Duell ist Schluss, auch bei 20 Siegen
  let w = 0;
  const twenty = buildRuns(Array.from({ length: 21 }, () => D('win', w++ % 20)), 'grandduel', king);
  assert.deepEqual([twenty.length, twenty[0].wins, twenty[0].finished], [2, 20, true]);
  const s = challengeState(open, 'grandduel', 0, king, ms);
  assert.deepEqual([s.maxWins, s.maxLosses, s.maxGames, s.wins, s.losses, s.results], [0, 0, 20, 2, 6, 'wllllllw']);
});
