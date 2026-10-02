// Phase 3: Match-Raum — Zugang, Bereit/Start, Pick/Ban, Draft-Lobby, Spielergebnis, Serie, Chat.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, store, TAGS } = require('./_harness');
const room = require('../matchRoom');

const call = setup(test);
const OWNER = '100:veranstalter';
const A = { twitchId: '1' }, B = { twitchId: '2' }, BOSS = { twitchId: '100' }, STRANGER = { twitchId: '999' };

// Lobby-Attrappe: merkt sich angelegte/entfernte Lobbys
const lobbies = new Map();
let created = [];
room._setLobbyApi({
  create: (opts) => { const code = `L${created.length + 1}`; created.push({ code, ...opts }); lobbies.set(code, opts); return code; },
  exists: (code) => lobbies.has(code),
  remove: (code) => lobbies.delete(code),
});

async function startedTournament(settings, players = 2) {
  const { data } = await call('POST', '/', { user: OWNER, body: { settings: { name: 'Raum', ...settings } } });
  for (let i = 0; i < players; i++) {
    await call('POST', `/${data.id}/join`, { user: `${i + 1}:spieler${i + 1}`, body: { crTag: '#' + TAGS[i] } });
  }
  assert.equal((await call('POST', `/${data.id}/start`, { user: OWNER })).status, 200);
  const match = store.listMatches(data.id).find(m => m.status === 'pending');
  return { tid: data.id, mid: match.id };
}
const ctx = (tid, mid, who) => room._loadContext(tid, mid, who);
// Seite a/b im Match hängt von der Auslosung ab → Identitäten danach zuordnen
function sides(tid, mid) {
  const c = ctx(tid, mid, A);
  return c.side === 'a' ? { pa: A, pb: B } : { pa: B, pb: A };
}
const run = (name, tid, mid, who, payload = {}) => room._actions[name](ctx(tid, mid, who), payload);
/** Beide bereit → Countdown sofort "ablaufen lassen" (statt 3 s zu warten) → Spiel startet von selbst. */
function readyBoth(tid, mid, pa, pb) {
  run('ready', tid, mid, pa, { ready: true });
  const { autoStartAt } = run('ready', tid, mid, pb, { ready: true });
  assert.ok(autoStartAt, 'Countdown läuft');
  assert.equal(room._autoStart(tid, mid, autoStartAt), true);
}

test('Zugang: nur die beiden Spieler und der Veranstalter', async () => {
  const { tid, mid } = await startedTournament({ modes: ['snake', 'auction', 'bingo', 'dark-maze'], bestOf: { normal: 1, finals: 3 } });
  assert.equal(ctx(tid, mid, A).canEnter, true);
  assert.equal(ctx(tid, mid, BOSS).canEnter, true);
  assert.equal(ctx(tid, mid, BOSS).isOwner, true);
  assert.equal(ctx(tid, mid, STRANGER).canEnter, false);
  assert.throws(() => run('chat', tid, mid, STRANGER, { text: 'hi' }), /tournamentNoAccess/);
  assert.throws(() => run('ready', tid, mid, BOSS, { ready: true }), /tournamentNoAccess/);
});

