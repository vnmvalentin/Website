// ── Bingo Royale ─────────────────────────────────────────────────────────────
// Jeder Spieler hat eine 4×4-Bingokarte mit Attributen. Gezogene Clash-Royale-Karten
// werden auf passende Felder gelegt; volle Reihen geben Tokens für Power-Ups, mit denen
// man das eigene Deck verbessert oder gegnerische sabotiert.

const { ALL_CARDS, getCardPool } = require('../core/cards');
const { ALL_BINGO_ATTR_KEYS, getBingoCardAttrs } = require('../core/bingoAttributes');
const { lobbies, shuffle } = require('../core/lobbies');
const { clearTurnTimer, emitTimerTick } = require('../core/timers');
const { notifyDraftComplete } = require('../core/streamerFeed');
const { registerMode } = require('../core/registry');
const { emitClashError } = require('../core/errors');

// Bingo lines: [cellIndices] for a 4x4 grid
const BINGO_LINES = [
  [0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15],   // rows
  [0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15],    // cols
  [0,5,10,15],[3,6,9,12],                           // diagonals
];
const BINGO_LINE_IDS = ['row0','row1','row2','row3','col0','col1','col2','col3','diag0','diag1'];

function generateBingoCard() {
  const shuffled = shuffle([...ALL_BINGO_ATTR_KEYS]);
  return shuffled.slice(0, 16).map(attrKey => ({ attrKey, card: null, protected: false }));
}

// Returns line IDs newly completed after placing a card on cellIndex
function getNewlyCompletedLines(grid, cellIndex, completedBefore) {
  const newly = [];
  BINGO_LINES.forEach((line, li) => {
    const id = BINGO_LINE_IDS[li];
    if (completedBefore.includes(id)) return;
    if (!line.includes(cellIndex)) return;
    // Blocked cards (card doesn't match cell attribute) don't count toward bingo
    if (line.every(ci => {
      const cell = grid[ci];
      return cell.card !== null && getBingoCardAttrs(cell.card.id).includes(cell.attrKey);
    })) newly.push(id);
  });
  return newly;
}

// Snake-Draft: pro Rundenpaar hin + zurück (fair), aber die Spielerreihenfolge wird
// für jedes Paar neu zufällig gemischt — so ist niemand in jedem Paar "Spieler 1".
function generateSnakeDraftOrder(playerIndices, numRounds) {
  const order = [];
  let current = playerIndices;
  for (let r = 0; r < numRounds; r++) {
    if (r % 2 === 0) current = shuffle(playerIndices);
    order.push(...(r % 2 === 0 ? current : [...current].reverse()));
  }
  return order;
}

