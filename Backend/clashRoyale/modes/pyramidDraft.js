// ── Pyramidendraft ───────────────────────────────────────────────────────────
// Eine Pyramide aus Karten: nur die unterste Reihe liegt offen, alles darüber verdeckt.
// Ein verdecktes Feld wird erst sichtbar, wenn BEIDE Felder direkt darunter (seine "Stützen")
// aus dem Spiel sind — gepickt oder blockiert. Sequenzielles Draften (ein Spieler nach dem
// anderen), Reihenfolge wechselt pro Runde wie bei Bingo Royale (fairer Snake-Draft). Nach
// jeder Runde werden zusätzlich `blocksPerRound` zufällige offene, noch ungewählte Karten
// blockiert — sie zählen für die Freilegung als entfernt, kann aber niemand mehr picken. Das
// bringt mehr Karten zum Vorschein, ohne dass dafür mehr Spielerzüge nötig wären.

const { getCardPool } = require('../core/cards');
const { lobbies, shuffle } = require('../core/lobbies');
const { clearTurnTimer, startTurnTimer } = require('../core/timers');
const { notifyDraftComplete } = require('../core/streamerFeed');
const { registerMode } = require('../core/registry');
const { emitClashError } = require('../core/errors');

const PYRAMID_MAX_ROUNDS = 8;
const PYRAMID_BLOCK_OPTIONS = [0, 1, 2, 3];
const PYRAMID_BLOCK_DEFAULT = 1;
// Wie viele Reihen der Host oberhalb des rechnerischen Minimums zusätzlich wählen darf —
// mehr Puffer, aber auch weniger Aussicht, die Spitze wirklich freizulegen.
const PYRAMID_ROWS_HEADROOM = 8;
// Pause zwischen dem letzten Pick einer Runde und der Blockade, damit sich beide Animationen
// (Aufdecken durch den Pick, dann die Blockade) nicht überlagern.
const PYRAMID_BLOCK_DELAY_MS = 1300;

// Kleinste Dreieckszahl n(n+1)/2, die für die ganze Partie reicht: pro Runde werden `active`
// Karten gepickt PLUS `blocksPerRound` blockiert, macht 8 × (active + blocksPerRound) Felder
// insgesamt — das ist zugleich die Option, die am ehesten bis zur Spitze durchkommt (kein
// ungenutzter Puffer).
function pyramidRowsFor(active, blocksPerRound = PYRAMID_BLOCK_DEFAULT) {
  const needed = PYRAMID_MAX_ROUNDS * (Math.max(1, active) + blocksPerRound);
  let n = 1, total = 1;
  while (total < needed) { n++; total += n; }
  return n;
}
function pyramidTotalCells(active, blocksPerRound = PYRAMID_BLOCK_DEFAULT) {
  const n = pyramidRowsFor(active, blocksPerRound);
  return (n * (n + 1)) / 2;
}

const pyramidActivePlayers = (lobby) => lobby.players.filter(p => !p.isSpectator && !p.left);

const resolvedBlocksPerRound = (lobby) =>
  (PYRAMID_BLOCK_OPTIONS.includes(lobby.pyramidBlocksPerRound) ? lobby.pyramidBlocksPerRound : PYRAMID_BLOCK_DEFAULT);

// Vom Host gewählte Reihenzahl, geklemmt auf [rechnerisches Minimum, Minimum + Puffer] — auch
// wenn seitdem mehr Spieler beigetreten sind und der gespeicherte Wert nicht mehr reichen
// würde, startet die Partie dadurch trotzdem sicher (nie ein Absturz, höchstens mehr Reihen
// als zuletzt eingestellt).
function resolvedPyramidRows(lobby, active) {
  const blocks = resolvedBlocksPerRound(lobby);
  const minRows = pyramidRowsFor(active, blocks);
  const chosen = Number.isInteger(lobby.pyramidRows) ? lobby.pyramidRows : minRows;
  return Math.max(minRows, Math.min(minRows + PYRAMID_ROWS_HEADROOM, chosen));
}

// Snake-Draft: pro Rundenpaar hin + zurück (fair), Spielerreihenfolge wird für jedes Paar neu
// gemischt, damit niemand in jedem Paar "Spieler 1" ist. 1:1 aus bingoRoyale.js übernommen.
function generateSnakeDraftOrder(playerIndices, numRounds) {
  const order = [];
  let current = playerIndices;
  for (let r = 0; r < numRounds; r++) {
    if (r % 2 === 0) current = shuffle(playerIndices);
    order.push(...(r % 2 === 0 ? current : [...current].reverse()));
  }
  return order;
}

