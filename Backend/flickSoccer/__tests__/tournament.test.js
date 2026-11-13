// Turnier-Logik von Flick Soccer ohne socket.io und ohne Datenbank:  npm run test:flick
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { createRoomManager } = require('../roomManager');
const { createTournamentManager, READY_MS } = require('../tournamentManager');
const { buildBracket, bracketSize, champion, setResult } = require('../bracket');

const enginePromise = import(pathToFileURL(path.join(__dirname, '..', 'shared', 'engine', 'index.js')).href);
const ADMIN = { isAdmin: true };
const GUEST = { isAdmin: false };
const tokenOf = (i) => `token${String(i).padStart(4, '0')}`;

function memoryStore() {
  const rows = new Map();
  return {
    save: (code, t) => rows.set(code, JSON.stringify(t)),
    remove: (code) => rows.delete(code),
    loadAll: () => [...rows.values()].map((r) => JSON.parse(r)),
    rows,
  };
}

async function setup({ players = 0, maxPlayers = 8, rules, store = null } = {}) {
  const engine = await enginePromise;
  let t = 1_000_000;
  const log = [];
  const send = (id, event, payload) => log.push({ id, event, payload });
  const rooms = createRoomManager({ engine, send, now: () => t });
  const tm = createTournamentManager({ engine, rooms, send, now: () => t, store });
  const c = tm.create('ADMIN', { name: 'Pokal', maxPlayers, rules }, ADMIN);
  for (let i = 0; i < players; i++) tm.signup(`S${i}`, { code: c.code, name: `Spieler ${i}`, token: tokenOf(i) });
  const tour = () => tm._tournaments.get(c.code);
  return { engine, rooms, tm, code: c.code, tour, log, send, advance: (ms) => (t += ms), now: () => t };
}

// Beide Spieler betreten den Raum der Paarung; Rückgabe: Socket-IDs [Rot, Blau]
function enter(ctx, m) {
  const t = ctx.tour();
  const ids = [m.a, m.b].map((pid, seat) => {
    const p = t.players.find((o) => o.id === pid);
    const socketId = `${m.id}-${seat}`;
    const res = ctx.rooms.join(socketId, { code: m.room, name: 'egal', token: p.token });
    assert.equal(res.seat, seat);
    return socketId;
  });
  return ids;
}

// Paarung zu Ende spielen: beide bereit, dann gibt der Verlierer auf
function play(ctx, m, winnerSeat) {
  const ids = enter(ctx, m);
  ctx.rooms.setReady(ids[0], { ready: true });
  ctx.rooms.setReady(ids[1], { ready: true });
  ctx.rooms.leave(ids[1 - winnerSeat]);
  ctx.rooms.leave(ids[winnerSeat]);
}

test('Baum: Freilose nur in Runde 1, nie zwei Freilose gegeneinander, jeder Spieler genau einmal', () => {
  for (let n = 2; n <= 64; n++) {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const rounds = buildBracket(ids);
    assert.equal(rounds[0].length, bracketSize(n) / 2);
    const seen = [];
    for (const m of rounds[0]) {
      assert.notEqual(m.a, null, `n=${n}: Paarung ohne Spieler`);
      seen.push(m.a);
      if (m.b !== null) seen.push(m.b);
      else assert.equal(m.how, 'bye');
    }
    assert.deepEqual([...seen].sort(), [...ids].sort());
    // den Baum durchspielen: immer a gewinnt
    for (const round of rounds) for (const m of round) if (m.status !== 'done') setResult(rounds, m, m.a, {});
    assert.ok(ids.includes(champion(rounds)));
  }
});

test('Nur der Admin erstellt, startet und entscheidet', async () => {
  const ctx = await setup({ players: 4 });
  assert.equal(ctx.tm.create('X', { name: 'Fremd' }, GUEST).ok, false);
  assert.equal(ctx.tm.start('X', { code: ctx.code }, GUEST).ok, false);
  assert.equal(ctx.tm.cancel('X', { code: ctx.code }, GUEST).ok, false);
  assert.equal(ctx.tm.update('X', { code: ctx.code, name: 'Gekapert' }, GUEST).ok, false);
  assert.equal(ctx.tour().status, 'signup');
  assert.equal(ctx.tour().name, 'Pokal');
  assert.equal(ctx.tm.start('ADMIN', { code: ctx.code }, ADMIN).ok, true);
  const m = ctx.tour().rounds[0][0];
  assert.equal(ctx.tm.setWinner('X', { code: ctx.code, matchId: m.id, winner: m.a }, GUEST).ok, false);
});