// Build bingo state for broadcast
function buildBingoState(lobby) {
  const g = lobby.game;
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const currentPlayerIdx = g.phase === 'draft' ? g.turnOrder[g.currentTurn] : null;
  const currentPlayer = currentPlayerIdx != null ? lobby.players[currentPlayerIdx] : null;

  // Unpicked cards: cards not in any player's deck (excluded cards never appear)
  const pickedIds = new Set(lobby.players.flatMap(p => (p.deck||[]).map(c => c.id)));
  const unpickedCards = getCardPool(lobby).filter(c => !pickedIds.has(c.id));

  // Verbleibende Tokens pro Spieler: während des Token-Shops aus der Queue abgeleitet,
  // damit die Anzeige bei jedem Einsatz live mitzählt (Reveal-Token gilt bereits als verbraucht)
  const queueFrom = (g.tokenShopIdx ?? 0) + (g.tokenShopSubPhase === 'revealing' ? 1 : 0);
  const remainingQueue = (g.tokenShopQueue || []).slice(queueFrom);
  const tokensLeftFor = (pid) => remainingQueue.filter(id => id === pid).length;

  return {
    type: 'bingo',
    phase: g.phase,
    round: g.round,
    maxRounds: g.maxRounds,
    currentCards: g.currentCards,
    pickedThisRound: g.pickedThisRound,
    currentPlayerId: currentPlayer?.id ?? null,
    timerRemaining: g.timerRemaining,
    timerSeconds: g.phase === 'tokenShop' ? (lobby.tokenShopTimerSeconds ?? lobby.timerSeconds) : lobby.timerSeconds,
    finished: g.finished,
    tokenShopCurrentPlayerId: g.tokenShopQueue?.[g.tokenShopIdx] ?? null,
    tokenShopQueue: g.tokenShopQueue || [],
    tokenShopIdx: g.tokenShopIdx ?? 0,
    tokenShopSubPhase: g.tokenShopSubPhase || 'picking',
    tokenShopLiveAction: g.tokenShopLiveAction || null,
    lastPowerupResult: g.lastPowerupResult || null,
    unpickedCards: g.phase === 'tokenShop' ? unpickedCards : [],
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: p.deck || [],
      bingoGrid: p.bingoGrid || [],
      bingoTokens: p.bingoTokens || 0,
      bingoTokensLeft: g.phase === 'tokenShop' ? tokensLeftFor(p.id) : (p.bingoTokens || 0),
      tokenAbilities: p.tokenAbilities || [],
      completedLines: p.completedLines || [],
      isSpectator: p.isSpectator ?? false,
    })),
  };
}

// ── Bingo Royale ────────────────────────────────────────────────────────────
const BINGO_POWERUP_TYPES = ['swap', 'reroll', 'joker'];

function startBingoRoyale(lobby, io) {
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const N = activePlayers.length;
  const activeIndices = lobby.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.isSpectator)
    .map(({ i }) => i);

  // Assign bingo grids to all active players
  lobby.players.forEach(p => {
    p.deck = [];
    p.bingoGrid = generateBingoCard();
    p.bingoTokens = 0;
    p.completedLines = [];
    p.tokenAbilities = [];
    if (p.isSpectator) p.bingoGrid = [];
  });

  const cardsPerRound = Math.max(N, lobby.cardsPerRound || N);
  const turnOrder = generateSnakeDraftOrder(activeIndices, 8);

  lobby.game = {
    type: 'bingo',
    pool: shuffle(getCardPool(lobby)),
    poolIdx: 0,
    round: 0,
    maxRounds: 8,
    cardsPerRound,
    currentCards: [],
    pickedThisRound: {},   // cardIndex → playerId
    phase: 'draft',
    turnOrder,
    currentTurn: 0,
    timerRemaining: lobby.timerSeconds,
    timerInterval: null,
    finished: false,
    tokenShopQueue: [],
    tokenShopIdx: 0,
    tokenShopSubPhase: 'picking',
    tokenShopLiveAction: null,
    lastPowerupResult: null,
  };

  io.to(lobby.code).emit('clash:gameStart', { mode: 'bingo' });
  nextBingoRound(lobby, io);
}

function nextBingoRound(lobby, io) {
  const g = lobby.game;
  if (g.round >= g.maxRounds) { endBingoDraft(lobby, io); return; }
  g.round++;
  g.currentCards = g.pool.slice(g.poolIdx, g.poolIdx + g.cardsPerRound);
  g.poolIdx += g.cardsPerRound;
  g.pickedThisRound = {};
  io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
  startBingoTurnTimer(lobby, io);
}

function startBingoTurnTimer(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.timerRemaining = lobby.timerSeconds;
  emitTimerTick(lobby, io);
  g.timerInterval = setInterval(() => {
    g.timerRemaining--;
    io.to(lobby.code).emit('clash:timerTick', { remaining: g.timerRemaining });
    if (g.timerRemaining <= 0) {
      clearTurnTimer(lobby);
      autoAdvanceBingo(lobby, io);
    }
  }, 1000);
}

