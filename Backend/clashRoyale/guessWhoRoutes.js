// guessWhoRoutes.js — „Wer bin ich?“ mit Clash-Royale-Karten (/clash/wer-bin-ich/:code), 1v1 per Link-Code.
// Wie das Klappbrett-Spiel, in zwei Phasen:
//   1. Wählen: Jeder Spieler bekommt einen EIGENEN Kartenpool (Rastergröße einstellbar) und wählt geheim eine Karte.
//   2. Raten: Jeder bekommt den Pool des Gegners vor sich — genau die Karten, aus denen der gewählt hat. Abwechselnd
//      eine Ja/Nein-Frage (Chat im Raum oder Voice), umklappen, irgendwann raten: richtig = Sieg, falsch = verloren.
// Server-autoritativ für Pools, Geheimkarten, Zug und Raten; die Antworten gibt der Gegner selbst (wie am Tisch).
// Systemmeldungen gehen als Code + Name raus, der Browser übersetzt sie (DE/EN). State nur im Speicher.
const { ALL_CARDS } = require("./core/cards");

// Rastergrößen: Spalten × Zeilen (Client legt die Spalten danach fest)
const GRIDS = { "4x4": 16, "5x4": 20, "6x4": 24, "6x5": 30, "6x6": 36, "7x6": 42, "7x7": 49 };
const DEFAULT_GRID = "6x4";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECONNECT_GRACE_MS = 2 * 60 * 1000;
const STALE_SWEEP_MS = 5 * 60 * 1000;
const STALE_AFTER_MS = 30 * 60 * 1000;
const CHAT_MAX = 80;
const MSG_MAX_LEN = 160;

const rooms = new Map(); // code -> room
const socketIndex = new Map(); // socket.id -> { code, slot }
const CARD_IDS = ALL_CARDS.map((c) => c.id);

function generateCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function drawPool(size) {
  const a = [...CARD_IDS];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, size);
}

const other = (slot) => (slot === 1 ? 2 : 1);
const sys = (room, code, name) => room.chat.push({ id: ++room.msgSeq, kind: "system", code, name: name || null });

function dealPools(room) {
  const size = GRIDS[room.grid] || GRIDS[DEFAULT_GRID];
  for (const s of [1, 2]) {
    const p = room.players[s];
    if (p) { p.pool = drawPool(size); p.secret = null; p.flipped = new Set(); }
  }
}

function newRound(room) {
  room.status = room.players[1] && room.players[2] ? "picking" : "waiting";
  room.winner = 0;
  room.endReason = null;
  room.lastGuess = null;
  room.pending = null; // offene Frage { from, msgId }
  room.rematch = { 1: false, 2: false };
  room.round += 1;
  room.turn = room.round % 2 === 1 ? 1 : 2; // Anfang wechselt je Runde
  dealPools(room);
  sys(room, room.status === "picking" ? "newRound" : "waiting");
}

function newRoom(code) {
  return {
    code, players: { 1: null, 2: null }, chat: [], msgSeq: 0, round: 0, grid: DEFAULT_GRID,
    status: "waiting", turn: 1, winner: 0, endReason: null, lastGuess: null, pending: null,
    rematch: { 1: false, 2: false }, updatedAt: Date.now(),
  };
}

function makePlayer(name, socketId, size) {
  return { name, socketId, connected: true, disconnectTimer: null, secret: null, flipped: new Set(), pool: drawPool(size) };
}

/** Sicht eines Spielers: eigener Pool + Geheimkarte, nach dem Wählen der Pool des Gegners als Brett */
function viewFor(room, slot) {
  const me = room.players[slot];
  const opp = room.players[other(slot)];
  const finished = room.status === "finished";
  const boardSize = opp?.pool?.length || 0;
  const pub = (p, flipBase) => (p ? { name: p.name, connected: p.connected, ready: !!p.secret, open: flipBase - p.flipped.size } : null);
  return {
    code: room.code,
    grid: room.grid,
    grids: Object.keys(GRIDS),
    status: room.status,
    turn: room.turn,
    round: room.round,
    winner: room.winner,
    endReason: room.endReason,
    lastGuess: room.lastGuess,
    pending: room.pending,
    rematch: room.rematch,
    mySlot: slot,
    // Phase 1: eigener Pool; Phase 2: Brett = Pool des Gegners (erst wenn beide gewählt haben)
    myPool: me?.pool || [],
    board: room.status === "playing" || finished ? opp?.pool || [] : [],
    me: me ? { ...pub(me, boardSize), secret: me.secret, flipped: [...me.flipped] } : null,
    opponent: opp ? { ...pub(opp, me?.pool?.length || 0), secret: finished ? opp.secret : null } : null,
    chat: room.chat.slice(-CHAT_MAX),
  };
}

