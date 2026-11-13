// flickSoccer/tournamentManager.js — Turniere von Flick Soccer: K.-o.-Baum, Regeln je Runde, Anmeldung per Link.
//
// Erstellen und steuern darf nur der Admin (ctx.isAdmin kommt aus der Twitch-Sitzung des Sockets, siehe index.js).
// Mitspielen geht ohne Login: wie in den Räumen ist der Token aus dem Browser (flickSoccer.token) der Ausweis.
// Token verlassen den Server nie; nach außen hat jeder Spieler nur eine kurze ID.
//
// Ablauf: signup (Anmeldung offen) → running (Baum ausgelost, Paarungen laufen, sobald beide Spieler feststehen)
//         → done | cancelled.
// Jede spielbare Paarung bekommt einen Turnier-Raum im Raum-Manager (createLocked). Dessen Ergebnis kommt per
// onResult zurück und rückt den Sieger im Baum vor. Wer bis zur Frist nicht im Raum ist, verliert kampflos.
//
// Regeln je Runde: `rules` ist nach Runden geordnet, das letzte Element gilt immer fürs Finale. Vor dem Start hat die
// Liste so viele Einträge wie der Baum bei voller Besetzung Runden hätte; melden sich weniger an, fallen die FRÜHEN
// Runden weg (Finale bleibt Finale).
//
// Ohne socket.io testbar: send(socketId, event, payload), now() und der Speicher (store) werden hereingereicht.

const {
  MIN_PLAYERS, bracketSize, roundCount, shuffle, buildBracket, findMatch, setResult, playableMatches, champion,
} = require('./bracket');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SIZES = [4, 8, 16, 32, 64];
const DEFAULT_SIZE = 16;
const MAX_OPEN = 20; // so viele Turniere dürfen gleichzeitig offen oder am Laufen sein
const READY_MS = 3 * 60 * 1000; // so lange haben beide Zeit, im Raum zu erscheinen
const KEEP_DONE_MS = 14 * 24 * 60 * 60 * 1000; // beendete und abgesagte Turniere
const KEEP_IDLE_MS = 30 * 24 * 60 * 60 * 1000; // nie gestartete