test('Anmeldung: Name doppelt, voll, abmelden, Token bleiben auf dem Server', async () => {
  const ctx = await setup({ players: 3, maxPlayers: 4 });
  assert.equal(ctx.tm.signup('Y', { code: ctx.code, name: 'spieler 1', token: 'tokenYYYY' }).ok, false);
  assert.equal(ctx.tm.signup('Y', { code: ctx.code, name: 'Neu', token: 'tokenYYYY' }).ok, true);
  assert.equal(ctx.tm.signup('Z', { code: ctx.code, name: 'Zu spät', token: 'tokenZZZZ' }).error, 'Das Turnier ist voll.');
  assert.equal(ctx.tm.withdraw('Y', { code: ctx.code, token: 'tokenYYYY' }).ok, true);
  assert.equal(ctx.tour().players.length, 3);
  const w = ctx.tm.watch('W', { code: ctx.code, token: tokenOf(1) }, GUEST);
  assert.equal(w.isAdmin, false);
  assert.equal(w.state.me, ctx.tour().players[1].id);
  assert.equal(JSON.stringify(w.state).includes('token0'), false);
});

test('Regeln je Runde: am Finale ausgerichtet, frühe Runden fallen bei weniger Spielern weg', async () => {
  const rules = [{ field: 'eisbahn', goalsToWin: 1 }, { field: 'flipper', goalsToWin: 3 }, { field: 'arena', goalsToWin: 5 }];
  const ctx = await setup({ players: 4, maxPlayers: 8, rules });
  assert.deepEqual(ctx.tour().rules.map((r) => r.field), ['eisbahn', 'flipper', 'arena']);
  ctx.tm.start('ADMIN', { code: ctx.code }, ADMIN);
  // 4 Spieler → 2 Runden: Halbfinale bekommt die Regel der vorletzten Runde, das Finale bleibt das Finale
  assert.deepEqual(ctx.tour().rules.map((r) => [r.field, r.goalsToWin]), [['flipper', 3], ['arena', 5]]);
  const m = ctx.tour().rounds[0][0];
  assert.equal(ctx.rooms._rooms.get(m.room).settings.field, 'flipper');
  // laufende Runde ist gesperrt, das Finale lässt sich noch ändern
  ctx.tm.update('ADMIN', { code: ctx.code, rules: [{ field: 'strand' }, { field: 'burghof', goalsToWin: 2 }] }, ADMIN);
  assert.deepEqual(ctx.tour().rules.map((r) => r.field), ['flipper', 'burghof']);
});

test('Ganzes Turnier mit 5 Spielern: Freilose, Sieger rücken vor, Finale mit den Finalregeln, Meister', async () => {
  const rules = [{ field: 'eisbahn' }, { field: 'flipper' }, { field: 'arena', goalsToWin: 5 }];
  const ctx = await setup({ players: 5, maxPlayers: 8, rules });
  ctx.tm.watch('W', { code: ctx.code, token: tokenOf(0) }, GUEST);
  ctx.tm.start('ADMIN', { code: ctx.code }, ADMIN);
  const t = ctx.tour();
  assert.equal(t.rounds.length, 3);
  assert.equal(t.rounds[0].filter((m) => m.how === 'bye').length, 3);
  let guard = 0;
  while (t.status === 'running' && guard++ < 20) {
    const open = t.rounds.flat().filter((m) => m.status === 'ready');
    assert.ok(open.length > 0, 'es muss immer eine spielbare Paarung geben');
    for (const m of open) {
      const room = ctx.rooms._rooms.get(m.room);
      assert.equal(room.settings.field, t.rules[m.round].field);
      assert.equal(room.locked.tournament, ctx.code);
      play(ctx, m, 0);
      assert.equal(m.status, 'done');
      assert.equal(m.winner, m.a);
      assert.equal(m.how, 'forfeit');
    }
  }
  assert.equal(t.status, 'done');
  const final = t.rounds[2][0];
  assert.equal(final.winner, final.a);
  assert.ok(ctx.log.some((l) => l.id === 'W' && l.event === 'ft:state' && l.payload.champion === final.a));
  // alle Räume sind aufgeräumt, sobald die Spieler gegangen sind
  assert.equal(ctx.rooms._rooms.size, 0);
});

test('Turnier-Raum: Fremde schauen nur zu, Regeln gesperrt, keine Revanche, Ergebnis mit Spielstand', async () => {
  const ctx = await setup({ players: 2, maxPlayers: 4, rules: [{ goalsToWin: 1 }, { goalsToWin: 1 }] });
  ctx.tm.start('ADMIN', { code: ctx.code }, ADMIN);
  const m = ctx.tour().rounds[0][0];
  assert.equal(ctx.rooms.join('F', { code: m.room, name: 'Fremd', token: 'tokenFREMD' }).spectator, true);
  const [a, b] = enter(ctx, m);
  assert.equal(ctx.rooms.setSettings(a, { settings: { goalsToWin: 5 } }).ok, false);
  ctx.rooms.setReady(a, { ready: true });
  ctx.rooms.setReady(b, { ready: true });
  ctx.tm.tick();
  assert.equal(m.status, 'live');
  ctx.rooms.leave(b);
  assert.equal(m.status, 'done');
  assert.equal(m.winner, m.a);
  assert.deepEqual(m.score, [0, 0]);
  assert.equal(ctx.rooms.rematch(a).ok, false);
  assert.equal(ctx.tour().status, 'done');
});

