// sacrificeSigils/runRoomManager.js — Räume der Moorwanderung (Run-Modus für 2–6 Spieler).
//
// Gleiches Muster wie roomManager.js (Duellmodus): reine Logik ohne Socket.io, Uhr und Engine werden hereingereicht,
// damit Tests Zeit vorspulen können. Der Run-State lebt NUR hier; jede Aktion geht durch engine.applyRunAction.
//
// Zeitregeln (Werte aus data/modes/moorwanderung/budgets.js, Einstellung „Tempo“)
//   Startdeck     starter s pro Spieler, Ablauf ⇒ erstes Startdeck
//   Pfad          eine gemeinsame Deadline für alle: Ebenen × node + Kämpfe × fight. Ablauf ⇒ { type: "budgetExpired" }
//                 für jeden, der noch nicht fertig ist (Knoten per Standardregel, laufende Kämpfe spielt die KI zu Ende).
//                 Die Clients warnen bei 60 s und 15 s.
//   Duell         Zug-Timer duelTurn s für den Menschen am Zug, Ablauf ⇒ { type: "timeout" }
//   Verbindung    Budgets laufen weiter (Aufgabe 5). Nach 5 Minuten Abwesenheit am Stück scheidet der Spieler aus.

const crypto = require('crypto');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ABANDON_MS = 5 * 60 * 1000;
const STALE_MS = 45 * 60 * 1000;
const NAME_MAX = 24;

/**
 * @param {{ engine: any, now?: () => number, send: (socketId: string, event: string, payload: any) => void,
 *   fingerprint?: string, randomSeed?: () => string }} deps
 */
