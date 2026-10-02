// Phase 4: Prüfschleife — Kampfsuche über (gefälschte) Battlelogs, Deck-Prüfung, Kampf-Frist,
// Erscheinen-Frist mit kampflosem Sieg und Pause, solange der Abwesende anderswo spielt.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, store, TAGS } = require('./_harness');
const room = require('../matchRoom');
const { ALL_CARDS } = require('../../core/cards');

const call = setup(test);
const OWNER = '100:veranstalter';
const BOSS = { twitchId: '100' };

const lobbies = new Map();
let created = [];
room._setLobbyApi({
  create: (opts) => { const code = `L${created.length + 1}`; created.push({ code, ...opts }); lobbies.set(code, opts); return code; },
  exists: (code) => lobbies.has(code),
  remove: (code) => lobbies.delete(code),
});
const logs = {};
room._setBattleApi({ configured: () => true, fetchLog: async (tag) => logs[tag] || [] });

const DECK_A = ALL_CARDS.filter(c => !c.isChampion).slice(0, 8);
const DECK_B = ALL_CARDS.filter(c => !c.isChampion).slice(8, 16);
const apiCards = (deck) => [...deck].reverse().map(c => ({ name: c.name, level: 11, evolutionLevel: 1 })); // andere Reihenfolge + Evo

async function tournament(settings, players) {
  const { data } = await call('POST', '/', { user: OWNER, body: { settings: { name: 'API', modeSelection: 'random', modes: ['snake', 'bingo'], ...settings } } });
  for (let i = 0; i < players; i++) await call('POST', `/${data.id}/join`, { user: `${i + 1}:s${i + 1}`, body: { crTag: '#' + TAGS[i] } });
  await call('POST', `/${data.id}/start`, { user: OWNER });
  return data.id;
}
const ctx = (tid, mid, who) => room._loadContext(tid, mid, who);
const tagOf = (tid, pid) => store.listParticipants(tid).find(p => p.id === pid).crTag;
const idOf = (tid, pid) => ({ twitchId: store.listParticipants(tid).find(p => p.id === pid).twitchId });

/** Startet ein Spiel im Match und beendet den Draft mit DECK_A/DECK_B → Phase "Kampf". */
function playDraft(tid, mid) {
  const m = store.listMatches(tid).find(x => x.id === mid);
  const A = idOf(tid, m.a), B = idOf(tid, m.b);
  room._actions.ready(ctx(tid, mid, A), { ready: true });
  room._actions.ready(ctx(tid, mid, B), { ready: true });
  room._actions.start(ctx(tid, mid, A), {});
  const lobby = created[created.length - 1];
  room.onDraftComplete({ tournament: lobby.tournament, players: [{ tournamentSide: 'a', deck: DECK_A }, { tournamentSide: 'b', deck: DECK_B }] });
  return store.listGames(tid, mid).find(g => g.gameNo === lobby.tournament.gameNo);
}
const friendly = (from, vs, at, crownsFor, crownsAgainst, cards, oppCards, type = 'friendly') => ({
  type, teamSize: 1, gameMode: 'Friendly', battleTime: `bt${at}`, battleTimeMs: at, opponentTag: vs,
  crownsFor, crownsAgainst, cards: apiCards(cards), opponentCards: apiCards(oppCards),
});

test('Bo3 komplett über die API: Sieg, falsches Deck → Klärung, Kampf-Frist → Klärung, später gefundener Clankampf', async () => {
  const tid = await tournament({ maxPlayers: 2, bestOf: { normal: 1, finals: 3 }, deckCheck: true, battleMinutes: 20 }, 2);
  const mid = store.listMatches(tid)[0].id;
  const m = store.listMatches(tid)[0];
  const tA = tagOf(tid, m.a), tB = tagOf(tid, m.b);

  // Spiel 1: noch kein Kampf → bleibt offen; dann Freundschaftskampf A 2:1 mit richtigen Decks
  let g = playDraft(tid, mid);
  await room.runChecks();
  assert.equal(store.listGames(tid, mid)[0].status, 'battle');
  assert.ok(store.listGames(tid, mid)[0].checkedAt);
  logs[tA] = [friendly(tB, tB, g.draftDoneAt - 5000, 3, 0, DECK_A, DECK_B), // vor dem Draft → zählt nicht
    friendly(tB, tB, g.draftDoneAt + 60000, 2, 1, DECK_A, DECK_B)];
  await room.runChecks();
  g = store.listGames(tid, mid)[0];
  assert.equal(g.status, 'done');
  assert.deepEqual([g.winner, g.crownsA, g.crownsB], ['a', 2, 1]);
  assert.equal(g.battle.deck.a.ok, true, 'Reihenfolge/Evo egal');

  // Spiel 2: B gewinnt mit falschem Deck → Klärung; Veranstalter gibt den Sieg trotzdem B
  g = playDraft(tid, mid);
  const wrongB = [...DECK_B.slice(0, 7), ALL_CARDS[40]];
  logs[tA].push(friendly(tB, tB, g.draftDoneAt + 30000, 0, 1, DECK_A, wrongB));
  await room.runChecks();
  g = store.listGames(tid, mid).find(x => x.gameNo === 2);
  assert.equal(g.status, 'review');
  assert.equal(g.review.reason, 'deckMismatch');
  assert.deepEqual(g.battle.deck.b.extra, [ALL_CARDS[40].name]);
  room._actions.gameResult(ctx(tid, mid, BOSS), { gameNo: 2, winner: 'b' });
  g = store.listGames(tid, mid).find(x => x.gameNo === 2);
  assert.deepEqual([g.status, g.winner, g.crownsA, g.crownsB], ['done', 'b', 0, 1], 'Kronen aus dem gefundenen Kampf');

  // Spiel 3: kein Kampf bis zur Frist → Klärung (noBattle); später taucht ein Clankampf in Bs Liste auf → zählt
  g = playDraft(tid, mid);
  await room.runChecks(g.draftDoneAt + 21 * 60000);
  assert.equal(store.listGames(tid, mid).find(x => x.gameNo === 3).review.reason, 'noBattle');
  logs[tB] = [friendly(tA, tA, g.draftDoneAt + 22 * 60000, 3, 1, DECK_B, DECK_A, 'clanMate')];
  await room.runChecks(g.draftDoneAt + 23 * 60000);
  g = store.listGames(tid, mid).find(x => x.gameNo === 3);
  assert.deepEqual([g.status, g.winner, g.crownsA, g.crownsB], ['done', 'b', 1, 3]);

  const match = store.listMatches(tid)[0];
  assert.deepEqual([match.status, match.winner, match.scoreA, match.scoreB], ['done', 'b', 1, 2]);
  assert.equal(store.getTournament(tid).status, 'finished');
  const chat = store.listChat(tid, mid).filter(c => c.role === 'system');
  assert.ok(chat.length >= 4, 'Systemnachrichten im Chat');
});

