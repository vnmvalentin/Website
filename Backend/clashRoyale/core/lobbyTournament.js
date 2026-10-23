// Lobby-Turnier: ein kleines Turnier mit den Leuten, die gerade in einer normalen Lobby sind.
//
// Anders als das große Turnier (tournament/, eigene Seite, Anmeldung, Sieger per CR-API) lebt
// alles hier im Lobby-Objekt (lobby.ltour) — kein Speicher, keine Anmeldung, und den Sieger
// eines Spiels klickt der Host an. Die reine Turnierlogik (jeder gegen jeden, K.-o., Double
// Elimination, Tabellen, Fortschreiben) kommt unverändert aus tournament/structure.js.
//
// Zwei Draft-Varianten (Einstellung `draft`):
//   'shared'   Zu Beginn JEDER Runde draften alle Spieler dieser Runde gemeinsam ein neues Deck
//              (Ausgeschiedene/Freilose schauen zu); die Runde wird mit diesen Decks gespielt.
//   'perMatch' Jede Begegnung bekommt einen eigenen 1-gegen-1-Draft in derselben Lobby — alle
//              anderen schauen dabei zu (werden für die Dauer des Drafts zu Zuschauern).
//
// Ablauf in Runden: "Turnier starten" lost nur aus (Phase 'drawn', Baum sichtbar), erst
// begin() startet Runde 1. Gespielt wird immer nur in der aktuellen Runde (tour.round); sind
// alle ihre Begegnungen entschieden, startet der Host mit advanceRound() die nächste.
// Runde = Spieltag bei Jeder-gegen-jeden, im Baum die Abhängigkeitstiefe (computeWaves).
//
// Teilnehmer bekommen beim Start eine eigene, stabile ID (player.ltId): socket-IDs wechseln bei
// jedem Reconnect, und wer die Lobby verlässt, soll trotzdem im Baum stehen bleiben.

const { nanoid } = require('nanoid');
const S = require('../tournament/structure');

const FORMATS = ['single', 'double', 'roundrobin'];
const BEST_OF = [1, 3, 5];
const ROUNDS = [1, 2];
const DRAFTS = ['perMatch', 'shared'];

const DEFAULT_SETTINGS = { format: 'single', rounds: 1, bestOf: 1, finalsBestOf: 3, draft: 'perMatch' };

function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
  return {
    format: pick(input.format, FORMATS, base.format),
    rounds: pick(Number(input.rounds), ROUNDS, base.rounds),
    bestOf: pick(Number(input.bestOf), BEST_OF, base.bestOf),
    finalsBestOf: pick(Number(input.finalsBestOf), BEST_OF, base.finalsBestOf),
    draft: pick(input.draft, DRAFTS, base.draft),
  };
}

/** Frischer Zustand (eingeschaltet, noch nicht gestartet). */
function freshTour(settings = DEFAULT_SETTINGS) {
  return {
    enabled: true,
    settings: sanitizeSettings(settings),
    phase: 'setup',            // setup | drawn (ausgelost) | running | finished
    draftingRound: null,       // shared: Runde, deren gemeinsamer Draft gerade läuft
    round: 0,                  // aktuelle Runde (Welle), 0 = noch nicht begonnen
    waves: {},                 // matchId → Runde
    participants: [],          // [{ id, name, color, avatar, avatarUrl, deck }]
    drawOrder: [],
    matches: [],
    games: {},                 // matchId → ['a','b',…] gewertete Spiele der Serie in Reihenfolge (Bo3/Bo5)
    currentMatchId: null,      // perMatch: Begegnung, deren Draft gerade läuft/lief
    matchDecks: {},            // matchId → { a: deck, b: deck } (beide Draft-Varianten)
    savedSpectators: null,     // Zuschauerstatus vor einem Draft (playerId → bool)
  };
}

const activeTour = (lobby) => (lobby?.ltour?.enabled && !lobby.tournament ? lobby.ltour : null);

// ── Teilnehmer ↔ Lobby-Spieler ───────────────────────────────────────────────

const playerOf = (lobby, pid) => lobby.players.find(p => p.ltId === pid && !p.left) || null;