test('Frist: einer fehlt → kampflos weiter; beide da → Anpfiff ohne „Bereit"; keiner da → bleibt offen', async () => {
  const ctx = await setup({ players: 4, maxPlayers: 4 });
  ctx.tm.start('ADMIN', { code: ctx.code }, ADMIN);
  const [m0, m1] = ctx.tour().rounds[0];
  const p0 = ctx.tour().players.find((o) => o.id === m0.b);
  ctx.rooms.join('solo', { code: m0.room, name: 'x', token: p0.token });
  ctx.advance(READY_MS - 1000);
  ctx.tm.tick();
  assert.equal(m0.status, 'ready');
  assert.equal(m1.status, 'ready');
  ctx.advance(2000);
  ctx.tm.tick();
  assert.equal(m0.status, 'done');
  assert.equal(m0.how, 'walkover');
  assert.equal(m0.winner, m0.b);
  assert.ok(ctx.log.some((l) => l.id === 'solo' && l.event === 'fs:closed'));
  assert.equal(m1.status, 'ready', 'niemand da: bleibt offen');
  // jetzt kommen beide, drücken aber nicht „Bereit" → Anpfiff beim nächsten Tick
  enter(ctx, m1);
  ctx.tm.tick();
  assert.equal(m1.status, 'live');
  assert.equal(ctx.rooms._rooms.get(m1.room).phase, 'playing');
});

test('Admin entscheidet eine offene Paarung; Absagen schließt alle Räume; Löschen erst danach', async () => {
  const ctx = await setup({ players: 4, maxPlayers: 4 });
  ctx.tm.start('ADMIN', { code: ctx.code }, ADMIN);
  const [m0, m1] = ctx.tour().rounds[0];
  const [a] = enter(ctx, m0);
  assert.equal(ctx.tm.setWinner('ADMIN', { code: ctx.code, matchId: m0.id, winner: 'FREMD' }, ADMIN).ok, false);
  assert.equal(ctx.tm.setWinner('ADMIN', { code: ctx.code, matchId: m0.id, winner: m0.b }, ADMIN).ok, true);
  assert.equal(m0.how, 'admin');
  assert.equal(ctx.tour().rounds[1][0].a, m0.b);
  assert.ok(ctx.log.some((l) => l.id === a && l.event === 'fs:closed'));
  assert.equal(ctx.tm.setWinner('ADMIN', { code: ctx.code, matchId: m0.id, winner: m0.a }, ADMIN).ok, false);
  assert.equal(ctx.tm.remove('ADMIN', { code: ctx.code }, ADMIN).ok, false);
  const room1 = m1.room;
  assert.equal(ctx.tm.cancel('ADMIN', { code: ctx.code }, ADMIN).ok, true);
  assert.equal(ctx.rooms._rooms.has(room1), false);
  assert.equal(ctx.tour().status, 'cancelled');
  assert.equal(ctx.tm.remove('ADMIN', { code: ctx.code }, ADMIN).ok, true);
  assert.equal(ctx.tm.watch('W', { code: ctx.code }, GUEST).error, 'notFound');
});

test('Neustart: Turnier kommt aus dem Speicher zurück, offene Spiele bekommen ihren Raum unter demselben Code', async () => {
  const store = memoryStore();
  const ctx = await setup({ players: 4, maxPlayers: 4, store });
  ctx.tm.start('ADMIN', { code: ctx.code }, ADMIN);
  play(ctx, ctx.tour().rounds[0][0], 1);
  const openCode = ctx.tour().rounds[0][1].room;

  const rooms2 = createRoomManager({ engine: ctx.engine, send: ctx.send, now: ctx.now });
  const tm2 = createTournamentManager({ engine: ctx.engine, rooms: rooms2, send: ctx.send, now: ctx.now, store });
  assert.equal(tm2.restore(), 1);
  const t2 = tm2._tournaments.get(ctx.code);
  assert.equal(t2.rounds[0][0].status, 'done');
  assert.equal(t2.rounds[0][1].status, 'ready');
  assert.equal(t2.rounds[0][1].room, openCode);
  assert.ok(rooms2._rooms.has(openCode));
  // und es geht bis zum Ende weiter
  const ctx2 = { ...ctx, rooms: rooms2, tm: tm2, tour: () => t2 };
  play(ctx2, t2.rounds[0][1], 0);
  play(ctx2, t2.rounds[1][0], 0);
  assert.equal(t2.status, 'done');
});
