// flickSoccer/roomManager.js — Online-Räume von Flick Soccer (1v1 per Link-Code).
//
// Serverautoritativ: Der Browser schickt nur „Scheibe i, Richtung × Kraft"; der Server prüft den Zug, rechnet ihn mit
// der gespiegelten Engine komplett durch (ein Schuss dauert < 5 ms) und verteilt Startzustand + Schuss + Ergebnis. Beide
// Browser spielen den Schuss mit derselben deterministischen Physik ab und übernehmen danach den Zustand vom Server.
//
// Ohne socket.io testbar: `send(socketId, event, payload)` wird hereingereicht, die Zeit über `now()`.
// Alles lebt im Speicher — Partien sind kurzlebig wie bei Connect 4.
//
// Turnier-Räume (createLocked, siehe tournamentManager.js): beide Plätze sind fest an die Token der zwei Spieler
// gebunden, die Regeln sind gesperrt, es gibt keine Revanche, und das Ergebnis geht per onResult an das Turnier.

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne I/O/0/1
const RECONNECT_GRACE_MS = 60 * 1000;
const STALE_AFTER_MS = 30 * 60 * 1000;
const GOAL_PAUSE_MS = 2400; // Tor-Einblendung im Browser (GoalBanner.jsx, 2300 ms), bevor neu aufgestellt wird
const INTRO_MS = 2900; // VS-Einblendung zum Anpfiff (VsIntro.jsx, 2700 ms)
const SETTLE_MS = 250;
const TIMEOUT_GRACE_MS = 600; // Laufzeit im Netz: Zugzeit erst etwas später als angezeigt beenden

