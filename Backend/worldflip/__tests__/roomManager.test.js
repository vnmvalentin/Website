// Worldflip-Räume ohne socket.io: send() und die Zeit werden hereingereicht.   npm run test:worldflip
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
});
