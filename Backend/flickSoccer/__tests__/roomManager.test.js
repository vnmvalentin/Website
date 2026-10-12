// Raum-Logik von Flick Soccer ohne socket.io:  npm run test:flick
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { createRoomManager } = require('../roomManager');

const enginePromise = import(pathToFileURL(path.join(__dirname, '..', 'shared', 'engine', 'index.js')).href);

async function setup(settings = { goalsToWin: 1, turnSeconds: 10 }) {
  const engine = await enginePromise;
  let t = 1_000_000;
  const log = [];
  const m = createRoomManager({ engine, send: (id, event, payload) => log.push({ id, event, payload }), now: () => t });
  const c = m.create('A', { name: 'Alice', token: 'tokenAAAA', settings, formation: '3-1' });
  const room = m._rooms.get(c.code);
  return { engine, m, c, room, log, advance: (ms) => (t += ms) };
}

test('Beitreten, Zuschauer, Start erst wenn beide bereit', async () => {
  const { m, c, room } = await setup();
  assert.equal(c.ok, true);
  assert.deepEqual(m.join('B', { code: c.code, name: 'Bob', token: 'tokenBBBB' }), { ok: true, code: c.code, seat: 1 });
  assert.equal(m.join('C', { code: c.code, name: 'Carl', token: 'tokenCCCC' }).spectator, true);
  assert.equal(m.join('D', { code: 'XXXXX', token: 'tokenDDDD' }).error, 'notFound');
  m.setReady('A', { ready: true });
  assert.equal(room.phase, 'lobby');
  m.setReady('B', { ready: true });
  assert.equal(room.phase, 'playing');
  assert.deepEqual(room.match.formations, ['3-1', '2-2']);
});

test('Schuss: nur wer dran ist, mit eigener Scheibe; Zug wechselt', async () => {
  const { m, c, room } = await setup();
  m.join('B', { code: c.code, name: 'Bob', token: 'tokenBBBB' });
  m.setReady('A', { ready: true });
  m.setReady('B', { ready: true });
  assert.equal(m.shoot('B', { piece: 7, sx: -1, sy: 0 }).ok, false);
  assert.equal(m.shoot('A', { piece: 7, sx: -1, sy: 0 }).ok, false);
  assert.equal(m.shoot('A', { piece: 4, sx: 0.4, sy: 0.3 }).ok, true);
  assert.equal(room.lastShot.seq, 1);
  assert.equal(room.lastShot.team, 0);
  if (room.lastShot.goal === null) assert.equal(room.match.turn, 1);
});

test('Zugzeit läuft ab → anderer ist dran', async () => {
  const { m, c, room, advance } = await setup();
  m.join('B', { code: c.code, name: 'Bob', token: 'tokenBBBB' });
  m.setReady('A', { ready: true });
  m.setReady('B', { ready: true });
  advance(5000);
  m.tick();
  assert.equal(room.match.turn, 0);
  advance(10_000);
  m.tick();
  assert.equal(room.match.turn, 1);
});

test('Wiederverbinden per Token übernimmt den Platz; Verlassen im Spiel = Aufgabe', async () => {
  const { m, c, room, log } = await setup();
  m.join('B', { code: c.code, name: 'Bob', token: 'tokenBBBB' });
  m.setReady('A', { ready: true });
  m.setReady('B', { ready: true });
  assert.equal(m.join('B2', { code: c.code, name: 'egal', token: 'tokenBBBB' }).seat, 1);
  assert.ok(log.some((l) => l.id === 'B' && l.event === 'fs:kicked'));
  m.leave('B2');
  assert.equal(room.phase, 'over');
  assert.equal(room.forfeit, 1);
  assert.equal(room.match.winner, 0);
  // neuer Gegner kann einsteigen, Revanche startet neu
  assert.equal(m.join('E', { code: c.code, name: 'Eve', token: 'tokenEEEE' }).seat, 1);
  m.rematch('A');
  m.rematch('E');
  assert.equal(room.phase, 'playing');
  assert.equal(room.match.turn, 1); // Anstoß wechselt
});

test('Leerer Raum verschwindet', async () => {
  const { m, c } = await setup();
  m.leave('A');
  assert.equal(m._rooms.has(c.code), false);
});

test('Design: wird übernommen, unbekannte IDs abgelehnt, jederzeit änderbar', async () => {
  const { m, c, room } = await setup();
  m.join('B', { code: c.code, name: 'Bob', token: 'tokenBBBB', skin: 'metall' });
  assert.equal(room.seats[1].skin, 'metall');
  assert.equal(room.seats[0].skin, 'klassik');
  assert.equal(m.setSkin('A', { skin: 'gibtsnicht' }).ok, false);
  m.setReady('A', { ready: true });
  m.setReady('B', { ready: true });
  assert.equal(m.setSkin('A', { skin: 'krone' }).ok, true);
  assert.equal(room.seats[0].skin, 'krone');
});

