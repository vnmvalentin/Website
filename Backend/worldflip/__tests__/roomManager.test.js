// Worldflip-Räume ohne socket.io: send() und die Zeit werden hereingereicht.   npm test -- worldflip
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { createRoomManager } = require('../roomManager');

const ENGINE = pathToFileURL(path.join(__dirname, '..', 'shared', 'engine', 'index.js')).href;
const tok = (c) => `token-${c}-12345678`;

async function setup() {
  const engine = await import(ENGINE);
  const sent = [];
  let t = 1_000_000;
  const m = createRoomManager({ engine, send: (id, event, payload) => sent.push({ id, event, payload }), now: () => t });
  const last = (id, event = 'wf:room') => [...sent].reverse().find((x) => x.id === id && x.event === event)?.payload;
  return { engine, m, sent, last, advance: (ms) => { t += ms; } };
}

test('Raum anlegen, beitreten, starten: jeder sieht nur die eigene Hand', async () => {
  const { m, last } = await setup();
  const { code } = m.create('a', { name: 'Anna', token: tok('a'), settings: { players: 4, handSize: 5 } });
  assert.equal(m.join('b', { code, name: 'Ben', token: tok('b') }).ok, true);
  assert.equal(m.start('b').ok, false, 'nur der Gastgeber startet');
  assert.equal(m.start('a').ok, true);
  const va = last('a');
  const vb = last('b');
  assert.equal(va.phase, 'playing');
  assert.equal(va.players.length, 4);
  assert.equal(va.players.filter((p) => p.bot).length, 2);
  assert.equal(va.you, 0);
  assert.equal(vb.you, 1);
  assert.equal(va.game.hand.length, 5);
  assert.notDeepEqual(va.game.hand, vb.game.hand);
  assert.equal(JSON.stringify(va).includes('hands'), false);
});

test('Ohne Bots braucht es zwei Menschen', async () => {
  const { m } = await setup();
  m.create('a', { name: 'Anna', token: tok('a'), settings: { bots: false } });
  assert.equal(m.start('a').ok, false);
});

test('Bots und Zugzeit: die Partie läuft bis zum Ende durch', async () => {
  const { m, last, advance } = await setup();
  m.create('a', { name: 'Anna', token: tok('a'), settings: { players: 3, handSize: 5, turnSeconds: 20 } });
  m.start('a');
  for (let i = 0; i < 4000 && last('a').phase === 'playing'; i += 1) {
    advance(30_000); // über Animation und Zugzeit hinaus: Bots ziehen, für Anna wird gespielt
    m.tick();
  }
  const v = last('a');
  assert.equal(v.phase, 'over');
  assert.notEqual(v.game.winner, null);
  assert.equal(m.start('a').ok, true, 'nächste Runde');
  assert.equal(last('a').matchNo, 2);
});

test('Eigener Zug kommt an, fremder wird abgelehnt', async () => {
  const { m, last, advance } = await setup();
  const { code } = m.create('a', { name: 'Anna', token: tok('a'), settings: { bots: false } });
  m.join('b', { code, name: 'Ben', token: tok('b') });
  m.start('a');
  advance(3000);
  const turn = last('a').game.turn;
  const [cur, other] = turn === 0 ? ['a', 'b'] : ['b', 'a'];
  assert.equal(m.action(other, { action: { t: 'draw' } }).ok, false);
  const seqBefore = last(cur).batch.seq;
  assert.equal(m.action(cur, { action: { t: 'draw' } }).ok, true);
  const mine = last(cur).batch;
  const theirs = last(other).batch;
  assert.equal(mine.seq, seqBefore + 1);
  assert.ok(mine.events.find((e) => e.t === 'draw').cards.length >= 1); // im Vulkan zieht man 2
  assert.equal(theirs.events.find((e) => e.t === 'draw').cards, undefined);
});

