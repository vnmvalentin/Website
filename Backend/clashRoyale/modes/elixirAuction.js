// ── Elixir Auction ───────────────────────────────────────────────────────────
// Jede Runde werden Karten versteigert: alle bieten verdeckt, der Höchstbietende bekommt
// die Karte, Verlierer erhalten einen Trostpreis. Optional besucht die Mutterhexe einen
// zufälligen Spieler und bietet ihm eine Fähigkeit an.

const { ALL_CARDS, getCardPool } = require('../core/cards');
const { lobbies, shuffle, sanitizeLobby } = require('../core/lobbies');
const { clearTurnTimer, startTurnTimer } = require('../core/timers');
const { notifyDraftComplete } = require('../core/streamerFeed');
const { registerMode } = require('../core/registry');
const { emitClashError } = require('../core/errors');

// Mutterhexen-Besuche: 20% Chance pro Runde (2-7), trifft einen zufälligen Spieler
const MOTHER_WITCH_ROUND_MIN = 2;
const MOTHER_WITCH_ROUND_MAX = 7;
const MOTHER_WITCH_CHANCE = 0.3;

const MOTHER_WITCH_ABILITIES = [
  {
    id: 'pigs',
    name: 'Schweinezauber',
    costPct: 0.15,
    greeting: 'Na, mein Täubchen... die Mutterhexe hat einen kleinen Handel für dich!',
    description: 'In der nächsten Runde sehen alle anderen Spieler statt der echten Karten nur Schweine — sie müssen blind bieten. Du siehst alles wie gewohnt.',
  },
  {
    id: 'swap',
    name: 'Vertauschte Karten',
    costPct: 0.20,
    greeting: 'Hihihi... ein kleiner Kartentrick gefällig, meine Süße?',
    description: 'In der nächsten Runde sehen alle anderen Spieler die Karten an falschen Stellen — erst nach dem Bieten wird alles richtiggestellt. Nur du siehst die Wahrheit.',
  },
  {
    id: 'halved',
    name: 'Halbierte Einsätze',
    costPct: 0.10,
    greeting: 'Ein kleiner Fluch für deine Gegner gefällig, mein Schatz?',
    description: 'In der nächsten Runde zählen die Gebote aller Gegner nur halb so viel — dafür bekommen sie einen Teil ihres eingesetzten Elixiers zurück.',
  },
];

// Zufällige Permutation ohne Fixpunkte (jede Karte landet garantiert an falscher Stelle)
function buildDerangement(n) {
  const base = Array.from({ length: n }, (_, i) => i);
  if (n <= 1) return base;
  let arr = base;
  for (let attempt = 0; attempt < 50; attempt++) {
    arr = shuffle(base);
    if (arr.every((v, i) => v !== i)) return arr;
  }
  return arr;
}

// Ist die gerade laufende Runde die letzte? Das Spiel endet entweder nach maxRounds oder
// sobald der Kartenpool für eine weitere volle Runde nicht mehr reicht — nextAuctionRound()
// prüft genau diese beiden Bedingungen, hier mit bereits vorgerücktem poolIdx.
function isFinalAuctionRound(g) {
  return g.round >= g.maxRounds || g.poolIdx + g.cardsPerRound > g.pool.length;
}

