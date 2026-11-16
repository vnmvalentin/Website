// Tests des Matchup-Ratgebers (scoutMatchups.js): Deck-Typen, Zählung, Zufall vs. echter Unterschied, Rückfall auf den
// Typ, eigene Bilanz im Profil und das seitenweise Lesen aus dem Speicher. Speicher nur im Temp-Ordner.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-scout-matchups-test-'));
process.env.CR_SCOUT_DB = path.join(tmpDir, 'scout.db');

const store = require('../scoutStore');
const mu = require('../scoutMatchups');

test.after(() => {
  store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const HOG = ['hog-rider~ev1', 'musketeer', 'cannon', 'ice-spirit', 'skeletons', 'the-log', 'fireball', 'ice-golem'];
const GOLEM = ['golem', 'night-witch', 'baby-dragon', 'lumberjack', 'tornado', 'barbarian-barrel', 'lightning', 'mega-minion'];
const LAVA = ['lava-hound', 'balloon', 'mega-minion', 'minions', 'inferno-dragon', 'arrows', 'tombstone', 'fireball'];
const XBOW = ['x-bow', 'tesla', 'archers', 'knight', 'skeletons', 'ice-spirit', 'the-log', 'fireball'];
const key = (cards) => cards.map((c) => c.split('~')[0]).sort().join(',');
// Kämpfe a gegen b: wins davon gewinnt a
const rows = (a, b, n, wins) => Array.from({ length: n }, (_, i) => ({ a: { cards: a }, b: { cards: b }, res: i < wins ? 1 : 2 }));
// Zufallsfolge mit festem Startwert — jeder Lauf gleich
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

test('Deck-Typ: teuerste Siegbedingung, bei Gleichstand die zuerst genannte, sonst Panzer', () => {
  assert.equal(mu.deckType(HOG), 'hog-rider'); // gespielte Form (~ev1) zählt wie die Karte
  assert.equal(mu.deckType(LAVA), 'lava-hound'); // Lava (7) vor Ballon (5)
  assert.equal(mu.deckType(['giant', 'graveyard', 'poison', 'bowler', 'bats', 'zap', 'tornado', 'ice-spirit']), 'giant'); // beide 5
  assert.equal(mu.deckType(['mega-knight', 'bats', 'zap', 'bandit', 'goblin-gang', 'arrows', 'inferno-dragon', 'spear-goblins']), 'mega-knight');
  assert.equal(mu.deckType([{ id: 'golem' }, { id: 'night-witch' }]), 'golem'); // auch als Kartenobjekte
  assert.equal(mu.deckType(['zap', 'arrows']), 'arrows'); // nur Zauber: der teuerste
  assert.equal(mu.deckType([]), null);
});

test('Typ gegen Typ und Karte gegen Karte: echter Unterschied wird genannt, die Karte nie gegen sich selbst', () => {
  const acc = mu.createMatchupAccumulator({ minTypeCell: 10, minCardPair: 50 });
  for (const r of rows(HOG, GOLEM, 400, 280)) acc.add(r); // Hog gewinnt 70 % gegen Golem
  for (const r of rows(HOG, XBOW, 400, 200)) acc.add(r); // 50 % gegen X-Bogen
  for (const r of rows(HOG, HOG, 100, 50)) acc.add(r);
  acc.add({ a: { cards: HOG.slice(0, 7) }, b: { cards: GOLEM }, res: 1 }); // kein volles Deck → zählt nicht
  const res = acc.result({ now: 1000, since: 0 });
  assert.equal(res.battles, 900);
  assert.deepEqual(res.types['hog-rider'].vs.golem, [400, 280]);
  assert.deepEqual(res.types.golem.vs['hog-rider'], [400, 120]);
  assert.deepEqual(res.types['hog-rider'].vs['hog-rider'], [200, 100]); // Spiegel-Kampf zählt beide Seiten
  // Hog Rider: Golem ist leicht, X-Bogen schwerer als der eigene Schnitt (55 %) — Hog Rider selbst taucht nicht auf
  const hog = res.cards['hog-rider'];
  assert.ok(hog.easy.some(([id]) => id === 'golem'));
  assert.ok(hog.hard.some(([id]) => id === 'x-bow'));
  assert.ok(![...hog.hard, ...hog.easy].some(([id]) => id === 'hog-rider'));
});

test('Zufall ist kein Muster: bei gleicher Stärke nennt die Auswertung keine schweren oder leichten Karten', () => {
  const rnd = seeded(7);
  const acc = mu.createMatchupAccumulator({ minCardPair: 50 });
  for (let i = 0; i < 3000; i++) {
    const pick = [HOG, GOLEM, LAVA, XBOW];
    acc.add({ a: { cards: pick[Math.floor(rnd() * 4)] }, b: { cards: pick[Math.floor(rnd() * 4)] }, res: rnd() < 0.5 ? 1 : 2 });
  }
  const res = acc.result();
  const named = Object.values(res.cards).flatMap((c) => [...c.hard, ...c.easy]);
  assert.equal(named.length, 0, `zufällig genannt: ${JSON.stringify(named)}`);
});

test('Deck-Seite: eigene Zahlen ab genug Kämpfen, sonst die des Typs', () => {
  const acc = mu.createMatchupAccumulator({ deckKeys: [key(HOG), key(LAVA)], minDeck: 50, minDeckCell: 5, minTypeCell: 5, minDeckCard: 20 });
  for (const r of rows(HOG, GOLEM, 60, 45)) acc.add(r);
  for (const r of rows(LAVA, XBOW, 20, 5)) acc.add(r); // Lava: nur 20 Kämpfe
  const res = acc.result({ now: 5, since: 0, days: 45 });
  const deck = mu.forDeck(res, key(HOG), HOG);
  assert.equal(deck.scope, 'deck');
  assert.equal(deck.type, 'hog-rider');
  assert.deepEqual(deck.vs, [{ type: 'golem', n: 60, wins: 45 }]);
  assert.equal(deck.days, 45);
  const lava = mu.forDeck(res, key(LAVA), LAVA);
  assert.equal(lava.scope, 'type'); // zu wenige Kämpfe mit genau diesem Deck
  assert.equal(lava.type, 'lava-hound');
  assert.deepEqual(lava.vs, [{ type: 'x-bow', n: 20, wins: 5 }]);
  // Ein Deck, das nie gespielt wurde, aber einen bekannten Typ hat
  const other = ['golem', 'zap', 'arrows', 'bats', 'knight', 'archers', 'fireball', 'the-log'];
  assert.equal(mu.forDeck(res, key(other), other).scope, 'type');
  assert.equal(mu.forDeck(null, key(HOG), HOG), null);
});

test('Karten-Seite: Karte gegen Karte und — bei einer Siegbedingung — der Typ gegen andere Typen', () => {
  const acc = mu.createMatchupAccumulator({ minCardPair: 50, minTypeCell: 10 });
  for (const r of rows(HOG, GOLEM, 400, 300)) acc.add(r);
  for (const r of rows(HOG, XBOW, 400, 160)) acc.add(r);
  const res = acc.result();
  const hog = mu.forCard(res, 'hog-rider');
  assert.equal(hog.n, 800);
  // alle Karten des X-Bogen-Decks haben dieselbe Bilanz — die Reihenfolge unter Gleichen ist beliebig
  assert.equal(hog.hard.find((h) => h.card.id === 'x-bow')?.winRate, 0.4);
  assert.ok(!hog.hard.some((h) => GOLEM.includes(h.card.id)));
  assert.ok(hog.type.vs.some((v) => v.type === 'golem' && v.wins === 300));
  assert.equal(mu.forCard(res, 'musketeer').type, null); // keine Siegbedingung → kein Typ
  assert.equal(mu.forCard(res, 'unbekannt'), null);
});

test('Profil: eigene Bilanz gegen Typen neben der Quote von Decks wie dem aktuellen', () => {
  const acc = mu.createMatchupAccumulator({ minTypeCell: 5 });
  for (const r of rows(HOG, GOLEM, 40, 30)) acc.add(r);
  const res = acc.result();
  const c = (ids) => ids.map((id) => ({ id: id.split('~')[0], variant: id.includes('~') ? id.split('~')[1] : undefined }));
  const list = [
    { t: 1, result: 'loss', myCards: c(HOG), oppCards: c(GOLEM) },
    { t: 2, result: 'loss', myCards: c(HOG), oppCards: c(GOLEM) },
    { t: 3, result: 'win', myCards: c(HOG), oppCards: c(XBOW) },
    { t: 4, result: 'draw', myCards: c(HOG), oppCards: c(XBOW) }, // Unentschieden zählt nicht
    { t: 5, result: 'win', myCards: c(HOG), oppCards: null },
  ];
  const own = mu.ownTypes(list, res);
  assert.equal(own.deckType, 'hog-rider');
  assert.deepEqual(own.list, [
    { type: 'golem', n: 2, wins: 0, global: { n: 40, wins: 30 } }, // Hog-Rider-Decks gegen Golem bei den Besten
    { type: 'x-bow', n: 1, wins: 1, global: null },
  ]);
  assert.deepEqual(mu.ownTypes([], null), { deckType: null, list: [] });
});

test('Speicher: seitenweises Lesen liefert jede Zeile genau einmal, auch bei gleichen Zeitpunkten', async () => {
  const shaped = (t, tagA, tagB, a, b, result) => ({
    t, group: 'ranked', result,
    team: [{ tag: tagA, cards: a.map((id) => ({ id })), tower: null }],
    opponent: [{ tag: tagB, cards: b.map((id) => ({ id })), tower: null }],
  });
  const base = Date.now() - 60 * 60 * 1000;
  const tags = ['2PP', '8YY', '9QQ', 'LJJ', 'PYY', 'UVV'];
  const battles = [];
  for (let i = 0; i < 9; i++) battles.push(shaped(base + Math.floor(i / 3) * 1000, tags[i % 6], tags[(i + 1) % 6], key(HOG).split(','), key(GOLEM).split(','), i % 2 ? 'win' : 'loss'));
  assert.equal(store.rememberMatchups(battles, 5), 9);
  const seen = [];
  const n = await store.forEachMatchupPage(base - 1, (page) => { seen.push(...page); }, { page: 2 });
  assert.equal(n, 9);
  assert.equal(seen.length, 9);
  assert.deepEqual(seen.map((r) => r.t), [...seen.map((r) => r.t)].sort((a, b) => a - b));
  assert.equal(seen[0].a.cards.length, 8);
  // Der Arbeiter rechnet daraus und legt das Ergebnis ab
  const worker = mu.createMatchupWorker({ store, deckKeys: () => [key(HOG)], limits: { minDeck: 1, minTypeCell: 1, minDeckCell: 1 } });
  const res = await worker.run();
  assert.equal(res.battles, 9);
  assert.equal(res.from, base); // ältester Kampf — die Seiten zeigen „seit …"
  assert.equal(store.getValue('matchups').value.battles, 9);
  assert.equal(worker.deck(key(HOG), HOG).scope, 'deck');
  assert.equal(worker.card('golem').n, 9);
});