function createTournamentManager({ engine, rooms, send, now = Date.now, store = null, random = Math.random }) {
  const tournaments = new Map(); // code -> Turnier
  const watchers = new Map(); // socketId -> { code, token }
  const roomIndex = new Map(); // Raumcode -> { code, matchId }

  const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  const cleanTitle = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Turnier';
  const cleanToken = (t) => (typeof t === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : null);
  const randomId = (len) => Array.from({ length: len }, () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]).join('');

  function newCode() {
    let code;
    do code = randomId(6);
    while (tournaments.has(code));
    return code;
  }

  // Regeln auf die gewünschte Rundenzahl bringen: am Finale ausgerichtet, fehlende frühe Runden bekommen die erste Regel
  function fitRules(rules, count) {
    const list = (Array.isArray(rules) ? rules : []).slice(-count).map((r) => engine.normalizeSettings(r || {}));
    if (!list.length) list.push(engine.normalizeSettings({}));
    while (list.length < count) list.unshift({ ...list[0] });
    return list;
  }

  const playerOf = (t, token) => (token ? t.players.find((p) => p.token === token) || null : null);
  const playerById = (t, id) => t.players.find((p) => p.id === id) || null;

  function view(t) {
    return {
      code: t.code,
      name: t.name,
      status: t.status,
      maxPlayers: t.maxPlayers,
      rules: t.rules,
      players: t.players.map((p) => ({ id: p.id, name: p.name })),
      rounds: t.rounds,
      champion: t.rounds ? champion(t.rounds) : null,
      createdAt: t.createdAt,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt,
      serverNow: now(),
    };
  }

  function summary(t) {
    const champ = t.rounds ? playerById(t, champion(t.rounds)) : null;
    return {
      code: t.code, name: t.name, status: t.status, players: t.players.length, maxPlayers: t.maxPlayers,
      champion: champ ? champ.name : null, createdAt: t.createdAt,
    };
  }

  function persist(t) {
    t.updatedAt = now();
    if (!store) return;
    try {
      store.save(t.code, t);
    } catch (e) {
      console.error('[flick-soccer] Turnier speichern:', e);
    }
  }

  function broadcast(t) {
    const v = view(t);
    for (const [socketId, w] of watchers) {
      if (w.code !== t.code) continue;
      const me = playerOf(t, w.token);
      send(socketId, 'ft:state', { ...v, me: me ? me.id : null });
    }
  }

  function changed(t) {
    persist(t);
    broadcast(t);
  }

  // ── Paarungen ↔ Räume ───────────────────────────────────────────────────────────────────

  function roundLabel(t, round) {
    const left = t.rounds.length - round;
    if (left === 1) return 'Finale';
    if (left === 2) return 'Halbfinale';
    if (left === 3) return 'Viertelfinale';
    if (left === 4) return 'Achtelfinale';
    return `Runde ${round + 1}`;
  }

  function openRoom(t, m, keepCode = null) {
    const a = playerById(t, m.a);
    const b = playerById(t, m.b);
    m.deadline = now() + READY_MS;
    m.status = 'ready';
    m.room = rooms.createLocked({
      code: keepCode,
      settings: t.rules[m.round],
      players: [{ name: a.name, token: a.token }, { name: b.name, token: b.token }],
      tournament: t.code,
      label: `${t.name} · ${roundLabel(t, m.round)}`,
      startBy: m.deadline,
      onResult: (r) => onRoomResult(r),
    });
    roomIndex.set(m.room, { code: t.code, matchId: m.id });
  }

  function openPlayable(t) {
    for (const m of playableMatches(t.rounds)) openRoom(t, m);
  }

  function finishMatch(t, m, winnerId, result) {
    if (m.room) roomIndex.delete(m.room);
    setResult(t.rounds, m, winnerId, result);
    if (champion(t.rounds)) {
      t.status = 'done';
      t.finishedAt = now();
    } else {
      openPlayable(t);
    }
  }

  function onRoomResult({ code, winner, score, forfeit }) {
    const ref = roomIndex.get(code);
    const t = ref && tournaments.get(ref.code);
    const m = t && t.rounds && findMatch(t.rounds, ref.matchId);
    if (!m || m.status === 'done' || t.status !== 'running') return;
    finishMatch(t, m, winner === 0 ? m.a : m.b, { score, how: forfeit !== null && forfeit !== undefined ? 'forfeit' : 'played' });
    changed(t);
  }

  function closeRooms(t, reason) {
    if (!t.rounds) return;
    for (const round of t.rounds) {
      for (const m of round) {
        if (!m.room) continue;
        roomIndex.delete(m.room);
        rooms.closeLocked(m.room, reason);
        m.room = null;
      }
    }
  }

  // ── Aktionen: alle ──────────────────────────────────────────────────────────────────────

  function list(socketId, p, ctx) {
    const all = [...tournaments.values()].sort((a, b) => b.createdAt - a.createdAt).map(summary);
    return { ok: true, tournaments: all, canCreate: !!ctx?.isAdmin, sizes: SIZES };
  }

  function watch(socketId, p, ctx) {
    const code = String(p.code || '').trim().toUpperCase();
    const t = tournaments.get(code);
    if (!t) return { ok: false, error: 'notFound' };
    const token = cleanToken(p.token);
    watchers.set(socketId, { code, token });
    const me = playerOf(t, token);
    return { ok: true, isAdmin: !!ctx?.isAdmin, state: { ...view(t), me: me ? me.id : null } };
  }

  function unwatch(socketId) {
    watchers.delete(socketId);
    return { ok: true };
  }

  function signup(socketId, p) {
    const t = tournaments.get(String(p.code || '').toUpperCase());
    if (!t) return { ok: false, error: 'Turnier nicht gefunden.' };
    const token = cleanToken(p.token);
    const name = cleanName(p.name);
    if (!token) return { ok: false, error: 'Ungültige Sitzung.' };
    if (!name) return { ok: false, error: 'Bitte einen Namen eintragen.' };
    const existing = playerOf(t, token);
    if (existing) {
      // Name ändern geht nur vor dem Start (danach steht er im Baum und in den Räumen)
      if (t.status !== 'signup') return { ok: true, id: existing.id };
      if (t.players.some((o) => o !== existing && o.name.toLowerCase() === name.toLowerCase())) {
        return { ok: false, error: 'Den Namen gibt es schon.' };
      }
      existing.name = name;
      changed(t);
      return { ok: true, id: existing.id };
    }
    if (t.status !== 'signup') return { ok: false, error: 'Die Anmeldung ist geschlossen.' };
    if (t.players.length >= t.maxPlayers) return { ok: false, error: 'Das Turnier ist voll.' };
    if (t.players.some((o) => o.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'Den Namen gibt es schon.' };
    let id;
    do id = randomId(4);
    while (playerById(t, id));
    t.players.push({ id, name, token, joinedAt: now() });
    watchers.set(socketId, { code: t.code, token });
    changed(t);
    return { ok: true, id };
  }

  function withdraw(socketId, p) {
    const t = tournaments.get(String(p.code || '').toUpperCase());
    const me = t && playerOf(t, cleanToken(p.token));
    if (!me) return { ok: false };
    if (t.status !== 'signup') return { ok: false, error: 'Das Turnier läuft schon — im Spiel aufgeben statt abmelden.' };
    t.players = t.players.filter((o) => o !== me);
    changed(t);
    return { ok: true };
  }

  // ── Aktionen: Admin ─────────────────────────────────────────────────────────────────────

  const DENIED = { ok: false, error: 'Nur für den Veranstalter.' };

  function adminTournament(p, ctx) {
    if (!ctx?.isAdmin) return null;
    return tournaments.get(String(p.code || '').toUpperCase()) || null;
  }

  function create(socketId, p, ctx) {
    if (!ctx?.isAdmin) return DENIED;
    const open = [...tournaments.values()].filter((t) => t.status === 'signup' || t.status === 'running').length;
    if (open >= MAX_OPEN) return { ok: false, error: 'Zu viele offene Turniere — erst alte absagen oder löschen.' };
    const maxPlayers = SIZES.includes(Number(p.maxPlayers)) ? Number(p.maxPlayers) : DEFAULT_SIZE;
    const t = {
      code: newCode(),
      name: cleanTitle(p.name),
      status: 'signup',
      maxPlayers,
      rules: fitRules(p.rules, roundCount(maxPlayers)),
      players: [],
      rounds: null,
      createdAt: now(),
      startedAt: null,
      finishedAt: null,
      updatedAt: now(),
    };
    tournaments.set(t.code, t);
    persist(t);
    return { ok: true, code: t.code };
  }

  /** Name, Größe, Regeln. Größe nur vor dem Start; Regeln einer Runde nur, solange dort noch kein Spiel offen war. */
  function update(socketId, p, ctx) {
    const t = adminTournament(p, ctx);
    if (!t) return DENIED;
    if (t.status !== 'signup' && t.status !== 'running') return { ok: false, error: 'Das Turnier ist vorbei.' };
    if (typeof p.name === 'string') t.name = cleanTitle(p.name);
    if (t.status === 'signup') {
      if (p.maxPlayers !== undefined) {
        const size = Number(p.maxPlayers);
        if (!SIZES.includes(size)) return { ok: false, error: 'Ungültige Größe.' };
        if (size < t.players.length) return { ok: false, error: 'Es sind schon mehr Spieler angemeldet.' };
        t.maxPlayers = size;
      }
      t.rules = fitRules(Array.isArray(p.rules) ? p.rules : t.rules, roundCount(t.maxPlayers));
    } else if (Array.isArray(p.rules)) {
      const next = fitRules(p.rules, t.rounds.length);
      t.rounds.forEach((round, r) => {
        const begun = round.some((m) => m.room || (m.status === 'done' && m.how !== 'bye'));
        if (!begun) t.rules[r] = next[r];
      });
    }
    changed(t);
    return { ok: true };
  }

  function kick(socketId, p, ctx) {
    const t = adminTournament(p, ctx);
    if (!t) return DENIED;
    if (t.status !== 'signup') return { ok: false, error: 'Nach dem Start entscheidest du die Paarung im Baum.' };
    t.players = t.players.filter((o) => o.id !== p.playerId);
    changed(t);
    return { ok: true };
  }

  function start(socketId, p, ctx) {
    const t = adminTournament(p, ctx);
    if (!t) return DENIED;
    if (t.status !== 'signup') return { ok: false, error: 'Das Turnier läuft schon.' };
    if (t.players.length < MIN_PLAYERS) return { ok: false, error: `Mindestens ${MIN_PLAYERS} Spieler.` };
    t.rounds = buildBracket(shuffle(t.players.map((o) => o.id), random));
    t.rules = fitRules(t.rules, t.rounds.length);
    t.status = 'running';
    t.startedAt = now();
    openPlayable(t);
    changed(t);
    return { ok: true };
  }

  /** Paarung von Hand entscheiden (Streitfall, Hänger, niemand erschienen). Nur offene Paarungen mit zwei Spielern. */
  function setWinner(socketId, p, ctx) {
    const t = adminTournament(p, ctx);
    if (!t) return DENIED;
    const m = t.status === 'running' ? findMatch(t.rounds, String(p.matchId || '')) : null;
    if (!m || m.status === 'done' || m.a === null || m.b === null) return { ok: false, error: 'Diese Paarung lässt sich nicht entscheiden.' };
    if (p.winner !== m.a && p.winner !== m.b) return { ok: false, error: 'Sieger gehört nicht zur Paarung.' };
    const room = m.room;
    finishMatch(t, m, p.winner, { how: 'admin' });
    if (room) rooms.closeLocked(room, 'Der Veranstalter hat das Spiel entschieden.');
    changed(t);
    return { ok: true };
  }

  function cancel(socketId, p, ctx) {
    const t = adminTournament(p, ctx);
    if (!t) return DENIED;
    if (t.status !== 'signup' && t.status !== 'running') return { ok: false, error: 'Das Turnier ist schon vorbei.' };
    closeRooms(t, 'Das Turnier wurde abgesagt.');
    t.status = 'cancelled';
    t.finishedAt = now();
    changed(t);
    return { ok: true };
  }

  function remove(socketId, p, ctx) {
    const t = adminTournament(p, ctx);
    if (!t) return DENIED;
    if (t.status === 'signup' || t.status === 'running') return { ok: false, error: 'Erst absagen, dann löschen.' };
    drop(t);
    return { ok: true };
  }

  function drop(t) {
    tournaments.delete(t.code);
    for (const [socketId, w] of watchers) {
      if (w.code !== t.code) continue;
      send(socketId, 'ft:gone', {});
      watchers.delete(socketId);
    }
    if (store) {
      try {
        store.remove(t.code);
      } catch (e) {
        console.error('[flick-soccer] Turnier löschen:', e);
      }
    }
  }

  function disconnect(socketId) {
    watchers.delete(socketId);
  }

  // ── Zeit ────────────────────────────────────────────────────────────────────────────────

  /** Regelmäßig aufrufen: Anpfiff bemerken, Fristen, alte Turniere aufräumen. */
  function tick() {
    const t0 = now();
    for (const t of [...tournaments.values()]) {
      if (t.status === 'running') {
        let dirty = false;
        for (const round of t.rounds) {
          for (const m of round) {
            if (m.status !== 'ready' || !m.room) continue;
            const info = rooms.lockedInfo(m.room);
            if (!info) {
              // Raum weg, ohne dass ein Ergebnis kam (sollte nicht vorkommen): neu öffnen statt hängen zu bleiben
              roomIndex.delete(m.room);
              openRoom(t, m);
              dirty = true;
            } else if (info.phase !== 'lobby') {
              m.status = 'live';
              m.deadline = null;
              dirty = true;
            } else if (t0 > m.deadline) {
              const [a, b] = info.present;
              if (a && b) {
                rooms.forceStart(m.room);
                m.status = 'live';
                m.deadline = null;
                dirty = true;
              } else if (a || b) {
                const room = m.room;
                finishMatch(t, m, a ? m.a : m.b, { how: 'walkover' });
                rooms.closeLocked(room, 'Dein Gegner ist nicht erschienen — du bist kampflos weiter.');
                dirty = true;
              }
              // niemand da: offen lassen — wer zuerst kommt, ist weiter; sonst entscheidet der Veranstalter
            }
          }
        }
        if (dirty) changed(t);
      } else {
        const age = t0 - (t.finishedAt || t.updatedAt || t.createdAt);
        if (age > (t.status === 'signup' ? KEEP_IDLE_MS : KEEP_DONE_MS)) drop(t);
      }
    }
  }

  // ── Neustart ────────────────────────────────────────────────────────────────────────────

  /** Gespeicherte Turniere laden. Offene und laufende Spiele beginnen neu (Räume leben nur im Speicher). */
  function restore() {
    if (!store) return 0;
    let count = 0;
    for (const t of store.loadAll()) {
      if (!t || !t.code || tournaments.has(t.code)) continue;
      tournaments.set(t.code, t);
      count += 1;
      if (t.status !== 'running' || !t.rounds) continue;
      for (const round of t.rounds) {
        for (const m of round) {
          if (m.status !== 'ready' && m.status !== 'live') continue;
          openRoom(t, m, m.room);
        }
      }
      openPlayable(t);
      persist(t);
    }
    return count;
  }

  return {
    list, watch, unwatch, signup, withdraw, create, update, kick, start, setWinner, cancel, remove, disconnect, tick, restore,
    _tournaments: tournaments,
  };
}

module.exports = { createTournamentManager, SIZES, READY_MS };