function buildAuctionState(lobby, bidsVisible = false, viewerId = null) {
  const g = lobby.game;
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const mw = g.motherWitch;
  const effect = mw?.activeEffect && mw.activeEffect.round === g.round ? mw.activeEffect : null;

  let currentCards = g.currentCards;
  let motherWitchMine = null;

  if (effect) {
    if (viewerId === effect.exemptPlayerId) {
      motherWitchMine = effect.ability;
    } else if (viewerId) {
      // Betroffene Gegner sehen nur den Effekt selbst (Schweine, vertauschte Karten, stillschweigend
      // halbiertes Gebot) — kein Hinweis, dass die Mutterhexe dahintersteckt, sonst ist die Überraschung hin.
      if (effect.ability === 'pigs') {
        currentCards = g.currentCards.map(() => ({ id: 'pig', name: 'Schwein', rarity: 'Common', isChampion: false, isPig: true }));
      } else if (effect.ability === 'swap') {
        if (!mw.swapMap) mw.swapMap = buildDerangement(g.currentCards.length);
        currentCards = mw.swapMap.map(realIdx => g.currentCards[realIdx]);
      }
    }
  }

  return {
    type: 'auction',
    round: g.round,
    maxRounds: g.maxRounds,
    phase: g.phase,
    cardsPerRound: g.cardsPerRound,
    currentCards,
    pendingBidCount: Object.keys(g.bids).length,
    activePlayerCount: activePlayers.length,
    timerRemaining: g.timerRemaining,
    timerSeconds: lobby.timerSeconds,
    showElixir: lobby.showElixir ?? false,
    // Startguthaben dieser Runde. Der Client braucht es als Bezugsgröße für die
    // Elixierbalken: Ohne diesen Wert müsste er gegen eine fest angenommene Obergrenze
    // rechnen — bei 100 Start-Elixier wäre der Balken dann nur halb voll, obwohl der
    // Spieler noch alles hat.
    startElixir: lobby.startElixir ?? 100,
    // In der letzten Runde ist übriges Elixier wertlos — der Server setzt jedes Gebot
    // automatisch auf das gesamte Restguthaben (siehe clash:auction:bid). Der Client
    // blendet den Regler dann aus und schreibt es hin.
    finalRound: isFinalAuctionRound(g),
    finished: g.finished,
    motherWitchMine,
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      elixir: p.elixir ?? 100, deck: p.deck || [],
      isSpectator: p.isSpectator ?? false,
    })),
    ...(bidsVisible ? { bids: g.bids } : {}),
  };
}

// Sendet jedem Spieler seine individuelle Sicht der Runde (relevant bei aktivem Mutterhexen-Effekt)
function broadcastAuctionRound(lobby, io) {
  lobby.players.forEach(p => {
    io.to(p.id).emit('clash:auctionRound', buildAuctionState(lobby, false, p.id));
  });
}

function maybeTriggerMotherWitch(lobby, io) {
  if (!lobby.motherWitchEnabled) return;
  const g = lobby.game;
  if (g.round < MOTHER_WITCH_ROUND_MIN || g.round > MOTHER_WITCH_ROUND_MAX) return;
  if (Math.random() >= MOTHER_WITCH_CHANCE) return;

  const eligible = lobby.players.filter(p => !p.isSpectator && !p.disconnected);
  if (!eligible.length) return;

  const target = eligible[Math.floor(Math.random() * eligible.length)];
  const ability = MOTHER_WITCH_ABILITIES[Math.floor(Math.random() * MOTHER_WITCH_ABILITIES.length)];
  const cost = Math.max(1, Math.round((lobby.startElixir ?? 100) * ability.costPct));

  g.motherWitch.pending = { targetPlayerId: target.id, ability: ability.id, cost, forRound: g.round };
  io.to(target.id).emit('clash:motherWitch:visit', {
    ability: ability.id, name: ability.name, greeting: ability.greeting,
    description: ability.description, cost, round: g.round,
  });
}

function startElixirAuction(lobby, io) {
  const startElixir = lobby.startElixir ?? 100;
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const n = activePlayers.length;
  const perRound = Math.max(n, lobby.cardsPerRound || n);
  lobby.players.forEach(p => { p.deck = []; p.elixir = p.isSpectator ? 0 : startElixir; });
  lobby.game = {
    type: 'auction',
    pool: shuffle(getCardPool(lobby)),
    poolIdx: 0,
    round: 0,
    maxRounds: 8,
    cardsPerRound: perRound,
    phase: 'bidding',
    currentCards: [],
    bids: {},
    timerRemaining: lobby.timerSeconds,
    timerInterval: null,
    finished: false,
    motherWitch: { pending: null, activeEffect: null, swapMap: null },
  };
  io.to(lobby.code).emit('clash:gameStart', { mode: 'auction' });
  nextAuctionRound(lobby, io);
}

function nextAuctionRound(lobby, io) {
  const g = lobby.game;
  if (g.round >= g.maxRounds || g.poolIdx + g.cardsPerRound > g.pool.length) {
    endAuctionGame(lobby, io); return;
  }
  g.round++;
  g.phase = 'bidding';
  g.currentCards = g.pool.slice(g.poolIdx, g.poolIdx + g.cardsPerRound);
  g.poolIdx += g.cardsPerRound;
  g.bids = {};
  g.motherWitch.swapMap = null;
  broadcastAuctionRound(lobby, io);
  maybeTriggerMotherWitch(lobby, io);
  startTurnTimer(lobby, io);
}