/** Wer beim Start mitspielt: aktive Spieler (keine Zuschauer, kein Admin-Beobachter). */
const eligiblePlayers = (lobby) => lobby.players.filter(p => !p.isSpectator && !p.isAdmin && !p.left);

// ── Struktur ─────────────────────────────────────────────────────────────────

/** Jeder gegen jeden, optional mit Rückrunde (Seiten getauscht). */
function roundRobinMatches(ids, bestOf, rounds) {
  const first = S.buildGroupMatches([ids], bestOf);
  if (rounds < 2) return first;
  const legs = Math.max(0, ...first.map(m => m.round));
  return first.concat(first.map(m => ({
    ...m, id: `g0-${m.round + legs}-${m.slot}`, round: m.round + legs, a: m.b, b: m.a,
  })));
}

function buildMatches(ids, settings) {
  if (settings.format === 'roundrobin') return roundRobinMatches(ids, settings.bestOf, settings.rounds);
  return S.buildBracket(ids, {
    double: settings.format === 'double',
    bestOfNormal: settings.bestOf,
    bestOfFinals: settings.finalsBestOf,
  });
}

/**
 * Runde jeder Begegnung. Jeder gegen jeden: der Spieltag. Baum: 1 + späteste Runde der
 * Begegnungen, aus denen Sieger/Verlierer hier ankommen — so landen z.B. im Double Elimination
 * die Lower-Runden automatisch zwischen den passenden Upper-Runden. Der Bracket-Reset (gf2)
 * hängt am Grand Final, auch wenn dort kein winTo hinzeigt.
 */
function computeWaves(matches, format) {
  const waves = {};
  if (format === 'roundrobin') {
    matches.forEach(m => { waves[m.id] = m.round; });
    return waves;
  }
  const feeders = new Map();
  for (const m of matches) {
    for (const to of [m.winTo, m.loseTo]) {
      if (!to) continue;
      if (!feeders.has(to)) feeders.set(to, []);
      feeders.get(to).push(m.id);
    }
  }
  const hasGf1 = matches.some(m => m.id === 'gf1');
  const waveOf = (id) => {
    if (waves[id]) return waves[id];
    const from = id === 'gf2' && hasGf1 ? ['gf1'] : (feeders.get(id) || []);
    waves[id] = from.length ? 1 + Math.max(...from.map(waveOf)) : 1;
    return waves[id];
  };
  matches.forEach(m => waveOf(m.id));
  return waves;
}

const inRound = (tour, w) => tour.matches.filter(m => tour.waves[m.id] === w);
/** Runde mit mindestens einer echten Begegnung (nicht nur Freilose/übersprungene)? */
const isRealRound = (tour, w) => inRound(tour, w).some(m => m.status !== 'bye' && m.status !== 'skipped');
const roundNumbers = (tour) => [...new Set(Object.values(tour.waves))].sort((a, b) => a - b);
const nextRealRound = (tour, after) => roundNumbers(tour).find(w => w > after && isRealRound(tour, w)) || null;
const roundDone = (tour) => tour.round > 0 && inRound(tour, tour.round).every(m => m.status !== 'pending');
const inCurrentRound = (tour, m) => tour.waves[m.id] === tour.round;

function standingsOf(tour) {
  if (tour.settings.format !== 'roundrobin') return null;
  return S.computeStandings(tour.participants.map(p => p.id), tour.matches, tour.drawOrder);
}

/** Siegerpodest oder null, solange noch offen. */
function podiumOf(tour) {
  if (tour.settings.format === 'roundrobin') {
    if (!S.allDone(tour.matches)) return null;
    const table = standingsOf(tour);
    return { first: table[0]?.id || null, second: table[1]?.id || null, third: table[2] ? [table[2].id] : [] };
  }
  return S.podiumOf(tour.matches);
}

function checkFinished(tour) {
  if (podiumOf(tour)?.first) tour.phase = 'finished';
}

// ── Start ────────────────────────────────────────────────────────────────────

/**
 * Turnier starten: Teilnehmer festschreiben und auslosen. Liefert einen Fehlerschlüssel oder
 * null. Beim gemeinsamen Draft startet der Aufrufer danach das Minigame für alle.
 */