// Reihe 0 = unten (am breitesten, von Anfang an aufgedeckt), Reihe n-1 = Spitze (1 Feld).
// Feld (r,c) mit r≥1 wird von (r-1,c) und (r-1,c+1) gestützt — der Reihe direkt darunter,
// die genau ein Feld mehr hat.
function buildPyramid(cards, n) {
  const pyramid = [];
  let idx = 0;
  for (let r = 0; r < n; r++) {
    const width = n - r;
    const row = [];
    for (let c = 0; c < width; c++) {
      row.push({ card: cards[idx++], pickedBy: null, blocked: false, revealed: r === 0 });
    }
    pyramid.push(row);
  }
  return pyramid;
}

// Setzt revealed=true für jedes Feld, dessen beide Stützen entfernt sind, und gibt zurück,
// WELCHE Felder dabei neu aufgedeckt wurden — der Client animiert genau diese (Umdrehen),
// statt raten zu müssen, was sich seit dem letzten Zustand geändert hat. Nur additiv (ein
// einmal aufgedecktes Feld wird nie wieder verdeckt).
function recomputeRevealsTracked(pyramid) {
  const newly = [];
  for (let r = 1; r < pyramid.length; r++) {
    const below = pyramid[r - 1];
    pyramid[r].forEach((cell, c) => {
      if (cell.revealed) return;
      const left = below[c], right = below[c + 1];
      const cleared = (s) => s.pickedBy !== null || s.blocked;
      if (cleared(left) && cleared(right)) { cell.revealed = true; newly.push({ r, c }); }
    });
  }
  return newly;
}

// Sperrt bis zu `count` zufällige offene, noch ungewählte Felder — jedes zählt danach wie ein
// Pick für die Freilegung der Reihe darüber, landet aber bei niemandem im Deck. Blockiert wird
// IMMER nur aus der niedrigsten Reihe, die noch offene, ungewählte Felder hat — das räumt die
// Pyramide geordnet von unten nach oben frei, statt zufällig eine bereits weiter oben
// aufgedeckte (und damit oft attraktivere) Karte zu sperren, die eigentlich noch im Rennen
// bleiben soll. Gibt ein Ereignis für die Blockier-Animation zurück (welche Felder gesperrt
// wurden, welche dadurch neu aufgedeckt wurden) oder null, wenn nichts mehr offen war.
function blockCellsWithEvent(pyramid, count) {
  const blockedCells = [];
  let revealed = [];
  for (let i = 0; i < count; i++) {
    let candidates = [];
    for (let r = 0; r < pyramid.length; r++) {
      pyramid[r].forEach((cell, c) => {
        if (cell.revealed && cell.pickedBy === null && !cell.blocked) candidates.push({ r, c, cell });
      });
      if (candidates.length) break; // niedrigste Reihe mit Kandidaten gefunden — nicht weiter nach oben suchen
    }
    if (!candidates.length) break;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    pick.cell.blocked = true;
    blockedCells.push({ r: pick.r, c: pick.c });
    revealed = revealed.concat(recomputeRevealsTracked(pyramid));
  }
  if (!blockedCells.length) return null;
  return { type: 'block', cells: blockedCells, revealed };
}

function buildPyramidState(lobby) {
  const g = lobby.game;
  const active = pyramidActivePlayers(lobby);
  const currentIdx = g.turnOrder[g.currentTurn];
  const currentPlayer = currentIdx !== undefined ? lobby.players[currentIdx] : null;
  return {
    type: 'pyramid-draft',
    round: Math.min(g.maxRounds, Math.floor(g.currentTurn / Math.max(1, active.length)) + 1),
    maxRounds: g.maxRounds,
    phase: g.phase || 'picking',
    lastEvent: g.lastEvent || null,
    currentPlayerId: (g.finished || g.phase === 'blocking') ? null : (currentPlayer?.id ?? null),
    timerRemaining: g.timerRemaining,
    timerSeconds: lobby.timerSeconds,
    finished: g.finished,
    deckSize: 8,
    rows: g.pyramid.map(row => row.map(cell => ({
      cardId: cell.revealed ? cell.card.id : null,
      name: cell.revealed ? cell.card.name : null,
      rarity: cell.revealed ? cell.card.rarity : null,
      isChampion: cell.revealed ? cell.card.isChampion : false,
      revealed: cell.revealed,
      pickedBy: cell.pickedBy,
      blocked: cell.blocked,
    }))),
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: p.deck || [], isSpectator: p.isSpectator ?? false,
    })),
  };
}

