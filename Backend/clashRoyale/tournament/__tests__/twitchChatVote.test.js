// Twitch-Chat draftet im Pyramidendraft für den Streamer (core/twitchChat.js + modes/pyramidDraft.js).
// Ohne Server, IRC und Datenbank: die Stores mit SQLite-Datei werden wie in _harness.js ersetzt.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const stub = new Proxy({}, { get: () => () => null });
for (const s of ['bannedCardsStore', 'crPresetStore', 'crProfileStore', 'crStreamerStore', 'winTrackerStore']) {
  const p = require.resolve(path.join(__dirname, '../../lib', s + '.js'));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: stub };
}

const { lobbies, sanitizeLobby } = require('../../core/lobbies');
const registry = require('../../core/registry');
const twitchChat = require('../../core/twitchChat');
require('../../modes');

const io = { to: () => ({ emit() {} }) };
const said = [];
twitchChat.setIo(io);
twitchChat.attachIrc({ refresh: async () => {}, status: () => ({ connected: true, joined: ['streamer'] }), say: (ch, t) => said.push(t) });

function mkLobby() {
  const lobby = {
    code: 'CHAT01', mode: 'pyramid-draft', host: 's1', partyMode: 'solo', timerSeconds: 25, cardsPerRound: 4,
    ...registry.defaultSettings(), excludedCards: [], started: true, game: null, history: [],
    players: [
      { id: 's1', name: 'Streamer', twitchId: '42', deck: [], isSpectator: false },
      { id: 'p2', name: 'Freund', deck: [], isSpectator: false },
    ],
    twitchChat: { channel: 'streamer', ownerTwitchId: '42', ownerName: 'Streamer', lang: 'de' },
  };
  lobbies.set(lobby.code, lobby);
  return lobby;
}

const waitPicking = (g) => new Promise(r => { const t = setInterval(() => { if (g.phase === 'picking') { clearInterval(t); r(); } }, 20); });

test('Chat stimmt für den Streamer ab: Filter, Umentscheiden, Auswertung, Wechselmodus', async () => {
  const lobby = mkLobby();
  const mode = registry.getMode('pyramid-draft');
  assert.deepStrictEqual(twitchChat.getChatChannels(), ['streamer']);
  const pub = sanitizeLobby(lobby).twitchChat;
  assert.strictEqual(pub.ownerPlayerId, 's1');
  assert.ok(!('ownerTwitchId' in pub), 'Twitch-ID bleibt auf dem Server');

  mode.start(lobby, io);
  const g = lobby.game;
  const current = () => lobby.players[g.turnOrder[g.currentTurn]];
  while (current().id !== 's1') { mode.onTimerExpire(lobby, io); await waitPicking(g); }
  assert.ok(g.chatVote);
  assert.strictEqual(g.turnSeconds, 30);
  const opts = g.chatVote.options.length;

  // Klick des Streamers zählt im Chat-Zug nicht
  const opt0 = g.chatVote.options[0];
  mode.socketHandlers['clash:pyramid:pick']({ socket: { id: 's1', emit() {} }, io }, { code: lobby.code, row: opt0.r, col: opt0.c });
  assert.strictEqual(lobby.players[0].deck.length, 0);

  twitchChat.onChatMessage('#other', { username: 'a' }, '1');
  twitchChat.onChatMessage('#streamer', { username: 'a' }, 'hallo 2');
  twitchChat.onChatMessage('#streamer', { username: 'a' }, String(opts + 1));
  assert.strictEqual(g.chatVote.total, 0);
  twitchChat.onChatMessage('#streamer', { username: 'a' }, '2');
  twitchChat.onChatMessage('#streamer', { username: 'b' }, '!2');
  twitchChat.onChatMessage('#streamer', { username: 'c' }, '1');
  twitchChat.onChatMessage('#streamer', { username: 'c' }, '2');
  assert.strictEqual(g.chatVote.total, 3);
  assert.deepStrictEqual(g.chatVote.counts.slice(0, 2), [0, 3]);

  lobby.chatVoters = 'subs';
  twitchChat.onChatMessage('#streamer', { username: 'd' }, '1');
  assert.strictEqual(g.chatVote.total, 3);
  twitchChat.onChatMessage('#streamer', { username: 'e', badges: { subscriber: '6' } }, '1');
  assert.strictEqual(g.chatVote.total, 4);
  lobby.chatVoters = 'all';

  mode.onPlayerDisconnected(lobby, io, 's1');
  assert.ok(g.chatVote, 'kurzer Verbindungsabbruch stoppt die Abstimmung nicht');

  const target = g.chatVote.options[1];
  const card = g.pyramid[target.r][target.c].card;
  mode.onTimerExpire(lobby, io);
  assert.strictEqual(lobby.players[0].deck.at(-1).id, card.id);
  assert.deepStrictEqual(g.lastEvent.chat, { n: 2, votes: 3, total: 4 });
  assert.match(said.at(-1), /3 von 4 Stimmen/);

  // Wechselmodus: mit ungerader Deckgröße pickt der Streamer selbst
  lobby.chatShare = 'alternate';
  await waitPicking(g);
  while (current().id !== 's1') { mode.onTimerExpire(lobby, io); await waitPicking(g); }
  assert.strictEqual(g.chatVote, null);

  // Fremde dürfen nicht vorzeitig auswerten, der Streamer schon
  lobby.chatShare = 'all';
  mode.onTimerExpire(lobby, io); await waitPicking(g);
  while (current().id !== 's1') { mode.onTimerExpire(lobby, io); await waitPicking(g); }
  const end = mode.socketHandlers['clash:pyramid:chatVoteEnd'];
  end({ socket: { id: 'p2' }, io, canControl: () => false }, { code: lobby.code });
  assert.ok(g.chatVote);
  const before = lobby.players[0].deck.length;
  end({ socket: { id: 's1' }, io, canControl: () => false }, { code: lobby.code });
  assert.strictEqual(lobby.players[0].deck.length, before + 1);
  assert.strictEqual(g.lastEvent.chat.total, 0);

  let guard = 0;
  while (!g.finished && guard++ < 200) { mode.onTimerExpire(lobby, io); await waitPicking(g); }
  assert.ok(g.finished);
  assert.strictEqual(lobby.players[0].deck.length, 8);
  lobbies.delete(lobby.code);
});
