// Blobby: Accessoire des Blobs (Laden) — der Server prüft die Zahl nur, merkt sie je Verbindung und gibt sie mit den
// Spielern weiter; auch wer als Zuschauer wartet und nachrückt, behält sein Accessoire. npm test -- blobby
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { _intern: B } = require('../socket');

function fakeIo() {
  const sent = [];
  return { sent, to: (id) => ({ emit: (ev, data) => sent.push({ id, ev, data }) }) };
}

test('Accessoire: nur kleine ganze Zahlen, alles andere wird zu „ohne“', () => {
  assert.equal(B.cleanZier(2), 2);
  assert.equal(B.cleanZier(15), 15);
  for (const x of [16, -1, 1.5, '2', null, undefined, {}]) assert.equal(B.cleanZier(x), 0, String(x));
});

test('Accessoire geht mit den Spielern raus; nachrückende Zuschauer behalten ihres', () => {
  const game = B.newGame('ZIER' + Math.random().toString(36).slice(2, 5), B.sanitizeSettings({}));
  game.zier.set('s1', 1);
  game.players[1] = { name: 'Mia', connected: true, socketId: 's1', disconnectTimer: null, conn: 1, zier: B.zierVon(game, 's1') };
  game.spectators.set('s2', 'Ben');
  game.zier.set('s2', 2);
  B.promoteSpectator(game, 2, 's2', 'Ben', fakeIo());
  const players = B.sanitize(game).players;
  assert.equal(players[1].zier, 1);
  assert.equal(players[2].zier, 2);
  assert.equal(players[2].name, 'Ben');
  assert.equal(B.zierVon(game, 'unbekannt'), 0);
});
