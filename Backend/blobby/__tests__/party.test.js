// Blobby: Partyregeln (Doppelball, Wind, Riesenball, Mini-Netz) und „König des Strandes“ — Welt und Raumablauf ohne
// Netz, mit einem nachgebauten io. Ausführen: npm test -- blobby (im Backend-Ordner)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { _intern: B, BLOBBY_CONSTANTS: C } = require('../socket');

// io-Attrappe: merkt sich, wer welches Ereignis bekommen hätte
function fakeIo() {
  const sent = [];
  return { sent, to: (id) => ({ emit: (ev, data) => sent.push({ id, ev, data }) }) };
}

// Partie mit Einstellungen; Blobs aus dem Weg, damit nur der Ball zählt
function rally(party = [], extra = {}) {
  const settings = B.sanitizeSettings({ party, ...extra });
  const game = B.newGame('TEST' + Math.random().toString(36).slice(2, 6), settings);
  game.status = 'playing';
  const w = game.world;
  for (const slot of [1, 2, 3, 4]) w.blobs[slot].x = slot % 2 ? 40 : w.width - 40;
  w.phase = 'rally';
  return game;
}

test('Einstellungen: Partyregeln frei kombinierbar, nur auf dem klassischen Feld; Doppelball ohne Berührungslimit', () => {
  const s = B.sanitizeSettings({ party: ['wind', 'quatsch', 'riesenball'], maxTouches: 3, koenig: true });
  assert.deepEqual(s.party, ['wind', 'riesenball']);
  assert.equal(s.koenig, true);
  assert.equal(s.maxTouches, 3);
  const d = B.sanitizeSettings({ party: ['doppelball'], maxTouches: 3 });
  assert.equal(d.maxTouches, 0, 'zwei Bälle: kein Berührungslimit');
  const beach = B.sanitizeSettings({ party: ['wind'], koenig: true, field: 'beach' });
  assert.deepEqual(beach.party, []);
  assert.equal(beach.koenig, false);
  // Ohne Angabe bleibt der vorige Stand (Host ändert nur einen Regler)
  assert.deepEqual(B.sanitizeSettings({ mode: '2v2' }, s).party, ['wind', 'riesenball']);
});

test('Riesenball: größer, landet entsprechend höher und steht im Schnappschuss', () => {
  const game = rally(['riesenball']);
  const w = game.world;
  assert.ok(w.ballR > C.BALL_RADIUS * 1.5);
  for (let i = 0; i < 400 && w.phase === 'rally'; i++) B.stepWorld(game);
  assert.equal(w.phase, 'point', 'Ball ist gelandet');
  assert.ok(Math.abs(w.ball.y - (C.GROUND_Y - w.ballR)) < 0.01, 'liegt mit seinem Radius im Sand');
  assert.equal(B.snapshot(game).br, w.ballR);
});

test('Mini-Netz: die Pfeilerkante liegt deutlich tiefer', () => {
  const game = rally(['mininetz']);
  assert.ok(B.netTopY(game.world) > C.NET_BASE_TOP + 100);
  assert.equal(B.netTopY(rally([]).world), C.NET_BASE_TOP);
});

test('Wind: je Aufschlag neu, treibt den Ball seitlich ab', () => {
  const game = rally(['wind']);
  const w = game.world;
  assert.ok(Math.abs(w.wind) >= 0.03 && Math.abs(w.wind) <= 0.08, `Wind ${w.wind}`);
  const x0 = w.ball.x;
  for (let i = 0; i < 40; i++) B.stepWorld(game);
  assert.ok(Math.sign(w.ball.x - x0) === Math.sign(w.wind) && Math.abs(w.ball.x - x0) > 5, 'Ball treibt mit dem Wind');
  assert.equal(B.snapshot(game).wd, Math.round(w.wind * 1000) / 1000);
  assert.equal(B.snapshot(rally([])).wd, undefined, 'ohne Wind kein Feld');
});

