// Worldflip-Engine: Regeln, Weltgesetze, Ereignisse, Teams, Sichtbarkeit und ganze Bot-Partien.   npm run test:worldflip
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENTS, EVENTS_BY_WORLD, KINDS, RULES, apply, botAction, buildDeck, createGame, durationOf, eventsFor, isLegal,
  normalizeSettings, topCard, viewFor,
} from '../index.js';

const DECK = buildDeck().length;
const total = (s) => s.deck.length + s.pile.length + s.hands.reduce((a, h) => a + h.length, 0);

function seeded(seed) {
  let x = seed | 0;
  return () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), x | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Lage, in der `seat` am Zug ist und die gewünschte Karte auf der Hand hat (aus Stapel oder fremder Hand getauscht).
function rigged({ players = 4, teams = false, world = 0, seat = 0, want }) {
  const s = createGame({ players, teams, seed: 11 });
  s.turn = seat;
  s.world = world;
  s.charges = [0, 0, 0, 0];
  const hand = s.hands[seat];
  let card = hand.find(want);
  if (!card) {
    for (const pool of [s.deck, ...s.hands]) {
      const i = pool.findIndex(want);
      if (i >= 0 && pool !== hand) {
        card = pool[i];
        pool[i] = hand[0];
        hand[0] = card;
        break;
      }
    }
  }
  assert.ok(card, 'gewünschte Karte gefunden');
  return { s, card };
}
const play = (s, seat, card, extra = {}) => {
  const r = apply(s, seat, { t: 'play', id: card.id, ...extra });
  assert.ok(r.ok, r.error);
  return r;
};

test('Deck: 93 Karten, jede Kartenart kommt vor, jede Welt hat drei Ereignisse', () => {
  const deck = buildDeck();
  assert.equal(deck.length, 93);
  assert.equal(new Set(deck.map((c) => c.id)).size, 93);
  for (const k of Object.keys(KINDS)) assert.ok(deck.some((c) => c.k === k), `Kartenart ${k}`);
  for (const k of Object.keys(KINDS)) {
    if (KINDS[k].world >= 0 && KINDS[k].world !== null) assert.ok(deck.filter((c) => c.k === k).every((c) => c.w === KINDS[k].world));
  }
  assert.deepEqual(EVENTS_BY_WORLD.map((l) => l.length), [3, 3, 3, 3]);
});

test('Start: gleicher Seed = gleiche Partie, Ereignisse angekündigt', () => {
  const a = createGame({ players: 4, seed: 42 });
  assert.deepEqual(a, createGame({ players: 4, seed: 42 }));
  assert.ok(a.hands.every((h) => h.length === 7));
  assert.equal(topCard(a).k, 'n');
  assert.equal(total(a), DECK);
  a.next.forEach((ev, w) => assert.equal(EVENTS[ev].world, w));
});

test('Einstellungen: 2 gegen 2 heißt immer vier Spieler', () => {
  assert.equal(normalizeSettings({ teams: true, players: 2 }).players, 4);
  assert.equal(normalizeSettings({ players: 3 }).teams, false);
});

test('Grundregeln: nur wer dran ist, nur passende Karten, Zustand bleibt unverändert', () => {
  const { s } = rigged({ world: 1, want: (c) => c.w === 1 && c.k === 'n' });
  const snap = JSON.stringify(s);
  assert.equal(apply(s, 1, { t: 'draw' }).ok, false);
  assert.equal(apply(s, 0, { t: 'pass' }).ok, false);
  const bad = s.hands[0].find((c) => !isLegal(s, c));
  if (bad) assert.equal(apply(s, 0, { t: 'play', id: bad.id }).ok, false);
  assert.ok(apply(s, 0, { t: 'draw' }).ok);
  assert.equal(JSON.stringify(s), snap);
});