function broadcastPyramidState(lobby, io) {
  io.to(lobby.code).emit('clash:pyramid:state', buildPyramidState(lobby));
}

function endPyramidGame(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.finished = true;
  if (!lobby.history) lobby.history = [];
  lobby.history.push({
    gameNum: lobby.history.length + 1,
    mode: 'pyramid-draft',
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: [...(p.deck || [])], isSpectator: p.isSpectator ?? false })),
  });
  broadcastPyramidState(lobby, io);
  io.to(lobby.code).emit('clash:gameOver', {
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: p.deck || [], isSpectator: p.isSpectator ?? false })),
  });
  notifyDraftComplete(lobby, io);
}

// Alle noch pickbaren Felder (aufgedeckt, frei, nicht blockiert) — respektiert optional das
// Champion-Limit des übergebenen Spielers.
function pickableCells(pyramid, player) {
  const champCount = player ? (player.deck || []).filter(c => c.isChampion).length : 0;
  const out = [];
  pyramid.forEach((row, r) => row.forEach((cell, c) => {
    if (!cell.revealed || cell.pickedBy !== null || cell.blocked) return;
    if (cell.card.isChampion && champCount >= 2) return;
    out.push({ r, c, cell });
  }));
  return out;
}

function applyPick(lobby, io, player, r, c) {
  const g = lobby.game;
  const cell = g.pyramid[r][c];
  cell.pickedBy = player.id;
  player.deck = [...(player.deck || []), cell.card];
  const lobbyPlayer = lobby.players.find(p => p.id === player.id);
  if (lobbyPlayer) lobbyPlayer.deck = player.deck;
  const revealed = recomputeRevealsTracked(g.pyramid);
  advanceTurn(lobby, io, { type: 'pick', cells: [{ r, c }], playerId: player.id, revealed });
}

// Zug weiterschalten. Am Rundenende: sofort den Pick zeigen (Phase 'blocking' friert die
// Eingabe ein, aber ohne den Zug schon zu wechseln), nach einer kurzen Pause die Blockade(n)
// anwenden und erst DANN die nächste Runde starten — sonst überlagern sich die Animationen.
function advanceTurn(lobby, io, pickEvent) {
  const g = lobby.game;
  clearTurnTimer(lobby);
  g.currentTurn++;

  const active = pyramidActivePlayers(lobby);
  const roundOver = active.length > 0 && g.currentTurn % active.length === 0;
  const gameOver = g.currentTurn >= g.turnOrder.length;

  g.phase = roundOver ? 'blocking' : 'picking';
  g.lastEvent = pickEvent;
  broadcastPyramidState(lobby, io);

  if (!roundOver) { startTurnTimer(lobby, io); return; }

  setTimeout(() => {
    const l = lobbies.get(lobby.code);
    if (!l?.game || l.game !== g || g.finished) return;
    g.lastEvent = blockCellsWithEvent(g.pyramid, g.blocksPerRound);
    g.phase = 'picking';
    broadcastPyramidState(lobby, io);
    if (gameOver) endPyramidGame(lobby, io);
    else startTurnTimer(lobby, io);
  }, PYRAMID_BLOCK_DELAY_MS);
}

// Timer abgelaufen (oder aktiver Spieler weg): zufälliges gültiges Feld für ihn, sonst Zug
// überspringen (z.B. nur noch Champions bei vollem Limit übrig) — wie Snake Royale.
function autoAdvance(lobby, io) {
  const g = lobby.game;
  const idx = g.turnOrder[g.currentTurn];
  const player = lobby.players[idx];
  if (!player) { advanceTurn(lobby, io, null); return; }
  const options = pickableCells(g.pyramid, player);
  if (!options.length) { advanceTurn(lobby, io, null); return; }
  const { r, c } = options[Math.floor(Math.random() * options.length)];
  applyPick(lobby, io, player, r, c);
}

