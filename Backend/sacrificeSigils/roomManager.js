// sacrificeSigils/roomManager.js — Räume von Sacrifice & Sigils: Lobby, Match, Timer, Reconnect, Zuschauer.
//
// Reine Logik ohne Socket.io: Die Anbindung (routes/sacrificeSigilsRoutes.js) reicht Aufrufe herein und bekommt über
// `send(socketId, event, payload)` die Nachrichten zurück. Uhr (`now`) und Engine werden hereingereicht, damit die
// Tests Zeit vorspulen können, ohne echte Timer.
//
// Der Match-State lebt NUR hier. Jede Aktion geht durch engine.applyAction; ungültige Aktionen ändern nichts und
// werden per Ack abgelehnt. Jeder Empfänger bekommt seine gefilterte Sicht (engine.viewFor/eventsFor).
//
// Zeitregeln
//   Zug-Timer        Einstellung 45/60/90 s oder aus (nur Kampfzüge). Draft-Wahl 40 s, Extras 45 s, Pfad 45 s je Knoten,
//                    Rast (Beginner wählen) 30 s. Ablauf ⇒ Aktion { type: "timeout" } für den Säumigen.
//   Verbindung weg   Der Timer des Getrennten pausiert bis zu 60 s, danach läuft er normal weiter.
//                    Nach 3 Minuten Abwesenheit am Stück gibt die Engine für ihn auf.

const crypto = require('crypto');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PAUSE_MAX_MS = 60 * 1000;
const ABANDON_MS = 3 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;
const TIMERS = { draft: 40, extras: 45, path: 45, interlude: 30 };
const NAME_MAX = 24;

/**
 * @param {{ engine: any, now?: () => number, send: (socketId: string, event: string, payload: any) => void,
 *   fingerprint?: string, randomSeed?: () => string }} deps
 */