function createRoomManager({ engine, send, now = Date.now }) {
  const rooms = new Map(); // code -> room
  const sockets = new Map(); // socketId -> { code, seat: 0 | 1 | null }

  const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Spieler';
  const cleanToken = (t) => (typeof t === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : null);

  function newCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (rooms.has(code));
    return code;
  }

  function view(room) {
    return {
      code: room.code,
      phase: room.phase,
      settings: room.settings,
      seats: room.seats.map((s) =>
        s ? { name: s.name, connected: s.connected, formation: s.formation, skin: s.skin, ready: s.ready, rematch: s.rematch } : null,
      ),
      spectators: room.spectators.size,
      match: room.match,
      matchNo: room.matchNo,
      lastShot: room.lastShot,
      turnEndsAt: room.turnEndsAt,
      forfeit: room.forfeit,
      locked: room.locked ? { tournament: room.locked.tournament, label: room.locked.label, startBy: room.locked.startBy } : null,
      serverNow: now(),
    };
  }

  function members(room) {
    const ids = [...room.spectators];
    for (const s of room.seats) if (s?.connected && s.socketId) ids.push(s.socketId);
    return ids;
  }

  function broadcast(room) {
    room.updatedAt = now();
    const v = view(room);
    for (const id of members(room)) send(id, 'fs:room', v);
  }

  function notice(room, text) {
    for (const id of members(room)) send(id, 'fs:notice', { text });
  }

  function turnDeadline(room, delayMs) {
    const secs = room.settings.turnSeconds;
    return secs > 0 ? now() + delayMs + secs * 1000 : null;
  }

  function startMatch(room) {
    room.match = engine.createMatch({
      settings: room.settings,
      formations: [room.seats[0].formation, room.seats[1].formation],
      startingTeam: room.startingTeam,
      seed: Math.floor(Math.random() * 0x7fffffff), // Power-up-Folge im Chaos-Modus
    });
    room.phase = 'playing';
    room.lastShot = null;
    room.forfeit = null;
    room.seats.forEach((s) => {
      s.ready = false;
      s.rematch = false;
    });
    room.matchNo += 1;
    room.turnEndsAt = turnDeadline(room, INTRO_MS);
  }

  // Turnier-Raum: Ergebnis genau einmal melden
  function report(room) {
    if (!room.locked || room.reported || room.phase !== 'over') return;
    room.reported = true;
    try {
      room.locked.onResult({ code: room.code, winner: room.match.winner, score: [...room.match.score], forfeit: room.forfeit });
    } catch (e) {
      console.error('[flick-soccer] Turnier-Ergebnis:', e);
    }
  }

  function endByForfeit(room, loserSeat) {
    if (room.phase !== 'playing') return;
    room.match = { ...room.match, winner: 1 - loserSeat };
    room.phase = 'over';
    room.forfeit = loserSeat;
    room.turnEndsAt = null;
    report(room);
  }

  function freeSeat(room, seat) {
    const s = room.seats[seat];
    if (s?.timer) clearTimeout(s.timer);
    // Turnier-Raum: der Platz bleibt reserviert (Wiederkommen möglich); mitten im Spiel zählt es trotzdem als Aufgabe
    if (room.locked) {
      s.timer = null;
      s.connected = false;
      s.socketId = null;
      s.ready = false;
      if (room.phase === 'playing') endByForfeit(room, seat);
      return;
    }
    room.seats[seat] = null;
    // Mitten im Spiel = Aufgabe: Ergebnis bleibt stehen, der Platz ist frei für einen neuen Gegner
    if (room.phase === 'playing') {
      endByForfeit(room, seat);
    } else {
      room.phase = 'lobby';
      room.forfeit = null;
      room.seats.forEach((o) => {
        if (o) {
          o.ready = false;
          o.rematch = false;
        }
      });
    }
  }

  function removeIfEmpty(room) {
    // Turnier-Raum: erst nach dem Abpfiff aufräumen — davor warten die reservierten Plätze auf ihre Spieler
    const empty = room.locked
      ? room.phase === 'over' && !room.seats.some((s) => s.connected) && room.spectators.size === 0
      : !room.seats[0] && !room.seats[1] && room.spectators.size === 0;
    if (empty) {
      rooms.delete(room.code);
      return true;
    }
    return false;
  }

  function attach(room, socketId, seat) {
    sockets.set(socketId, { code: room.code, seat });
  }

  function entryOf(socketId) {
    const e = sockets.get(socketId);
    if (!e) return null;
    const room = rooms.get(e.code);
    if (!room) return null;
    return { room, seat: e.seat };
  }

  // ── Aktionen ────────────────────────────────────────────────────────────────────────────

  function create(socketId, p) {
    leave(socketId);
    const token = cleanToken(p.token);
    if (!token) return { ok: false, error: 'Ungültige Sitzung.' };
    const code = newCode();
    const room = {
      code,
      phase: 'lobby',
      settings: engine.normalizeSettings(p.settings),
      seats: [null, null],
      spectators: new Set(),
      match: null,
      lastShot: null,
      seq: 0,
      turnEndsAt: null,
      forfeit: null,
      startingTeam: 0,
      matchNo: 0,
      updatedAt: now(),
    };
    room.seats[0] = {
      name: cleanName(p.name), token, socketId, connected: true,
      formation: engine.isFormation(p.formation) ? p.formation : engine.DEFAULT_FORMATION,
      skin: engine.isSkin(p.skin) ? p.skin : engine.DEFAULT_SKIN,
      ready: false, rematch: false, timer: null,
    };
    rooms.set(code, room);
    attach(room, socketId, 0);
    broadcast(room);
    return { ok: true, code, seat: 0 };
  }

  function join(socketId, p) {
    const code = String(p.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return { ok: false, error: 'notFound' };
    const token = cleanToken(p.token);
    if (!token) return { ok: false, error: 'Ungültige Sitzung.' };
    const prev = sockets.get(socketId);
    if (prev && prev.code !== code) leave(socketId);
    room.spectators.delete(socketId);

    // Wiederverbinden: gleicher Token = gleicher Platz (auch aus einem zweiten Fenster — das alte fliegt raus)
    for (const seat of [0, 1]) {
      const s = room.seats[seat];
      if (s && s.token === token) {
        if (s.timer) clearTimeout(s.timer);
        s.timer = null;
        if (s.socketId && s.socketId !== socketId && s.connected) {
          send(s.socketId, 'fs:kicked', { reason: 'Dein Platz wurde in einem anderen Fenster geöffnet.' });
          sockets.delete(s.socketId);
        }
        s.socketId = socketId;
        s.connected = true;
        if (engine.isSkin(p.skin)) s.skin = p.skin;
        // Turnier-Raum: beim ersten Betreten die eigene Aufstellung mitbringen
        if (s.fresh) {
          s.fresh = false;
          if (engine.isFormation(p.formation)) s.formation = p.formation;
        }
        attach(room, socketId, seat);
        broadcast(room);
        return { ok: true, code, seat };
      }
    }

    const free = room.seats[0] ? (room.seats[1] ? null : 1) : 0;
    if (free !== null && room.phase !== 'playing') {
      room.seats[free] = {
        name: cleanName(p.name), token, socketId, connected: true,
        formation: engine.isFormation(p.formation) ? p.formation : engine.DEFAULT_FORMATION,
        skin: engine.isSkin(p.skin) ? p.skin : engine.DEFAULT_SKIN,
        ready: false, rematch: false, timer: null,
      };
      attach(room, socketId, free);
      notice(room, `${room.seats[free].name} ist beigetreten.`);
      broadcast(room);
      return { ok: true, code, seat: free };
    }

    room.spectators.add(socketId);
    attach(room, socketId, null);
    broadcast(room);
    return { ok: true, code, seat: null, spectator: true };
  }

  function setFormation(socketId, p) {
    const e = entryOf(socketId);
    if (!e || e.seat === null) return { ok: false };
    if (e.room.phase === 'playing') return { ok: false, error: 'Aufstellung nur vor dem Spiel.' };
    if (!engine.isFormation(p.formation)) return { ok: false };
    e.room.seats[e.seat].formation = p.formation;
    broadcast(e.room);
    return { ok: true };
  }

  // Design: rein kosmetisch, deshalb jederzeit änderbar. Ob es im Browser freigeschaltet ist, kann der Server nicht wissen.
  function setSkin(socketId, p) {
    const e = entryOf(socketId);
    if (!e || e.seat === null || !engine.isSkin(p.skin)) return { ok: false };
    e.room.seats[e.seat].skin = p.skin;
    broadcast(e.room);
    return { ok: true };
  }

  function setSettings(socketId, p) {
    const e = entryOf(socketId);
    if (!e || e.seat !== 0 || e.room.phase === 'playing' || e.room.locked) return { ok: false };
    e.room.settings = engine.normalizeSettings({ ...e.room.settings, ...(p.settings || {}) });
    e.room.seats.forEach((s) => {
      if (s) s.ready = false;
    });
    broadcast(e.room);
    return { ok: true };
  }

  function setReady(socketId, p) {
    const e = entryOf(socketId);
    if (!e || e.seat === null || e.room.phase !== 'lobby') return { ok: false };
    const { room } = e;
    room.seats[e.seat].ready = !!p.ready;
    if (room.seats[0]?.ready && room.seats[1]?.ready) startMatch(room);
    broadcast(room);
    return { ok: true };
  }

  function shoot(socketId, p) {
    const e = entryOf(socketId);
    if (!e || e.seat === null) return { ok: false };
    const { room } = e;
    if (room.phase !== 'playing') return { ok: false };
    const start = room.match.state;
    const played = engine.playShot(room.match, e.seat, p);
    if (!played) return { ok: false, error: 'Nicht dein Zug.' };
    room.seq += 1;
    // power: gespielte Karte, mods: Karte + Ereignis des Zugs (Chaos-Modus) — die Browser brauchen es, um den Schuss
    // genauso abzuspielen, wie der Server ihn gerechnet hat
    room.lastShot = {
      seq: room.seq, team: e.seat, start, shot: played.shot, goal: played.result.goal, power: played.power, mods: played.mods,
    };
    room.match = played.match;
    const scored = played.result.goal !== null;
    const animMs = Math.ceil((played.result.steps * engine.PHYS.DT) * 1000)
      + (scored ? GOAL_PAUSE_MS : SETTLE_MS)
      + (scored && room.settings.replay ? engine.replayMs(played.result.steps) : 0);
    if (room.match.winner !== null) {
      room.phase = 'over';
      room.turnEndsAt = null;
      report(room);
    } else {
      room.turnEndsAt = turnDeadline(room, animMs);
    }
    broadcast(room);
    return { ok: true, seq: room.seq };
  }

  // Emote: feste Reaktion, an alle im Raum; pro Platz höchstens eine alle EMOTE_COOLDOWN_MS
  function emote(socketId, p) {
    const e = entryOf(socketId);
    if (!e || e.seat === null || !engine.EMOTE_IDS.includes(p.id)) return { ok: false };
    const s = e.room.seats[e.seat];
    const t = now();
    if (s.lastEmote && t - s.lastEmote < engine.EMOTE_COOLDOWN_MS) return { ok: false, error: 'Nicht so schnell.' };
    s.lastEmote = t;
    for (const id of members(e.room)) send(id, 'fs:emote', { seat: e.seat, id: p.id });
    return { ok: true };
  }

  function rematch(socketId) {
    const e = entryOf(socketId);
    if (!e || e.seat === null || e.room.phase !== 'over') return { ok: false };
    const { room } = e;
    if (room.locked) return { ok: false, error: 'Im Turnier gibt es keine Revanche.' };
    if (!room.seats[0] || !room.seats[1]) return { ok: false, error: 'Warte auf einen Gegner.' };
    room.seats[e.seat].rematch = true;
    if (room.seats[0].rematch && room.seats[1].rematch) {
      room.startingTeam = 1 - room.startingTeam;
      startMatch(room);
    }
    broadcast(room);
    return { ok: true };
  }

  function leave(socketId) {
    const e = entryOf(socketId);
    sockets.delete(socketId);
    if (!e) return { ok: true };
    const { room, seat } = e;
    if (seat === null) {
      room.spectators.delete(socketId);
    } else if (room.seats[seat]?.socketId === socketId) {
      const name = room.seats[seat].name;
      freeSeat(room, seat);
      notice(room, room.phase === 'over' && room.forfeit === seat ? `${name} hat aufgegeben.` : `${name} hat den Raum verlassen.`);
    }
    if (!removeIfEmpty(room)) broadcast(room);
    return { ok: true };
  }

  function disconnect(socketId) {
    const e = entryOf(socketId);
    if (!e) return;
    const { room, seat } = e;
    if (seat === null) {
      sockets.delete(socketId);
      room.spectators.delete(socketId);
      if (!removeIfEmpty(room)) broadcast(room);
      return;
    }
    const s = room.seats[seat];
    if (!s || s.socketId !== socketId) {
      sockets.delete(socketId);
      return;
    }
    sockets.delete(socketId);
    s.connected = false;
    s.timer = setTimeout(() => {
      const r = rooms.get(room.code);
      if (!r || r.seats[seat] !== s || s.connected) return;
      freeSeat(r, seat);
      notice(r, `${s.name} ist nicht zurückgekommen.`);
      if (!removeIfEmpty(r)) broadcast(r);
    }, RECONNECT_GRACE_MS);
    if (s.timer.unref) s.timer.unref();
    broadcast(room);
  }

  /** Regelmäßig aufrufen: Zugzeit, verwaiste Räume. */
  function tick() {
    const t = now();
    for (const room of rooms.values()) {
      if (room.phase === 'playing' && room.turnEndsAt && t > room.turnEndsAt + TIMEOUT_GRACE_MS) {
        room.match = engine.passTurn(room.match);
        room.turnEndsAt = turnDeadline(room, 0);
        notice(room, 'Zugzeit abgelaufen.');
        broadcast(room);
      }
      const someone = room.seats.some((s) => s?.connected) || room.spectators.size > 0;
      // Turnier-Räume vor dem Abpfiff gehören dem Turnier (Frist, Absage) und verfallen hier nicht
      if (room.locked && room.phase !== 'over') continue;
      if (!someone && t - room.updatedAt > STALE_AFTER_MS) {
        room.seats.forEach((s) => s?.timer && clearTimeout(s.timer));
        rooms.delete(room.code);
      }
    }
  }

  // ── Turnier-Räume ───────────────────────────────────────────────────────────────────────

  /**
   * Raum für eine Turnier-Paarung: players = [{ name, token }, { name, token }] (Platz 0 = Rot, 1 = Blau).
   * code: fester Code (nach einem Neustart derselbe wie vorher), sonst ein neuer.
   */
  function createLocked({ code, settings, players, tournament, label, startBy, onResult }) {
    const c = code && !rooms.has(code) ? code : newCode();
    const room = {
      code: c,
      phase: 'lobby',
      settings: engine.normalizeSettings(settings),
      seats: players.map((p) => ({
        name: cleanName(p.name), token: p.token, socketId: null, connected: false,
        formation: engine.DEFAULT_FORMATION, skin: engine.DEFAULT_SKIN,
        ready: false, rematch: false, timer: null, fresh: true,
      })),
      spectators: new Set(),
      match: null,
      lastShot: null,
      seq: 0,
      turnEndsAt: null,
      forfeit: null,
      startingTeam: Math.random() < 0.5 ? 0 : 1,
      matchNo: 0,
      updatedAt: now(),
      locked: { tournament, label, startBy, onResult },
      reported: false,
    };
    rooms.set(c, room);
    return c;
  }

  /** null, wenn es den Raum nicht gibt; sonst Phase und wer gerade verbunden ist. */
  function lockedInfo(code) {
    const room = rooms.get(code);
    if (!room || !room.locked) return null;
    return { phase: room.phase, present: room.seats.map((s) => s.connected) };
  }

  /** Frist abgelaufen und beide da: Anpfiff, auch wenn nicht beide „Bereit" gedrückt haben. */
  function forceStart(code) {
    const room = rooms.get(code);
    if (!room || !room.locked || room.phase !== 'lobby' || !room.seats.every((s) => s.connected)) return false;
    startMatch(room);
    broadcast(room);
    return true;
  }

  /** Turnier-Raum schließen (kampflos entschieden, vom Veranstalter entschieden, Turnier abgesagt). */
  function closeLocked(code, reason) {
    const room = rooms.get(code);
    if (!room || !room.locked) return;
    room.reported = true;
    for (const id of members(room)) {
      send(id, 'fs:closed', { reason, tournament: room.locked.tournament });
      sockets.delete(id);
    }
    room.seats.forEach((s) => s.timer && clearTimeout(s.timer));
    rooms.delete(code);
  }

  return {
    createLocked, lockedInfo, forceStart, closeLocked,
    create, join, setFormation, setSkin, setSettings, setReady, shoot, emote, rematch, leave, disconnect, tick,
    _rooms: rooms,
  };
}

module.exports = { createRoomManager };
