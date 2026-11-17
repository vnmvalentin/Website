// Worldflip-Engine: Regeln, Weltgesetze, Ereignisse, Antworten, Teams, Sichtbarkeit und ganze Bot-Partien.   npm test -- Worldflip
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIM, BOT_THINK, DRAW_EACH, EVENTS, EVENTS_BY_WORLD, KINDS, RULES, actorOf, answersOf, apply, botAction, botThinkMs, buildDeck,
  createGame, durationOf, eruptsWith, eventsFor, isLegal, needsTarget, normalizeSettings, topCard, viewFor,
} from '../index.js';

const DECK = buildDeck().length;
const total = (s) => s.deck.length + s.pile.length + s.hands.reduce((a, h) => a + h.length, 0);
const isAnswer = (c) => c.k === 'spiegel' || c.k === 'hagel';

function seeded(seed) {
  let x = seed | 0;
  return () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), x | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Karte, auf die `want` passt, in die Hand von `seat` holen (im Tausch gegen dessen erste andere Karte)
function give(s, seat, want) {
  const hand = s.hands[seat];
  let card = hand.find(want);
  if (card) return card;
  for (const pool of [s.deck, ...s.hands]) {
    const i = pool.findIndex(want);
    if (i >= 0 && pool !== hand) {
      card = pool[i];
      pool[i] = hand[0];
      hand[0] = card;
      return card;
    }
  }
  assert.fail('gewünschte Karte gefunden');
  return null;
}

// Lage, in der `seat` am Zug ist und die gewünschte Karte hält. Die anderen halten weder Spiegel noch Hagel —
// sonst dürften sie auf Angriffe antworten (das prüfen eigene Tests).
function rigged({ players = 4, teams = false, world = 0, seat = 0, want }) {
  const s = createGame({ players, teams, seed: 11 });
  s.turn = seat;
  s.world = world;
  s.charges = [0, 0, 0, 0];
  for (let p = 0; p < s.n; p += 1) {
    if (p === seat) continue;
    s.hands[p].forEach((c, i) => {
      if (!isAnswer(c)) return;
      const j = s.deck.findIndex((d) => d.k === 'n' && d.n > 0 && d.n < 7);
      s.hands[p][i] = s.deck[j];
      s.deck[j] = c;
    });
  }
  const card = give(s, seat, want);
  return { s, card };
}
const play = (s, seat, card, extra = {}) => {
  const r = apply(s, seat, { t: 'play', id: card.id, ...extra });
  assert.ok(r.ok, r.error);
  return r;
};
const act = (s, seat, action) => {
  const r = apply(s, seat, action);
  assert.ok(r.ok, r.error);
  return r;
};