function start(lobby) {
  const tour = activeTour(lobby);
  if (!tour || tour.phase !== 'setup') return 'noPermission';
  if ((lobby.partyMode || 'solo') !== 'solo') return 'ltourSoloOnly';
  const players = eligiblePlayers(lobby);
  if (players.length < 2) return 'needTwoPlayers';
  for (const p of players) p.ltId = p.ltId || nanoid(8);
  tour.participants = players.map(p => ({
    id: p.ltId, name: p.name, color: p.color, avatar: p.avatar || 'knight', avatarUrl: p.avatarUrl || null, deck: [],
  }));
  tour.drawOrder = S.shuffle(tour.participants.map(p => p.id));
  tour.matches = buildMatches(tour.drawOrder, tour.settings);
  tour.waves = computeWaves(tour.matches, tour.settings.format);
  tour.round = 0;
  tour.games = {};
  tour.matchDecks = {};
  tour.currentMatchId = null;
  // Erst nur ausgelost — der Host sieht den Baum und startet dann selbst (begin)
  tour.phase = 'drawn';
  return null;
}

/**
 * Ausgelostes Turnier beginnen: Runde 1 läuft. Liefert { error } oder { startDraft } — beim
 * Draft pro Runde ('shared') startet der Aufrufer danach den Runden-Draft (prepareRoundDraft).
 */
function begin(lobby) {
  const tour = activeTour(lobby);
  if (!tour || tour.phase !== 'drawn') return { error: 'noPermission' };
  tour.phase = 'running';
  tour.round = nextRealRound(tour, 0);
  return { startDraft: tour.settings.draft === 'shared' };
}

/**
 * Nächste Runde, sobald alle Begegnungen der aktuellen entschieden sind. Liefert { error } oder
 * { startDraft } wie begin(); ist das Turnier damit zu Ende, startDraft = false.
 */
function advanceRound(lobby) {
  const tour = activeTour(lobby);
  if (!tour || tour.phase !== 'running') return { error: 'noPermission' };
  if (!roundDone(tour)) return { error: 'ltourRoundOpen' };
  const next = nextRealRound(tour, tour.round);
  if (!next) { checkFinished(tour); return { startDraft: false }; }
  tour.round = next;
  tour.currentMatchId = null;
  return { startDraft: tour.settings.draft === 'shared' };
}

/**
 * Gemeinsamer Draft der laufenden Runde: alle Spieler, die in dieser Runde eine Begegnung haben,
 * draften; alle anderen werden Zuschauer. Fehlerschlüssel oder null; das Minigame startet der Aufrufer.
 */
function prepareRoundDraft(lobby) {
  const tour = activeTour(lobby);
  if (!tour || tour.phase !== 'running' || tour.settings.draft !== 'shared') return 'noPermission';
  const matches = inRound(tour, tour.round).filter(m => S.isPlayable(m));
  if (!matches.length || matches.every(m => tour.matchDecks[m.id])) return 'ltourMatchNotPlayable';
  const ids = new Set(matches.flatMap(m => [m.a, m.b]));
  const players = [...ids].map(id => playerOf(lobby, id));
  if (players.some(p => !p || p.disconnected)) return 'ltourPlayerMissing';
  tour.savedSpectators = Object.fromEntries(lobby.players.map(p => [p.id, !!p.isSpectator]));
  for (const p of lobby.players) p.isSpectator = !players.includes(p);
  tour.draftingRound = tour.round;
  return null;
}

/** Turnier abbrechen / nach dem Ende neu aufsetzen — Einstellungen bleiben. */
function reset(lobby) {
  const tour = lobby.ltour;
  if (!tour) return;
  restoreSpectators(lobby);
  lobby.ltour = freshTour(tour.settings);
}

// ── Eigener Draft je Begegnung ───────────────────────────────────────────────

/**
 * Begegnung für den Draft vorbereiten: alle außer den beiden werden Zuschauer. Liefert einen
 * Fehlerschlüssel oder null; das Minigame startet danach der Aufrufer.
 */