test('Vulkan — Hitze: ziehen heißt 2 Karten', () => {
  const { s } = rigged({ world: 0, want: () => true });
  const r = apply(s, 0, { t: 'draw' });
  assert.equal(r.state.hands[0].length, s.hands[0].length + 2);
  const o = rigged({ world: 1, want: () => true });
  assert.equal(apply(o.s, 0, { t: 'draw' }).state.hands[0].length, o.s.hands[0].length + 1);
});

test('Ozean — Strömung: gleiche Zahl nachlegen oder weitergeben', () => {
  const { s, card } = rigged({ world: 1, want: (c) => c.w === 1 && c.k === 'n' && c.n === 4 });
  const twin = [...s.deck, ...s.hands.flat()].find((c) => c.k === 'n' && c.n === 4 && c.id !== card.id && c.w === 1);
  for (const pool of [s.deck, ...s.hands]) {
    const i = pool.indexOf(twin);
    if (i >= 0 && pool !== s.hands[0]) {
      pool[i] = s.hands[0][1];
      s.hands[0][1] = twin;
    }
  }
  const r = play(s, 0, card);
  assert.equal(r.state.turn, 0, 'noch dran');
  assert.equal(r.state.combo, 4);
  assert.equal(apply(r.state, 0, { t: 'draw' }).ok, false);
  const other = r.state.hands[0].find((c) => !(c.k === 'n' && c.n === 4));
  if (other) assert.equal(apply(r.state, 0, { t: 'play', id: other.id }).ok, false);
  const r2 = play(r.state, 0, twin);
  assert.equal(r2.state.hands[0].length, s.hands[0].length - 2);
  assert.equal(apply(r.state, 0, { t: 'pass' }).state.turn, 1);
});

test('Dschungel — Wildwuchs: doppelte Ladung; Ladung bleibt beim Weltwechsel', () => {
  const { s, card } = rigged({ world: 2, want: (c) => c.w === 2 && c.k === 'n' });
  s.charges = [1, 0, 0, 0];
  const r = play(s, 0, card);
  assert.deepEqual(r.state.charges, [1, 0, 2, 0]);
});

test('Kosmos — Schwerelos: jede Zahl passt', () => {
  const { s, card } = rigged({ world: 3, want: (c) => c.w === 0 && c.k === 'n' });
  assert.ok(isLegal(s, card));
  s.world = 1;
  if (topCard(s).n !== card.n) assert.equal(isLegal(s, card), false);
});

test('Ausbruch: volle Ladung löst das angekündigte Ereignis aus und kündigt ein neues an', () => {
  const { s, card } = rigged({ world: 0, want: (c) => c.w === 0 && c.k === 'n' });
  s.charges = [RULES.CHARGE_MAX - 1, 2, 0, 0];
  s.next[0] = 'ausbruch';
  const r = play(s, 0, card);
  const e = r.events.find((x) => x.t === 'erupt');
  assert.equal(e.ev, 'ausbruch');
  assert.deepEqual(r.state.charges, [0, 2, 0, 0]);
  assert.notEqual(r.state.next[0], 'ausbruch');
  for (const p of [1, 2, 3]) assert.equal(r.state.hands[p].length, s.hands[p].length + 1);
});

test('Alle zwölf Ereignisse laufen und verlieren keine Karte', () => {
  for (const ev of Object.keys(EVENTS)) {
    const w = EVENTS[ev].world;
    const { s, card } = rigged({ world: w, want: (c) => c.k === 'zuender' });
    s.next[w] = ev;
    const r = play(s, 0, card, { world: w });
    assert.ok(r.events.some((x) => x.t === 'erupt' && x.ev === ev), ev);
    assert.equal(total(r.state), DECK, ev);
    assert.ok(r.state.hands.every((h) => h.length >= 1), `${ev}: niemand wird leergeräumt`);
  }
});