test('Deck: 117 Karten, jede Kartenart kommt vor, jede Welt hat drei eigene Karten und drei Ereignisse', () => {
  const deck = buildDeck();
  assert.equal(deck.length, 117);
  assert.equal(new Set(deck.map((c) => c.id)).size, 117);
  assert.equal(deck.filter((c) => c.k === 'spiegel').length, 3);
  assert.ok(deck.filter((c) => c.k === 'spiegel').every((c) => c.w === -1), 'der Spiegel passt immer');
  assert.equal(deck.filter((c) => c.w === -1).length, 12);
  assert.equal(deck.filter((c) => c.k === 'hagel').length, 8);
  assert.equal(deck.filter((c) => c.k === 'n' && c.n === 0).length, 4);
  assert.equal(deck.filter((c) => c.k === 'n' && c.n === 7).length, 8);
  for (const k of Object.keys(KINDS)) assert.ok(deck.some((c) => c.k === k), `Kartenart ${k}`);
  for (const k of Object.keys(KINDS)) {
    if (KINDS[k].world >= 0 && KINDS[k].world !== null) assert.ok(deck.filter((c) => c.k === k).every((c) => c.w === KINDS[k].world));
  }
  for (let w = 0; w < 4; w += 1) assert.equal(Object.keys(KINDS).filter((k) => KINDS[k].world === w).length, 3, `Welt ${w}`);
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
  assert.equal(apply(s, 0, { t: 'take' }).ok, false);
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

test('Kosmos — Wurmlöcher: die 7 tauscht die Hand mit einem Spieler, die 0 reicht alle Hände weiter', () => {
  // 7 im Kosmos: Ziel wählen
  let x = rigged({ world: 3, want: (c) => c.w === 3 && c.k === 'n' && c.n === 7 });
  assert.equal(needsTarget(x.s, x.card), true);
  const mine = x.s.hands[0].filter((c) => c !== x.card).map((c) => c.id);
  const theirs = x.s.hands[2].map((c) => c.id);
  let r = play(x.s, 0, x.card, { target: 2 });
  assert.deepEqual(r.state.hands[0].map((c) => c.id), theirs);
  assert.deepEqual(r.state.hands[2].map((c) => c.id), mine);
  assert.ok(r.events.some((e) => e.t === 'swap' && e.a === 0 && e.b === 2));
  assert.equal(r.state.turn, 1);

  // 0 im Kosmos: Jeder bekommt die Hand seines Vorgängers
  x = rigged({ world: 3, want: (c) => c.w === 3 && c.k === 'n' && c.n === 0 });
  const before = x.s.hands.map((h) => h.filter((c) => c !== x.card).map((c) => c.id));
  r = play(x.s, 0, x.card);
  assert.ok(r.events.some((e) => e.t === 'rotate'));
  for (let p = 0; p < 4; p += 1) assert.deepEqual(r.state.hands[(p + 1) % 4].map((c) => c.id), before[p]);

  // eine fremde 7 auf eine 7 im Kosmos tauscht auch — und führt hinaus
  x = rigged({ world: 3, want: (c) => c.w === 0 && c.k === 'n' && c.n === 7 });
  x.s.pile.push(give(x.s, 1, (c) => c.w === 3 && c.k === 'n' && c.n === 7));
  x.s.hands[1].splice(x.s.hands[1].indexOf(topCard(x.s)), 1);
  r = play(x.s, 0, x.card, { target: 3 });
  assert.equal(r.state.world, 0);
  assert.ok(r.events.some((e) => e.t === 'swap'));

  // außerhalb des Kosmos ist die 7 eine gewöhnliche Zahl; fremde Zahlen passen im Kosmos nicht mehr von selbst
  x = rigged({ world: 0, want: (c) => c.w === 0 && c.k === 'n' && c.n === 7 });
  assert.equal(needsTarget(x.s, x.card), false);
  r = play(x.s, 0, x.card);
  assert.equal(r.events.some((e) => e.t === 'swap'), false);
  x = rigged({ world: 3, want: (c) => c.w === 0 && c.k === 'n' && c.n === 3 });
  if (topCard(x.s).n !== 3) assert.equal(isLegal(x.s, x.card), false);
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

test('Alle Ereignisse laufen und verlieren keine Karte', () => {
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

test('Kettenreaktion: Konjunktion (+2) und Supernova (+1) lassen volle Welten sofort ausbrechen', () => {
  let x = rigged({ world: 3, want: (c) => c.k === 'zuender' });
  x.s.next[3] = 'konjunktion';
  x.s.next[0] = 'glutwind';
  x.s.next[2] = 'fruchtregen';
  const M = RULES.CHARGE_MAX;
  x.s.charges = [M - 2, 1, M - 1, 0];
  let r = play(x.s, 0, x.card, { world: 3 });
  assert.deepEqual(r.events.filter((e) => e.t === 'erupt').map((e) => e.world), [3, 0, 2]);
  assert.deepEqual(r.state.charges, [0, 3, 0, 0]);
  assert.equal(total(r.state), DECK);

  x = rigged({ world: 3, want: (c) => c.k === 'supernova' });
  x.s.next[1] = 'ebbe';
  x.s.charges = [0, M - 1, 1, 0];
  assert.deepEqual(eruptsWith(x.s, x.card), [1], 'Hinweis: die Supernova lässt den Ozean ausbrechen');
  r = play(x.s, 0, x.card);
  assert.ok(r.events.some((e) => e.t === 'nova'));
  assert.deepEqual(r.events.filter((e) => e.t === 'erupt').map((e) => e.world), [1]);
  assert.deepEqual(r.state.charges, [1, 0, 2, 1]);
});

test('Karten, die immer passen, laden keine Welt auf; Hinweis, welche Karte eine Welt ausbrechen lässt', () => {
  const M = RULES.CHARGE_MAX;
  assert.equal(M, 5);
  for (const k of ['portal', 'finsternis', 'spiegel']) {
    const x = rigged({ world: 1, want: (c) => c.k === k });
    x.s.charges = [M - 1, M - 1, M - 1, M - 1];
    const r = play(x.s, 0, x.card, { world: 0 });
    assert.equal(r.events.some((e) => e.t === 'erupt'), false, `${k} löst nichts aus`);
    assert.deepEqual(r.state.charges, [M - 1, M - 1, M - 1, M - 1], `${k} lädt nicht`);
    assert.deepEqual(eruptsWith(x.s, x.card), []);
  }
  // der Zünder lädt auch nicht: Nur die gewählte Welt bricht aus, die übrigen bleiben, wie sie sind
  let x = rigged({ world: 1, want: (c) => c.k === 'zuender' });
  x.s.charges = [M - 1, 1, 0, 0];
  let r = play(x.s, 0, x.card, { world: 2 });
  assert.deepEqual(r.events.filter((e) => e.t === 'erupt').map((e) => e.world), [2]);
  assert.equal(r.state.charges[0], M - 1);

  // gewöhnliche Karten: Hinweis genau dann, wenn die Ladung voll wird (Dschungel lädt doppelt)
  x = rigged({ world: 0, want: (c) => c.w === 0 && c.k === 'n' });
  x.s.charges = [M - 2, 0, 0, 0];
  assert.deepEqual(eruptsWith(x.s, x.card), []);
  x.s.charges = [M - 1, 0, 0, 0];
  assert.deepEqual(eruptsWith(x.s, x.card), [0]);
  r = play(x.s, 0, x.card);
  assert.ok(r.events.some((e) => e.t === 'erupt' && e.world === 0));
  x = rigged({ world: 2, want: (c) => c.w === 2 && c.k === 'n' });
  x.s.charges = [0, 0, M - 2, 0];
  assert.deepEqual(eruptsWith(viewFor(x.s, 0), x.card), [2], 'geht auch mit der Sicht');
});

test('Option „Ziehen, bis es passt“: weiterziehen, bis eine passende Karte dabei ist', () => {
  assert.equal(normalizeSettings({}).drawUntil, false);
  assert.equal(normalizeSettings({ drawUntil: true }).drawUntil, true);
  for (let seed = 1; seed <= 40; seed += 1) {
    const s = createGame({ players: 3, seed, drawUntil: true });
    s.world = 1;
    s.drawn = [];
    // Stapel so legen, dass erst nach ein paar Karten etwas passt
    const fits = (c) => isLegal(s, c);
    const misses = s.deck.filter((c) => !fits(c)).slice(0, 4);
    const hit = s.deck.find(fits);
    s.deck = [...s.deck.filter((c) => !misses.includes(c) && c !== hit), hit, ...misses.reverse()];
    const seat = s.turn;
    const r = act(s, seat, { t: 'draw' });
    const d = r.events.find((e) => e.t === 'draw');
    assert.equal(d.n, 5, 'vier passen nicht, die fünfte passt');
    assert.ok(d.cards.some((c) => isLegal({ ...r.state, drawn: [] }, c)));
    assert.equal(r.state.turn, seat, 'man darf die passende Karte noch legen');
    assert.equal(r.state.drawn.length, 5);
    assert.equal(viewFor(r.state, seat).drawUntil, true);
    assert.ok(durationOf(r.events) >= ANIM.draw + 3 * DRAW_EACH, 'viele Karten fliegen länger');
    assert.equal(total(r.state), DECK);
  }
  // ohne Option: genau eine Karte
  const o = createGame({ players: 3, seed: 3 });
  o.world = 1;
  assert.equal(act(o, o.turn, { t: 'draw' }).events.find((e) => e.t === 'draw').n, 1);
});

test('Bots überlegen nach einem Effekt kürzer', () => {
  assert.equal(botThinkMs([{ t: 'play', card: { k: 'n' } }, { t: 'turn', seat: 1 }]), BOT_THINK.calm);
  assert.equal(botThinkMs([{ t: 'play', card: { k: 'sturm' } }, { t: 'skip' }, { t: 'turn', seat: 2 }]), BOT_THINK.afterFx);
  assert.equal(botThinkMs([{ t: 'erupt' }]), BOT_THINK.afterFx);
  assert.ok(BOT_THINK.afterFx < BOT_THINK.calm);
});

test('Effektkarten: Hagel, Meteor, Feuerwalze, Brandopfer, Frost, Welle, Flaschenpost, Saat, Strahl', () => {
  let x = rigged({ world: 2, want: (c) => c.k === 'hagel' && c.w === 2 });
  let r = play(x.s, 0, x.card);
  assert.equal(r.state.hands[1].length, x.s.hands[1].length + 2);
  assert.equal(r.state.turn, 1, 'Hagel lässt nur ziehen');

  x = rigged({ world: 0, want: (c) => c.k === 'meteor' });
  r = play(x.s, 0, x.card);
  assert.equal(r.state.hands[1].length, x.s.hands[1].length + 3);
  assert.equal(r.state.turn, 1, 'Meteor lässt nur ziehen, nicht aussetzen');

  x = rigged({ world: 0, want: (c) => c.k === 'walze' });
  r = play(x.s, 0, x.card);
  for (const p of [1, 2, 3]) assert.equal(r.state.hands[p].length, x.s.hands[p].length + 1);

  x = rigged({ world: 0, want: (c) => c.k === 'brandopfer' });
  r = play(x.s, 0, x.card);
  assert.equal(r.state.hands[0].length, x.s.hands[0].length - 2);
  assert.equal(r.events.find((e) => e.t === 'burn').losses.length, 1);
  assert.equal(total(r.state), DECK);

  x = rigged({ world: 1, want: (c) => c.k === 'frost' });
  r = play(x.s, 0, x.card, { target: 1 });
  assert.equal(r.state.turn, 2, 'Eingefrorener setzt aus');
  assert.ok(r.events.some((e) => e.t === 'thaw' && e.seat === 1));
  assert.equal(r.state.frozen[1], false);

  x = rigged({ world: 1, want: (c) => c.k === 'welle' });
  r = play(x.s, 0, x.card);
  assert.equal(r.state.turn, 0);

  // Flaschenpost: nur wer schaut, bekommt die Karten zu sehen
  x = rigged({ world: 1, want: (c) => c.k === 'flaschenpost' });
  r = play(x.s, 0, x.card, { target: 2 });
  const peek = r.events.find((e) => e.t === 'peek');
  assert.deepEqual(peek.cards.map((c) => c.id), x.s.hands[2].map((c) => c.id));
  assert.equal(eventsFor(r.events, 0).find((e) => e.t === 'peek').cards.length, x.s.hands[2].length);
  assert.equal(eventsFor(r.events, 1).find((e) => e.t === 'peek').cards, undefined);
  assert.equal(eventsFor(r.events, 2).find((e) => e.t === 'peek').cards, undefined);

  x = rigged({ world: 2, want: (c) => c.k === 'saat' });
  r = play(x.s, 0, x.card, { target: 3 });
  assert.equal(r.state.hands[0].length, x.s.hands[0].length - 2);
  assert.equal(r.state.hands[3].length, x.s.hands[3].length + 1);

  x = rigged({ world: 3, want: (c) => c.k === 'strahl' });
  r = play(x.s, 0, x.card, { target: 2 });
  assert.equal(r.state.hands[2].length, x.s.hands[2].length + 2);
});

test('Echo wiederholt die zuletzt gelegte Effektkarte', () => {
  // nach einem Meteor: Der Nächste zieht 3 (und ist danach normal dran)
  let x = rigged({ world: 2, want: (c) => c.k === 'echo' });
  x.s.lastFx = 'meteor';
  let r = play(x.s, 0, x.card);
  assert.equal(r.events.find((e) => e.t === 'play').echo, 'meteor');
  assert.equal(r.state.hands[1].length, x.s.hands[1].length + 3);
  assert.equal(r.state.turn, 1);
  assert.equal(r.state.lastFx, 'meteor', 'das Echo selbst merkt sich nichts Neues');

  // nach einer Zielkarte braucht auch das Echo ein Ziel
  x = rigged({ world: 2, want: (c) => c.k === 'echo' });
  x.s.lastFx = 'strahl';
  assert.equal(needsTarget(x.s, x.card), true);
  r = play(x.s, 0, x.card, { target: 3 });
  assert.equal(r.state.hands[3].length, x.s.hands[3].length + 2);

  // nach einem Zünder bricht die Welt des Echos aus; ohne Effektkarte davor passiert nichts
  x = rigged({ world: 2, want: (c) => c.k === 'echo' });
  x.s.lastFx = 'zuender';
  r = play(x.s, 0, x.card);
  assert.ok(r.events.some((e) => e.t === 'erupt' && e.world === 2));
  x = rigged({ world: 2, want: (c) => c.k === 'echo' });
  x.s.lastFx = null;
  r = play(x.s, 0, x.card);
  assert.deepEqual(r.events.map((e) => e.t), ['play', 'turn']);

  // gelegte Effektkarten merkt sich das Spiel — Zahlen nicht
  x = rigged({ world: 1, want: (c) => c.k === 'welle' });
  r = play(x.s, 0, x.card);
  assert.equal(r.state.lastFx, 'welle');
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

test('Spiegel: Wer angegriffen wird und einen hält, darf antworten', () => {
  // Hagel auf den Nächsten, der einen Spiegel hält: Das Spiel wartet auf seine Antwort
  const x = rigged({ world: 1, want: (c) => c.k === 'hagel' && c.w === 1 });
  const mirror = give(x.s, 1, (c) => c.k === 'spiegel');
  const r = play(x.s, 0, x.card);
  assert.deepEqual(r.state.react, { by: 0, seat: 1, k: 'hagel', plus: 2, again: false });
  assert.equal(actorOf(r.state), 1);
  assert.equal(r.state.turn, 0);
  assert.equal(r.events[r.events.length - 1].t, 'ask');
  assert.deepEqual(answersOf(r.state, 1).map((c) => c.id), [mirror.id]);
  assert.deepEqual(viewFor(r.state, 2).react, { by: 0, seat: 1, k: 'hagel', plus: 2 });
  // nur der Angegriffene darf jetzt handeln — und nur antworten
  assert.equal(apply(r.state, 0, { t: 'draw' }).ok, false);
  assert.equal(apply(r.state, 1, { t: 'draw' }).ok, false);
  assert.equal(apply(r.state, 1, { t: 'react', id: r.state.hands[1].find((c) => c.k === 'n').id }).ok, false);

  // hinnehmen: zieht 2 und ist danach ganz normal dran
  let a = act(r.state, 1, { t: 'take' });
  assert.equal(a.state.react, null);
  assert.equal(a.state.hands[1].length, x.s.hands[1].length + 2);
  assert.equal(a.state.turn, 1);

  // Spiegel: Der Absender zieht selbst (aussetzen muss er beim Hagel nicht); der Spiegel ist weg, oben liegt weiter der Hagel
  a = act(r.state, 1, { t: 'react', id: mirror.id });
  assert.equal(a.state.hands[1].length, x.s.hands[1].length - 1);
  assert.equal(a.state.hands[0].length, x.s.hands[0].length - 1 + 2);
  assert.equal(a.state.out[0], false);
  assert.equal(a.state.turn, 1);
  assert.equal(topCard(a.state).k, 'hagel');
  assert.deepEqual(a.events.map((e) => e.t).slice(0, 2), ['reflect', 'hagel']);
  assert.equal(a.events.find((e) => e.t === 'hagel').mirror, 1);
  assert.equal(total(a.state), DECK);
});

test('Spiegel wirft auch Sturm, Frost, Strahl, Saat und Flaschenpost zurück', () => {
  // Sturm: Der Absender setzt aus
  let x = rigged({ world: 0, want: (c) => c.k === 'sturm' && c.w === 0 });
  let mirror = give(x.s, 1, (c) => c.k === 'spiegel');
  let r = act(play(x.s, 0, x.card).state, 1, { t: 'react', id: mirror.id });
  assert.equal(r.state.turn, 1);
  assert.equal(r.state.out[0], true);
  assert.equal(r.events.find((e) => e.t === 'skip').seat, 0);
  let s = r.state;
  s.turn = 3;
  s.drawn = [];
  const d = apply(s, 3, { t: 'draw' });
  s = d.state.turn === 3 ? act(d.state, 3, { t: 'pass' }).state : d.state;
  assert.equal(s.turn, 1, 'der Absender wird übersprungen');
  assert.equal(s.out[0], false);

  // Meteor: Der Absender zieht 3 — aussetzen muss er nicht, und der Angegriffene ist normal dran
  x = rigged({ world: 0, want: (c) => c.k === 'meteor' });
  mirror = give(x.s, 1, (c) => c.k === 'spiegel');
  r = act(play(x.s, 0, x.card).state, 1, { t: 'react', id: mirror.id });
  assert.equal(r.state.hands[0].length, x.s.hands[0].length - 1 + 3);
  assert.equal(r.state.out[0], false);
  assert.equal(r.state.turn, 1);

  // Frost friert den Absender ein, Strahl trifft ihn selbst
  x = rigged({ world: 1, want: (c) => c.k === 'frost' });
  mirror = give(x.s, 2, (c) => c.k === 'spiegel');
  r = act(play(x.s, 0, x.card, { target: 2 }).state, 2, { t: 'react', id: mirror.id });
  assert.equal(r.state.frozen[2], false);
  assert.equal(r.state.frozen[0], true);
  x = rigged({ world: 3, want: (c) => c.k === 'strahl' });
  mirror = give(x.s, 2, (c) => c.k === 'spiegel');
  r = act(play(x.s, 0, x.card, { target: 2 }).state, 2, { t: 'react', id: mirror.id });
  assert.equal(r.state.hands[2].length, x.s.hands[2].length - 1);
  assert.equal(r.state.hands[0].length, x.s.hands[0].length - 1 + 2);

  // Saat: Der Absender bekommt eine Karte vom Ziel
  x = rigged({ world: 2, want: (c) => c.k === 'saat' });
  mirror = give(x.s, 3, (c) => c.k === 'spiegel');
  r = act(play(x.s, 0, x.card, { target: 3 }).state, 3, { t: 'react', id: mirror.id });
  assert.equal(r.state.hands[0].length, x.s.hands[0].length);
  assert.equal(r.state.hands[3].length, x.s.hands[3].length - 2);

  // Flaschenpost: Wer spiegelt, sieht die Karten des Absenders
  x = rigged({ world: 1, want: (c) => c.k === 'flaschenpost' });
  mirror = give(x.s, 2, (c) => c.k === 'spiegel');
  r = act(play(x.s, 0, x.card, { target: 2 }).state, 2, { t: 'react', id: mirror.id });
  const peek = r.events.find((e) => e.t === 'peek');
  assert.equal(peek.by, 2);
  assert.equal(peek.seat, 0);
  assert.deepEqual(peek.cards.map((c) => c.id), r.state.hands[0].map((c) => c.id));

  // der Spiegel als letzte Karte gewinnt; Feuerwalze und Weltereignisse lassen keine Antwort zu
  x = rigged({ world: 0, want: (c) => c.k === 'meteor' });
  mirror = give(x.s, 1, (c) => c.k === 'spiegel');
  x.s.deck.push(...x.s.hands[1].filter((c) => c !== mirror));
  x.s.hands[1] = [mirror];
  r = act(play(x.s, 0, x.card).state, 1, { t: 'react', id: mirror.id });
  assert.equal(r.state.winner, 1);
  x = rigged({ world: 0, want: (c) => c.k === 'walze' });
  give(x.s, 1, (c) => c.k === 'spiegel');
  r = play(x.s, 0, x.card);
  assert.equal(r.state.react, null);
  assert.equal(r.state.hands[1].length, x.s.hands[1].length + 1);

  // auf dem eigenen Zug passt der Spiegel immer, bewirkt aber nichts: Die Welt bleibt, auch wenn eine gewählt wird
  for (const world of [0, 1, 2, 3]) {
    x = rigged({ world, want: (c) => c.k === 'spiegel' });
    assert.ok(isLegal(x.s, x.card));
    r = play(x.s, 0, x.card, { world: (world + 1) % 4 });
    assert.deepEqual(r.events.map((e) => e.t), ['play', 'turn']);
    assert.equal(r.state.world, world);
    assert.equal(r.state.lastFx, x.s.lastFx, 'ein Echo wiederholt ihn nicht');
  }
});

test('Nebel verbirgt die Kartenzahl vor Gegnern — fünf eigene Züge lang oder bis zur letzten Karte', () => {
  const { s, card } = rigged({ world: 3, want: (c) => c.k === 'nebel' });
  let r = play(s, 0, card);
  assert.ok(r.events.some((e) => e.t === 'fog' && e.seat === 0));
  assert.equal(r.state.fog[0], RULES.FOG_TURNS);
  // Gegner sehen die Zahl nicht, ich selbst schon; der Zustand „im Nebel“ ist für alle sichtbar
  assert.equal(viewFor(r.state, 1).counts[0], null);
  assert.equal(viewFor(r.state, null).counts[0], null);
  assert.equal(viewFor(r.state, 0).counts[0], r.state.hands[0].length);
  assert.deepEqual(viewFor(r.state, 1).fog, [true, false, false, false]);
  assert.equal(viewFor(r.state, 0).fogLeft, RULES.FOG_TURNS);
  assert.equal(viewFor(r.state, 1).fogLeft, 0);
  assert.equal(viewFor(r.state, 1).counts[2], r.state.hands[2].length);

  // fünf eigene Züge später lichtet er sich
  let st = r.state;
  for (let i = 1; i <= RULES.FOG_TURNS; i += 1) {
    st.turn = 0;
    st.drawn = [];
    st.combo = null;
    st.react = null;
    const d = act(st, 0, { t: 'draw' });
    const done = d.state.turn === 0 ? act(d.state, 0, { t: 'pass' }) : d;
    st = done.state;
    assert.equal(st.fog[0], RULES.FOG_TURNS - i);
    if (i === RULES.FOG_TURNS) assert.ok([...d.events, ...done.events].some((e) => e.t === 'unfog' && e.seat === 0));
  }
  assert.equal(viewFor(st, 1).counts[0], st.hands[0].length);

  // mit der vorletzten Karte gelegt: sofort wieder klare Sicht (die letzte Karte soll jeder sehen)
  const x = rigged({ world: 3, want: (c) => c.k === 'nebel' });
  const keep = x.s.hands[0].find((c) => c !== x.card);
  x.s.deck.push(...x.s.hands[0].filter((c) => c !== x.card && c !== keep));
  x.s.hands[0] = [x.card, keep];
  r = play(x.s, 0, x.card);
  assert.equal(r.state.fog[0], 0);
  assert.ok(r.events.some((e) => e.t === 'unfog'));
  assert.equal(viewFor(r.state, 1).counts[0], 1);

  // 2 gegen 2: Der Partner sieht weiter alles; nach dem Ende liegt alles offen
  const t = rigged({ teams: true, world: 3, want: (c) => c.k === 'nebel' });
  r = play(t.s, 0, t.card);
  assert.equal(viewFor(r.state, 2).counts[0], r.state.hands[0].length);
  assert.equal(viewFor(r.state, 1).counts[0], null);
  r.state.winner = 1;
  assert.equal(viewFor(r.state, 1).counts[0], r.state.hands[0].length);
});

test('Stapeln: Hagel auf Hagel reicht alles an den Nächsten weiter', () => {
  const x = rigged({ world: 1, want: (c) => c.k === 'hagel' && c.w === 1 });
  const second = give(x.s, 1, (c) => c.k === 'hagel' && c.w === 2);
  let r = play(x.s, 0, x.card);
  assert.equal(r.state.react.seat, 1);
  // 1 legt den eigenen Hagel drauf: Das ist sein Zug, die Welt folgt der Karte, 2 zieht 4 und ist dann dran
  r = act(r.state, 1, { t: 'react', id: second.id });
  assert.equal(r.state.world, 2);
  assert.equal(r.state.hands[1].length, x.s.hands[1].length - 1);
  assert.equal(r.state.hands[2].length, x.s.hands[2].length + 4);
  assert.equal(r.state.turn, 2);
  assert.equal(r.events.find((e) => e.t === 'hagel').plus, 4);
  assert.equal(total(r.state), DECK);

  // hält auch der Übernächste einen Hagel, geht es weiter: 6 Karten
  const y = rigged({ world: 1, want: (c) => c.k === 'hagel' && c.w === 1 });
  const h1 = give(y.s, 1, (c) => c.k === 'hagel' && c.w === 2);
  const h2 = give(y.s, 2, (c) => c.k === 'hagel' && c.w === 3);
  r = act(play(y.s, 0, y.card).state, 1, { t: 'react', id: h1.id });
  assert.deepEqual(viewFor(r.state, 0).react, { by: 1, seat: 2, k: 'hagel', plus: 4 });
  r = act(r.state, 2, { t: 'react', id: h2.id });
  assert.equal(r.state.hands[3].length, y.s.hands[3].length + 6);
  assert.equal(r.state.turn, 3);

  // ein Spiegel am Ende wirft den ganzen Stapel auf den zurück, der zuletzt gelegt hat
  const z = rigged({ world: 1, want: (c) => c.k === 'hagel' && c.w === 1 });
  const zh = give(z.s, 1, (c) => c.k === 'hagel' && c.w === 2);
  const zm = give(z.s, 2, (c) => c.k === 'spiegel');
  r = act(play(z.s, 0, z.card).state, 1, { t: 'react', id: zh.id });
  r = act(r.state, 2, { t: 'react', id: zm.id });
  assert.equal(r.state.hands[1].length, z.s.hands[1].length - 1 + 4);
  assert.equal(r.state.out[1], false);
  assert.equal(r.state.turn, 2);
});

test('2 gegen 2: Partner sehen die Karten des anderen, außer im Dunkeln', () => {
  const s = createGame({ players: 4, teams: true, seed: 5 });
  const v = viewFor(s, 0);
  assert.equal(v.mate.seat, 2);
  assert.deepEqual(v.mate.hand.map((c) => c.id), s.hands[2].map((c) => c.id));
  assert.equal(viewFor(s, 1).mate.seat, 3);
  assert.equal(viewFor(s, null).mate, null);
  assert.equal(viewFor(createGame({ players: 4, seed: 5 }), 0).mate, null);
  // Finsternis der Gegner: auch die Partnerhand ist verdeckt
  s.dark = 3;
  s.darkBy = 1;
  assert.equal(viewFor(s, 0).mate.hand, null);
  assert.ok(viewFor(s, 1).mate.hand);
});

test('Jedes Ereignis der Engine hat eine Dauer', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 80; seed += 1) {
    let s = createGame({ players: 4, seed });
    for (let i = 0; i < 3000 && s.winner === null; i += 1) {
      const r = apply(s, actorOf(s), botAction(s, actorOf(s)));
      s = r.state;
      for (const e of r.events) seen.add(e.t);
    }
  }
  for (const t of ['ask', 'reflect', 'sitout', 'burn', 'peek', 'nova', 'rotate', 'swap', 'fog', 'unfog']) assert.ok(seen.has(t), `kommt in Bot-Partien vor: ${t}`);
  for (const t of seen) assert.ok(ANIM[t] > 0, `ANIM.${t}`);
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

test('Finsternis: blind danebengreifen kostet eine Karte; wer geblendet ist, kann nicht antworten', () => {
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

  const x = rigged({ world: 1, want: (c) => c.k === 'hagel' && c.w === 1 });
  give(x.s, 1, (c) => c.k === 'spiegel');
  x.s.dark = 3;
  x.s.darkBy = 0;
  const h = play(x.s, 0, x.card);
  assert.equal(h.state.react, null);
  assert.equal(h.state.hands[1].length, x.s.hands[1].length + 2);
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
        const seat = actorOf(s);
        const r = apply(s, seat, botAction(s, seat, random));
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
    console.log(`  ${players}${teams ? ' (2v2)' : ''}: ⌀ ${(turns / games).toFixed(0)} Züge, ${(erupts / games).toFixed(1)} Ereignisse je Partie, ${Object.keys(evs).length}/${Object.keys(EVENTS).length} Arten`);
  }
});
