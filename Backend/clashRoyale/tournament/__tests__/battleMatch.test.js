const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../battleMatch');
const { cardIdByOfficialName, ALL_CARDS } = require('../../core/cards');

const local = (names) => names.map(n => ALL_CARDS.find(c => c.name === n)).map(c => ({ id: c.id, name: c.name }));
const api = (names, evo = {}) => names.map(n => ({ name: n, level: 11, ...(evo[n] ? { evolutionLevel: evo[n] } : {}) }));

const DECK_A = ['Knight', 'Archers', 'Fireball', 'Hog Rider', 'Musketeer', 'Ice Spirit', 'Cannon', 'The Log'];
const DECK_B = ['Giant', 'Witch', 'Zap', 'Mini P.E.K.K.A', 'Arrows', 'Skeletons', 'Bomber', 'Valkyrie'];

const battle = (over) => ({
  type: 'friendly', teamSize: 1, gameMode: 'Friendly', battleTime: '20261001T200000.000Z', battleTimeMs: Date.UTC(2026, 9, 1, 20),
  opponentTag: 'BBB', crownsFor: 2, crownsAgainst: 1, cards: api(DECK_A), opponentCards: api(DECK_B), ...over,
});

test('Deck-Vergleich als Menge: Reihenfolge, Evo- und Heldenstufe sind egal', () => {
  const shuffled = [...DECK_A].reverse();
  const r = M.deckDiff(local(DECK_A), api(shuffled, { Knight: 2, Archers: 1 }), cardIdByOfficialName);
  assert.equal(r.ok, true);
  const wrong = M.deckDiff(local(DECK_A), api([...DECK_A.slice(0, 7), 'Goblin Barrel']), cardIdByOfficialName);
  assert.equal(wrong.ok, false);
  assert.deepEqual(wrong.missing, ['The Log']);
  assert.deepEqual(wrong.extra, ['Goblin Barrel']);
  // Offizielle Schreibweise mit Sonderzeichen ("Mini P.E.K.K.A") wird aufgelöst
  assert.equal(M.deckDiff(local(DECK_B), api(DECK_B), cardIdByOfficialName).ok, true);
});

test('Freundschafts- und Clankämpfe zählen, nur 1v1, nur gegen genau den Gegner, nur nach dem Draft', () => {
  const after = Date.UTC(2026, 9, 1, 19, 50);
  const t = (min) => ({ battleTime: `t${min}`, battleTimeMs: after + min * 60000 });
  const logA = [
    battle({ ...t(-5) }),                                   // vor dem Draft-Ende
    battle({ ...t(2), type: 'PvP' }),                         // Ladder
    battle({ ...t(3), opponentTag: 'CCC' }),                  // anderer Gegner
    battle({ ...t(4), teamSize: 2 }),                         // 2v2
    battle({ ...t(6), type: 'clanMate', crownsFor: 0, crownsAgainst: 3 }), // Clankampf → zählt
    battle({ ...t(9) }),
  ];
  const hit = M.findSeriesBattle({ logA, logB: [], tagA: 'AAA', tagB: 'BBB', after });
  assert.equal(hit.battleTime, 't6');
  assert.deepEqual([hit.crownsA, hit.crownsB], [0, 3]);
  // Schon einem früheren Spiel zugeordnet → nächster Kampf
  assert.equal(M.findSeriesBattle({ logA, logB: [], tagA: 'AAA', tagB: 'BBB', after, usedTimes: new Set(['t6']) }).battleTime, 't9');
  assert.equal(M.findSeriesBattle({ logA: [], logB: [], tagA: 'AAA', tagB: 'BBB', after }), null);
});

test('Kampf nur in Bs Liste (API noch nicht bei A aktualisiert): Sicht wird auf A umgedreht', () => {
  const after = 0;
  const logB = [battle({ battleTime: 'x', battleTimeMs: 1000, opponentTag: 'AAA', crownsFor: 3, crownsAgainst: 1, cards: api(DECK_B), opponentCards: api(DECK_A) })];
  const hit = M.findSeriesBattle({ logA: [], logB, tagA: 'AAA', tagB: 'BBB', after });
  assert.deepEqual([hit.crownsA, hit.crownsB], [1, 3]);
  assert.equal(hit.cardsA[0].name, DECK_A[0]);
  // Steht in beiden Listen → nur einmal
  const logA = [battle({ battleTime: 'x', battleTimeMs: 1000, crownsFor: 1, crownsAgainst: 3 })];
  assert.equal(M.findSeriesBattle({ logA, logB, tagA: 'AAA', tagB: 'BBB', after }).crownsA, 1);
});

test('Bewertung: Sieger nach Kronen; Unentschieden und falsches Deck gehen an den Veranstalter', () => {
  const decks = { a: local(DECK_A), b: local(DECK_B) };
  const base = { battleTime: 'x', cardsA: api(DECK_A), cardsB: api(DECK_B), gameMode: 'Friendly', type: 'friendly' };
  const opts = { deckCheck: true, resolveId: cardIdByOfficialName };
  assert.equal(M.evaluateBattle({ ...base, crownsA: 1, crownsB: 3 }, decks, opts).winner, 'b');
  assert.equal(M.evaluateBattle({ ...base, crownsA: 2, crownsB: 2 }, decks, opts).reason, 'draw');
  const wrong = M.evaluateBattle({ ...base, crownsA: 3, crownsB: 0, cardsB: api([...DECK_B.slice(1), 'Golem']) }, decks, opts);
  assert.equal(wrong.reason, 'deckMismatch');
  assert.equal(wrong.deck.b.ok, false);
  // Ohne Deck-Prüfung zählt der Sieg trotzdem
  assert.equal(M.evaluateBattle({ ...base, crownsA: 3, crownsB: 0, cardsB: api(['Golem']) }, decks, { deckCheck: false, resolveId: cardIdByOfficialName }).winner, 'a');
});

test('Erscheinen-Frist: nur wenn genau einer da war und die Zeit um ist', () => {
  const showUpMs = 10 * 60000;
  assert.equal(M.showUpForfeit({ presentA: true, presentB: false, waitStart: 0, now: showUpMs + 1, showUpMs }), 'a');
  assert.equal(M.showUpForfeit({ presentA: false, presentB: true, waitStart: 0, now: showUpMs + 1, showUpMs }), 'b');
  assert.equal(M.showUpForfeit({ presentA: true, presentB: false, waitStart: 0, now: showUpMs - 1, showUpMs }), null);
  assert.equal(M.showUpForfeit({ presentA: true, presentB: true, waitStart: 0, now: showUpMs * 9, showUpMs }), null);
  assert.equal(M.showUpForfeit({ presentA: false, presentB: false, waitStart: 0, now: showUpMs * 9, showUpMs }), null);
});