function prepareMatchDraft(lobby, matchId) {
  const tour = activeTour(lobby);
  if (!tour || tour.phase !== 'running' || tour.settings.draft !== 'perMatch') return 'noPermission';
  const m = tour.matches.find(x => x.id === matchId);
  if (!m || !S.isPlayable(m) || !inCurrentRound(tour, m)) return 'ltourMatchNotPlayable';
  const A = playerOf(lobby, m.a), B = playerOf(lobby, m.b);
  if (!A || !B || A.disconnected || B.disconnected) return 'ltourPlayerMissing';
  tour.savedSpectators = Object.fromEntries(lobby.players.map(p => [p.id, !!p.isSpectator]));
  for (const p of lobby.players) p.isSpectator = !(p === A || p === B);
  tour.currentMatchId = matchId;
  return null;
}

/** Zuschauerstatus von vor dem Begegnungs-Draft zurückholen. */
function restoreSpectators(lobby) {
  const tour = lobby.ltour;
  if (!tour?.savedSpectators) return;
  for (const p of lobby.players) {
    if (p.id in tour.savedSpectators) p.isSpectator = tour.savedSpectators[p.id];
  }
  tour.savedSpectators = null;
}

/** Reconnect: gespeicherten Zuschauerstatus auf die neue socket-ID umhängen. */
function remapPlayerId(lobby, oldId, newId) {
  const saved = lobby?.ltour?.savedSpectators;
  if (saved && oldId in saved) { saved[newId] = saved[oldId]; delete saved[oldId]; }
}

/** Ein Draft ist fertig (streamerFeed.notifyDraftComplete) — Decks übernehmen. */
function onDraftComplete(lobby) {
  const tour = activeTour(lobby);
  if (!tour) return;
  const deckOf = (pid) => [...(playerOf(lobby, pid)?.deck || [])];
  if (tour.phase === 'running' && tour.draftingRound) {
    // Runden-Draft: jede Begegnung der Runde bekommt die frisch gedrafteten Decks ihrer Spieler
    for (const m of inRound(tour, tour.draftingRound)) {
      if (S.isPlayable(m)) tour.matchDecks[m.id] = { a: deckOf(m.a), b: deckOf(m.b) };
    }
    tour.draftingRound = null;
    restoreSpectators(lobby);
    return;
  }
  if (tour.phase === 'running' && tour.currentMatchId) {
    const m = tour.matches.find(x => x.id === tour.currentMatchId);
    if (m) tour.matchDecks[m.id] = { a: deckOf(m.a), b: deckOf(m.b) };
    restoreSpectators(lobby);
  }
}

/** Host bricht eine laufende Runde ab (clash:restartLobby mitten im Spiel). */
function onGameCancelled(lobby) {
  const tour = activeTour(lobby);
  if (!tour) return;
  // Abgebrochener Runden-Draft: Runde bleibt, der Host kann den Draft neu starten
  tour.draftingRound = null;
  if (tour.currentMatchId && !tour.matchDecks[tour.currentMatchId]) tour.currentMatchId = null;
  restoreSpectators(lobby);
}

// ── Ergebnisse (Host klickt) ─────────────────────────────────────────────────

const scoreOf = (seq = []) => ({
  scoreA: seq.filter(x => x === 'a').length,
  scoreB: seq.filter(x => x === 'b').length,
});

/** Ein Spiel der Serie für Seite a/b werten. Bei erreichter Siegzahl wird das Match entschieden. */
function addGameWin(lobby, matchId, side) {
  const tour = activeTour(lobby);
  if (!tour || tour.phase !== 'running' || (side !== 'a' && side !== 'b')) return 'noPermission';
  const m = tour.matches.find(x => x.id === matchId);
  if (!m || !S.isPlayable(m) || !inCurrentRound(tour, m)) return 'ltourMatchNotPlayable';
  const seq = [...(tour.games[matchId] || []), side];
  const { scoreA, scoreB } = scoreOf(seq);
  const need = Math.ceil(m.bestOf / 2);
  if (scoreA >= need || scoreB >= need) {
    tour.matches = S.applyResult(tour.matches, matchId, { winner: scoreA >= need ? 'a' : 'b', scoreA, scoreB });
    if (tour.currentMatchId === matchId) tour.currentMatchId = null;
    checkFinished(tour);
  }
  tour.games[matchId] = seq;
  return null;
}