test('Strudel verteilt gleichmäßig, Flut reicht weiter', () => {
  const a = rigged({ world: 1, want: (c) => c.k === 'zuender' });
  a.s.next[1] = 'strudel';
  a.s.hands[1].push(...a.s.deck.splice(0, 8));
  const r = play(a.s, 0, a.card, { world: 1 });
  const counts = r.state.hands.map((h) => h.length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);

  const b = rigged({ world: 1, want: (c) => c.k === 'zuender' });
  b.s.next[1] = 'flut';
  const before = b.s.hands.map((h) => h.map((c) => c.id));
  const r2 = play(b.s, 0, b.card, { world: 1 });
  assert.deepEqual(r2.state.hands[2].map((c) => c.id), before[1]);
});

test('Effektkarten: Meteor, Feuerwalze, Frost, Welle, Saat, Wurmloch, Strahl', () => {
  let x = rigged({ world: 0, want: (c) => c.k === 'meteor' });
  let r = play(x.s, 0, x.card);
  assert.equal(r.state.hands[1].length, x.s.hands[1].length + 2);
  assert.equal(r.state.turn, 2);

  x = rigged({ world: 0, want: (c) => c.k === 'walze' });
  r = play(x.s, 0, x.card);
  for (const p of [1, 2, 3]) assert.equal(r.state.hands[p].length, x.s.hands[p].length + 1);

  x = rigged({ world: 1, want: (c) => c.k === 'frost' });
  r = play(x.s, 0, x.card, { target: 1 });
  assert.equal(r.state.turn, 2, 'Eingefrorener setzt aus');
  assert.ok(r.events.some((e) => e.t === 'thaw' && e.seat === 1));
  assert.equal(r.state.frozen[1], false);

  x = rigged({ world: 1, want: (c) => c.k === 'welle' });
  r = play(x.s, 0, x.card);
  assert.equal(r.state.turn, 0);

  x = rigged({ world: 2, want: (c) => c.k === 'saat' });
  r = play(x.s, 0, x.card, { target: 3 });
  assert.equal(r.state.hands[0].length, x.s.hands[0].length - 2);
  assert.equal(r.state.hands[3].length, x.s.hands[3].length + 1);

  x = rigged({ world: 3, want: (c) => c.k === 'tausch' });
  const theirs = x.s.hands[2].map((c) => c.id);
  r = play(x.s, 0, x.card, { target: 2 });
  assert.deepEqual(r.state.hands[0].map((c) => c.id), theirs);

  x = rigged({ world: 3, want: (c) => c.k === 'strahl' });
  r = play(x.s, 0, x.card, { target: 2 });
  assert.equal(r.state.hands[2].length, x.s.hands[2].length + 2);
});

test('Saat als vorletzte Karte gewinnt', () => {
  const { s, card } = rigged({ world: 2, want: (c) => c.k === 'saat' });
  const keep = s.hands[0].find((c) => c !== card);
  s.deck.push(...s.hands[0].filter((c) => c !== card && c !== keep));
  s.hands[0] = [card, keep];
  const r = play(s, 0, card, { target: 1 });
  assert.equal(r.state.winner, 0);
});

test('Dornenschild fängt genau einen Angriff ab', () => {
  const { s, card } = rigged({ world: 3, want: (c) => c.k === 'strahl' });
  s.shield[2] = true;
  const r = play(s, 0, card, { target: 2 });
  assert.equal(r.state.hands[2].length, s.hands[2].length);
  assert.equal(r.state.shield[2], false);
  assert.ok(r.events.some((e) => e.t === 'block' && e.seat === 2));
});