test('Doppelball: zweiter Ball auf der anderen Seite; der erste im Sand gibt genau einen Punkt', () => {
  const game = rally(['doppelball']);
  const w = game.world;
  assert.ok(w.ball2, 'zweiter Ball');
  assert.ok((w.ball.x < w.netX) !== (w.ball2.x < w.netX), 'je ein Ball pro Seite');
  assert.ok(Array.isArray(B.snapshot(game).b2));
  for (let i = 0; i < 400 && w.phase === 'rally'; i++) B.stepWorld(game);
  assert.equal(w.score[1] + w.score[2], 1, 'genau ein Punkt');
  assert.equal(B.snapshot(rally([])).b2, undefined, 'ohne Doppelball kein zweiter Ball');
});

test('König des Strandes: kurze Partie bis 7, Verlierer ans Ende, der Nächste rückt nach, Serie zählt', () => {
  const io = fakeIo();
  const settings = B.sanitizeSettings({ koenig: true });
  const game = B.newGame('KOENIG', settings);
  B.games.set(game.code, game);
  try {
    const player = (name, id) => ({ name, connected: true, socketId: id, disconnectTimer: null, conn: 1 });
    game.players[1] = player('Anna', 's-anna');
    game.players[2] = player('Ben', 's-ben');
    game.spectators.set('s-cem', 'Cem');
    game.spectators.set('s-dora', 'Dora');
    for (const [id, slot] of [['s-anna', 1], ['s-ben', 2]]) B.socketIndex.set(id, { code: game.code, role: 'player', slot });
    for (const id of ['s-cem', 's-dora']) B.socketIndex.set(id, { code: game.code, role: 'spectator', slot: null });

    // 7:6 reicht im König-Modus (ein Punkt Abstand)
    game.world.score = { 1: 7, 2: 6 };
    assert.equal(B.hasWon(game, 1), true);
    assert.equal(B.sanitize(game).scoreToWin, B.KING_SCORE);

    // Anna gewinnt: Krone, Ben raus, Cem rein
    game.status = 'finished'; game.winner = 1;
    B.crownKing(game);
    assert.deepEqual(B.sanitize(game).king, { team: 1, names: ['Anna'], streak: 1 });
    assert.equal(B.rotateKing(game, io), true);
    assert.equal(game.players[1].name, 'Anna', 'König bleibt');
    assert.equal(game.players[2].name, 'Cem', 'der Nächste rückt nach');
    assert.deepEqual([...game.spectators.values()], ['Dora', 'Ben'], 'Verlierer hinten in der Warteschlange');
    assert.equal(game.status, 'playing', 'neue Partie läuft von selbst');
    assert.equal(game.world.serveTeam, 2, 'Herausforderer schlagen auf');
    assert.ok(io.sent.some((m) => m.id === 's-cem' && m.ev === 'bv:slot' && m.data.slot === 2), 'Cem erfährt seinen Platz');

    // Anna gewinnt wieder: Serie 2, Dora rückt nach
    game.status = 'finished'; game.winner = 1;
    B.crownKing(game);
    assert.equal(game.king.streak, 2);
    B.rotateKing(game, io);
    assert.equal(game.players[2].name, 'Dora');

    // Dora gewinnt: neue Königin, Serie 1, Anna geht in die Warteschlange
    game.status = 'finished'; game.winner = 2;
    B.crownKing(game);
    assert.deepEqual(B.sanitize(game).king, { team: 2, names: ['Dora'], streak: 1 });
    B.rotateKing(game, io);
    assert.equal(game.players[1].name, 'Ben', 'Ben war als Nächster dran');
    assert.ok([...game.spectators.values()].includes('Anna'));

    // Ein Spieler geht mitten in der Partie: der Nächste rückt sofort nach
    B.freeSlot(game, 1, io);
    assert.ok(game.players[1], 'Platz sofort wieder besetzt');
    assert.equal(game.status, 'playing');

    // Ein später Wechsel-Timer nach Einstellungsänderung tut nichts
    game.status = 'waiting';
    assert.equal(B.rotateKing(game, io), false);
  } finally {
    B.games.delete(game.code);
    for (const id of ['s-anna', 's-ben', 's-cem', 's-dora']) B.socketIndex.delete(id);
  }
});
