// Moorwanderung-Räume: Lobby 2–6, Start, serverautoritative Aktionen, Budgets, versteckte Info, Reconnect, Zuschauer.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { createRunRoomManager, ABANDON_MS } = require('../runRoomManager');

const SHARED = path.join(__dirname, '..', 'shared');
const loadEngine = () => import(pathToFileURL(path.join(SHARED, 'engine', 'index.js')).href);

async function setup(n = 4, settings = {}) {
  const engine = await loadEngine();
  let clock = 1_000_000;
  const outbox = [];
  const m = createRunRoomManager({
    engine,
    now: () => clock,
    send: (socketId, event, payload) => outbox.push({ socketId, event, payload }),
    randomSeed: () => 'RUNSEED',
  });
  const sockets = Array.from({ length: n }, (_, i) => `s${i}`);
  const created = m.create(sockets[0], { name: 'Spieler0', token: 'tokenAAAA0', settings: { players: n, ...settings } });
  for (let i = 1; i < n; i++) m.join(sockets[i], { code: created.code, name: `Spieler${i}`, token: `tokenAAAA${i}` });
  return {
    engine, m, code: created.code, outbox, sockets,
    room: () => m.rooms.get(created.code),
    advance: (ms) => { clock += ms; m.tick(); },
    lastState: (socketId) => [...outbox].reverse().find((o) => o.socketId === socketId && o.event === 'mw:state')?.payload,
  };
}

async function started(n, settings) {
  const t = await setup(n, settings);
  for (const s of t.sockets) t.m.ready(s, { ready: true });
  return t;
}

test('Lobby: Tisch mit n Plätzen, Host ändert Einstellungen, alle bereit ⇒ Run startet', async () => {
  const t = await setup(3);
  const room = t.room();
  assert.equal(room.seats.length, 3);
  assert.equal(t.m.settings('s1', { settings: { seals: 4 } }).error, 'notHost');
  assert.equal(t.m.settings('s0', { settings: { players: 2 } }).error, 'tooManySeated');
  assert.equal(t.m.settings('s0', { settings: { seals: 4, players: 5, pace: 'fast' } }).ok, true);
  assert.equal(room.seats.length, 5);
  assert.equal(room.settings.seals, 4);
  t.m.ready('s0', { ready: true });
  t.m.ready('s1', { ready: true });
  t.m.ready('s2', { ready: true });
  assert.equal(room.status, 'lobby'); // zwei Plätze noch leer
  assert.equal(t.m.settings('s0', { settings: { players: 3 } }).ok, true);
  for (const s of t.sockets) t.m.ready(s, { ready: true });
  assert.equal(room.status, 'playing');
  assert.equal(room.run.players.length, 3);
  assert.equal(room.run.players[0].seals, 4);
});

test('Startdeck: gleichzeitig wählen, Zeitablauf wählt automatisch; dann Pfad mit gemeinsamer Deadline', async () => {
  const t = await started(4);
  const room = t.room();
  assert.equal(t.m.action('s0', { action: { type: 'chooseStarter', deck: 'rudel' } }).ok, true);
  assert.equal(t.m.action('s1', { action: { type: 'chooseStarter', deck: 'salzwacht' } }).error, 'badStarter');
  assert.equal(t.m.action('s1', { action: { type: 'timeout' } }).error, 'badAction');
  t.advance(61 * 1000);
  assert.equal(room.run.phase, 'path');
  assert.ok(room.pathDeadline);
  assert.equal(t.lastState('s2').timers.path.total, room.pathDeadline.total);
});

test('Pfad-Budget: Ablauf spielt den Rest für alle Säumigen automatisch, danach geht es weiter', async () => {
  const t = await started(4, { pathLength: 'short', pace: 'fast' });
  const room = t.room();
  t.advance(46 * 1000);
  assert.equal(room.run.phase, 'path');
  const pathNo = room.run.pathNo;
  t.advance(room.pathDeadline.total + 1000);
  assert.ok(room.run.pathNo > pathNo || room.run.phase === 'duels', `Phase ${room.run.phase}, Pfad ${room.run.pathNo}`);
});