test('Bo3 mit Pick & Ban: Bereit → Countdown → Start → Bannen → Draft-Lobby → Decks → Ergebnisse → Match entschieden', async () => {
  created = [];
  const { tid, mid } = await startedTournament({ modes: ['snake', 'auction', 'bingo', 'dark-maze'], bestOf: { normal: 1, finals: 3 } });
  const { pa, pb } = sides(tid, mid);

  // Nur einer bereit: kein Countdown, aber die Bereit-Frist läuft
  assert.equal(run('ready', tid, mid, pa, { ready: true }).autoStartAt, null);
  let st = room._buildState(ctx(tid, mid, pa));
  assert.ok(st.readyDeadline > Date.now());
  assert.equal(st.startAt, null);
  // Zurücknehmen beendet die Frist; beide bereit → Countdown, vor Ablauf startet nichts
  run('ready', tid, mid, pa, { ready: false });
  assert.equal(room._buildState(ctx(tid, mid, pa)).readyDeadline, null);
  run('ready', tid, mid, pa, { ready: true });
  const { autoStartAt } = run('ready', tid, mid, pb, { ready: true });
  assert.equal(room._autoStart(tid, mid, autoStartAt - 1000), false, 'Countdown noch nicht um');
  st = room._buildState(ctx(tid, mid, pa));
  assert.equal(st.startAt, autoStartAt);
  assert.equal(st.readyDeadline, null);
  assert.equal(room._autoStart(tid, mid, autoStartAt), true);
  st = room._buildState(ctx(tid, mid, pa));
  assert.equal(st.phase, 'banning');
  assert.equal(st.games[0].offer.length, 3);
  assert.deepEqual(st.ready, { a: false, b: false }, 'Bereit wird nach dem Start zurückgesetzt');
  assert.equal(st.banTurn, 'b');
  assert.throws(() => run('ready', tid, mid, pa, { ready: true }), /tournamentGameRunning/);

  // Bannen: B zuerst, dann A; der dritte Modus wird gespielt
  const offer = st.games[0].offer;
  assert.throws(() => run('ban', tid, mid, pa, { mode: offer[0] }), /tournamentNotYourTurn/);
  run('ban', tid, mid, pb, { mode: offer[0] });
  run('ban', tid, mid, pa, { mode: offer[1] });
  st = room._buildState(ctx(tid, mid, pa));
  assert.equal(st.phase, 'drafting');
  assert.equal(st.games[0].mode, offer[2]);
  assert.equal(created.length, 1);
  assert.equal(created[0].mode, offer[2]);
  assert.deepEqual(created[0].tournament.allowed.map(x => x.side), ['a', 'b']);
  assert.ok(st.games[0].lobbyCode);

  // Draft-Ende aus der Lobby → Decks im Raum, Phase "Kampf"
  const deck = (n) => Array.from({ length: 8 }, (_, i) => ({ id: `${n}-${i}`, name: `Karte ${i}`, rarity: 'Common', extra: 'weg' }));
  room.onDraftComplete({ tournament: created[0].tournament, players: [{ tournamentSide: 'a', deck: deck('a') }, { tournamentSide: 'b', deck: deck('b') }] });
  st = room._buildState(ctx(tid, mid, pa));
  assert.equal(st.phase, 'battle');
  assert.equal(st.games[0].decks.a.length, 8);
  assert.equal(st.games[0].decks.a[0].extra, undefined, 'nur die nötigen Kartenfelder');

  // Ergebnis nur durch den Veranstalter
  assert.throws(() => run('gameResult', tid, mid, pa, { gameNo: 1, winner: 'a' }), /noPermission/);
  assert.deepEqual(run('gameResult', tid, mid, BOSS, { gameNo: 1, winner: 'a', crownsA: 3, crownsB: 1 }), { matchDecided: false });
  st = room._buildState(ctx(tid, mid, pa));
  assert.equal(st.phase, 'lobby');
  assert.deepEqual([st.score.a, st.score.b], [1, 0]);
  assert.ok(!lobbies.has(created[0].code), 'Lobby wird nach dem Spiel aufgeräumt');

  // Spiel 2: jetzt bannt A zuerst; wird annulliert und neu gestartet
  readyBoth(tid, mid, pa, pb);
  st = room._buildState(ctx(tid, mid, pa));
  assert.equal(st.banTurn, 'a');
  run('voidGame', tid, mid, BOSS, { gameNo: 2 });
  st = room._buildState(ctx(tid, mid, pa));
  assert.equal(st.phase, 'lobby');
  assert.equal(st.games[1].status, 'void');

  // Spiel 3 (nach dem annullierten): A bannt weiterhin zuerst, B gewinnt
  readyBoth(tid, mid, pa, pb);
  st = room._buildState(ctx(tid, mid, pa));
  assert.equal(st.games[2].gameNo, 3);
  assert.equal(st.banTurn, 'a');
  run('ban', tid, mid, pa, { mode: st.games[2].offer[0] });
  run('ban', tid, mid, pb, { mode: st.games[2].offer[1] });
  run('gameResult', tid, mid, BOSS, { gameNo: 3, winner: 'b' });

  // Spiel 4: A gewinnt → 2:1, Match und (bei 2 Spielern) Turnier entschieden
  readyBoth(tid, mid, pa, pb);
  st = room._buildState(ctx(tid, mid, pa));
  const g4 = st.games.find(g => g.gameNo === 4);
  run('ban', tid, mid, pb, { mode: g4.offer[0] });
  run('ban', tid, mid, pa, { mode: g4.offer[1] });
  assert.deepEqual(run('gameResult', tid, mid, BOSS, { gameNo: 4, winner: 'a', crownsA: 2, crownsB: 0 }), { matchDecided: true });
  const m = store.listMatches(tid).find(x => x.id === mid);
  assert.equal(m.status, 'done');
  assert.deepEqual([m.winner, m.scoreA, m.scoreB, m.crownsA], ['a', 2, 1, 5]);
  assert.equal(store.getTournament(tid).status, 'finished');
  st = room._buildState(ctx(tid, mid, pa));
  assert.equal(st.phase, 'finished');
  assert.throws(() => run('ready', tid, mid, pa, { ready: true }), /tournamentMatchNotPlayable/);
});