function autoAdvanceBingo(lobby, io) {
  const g = lobby.game;
  const curIdx    = g.turnOrder[g.currentTurn];
  const curPlayer = lobby.players[curIdx];
  if (!curPlayer || curPlayer.isSpectator) { advanceBingoTurn(lobby, io); return; }

  // Pick random available card
  const availableCards = g.currentCards
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => !g.pickedThisRound[i]);
  if (!availableCards.length) { advanceBingoTurn(lobby, io); return; }
  const { c: card, i: cardIndex } = availableCards[Math.floor(Math.random() * availableCards.length)];

  // Find best bingo cell (matching, then any empty)
  const cardAttrs = getBingoCardAttrs(card.id);
  const grid = curPlayer.bingoGrid;
  let cellIndex = grid.findIndex(cell => cell.card === null && cardAttrs.includes(cell.attrKey));
  if (cellIndex === -1) cellIndex = grid.findIndex(cell => cell.card === null);
  if (cellIndex === -1) { advanceBingoTurn(lobby, io); return; } // no space

  applyBingoPick(lobby, cardIndex, cellIndex, curPlayer, io, true);
}

function applyBingoPick(lobby, cardIndex, cellIndex, player, io, isAuto = false) {
  const g = lobby.game;
  clearTurnTimer(lobby);

  const card = g.currentCards[cardIndex];
  g.pickedThisRound[cardIndex] = player.id;

  // Place on bingo grid
  const grid = player.bingoGrid;
  grid[cellIndex].card = card;

  // Add to deck
  player.deck = [...(player.deck || []), card];
  const lobbyPlayer = lobby.players.find(p => p.id === player.id);
  if (lobbyPlayer) {
    lobbyPlayer.deck = player.deck;
    lobbyPlayer.bingoGrid = grid;
  }

  // Check for new bingo lines
  const newLines = getNewlyCompletedLines(grid, cellIndex, player.completedLines || []);
  if (newLines.length > 0) {
    player.completedLines = [...(player.completedLines || []), ...newLines];
    player.bingoTokens = (player.bingoTokens || 0) + newLines.length;
    if (lobbyPlayer) {
      lobbyPlayer.completedLines = player.completedLines;
      lobbyPlayer.bingoTokens = player.bingoTokens;
    }
  }

  io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
  advanceBingoTurn(lobby, io);
}

function advanceBingoTurn(lobby, io) {
  const g = lobby.game;
  g.currentTurn++;

  // Check if this round is done (all active players have picked)
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const roundPickCount = Object.keys(g.pickedThisRound).length;

  if (roundPickCount >= activePlayers.length || g.currentTurn >= g.turnOrder.length) {
    // Round over
    if (g.round >= g.maxRounds) {
      endBingoDraft(lobby, io);
    } else {
      setTimeout(() => {
        if (!lobby.game || lobby.game.finished) return;
        nextBingoRound(lobby, io);
      }, 1000);
    }
    return;
  }

  io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
  startBingoTurnTimer(lobby, io);
}

function endBingoDraft(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;

  // Build token shop queue
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const queue = [];
  const maxTokens = Math.max(...activePlayers.map(p => p.bingoTokens || 0), 0);
  for (let t = 0; t < maxTokens; t++) {
    for (const p of activePlayers) {
      if ((p.bingoTokens || 0) > t) queue.push(p.id);
    }
  }

  if (queue.length === 0) {
    endBingoGame(lobby, io);
    return;
  }

  g.phase = 'tokenShop';
  g.tokenShopQueue = queue;
  g.tokenShopIdx   = 0;
  g.tokenShopSubPhase = 'picking';
  g.tokenShopLiveAction = null;
  // Jeder Spieler bekommt 2 der 3 Power-Ups zufällig zugelost — nur die darf er einsetzen
  activePlayers.forEach(p => { p.tokenAbilities = shuffle(BINGO_POWERUP_TYPES).slice(0, 2); });
  startTokenShopTimer(lobby, io); // vor dem Broadcast, damit timerRemaining bereits frisch ist
  io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
}

