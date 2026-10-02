// Match-Raum eines Turniers: Chat, Bereit, Start, Pick/Ban bzw. Zufallsmodus, automatische Draft-Lobby
// nur für die beiden Spieler, Decks nach dem Draft (Phase 3). Phase 4: Prüfschleife (runChecks) sucht den
// Freundschafts-/Clankampf beider Tags über die CR-API, prüft das Deck und schreibt die Serie fort;
// Erscheinen-Frist (kampfloser Sieg) und Kampf-Frist (→ Veranstalter). Plan: ../PLANUNG_TURNIER.md.
//
// Socket-Räume: tmatch:<turnier>:<match> (Raum-Zustand) und tournament:<turnier> (Seite neu laden).
// Wer darf in den Raum? Die beiden Spieler des Matches und der Veranstalter. Spieler erkennt der
// Server an der Twitch-Session des Sockets bzw. (Anmeldung ohne Login) am Geheimschlüssel, den der
// Client bei jeder Aktion mitschickt.
//
// "Bereit" lebt nur im Speicher (nach einem Neustart klickt man eben erneut); Spiele und Chat liegen
// in der Datenbank. Eine Draft-Lobby, die einen Neustart nicht überlebt hat, wird beim nächsten
// Zugriff annulliert — das Spiel beginnt dann neu.
const crypto = require('crypto');
const store = require('./store');
const lifecycle = require('./lifecycle');
const S = require('./structure');
const SR = require('./series');
const BM = require('./battleMatch');
const { cardIdByOfficialName } = require('../core/cards');

const CHAT_MAX = 300;
const CHAT_COOLDOWN_MS = 600;
const CHECK_INTERVAL_MS = 20 * 1000;   // Prüfschleife
const LOG_CACHE_MS = 15 * 1000;        // Battlelog je Tag höchstens so oft abfragen (kürzer als der Takt → jede Runde frisch)
let checkTimer = null;

// CR-API für die Kampfsuche — derselbe Schlüssel wie bei der Anmeldung (crToken.js)
const { crToken } = require('./crToken');
const logCache = new Map(); // tag → { at, battles }
let battleApi = {
  configured: () => require('../lib/crApi').isConfigured(crToken()),
  fetchLog: async (tag) => {
    const hit = logCache.get(tag);
    if (hit && Date.now() - hit.at < LOG_CACHE_MS) return hit.battles;
    const battles = await require('../lib/crApi').fetchBattlelog(tag, { safe: true, token: crToken() });
    logCache.set(tag, { at: Date.now(), battles });
    return battles;
  },
};

let ioRef = null;
const readyState = new Map(); // "<tid>:<mid>" → { a, b }

// Austauschbar für Tests (dort gibt es keine echte Lobby-Engine)
let lobbyApi = {
  create: (opts) => require('../routes/clashRoyaleRoutes').createTournamentLobby(opts),
  exists: (code) => require('../core/lobbies').lobbies.has(code),
  remove: (code) => {
    const { lobbies } = require('../core/lobbies');
    const l = lobbies.get(code);
    if (l && !l.started) lobbies.delete(code);
  },
};

const KNOWN_ERRORS = new Set([
  'tournamentNotFound', 'tournamentNotRunning', 'tournamentMatchNotFound', 'tournamentNoAccess',
  'tournamentMatchNotPlayable', 'tournamentNotReady', 'tournamentGameRunning', 'tournamentNoGame',
  'tournamentNotYourTurn', 'tournamentInvalidBan', 'tournamentOnlyStarter', 'tournamentInvalidResult',
  'tournamentPickBanNeedsThree', 'tournamentNoModes', 'noPermission', 'tournamentChatTooFast', 'tournamentPaused',
]);
const fail = (key) => { throw new Error(key); };
const roomName = (tid, mid) => `tmatch:${tid}:${mid}`;
const tournamentRoom = (tid) => `tournament:${tid}`;
const rkey = (tid, mid) => `${tid}:${mid}`;