// Draw a random non-champion bonus card not in the current round's pool
function drawBonusCard(lobby, alreadyGiven = []) {
  const g = lobby.game;
  const cardPool = getCardPool(lobby);
  const currentIds = new Set(g.currentCards.map(c => c.id));
  const givenIds   = new Set(alreadyGiven.map(c => c.id));
  const pool = cardPool.filter(c => !c.isChampion && !currentIds.has(c.id) && !givenIds.has(c.id));
  if (pool.length === 0) {
    let fallback = cardPool.filter(c => !c.isChampion && !currentIds.has(c.id));
    if (!fallback.length) fallback = ALL_CARDS.filter(c => !c.isChampion && !currentIds.has(c.id));
    return fallback[Math.floor(Math.random() * Math.max(1, fallback.length))];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function resolveAuction(lobby, io) {
  const g = lobby.game;
  clearTurnTimer(lobby);
  g.phase = 'reveal';

  const mw = g.motherWitch;
  const effect = mw?.activeEffect && mw.activeEffect.round === g.round ? mw.activeEffect : null;

  // Unbeantworteter Mutterhexen-Besuch für diese Runde verfällt
  if (mw?.pending && mw.pending.forRound === g.round) {
    io.to(mw.pending.targetPlayerId).emit('clash:motherWitch:expire');
    mw.pending = null;
  }

  // Fill missing bids (timer expired active players only — spectators skip)
  lobby.players.forEach(p => {
    if (p.isSpectator) return;
    if (!g.bids[p.id]) g.bids[p.id] = { cardIndex: -1, amount: 0 };
  });

  // Aggregate bids per card — "Halbierte Einsätze" lässt Gegner-Gebote nur halb zählen
  const cardBids = Object.fromEntries(g.currentCards.map((_, i) => [i, []]));
  Object.entries(g.bids).forEach(([pid, bid]) => {
    if (bid.cardIndex < 0) return;
    const halved = effect?.ability === 'halved' && pid !== effect.exemptPlayerId;
    const value  = halved ? Math.floor(bid.amount / 2) : bid.amount;
    cardBids[bid.cardIndex].push({ playerId: pid, amount: bid.amount, value, halved });
  });

  // Determine winner per card (nutzt den ggf. halbierten Wert)
  const winners = {};
  g.currentCards.forEach((_, i) => {
    const bids = cardBids[i];
    if (!bids.length) { winners[i] = null; return; }
    const max = Math.max(...bids.map(b => b.value));
    const tops = bids.filter(b => b.value === max);
    winners[i] = tops[Math.floor(Math.random() * tops.length)].playerId;
  });

  // Consolation pool = uncontested cards (nobody bid on them)
  const uncontested = shuffle(
    Object.entries(winners).filter(([, w]) => w === null).map(([i]) => g.currentCards[Number(i)])
  );
  const usedConsolIdx = new Set();
  const bonusCardsGiven = [];

  // Assign cards + deduct elixir (spectators get nothing)
  const playerResults = {};
  lobby.players.forEach(p => {
    if (p.isSpectator) { playerResults[p.id] = { won: false, bidCard: null, bidAmount: 0, got: null, isBonus: false }; return; }
    const bid      = g.bids[p.id];
    const bidCard  = bid.cardIndex >= 0 ? g.currentCards[bid.cardIndex] : null;
    const won      = bidCard && winners[bid.cardIndex] === p.id;
    const champCount   = (p.deck || []).filter(c => c.isChampion).length;
    const cantTakeChamp = champCount >= 2;
    const halved = effect?.ability === 'halved' && p.id !== effect.exemptPlayerId;
    p.elixir = Math.max(0, (p.elixir ?? 100) - bid.amount);
    if (halved) p.elixir += Math.floor(bid.amount / 2); // Gegner bekommen die Hälfte ihres Einsatzes zurück

    let got     = null;
    let isBonus = false;

    if (won) {
      if (cantTakeChamp && bidCard.isChampion) {
        // Safety-net: bid-check should prevent this, but guard anyway
        got = drawBonusCard(lobby, bonusCardsGiven);
        bonusCardsGiven.push(got);
        isBonus = true;
        winners[bid.cardIndex] = null;
      } else {
        got = bidCard;
      }
    } else {
      // Find first suitable consolation card
      for (let ci = 0; ci < uncontested.length; ci++) {
        if (usedConsolIdx.has(ci)) continue;
        const candidate = uncontested[ci];
        if (cantTakeChamp && candidate.isChampion) continue; // skip champion for capped player
        got = candidate;
        usedConsolIdx.add(ci);
        break;
      }
      // No suitable consolation found → bonus card
      if (!got) {
        got = drawBonusCard(lobby, bonusCardsGiven);
        bonusCardsGiven.push(got);
        isBonus = true;
      }
    }

    if (got) p.deck = [...(p.deck || []), got];
    playerResults[p.id] = { won, bidCard, bidAmount: bid.amount, got, isBonus };
  });

  const state = buildAuctionState(lobby, true);
  state.winners = winners;
  state.cardBids = cardBids;
  state.playerResults = playerResults;
  state.motherWitchReveal = effect ? {
    ability: effect.ability,
    exemptPlayerId: effect.exemptPlayerId,
    swapMap: effect.ability === 'swap' ? mw.swapMap : null,
  } : null;

  if (effect) mw.activeEffect = null;

  io.to(lobby.code).emit('clash:auctionReveal', state);
  io.to(lobby.code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));

  setTimeout(() => {
    if (!lobby.game || lobby.game.finished) return;
    nextAuctionRound(lobby, io);
  }, 7000);
}

function endAuctionGame(lobby, io) {
  clearTurnTimer(lobby);
  lobby.game.finished = true;
  if (!lobby.history) lobby.history = [];
  lobby.history.push({
    gameNum: lobby.history.length + 1,
    mode: 'auction',
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: [...(p.deck || [])], isSpectator: p.isSpectator ?? false })),
  });
  io.to(lobby.code).emit('clash:gameOver', {
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: p.deck || [], isSpectator: p.isSpectator ?? false })),
  });
  notifyDraftComplete(lobby, io);
}

