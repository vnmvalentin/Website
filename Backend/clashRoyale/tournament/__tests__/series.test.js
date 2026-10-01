const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../series');
const { makeRng } = require('../structure');

const done = (gameNo, winner, mode = 'snake') => ({ gameNo, status: 'done', winner, mode, offer: [], bans: [], crownsA: 1, crownsB: 2 });

test('Serienstand und Sieger je Best-of', () => {
  const games = [done(1, 'a'), done(2, 'b'), { gameNo: 3, status: 'void', winner: null }, done(4, 'a')];
  const score = S.seriesScore(games);
  assert.deepEqual([score.a, score.b, score.crownsA, score.crownsB], [2, 1, 3, 6]);
  assert.equal(S.seriesWinner(3, score), 'a');
  assert.equal(S.seriesWinner(5, score), null);
  assert.equal(S.seriesWinner(1, { a: 0, b: 1 }), 'b');
  assert.equal(S.nextGameNo(games), 5);
  assert.equal(S.nextGameNo([]), 1);
});

test('Bann-Reihenfolge: Spiel 1 bannt B zuerst, danach abwechselnd; annullierte Spiele zählen nicht', () => {
  assert.equal(S.firstBanner([]), 'b');
  assert.equal(S.firstBanner([done(1, 'a')]), 'a');
  assert.equal(S.firstBanner([done(1, 'a'), { gameNo: 2, status: 'void' }]), 'a');
  assert.equal(S.firstBanner([done(1, 'a'), done(2, 'b')]), 'b');
});

test('Pick/Ban: drei verschiedene Modi, abwechselnd bannen, der dritte bleibt', () => {
  const pool = ['snake', 'auction', 'bingo', 'dark-maze'];
  const offer = S.drawOffer(pool, [], makeRng(1));
  assert.equal(new Set(offer).size, 3);
  let g = { gameNo: 1, status: 'banning', offer, bans: [], mode: null };
  assert.equal(S.banTurn(g, 'b'), 'b');
  assert.throws(() => S.applyBan(g, 'b', 'a', offer[0]), /tournamentNotYourTurn/);
  assert.throws(() => S.applyBan(g, 'b', 'b', 'gibtsnicht'), /tournamentInvalidBan/);
  g = S.applyBan(g, 'b', 'b', offer[0]);
  assert.equal(g.mode, null);
  assert.equal(S.banTurn(g, 'b'), 'a');
  assert.throws(() => S.applyBan(g, 'b', 'a', offer[0]), /tournamentInvalidBan/); // schon gebannt
  g = S.applyBan(g, 'b', 'a', offer[1]);
  assert.equal(g.mode, offer[2]);
  assert.equal(S.banTurn(g, 'b'), null);
  assert.throws(() => S.drawOffer(['snake', 'bingo'], []), /tournamentPickBanNeedsThree/);
});

test('Schon gespielte Modi kommen erst dran, wenn sonst zu wenige übrig sind', () => {
  const pool = ['snake', 'auction', 'bingo', 'dark-maze'];
  for (let seed = 1; seed < 20; seed++) {
    const offer = S.drawOffer(pool, [done(1, 'a', 'snake')], makeRng(seed));
    assert.ok(!offer.includes('snake'));
    assert.notEqual(S.randomMode(['snake', 'bingo'], [done(1, 'a', 'snake')], makeRng(seed)), 'snake');
  }
  assert.equal(S.randomMode(['snake'], [done(1, 'a', 'snake')]), 'snake');
});

test('Laufendes Spiel', () => {
  assert.equal(S.activeGame([done(1, 'a'), { gameNo: 2, status: 'void' }]), null);
  assert.equal(S.activeGame([done(1, 'a'), { gameNo: 2, status: 'battle' }]).gameNo, 2);
});
