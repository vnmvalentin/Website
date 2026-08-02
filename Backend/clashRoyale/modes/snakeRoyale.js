// ── Snake Royale ─────────────────────────────────────────────────────────────
// Karten liegen in einem n×n-Raster. Gewählt werden darf nur, was direkt an die zuletzt
// gewählte Karte angrenzt — die "Schlange" wandert also durchs Raster. Die Zugreihenfolge
// ist ein Snake-Draft; hat niemand mehr einen gültigen Zug, wird der Schlangenkopf freigegeben.

const { getCardPool } = require('../core/cards');
const { lobbies, shuffle, sanitizeLobby } = require('../core/lobbies');
const { clearTurnTimer, startTurnTimer } = require('../core/timers');
const { notifyDraftComplete } = require('../core/streamerFeed');
const { registerMode } = require('../core/registry');
const { emitClashError } = require('../core/errors');

function getAdjacentIndices(idx, cols, totalCells) {
  const col = idx % cols;
  const adj = [];
  if (idx - cols >= 0)         adj.push(idx - cols);
  if (idx + cols < totalCells) adj.push(idx + cols);
  if (col > 0)                 adj.push(idx - 1);
  if (col < cols - 1)          adj.push(idx + 1);
  return adj;
}

// Valid cells adjacent to last pick (or all cells if snake just started/reset)
function getValidCells(game, player) {
  const champCount = (player.deck || []).filter(c => c.isChampion).length;
  const candidates = game.lastPickedCellIndex === null
    ? Array.from({ length: game.grid.length }, (_, i) => i)
    : getAdjacentIndices(game.lastPickedCellIndex, game.gridCols, game.grid.length);
  return candidates.filter(idx =>
    game.grid[idx]?.pickedBy === null &&
    !(game.grid[idx].card.isChampion && champCount >= 2)
  );
}

// Any remaining unpicked cell (used after a snake reset)
function getAnyValidCells(game, player) {
  const champCount = (player.deck || []).filter(c => c.isChampion).length;
  return Array.from({ length: game.grid.length }, (_, i) => i).filter(idx =>
    game.grid[idx]?.pickedBy === null &&
    !(game.grid[idx].card.isChampion && champCount >= 2)
  );
}

function buildGameState(lobby) {
  const g = lobby.game;
  return {
    grid: g.grid.map(c => ({ card: c.card, pickedBy: c.pickedBy, pickOrder: c.pickOrder })),
    gridCols: g.gridCols,
    gridRows: g.gridRows,
    currentTurn: g.currentTurn,
    turnOrder: g.turnOrder,
    lastPickedCellIndex: g.lastPickedCellIndex,
    timerRemaining: g.timerRemaining,
    timerSeconds: lobby.timerSeconds,
    finished: g.finished,
    totalTurns: g.turnOrder.length,
    isSnakeReset: g.isSnakeReset,   // tells frontend the snake just restarted
  };
}

// ── Turn logic ─────────────────────────────────────────────────────────────
function endGame(lobby, io) {
  clearTurnTimer(lobby);
  lobby.game.finished = true;
  if (!lobby.history) lobby.history = [];
  lobby.history.push({
    gameNum: lobby.history.length + 1,
    mode: 'snake',
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: [...(p.deck || [])], isSpectator: p.isSpectator ?? false })),
  });
  io.to(lobby.code).emit('clash:gameState', buildGameState(lobby));
  io.to(lobby.code).emit('clash:gameOver', {
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: p.deck || [], isSpectator: p.isSpectator ?? false })),
  });
  notifyDraftComplete(lobby, io);
}

// wasSkip=true → player had no valid move and turn was skipped without picking
function advanceTurn(lobby, io, wasSkip = false) {
  const game = lobby.game;

  if (wasSkip) {
    game.consecutiveSkips = (game.consecutiveSkips || 0) + 1;
    // All players exhausted at current snake head → reset to new position
    if (game.consecutiveSkips >= lobby.players.length) {
      game.lastPickedCellIndex = null;
      game.consecutiveSkips   = 0;
      game.isSnakeReset       = true;
    }
  } else {
    game.consecutiveSkips = 0;
    game.isSnakeReset     = false;
  }

  game.currentTurn++;
  if (game.currentTurn >= game.turnOrder.length) { endGame(lobby, io); return; }
  if (game.grid.filter(c => c.pickedBy === null).length === 0) { endGame(lobby, io); return; }

  // Sofort Schlangenkopf freigeben falls der aktive Spieler keinen gültigen Zug hat —
  // kein langes Durchlaufen aller Spieler nötig
  if (game.lastPickedCellIndex !== null) {
    const curIdx    = game.turnOrder[game.currentTurn];
    const curPlayer = lobby.players[curIdx];
    if (curPlayer) {
      const valid = getValidCells(game, curPlayer);
      if (valid.length === 0) {
        game.lastPickedCellIndex = null;
        game.consecutiveSkips   = 0;
        game.isSnakeReset       = true;
      }
    }
  }

  io.to(lobby.code).emit('clash:gameState', buildGameState(lobby));
  startTurnTimer(lobby, io);
}

