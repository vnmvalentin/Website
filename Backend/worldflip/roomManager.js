// worldflip/roomManager.js — Online-Räume von Worldflip (2 bis 4 Spieler per Link-Code, freie Plätze füllen Bots).
//
// Serverautoritativ: Der Browser schickt nur den Zug; der Server prüft ihn mit der gespiegelten Engine
// (worldflip/shared, erzeugt mit tools/spiegel.js) und schickt jedem Platz SEINE Sicht (fremde Hände nur als Anzahl)
// samt den Ereignissen des Zugs zum Abspielen.
//
// Ohne socket.io testbar: `send(socketId, event, payload)` wird hereingereicht, die Zeit über `now()`.
// Alles lebt im Speicher — Partien sind kurzlebig.
//
// Plätze: In der Lobby ist `seats` die Liste der Menschen (Platz 0 = Gastgeber). Beim Start wird daraus `table`
// (Menschen + Bots); der Index in `table` ist der Platz in der Engine. Wer mitten im Spiel geht, wird zum Bot.
//
// 2 gegen 2: Jeder Mensch wählt in der Lobby sein Team (person.team). Beim Start sitzen Team 0 auf den Plätzen 0 und 2,
// Team 1 auf 1 und 3 — Partner also gegenüber; freie Plätze füllen Bots.

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne I/O/0/1
const RECONNECT_GRACE_MS = 60 * 1000;
const STALE_AFTER_MS = 10 * 60 * 1000;
const BOT_THINK_MS = 1600; // Bedenkzeit eines Bots nach dem Abspielen des letzten Zugs
const AWAY_MS = 4000; // getrennter Spieler am Zug: so lange warten, dann spielt ein Bot für ihn
const TIMEOUT_GRACE_MS = 600;
const BOT_NAMES = ['Kiesel', 'Funke', 'Moos', 'Nebel', 'Qualle', 'Komet'];