test('2 gegen 2: Angriffe treffen nur Gegner, das Team gewinnt gemeinsam, Finsternis blendet nur Gegner', () => {
  let x = rigged({ teams: true, world: 0, want: (c) => c.k === 'walze' });
  let r = play(x.s, 0, x.card);
  assert.equal(r.state.hands[2].length, x.s.hands[2].length, 'Partner bleibt verschont');
  assert.equal(r.state.hands[1].length, x.s.hands[1].length + 1);

  x = rigged({ teams: true, world: 0, want: (c) => c.k === 'finsternis' });
  r = play(x.s, 0, x.card, { world: 0 });
  const v = (seat) => r.state.dark > 0 && r.state.teams[seat] !== r.state.teams[0];
  assert.deepEqual([1, 2, 3].map(v), [true, false, true]);

  x = rigged({ teams: true, world: 1, seat: 2, want: (c) => c.w === 1 && c.k === 'n' });
  x.s.deck.push(...x.s.hands[2].filter((c) => c !== x.card));
  x.s.hands[2] = [x.card];
  r = play(x.s, 2, x.card);
  assert.equal(r.state.winner, 2);
  assert.equal(r.state.winTeam, 0);
});

test('Finsternis: blind danebengreifen kostet eine Karte', () => {
  const { s, card } = rigged({ players: 3, world: 2, want: (c) => c.k === 'finsternis' });
  let r = play(s, 0, card, { world: 2 });
  const blind = r.state.turn;
  const wrong = r.state.hands[blind].find((c) => !isLegal(r.state, c));
  if (wrong) {
    const before = r.state.hands[blind].length;
    r = apply(r.state, blind, { t: 'play', id: wrong.id });
    assert.ok(r.ok);
    assert.ok(r.events.some((e) => e.t === 'misplay'));
    assert.equal(r.state.hands[blind].length, before + 1);
  }
});

test('Sicht: fremde Hände, gezogene und verschenkte Karten bleiben verdeckt', () => {
  const s = createGame({ players: 4, seed: 9 });
  const v = viewFor(s, 1);
  assert.deepEqual(v.hand.map((c) => c.id), s.hands[1].map((c) => c.id));
  assert.equal(JSON.stringify(v).includes('"hands"'), false);
  assert.equal(viewFor(s, null).hand, null);
  const r = apply(s, s.turn, { t: 'draw' });
  assert.equal(eventsFor(r.events, (s.turn + 1) % 4).find((e) => e.t === 'draw').cards, undefined);
  assert.ok(eventsFor(r.events, s.turn).find((e) => e.t === 'draw').cards.length >= 1);
  assert.ok(durationOf(r.events) > 0);

  const g = rigged({ world: 2, want: (c) => c.k === 'saat' });
  const rg = play(g.s, 0, g.card, { target: 3 });
  assert.equal(eventsFor(rg.events, 1).find((e) => e.t === 'gift').card, undefined);
  assert.ok(eventsFor(rg.events, 3).find((e) => e.t === 'gift').card);
});

test('Bot-Partien enden — zu zweit, dritt, viert und im 2 gegen 2', () => {
  for (const [players, teams] of [[2, false], [3, false], [4, false], [4, true]]) {
    const games = 150;
    let turns = 0;
    let erupts = 0;
    const evs = {};
    for (let seed = 1; seed <= games; seed += 1) {
      let s = createGame({ players, teams, seed });
      const random = seeded(seed * 31 + 7);
      let i = 0;
      for (; i < 5000 && s.winner === null; i += 1) {
        const r = apply(s, s.turn, botAction(s, s.turn, random));
        assert.ok(r.ok, `Bot-Zug abgelehnt: ${r.error}`);
        s = r.state;
        assert.equal(total(s), DECK);
        for (const e of r.events) {
          if (e.t === 'erupt') {
            erupts += 1;
            evs[e.ev] = (evs[e.ev] || 0) + 1;
          }
        }
      }
      assert.notEqual(s.winner, null, `Partie ${seed} (${players}${teams ? ' Teams' : ''}) endet`);
      if (teams) assert.equal(s.winTeam, s.winner % 2);
      turns += i;
    }
    console.log(`  ${players}${teams ? ' (2v2)' : ''}: ⌀ ${(turns / games).toFixed(0)} Züge, ${(erupts / games).toFixed(1)} Ereignisse je Partie, ${Object.keys(evs).length}/12 Arten`);
  }
});