function applyPick(lobby, cellIndex, player, io) {
  const game = lobby.game;
  clearTurnTimer(lobby);

  const cell = game.grid[cellIndex];
  cell.pickedBy  = player.id;
  cell.pickOrder = game.currentTurn;
  player.deck    = [...(player.deck || []), cell.card];
  game.lastPickedCellIndex = cellIndex;
  game.isSnakeReset        = false;

  const lobbyPlayer = lobby.players.find(p => p.id === player.id);
  if (lobbyPlayer) lobbyPlayer.deck = player.deck;

  io.to(lobby.code).emit('clash:cardPicked', {
    cellIndex, playerId: player.id, playerColor: player.color, card: cell.card,
  });
  io.to(lobby.code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));

  advanceTurn(lobby, io, false);
}

// Timer expired: auto-pick a random valid card; if stuck → new snake head
function autoAdvanceTurn(lobby, io) {
  const game = lobby.game;
  const currentPlayerIdx = game.turnOrder[game.currentTurn];
  const currentPlayer    = lobby.players[currentPlayerIdx];
  if (!currentPlayer) { advanceTurn(lobby, io, true); return; }

  let valid = getValidCells(game, currentPlayer);

  if (valid.length === 0) {
    // No adjacent valid cells → skip this player, keep snake head for others
    advanceTurn(lobby, io, true);
    return;
  }

  applyPick(lobby, valid[Math.floor(Math.random() * valid.length)], currentPlayer, io);
}

// ── Snake Royale init ──────────────────────────────────────────────────────
function startSnakeRoyale(lobby, io) {
  const size       = Math.max(7, Math.min(11, lobby.gridSize || 11));
  const totalCells = size * size;
  const cards = shuffle(getCardPool(lobby)).slice(0, totalCells);
  const grid  = cards.map(card => ({ card, pickedBy: null, pickOrder: null }));

  // Only active (non-spectator) players participate in turn order
  const activeIndices = lobby.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.isSpectator)
    .map(({ i }) => i);
  const playerOrder = shuffle(activeIndices);
  const turnOrder   = [];
  for (let r = 0; r < 8; r++) turnOrder.push(...playerOrder);

  lobby.players.forEach(p => { p.deck = []; });
  lobby.game = {
    grid,
    gridCols: size,
    gridRows: size,
    turnOrder,
    currentTurn: 0,
    lastPickedCellIndex: null,
    timerRemaining: lobby.timerSeconds,
    timerInterval: null,
    finished: false,
    consecutiveSkips: 0,
    isSnakeReset: false,
  };

  io.to(lobby.code).emit('clash:gameStart', { mode: 'snake' });
  io.to(lobby.code).emit('clash:gameState', buildGameState(lobby));
  startTurnTimer(lobby, io);
}

registerMode({
  id: 'snake',
  // Snake setzt historisch kein game.type — die Registry fällt darauf zurück
  settings: {
    gridSize: {
      default: 11,
      event: 'clash:setGridSize',
      payloadKey: 'size',
      sanitize: (v, lobby) => {
        const s = Math.max(7, Math.min(11, Number(v) || 11));
        if (s * s > getCardPool(lobby).length) return undefined; // Pool reicht für dieses Raster nicht
        return s;
      },
    },
  },
  requiredPool: (lobby) => {
    const s = Math.max(7, Math.min(11, lobby.gridSize || 11));
    return s * s;
  },
  start: (lobby, io) => startSnakeRoyale(lobby, io),
  buildState: (lobby) => ({ event: 'clash:gameState', payload: buildGameState(lobby) }),
  remapPlayerId: (game, oldId, newId) => {
    if (Array.isArray(game.grid)) game.grid.forEach(c => { if (c.pickedBy === oldId) c.pickedBy = newId; });
  },
  onTimerExpire: (lobby, io) => autoAdvanceTurn(lobby, io),
  onPlayerLeft: (lobby, io, playerId) => {
    const curIdx = lobby.game.turnOrder?.[lobby.game.currentTurn];
    if (curIdx !== undefined && lobby.players[curIdx]?.id === playerId) autoAdvanceTurn(lobby, io);
  },
  onPlayerDisconnected: (lobby, io, playerId) => {
    const curIdx = lobby.game.turnOrder?.[lobby.game.currentTurn];
    if (curIdx !== undefined && lobby.players[curIdx]?.id === playerId) autoAdvanceTurn(lobby, io);
  },
  socketHandlers: {
    'clash:pickCard': ({ socket, io }, { code, cellIndex }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || !lobby.started || lobby.game.finished) return;

      const game = lobby.game;
      const currentPlayerIdx = game.turnOrder[game.currentTurn];
      const currentPlayer    = lobby.players[currentPlayerIdx];
      if (currentPlayer?.id !== socket.id) return;
      if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex >= game.grid.length) return;
      if (game.grid[cellIndex].pickedBy !== null) return;

      // Adjacency check
      if (game.lastPickedCellIndex !== null) {
        const adj = getAdjacentIndices(game.lastPickedCellIndex, game.gridCols, game.grid.length);
        if (!adj.includes(cellIndex))
          return emitClashError(socket, 'cardNotAdjacent');
      }

      // Champion-limit check
      const champCount = (currentPlayer.deck || []).filter(c => c.isChampion).length;
      if (game.grid[cellIndex].card.isChampion && champCount >= 2)
        return emitClashError(socket, 'championLimit');

      applyPick(lobby, cellIndex, currentPlayer, io);
    },
  },
});