// Auktion und Bingo teilen sich cardsPerRound — das Feld gehört deshalb zur
// Lobby-Grundausstattung und nicht in die settings eines einzelnen Modus.
registerMode({
  id: 'auction',
  gameType: 'auction',
  settings: {
    startElixir: {
      default: 100,
      event: 'clash:setStartElixir',
      payloadKey: 'amount',
      sanitize: (v) => Math.max(10, Math.min(500, Number(v) || 100)),
    },
    showElixir: {
      default: false,
      event: 'clash:setShowElixir',
      payloadKey: 'show',
      duringGame: true,
      sanitize: (v) => !!v,
      // Auch im laufenden Spiel broadcasten
      afterChange: (lobby, io) => { if (lobby.game?.type === 'auction') broadcastAuctionRound(lobby, io); },
    },
    motherWitchEnabled: {
      default: false,
      event: 'clash:setMotherWitch',
      payloadKey: 'enabled',
      sanitize: (v) => !!v,
    },
  },
  requiredPool: (lobby, active) => 8 * Math.max(active, lobby.cardsPerRound || active),
  start: (lobby, io) => startElixirAuction(lobby, io),
  buildState: (lobby, socket, { revealBids = false } = {}) =>
    ({ event: 'clash:auctionRound', payload: buildAuctionState(lobby, revealBids, socket.id) }),
  remapPlayerId: (game, oldId, newId) => {
    if (game.bids?.[oldId]) { game.bids[newId] = game.bids[oldId]; delete game.bids[oldId]; }
    const mw = game.motherWitch;
    if (mw?.pending?.targetPlayerId === oldId) mw.pending.targetPlayerId = newId;
    if (mw?.activeEffect?.exemptPlayerId === oldId) mw.activeEffect.exemptPlayerId = newId;
  },
  onTimerExpire: (lobby, io) => resolveAuction(lobby, io),
  onPlayerLeft: (lobby, io, playerId) => {
    const g = lobby.game;
    if (g.phase !== 'bidding') return;
    delete g.bids[playerId]; // sein Gebot zählt nicht mehr
    const activePlayers = lobby.players.filter(p => !p.isSpectator);
    if (Object.keys(g.bids).length >= activePlayers.length) {
      clearTurnTimer(lobby);
      resolveAuction(lobby, io);
    }
  },
  onPlayerDisconnected: (lobby, io) => {
    const g = lobby.game;
    const bidCount = Object.keys(g.bids || {}).length;
    const activeCount = lobby.players.filter(p => !p.isSpectator && !p.disconnected).length;
    if (g.phase === 'bidding' && bidCount >= activeCount) {
      clearTurnTimer(lobby);
      resolveAuction(lobby, io);
    }
  },
  // Wird jemand zum Zuschauer, haben die verbliebenen Aktiven vielleicht schon alle geboten
  onSpectatorChanged: (lobby, io) => {
    const g = lobby.game;
    if (g?.phase !== 'bidding') return;
    const activePlayers = lobby.players.filter(p => !p.isSpectator);
    if (Object.keys(g.bids).length >= activePlayers.length) {
      clearTurnTimer(lobby);
      resolveAuction(lobby, io);
    }
  },
  socketHandlers: {
    'clash:auction:bid': ({ socket, io }, { code, cardIndex, amount }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'auction' || lobby.game.phase !== 'bidding') return;
      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || player.isSpectator || lobby.game.bids[socket.id]) return; // already bid or spectator
      // Letzte Runde: Elixier zu sparen bringt nichts mehr, wer weniger bietet verschenkt
      // die Karte. Statt alle zum Regler-Vollziehen zu zwingen, gilt hier automatisch das
      // gesamte Restguthaben — die Runde entscheidet damit rein danach, wer noch was übrig
      // hat. Serverseitig erzwungen, damit ein manipulierter Client nicht doch niedriger bietet.
      const myElixir = player.elixir ?? 100;
      const safeAmount = isFinalAuctionRound(lobby.game)
        ? myElixir
        : Math.max(0, Math.min(myElixir, Number(amount) || 0));
      const safeIdx = Number(cardIndex);
      if (safeIdx < -1 || safeIdx >= lobby.game.currentCards.length) return;

      // Champion-Limit: max 2 Champions pro Deck
      if (safeIdx >= 0) {
        const biddingCard  = lobby.game.currentCards[safeIdx];
        const champCount   = (player.deck || []).filter(c => c.isChampion).length;
        if (biddingCard?.isChampion && champCount >= 2) {
          return emitClashError(socket, 'championLimitBid');
        }
      }

      lobby.game.bids[socket.id] = { cardIndex: safeIdx, amount: safeAmount };
      // Notify everyone (without revealing what was bid)
      io.to(code).emit('clash:auctionBidUpdate', {
        pendingBidCount: Object.keys(lobby.game.bids).length,
        totalPlayers: lobby.players.length,
      });
      // Auto-reveal if all active players have bid
      const activePlayers = lobby.players.filter(p => !p.isSpectator);
      if (Object.keys(lobby.game.bids).length >= activePlayers.length) {
        clearTurnTimer(lobby);
        resolveAuction(lobby, io);
      }
    },

    'clash:motherWitch:respond': ({ socket, io }, { code, accept }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'auction' || lobby.game.phase !== 'bidding') return;
      const g = lobby.game;
      const mw = g.motherWitch;
      const pending = mw?.pending;
      if (!pending || pending.targetPlayerId !== socket.id || pending.forRound !== g.round) return;
      mw.pending = null;

      if (!accept) { socket.emit('clash:motherWitch:resolved', { accepted: false }); return; }

      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || (player.elixir ?? 0) < pending.cost) {
        socket.emit('clash:motherWitch:resolved', { accepted: false, reason: 'insufficient' });
        return;
      }
      player.elixir = Math.max(0, player.elixir - pending.cost);
      mw.activeEffect = { ability: pending.ability, exemptPlayerId: socket.id, round: g.round + 1 };
      mw.swapMap = null;
      socket.emit('clash:motherWitch:resolved', { accepted: true, elixir: player.elixir, ability: pending.ability });
    },
  },
});
