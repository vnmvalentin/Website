// backend/routes/connect4Routes.js
// Connect4 (Vier Gewinnt): 7x6-Feld, zwei Spieler treten per Link-Code bei und setzen
// abwechselnd. Server-autoritativ über Socket.io, State lebt komplett im Speicher —
// Partien sind kurzlebig (analog zu den Clash-Royale-Lobbys / der adVentures-Arena).

const ROWS = 6;
const COLS = 7;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne I/O/0/1 (Verwechslungsgefahr)
const RECONNECT_GRACE_MS = 2 * 60 * 1000; // 2 Minuten Gnadenfrist bei Disconnect
const STALE_SWEEP_MS = 5 * 60 * 1000;
const STALE_AFTER_MS = 30 * 60 * 1000; // Partie ohne verbundene Spieler/Zuschauer wird entfernt

const games = new Map(); // code -> game
const socketIndex = new Map(); // socket.id -> { code, role: "player" | "spectator", slot }

function generateCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (games.has(code));
  return code;
}

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

// Reihe 0 = oben, Reihe ROWS-1 = unten — Stein fällt bis zur ersten belegten Zelle.
function dropDisc(board, col, player) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) {
      board[r][col] = player;
      return r;
    }
  }
  return -1;
}

function findWin(board, row, col, player) {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of dirs) {
    const cells = [[row, col]];
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
      cells.push([r, c]);
      r += dr; c += dc;
    }
    r = row - dr; c = col - dc;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
      cells.push([r, c]);
      r -= dr; c -= dc;
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

function isFull(board) {
  return board[0].every((v) => v !== 0);
}

function otherSlot(slot) {
  return slot === 1 ? 2 : 1;
}