const safeEqual = (a, b) => {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

/** Teilnehmer zu einer Identität (Twitch-Session oder Geheimschlüssel). */
function findParticipant(participants, { twitchId, secret }) {
  return participants.find(p =>
    (twitchId && p.twitchId && String(p.twitchId) === String(twitchId))
    || (secret && p.secret && safeEqual(p.secret, secret))
  ) || null;
}

/** Lädt Turnier, Match und die Rolle des Aufrufers. Wirft Fehlerschlüssel. */
function loadContext(tid, mid, identity) {
  const t = store.getTournament(tid);
  if (!t || t.status === 'deleted') fail('tournamentNotFound');
  if (t.status !== 'running' && t.status !== 'finished') fail('tournamentNotRunning');
  const matches = store.listMatches(t.id);
  const match = matches.find(m => m.id === mid);
  if (!match) fail('tournamentMatchNotFound');
  const participants = store.listParticipants(t.id);
  const me = findParticipant(participants, identity);
  const isOwner = !!identity.twitchId && String(identity.twitchId) === String(t.ownerId);
  const side = me && match.a === me.id ? 'a' : me && match.b === me.id ? 'b' : null;
  return { t, match, matches, participants, me, isOwner, side, canEnter: !!side || isOwner };
}

/** Spiele laden; eine Draft-Lobby, die es nicht mehr gibt (Neustart), annullieren. */
function loadGames(t, matchId) {
  const games = store.listGames(t.id, matchId);
  for (const g of games) {
    if (g.status === 'drafting' && g.lobbyCode && !lobbyApi.exists(g.lobbyCode)) {
      g.status = 'void';
      g.finishedAt = Date.now();
      store.saveGame(t.id, g);
    }
  }
  return games;
}

const publicParticipant = (p) => p && ({
  id: p.id, displayName: p.displayName, crTag: p.crTag, crName: p.crName,
  crLeague: p.crLeague, crTrophies: p.crTrophies, friendLink: p.friendLink || '', dropped: !!p.droppedAt,
});

/** Der vollständige Raum-Zustand — derselbe für alle im Raum (nur Spieler + Veranstalter). */
function buildState(ctx) {
  const { t, match } = ctx;
  const games = loadGames(t, match.id);
  const score = SR.seriesScore(games);
  const active = SR.activeGame(games);
  const ready = readyState.get(rkey(t.id, match.id)) || { a: false, b: false };
  const byId = new Map(ctx.participants.map(p => [p.id, p]));
  let phase = 'lobby';
  if (match.status !== 'pending') phase = 'finished';
  else if (active) phase = active.status === 'review' ? 'battle' : active.status; // banning | drafting | battle (+ Klärung)
  const firstBan = active ? SR.firstBanner(games.filter(g => g.gameNo !== active.gameNo)) : null;
  return {
    tournamentId: t.id,
    matchId: match.id,
    match: {
      id: match.id, stage: match.stage, group: match.group, round: match.round, bestOf: match.bestOf,
      status: match.status, winner: match.winner, scoreA: match.scoreA, scoreB: match.scoreB,
      playable: S.isPlayable(match),
    },
    players: { a: publicParticipant(byId.get(match.a)), b: publicParticipant(byId.get(match.b)) },
    presence: (() => {
      const meta = store.getMatchMeta(t.id, match.id);
      return { a: !!meta.presentAAt, b: !!meta.presentBAt, waitStart: meta.waitStart, forfeit: meta.forfeit };
    })(),
    showUpMinutes: t.settings.showUpMinutes,
    paused: !!t.settings.paused,
    battleMinutes: t.settings.battleMinutes,
    apiActive: battleApi.configured(),
    modeSelection: t.settings.modeSelection,
    deckCheck: !!t.settings.deckCheck,
    phase,
    ready,
    score,
    banTurn: active ? SR.banTurn(active, firstBan) : null,
    games: games.map(g => ({
      gameNo: g.gameNo, status: g.status, offer: g.offer, bans: g.bans, mode: g.mode,
      lobbyCode: g.status === 'drafting' ? g.lobbyCode : null, decks: g.decks, winner: g.winner,
      crownsA: g.crownsA, crownsB: g.crownsB, draftDoneAt: g.draftDoneAt, finishedAt: g.finishedAt,
      battle: g.battle, review: g.review, checkedAt: g.checkedAt,
      battleDeadline: g.draftDoneAt ? g.draftDoneAt + t.settings.battleMinutes * 60000 : null,
    })),
    chat: store.listChat(t.id, match.id),
  };
}

function broadcastRoom(tid, mid) {
  if (!ioRef) return;
  try {
    const ctx = loadContext(tid, mid, {});
    ioRef.to(roomName(tid, mid)).emit('tmatch:state', buildState(ctx));
  } catch { /* Turnier/Match weg — nichts zu verteilen */ }
}
function notifyTournament(tid) {
  ioRef?.to(tournamentRoom(tid)).emit('tournament:changed', { id: tid });
}

/** Draft-Lobby für das Spiel anlegen (Modus steht fest) → Status 'drafting'. */
function openDraftLobby(ctx, game) {
  const { t, match } = ctx;
  const byId = new Map(ctx.participants.map(p => [p.id, p]));
  const A = byId.get(match.a), B = byId.get(match.b);
  // Namen müssen in der Lobby eindeutig sein (Wiedereinstieg läuft dort über den Namen)
  const nameB = B.displayName === A.displayName ? `${B.displayName} (2)` : B.displayName;
  game.lobbyCode = lobbyApi.create({
    mode: game.mode,
    tournament: {
      id: t.id, matchId: match.id, gameNo: game.gameNo, name: t.settings.name, ownerId: t.ownerId,
      allowed: [
        { side: 'a', pid: A.id, twitchId: A.twitchId, secret: A.secret, name: A.displayName },
        { side: 'b', pid: B.id, twitchId: B.twitchId, secret: B.secret, name: nameB },
      ],
    },
  });
  game.status = 'drafting';
}

/** Spiel als entschieden speichern; entscheidet es die Serie, wird das Match fortgeschrieben. */
function finishGame(ctx, games, game, { winner, crownsA = 0, crownsB = 0, battle = null }) {
  Object.assign(game, {
    status: 'done', winner, finishedAt: Date.now(), review: null,
    crownsA: Math.max(0, Math.min(3, Math.round(Number(crownsA) || 0))),
    crownsB: Math.max(0, Math.min(3, Math.round(Number(crownsB) || 0))),
    ...(battle ? { battle } : {}),
  });
  store.saveGame(ctx.t.id, game);
  if (game.lobbyCode) lobbyApi.remove(game.lobbyCode);
  const score = SR.seriesScore(games);
  const seriesWinner = SR.seriesWinner(ctx.match.bestOf, score);
  if (!seriesWinner) return { matchDecided: false };
  lifecycle.reportResult(ctx.t, ctx.match.id, {
    winner: seriesWinner, scoreA: score.a, scoreB: score.b, crownsA: score.crownsA, crownsB: score.crownsB,
  });
  return { matchDecided: true };
}

/** Systemnachricht in den Raum-Chat (Kampf gefunden, kampfloser Sieg …). */
function systemChat(tid, mid, text) {
  const msg = store.addChat(tid, mid, { authorId: null, authorName: 'System', role: 'system', text });
  ioRef?.to(roomName(tid, mid)).emit('tmatch:chat', { matchId: mid, message: msg });
}

/** Spieler betritt den Raum: Anwesenheit merken; ist der Gegner noch nie da gewesen, startet die Erscheinen-Frist. */
function markPresent(ctx) {
  if (!ctx.side || !S.isPlayable(ctx.match)) return;
  const meta = store.getMatchMeta(ctx.t.id, ctx.match.id);
  const key = ctx.side === 'a' ? 'presentAAt' : 'presentBAt';
  if (meta[key]) return;
  meta[key] = Date.now();
  const other = ctx.side === 'a' ? meta.presentBAt : meta.presentAAt;
  meta.waitStart = other ? null : Date.now();
  store.saveMatchMeta(ctx.t.id, ctx.match.id, meta);
}

// ── Prüfschleife (Phase 4) ──────────────────────────────────────────────

/** Sucht für ein wartendes Spiel den Kampf und wertet ihn aus. Gibt true zurück, wenn sich etwas geändert hat. */
async function checkGame(ctx, games, game, now) {
  const byId = new Map(ctx.participants.map(p => [p.id, p]));
  const A = byId.get(ctx.match.a), B = byId.get(ctx.match.b);
  if (!A || !B || !game.draftDoneAt) return false;
  const searching = game.status === 'battle' || game.review?.reason === 'noBattle';
  if (!searching) return false;
  let found = null;
  if (battleApi.configured()) {
    const [logA, logB] = await Promise.all([battleApi.fetchLog(A.crTag), battleApi.fetchLog(B.crTag)]);
    const usedTimes = new Set(games.filter(g => g.gameNo !== game.gameNo && g.battle?.battleTime).map(g => g.battle.battleTime));
    found = BM.findSeriesBattle({ logA, logB, tagA: A.crTag, tagB: B.crTag, after: game.draftDoneAt, usedTimes });
  }
  game.checkedAt = now;
  if (found) {
    const verdict = BM.evaluateBattle(found, game.decks, { deckCheck: !!ctx.t.settings.deckCheck, resolveId: cardIdByOfficialName });
    const battle = { battleTime: found.battleTime, battleTimeMs: found.battleTimeMs, crownsA: found.crownsA, crownsB: found.crownsB,
      gameMode: found.gameMode, type: found.type, deck: verdict.deck };
    if (verdict.decided) {
      const res = finishGame(ctx, games, game, { winner: verdict.winner, crownsA: found.crownsA, crownsB: found.crownsB, battle });
      systemChat(ctx.t.id, ctx.match.id, `Kampf gefunden: ${A.displayName} ${found.crownsA} : ${found.crownsB} ${B.displayName} — Spiel ${game.gameNo} an ${verdict.winner === 'a' ? A.displayName : B.displayName}.`);
      if (res.matchDecided) notifyTournament(ctx.t.id);
      return true;
    }
    game.status = 'review';
    game.battle = battle;
    game.review = { reason: verdict.reason, at: now };
    store.saveGame(ctx.t.id, game);
    systemChat(ctx.t.id, ctx.match.id, verdict.reason === 'draw'
      ? `Kampf gefunden, aber unentschieden (${found.crownsA} : ${found.crownsB}) — der Veranstalter entscheidet.`
      : 'Kampf gefunden, aber das gespielte Deck weicht vom gedrafteten ab — der Veranstalter entscheidet.');
    return true;
  }
  const deadline = game.draftDoneAt + (ctx.t.settings.battleMinutes || 20) * 60000;
  if (game.status === 'battle' && now > deadline) {
    game.status = 'review';
    game.review = { reason: 'noBattle', at: now };
    store.saveGame(ctx.t.id, game);
    systemChat(ctx.t.id, ctx.match.id, 'Frist für den Kampf abgelaufen, kein Freundschaftskampf gefunden — der Veranstalter entscheidet (ein später gefundener Kampf zählt trotzdem).');
    return true;
  }
  store.saveGame(ctx.t.id, game); // checkedAt
  return false;
}

/** Erscheinen-Frist eines Matches prüfen (nur solange noch kein Spiel gestartet wurde). */
function checkShowUp(t, match, matches, participants, now) {
  if (!S.isPlayable(match)) return false;
  const games = store.listGames(t.id, match.id);
  if (games.some(g => g.status !== 'void')) return false;
  const meta = store.getMatchMeta(t.id, match.id);
  if (meta.forfeit || meta.waitStart == null) return false;
  if (t.settings.paused) {
    // Pausiert: Uhr anhalten (Startzeit mitschieben), kein kampfloser Sieg
    meta.waitStart = now;
    store.saveMatchMeta(t.id, match.id, meta);
    return false;
  }
  // Uhr anhalten, solange der Abwesende gerade ein Spiel in einem anderen Match spielt
  const absentPid = meta.presentAAt ? match.b : match.a;
  const busy = matches.some(m => m.id !== match.id && S.isPlayable(m) && (m.a === absentPid || m.b === absentPid)
    && SR.activeGame(store.listGames(t.id, m.id)));
  if (busy) {
    meta.waitStart = now;
    store.saveMatchMeta(t.id, match.id, meta);
    return false;
  }
  const winner = BM.showUpForfeit({ presentA: !!meta.presentAAt, presentB: !!meta.presentBAt, waitStart: meta.waitStart, now, showUpMs: (t.settings.showUpMinutes || 10) * 60000 });
  if (!winner) return false;
  meta.forfeit = winner;
  store.saveMatchMeta(t.id, match.id, meta);
  const need = Math.ceil(match.bestOf / 2);
  lifecycle.reportResult(t, match.id, { winner, scoreA: winner === 'a' ? need : 0, scoreB: winner === 'b' ? need : 0 });
  const byId = new Map(participants.map(p => [p.id, p]));
  const w = byId.get(winner === 'a' ? match.a : match.b), l = byId.get(winner === 'a' ? match.b : match.a);
  systemChat(t.id, match.id, `${l?.displayName} ist nicht rechtzeitig erschienen — kampfloser Sieg für ${w?.displayName}.`);
  return true;
}

/** Ein Durchlauf der Prüfschleife: Kampfsuche für wartende Spiele, Erscheinen-Fristen aller laufenden Turniere. */
async function runChecks(now = Date.now()) {
  const touched = new Set();
  for (const g of store.listWaitingGames()) {
    try {
      const ctx = loadContext(g.tournamentId, g.matchId, {});
      if (ctx.t.status !== 'running' || !S.isPlayable(ctx.match)) continue;
      const games = store.listGames(ctx.t.id, ctx.match.id);
      const game = games.find(x => x.gameNo === g.gameNo);
      if (game && await checkGame(ctx, games, game, now)) touched.add(rkey(ctx.t.id, ctx.match.id));
    } catch (e) {
      console.error('[Turnier] Kampfsuche fehlgeschlagen:', e.message);
    }
  }
  for (const t of store.listRunningTournaments()) {
    try {
      const matches = store.listMatches(t.id);
      const participants = store.listParticipants(t.id);
      for (const m of matches) {
        if (checkShowUp(store.getTournament(t.id), m, matches, participants, now)) {
          touched.add(rkey(t.id, m.id));
          notifyTournament(t.id);
        }
      }
    } catch (e) {
      console.error('[Turnier] Fristprüfung fehlgeschlagen:', e.message);
    }
  }
  for (const k of touched) { const [tid, mid] = k.split(':'); broadcastRoom(tid, mid); }
  return touched.size;
}

/**
 * Übersicht für den Veranstalter (Phase 5): alle offenen Matches mit Zustand — Klärungsfälle zuerst,
 * dann laufende Spiele (am längsten wartende oben), dann Matches im Raum/ohne Aktivität.
 */
function ownerOverview(t) {
  if (t.status !== 'running') return [];
  const matches = store.listMatches(t.id);
  const items = [];
  for (const m of matches) {
    if (!S.isPlayable(m)) continue;
    const games = loadGames(t, m.id);
    const active = SR.activeGame(games);
    const meta = store.getMatchMeta(t.id, m.id);
    const score = SR.seriesScore(games);
    items.push({
      matchId: m.id, a: m.a, b: m.b, bestOf: m.bestOf, scoreA: score.a, scoreB: score.b,
      phase: active ? active.status : 'lobby', // lobby | banning | drafting | battle | review
      gameNo: active?.gameNo || null,
      reviewReason: active?.review?.reason || null,
      since: active ? (active.status === 'battle' || active.status === 'review' ? active.draftDoneAt : active.createdAt) : meta.waitStart,
      presentA: !!meta.presentAAt, presentB: !!meta.presentBAt,
    });
  }
  const rank = { review: 0, battle: 1, drafting: 2, banning: 3, lobby: 4 };
  return items.sort((x, y) => rank[x.phase] - rank[y.phase] || (x.since || Infinity) - (y.since || Infinity));
}

// ── Aktionen (ohne Socket-Abhängigkeit — getestet in __tests__/matchRoom.test.js) ──

function requirePlayable(ctx) {
  if (!S.isPlayable(ctx.match)) fail('tournamentMatchNotPlayable');
}

const actions = {
  ready(ctx, { ready }) {
    if (!ctx.side) fail('tournamentNoAccess');
    requirePlayable(ctx);
    if (SR.activeGame(loadGames(ctx.t, ctx.match.id))) fail('tournamentGameRunning');
    const k = rkey(ctx.t.id, ctx.match.id);
    const cur = readyState.get(k) || { a: false, b: false };
    readyState.set(k, { ...cur, [ctx.side]: !!ready });
  },

  /** Spieler A (oder der Veranstalter) startet das nächste Spiel, wenn beide bereit sind. */
  start(ctx, _payload, rng = Math.random) {
    if (ctx.side !== 'a' && !ctx.isOwner) fail('tournamentOnlyStarter');
    requirePlayable(ctx);
    if (ctx.t.settings.paused) fail('tournamentPaused');
    const games = loadGames(ctx.t, ctx.match.id);
    if (SR.activeGame(games)) fail('tournamentGameRunning');
    const ready = readyState.get(rkey(ctx.t.id, ctx.match.id)) || {};
    if (!ready.a || !ready.b) fail('tournamentNotReady');
    const pool = ctx.t.settings.modes || [];
    const game = { matchId: ctx.match.id, gameNo: SR.nextGameNo(games), offer: [], bans: [], mode: null, createdAt: Date.now() };
    if (ctx.t.settings.modeSelection === 'pickban') {
      game.status = 'banning';
      game.offer = SR.drawOffer(pool, games, rng);
    } else {
      game.mode = SR.randomMode(pool, games, rng);
      openDraftLobby(ctx, game);
    }
    store.saveGame(ctx.t.id, game);
    readyState.delete(rkey(ctx.t.id, ctx.match.id));
  },

  ban(ctx, { mode }) {
    if (!ctx.side) fail('tournamentNoAccess');
    requirePlayable(ctx);
    const games = loadGames(ctx.t, ctx.match.id);
    const game = SR.activeGame(games);
    if (!game || game.status !== 'banning') fail('tournamentNoGame');
    const first = SR.firstBanner(games.filter(g => g.gameNo !== game.gameNo));
    const next = { ...game, ...SR.applyBan(game, first, ctx.side, String(mode)) };
    if (next.mode) openDraftLobby(ctx, next);
    store.saveGame(ctx.t.id, next);
  },

  chat(ctx, { text }, meta = {}) {
    if (!ctx.canEnter) fail('tournamentNoAccess');
    const clean = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
    if (!clean) return null;
    const now = Date.now();
    if (meta.lastChatAt && now - meta.lastChatAt < CHAT_COOLDOWN_MS) fail('tournamentChatTooFast');
    const role = ctx.side || 'owner';
    const authorName = ctx.side ? ctx.me.displayName : ctx.t.ownerLogin;
    return store.addChat(ctx.t.id, ctx.match.id, { authorId: ctx.me?.id || null, authorName, role, text: clean });
  },

  /** Veranstalter trägt das Ergebnis des laufenden Spiels ein; entscheidet das die Serie, wird das Match fortgeschrieben. */
  gameResult(ctx, { gameNo, winner, crownsA = 0, crownsB = 0 }) {
    if (!ctx.isOwner) fail('noPermission');
    requirePlayable(ctx);
    if (winner !== 'a' && winner !== 'b') fail('tournamentInvalidResult');
    const games = loadGames(ctx.t, ctx.match.id);
    const game = games.find(g => g.gameNo === Number(gameNo));
    if (!game || !['battle', 'drafting', 'review'].includes(game.status)) fail('tournamentNoGame');
    // Bei einem gefundenen Kampf (Klärung) die echten Kronen übernehmen, sonst die angegebenen
    const useBattle = game.battle && game.status === 'review';
    return finishGame(ctx, games, game, {
      winner,
      crownsA: useBattle ? game.battle.crownsA : crownsA,
      crownsB: useBattle ? game.battle.crownsB : crownsB,
    });
  },

  /** Veranstalter annulliert das laufende Spiel (falscher Modus, Verbindungsabbruch …) — es wird neu gespielt. */
  voidGame(ctx, { gameNo }) {
    if (!ctx.isOwner) fail('noPermission');
    const games = loadGames(ctx.t, ctx.match.id);
    const game = games.find(g => g.gameNo === Number(gameNo));
    if (!game || game.status === 'done' || game.status === 'void') fail('tournamentNoGame');
    game.status = 'void';
    game.finishedAt = Date.now();
    store.saveGame(ctx.t.id, game);
    if (game.lobbyCode) lobbyApi.remove(game.lobbyCode);
    readyState.delete(rkey(ctx.t.id, ctx.match.id));
  },
};

// ── Anbindung an die Draft-Lobby (aufgerufen aus clashRoyaleRoutes / streamerFeed) ──

/**
 * Darf dieser Socket in die Turnier-Lobby? → { side, name } für Spieler, { side: null, name } für den
 * Veranstalter (Zuschauer), sonst null.
 */
function authorizeLobbyJoin(lobby, { twitchId, secret }) {
  const tour = lobby.tournament;
  if (!tour) return null;
  const allowed = tour.allowed.find(a =>
    (twitchId && a.twitchId && String(a.twitchId) === String(twitchId))
    || (secret && a.secret && safeEqual(a.secret, secret)));
  if (allowed) return { side: allowed.side, name: allowed.name };
  if (twitchId && String(twitchId) === String(tour.ownerId)) return { side: null, name: 'Veranstalter' };
  return null;
}

/** Draft beendet: Decks am Spiel speichern, Raum auf "Kampf" stellen. */
function onDraftComplete(lobby) {
  const tour = lobby.tournament;
  if (!tour) return;
  try {
    const games = store.listGames(tour.id, tour.matchId);
    const game = games.find(g => g.gameNo === tour.gameNo);
    if (!game || game.status !== 'drafting') return;
    const deckOf = (side) => (lobby.players.find(p => p.tournamentSide === side)?.deck || [])
      .map(c => ({ id: c.id, name: c.name, rarity: c.rarity, isChampion: !!c.isChampion }));
    game.decks = { a: deckOf('a'), b: deckOf('b') };
    game.status = 'battle';
    game.draftDoneAt = Date.now();
    store.saveGame(tour.id, game);
    broadcastRoom(tour.id, tour.matchId);
  } catch (e) {
    console.error('[Turnier] Draft-Ende konnte nicht gespeichert werden:', e.message);
  }
}

// ── Socket ──────────────────────────────────────────────────────────────

function registerTournamentSocket(socket, io, { twitchId = null } = {}) {
  ioRef = io;
  if (!checkTimer) {
    checkTimer = setInterval(() => { runChecks().catch(e => console.error('[Turnier] Prüfschleife:', e.message)); }, CHECK_INTERVAL_MS);
    checkTimer.unref?.();
  }
  const lastChat = { at: 0 };

  const handle = (event, fn) => socket.on(event, (payload, ack) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    const reply = typeof ack === 'function' ? ack : null;
    try {
      const result = fn(p);
      reply?.({ ok: true, ...(result || {}) });
    } catch (e) {
      const error = KNOWN_ERRORS.has(e.message) ? e.message : 'tournamentError';
      if (error === 'tournamentError') console.error(`[Turnier] ${event}:`, e);
      reply ? reply({ error }) : socket.emit('tmatch:error', { error });
    }
  });
  const ctxFor = (p) => loadContext(String(p.tournamentId || ''), String(p.matchId || ''), { twitchId, secret: p.secret ? String(p.secret) : '' });
  const act = (name, p, extra) => {
    const ctx = ctxFor(p);
    const result = actions[name](ctx, p, extra);
    broadcastRoom(ctx.t.id, ctx.match.id);
    return { ctx, result };
  };

  handle('tournament:watch', (p) => { socket.join(tournamentRoom(String(p.tournamentId || ''))); });
  handle('tournament:unwatch', (p) => { socket.leave(tournamentRoom(String(p.tournamentId || ''))); });

  handle('tmatch:join', (p) => {
    const ctx = ctxFor(p);
    if (!ctx.canEnter) fail('tournamentNoAccess');
    socket.join(roomName(ctx.t.id, ctx.match.id));
    const wasPresent = store.getMatchMeta(ctx.t.id, ctx.match.id);
    markPresent(ctx);
    // Erstes Erscheinen ändert die Anwesenheit für beide → allen schicken, sonst nur diesem Socket
    if (ctx.side && !(ctx.side === 'a' ? wasPresent.presentAAt : wasPresent.presentBAt)) broadcastRoom(ctx.t.id, ctx.match.id);
    else socket.emit('tmatch:state', buildState(ctx));
    return { side: ctx.side, isOwner: ctx.isOwner };
  });
  handle('tmatch:leave', (p) => { socket.leave(roomName(String(p.tournamentId || ''), String(p.matchId || ''))); });
  handle('tmatch:ready', (p) => { act('ready', p); });
  handle('tmatch:start', (p) => { act('start', p); });
  handle('tmatch:ban', (p) => { act('ban', p); });
  handle('tmatch:chat', (p) => {
    const ctx = ctxFor(p);
    const msg = actions.chat(ctx, p, { lastChatAt: lastChat.at });
    if (!msg) return;
    lastChat.at = Date.now();
    io.to(roomName(ctx.t.id, ctx.match.id)).emit('tmatch:chat', { matchId: ctx.match.id, message: msg });
  });
  handle('tmatch:gameResult', (p) => {
    const { ctx, result } = act('gameResult', p);
    if (result.matchDecided) notifyTournament(ctx.t.id);
    return result;
  });
  handle('tmatch:voidGame', (p) => { act('voidGame', p); });
}

module.exports = {
  registerTournamentSocket, authorizeLobbyJoin, onDraftComplete, broadcastRoom, notifyTournament,
  // Tests
  runChecks, ownerOverview,
  _actions: actions, _loadContext: loadContext, _buildState: buildState, _markPresent: markPresent,
  _setLobbyApi: (api) => { lobbyApi = api; }, _resetReady: () => readyState.clear(),
  _setBattleApi: (api) => { battleApi = api; },
};