function broadcast(io, room) {
  room.updatedAt = Date.now();
  if (room.chat.length > CHAT_MAX * 2) room.chat = room.chat.slice(-CHAT_MAX);
  for (const s of [1, 2]) {
    const p = room.players[s];
    if (p?.connected) io.to(p.socketId).emit("gw:state", viewFor(room, s));
  }
}

function clearTimer(p) {
  if (p?.disconnectTimer) { clearTimeout(p.disconnectTimer); p.disconnectTimer = null; }
}

function freeSlot(room, slot) {
  clearTimer(room.players[slot]);
  const name = room.players[slot]?.name;
  room.players[slot] = null;
  sys(room, "left", name);
  room.round = 0;
  newRound(room);
}

function registerGuessWhoSocket(socket, io) {
  const ack = (fn, v) => { if (typeof fn === "function") fn(v); };
  const ctx = () => {
    const e = socketIndex.get(socket.id);
    const room = e && rooms.get(e.code);
    return room ? { room, slot: e.slot, me: room.players[e.slot] } : null;
  };
  const sizeOf = (room) => GRIDS[room.grid] || GRIDS[DEFAULT_GRID];

  socket.on("gw:create", (payload = {}, cb) => {
    const name = String(payload.name || "").trim().slice(0, 24) || "Player";
    const code = generateCode();
    const room = newRoom(code);
    if (GRIDS[payload.grid]) room.grid = payload.grid;
    room.players[1] = makePlayer(name, socket.id, sizeOf(room));
    sys(room, "waiting");
    rooms.set(code, room);
    socketIndex.set(socket.id, { code, slot: 1 });
    ack(cb, { ok: true, code, slot: 1 });
    broadcast(io, room);
  });

  socket.on("gw:join", (payload = {}, cb) => {
    const code = String(payload.code || "").trim().toUpperCase();
    const name = String(payload.name || "").trim().slice(0, 24) || "Player";
    const room = rooms.get(code);
    if (!room) return ack(cb, { ok: false, error: "not_found" });
    // Wiederkommen nach Verbindungsabbruch (gleicher Name, Platz noch reserviert)
    for (const s of [1, 2]) {
      const p = room.players[s];
      if (p && !p.connected && p.name === name) {
        clearTimer(p);
        p.connected = true;
        p.socketId = socket.id;
        socketIndex.set(socket.id, { code, slot: s });
        ack(cb, { ok: true, code, slot: s });
        broadcast(io, room);
        return;
      }
    }
    const slot = !room.players[1] ? 1 : !room.players[2] ? 2 : null;
    if (!slot) return ack(cb, { ok: false, error: "full" });
    room.players[slot] = makePlayer(name, socket.id, sizeOf(room));
    socketIndex.set(socket.id, { code, slot });
    if (room.status === "waiting" && room.players[1] && room.players[2]) {
      room.status = "picking";
      sys(room, "joined", name);
    }
    ack(cb, { ok: true, code, slot });
    broadcast(io, room);
  });

  // Rastergröße: nur Spieler 1 (Raumersteller), nur solange noch niemand gewählt hat — beide Pools neu
  socket.on("gw:grid", (payload = {}) => {
    const c = ctx();
    if (!c || c.slot !== 1 || !GRIDS[payload.grid]) return;
    const { room } = c;
    if (!(room.status === "waiting" || room.status === "picking")) return;
    if (room.players[1]?.secret || room.players[2]?.secret) return;
    if (room.grid === payload.grid) return;
    room.grid = payload.grid;
    dealPools(room);
    sys(room, "grid", String(GRIDS[room.grid]));
    broadcast(io, room);
  });

  socket.on("gw:pick", (payload = {}) => {
    const c = ctx();
    if (!c || c.room.status !== "picking") return;
    const id = String(payload.cardId || "");
    if (!c.me.pool.includes(id)) return;
    c.me.secret = id;
    if (c.room.players[1]?.secret && c.room.players[2]?.secret) {
      c.room.status = "playing";
      sys(c.room, "start", c.room.players[c.room.turn].name);
    }
    broadcast(io, c.room);
  });

  socket.on("gw:flip", (payload = {}) => {
    const c = ctx();
    if (!c || c.room.status !== "playing") return;
    const id = String(payload.cardId || "");
    const board = c.room.players[other(c.slot)]?.pool || [];
    if (!board.includes(id)) return;
    if (c.me.flipped.has(id)) c.me.flipped.delete(id); else c.me.flipped.add(id);
    broadcast(io, c.room);
  });

  // Chat: freie Nachricht, Frage (nur wer am Zug ist, eine offene Frage zurzeit) oder Antwort Ja/Nein
  socket.on("gw:say", (payload = {}) => {
    const c = ctx();
    if (!c) return;
    const { room, slot } = c;
    const kind = payload.kind === "question" ? "question" : payload.kind === "answer" ? "answer" : "msg";
    if (kind === "answer") {
      if (!room.pending || room.pending.from === slot) return;
      const yes = !!payload.yes;
      room.chat.push({ id: ++room.msgSeq, kind: "answer", from: slot, yes, to: room.pending.msgId });
      room.pending = null;
      broadcast(io, room);
      return;
    }
    const text = String(payload.text || "").trim().slice(0, MSG_MAX_LEN);
    if (!text) return;
    if (kind === "question") {
      if (room.status !== "playing" || room.turn !== slot || room.pending) return;
      const id = ++room.msgSeq;
      room.chat.push({ id, kind: "question", from: slot, text });
      room.pending = { from: slot, msgId: id };
    } else {
      room.chat.push({ id: ++room.msgSeq, kind: "msg", from: slot, text });
    }
    broadcast(io, room);
  });

  socket.on("gw:endTurn", () => {
    const c = ctx();
    if (!c || c.room.status !== "playing" || c.room.turn !== c.slot) return;
    c.room.turn = other(c.slot);
    c.room.pending = null;
    sys(c.room, "turn", c.room.players[c.room.turn].name);
    broadcast(io, c.room);
  });

  socket.on("gw:guess", (payload = {}) => {
    const c = ctx();
    if (!c || c.room.status !== "playing" || c.room.turn !== c.slot) return;
    const id = String(payload.cardId || "");
    const opp = c.room.players[other(c.slot)];
    if (!opp?.pool.includes(id)) return;
    const right = opp.secret === id;
    c.room.status = "finished";
    c.room.winner = right ? c.slot : other(c.slot);
    c.room.endReason = right ? "guessed" : "wrong";
    c.room.lastGuess = { by: c.slot, cardId: id, right };
    c.room.pending = null;
    sys(c.room, right ? "right" : "wrongGuess", c.me.name);
    broadcast(io, c.room);
  });

  socket.on("gw:rematch", () => {
    const c = ctx();
    if (!c || c.room.status !== "finished") return;
    c.room.rematch[c.slot] = true;
    if (c.room.rematch[1] && c.room.rematch[2]) newRound(c.room);
    broadcast(io, c.room);
  });

  socket.on("gw:leave", () => leave(socket, io, true));
  socket.on("disconnect", () => leave(socket, io, false));
}

function leave(socket, io, immediate) {
  const e = socketIndex.get(socket.id);
  if (!e) return;
  socketIndex.delete(socket.id);
  const room = rooms.get(e.code);
  if (!room) return;
  const p = room.players[e.slot];
  if (!p || p.socketId !== socket.id) return;
  const drop = () => {
    freeSlot(room, e.slot);
    if (!room.players[1] && !room.players[2]) rooms.delete(room.code);
    else broadcast(io, room);
  };
  if (immediate) return drop();
  p.connected = false;
  broadcast(io, room);
  p.disconnectTimer = setTimeout(() => {
    const r = rooms.get(e.code);
    const q = r?.players[e.slot];
    if (!q || q.connected || q.socketId !== socket.id) return;
    drop();
  }, RECONNECT_GRACE_MS);
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const someone = room.players[1]?.connected || room.players[2]?.connected;
    if (!someone && now - room.updatedAt > STALE_AFTER_MS) {
      clearTimer(room.players[1]);
      clearTimer(room.players[2]);
      rooms.delete(code);
    }
  }
}, STALE_SWEEP_MS).unref?.();

module.exports = { registerGuessWhoSocket, GRIDS, _rooms: rooms };
