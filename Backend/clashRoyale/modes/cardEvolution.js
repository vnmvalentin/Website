// ── Karten-Evolution ─────────────────────────────────────────────────────────
// Jeder Spieler startet mit 8 Wildcard-Platzhaltern (3 Common/3 Rare/2 Epic) und wertet sie mit
// Tokens auf oder ab: jede Aktion zieht 2 Kandidatenkarten der Zielstufe, zwischen denen
// gewählt wird. Alle echten Karten kommen aus einem geteilten Pool pro Lobby — eine Karte kann
// nie bei zwei Spielern gleichzeitig liegen; wird eine Karte erneut auf-/abgewertet, wandert
// die alte zurück in den Pool.

const { getCardPool } = require('../core/cards');
const { lobbies, shuffle } = require('../core/lobbies');
const { clearTurnTimer, emitTimerTick } = require('../core/timers');
const { notifyDraftComplete } = require('../core/streamerFeed');
const { registerMode } = require('../core/registry');
const { emitClashError } = require('../core/errors');

const EVOLUTION_START_COUNTS = { Common: 3, Rare: 3, Epic: 2 };
const EVOLUTION_TOKENS_START = 30;
const EVOLUTION_PICK_SECONDS_DEFAULT = 30;
const EVOLUTION_SABOTAGE_SECONDS_DEFAULT = 20;
const EVOLUTION_LOCK_COST = 3;
const EVOLUTION_SABOTAGE_COST = 3;
// Bleiben bei Spielende ungenutzte Wildcards übrig, bekommen Spieler diese Zeit, den
// Auflösungs-Flip noch zu sehen, bevor der Endscreen (GameOverScreen) sie überdeckt.
const EVOLUTION_REVEAL_DELAY_MS = 2400;
const RARITY_CHAIN = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'];
const CHAMPION_MAX_PER_PLAYER = 2;
// Runde 1 = Picken, Runde 2 = Sabotage, Runde 3 = Picken. Reihenfolge steuert sowohl
// buildEvolutionState().round als auch advanceEvolutionPhase().
const EVOLUTION_PHASE_ORDER = ['round1', 'sabotage', 'round3'];

function evolutionSlotRarity(slot) {
  return slot.card ? slot.card.rarity : slot.rarity;
}

// Zielstufe einer Auf-/Abwertung. Beide Enden der Kette rerollen statt zu blockieren:
// Downgrade von Common → anderes Common; Upgrade von Champion → anderer Champion.
function evolutionTargetRarity(rarity, direction) {
  const idx = RARITY_CHAIN.indexOf(rarity);
  if (idx === -1) return null;
  if (direction === 'up') return idx >= RARITY_CHAIN.length - 1 ? RARITY_CHAIN[idx] : RARITY_CHAIN[idx + 1];
  return idx === 0 ? RARITY_CHAIN[0] : RARITY_CHAIN[idx - 1];
}

// Progressive Kosten pro Slot: jeder erfolgreiche Klick auf DIESE Karte (Auf- oder Abwertung)
// erhöht slot.pickCount um 1 — der nächste Klick auf denselben Slot kostet dadurch 1 Token
// mehr. Der Zähler bleibt über Runde 1 und Runde 3 hinweg erhalten (Sabotage in Runde 2 rührt
// ihn nicht an).
function evolutionActionCost(slot) {
  return (slot.pickCount || 0) + 1;
}

function evolutionChampionCount(playerState) {
  return playerState.slots.filter(s => s.card?.isChampion).length;
}

// Nebenläufigkeits-Hinweis: Ziehen aus dem Pool ist bewusst nirgends async — weder hier
// noch in evolutionApplyAction/resolvePending liegt ein `await` zwischen dem Lesen
// und dem Mutieren von g.pool. Node verarbeitet Socket-Events strikt sequenziell (ein
// Event läuft immer vollständig durch, bevor das nächste startet); zwei Spieler, die in
// derselben Millisekunde auf "Aufwerten" klicken, werden also nie wirklich gleichzeitig
// verarbeitet, sondern garantiert nacheinander. Dadurch kann dieselbe Karte nie doppelt
// gezogen werden — SOLANGE hier kein `await` eingebaut wird, das diese Kette unterbricht.
//
// Zieht `count` zufällige, verschiedene Karten der gewünschten Rarity aus dem Pool und
// entfernt sie daraus (Reservierung) — gibt null zurück, wenn nicht genug vorhanden sind.
function drawFromPool(g, rarity, count) {
  const matches = g.pool.filter(c => c.rarity === rarity);
  if (matches.length < count) return null;
  const chosen = shuffle(matches).slice(0, count);
  const chosenIds = new Set(chosen.map(c => c.id));
  g.pool = g.pool.filter(c => !chosenIds.has(c.id));
  return chosen;
}