test('Torwiederholung verlängert die Zugzeit nach einem Tor um die Wiederholungsdauer', async () => {
  const { engine, m, c, room } = await setup({ goalsToWin: 3, turnSeconds: 10, replay: true });
  m.join('B', { code: c.code, name: 'Bob', token: 'tokenBBBB' });
  m.setReady('A', { ready: true });
  m.setReady('B', { ready: true });
  // Ball direkt hinter die rechte Torlinie legen: jeder Schuss von Team 0 zählt als Tor
  room.match = { ...room.match, state: { ...room.match.state, ball: { x: engine.FIELD.W + engine.BALL.R + 5, y: 320 } } };
  const t0 = room.turnEndsAt;
  assert.equal(m.shoot('A', { piece: 0, sx: 0.01, sy: 0 }).ok, true);
  const steps = 1;
  assert.equal(room.lastShot.goal, 0);
  assert.ok(room.turnEndsAt >= 1_000_000 + 2400 + engine.replayMs(steps) + 10_000 - 5, 'Wiederholung eingerechnet');
  assert.ok(t0 !== room.turnEndsAt);
});

test('Nach dem Abpfiff: Aufstellung ändern, Revanche-Wunsch sichtbar, Revanche nutzt die neue Aufstellung', async () => {
  const { engine, m, c, room, log } = await setup({ goalsToWin: 1, turnSeconds: 10 });
  m.join('B', { code: c.code, name: 'Bob', token: 'tokenBBBB' });
  m.setReady('A', { ready: true });
  m.setReady('B', { ready: true });
  room.match = { ...room.match, state: { ...room.match.state, ball: { x: engine.FIELD.W + engine.BALL.R + 5, y: 320 } } };
  m.shoot('A', { piece: 0, sx: 0.01, sy: 0 });
  assert.equal(room.phase, 'over');
  assert.equal(m.setFormation('A', { formation: 'V' }).ok, true);
  m.rematch('B');
  const last = log.filter((l) => l.id === 'A' && l.event === 'fs:room').pop().payload;
  assert.equal(last.seats[1].rematch, true, 'A sieht, dass B eine Revanche will');
  assert.equal(last.seats[0].formation, 'V');
  m.rematch('A');
  assert.equal(room.phase, 'playing');
  assert.deepEqual(room.match.formations, ['V', '2-2']);
});

test('Feld und Chaos: Einstellungen des Hosts gelten fürs Spiel; der Schuss trägt sein Power-up', async () => {
  const { engine, m, c, room } = await setup({ goalsToWin: 3, turnSeconds: 10, field: 'halle', chaos: true });
  m.join('B', { code: c.code, name: 'Bob', token: 'tokenBBBB' });
  assert.equal(m.setSettings('B', { settings: { field: 'kaefig' } }).ok, false, 'nur der Host');
  assert.equal(m.setSettings('A', { settings: { field: 'gibtsnicht' } }).ok, true);
  assert.equal(room.settings.field, 'standard', 'unbekanntes Feld → Stadion');
  m.setSettings('A', { settings: { field: 'halle' } });
  m.setReady('A', { ready: true });
  m.setReady('B', { ready: true });
  assert.equal(room.match.state.field, 'halle');
  assert.ok(room.match.chaos && Number.isFinite(room.match.chaos.seed));
  const expected = engine.currentPowerup(room.match);
  assert.ok(engine.POWERUP_IDS.includes(expected));
  assert.equal(m.shoot('A', { piece: 3, sx: 0.2, sy: 0.1 }).ok, true);
  assert.equal(room.lastShot.power, expected);
  assert.equal(room.lastShot.start.field, 'halle');
});

test('Emotes: nur bekannte, gedrosselt, an alle im Raum', async () => {
  const { m, c, log, advance } = await setup();
  m.join('B', { code: c.code, name: 'Bob', token: 'tokenBBBB' });
  assert.equal(m.emote('A', { id: 'frei erfunden' }).ok, false);
  assert.equal(m.emote('A', { id: 'gg' }).ok, true);
  assert.equal(m.emote('A', { id: 'ups' }).ok, false, 'zu schnell');
  advance(3000);
  assert.equal(m.emote('A', { id: 'ups' }).ok, true);
  const got = log.filter((l) => l.event === 'fs:emote');
  assert.deepEqual(got.filter((l) => l.id === 'B').map((l) => l.payload), [{ seat: 0, id: 'gg' }, { seat: 0, id: 'ups' }]);
  assert.equal(got.filter((l) => l.id === 'A').length, 2, 'auch der Absender bekommt es');
});