function createRoomManager({ engine, send, now = Date.now, random = Math.random }) {
  const rooms = new Map(); // code -> room
  const sockets = new Map(); // socketId -> { code, token }

  const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Spieler';
  const cleanToken = (t) => (typeof t === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : null);
  // Aussehen des Blobs: drei kleine Zahlen (Farbe, Hut, Gesicht). Was sie bedeuten, weiß nur der Browser (skins.js).
  const part = (v) => (Number.isInteger(v) && v >= 0 && v < 32 ? v : 0);
  const cleanSkin = (k) => (k && typeof k === 'object' ? { c: part(k.c), h: part(k.h), f: part(k.f) } : null);
  const botSkin = () => ({ c: Math.floor(random() * 10), h: Math.floor(random() * 10), f: Math.floor(random() * 6) });

  function newCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]).join('');
    } while (rooms.has(code));
    return code;
  }

  const inGame = (room) => room.phase !== 'lobby';
  const list = (room) => (inGame(room) ? room.table : room.seats);
  /** Platz eines Tokens (Lobby: Index in seats, sonst Platz am Tisch) oder null. */
  function seatOf(room, token) {
    const i = list(room).findIndex((p) => p.token === token && !p.left);
    return i < 0 ? null : i;
  }
  const hostToken = (room) => room.seats[0]?.token || null;

  function viewOf(room, token) {
    const seat = seatOf(room, token);
    return {
      code: room.code,
      phase: room.phase,
      settings: room.settings,
      players: list(room).map((p, i) => ({
        name: p.name, bot: !!p.bot, connected: p.bot ? true : p.connected, skin: p.skin || null,
        team: inGame(room) ? (room.state?.teams ? room.state.teams[i] : null) : room.settings.teams ? p.team : null,
      })),
      // wer bei der nächsten Runde dabei ist (nach dem Ende können Zuschauer nachgerückt und Spieler gegangen sein)
      humans: room.seats.map((p) => p.name),
      you: seat,
      host: token !== null && token === hostToken(room),
      spectators: room.spectators.size,
      game: room.state ? engine.viewFor(room.state, seat) : null,
      batch: room.batch ? { seq: room.batch.seq, events: engine.eventsFor(room.batch.events, seat) } : null,
      turnEndsAt: room.turnEndsAt,
      matchNo: room.matchNo,
      serverNow: now(),
    };
  }

  function members(room) {
    const out = [];
    for (const p of room.seats) if (p.connected && p.socketId) out.push({ id: p.socketId, token: p.token });
    for (const [id, sp] of room.spectators) out.push({ id, token: sp.token });
    return out;
  }

  function broadcast(room) {
    room.updatedAt = now();
    for (const m of members(room)) send(m.id, 'wf:room', viewOf(room, m.token));
  }

  function notice(room, text) {
    for (const m of members(room)) send(m.id, 'wf:notice', { text });
  }

  function entryOf(socketId) {
    const e = sockets.get(socketId);
    if (!e) return null;
    const room = rooms.get(e.code);
    if (!room) return null;
    return { room, token: e.token, person: room.seats.find((p) => p.token === e.token) || null };
  }

  function removeIfEmpty(room) {
    if (room.seats.length || room.spectators.size) return false;
    rooms.delete(room.code);
    return true;
  }

  function newPerson(room, p, token, socketId) {
    // Team: dorthin, wo weniger Menschen sind
    const count = [0, 0];
    for (const s of room.seats) count[s.team] += 1;
    return { name: cleanName(p.name), skin: cleanSkin(p.skin), token, socketId, connected: true, timer: null, awaySince: 0, team: count[1] < count[0] ? 1 : 0 };
  }

  // Zuschauer rücken auf freie Plätze nach, sobald kein Spiel läuft
  function promoteSpectators(room) {
    if (room.phase === 'playing') return;
    for (const [id, sp] of [...room.spectators]) {
      if (room.seats.length >= engine.RULES.MAX_PLAYERS) break;
      room.spectators.delete(id);
      room.seats.push(newPerson(room, sp, sp.token, id));
    }
  }

  // ── Spielablauf ─────────────────────────────────────────────────────────────────────────

  function pace(room, events) {
    const t = now() + engine.durationOf(events);
    room.readyAt = t + BOT_THINK_MS;
    room.turnEndsAt = room.state.winner === null ? t + room.settings.turnSeconds * 1000 : null;
  }

  function startGame(room) {
    const names = BOT_NAMES.slice().sort(() => random() - 0.5);
    let table;
    if (room.settings.teams) {
      // Partner gegenüber: Team 0 auf den Plätzen 0 und 2, Team 1 auf 1 und 3
      const t = [room.seats.filter((p) => p.team === 0), room.seats.filter((p) => p.team === 1)];
      table = [t[0][0], t[1][0], t[0][1], t[1][1]].map((p, i) => p || { name: names[i], bot: true, skin: botSkin() });
    } else {
      table = room.seats.map((p) => p); // dieselben Objekte: Verbindung und Name bleiben aktuell
      if (room.settings.bots) while (table.length < room.settings.players) table.push({ name: names[table.length], bot: true, skin: botSkin() });
    }
    room.table = table;
    room.state = engine.createGame({
      players: table.length,
      handSize: room.settings.handSize,
      teams: room.settings.teams,
      seed: Math.floor(random() * 0x7fffffff),
    });
    room.phase = 'playing';
    room.matchNo += 1;
    room.seq += 1;
    room.batch = { seq: room.seq, events: [] };
    room.readyAt = now() + 3500; // Austeilen im Browser
    room.turnEndsAt = room.readyAt + room.settings.turnSeconds * 1000;
  }

  function act(room, seat, action) {
    const r = engine.apply(room.state, seat, action);
    if (!r.ok) return r;
    room.state = r.state;
    room.seq += 1;
    room.batch = { seq: room.seq, events: r.events };
    pace(room, r.events);
    if (r.state.winner !== null) {
      room.phase = 'over';
      promoteSpectators(room);
    }
    broadcast(room);
    return { ok: true, seq: room.seq };
  }

  // ── Aktionen ────────────────────────────────────────────────────────────────────────────

  function create(socketId, p) {
    leave(socketId);
    const token = cleanToken(p.token);
    if (!token) return { ok: false, error: 'Ungültige Sitzung.' };
    const code = newCode();
    const room = {
      code, phase: 'lobby', settings: engine.normalizeSettings(p.settings),
      seats: [], table: [], spectators: new Map(),
      state: null, batch: null, seq: 0, readyAt: 0, turnEndsAt: null, matchNo: 0, updatedAt: now(),
    };
    room.seats.push(newPerson(room, p, token, socketId));
    rooms.set(code, room);
    sockets.set(socketId, { code, token });
    broadcast(room);
    return { ok: true, code };
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

    // Wiederverbinden: gleicher Token = gleicher Platz (ein zweites Fenster verdrängt das erste)
    const known = room.seats.find((s) => s.token === token);
    if (known) {
      if (known.timer) clearTimeout(known.timer);
      known.timer = null;
      if (known.socketId && known.socketId !== socketId && known.connected) {
        send(known.socketId, 'wf:kicked', { reason: 'Dein Platz wurde in einem anderen Fenster geöffnet.' });
        sockets.delete(known.socketId);
      }
      known.socketId = socketId;
      known.connected = true;
      known.awaySince = 0;
      sockets.set(socketId, { code, token });
      broadcast(room);
      return { ok: true, code };
    }

    sockets.set(socketId, { code, token });
    if (room.phase !== 'playing' && room.seats.length < engine.RULES.MAX_PLAYERS) {
      const person = newPerson(room, p, token, socketId);
      room.seats.push(person);
      notice(room, `${person.name} ist beigetreten.`);
      broadcast(room);
      return { ok: true, code };
    }
    room.spectators.set(socketId, { name: cleanName(p.name), skin: p.skin, token });
    broadcast(room);
    return { ok: true, code, spectator: true };
  }

  function setSettings(socketId, p) {
    const e = entryOf(socketId);
    if (!e || e.token !== hostToken(e.room) || e.room.phase === 'playing') return { ok: false };
    e.room.settings = engine.normalizeSettings({ ...e.room.settings, ...(p.settings || {}) });
    broadcast(e.room);
    return { ok: true };
  }

  /** Eigenes Team wählen (nur 2 gegen 2, nicht während einer Runde). */
  function setTeam(socketId, p) {
    const e = entryOf(socketId);
    if (!e || !e.person || e.room.phase === 'playing' || (p.team !== 0 && p.team !== 1)) return { ok: false };
    e.person.team = p.team;
    broadcast(e.room);
    return { ok: true };
  }

  function start(socketId) {
    const e = entryOf(socketId);
    if (!e || e.token !== hostToken(e.room)) return { ok: false, error: 'Nur der Gastgeber startet.' };
    const { room } = e;
    if (room.phase === 'playing') return { ok: false };
    promoteSpectators(room);
    if (room.settings.teams) {
      const size = [0, 1].map((t) => room.seats.filter((p) => p.team === t).length);
      if (size[0] > 2 || size[1] > 2) return { ok: false, error: 'Höchstens zwei Spieler pro Team.' };
      if (!room.settings.bots && room.seats.length < 4) return { ok: false, error: 'Für 2 gegen 2 braucht es vier Spieler — oder Bots einschalten.' };
    }
    const total = room.settings.bots ? Math.max(room.seats.length, room.settings.players) : room.seats.length;
    if (total < engine.RULES.MIN_PLAYERS) return { ok: false, error: 'Mindestens zwei Spieler — oder Bots einschalten.' };
    startGame(room);
    broadcast(room);
    return { ok: true };
  }

  function action(socketId, p) {
    const e = entryOf(socketId);
    if (!e || e.room.phase !== 'playing') return { ok: false };
    const seat = seatOf(e.room, e.token);
    if (seat === null) return { ok: false };
    return act(e.room, seat, p.action);
  }

  // Mensch verlässt den Raum endgültig: aus der Liste; mitten im Spiel übernimmt ein Bot seinen Platz
  function dropPerson(room, person) {
    if (person.timer) clearTimeout(person.timer);
    room.seats = room.seats.filter((s) => s !== person);
    if (inGame(room)) {
      const i = room.table.indexOf(person);
      if (i >= 0) room.table[i] = { name: `${person.name} (Bot)`, bot: true, skin: person.skin };
    }
    if (room.phase === 'playing' && !room.seats.length) {
      // niemand mehr da: die Bots spielen nicht allein weiter
      room.phase = 'over';
      room.turnEndsAt = null;
    }
    promoteSpectators(room);
  }

  function leave(socketId) {
    const e = entryOf(socketId);
    sockets.delete(socketId);
    if (!e) return { ok: true };
    const { room, person } = e;
    if (room.spectators.delete(socketId)) {
      if (!removeIfEmpty(room)) broadcast(room);
      return { ok: true };
    }
    if (person && person.socketId === socketId) {
      dropPerson(room, person);
      notice(room, `${person.name} hat den Raum verlassen.`);
    }
    if (!removeIfEmpty(room)) broadcast(room);
    return { ok: true };
  }

  function disconnect(socketId) {
    const e = entryOf(socketId);
    sockets.delete(socketId);
    if (!e) return;
    const { room, person } = e;
    if (room.spectators.delete(socketId)) {
      if (!removeIfEmpty(room)) broadcast(room);
      return;
    }
    if (!person || person.socketId !== socketId) return;
    person.connected = false;
    person.awaySince = now();
    person.timer = setTimeout(() => {
      const r = rooms.get(room.code);
      if (!r || !r.seats.includes(person) || person.connected) return;
      dropPerson(r, person);
      notice(r, `${person.name} ist nicht zurückgekommen.`);
      if (!removeIfEmpty(r)) broadcast(r);
    }, RECONNECT_GRACE_MS);
    if (person.timer.unref) person.timer.unref();
    broadcast(room);
  }

  /** Regelmäßig aufrufen: Bots, Zugzeit, getrennte Spieler, verwaiste Räume. */
  function tick() {
    const t = now();
    for (const room of rooms.values()) {
      const someone = room.seats.some((s) => s.connected) || room.spectators.size > 0;
      if (!someone && t - room.updatedAt > STALE_AFTER_MS) {
        room.seats.forEach((s) => s.timer && clearTimeout(s.timer));
        rooms.delete(room.code);
        continue;
      }
      if (room.phase !== 'playing' || !someone || t < room.readyAt) continue;
      const seat = room.state.turn;
      const p = room.table[seat];
      const away = !p.bot && !p.connected && t - p.awaySince > AWAY_MS;
      const timeout = !p.bot && room.turnEndsAt && t > room.turnEndsAt + TIMEOUT_GRACE_MS;
      if (!p.bot && !away && !timeout) continue;
      if (timeout && p.connected) notice(room, `Zugzeit abgelaufen — für ${p.name} wurde gespielt.`);
      const r = act(room, seat, engine.botAction(room.state, seat, random));
      if (!r.ok) act(room, seat, room.state.drawn.length || room.state.combo !== null ? { t: 'pass' } : { t: 'draw' });
    }
  }

  return { create, join, setSettings, setTeam, start, action, leave, disconnect, tick, _rooms: rooms };
}

module.exports = { createRoomManager };