function returnToPool(g, card) {
  if (card) g.pool.push(card);
}

function syncEvolutionDeck(lobby, playerId) {
  const ps = lobby.game.players[playerId];
  const player = lobby.players.find(p => p.id === playerId);
  if (ps && player) player.deck = ps.slots.filter(s => s.card).map(s => s.card);
}

// Spielende: Wildcards, die nie angefasst wurden, verwandeln sich in eine zufällige echte
// Karte ihrer Rarity (noch aus dem Pool) — niemand soll mit einem ungenutzten Platzhalter
// dastehen. Ist der Pool für eine Rarity leer, bleibt die Wildcard ausnahmsweise bestehen.
// Gibt zurück, ob mindestens eine Wildcard aufgelöst wurde — steuert, ob finalizeEvolution
// mit dem Abschluss kurz wartet, damit der Auflösungs-Flip überhaupt sichtbar wird.
function resolveRemainingWildcards(lobby) {
  const g = lobby.game;
  let anyResolved = false;
  lobby.players.filter(p => !p.isSpectator).forEach(p => {
    const ps = g.players[p.id];
    if (!ps) return;
    ps.slots.forEach(slot => {
      if (slot.card) return;
      const drawn = drawFromPool(g, slot.rarity, 1);
      if (drawn) { slot.card = drawn[0]; anyResolved = true; }
    });
    syncEvolutionDeck(lobby, p.id);
  });
  return anyResolved;
}

function buildEvolutionState(lobby) {
  const g = lobby.game;
  const poolCounts = {};
  RARITY_CHAIN.forEach(r => { poolCounts[r] = 0; });
  g.pool.forEach(c => { poolCounts[c.rarity] = (poolCounts[c.rarity] || 0) + 1; });

  return {
    type: 'card-evolution',
    finished: g.finished,
    poolCounts,
    phase: g.phase,
    round: EVOLUTION_PHASE_ORDER.indexOf(g.phase) + 1,
    timerRemaining: g.timerRemaining ?? null,
    timerSeconds: evolutionPhaseDuration(lobby, g.phase),
    players: lobby.players.filter(p => !p.isSpectator).map(p => {
      const ps = g.players[p.id];
      return {
        id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
        slots: ps ? ps.slots : [],
        tokens: ps ? ps.tokens : 0,
        pending: g.pending[p.id] || null,
      };
    }),
  };
}

function broadcastEvolutionState(lobby, io) {
  io.to(lobby.code).emit('clash:evo:state', buildEvolutionState(lobby));
}

function startCardEvolution(lobby, io) {
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const tokensStart = lobby.evolutionTokensStart || EVOLUTION_TOKENS_START;
  const players = {};
  activePlayers.forEach(p => {
    const slots = [];
    Object.entries(EVOLUTION_START_COUNTS).forEach(([rarity, count]) => {
      for (let i = 0; i < count; i++) slots.push({ rarity, card: null, locked: false, pickCount: 0 });
    });
    players[p.id] = { slots, tokens: tokensStart };
  });
  lobby.players.forEach(p => { p.deck = []; });
  lobby.game = {
    type: 'card-evolution',
    players,
    pool: shuffle(getCardPool(lobby)),
    pending: {},
    finished: false,
    phase: EVOLUTION_PHASE_ORDER[0],
    timerRemaining: null,
    timerInterval: null,
  };
  io.to(lobby.code).emit('clash:gameStart', { mode: 'card-evolution' });
  broadcastEvolutionState(lobby, io);
  startEvolutionPhaseTimer(lobby, io);
}

function evolutionPhaseDuration(lobby, phase) {
  return phase === 'sabotage'
    ? (lobby.evolutionSabotageSeconds || EVOLUTION_SABOTAGE_SECONDS_DEFAULT)
    : (lobby.evolutionPickSeconds || EVOLUTION_PICK_SECONDS_DEFAULT);
}

