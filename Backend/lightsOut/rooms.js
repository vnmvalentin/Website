// lightsOut/rooms.js — Koop-Räume für Lights Out (2–4 Spieler, Beitritt per 5-stelligem Code).
//
// Der Server ist nur Vermittler: Die Spielwelt entsteht in jedem Browser aus demselben Seed (vom Server
// gewürfelt, wenn der Host startet). Das Monster rechnet der Browser des Hosts und schickt es als „world“;
// alle anderen schicken nur ihre eigene Lage („state“) und Ereignisse (Gegenstand genommen, Statue gedreht …).
// Verlässt der Host den Raum, übernimmt der nächste verbundene Spieler — sein Browser rechnet dann das Monster.
//
// Ohne socket.io testbar: send(socketId, event, payload, { volatile }) wird hereingereicht, die Zeit über now().
// Alles lebt im Speicher.

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 4;
const MAX_ROOMS = 300;
const EMPTY_ROOM_MS = 2 * 60 * 1000;
const LEVEL_COUNT = 4;
/** Ereignisse, die weitergereicht werden (alles andere wird verworfen) */
const EVENT_TYPES = new Set([
  'take', 'insert', 'valve', 'statue', 'code', 'carving', 'noise', 'crumb', 'caught', 'escaped', 'wipe', 'sfx', 'hide', 'scare',
]);