test('Zufallsmodus: Start öffnet direkt die Draft-Lobby; verschwundene Lobby (Neustart) annulliert das Spiel', async () => {
  created = [];
  const { tid, mid } = await startedTournament({ modeSelection: 'random', modes: ['snake', 'bingo'], bestOf: { normal: 1, finals: 3 } });
  const { pa, pb } = sides(tid, mid);
  readyBoth(tid, mid, pa, pb);
  let st = room._buildState(ctx(tid, mid, pa));
  assert.equal(st.phase, 'drafting');
  assert.ok(['snake', 'bingo'].includes(st.games[0].mode));
  lobbies.delete(created[0].code); // Server-Neustart: Lobby weg
  st = room._buildState(ctx(tid, mid, pa));
  assert.equal(st.phase, 'lobby');
  assert.equal(st.games[0].status, 'void');
});

test('Draft-Lobby: nur die beiden Spieler (Twitch oder Geheimschlüssel) und der Veranstalter als Zuschauer', () => {
  const lobby = { tournament: { ownerId: '100', allowed: [
    { side: 'a', twitchId: '1', secret: null, name: 'Anna' },
    { side: 'b', twitchId: null, secret: 'geheim123', name: 'Ben' },
  ] } };
  assert.deepEqual(room.authorizeLobbyJoin(lobby, { twitchId: '1' }), { side: 'a', name: 'Anna' });
  assert.deepEqual(room.authorizeLobbyJoin(lobby, { secret: 'geheim123' }), { side: 'b', name: 'Ben' });
  assert.equal(room.authorizeLobbyJoin(lobby, { secret: 'falsch' }), null);
  assert.equal(room.authorizeLobbyJoin(lobby, { twitchId: '999' }), null);
  assert.equal(room.authorizeLobbyJoin(lobby, { twitchId: '100' }).side, null);
  assert.equal(room.authorizeLobbyJoin({}, { twitchId: '1' }), null);
});

test('Chat: gesäubert, gekürzt, gedrosselt, im Verlauf', async () => {
  const { tid, mid } = await startedTournament({ modes: ['snake', 'auction', 'bingo'], bestOf: { normal: 1, finals: 3 } });
  const { pa } = sides(tid, mid);
  assert.equal(run('chat', tid, mid, pa, { text: '   ' }), null);
  const msg = room._actions.chat(ctx(tid, mid, pa), { text: 'Hallo\n\tdu ' + 'x'.repeat(400) });
  assert.ok(msg.text.startsWith('Hallo du '));
  assert.equal(msg.text.length, 300);
  assert.equal(msg.role, 'a');
  assert.throws(() => room._actions.chat(ctx(tid, mid, pa), { text: 'zu schnell' }, { lastChatAt: Date.now() }), /tournamentChatTooFast/);
  const boss = room._actions.chat(ctx(tid, mid, BOSS), { text: 'Viel Glück!' });
  assert.equal(boss.role, 'owner');
  assert.equal(boss.authorName, 'veranstalter');
  assert.equal(room._buildState(ctx(tid, mid, pa)).chat.length, 2);
});