// Timer für die aktuelle Phase (Picken oder Sabotage). Nutzt denselben lobby.game.timerInterval-
// Slot wie die anderen Modi, daher funktioniert clearTurnTimer(lobby) unverändert auch hier.
// Läuft die Zeit ab, wird IMMER zur nächsten Phase gewechselt (kein unbegrenzter Modus mehr).
function startEvolutionPhaseTimer(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.timerRemaining = evolutionPhaseDuration(lobby, g.phase);
  emitTimerTick(lobby, io);
  g.timerInterval = setInterval(() => {
    g.timerRemaining--;
    io.to(lobby.code).emit('clash:timerTick', { remaining: g.timerRemaining });
    if (g.timerRemaining <= 0) {
      clearTurnTimer(lobby);
      advanceEvolutionPhase(lobby, io);
    }
  }, 1000);
}

// Zieht 2 Kandidatenkarten der Zielstufe — der Spieler wählt danach per evolutionResolvePending,
// welche der beiden er behält. Kosten sind progressiv (evolutionActionCost), bezahlt aus dem
// einzigen Token-Pool des Spielers.
function evolutionApplyAction(lobby, socket, playerId, slotIdx, direction) {
  const g = lobby.game;
  const ps = g.players[playerId];
  const slot = ps.slots[slotIdx];
  if (slot.locked) { emitClashError(socket, 'cardLocked'); return false; }
  const rarity = evolutionSlotRarity(slot);
  const targetRarity = evolutionTargetRarity(rarity, direction);
  if (!targetRarity) { emitClashError(socket, 'cannotUpgrade'); return false; }
  const cost = evolutionActionCost(slot);
  if (ps.tokens < cost) { emitClashError(socket, 'notEnoughTokens'); return false; }
  // Limit gilt nur beim Erwerb eines NEUEN Champions — ein bereits vorhandener Champion darf
  // sich jederzeit in einen anderen umrollen, ohne dass das die Gesamtzahl erhöht.
  const becomesNewChampion = targetRarity === 'Champion' && rarity !== 'Champion';
  if (becomesNewChampion && evolutionChampionCount(ps) >= CHAMPION_MAX_PER_PLAYER) {
    emitClashError(socket, 'championLimitEvolution');
    return false;
  }
  const drawn = drawFromPool(g, targetRarity, 2);
  if (!drawn) { emitClashError(socket, 'notEnoughOfRarity', { rarity: targetRarity }); return false; }
  ps.tokens -= cost;
  // Der Preis ist mit dem Auslösen bereits bezahlt — der Zähler steigt jetzt, nicht erst bei
  // der Auflösung der Wahl (sonst könnte man während einer offenen Wahl "billiger" nachlegen).
  slot.pickCount = (slot.pickCount || 0) + 1;
  // Beide Kandidaten sind ab jetzt aus dem Pool entfernt/blockiert, bis der Spieler wählt
  g.pending[playerId] = { slotIdx, direction, targetRarity, candidates: drawn };
  return true;
}

function evolutionResolvePending(lobby, playerId, chosenIndex) {
  const g = lobby.game;
  const pending = g.pending[playerId];
  if (!pending || (chosenIndex !== 0 && chosenIndex !== 1)) return false;
  const ps = g.players[playerId];
  const slot = ps.slots[pending.slotIdx];
  const chosen = pending.candidates[chosenIndex];
  const other = pending.candidates[1 - chosenIndex];
  returnToPool(g, other);
  returnToPool(g, slot.card);
  slot.card = chosen;
  slot.rarity = pending.targetRarity;
  delete g.pending[playerId];
  return true;
}

// Sperrt einen Slot dauerhaft — auch für den Besitzer selbst. Kostet immer 3 normale Tokens,
// unabhängig vom progressiven Preis der Karte, und schützt sie in Runde 2 vor Sabotage.
function evolutionLockSlot(lobby, socket, playerId, slotIdx) {
  const g = lobby.game;
  const ps = g.players[playerId];
  const slot = ps.slots[slotIdx];
  if (slot.locked) return false;
  if (ps.tokens < EVOLUTION_LOCK_COST) { emitClashError(socket, 'notEnoughTokensLock'); return false; }
  ps.tokens -= EVOLUTION_LOCK_COST;
  slot.locked = true;
  return true;
}