function createLightsOutRooms({ send, now = Date.now, random = Math.random }) {
  const rooms = new Map(); // code -> room
  const sockets = new Map(); // socketId -> { code, seat }

  const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18) || 'Spieler';
  const cleanToken = (t) => (typeof t === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : null);

  function newCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]).join('');
    } while (rooms.has(code));
    return code;
  }

  function view(room) {
    return {
      code: room.code,
      phase: room.phase,
      hostSeat: room.hostSeat,
      level: room.level,
      round: room.round,
      players: room.players.filter(Boolean).map((p) => ({ seat: p.seat, name: p.name, connected: p.connected })),
    };
  }

  const connected = (room) => room.players.filter((p) => p && p.connected);

  function broadcast(room, event, payload, { except = null, volatile = false } = {}) {
    for (const p of connected(room)) if (p.socketId !== except) send(p.socketId, event, payload, { volatile });
  }

  function pushRoom(room) {
    room.updatedAt = now();
    broadcast(room, 'lo:room', view(room));
  }

  /** Host = erster verbundener Platz; ändert sich nur, wenn der bisherige weg ist. */
  function fixHost(room) {
    const host = room.players[room.hostSeat];
    if (host && host.connected) return false;
    const next = connected(room)[0];
    if (!next) return false;
    room.hostSeat = next.seat;
    return true;
  }

  function seatOf(socketId) {
    const s = sockets.get(socketId);
    if (!s) return null;
    const room = rooms.get(s.code);
    if (!room) return null;
    const player = room.players[s.seat];
    if (!player || player.socketId !== socketId) return null;
    return { room, player };
  }

  function create(socketId, { name, token } = {}) {
    if (sockets.has(socketId)) leave(socketId);
    if (rooms.size >= MAX_ROOMS) return { ok: false, error: 'Gerade sind zu viele Räume offen.' };
    const code = newCode();
    const room = {
      code, phase: 'lobby', hostSeat: 0, level: 0, round: 0, seed: 0,
      players: [], createdAt: now(), updatedAt: now(),
    };
    room.players[0] = { seat: 0, name: cleanName(name), token: cleanToken(token), socketId, connected: true };
    rooms.set(code, room);
    sockets.set(socketId, { code, seat: 0 });
    pushRoom(room);
    return { ok: true, code, seat: 0, room: view(room) };
  }

  function join(socketId, { code, name, token } = {}) {
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return { ok: false, error: 'notFound' };
    const tok = cleanToken(token);
    // Wiederverbinden: gleicher Token → gleicher Platz (auch mitten in einer Runde)
    let player = tok ? room.players.find((p) => p && p.token === tok) : null;
    if (player) {
      if (player.socketId && player.socketId !== socketId) sockets.delete(player.socketId);
      player.socketId = socketId;
      player.connected = true;
      player.name = cleanName(name || player.name);
    } else {
      if (room.phase !== 'lobby') return { ok: false, error: 'Die Runde läuft schon — warte, bis sie vorbei ist.' };
      let seat = -1;
      for (let i = 0; i < MAX_PLAYERS; i++) if (!room.players[i]) { seat = i; break; }
      if (seat < 0) {
        // freie Plätze von Spielern, die längst weg sind
        seat = room.players.findIndex((p) => p && !p.connected);
        if (seat < 0) return { ok: false, error: 'Der Raum ist voll (4 Spieler).' };
      }
      if (sockets.has(socketId)) leave(socketId);
      player = { seat, name: cleanName(name), token: tok, socketId, connected: true };
      room.players[seat] = player;
    }
    sockets.set(socketId, { code: room.code, seat: player.seat });
    fixHost(room);
    pushRoom(room);
    const res = { ok: true, code: room.code, seat: player.seat, room: view(room) };
    // Mitten in einer Runde wieder da: gleiche Ebene, gleicher Seed
    if (room.phase === 'playing') res.start = startPayload(room);
    return res;
  }

  /**
   * Startdaten einer Runde. players = wer beim Start verbunden war — daraus berechnet jeder Browser die
   * Schwierigkeit und damit die Welt; wer mitten in der Runde neu verbindet, muss dieselbe Liste bekommen.
   */
  function startPayload(room) {
    return { level: room.level, seed: room.seed, round: room.round, hostSeat: room.hostSeat, players: room.startPlayers || [] };
  }

  /** Host startet (oder startet neu): Ebene wählen, Seed würfeln, alle laden dieselbe Welt. */
  function start(socketId, { level, seed } = {}) {
    const at = seatOf(socketId);
    if (!at) return { ok: false, error: 'Nicht in einem Raum.' };
    const { room, player } = at;
    if (player.seat !== room.hostSeat) return { ok: false, error: 'Nur der Host kann starten.' };
    if (connected(room).length < 1) return { ok: false, error: 'Niemand da.' };
    const lv = Math.max(0, Math.min(LEVEL_COUNT - 1, Math.floor(Number(level) || 0)));
    room.level = lv;
    // Neustart derselben Ebene nach einem Fehlschlag darf den Seed behalten (gleiche Karte)
    room.seed = Number.isInteger(seed) && seed > 0 && seed < 2 ** 31 ? seed : Math.floor(random() * 2 ** 31) || 1;
    room.round += 1;
    room.phase = 'playing';
    room.startPlayers = connected(room).map((p) => ({ seat: p.seat, name: p.name }));
    pushRoom(room);
    broadcast(room, 'lo:start', startPayload(room));
    return { ok: true };
  }

  /** Zurück in den Warteraum (Host), z. B. nach dem Ende. */
  function lobby(socketId) {
    const at = seatOf(socketId);
    if (!at) return { ok: false, error: 'Nicht in einem Raum.' };
    if (at.player.seat !== at.room.hostSeat) return { ok: false, error: 'Nur der Host.' };
    at.room.phase = 'lobby';
    pushRoom(at.room);
    broadcast(at.room, 'lo:lobby', {});
    return { ok: true };
  }

  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);

  /** Eigene Lage → an die anderen (flüchtig: verlorene Pakete werden nicht nachgeschickt). */
  function state(socketId, p = {}) {
    const at = seatOf(socketId);
    if (!at || at.room.phase !== 'playing') return;
    const s = {
      seat: at.player.seat,
      r: num(p.r, 0, 1e6), // Runde — veraltete Pakete aus der letzten Ebene verwerfen
      x: num(p.x, -50, 400), z: num(p.z, -50, 400), yaw: num(p.yaw, -100, 100), pitch: num(p.pitch, -2, 2),
      sp: num(p.sp, 0, 10), f: num(p.f, 0, 255),
    };
    broadcast(at.room, 'lo:peer', s, { except: socketId, volatile: true });
  }

  /** Monster + geteilter Zustand vom Host → an alle anderen. */
  function world(socketId, p = {}) {
    const at = seatOf(socketId);
    if (!at || at.room.phase !== 'playing' || at.player.seat !== at.room.hostSeat) return;
    const json = JSON.stringify(p);
    if (json.length > 1500) return;
    broadcast(at.room, 'lo:world', p, { except: socketId, volatile: true });
  }

  /** Spielereignis → an alle anderen (zuverlässig). */
  function event(socketId, p = {}) {
    const at = seatOf(socketId);
    if (!at || at.room.phase !== 'playing') return;
    if (!p || !EVENT_TYPES.has(p.type)) return;
    const json = JSON.stringify(p);
    if (json.length > 400) return;
    broadcast(at.room, 'lo:event', { ...p, seat: at.player.seat }, { except: socketId });
  }

  function leave(socketId) {
    const s = sockets.get(socketId);
    sockets.delete(socketId);
    if (!s) return { ok: true };
    const room = rooms.get(s.code);
    if (!room) return { ok: true };
    const player = room.players[s.seat];
    if (player && player.socketId === socketId) room.players[s.seat] = null;
    if (!room.players.some(Boolean)) {
      rooms.delete(room.code);
      return { ok: true };
    }
    if (fixHost(room)) broadcast(room, 'lo:host', { hostSeat: room.hostSeat });
    pushRoom(room);
    broadcast(room, 'lo:left', { seat: s.seat });
    return { ok: true };
  }

  function disconnect(socketId) {
    const s = sockets.get(socketId);
    sockets.delete(socketId);
    if (!s) return;
    const room = rooms.get(s.code);
    if (!room) return;
    const player = room.players[s.seat];
    if (!player || player.socketId !== socketId) return;
    player.connected = false;
    player.socketId = null;
    // Im Warteraum gibt man den Platz gleich frei; in einer Runde bleibt er für ein Wiederverbinden
    if (room.phase === 'lobby') room.players[s.seat] = null;
    if (fixHost(room)) broadcast(room, 'lo:host', { hostSeat: room.hostSeat });
    pushRoom(room);
    broadcast(room, 'lo:left', { seat: s.seat });
  }

  /** Aufräumen: Räume ohne verbundene Spieler nach EMPTY_ROOM_MS löschen. */
  function sweep() {
    const t = now();
    for (const room of rooms.values()) {
      if (connected(room).length) { room.emptySince = null; continue; }
      room.emptySince = room.emptySince || t;
      if (t - room.emptySince > EMPTY_ROOM_MS) rooms.delete(room.code);
    }
  }

  return { create, join, start, lobby, state, world, event, leave, disconnect, sweep, _rooms: rooms };
}

module.exports = { createLightsOutRooms, MAX_PLAYERS };