function createRunRoomManager(deps) {
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
    return `W${code}`;
  }

  // ───────────── Ansichten ─────────────

  function roomInfo(room) {
    return {
      code: room.code,
      mode: 'moorwanderung',
      status: room.status,
      settings: room.settings,
      seedInput: room.seedInput,
      seed: room.run?.seed ?? null,
      hostSeat: room.hostSeat,
      seats: room.seats.map((s) => (s ? { name: s.name, connected: s.connected, ready: s.ready, rematch: !!s.rematch } : null)),
      spectators: room.spectators.size,
      fingerprint: deps.fingerprint || null,
    };
  }

  function timerInfo(room) {
    const t = { players: {} };
    if (room.pathDeadline) t.path = { deadline: room.pathDeadline.at, remaining: Math.max(0, room.pathDeadline.at - now()), total: room.pathDeadline.total };
    room.deadlines.forEach((d, p) => {
      if (d) t.players[p] = { deadline: d.at, remaining: Math.max(0, d.at - now()), total: d.total };
    });
    return t;
  }

  function sendRoom(room) {
    const info = roomInfo(room);
    for (const s of room.seats) if (s?.connected && s.socketId) send(s.socketId, 'mw:room', info);
    for (const id of room.spectators.keys()) send(id, 'mw:room', info);
  }

  function sendState(room, events = []) {
    if (!room.run) return;
    const timers = timerInfo(room);
    const serverNow = now();
    room.seats.forEach((s, p) => {
      if (!s?.connected || !s.socketId) return;
      send(s.socketId, 'mw:state', { view: engine.viewForRun(room.run, p), events: engine.eventsForRun(events, p), timers, serverNow, you: p });
    });
    if (room.settings.spectators && room.spectators.size) {
      const view = engine.viewForRun(room.run, null);
      const ev = engine.eventsForRun(events, null);
      for (const id of room.spectators.keys()) send(id, 'mw:state', { view, events: ev, timers, serverNow, you: null });
    }
  }

  function notice(room, text) {
    for (const s of room.seats) if (s?.connected && s.socketId) send(s.socketId, 'mw:notice', { text });
    for (const id of room.spectators.keys()) send(id, 'mw:notice', { text });
  }

  // ───────────── Timer ─────────────

  function refreshTimers(room) {
    const r = room.run;
    if (!r || r.phase === 'over') {
      room.deadlines = room.seats.map(() => null);
      room.pathDeadline = null;
      return;
    }
    const b = engine.runBudget(r);
    // Pfad: eine Deadline pro Pfadnummer für alle
    if (r.phase === 'path') {
      if (!room.pathDeadline || room.pathDeadline.pathNo !== r.pathNo) {
        const total = engine.pathBudgetSeconds(r) * 1000;
        room.pathDeadline = { pathNo: r.pathNo, at: now() + total, total };
      }
    } else {
      room.pathDeadline = null;
    }
    const waiting = engine.awaitingRun(r);
    room.deadlines = room.seats.map((_, p) => {
      if (!waiting.includes(p) || r.phase === 'path') return null;
      const secs = r.phase === 'starter' ? b.starter : b.duelTurn;
      const key = `${r.phase}:${engine.runDecisionKey(r, p)}`;
      const cur = room.deadlines[p];
      if (cur && cur.key === key) return cur;
      return { key, at: now() + secs * 1000, total: secs * 1000 };
    });
  }

  function apply(room, action) {
    const res = engine.applyRunAction(room.run, action);
    if (res.error) return res.error;
    room.run = res.state;
    room.updatedAt = now();
    if (room.run.phase === 'over' && room.status !== 'over') room.status = 'over';
    refreshTimers(room);
    sendState(room, res.events);
    if (room.status === 'over') sendRoom(room);
    return null;
  }

  /** Periodisch aufrufen (z. B. alle 500 ms). */
  function tick() {
    const t = now();
    for (const room of rooms.values()) {
      const anyone = room.seats.some((s) => s?.connected) || room.spectators.size > 0;
      if (!anyone && t - room.updatedAt > STALE_MS) {
        rooms.delete(room.code);
        continue;
      }
      if (room.status !== 'playing' || !room.run) continue;
      // Lange Abwesenheit: ausscheiden
      for (const [p, seat] of room.seats.entries()) {
        if (!seat || seat.connected || !room.run.players[p]?.alive || room.run.phase === 'over') continue;
        if (t - (seat.disconnectedAt || t) >= ABANDON_MS) {
          notice(room, `${seat.name} ist zu lange weg und scheidet aus.`);
          apply(room, { type: 'surrender', player: p });
        }
      }
      if (room.status !== 'playing') continue;
      // Gemeinsames Pfad-Budget
      if (room.pathDeadline && t >= room.pathDeadline.at) {
        const pathNo = room.pathDeadline.pathNo;
        for (let p = 0; p < room.seats.length; p++) {
          const r = room.run;
          if (r.phase !== 'path' || r.pathNo !== pathNo) break;
          if (!r.players[p].alive || r.path.players[p].done) continue;
          apply(room, { type: 'budgetExpired', player: p });
        }
        if (room.pathDeadline?.pathNo === pathNo) room.pathDeadline = null;
      }
      // Einzel-Timer (Startdeck, Duellzug)
      for (let p = 0; p < room.deadlines.length; p++) {
        const d = room.deadlines[p];
        if (d && t >= d.at) {
          room.deadlines[p] = null;
          const err = apply(room, { type: 'timeout', player: p });
          if (err) refreshTimers(room);
        }
      }
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
      if (room.status === 'lobby') s.ready = false;
    }
    sendRoom(room);
    if (room.run) sendState(room, []);
  }

  function attach(room, socketId, seat) {
    const old = sockets.get(socketId);
    if (old && old.code !== room.code) detach(socketId);
    sockets.set(socketId, { code: room.code, seat });
  }

  /** Tischgröße an die Einstellung anpassen (nur Lobby; besetzte Plätze bleiben). */
  function resizeSeats(room) {
    const want = room.settings.players;
    while (room.seats.length < want) room.seats.push(null);
    // Nur leere Plätze am Ende wegnehmen
    while (room.seats.length > want && room.seats[room.seats.length - 1] === null) room.seats.pop();
    room.settings.players = room.seats.length;
  }

  function create(socketId, payload = {}) {
    const token = cleanToken(payload.token);
    if (!token) return { ok: false, error: 'badToken' };
    const code = newCode();
    const room = {
      code,
      status: 'lobby',
      settings: engine.normalizeRunSettings(payload.settings),
      seedInput: engine.normalizeSeed(payload.seed || ''),
      hostSeat: 0,
      seats: [{ token, name: cleanName(payload.name), socketId, connected: true, ready: false, disconnectedAt: 0 }],
      spectators: new Map(),
      run: null,
      deadlines: [],
      pathDeadline: null,
      createdAt: now(),
      updatedAt: now(),
    };
    resizeSeats(room);
    rooms.set(code, room);
    attach(room, socketId, 0);
    sendRoom(room);
    return { ok: true, code, seat: 0, room: roomInfo(room) };
  }

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
        send(s.socketId, 'mw:kicked', { reason: 'otherWindow' });
        sockets.delete(s.socketId);
      }
      const wasAway = !s.connected;
      s.socketId = socketId;
      s.connected = true;
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
    if (room.run) sendState(room, []);
    return { ok: true, code, seat, room: roomInfo(room) };
  }

  function leave(socketId) {
    const { room, seat } = seatOfSocket(socketId);
    if (!room) return { ok: true };
    if (seat !== null && room.status === 'lobby') {
      room.seats[seat] = null;
      sockets.delete(socketId);
      if (room.hostSeat === seat) {
        const next = room.seats.findIndex((s) => s);
        room.hostSeat = next >= 0 ? next : 0;
      }
      sendRoom(room);
      return { ok: true };
    }
    if (seat !== null && room.status === 'playing' && room.run.players[seat]?.alive) apply(room, { type: 'surrender', player: seat });
    detach(socketId);
    return { ok: true };
  }

  function settings(socketId, payload = {}) {
    const { room, seat } = seatOfSocket(socketId);
    if (!room || seat === null) return { ok: false, error: 'notInRoom' };
    if (seat !== room.hostSeat) return { ok: false, error: 'notHost' };
    if (room.status !== 'lobby') return { ok: false, error: 'notInLobby' };
    const next = engine.normalizeRunSettings({ ...room.settings, ...(payload.settings || {}) });
    const seated = room.seats.filter(Boolean).length;
    if (next.players < seated) return { ok: false, error: 'tooManySeated' };
    // Besetzte Plätze nach vorn rücken, damit das Verkleinern nur leere Plätze entfernt
    if (next.players < room.seats.length) {
      const moved = room.seats.filter(Boolean);
      const hostToken = room.seats[room.hostSeat]?.token;
      room.seats = [...moved, ...Array(room.seats.length - moved.length).fill(null)];
      room.hostSeat = Math.max(0, room.seats.findIndex((s) => s?.token === hostToken));
      room.seats.forEach((s, i) => { if (s?.socketId) sockets.set(s.socketId, { code: room.code, seat: i }); });
    }
    room.settings = next;
    resizeSeats(room);
    if (payload.seed !== undefined) room.seedInput = engine.normalizeSeed(payload.seed);
    for (const s of room.seats) if (s) s.ready = false;
    sendRoom(room);
    return { ok: true };
  }

  function startRun(room) {
    const seed = room.seedInput || randomSeed();
    room.run = engine.createRun({ seed, settings: room.settings, names: room.seats.map((s) => s.name), salt: crypto.randomBytes(12).toString('hex') });
    room.status = 'playing';
    room.deadlines = room.seats.map(() => null);
    room.pathDeadline = null;
    for (const s of room.seats) { s.ready = false; s.rematch = false; }
    refreshTimers(room);
    sendRoom(room);
    sendState(room, [{ type: 'phase', phase: 'starter' }]);
  }

  function ready(socketId, payload = {}) {
    const { room, seat } = seatOfSocket(socketId);
    if (!room || seat === null) return { ok: false, error: 'notInRoom' };
    if (room.status !== 'lobby') return { ok: false, error: 'notInLobby' };
    room.seats[seat].ready = payload.ready !== false;
    if (room.seats.length >= 2 && room.seats.every((s) => s && s.connected && s.ready)) startRun(room);
    else sendRoom(room);
    return { ok: true };
  }

  function action(socketId, payload = {}) {
    const { room, seat } = seatOfSocket(socketId);
    if (!room || seat === null) return { ok: false, error: 'notInRoom' };
    if (room.status !== 'playing' || !room.run) return { ok: false, error: 'notPlaying' };
    const a = payload && typeof payload.action === 'object' ? payload.action : null;
    if (!a || typeof a.type !== 'string' || a.type === 'timeout' || a.type === 'budgetExpired') return { ok: false, error: 'badAction' };
    const err = apply(room, { ...a, player: seat });
    return err ? { ok: false, error: err } : { ok: true };
  }

  /** Neuer Run am selben Tisch, sobald alle wollen. */
  function rematch(socketId) {
    const { room, seat } = seatOfSocket(socketId);
    if (!room || seat === null) return { ok: false, error: 'notInRoom' };
    if (room.status !== 'over') return { ok: false, error: 'notOver' };
    room.seats[seat].rematch = true;
    if (room.seats.every((s) => s && s.connected && s.rematch)) {
      room.seedInput = '';
      startRun(room);
    } else {
      sendRoom(room);
    }
    return { ok: true };
  }

  return { create, join, leave, settings, ready, action, rematch, detach, tick, rooms };
}

module.exports = { createRunRoomManager, ABANDON_MS };