// Sabotage (nur Runde 2): rerollt eine ungelockte Karte eines ANDEREN Spielers auf eine neue
// Karte derselben Rarity. Kostet den Saboteur immer 3 normale Tokens und rührt weder
// slot.pickCount noch den progressiven Preis der Karte an.
// Rerollt eine ungelockte gegnerische Karte auf eine KOMPLETT ZUFÄLLIGE Seltenheit (nicht nur
// die bisherige) — Champion ist dabei nur zulässig, wenn die Karte schon vorher Champion war
// (reiner Tausch, erhöht die Gesamtzahl nicht) oder der Zielspieler das Limit (max. 2) noch
// nicht erreicht hat.
function evolutionSabotage(lobby, socket, saboteurId, targetPlayerId, slotIdx) {
  const g = lobby.game;
  if (targetPlayerId === saboteurId) return false;
  const saboteur = g.players[saboteurId];
  const target = g.players[targetPlayerId];
  const slot = target?.slots[slotIdx];
  if (!saboteur || !slot || slot.locked) { emitClashError(socket, 'cardLocked'); return false; }
  if (saboteur.tokens < EVOLUTION_SABOTAGE_COST) { emitClashError(socket, 'notEnoughTokensSabotage'); return false; }
  const wasChampion = evolutionSlotRarity(slot) === 'Champion';
  const champCount = evolutionChampionCount(target);
  const eligibleRarities = RARITY_CHAIN.filter(r => {
    if (r === 'Champion' && !wasChampion && champCount >= CHAMPION_MAX_PER_PLAYER) return false;
    return g.pool.some(c => c.rarity === r);
  });
  if (!eligibleRarities.length) { emitClashError(socket, 'poolEmpty'); return false; }
  const newRarity = eligibleRarities[Math.floor(Math.random() * eligibleRarities.length)];
  const drawn = drawFromPool(g, newRarity, 1);
  if (!drawn) { emitClashError(socket, 'noneOfRarityLeft', { rarity: newRarity }); return false; }
  saboteur.tokens -= EVOLUTION_SABOTAGE_COST;
  returnToPool(g, slot.card);
  slot.card = drawn[0];
  slot.rarity = newRarity;
  return true;
}

// Offene Wahlen (2-Kandidaten-Picks) zufällig auflösen, bevor eine Phase wechselt — sonst
// blieben deren 2 reservierte Kandidaten für immer aus dem Pool verschwunden.
function evolutionResolveAllPending(lobby) {
  const g = lobby.game;
  Object.keys(g.pending).forEach(pid => {
    evolutionResolvePending(lobby, pid, Math.random() < 0.5 ? 0 : 1);
  });
}

// Wechselt zur nächsten Phase in EVOLUTION_PHASE_ORDER, oder beendet das Spiel, wenn Runde 3
// (die letzte Phase) abgelaufen ist.
function advanceEvolutionPhase(lobby, io) {
  const g = lobby.game;
  if (!g || g.type !== 'card-evolution' || g.finished) return;
  evolutionResolveAllPending(lobby);
  Object.keys(g.players).forEach(pid => syncEvolutionDeck(lobby, pid));

  const idx = EVOLUTION_PHASE_ORDER.indexOf(g.phase);
  if (idx < EVOLUTION_PHASE_ORDER.length - 1) {
    g.phase = EVOLUTION_PHASE_ORDER[idx + 1];
    broadcastEvolutionState(lobby, io);
    startEvolutionPhaseTimer(lobby, io);
  } else {
    finalizeEvolution(lobby, io);
  }
}

function finalizeEvolution(lobby, io) {
  const g = lobby.game;
  if (!g || g.finished) return;
  clearTurnTimer(lobby);
  const anyWildcardsResolved = resolveRemainingWildcards(lobby);
  g.finished = true;
  // Zustand mit den aufgelösten Karten sofort zeigen (Flip-Animation im Frontend), den
  // eigentlichen Spielende-Wechsel zum GameOverScreen aber erst kurz danach auslösen —
  // sonst wäre die Auflösung nie sichtbar, weil beide Events sonst im selben Tick ankämen.
  broadcastEvolutionState(lobby, io);
  const finalize = () => {
    if (!lobby.history) lobby.history = [];
    const historyPlayers = lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: p.deck || [], isSpectator: p.isSpectator ?? false,
    }));
    lobby.history.push({ gameNum: lobby.history.length + 1, mode: 'card-evolution', players: historyPlayers });
    io.to(lobby.code).emit('clash:gameOver', { players: historyPlayers });
    notifyDraftComplete(lobby, io);
  };
  if (anyWildcardsResolved) {
    setTimeout(() => {
      const l = lobbies.get(lobby.code);
      if (!l || l.game !== g) return; // Lobby zwischenzeitlich neugestartet/Modus gewechselt
      finalize();
    }, EVOLUTION_REVEAL_DELAY_MS);
  } else {
    finalize();
  }
}