function startPyramidDraft(lobby, io) {
  const active = pyramidActivePlayers(lobby);
  const blocksPerRound = resolvedBlocksPerRound(lobby);
  const n = resolvedPyramidRows(lobby, active.length);
  const cards = shuffle(getCardPool(lobby)).slice(0, (n * (n + 1)) / 2);
  const pyramid = buildPyramid(cards, n);

  const activeIndices = lobby.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.isSpectator && !p.left)
    .map(({ i }) => i);
  const turnOrder = generateSnakeDraftOrder(activeIndices, PYRAMID_MAX_ROUNDS);

  lobby.players.forEach(p => { p.deck = []; });
  lobby.game = {
    type: 'pyramid-draft',
    rows: n,
    blocksPerRound,
    pyramid,
    turnOrder,
    currentTurn: 0,
    maxRounds: PYRAMID_MAX_ROUNDS,
    phase: 'picking',
    lastEvent: null,
    timerRemaining: lobby.timerSeconds,
    timerInterval: null,
    finished: false,
  };

  io.to(lobby.code).emit('clash:gameStart', { mode: 'pyramid-draft' });
  broadcastPyramidState(lobby, io);
  startTurnTimer(lobby, io);
}

registerMode({
  id: 'pyramid-draft',
  gameType: 'pyramid-draft',
  settings: {
    pyramidBlocksPerRound: {
      default: PYRAMID_BLOCK_DEFAULT,
      event: 'clash:setPyramidBlocks',
      payloadKey: 'count',
      sanitize: (v) => (PYRAMID_BLOCK_OPTIONS.includes(Number(v)) ? Number(v) : undefined),
    },
    pyramidRows: {
      default: 7,
      event: 'clash:setPyramidRows',
      payloadKey: 'rows',
      // Geklemmt statt abgelehnt (wie Snakes gridSize) — das rechnerische Minimum hängt von
      // der AKTUELLEN Spielerzahl und Blockrate ab, beides schon in der Lobby bekannt.
      sanitize: (v, lobby) => {
        const n = Math.round(Number(v));
        if (!Number.isFinite(n)) return undefined;
        const minRows = pyramidRowsFor(pyramidActivePlayers(lobby).length, resolvedBlocksPerRound(lobby));
        return Math.max(minRows, Math.min(minRows + PYRAMID_ROWS_HEADROOM, n));
      },
    },
  },
  requiredPool: (lobby, active) => {
    const n = resolvedPyramidRows(lobby, active);
    return (n * (n + 1)) / 2;
  },
  start: (lobby, io) => startPyramidDraft(lobby, io),
  buildState: (lobby) => ({ event: 'clash:pyramid:state', payload: buildPyramidState(lobby) }),
  remapPlayerId: (game, oldId, newId) => {
    (game.pyramid || []).forEach(row => row.forEach(cell => { if (cell.pickedBy === oldId) cell.pickedBy = newId; }));
  },
  onTimerExpire: (lobby, io) => autoAdvance(lobby, io),
  onPlayerLeft: (lobby, io, playerId) => {
    const idx = lobby.game.turnOrder?.[lobby.game.currentTurn];
    if (idx !== undefined && lobby.players[idx]?.id === playerId && lobby.game.phase === 'picking') autoAdvance(lobby, io);
  },
  onPlayerDisconnected: (lobby, io, playerId) => {
    const idx = lobby.game.turnOrder?.[lobby.game.currentTurn];
    if (idx !== undefined && lobby.players[idx]?.id === playerId && lobby.game.phase === 'picking') autoAdvance(lobby, io);
  },
  socketHandlers: {
    'clash:pyramid:pick': ({ socket, io }, { code, row, col }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'pyramid-draft' || !lobby.started || lobby.game.finished) return;
      const g = lobby.game;
      if (g.phase !== 'picking') return; // Rundenwechsel/Blockade läuft gerade
      const idx = g.turnOrder[g.currentTurn];
      const currentPlayer = lobby.players[idx];
      if (currentPlayer?.id !== socket.id) return;
      const r = Number(row), c = Number(col);
      const cell = g.pyramid[r]?.[c];
      if (!cell || !cell.revealed || cell.pickedBy !== null || cell.blocked) return;
      const champCount = (currentPlayer.deck || []).filter(card => card.isChampion).length;
      if (cell.card.isChampion && champCount >= 2) return emitClashError(socket, 'championLimit');
      applyPick(lobby, io, currentPlayer, r, c);
    },
  },
});

module.exports = { pyramidRowsFor, pyramidTotalCells, resolvedPyramidRows, resolvedBlocksPerRound };