/** Letzte Eingabe einer Begegnung zurücknehmen — öffnet ein entschiedenes Match wieder. */
function undo(lobby, matchId) {
  const tour = activeTour(lobby);
  if (!tour || (tour.phase !== 'running' && tour.phase !== 'finished')) return 'noPermission';
  const m = tour.matches.find(x => x.id === matchId);
  const seq = tour.games[matchId] || [];
  // Zurücknehmen nur in der laufenden Runde — frühere Runden haben schon Folgen im Baum
  if (!m || !seq.length || !inCurrentRound(tour, m)) return 'ltourMatchNotPlayable';
  if (m.status === 'done') {
    try {
      tour.matches = S.resetMatch(tour.matches, matchId);
    } catch (e) {
      return e.message === 'tournamentResetBlocked' ? 'ltourResetBlocked' : 'ltourMatchNotPlayable';
    }
    tour.phase = 'running';
  }
  tour.games[matchId] = seq.slice(0, -1);
  return null;
}

// ── Für den Client ───────────────────────────────────────────────────────────

function publicView(lobby) {
  const tour = lobby?.ltour;
  if (!tour?.enabled || lobby.tournament) return null;
  const onlineIds = new Set(lobby.players.filter(p => p.ltId && !p.left && !p.disconnected).map(p => p.ltId));
  const live = (m) => {
    if (m.status !== 'pending') return null;
    const seq = tour.games[m.id] || [];
    const score = scoreOf(seq);
    if (tour.draftingRound && tour.waves[m.id] === tour.draftingRound) {
      return { ...score, phase: lobby.started ? 'drafting' : 'ready' };
    }
    if (tour.currentMatchId === m.id) {
      return { ...score, phase: tour.matchDecks[m.id] ? 'battle' : (lobby.started ? 'drafting' : 'ready') };
    }
    return seq.length ? { ...score, phase: 'battle' } : null;
  };
  return {
    settings: tour.settings,
    phase: tour.phase,
    round: tour.round || 0,
    draftingRound: tour.draftingRound || null,
    roundDone: roundDone(tour),
    // Gibt es nach der aktuellen Runde noch eine? (Knopf "Nächste Runde" vs. Turnierende)
    hasNextRound: !!nextRealRound(tour, tour.round || 0),
    participants: tour.participants.map(p => ({
      id: p.id, displayName: p.name, color: p.color, avatar: p.avatar, avatarUrl: p.avatarUrl,
      deck: p.deck, online: onlineIds.has(p.id),
    })),
    // Freilose wie beim großen Turnier (lifecycle.publicMatch): BYE wird zu null + Merker
    matches: tour.matches.map(m => ({
      id: m.id, stage: m.stage, group: m.group, round: m.round, slot: m.slot, bestOf: m.bestOf,
      wave: tour.waves?.[m.id] || 1,
      a: S.isPlayer(m.a) ? m.a : null, b: S.isPlayer(m.b) ? m.b : null,
      aBye: m.a === S.BYE, bBye: m.b === S.BYE,
      scoreA: m.scoreA, scoreB: m.scoreB, winner: m.winner, status: m.status,
      playable: S.isPlayable(m) && tour.phase === 'running' && inCurrentRound(tour, m), live: live(m), games: (tour.games[m.id] || []).length,
      // Wohin Sieger/Verlierer weiterziehen — für "Wenn du gewinnst: Finale gegen …"
      winTo: m.winTo || null, loseTo: m.loseTo || null,
      decks: tour.matchDecks[m.id] || null,
    })),
    standings: standingsOf(tour),
    podium: podiumOf(tour),
    currentMatchId: tour.currentMatchId,
  };
}

module.exports = {
  FORMATS, BEST_OF, ROUNDS, DRAFTS, DEFAULT_SETTINGS,
  sanitizeSettings, freshTour, activeTour, start, begin, advanceRound, prepareRoundDraft, reset, computeWaves,
  prepareMatchDraft, restoreSpectators, remapPlayerId, onDraftComplete, onGameCancelled,
  addGameWin, undo, publicView, roundRobinMatches,
};