registerMode({
  id: 'card-evolution',
  gameType: 'card-evolution',
  settings: {
    evolutionPickSeconds: {
      default: EVOLUTION_PICK_SECONDS_DEFAULT,
      event: 'clash:setEvolutionPickSeconds',
      payloadKey: 'seconds',
      sanitize: (v) => Math.max(5, Math.min(120, Number(v) || EVOLUTION_PICK_SECONDS_DEFAULT)),
    },
    evolutionSabotageSeconds: {
      default: EVOLUTION_SABOTAGE_SECONDS_DEFAULT,
      event: 'clash:setEvolutionSabotageSeconds',
      payloadKey: 'seconds',
      sanitize: (v) => Math.max(5, Math.min(60, Number(v) || EVOLUTION_SABOTAGE_SECONDS_DEFAULT)),
    },
    evolutionTokensStart: {
      default: EVOLUTION_TOKENS_START,
      event: 'clash:setEvolutionTokens',
      payloadKey: 'count',
      sanitize: (v) => Math.max(1, Math.min(99, Number(v) || EVOLUTION_TOKENS_START)),
    },
  },
  // Kein Mindestpool: der Start besteht nur aus Wildcards, echte Karten kommen erst
  // on-demand durch Tokens. Ein knapper Pool wird im Spiel durch ausgegraute Aktionen
  // abgefangen, ein Absturz ist dadurch nicht möglich.
  requiredPool: () => null,
  start: (lobby, io) => startCardEvolution(lobby, io),
  buildState: (lobby) => ({ event: 'clash:evo:state', payload: buildEvolutionState(lobby) }),
  remapPlayerId: (game, oldId, newId) => {
    if (game.players?.[oldId]) { game.players[newId] = game.players[oldId]; delete game.players[oldId]; }
    if (game.pending?.[oldId]) { game.pending[newId] = game.pending[oldId]; delete game.pending[oldId]; }
  },
  socketHandlers: {
    'clash:evo:action': ({ socket, io }, { code, slotIdx, direction }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'card-evolution' || lobby.game.finished) return;
      const g = lobby.game;
      if (g.phase !== 'round1' && g.phase !== 'round3') return;
      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || player.isSpectator) return;
      const ps = g.players[socket.id];
      if (!ps || typeof slotIdx !== 'number' || !ps.slots[slotIdx]) return;
      if (direction !== 'up' && direction !== 'down') return;
      if (g.pending[socket.id]) return emitClashError(socket, 'alreadyPending');

      if (!evolutionApplyAction(lobby, socket, socket.id, slotIdx, direction)) return;

      syncEvolutionDeck(lobby, socket.id);
      broadcastEvolutionState(lobby, io);
    },

    'clash:evo:resolvePending': ({ socket, io }, { code, chosenIndex }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'card-evolution' || lobby.game.finished) return;
      const g = lobby.game;
      if (g.phase !== 'round1' && g.phase !== 'round3') return;
      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || player.isSpectator) return;
      if (!evolutionResolvePending(lobby, socket.id, chosenIndex)) return;
      syncEvolutionDeck(lobby, socket.id);
      broadcastEvolutionState(lobby, io);
    },

    'clash:evo:lock': ({ socket, io }, { code, slotIdx }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'card-evolution' || lobby.game.finished) return;
      const g = lobby.game;
      // Nur in Runde 1 locken — in Runde 3 gibt es keine weitere Sabotage-Runde mehr, vor der
      // ein Lock noch schützen müsste.
      if (g.phase !== 'round1') return;
      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || player.isSpectator) return;
      const ps = g.players[socket.id];
      if (!ps || typeof slotIdx !== 'number' || !ps.slots[slotIdx]) return;
      if (g.pending[socket.id]) return emitClashError(socket, 'alreadyPending');
      if (!evolutionLockSlot(lobby, socket, socket.id, slotIdx)) return;
      broadcastEvolutionState(lobby, io);
    },

    'clash:evo:sabotage': ({ socket, io }, { code, targetPlayerId, slotIdx }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'card-evolution' || lobby.game.finished) return;
      const g = lobby.game;
      if (g.phase !== 'sabotage') return;
      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || player.isSpectator) return;
      if (!g.players[targetPlayerId] || typeof slotIdx !== 'number') return;
      if (!evolutionSabotage(lobby, socket, socket.id, targetPlayerId, slotIdx)) return;
      syncEvolutionDeck(lobby, targetPlayerId);
      broadcastEvolutionState(lobby, io);
    },
  },
});