// Token-Shop-Timer: Wer sein Power-Up nicht rechtzeitig einsetzt, verliert den Token
function startTokenShopTimer(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.timerRemaining = lobby.tokenShopTimerSeconds ?? 60;
  g.timerInterval = setInterval(() => {
    g.timerRemaining--;
    io.to(lobby.code).emit('clash:timerTick', { remaining: g.timerRemaining });
    if (g.timerRemaining <= 0) {
      clearTurnTimer(lobby);
      skipTokenShopTurn(lobby, io);
    }
  }, 1000);
}

function skipTokenShopTurn(lobby, io) {
  const g = lobby.game;
  if (!g || g.type !== 'bingo' || g.phase !== 'tokenShop' || g.tokenShopSubPhase !== 'picking') return;
  g.tokenShopIdx++;
  g.tokenShopLiveAction = null;
  if (g.tokenShopIdx >= g.tokenShopQueue.length) { endBingoGame(lobby, io); return; }
  startTokenShopTimer(lobby, io);
  io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
}

function endBingoGame(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.phase    = 'finished';
  g.finished = true;

  if (!lobby.history) lobby.history = [];
  lobby.history.push({
    gameNum: lobby.history.length + 1,
    mode: 'bingo',
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: [...(p.deck || [])], isSpectator: p.isSpectator ?? false,
    })),
  });

  io.to(lobby.code).emit('clash:gameOver', {
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: p.deck || [], isSpectator: p.isSpectator ?? false,
    })),
  });
  notifyDraftComplete(lobby, io);
}

function applyBingoPowerup(lobby, type, params, playerId, io) {
  const g = lobby.game;
  if (g.phase !== 'tokenShop') return false;
  if (g.tokenShopQueue[g.tokenShopIdx] !== playerId) return false;

  const player = lobby.players.find(p => p.id === playerId);
  if (!player) return false;

  // Nur die dem Spieler zugelosten Power-Ups sind erlaubt
  const allowedTypes = player.tokenAbilities?.length ? player.tokenAbilities : BINGO_POWERUP_TYPES;
  if (!allowedTypes.includes(type)) return false;

  let result = { type, playerId, playerName: player.name, playerColor: player.color, playerAvatar: player.avatar || '' };

  if (type === 'swap') {
    const { myDeckIdx, targetPlayerId, theirDeckIdx } = params;
    const target = lobby.players.find(p => p.id === targetPlayerId);
    if (!target || !player.deck[myDeckIdx] || !target.deck[theirDeckIdx]) return false;
    if (player.deck[myDeckIdx]?.protected || target.deck[theirDeckIdx]?.protected) return false;
    const myCard    = player.deck[myDeckIdx];
    const theirCard = target.deck[theirDeckIdx];
    const myChamps    = player.deck.filter((c,i) => c.isChampion && i !== myDeckIdx).length;
    const theirChamps = target.deck.filter((c,i) => c.isChampion && i !== theirDeckIdx).length;
    if (theirCard.isChampion && myChamps >= 2) return false;
    if (myCard.isChampion && theirChamps >= 2) return false;
    player.deck[myDeckIdx]    = { ...theirCard, protected: true };
    target.deck[theirDeckIdx] = { ...myCard,    protected: true };
    result = { ...result, myCard, theirCard, targetPlayerName: target.name, targetPlayerColor: target.color };

  } else if (type === 'reroll') {
    const { targetPlayerId, theirDeckIdx } = params;
    const target = lobby.players.find(p => p.id === targetPlayerId);
    if (!target || !target.deck[theirDeckIdx]) return false;
    if (target.deck[theirDeckIdx]?.protected) return false;
    const oldCard = target.deck[theirDeckIdx];
    const pickedIds = new Set(lobby.players.flatMap(p => (p.deck||[]).map(c => c.id)));
    const champCount = target.deck.filter((c,i) => c.isChampion && i !== theirDeckIdx).length;
    const cardPool = getCardPool(lobby);
    let pool = cardPool.filter(c => !pickedIds.has(c.id) && !(c.isChampion && champCount >= 2));
    if (!pool.length) pool = cardPool.filter(c => !(c.isChampion && champCount >= 2));
    if (!pool.length) pool = ALL_CARDS.filter(c => !(c.isChampion && champCount >= 2));
    const newCard = pool[Math.floor(Math.random() * pool.length)];
    target.deck[theirDeckIdx] = { ...newCard, protected: true };
    result = { ...result, oldCard, newCard, targetPlayerName: target.name, targetPlayerColor: target.color };

  } else if (type === 'joker') {
    const { myDeckIdx, newCardId } = params;
    if (!player.deck[myDeckIdx]) return false;
    if (player.deck[myDeckIdx]?.protected) return false;
    const newCard = getCardPool(lobby).find(c => c.id === newCardId);
    if (!newCard) return false;
    const pickedIds = new Set(lobby.players.flatMap(p => (p.deck||[]).map(c => c.id)));
    if (pickedIds.has(newCardId)) return false;
    const champCount = player.deck.filter((c,i) => c.isChampion && i !== myDeckIdx).length;
    if (newCard.isChampion && champCount >= 2) return false;
    const oldCard = player.deck[myDeckIdx];
    player.deck[myDeckIdx] = { ...newCard, protected: true };
    result = { ...result, oldCard, newCard };
  } else {
    return false;
  }

  // Reveal phase: broadcast what happened, then advance after 5s
  clearTurnTimer(lobby);
  g.tokenShopSubPhase = 'revealing';
  g.tokenShopLiveAction = null;
  g.lastPowerupResult = result;
  io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));

  setTimeout(() => {
    if (!lobby.game || lobby.game.phase !== 'tokenShop') return;
    g.tokenShopIdx++;
    g.tokenShopSubPhase = 'picking';
    g.lastPowerupResult = null;
    if (g.tokenShopIdx >= g.tokenShopQueue.length) {
      endBingoGame(lobby, io);
    } else {
      startTokenShopTimer(lobby, io);
      io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
    }
  }, 5000);

  return true;
}