function newGame(code) {
  return {
    code,
    board: emptyBoard(),
    turn: 1,
    status: "waiting", // waiting | playing | finished
    winner: 0, // 0 = keiner, 1/2 = Spieler, 3 = Unentschieden
    winningCells: [],
    players: { 1: null, 2: null },
    spectators: new Map(), // socket.id -> name
    rematch: { 1: false, 2: false },
    startingSlot: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function sanitize(game) {
  return {
    code: game.code,
    board: game.board,
    turn: game.turn,
    status: game.status,
    winner: game.winner,
    winningCells: game.winningCells,
    players: {
      1: game.players[1] ? { name: game.players[1].name, connected: game.players[1].connected } : null,
      2: game.players[2] ? { name: game.players[2].name, connected: game.players[2].connected } : null,
    },
    rematch: game.rematch,
    spectatorCount: game.spectators.size,
  };
}

function broadcast(io, game) {
  game.updatedAt = Date.now();
  io.to(game.code).emit("c4:state", sanitize(game));
}

// Löscht die Partie, wenn niemand mehr da ist — sonst normaler Broadcast.
function broadcastOrCleanup(io, game) {
  if (!game.players[1] && !game.players[2] && game.spectators.size === 0) {
    games.delete(game.code);
    return;
  }
  broadcast(io, game);
}

function clearDisconnectTimer(player) {
  if (player?.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }
}

function startIfReady(game) {
  if (game.status === "waiting" && game.players[1] && game.players[2]) {
    game.status = "playing";
  }
}

function resetForRematch(game) {
  game.board = emptyBoard();
  game.winner = 0;
  game.winningCells = [];
  game.rematch = { 1: false, 2: false };
  game.startingSlot = otherSlot(game.startingSlot);
  game.turn = game.startingSlot;
  game.status = game.players[1] && game.players[2] ? "playing" : "waiting";
}

// Ein Sitzplatz wird frei (verlassen oder Reconnect-Timeout abgelaufen) — Partie
// geht zurück in den Wartezustand, damit ein neuer Mitspieler über den Link einsteigen kann.
function freeSlot(game, slot) {
  clearDisconnectTimer(game.players[slot]);
  game.players[slot] = null;
  game.board = emptyBoard();
  game.turn = 1;
  game.status = "waiting";
  game.winner = 0;
  game.winningCells = [];
  game.rematch = { 1: false, 2: false };
  game.startingSlot = 1;
}

function registerConnect4Socket(socket, io) {
  socket.on("c4:create", (payload = {}, ack) => {
    const name = String(payload.name || "").trim().slice(0, 24) || "Spieler";
    const code = generateCode();
    const game = newGame(code);
    game.players[1] = { name, connected: true, socketId: socket.id, disconnectTimer: null };
    games.set(code, game);
    socket.join(code);
    socketIndex.set(socket.id, { code, role: "player", slot: 1 });
    if (typeof ack === "function") ack({ ok: true, code, slot: 1 });
    broadcast(io, game);
  });

  socket.on("c4:join", (payload = {}, ack) => {
    const code = String(payload.code || "").trim().toUpperCase();
    const name = String(payload.name || "").trim().slice(0, 24) || "Spieler";
    const game = games.get(code);
    if (!game) {
      if (typeof ack === "function") ack({ ok: false, error: "Spiel nicht gefunden." });
      return;
    }

    // Falls dieser Socket hier schon (z.B. als Zuschauer) registriert war, sauber entfernen.
    game.spectators.delete(socket.id);

    // Reconnect: gleicher Sitzplatz war getrennt und wartet noch auf die Gnadenfrist.
    for (const slot of [1, 2]) {
      const p = game.players[slot];
      if (p && !p.connected && p.name === name) {
        clearDisconnectTimer(p);
        p.connected = true;
        p.socketId = socket.id;
        socket.join(code);
        socketIndex.set(socket.id, { code, role: "player", slot });
        if (typeof ack === "function") ack({ ok: true, code, slot });
        broadcast(io, game);
        return;
      }
    }

    let slot = null;
    if (!game.players[1]) slot = 1;
    else if (!game.players[2]) slot = 2;

    if (slot) {
      game.players[slot] = { name, connected: true, socketId: socket.id, disconnectTimer: null };
      socket.join(code);
      socketIndex.set(socket.id, { code, role: "player", slot });
      startIfReady(game);
      if (typeof ack === "function") ack({ ok: true, code, slot });
      broadcast(io, game);
      return;
    }

    // Beide Plätze belegt -> als Zuschauer beitreten.
    game.spectators.set(socket.id, name);
    socket.join(code);
    socketIndex.set(socket.id, { code, role: "spectator", slot: null });
    if (typeof ack === "function") ack({ ok: true, code, slot: null, spectator: true });
    broadcast(io, game);
  });

  socket.on("c4:move", (payload = {}) => {
    const entry = socketIndex.get(socket.id);
    if (!entry || entry.role !== "player") return;
    const game = games.get(entry.code);
    if (!game || game.status !== "playing") return;
    if (game.turn !== entry.slot) return;

    const col = Number(payload.col);
    if (!Number.isInteger(col) || col < 0 || col >= COLS) return;

    const row = dropDisc(game.board, col, entry.slot);
    if (row === -1) return; // Spalte voll

    const winCells = findWin(game.board, row, col, entry.slot);
    if (winCells) {
      game.status = "finished";
      game.winner = entry.slot;
      game.winningCells = winCells;
    } else if (isFull(game.board)) {
      game.status = "finished";
      game.winner = 3;
    } else {
      game.turn = otherSlot(entry.slot);
    }
    broadcast(io, game);
  });

  socket.on("c4:rematch", () => {
    const entry = socketIndex.get(socket.id);
    if (!entry || entry.role !== "player") return;
    const game = games.get(entry.code);
    if (!game || game.status !== "finished") return;
    game.rematch[entry.slot] = true;
    if (game.rematch[1] && game.rematch[2]) resetForRematch(game);
    broadcast(io, game);
  });

  socket.on("c4:leave", () => handleLeave(socket, io, { immediate: true }));
  socket.on("disconnect", () => handleLeave(socket, io, { immediate: false }));
}

function handleLeave(socket, io, { immediate }) {
  const entry = socketIndex.get(socket.id);
  if (!entry) return;
  socketIndex.delete(socket.id);
  if (immediate) socket.leave(entry.code);

  const game = games.get(entry.code);
  if (!game) return;

  if (entry.role === "spectator") {
    game.spectators.delete(socket.id);
    broadcastOrCleanup(io, game);
    return;
  }

  const player = game.players[entry.slot];
  if (!player || player.socketId !== socket.id) return; // Sitzplatz wurde schon übernommen

  if (immediate) {
    freeSlot(game, entry.slot);
    io.to(game.code).emit("c4:opponentLeft");
    broadcastOrCleanup(io, game);
    return;
  }

  player.connected = false;
  broadcast(io, game);
  player.disconnectTimer = setTimeout(() => {
    const g = games.get(entry.code);
    if (!g) return;
    const p = g.players[entry.slot];
    if (!p || p.connected || p.socketId !== socket.id) return;
    freeSlot(g, entry.slot);
    io.to(g.code).emit("c4:opponentLeft");
    broadcastOrCleanup(io, g);
  }, RECONNECT_GRACE_MS);
}

setInterval(() => {
  const now = Date.now();
  for (const [code, game] of games) {
    const hasSomeone =
      game.players[1]?.connected || game.players[2]?.connected || game.spectators.size > 0;
    if (!hasSomeone && now - game.updatedAt > STALE_AFTER_MS) {
      clearDisconnectTimer(game.players[1]);
      clearDisconnectTimer(game.players[2]);
      games.delete(code);
    }
  }
}, STALE_SWEEP_MS);

module.exports = { registerConnect4Socket };