function createRoomManager(deps) {
  const { engine, send } = deps;
  const now = deps.now || (() => Date.now());
  const randomSeed = deps.randomSeed || (() => Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''));
  /** @type {Map<string, any>} */
  const rooms = new Map();
  /** @type {Map<string, { code: string, seat: number|null }>} */
  const sockets = new Map();

  const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, NAME_MAX) || 'Zeichner';
  const cleanToken = (t) => (typeof t === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : null);

  function newCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
    } while (rooms.has(code));
    return code;
  }

  // ───────────── Öffentliche Raumansicht (Lobby) ─────────────

  function roomInfo(room) {
    return {
      code: room.code,
      status: room.status,
      settings: room.settings,
      seedInput: room.seedInput,
      seed: room.match?.seed ?? null,
      hostSeat: room.hostSeat,
      seats: room.seats.map((s) => (s ? { name: s.name, connected: s.connected, ready: s.ready, rematch: !!s.rematch } : null)),
      spectators: room.spectators.size,
      fingerprint: deps.fingerprint || null,
    };
  }

  function timerInfo(room) {
    const t = {};
    for (const p of [0, 1]) {
      const d = room.deadlines[p];
      if (!d) continue;
      t[p] = d.paused ? { paused: true, remaining: d.remaining, total: d.total } : { deadline: d.at, remaining: Math.max(0, d.at - now()), total: d.total };
    }
    return t;
  }

  function sendRoom(room) {
    const info = roomInfo(room);
    for (const s of room.seats) if (s?.connected && s.socketId) send(s.socketId, 'ss:room', info);
    for (const id of room.spectators.keys()) send(id, 'ss:room', info);
  }

  /** @param {any} room @param {any[]} events */
  function sendState(room, events = []) {
    if (!room.match) return;
    const timers = timerInfo(room);
    const serverNow = now();
    for (const p of [0, 1]) {
      const s = room.seats[p];
      if (!s?.connected || !s.socketId) continue;
      send(s.socketId, 'ss:state', { view: engine.viewFor(room.match, p), events: engine.eventsFor(events, p), timers, serverNow, you: p });
    }
    if (room.settings.spectators && room.spectators.size) {
      const view = engine.viewFor(room.match, null);
      const ev = engine.eventsFor(events, null);
      for (const id of room.spectators.keys()) send(id, 'ss:state', { view, events: ev, timers, serverNow, you: null });
    }
  }

  function notice(room, text) {
    for (const s of room.seats) if (s?.connected && s.socketId) send(s.socketId, 'ss:notice', { text });
    for (const id of room.spectators.keys()) send(id, 'ss:notice', { text });
  }

  // ───────────── Timer ─────────────

  /** Zeitlimit (s) für Spieler p in der aktuellen Phase; 0 = kein Timer. */
  function limitFor(room) {
    const m = room.match;
    if (m.phase === 'battle') return room.settings.turnTimer || 0;
    return TIMERS[m.phase] || 0;
  }

  /** Schlüssel, der sich ändert, sobald für p eine neue Entscheidung ansteht. */
  function decisionKey(room, p) {
    const m = room.match;
    switch (m.phase) {
      case 'draft': return `d${m.draft.picks[p].length}:${m.draft.index}`;
      case 'extras': return `x${m.draft.extraIndex || 0}:${m.draft.extras[p].head}`;
      case 'battle': return `b${m.battleNo}:${m.battle.turn}`;
      case 'path': return `p${m.pathNo}:${m.path.players[p].level}`;
      case 'interlude': return `i${m.pathNo}`;
      default: return '';
    }
  }

  function refreshTimers(room) {
    const m = room.match;
    if (!m || m.phase === 'over') {
      room.deadlines = [null, null];
      return;
    }
    const waiting = engine.awaiting(m);
    const secs = limitFor(room);
    for (const p of [0, 1]) {
      if (!waiting.includes(p) || !secs) {
        room.deadlines[p] = null;
        continue;
      }
      const key = `${m.phase}:${decisionKey(room, p)}`;
      const cur = room.deadlines[p];
      if (cur && cur.key === key) continue;
      const total = secs * 1000;
      const seat = room.seats[p];
      const paused = !!seat && !seat.connected && now() - (seat.disconnectedAt || 0) < PAUSE_MAX_MS;
      room.deadlines[p] = paused ? { key, paused: true, remaining: total, total } : { key, at: now() + total, total };
    }
  }

  /** Aktion anwenden, Timer neu setzen, alle informieren. */
  function apply(room, action) {
    const res = engine.applyAction(room.match, action);
    if (res.error) return res.error;
    room.match = res.state;
    room.updatedAt = now();
    if (room.match.phase === 'over' && room.status !== 'over') room.status = 'over';
    refreshTimers(room);
    sendState(room, res.events);
    if (room.status === 'over') sendRoom(room);
    return null;
  }

  /** Periodisch aufrufen (z. B. alle 500 ms). */
  function tick() {
    const t = now();
    for (const room of rooms.values()) {
      // Aufräumen: niemand mehr da
      const anyone = room.seats.some((s) => s?.connected) || room.spectators.size > 0;
      if (!anyone && t - room.updatedAt > STALE_MS) {
        rooms.delete(room.code);
        continue;
      }
      if (room.status !== 'playing' || !room.match) continue;
      let changed = false;
      for (const p of [0, 1]) {
        const seat = room.seats[p];
        const d = room.deadlines[p];
        // Pause-Ende: nach 60 s ohne Verbindung läuft der Timer normal weiter
        if (d?.paused && seat && (seat.connected || t - (seat.disconnectedAt || 0) >= PAUSE_MAX_MS)) {
          room.deadlines[p] = { key: d.key, at: t + d.remaining, total: d.total };
          changed = true;
        }
        // Abwesenheit: nach 3 Minuten automatisch aufgeben
        if (seat && !seat.connected && t - (seat.disconnectedAt || t) >= ABANDON_MS && room.match.phase !== 'over') {
          notice(room, `${seat.name} ist zu lange weg und gibt auf.`);
          apply(room, { type: 'surrender', player: p });
          changed = false;
          break;
        }
      }
      if (room.status !== 'playing') continue;
      for (const p of [0, 1]) {
        const d = room.deadlines[p];
        if (d && !d.paused && t >= d.at) {
          room.deadlines[p] = null;
          const err = apply(room, { type: 'timeout', player: p });
          if (err) refreshTimers(room);
          changed = false;
        }
      }
      if (changed) sendState(room, []);
    }
  }

  // ───────────── Lobby ─────────────

  function seatOfSocket(socketId) {
    const e = sockets.get(socketId);
    if (!e) return { room: null, seat: null };
    return { room: rooms.get(e.code) || null, seat: e.seat };
  }

  function detach(socketId) {
    const { room, seat } = seatOfSocket(socketId);
    sockets.delete(socketId);
    if (!room) return;
    room.spectators.delete(socketId);
    if (seat !== null && room.seats[seat]?.socketId === socketId) {
      const s = room.seats[seat];
      s.connected = false;
      s.socketId = null;
      s.disconnectedAt = now();
      // In der Lobby ist ein getrennter Platz nicht mehr „bereit“
      if (room.status === 'lobby') s.ready = false;
      // Laufender Timer des Getrennten pausiert
      const d = room.deadlines[seat];
      if (d && !d.paused) room.deadlines[seat] = { key: d.key, paused: true, remaining: Math.max(0, d.at - now()), total: d.total };
    }
    sendRoom(room);
    if (room.match) sendState(room, []);
  }

  function attach(room, socketId, seat) {
    const old = sockets.get(socketId);
    if (old && old.code !== room.code) detach(socketId);
    sockets.set(socketId, { code: room.code, seat });
  }

  /**
   * @param {string} socketId
   * @param {{ name?: string, token?: string, settings?: any, seed?: string }} payload
   */
  function create(socketId, payload = {}) {
    const token = cleanToken(payload.token);
    if (!token) return { ok: false, error: 'badToken' };
    const code = newCode();
    const room = {
      code,
      status: 'lobby',
      settings: engine.normalizeSettings(payload.settings),
      seedInput: engine.normalizeSeed(payload.seed || ''),
      hostSeat: 0,
      seats: [{ token, name: cleanName(payload.name), socketId, connected: true, ready: false, disconnectedAt: 0 }, null],
      spectators: new Map(),
      match: null,
      deadlines: [null, null],
      draftRound: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    rooms.set(code, room);
    attach(room, socketId, 0);
    sendRoom(room);
    return { ok: true, code, seat: 0, room: roomInfo(room) };
  }

  /**
   * Beitreten oder wiederverbinden (gleiches Token = gleicher Platz). Volle Räume ⇒ Zuschauer (wenn erlaubt).
   * @param {string} socketId @param {{ code?: string, name?: string, token?: string }} payload
   */
  function join(socketId, payload = {}) {
    const code = String(payload.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return { ok: false, error: 'notFound' };
    const token = cleanToken(payload.token);
    if (!token) return { ok: false, error: 'badToken' };
    room.spectators.delete(socketId);
    let seat = room.seats.findIndex((s) => s && s.token === token);
    if (seat >= 0) {
      const s = room.seats[seat];
      if (s.socketId && s.socketId !== socketId) {
        send(s.socketId, 'ss:kicked', { reason: 'otherWindow' });
        sockets.delete(s.socketId);
      }
      const wasAway = !s.connected;
      s.socketId = socketId;
      s.connected = true;
      // Pausierter Timer läuft ab jetzt weiter
      const d = room.deadlines[seat];
      if (d?.paused) room.deadlines[seat] = { key: d.key, at: now() + d.remaining, total: d.total };
      if (payload.name) s.name = cleanName(payload.name);
      attach(room, socketId, seat);
      if (wasAway && room.status === 'playing') notice(room, `${s.name} ist wieder da.`);
    } else if (room.status === 'lobby' && room.seats.some((s) => !s)) {
      seat = room.seats.findIndex((s) => !s);
      room.seats[seat] = { token, name: cleanName(payload.name), socketId, connected: true, ready: false, disconnectedAt: 0 };
      attach(room, socketId, seat);
      notice(room, `${room.seats[seat].name} setzt sich an den Tisch.`);
    } else {
      if (!room.settings.spectators) return { ok: false, error: 'noSpectators' };
      room.spectators.set(socketId, cleanName(payload.name));
      attach(room, socketId, null);
      seat = null;
    }
    room.updatedAt = now();
    sendRoom(room);
    // Vollständiger State ohne Animations-Replay
    if (room.match) sendState(room, []);
    return { ok: true, code, seat, room: roomInfo(room) };
  }

  function leave(socketId) {
    const { room, seat } = seatOfSocket(socketId);
    if (!room) return { ok: true };
    if (seat !== null && room.status === 'lobby') {
      room.seats[seat] = null;
      sockets.delete(socketId);
      if (room.hostSeat === seat) room.hostSeat = room.seats.findIndex((s) => s) >= 0 ? room.seats.findIndex((s) => s) : 0;
      sendRoom(room);
      return { ok: true };
    }
    if (seat !== null && room.status === 'playing') {
      apply(room, { type: 'surrender', player: seat });
    }
    detach(socketId);
    return { ok: true };
  }

  function settings(socketId, payload = {}) {
    const { room, seat } = seatOfSocket(socketId);
    if (!room || seat === null) return { ok: false, error: 'notInRoom' };
    if (seat !== room.hostSeat) return { ok: false, error: 'notHost' };
    if (room.status !== 'lobby') return { ok: false, error: 'notInLobby' };
    room.settings = engine.normalizeSettings({ ...room.settings, ...(payload.settings || {}) });
    if (payload.seed !== undefined) room.seedInput = engine.normalizeSeed(payload.seed);
    for (const s of room.seats) if (s) s.ready = false;
    sendRoom(room);
    return { ok: true };
  }

  function startMatch(room) {
    const seed = room.seedInput || randomSeed();
    room.match = engine.createMatch({
      seed,
      settings: room.settings,
      names: room.seats.map((s) => s.name),
      salt: crypto.randomBytes(12).toString('hex'),
      draftRound: room.draftRound,
    });
    room.status = 'playing';
    room.deadlines = [null, null];
    for (const s of room.seats) { s.ready = false; s.rematch = false; }
    refreshTimers(room);
    sendRoom(room);
    sendState(room, [{ type: 'phase', phase: 'draft' }]);
  }

  function ready(socketId, payload = {}) {
    const { room, seat } = seatOfSocket(socketId);
    if (!room || seat === null) return { ok: false, error: 'notInRoom' };
    if (room.status !== 'lobby') return { ok: false, error: 'notInLobby' };
    room.seats[seat].ready = payload.ready !== false;
    if (room.seats.every((s) => s && s.connected && s.ready)) startMatch(room);
    else sendRoom(room);
    return { ok: true };
  }

  function action(socketId, payload = {}) {
    const { room, seat } = seatOfSocket(socketId);
    if (!room || seat === null) return { ok: false, error: 'notInRoom' };
    if (room.status !== 'playing' || !room.match) return { ok: false, error: 'notPlaying' };
    const a = payload && typeof payload.action === 'object' ? payload.action : null;
    if (!a || typeof a.type !== 'string' || a.type === 'timeout') return { ok: false, error: 'badAction' };
    const err = apply(room, { ...a, player: seat });
    return err ? { ok: false, error: err } : { ok: true };
  }

  /** Revanche: beide wollen ⇒ neues Match, neuer Seed, Draft-Reihenfolge getauscht. */
  function rematch(socketId) {
    const { room, seat } = seatOfSocket(socketId);
    if (!room || seat === null) return { ok: false, error: 'notInRoom' };
    if (room.status !== 'over') return { ok: false, error: 'notOver' };
    room.seats[seat].rematch = true;
    if (room.seats.every((s) => s && s.connected && s.rematch)) {
      room.draftRound += 1;
      room.seedInput = '';
      startMatch(room);
    } else {
      sendRoom(room);
    }
    return { ok: true };
  }

  return { create, join, leave, settings, ready, action, rematch, detach, tick, rooms, _refreshTimers: refreshTimers };
}

module.exports = { createRoomManager, PAUSE_MAX_MS, ABANDON_MS };
