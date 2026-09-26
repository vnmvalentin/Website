// Raum-Manager: Lobby, Start, serverautoritative Aktionen, versteckte Info, Timer, Reconnect, Aufgabe, Zuschauer.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { createRoomManager, PAUSE_MAX_MS, ABANDON_MS } = require('../roomManager');

const SHARED = path.join(__dirname, '..', 'shared');
const loadEngine = () => import(pathToFileURL(path.join(SHARED, 'engine', 'index.js')).href);

async function setup(settings = {}) {
  const engine = await loadEngine();
  let clock = 1_000_000;
  const outbox = [];
  const m = createRoomManager({
    engine,
    now: () => clock,
    send: (socketId, event, payload) => outbox.push({ socketId, event, payload }),
    randomSeed: () => 'TESTSEED',
  });
  const created = m.create('sA', { name: 'Anna', token: 'tokenAAAA', settings });
  const joined = m.join('sB', { code: created.code, name: 'Bert', token: 'tokenBBBB' });
  return {
    engine, m, code: created.code, outbox, created, joined,
    advance: (ms) => { clock += ms; m.tick(); },
    lastState: (socketId) => [...outbox].reverse().find((o) => o.socketId === socketId && o.event === 'ss:state')?.payload,
  };
}

async function started(settings) {
  const t = await setup(settings);
  t.m.ready('sA', { ready: true });
  t.m.ready('sB', { ready: true });
  return t;
}

test('Lobby: zweiter Spieler bekommt Platz 1, Host ändert Einstellungen, beide bereit ⇒ Match startet', async () => {
  const t = await setup();
  assert.equal(t.joined.seat, 1);
  assert.equal(t.m.settings('sB', { settings: { winsNeeded: 3 } }).error, 'notHost');
  assert.equal(t.m.settings('sA', { settings: { winsNeeded: 3, turnTimer: 90 }, seed: 'moor 1' }).ok, true);
  const room = t.m.rooms.get(t.code);
  assert.equal(room.settings.winsNeeded, 3);
  assert.equal(room.seedInput, 'MOOR1');
  t.m.ready('sA', { ready: true });
  assert.equal(room.status, 'lobby');
  t.m.ready('sB', { ready: true });
  assert.equal(room.status, 'playing');
  assert.equal(room.match.seed, 'MOOR1');
});

test('Aktionen: nur gültige Züge werden angewandt, falscher Spieler wird abgelehnt', async () => {
  const t = await started();
  const room = t.m.rooms.get(t.code);
  const first = room.match.draft.first;
  const sockets = ['sA', 'sB'];
  const pid = room.match.draft.pool[0].pid;
  assert.equal(t.m.action(sockets[1 - first], { action: { type: 'draftPick', pid } }).error, 'notYourPick');
  assert.equal(t.m.action(sockets[first], { action: { type: 'draftPick', pid } }).ok, true);
  assert.equal(t.m.action(sockets[first], { action: { type: 'timeout' } }).error, 'badAction');
});

test('Versteckte Info: kein Payload an einen Spieler enthält die Hand-UIDs des Gegners', async () => {
  const t = await started({ turnTimer: 45 });
  const room = t.m.rooms.get(t.code);
  const rng = { rng: 3 };
  // Mit der KI bis in den Kampf spielen, über den Manager
  let guard = 0;
  while (!(room.match.phase === 'battle' && room.match.battle.turn >= 4) && room.match.phase !== 'over' && guard++ < 400) {
    const p = t.engine.awaiting(room.match)[0];
    const a = t.engine.aiAction(room.match, p, 'normal', rng);
    const { player, ...rest } = a;
    void player;
    const res = t.m.action(p === 0 ? 'sA' : 'sB', { action: rest });
    if (!res.ok) t.advance(100_000);
  }
  assert.equal(room.match.phase, 'battle');
  for (const [sock, p] of [['sA', 0], ['sB', 1]]) {
    const oppHand = room.match.battle.players[1 - p].hand.map((c) => c.uid);
    const last = t.lastState(sock);
    const json = JSON.stringify(last.view);
    for (const uid of oppHand) assert.ok(!json.includes(`"uid":"${uid}"`), `Hand-UID ${uid} sichtbar für ${p}`);
    assert.equal(last.view.salt, undefined);
  }
});

test('Timer: Ablauf wendet eine Timeout-Aktion für den Säumigen an', async () => {
  const t = await started();
  const room = t.m.rooms.get(t.code);
  const before = room.match.step;
  t.advance(41_000); // Draft-Wahl 40 s
  assert.ok(room.match.step > before);
});

test('Reconnect: Timer pausiert bis 60 s, Rückkehr mit gleichem Token bekommt den vollen State', async () => {
  const t = await started();
  const room = t.m.rooms.get(t.code);
  const waiting = t.engine.awaiting(room.match)[0];
  const sock = waiting === 0 ? 'sA' : 'sB';
  const token = waiting === 0 ? 'tokenAAAA' : 'tokenBBBB';
  const step = room.match.step;
  t.m.detach(sock);
  assert.equal(room.deadlines[waiting].paused, true);
  t.advance(30_000);
  assert.equal(room.match.step, step, 'pausiert: keine Timeout-Aktion');
  t.outbox.length = 0;
  const rejoin = t.m.join('sNEU', { code: t.code, token });
  assert.equal(rejoin.seat, waiting);
  const st = t.lastState('sNEU');
  assert.ok(st && st.events.length === 0 && st.view.phase === 'draft');
});

test('Pause endet nach 60 s, nach 3 Minuten Abwesenheit wird aufgegeben', async () => {
  const t = await started();
  const room = t.m.rooms.get(t.code);
  t.m.detach('sA');
  t.advance(PAUSE_MAX_MS + 1000);
  assert.ok(!room.deadlines[0] || !room.deadlines[0].paused);
  for (let i = 0; i < 10 && room.status !== 'over'; i++) t.advance(ABANDON_MS / 5);
  assert.equal(room.status, 'over');
  assert.equal(room.match.winner, 1);
  assert.equal(room.match.endReason, 'surrender');
});

test('Zuschauer: dritter Beitritt schaut zu und bekommt die öffentliche Sicht; abschaltbar', async () => {
  const t = await started();
  const res = t.m.join('sC', { code: t.code, name: 'Clara', token: 'tokenCCCC' });
  assert.equal(res.seat, null);
  const st = t.lastState('sC');
  assert.equal(st.you, null);
  assert.equal(st.view.viewer, null);
  const u = await setup({ spectators: false });
  u.m.ready('sA', { ready: true });
  u.m.ready('sB', { ready: true });
  assert.equal(u.m.join('sC', { code: u.code, token: 'tokenCCCC' }).error, 'noSpectators');
});

test('Aufgeben per Leave im laufenden Match beendet es; Revanche braucht beide', async () => {
  const t = await started();
  const room = t.m.rooms.get(t.code);
  t.m.leave('sA');
  assert.equal(room.status, 'over');
  assert.equal(room.match.winner, 1);
  t.m.join('sA2', { code: t.code, token: 'tokenAAAA' });
  t.m.rematch('sA2');
  assert.equal(room.status, 'over');
  t.m.rematch('sB');
  assert.equal(room.status, 'playing');
  assert.equal(room.draftRound, 1);
});
