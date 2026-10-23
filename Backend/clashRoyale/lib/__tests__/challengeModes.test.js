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