test('Duell-Zug-Timer: der Mensch am Zug bekommt einen Zeitablauf', async () => {
  const t = await started(2, { pathLength: 'short', pace: 'fast', pathsPerRound: 1 });
  const room = t.room();
  t.advance(46 * 1000);
  t.advance(room.pathDeadline.total + 1000);
  assert.equal(room.run.phase, 'duels');
  const pair = room.run.duels.pairs[0];
  const turn = pair.battle.turn;
  const d = room.deadlines.find(Boolean);
  assert.ok(d, 'kein Duell-Timer');
  t.advance(d.total + 1000);
  assert.ok(room.run.duels === null || room.run.duels.pairs[0].battle.turn > turn || room.run.phase !== 'duels');
});

test('Versteckte Information: kein Client bekommt fremde Decks oder Items', async () => {
  const t = await started(6, { pathLength: 'short' });
  const room = t.room();
  for (let i = 0; i < 6; i++) t.m.action(t.sockets[i], { action: { type: 'chooseStarter', deck: ['rudel', 'knochenmarsch', 'kerzenlicht'][i % 3] } });
  assert.equal(room.run.phase, 'path');
  for (let i = 0; i < 6; i++) {
    const st = t.lastState(t.sockets[i]);
    assert.equal(st.you, i);
    for (let q = 0; q < 6; q++) {
      if (q === i) {
        assert.ok(Array.isArray(st.view.players[q].deck));
        continue;
      }
      assert.equal(st.view.players[q].deck, undefined);
      assert.equal(st.view.players[q].items, undefined);
      const json = JSON.stringify(st);
      for (const dc of room.run.players[q].deck) assert.ok(!json.includes(`"${dc.uid}"`), `${dc.uid} sichtbar für ${i}`);
    }
  }
});

test('Reconnect per Token: gleicher Platz, Zuschauer bekommen die öffentliche Sicht', async () => {
  const t = await started(3);
  t.m.detach('s1');
  assert.equal(t.room().seats[1].connected, false);
  const again = t.m.join('s1b', { code: t.code, name: 'Spieler1', token: 'tokenAAAA1' });
  assert.equal(again.seat, 1);
  const spec = t.m.join('zuschauer', { code: t.code, name: 'Gast', token: 'tokenZZZZZ' });
  assert.equal(spec.seat, null);
  t.m.action('s0', { action: { type: 'chooseStarter', deck: 'rudel' } });
  const st = t.lastState('zuschauer');
  assert.equal(st.you, null);
  for (const P of st.view.players) assert.equal(P.deck, undefined);
});

test('Lange Abwesenheit: nach 5 Minuten scheidet der Spieler aus', async () => {
  const t = await started(3);
  t.m.detach('s2');
  t.advance(ABANDON_MS + 1000);
  const P = t.room().run.players[2];
  assert.equal(P.alive, false);
  assert.equal(P.place, 3);
});

test('Kompletter Online-Run (3 Spieler, KI steuert die Clients) bis zum Ende', async () => {
  const t = await started(3, { pathLength: 'short', seals: 2 });
  const room = t.room();
  const rng = { rng: 5 };
  let guard = 0;
  while (room.status === 'playing' && guard++ < 20000) {
    const who = t.engine.awaitingRun(room.run);
    if (!who.length) { t.advance(1000); continue; }
    const p = who[guard % who.length];
    const a = t.engine.runAiAction(room.run, p, 'normal', rng);
    const { player, ...rest } = a;
    const res = t.m.action(t.sockets[p], { action: rest });
    if (!res.ok) t.advance(70 * 1000);
  }
  assert.equal(room.status, 'over');
  assert.equal(room.run.phase, 'over');
  const st = t.lastState('s0');
  assert.equal(st.view.phase, 'over');
  assert.deepEqual(room.run.players.map((P) => P.place).sort(), [1, 2, 3]);
});