registerMode({
  id: 'bingo',
  gameType: 'bingo',
  settings: {
    tokenShopTimerSeconds: {
      default: 60,
      event: 'clash:setTokenShopTimer',
      payloadKey: 'seconds',
      sanitize: (v) => Math.max(10, Math.min(300, Number(v) || 60)),
    },
  },
  // 8 Runden × Karten pro Runde (mind. 1 pro aktivem Spieler)
  requiredPool: (lobby, active) => 8 * Math.max(active, lobby.cardsPerRound || active),
  start: (lobby, io) => startBingoRoyale(lobby, io),
  buildState: (lobby) => ({ event: 'clash:bingo:state', payload: buildBingoState(lobby) }),
  remapPlayerId: (game, oldId, newId) => {
    if (Array.isArray(game.tokenShopQueue)) game.tokenShopQueue = game.tokenShopQueue.map(id => (id === oldId ? newId : id));
    Object.keys(game.pickedThisRound || {}).forEach(k => { if (game.pickedThisRound[k] === oldId) game.pickedThisRound[k] = newId; });
    if (game.tokenShopLiveAction?.playerId === oldId) game.tokenShopLiveAction.playerId = newId;
    if (game.lastPowerupResult?.playerId === oldId) game.lastPowerupResult.playerId = newId;
  },
  onPlayerLeft: (lobby, io, playerId) => {
    const g = lobby.game;
    if (g.phase === 'tokenShop') {
      const wasCurrent = g.tokenShopQueue[g.tokenShopIdx] === playerId && g.tokenShopSubPhase === 'picking';
      // Künftige Tokens des Spielers verfallen
      g.tokenShopQueue = g.tokenShopQueue.filter((id, i) => i <= g.tokenShopIdx || id !== playerId);
      if (wasCurrent) { clearTurnTimer(lobby); skipTokenShopTurn(lobby, io); }
      else io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
    } else {
      const curIdx = g.turnOrder?.[g.currentTurn];
      if (lobby.players[curIdx]?.id === playerId) autoAdvanceBingo(lobby, io);
      else io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
    }
  },
  onPlayerDisconnected: (lobby, io, playerId) => {
    const curIdx = lobby.game.turnOrder?.[lobby.game.currentTurn];
    if (lobby.players[curIdx]?.id === playerId) autoAdvanceBingo(lobby, io);
  },
  socketHandlers: {
    // ── Bingo events ───────────────────────────────────────────────────────────
    'clash:bingo:pick': ({ socket, io }, { code, cardIndex, bingoCell }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'bingo' || lobby.game.phase !== 'draft') return;
      const g = lobby.game;
      const curIdx    = g.turnOrder[g.currentTurn];
      const curPlayer = lobby.players[curIdx];
      if (curPlayer?.id !== socket.id) return;
      if (typeof cardIndex !== 'number' || cardIndex < 0 || cardIndex >= g.currentCards.length) return;
      if (g.pickedThisRound[cardIndex]) return emitClashError(socket, 'cardAlreadyPicked');
      if (typeof bingoCell !== 'number' || bingoCell < 0 || bingoCell >= 16) return;
      if (curPlayer.bingoGrid[bingoCell]?.card !== null) return emitClashError(socket, 'cellOccupied');

      // Champion limit
      const card = g.currentCards[cardIndex];
      const champCount = (curPlayer.deck || []).filter(c => c.isChampion).length;
      if (card.isChampion && champCount >= 2) return emitClashError(socket, 'championLimit');

      // Attribute check: if card matches ANY bingo cell attr, player must place it on a matching cell
      const cardAttrs = getBingoCardAttrs(card.id);
      const hasFreeMatchingCell = curPlayer.bingoGrid.some((cell, ci) =>
        cell.card === null && cardAttrs.includes(cell.attrKey) && ci !== bingoCell
      );
      const chosenCellAttr = curPlayer.bingoGrid[bingoCell].attrKey;
      const chosenCellMatches = cardAttrs.includes(chosenCellAttr);

      // If there is a matching empty cell and the chosen cell does NOT match → reject
      const anyMatchingEmpty = curPlayer.bingoGrid.some(cell => cell.card === null && cardAttrs.includes(cell.attrKey));
      if (anyMatchingEmpty && !chosenCellMatches) {
        return emitClashError(socket, 'attributeCellRequired');
      }

      applyBingoPick(lobby, cardIndex, bingoCell, curPlayer, io, false);
    },

    'clash:bingo:powerup': ({ socket, io }, { code, type, ...params }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'bingo') return;
      const ok = applyBingoPowerup(lobby, type, params, socket.id, io);
      if (!ok) emitClashError(socket, 'invalidPowerup');
    },

    // Live-Übertragung: der aktive Token-Spieler teilt jeden Auswahl-Schritt mit allen,
    // damit die anderen statt eines Wartebildschirms live zusehen können
    'clash:bingo:tokenAction': ({ socket, io }, { code, step, ability, cardId }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'bingo') return;
      const g = lobby.game;
      if (g.phase !== 'tokenShop' || g.tokenShopSubPhase !== 'picking') return;
      if (g.tokenShopQueue[g.tokenShopIdx] !== socket.id) return;
      g.tokenShopLiveAction = {
        playerId: socket.id,
        step:    typeof step === 'string' ? step.slice(0, 24) : null,
        ability: BINGO_POWERUP_TYPES.includes(ability) ? ability : null,
        cardId:  typeof cardId === 'string' ? cardId.slice(0, 40) : null,
      };
      io.to(code).emit('clash:bingo:state', buildBingoState(lobby));
    },

    'clash:bingo:requestState': ({ socket, io }, { code }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'bingo') return;
      socket.emit('clash:bingo:state', buildBingoState(lobby));
    },
  },
});