test('Angriff mit Antwort: Das Ziel darf den Spiegel legen; antwortet es nicht, läuft die kurze Antwortzeit ab', async () => {
  const { engine, m, last, advance } = await setup();
  const { code } = m.create('a', { name: 'Anna', token: tok('a'), settings: { bots: false, turnSeconds: 40 } });
  m.join('b', { code, name: 'Ben', token: tok('b') });
  m.start('a');
  advance(4000);
  // Lage stellen: Anna ist dran und hält einen Hagel, Ben einen Spiegel
  const room = m._rooms.get(code);
  const s = room.state;
  const take = (s, seat, want) => {
    const pool = [s.deck, ...s.hands].find((p) => p !== s.hands[seat] && p.some(want));
    const card = s.hands[seat].find(want) || pool.splice(pool.findIndex(want), 1)[0];
    if (!s.hands[seat].includes(card)) s.hands[seat].push(card);
    return card;
  };
  s.turn = 0;
  s.world = 1;
  s.drawn = [];
  const hagel = take(s, 0, (c) => c.k === 'hagel' && c.w === 1);
  const mirror = take(s, 1, (c) => c.k === 'spiegel');
  const before = s.hands.map((h) => h.length);

  assert.equal(m.action('a', { action: { t: 'play', id: hagel.id } }).ok, true);
  const vb = last('b');
  assert.deepEqual(vb.game.react, { by: 0, seat: 1, k: 'hagel', plus: 2 });
  assert.ok(vb.turnEndsAt - vb.serverNow <= engine.RULES.REACT_SECONDS * 1000 + 10000, 'kurze Antwortzeit');
  assert.equal(m.action('a', { action: { t: 'draw' } }).ok, false, 'der Angreifer wartet');
  assert.equal(m.action('b', { action: { t: 'draw' } }).ok, false, 'nur antworten');
  assert.equal(m.action('b', { action: { t: 'react', id: mirror.id } }).ok, true);
  const after = last('a').game;
  assert.equal(after.react, null);
  assert.deepEqual(after.counts, [before[0] - 1 + 2, before[1] - 1]);
  assert.equal(after.turn, 1);

  // zweiter Angriff, diesmal schweigt das Ziel: Nach der Antwortzeit wird für es entschieden
  const s2 = room.state;
  s2.turn = 0;
  s2.out = [false, false];
  s2.drawn = [];
  s2.react = null;
  const sturm = take(s2, 0, (c) => c.k === 'sturm');
  s2.world = sturm.w;
  take(s2, 1, (c) => c.k === 'spiegel');
  const played = m.action('a', { action: { t: 'play', id: sturm.id } });
  assert.equal(played.ok, true, played.error);
  assert.equal(last('b').game.react.seat, 1);
  advance(30_000);
  m.tick();
  assert.equal(last('a').game.react, null);
});

test('Wer im Spiel geht, wird zum Bot; Zuschauer rücken nach dem Ende nach', async () => {
  const { m, last } = await setup();
  const { code } = m.create('a', { name: 'Anna', token: tok('a'), settings: { bots: false } });
  m.join('b', { code, name: 'Ben', token: tok('b') });
  m.start('a');
  assert.equal(m.join('c', { code, name: 'Cem', token: tok('c') }).spectator, true);
  assert.equal(last('c').you, null);
  assert.equal(last('c').game.hand, null);
  m.leave('b');
  const v = last('a');
  assert.equal(v.players[1].bot, true);
  assert.equal(v.phase, 'playing');
  m.leave('a'); // letzter Mensch am Tisch geht: Runde endet, der Zuschauer bekommt den Platz
  const vc = last('c');
  assert.equal(vc.phase, 'over');
  assert.equal(vc.host, true);
});

test('Neu verbinden mit gleichem Token: gleicher Platz', async () => {
  const { m, last } = await setup();
  const { code } = m.create('a', { name: 'Anna', token: tok('a'), settings: {} });
  m.start('a');
  const hand = last('a').game.hand;
  m.disconnect('a');
  assert.equal(m.join('a2', { code, name: 'Anna', token: tok('a') }).ok, true);
  assert.deepEqual(last('a2').game.hand, hand);
  assert.equal(last('a2').you, 0);
});

test('2 gegen 2: Teams wählen, Partner sitzen sich gegenüber, Bots füllen auf', async () => {
  const { m, last } = await setup();
  const { code } = m.create('a', { name: 'Anna', token: tok('a'), settings: { teams: true } });
  m.join('b', { code, name: 'Ben', token: tok('b') });
  assert.deepEqual(last('a').players.map((p) => p.team), [0, 1]);
  assert.equal(m.setTeam('b', { team: 0 }).ok, true); // Anna und Ben zusammen
  assert.equal(m.start('a').ok, true);
  const v = last('b');
  assert.equal(v.players.length, 4);
  assert.deepEqual(v.players.map((p) => p.team), [0, 1, 0, 1]);
  assert.deepEqual(v.players.map((p) => p.bot), [false, true, false, true]);
  assert.equal(v.you, 2);
  assert.deepEqual(v.game.teams, [0, 1, 0, 1]);
  // Partner sehen die Karten des anderen — die der Gegner bleiben verdeckt
  assert.equal(v.game.mate.seat, 0);
  assert.deepEqual(v.game.mate.hand, last('a').game.hand);
  assert.deepEqual(last('a').game.mate.hand, v.game.hand);
});

test('Admin-Reiter „Spiele“: Räume und verbundene Menschen, jede gestartete Partie wird gezählt', async () => {
  const stat = require('../../lib/spielStatistik');
  const gezaehlt = [];
  stat.verbindePartienSpeicher((spiel) => { gezaehlt.push(spiel); });
  try {
    const { m } = await setup();
    assert.deepEqual(m.stats(), { raeume: 0, spieler: 0 });
    const { code } = m.create('a', { name: 'Anna', token: tok('a'), settings: { players: 3 } });
    m.join('b', { code, name: 'Ben', token: tok('b') });
    assert.deepEqual(m.stats(), { raeume: 1, spieler: 2 }, 'Bots zählen nicht als Spieler');
    m.start('a');
    assert.deepEqual(gezaehlt, ['worldflip']);
    m.disconnect('b');
    assert.equal(m.stats().spieler, 1);
  } finally {
    stat.verbindePartienSpeicher(null);
  }
});