test('Unentschieden geht an den Veranstalter', async () => {
  const tid = await tournament({ maxPlayers: 2, bestOf: { normal: 1, finals: 3 } }, 2);
  const m = store.listMatches(tid)[0];
  const g = playDraft(tid, m.id);
  logs[tagOf(tid, m.a)] = [friendly(null, tagOf(tid, m.b), g.draftDoneAt + 1000, 1, 1, DECK_A, DECK_B)];
  await room.runChecks();
  assert.equal(store.listGames(tid, m.id)[0].review.reason, 'draw');
});

test('Erscheinen-Frist: wer allein im Raum wartet, gewinnt nach Ablauf kampflos', async () => {
  const tid = await tournament({ maxPlayers: 2, showUpMinutes: 5, bestOf: { normal: 1, finals: 3 } }, 2);
  const m = store.listMatches(tid)[0];
  room._markPresent(ctx(tid, m.id, idOf(tid, m.b)));
  const meta = store.getMatchMeta(tid, m.id);
  assert.ok(meta.presentBAt && meta.waitStart);
  await room.runChecks(meta.waitStart + 4 * 60000);
  assert.equal(store.listMatches(tid)[0].status, 'pending');
  await room.runChecks(meta.waitStart + 6 * 60000);
  const done = store.listMatches(tid)[0];
  assert.deepEqual([done.status, done.winner, done.scoreA, done.scoreB], ['done', 'b', 0, 2]);
  assert.equal(store.getMatchMeta(tid, m.id).forfeit, 'b');
});

test('Erscheinen-Frist steht still, solange der Abwesende in einem anderen Match spielt; ohne Anwesende kein Freilos', async () => {
  const tid = await tournament({ maxPlayers: 3, showUpMinutes: 5, groupStage: { enabled: true, groupSize: 3, advancePerGroup: 2 }, bestOf: { normal: 1, finals: 3 } }, 3);
  const matches = store.listMatches(tid);
  // Match X: P wartet allein; P's Gegner Q spielt gerade Match Y gegen R
  const [x] = matches;
  const absent = x.b;
  const y = matches.find(mm => mm.id !== x.id && (mm.a === absent || mm.b === absent));
  room._markPresent(ctx(tid, x.id, idOf(tid, x.a)));
  playDraft(tid, y.id); // Q hat ein laufendes Spiel (Kampf-Phase)
  const start = store.getMatchMeta(tid, x.id).waitStart;
  await room.runChecks(start + 10 * 60000);
  assert.equal(store.listMatches(tid).find(mm => mm.id === x.id).status, 'pending', 'pausiert');
  assert.ok(store.getMatchMeta(tid, x.id).waitStart >= start + 10 * 60000, 'Uhr neu gestartet');
  // Drittes Match: keiner war da → kein kampfloser Sieg
  const z = matches.find(mm => mm.id !== x.id && mm.id !== y.id);
  await room.runChecks(Date.now() + 99 * 60000);
  assert.equal(store.listMatches(tid).find(mm => mm.id === z.id).status, 'pending');
});

test('Prüfschleife läuft nie doppelt: ein zweiter Aufruf während eines laufenden kehrt sofort zurück', async () => {
  const tid = await tournament({ maxPlayers: 2, bestOf: { normal: 1, finals: 3 } }, 2);
  playDraft(tid, store.listMatches(tid)[0].id); // ein Spiel wartet auf den Kampf
  let calls = 0;
  room._setBattleApi({ configured: () => true, fetchLog: async () => { calls++; await new Promise(r => setTimeout(r, 50)); return []; } });
  const [first, second] = await Promise.all([room.runChecks(), room.runChecks()]);
  assert.equal(second, 0);
  assert.ok(calls > 0 && first >= 0);
  room._setBattleApi({ configured: () => true, fetchLog: async (tag) => logs[tag] || [] });
});
