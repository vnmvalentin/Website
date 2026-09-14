// streamToolStats.js — Overlay-Modul "Stream-Statistik".
//
// Zählt, was seit dem Beginn der laufenden Sendung zusammengekommen ist:
// Follows, Abos und Bits. Twitch liefert nichts davon fertig, also kommen die
// Zahlen aus zwei Quellen:
//
//  - Follows: Abstand der Follower-Gesamtzahl zum Stand bei Sendungsbeginn.
//    Der einzige Weg ohne EventSub — der Chat meldet keine Follows.
//  - Abos und Bits: aus dem Chat, über denselben Bot, der schon die Raids sieht.
//    Beides kommt dort als Ereignis an und ist damit genauer als jede Differenz:
//    eine ausgelaufene Mitgliedschaft zieht die Gesamtzahl nach unten, ein neues
//    Abo in dieser Sendung ist trotzdem eins.
//
// Chat-Ereignisse werden mit Zeitstempel abgelegt statt hochgezählt. Grund: der
// Bot sieht den Cheer sofort, vom Sendungsbeginn erfährt das Backend aber erst
// beim nächsten Twitch-Abgleich (alle 30 s, und nur solange ein Overlay läuft).
// Mit Zeitstempeln lässt sich die Zuordnung nachträglich richtigstellen — ein
// bloßer Zähler wäre beim Sendungswechsel entweder falsch oder weg.
const { db } = require("./streamToolStore");

const MODULE_ID = "streamStats";

/** Ereignisse älter als das hier fliegen beim nächsten Schreiben raus. */
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
/** Obergrenze der abgelegten Ereignisse je Streamer (Dauersendungen, Bit-Regen). */
const MAX_EVENTS = 2000;
/** Darüber ist ein Cheer kein Cheer mehr, sondern ein kaputtes Tag. */
const MAX_BITS_PER_CHEER = 1_000_000;

const listConnected = db.prepare(
  "SELECT * FROM stream_tool_settings WHERE token_enc <> '' AND twitch_login <> ''"
);
const getByLogin = db.prepare("SELECT * FROM stream_tool_settings WHERE twitch_login = ?");
const getByUser = db.prepare("SELECT * FROM stream_tool_settings WHERE user_id = ?");
const setStats = db.prepare("UPDATE stream_tool_settings SET stats = ? WHERE user_id = ?");

const normalizeLogin = (v) => String(v || "").trim().toLowerCase().replace(/^#/, "");

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Die Modul-Einstellungen des Streamers, oder null wenn das Modul aus ist. */
function statsModuleOf(row) {
  const mod = parseJson(row && row.config)?.modules?.[MODULE_ID];
  if (!mod || typeof mod !== "object" || !mod.enabled) return null;
  return mod;
}

/** Kanäle, in denen der Bot auf Cheers und Abos hören soll. */
function getStatsChannels() {
  const out = new Set();
  for (const row of listConnected.all()) {
    if (statsModuleOf(row)) out.add(normalizeLogin(row.twitch_login));
  }
  out.delete("");
  return [...out];
}

const EMPTY_STATE = { session: null, events: [] };

function readState(row) {
  const raw = parseJson(row && row.stats);
  if (!raw || typeof raw !== "object") return { ...EMPTY_STATE, events: [] };
  return {
    session: raw.session && typeof raw.session === "object" ? raw.session : null,
    events: Array.isArray(raw.events) ? raw.events : [],
  };
}

function writeState(userId, state) {
  const cutoff = Date.now() - EVENT_TTL_MS;
  const events = state.events.filter((e) => e && e.t > cutoff).slice(-MAX_EVENTS);
  setStats.run(JSON.stringify({ session: state.session || null, events }), String(userId));
}

/* ── Chat-Ereignisse ──────────────────────────────────────────────────────── */

/**
 * Legt ein Ereignis beim passenden Streamer ab.
 * Bewusst ohne Twitch-Aufruf und ohne await: der Bot ruft das in seinem
 * Ereignisstrom auf, und better-sqlite3 schreibt synchron — so kann sich das
 * Lesen und Schreiben der Liste nicht überholen.
 * @returns {boolean} ob gezählt wurde
 */
function recordEvent(channel, event) {
  const login = normalizeLogin(channel);
  if (!login) return false;
  const row = getByLogin.get(login);
  if (!row || !statsModuleOf(row)) return false;

  const state = readState(row);
  state.events.push({ t: Date.now(), ...event });
  writeState(row.user_id, state);
  return true;
}

/** Cheer im Chat. Die Bit-Zahl steht im gleichnamigen IRC-Tag. */
function onCheer(channel, tags = {}) {
  const bits = Math.round(Number(tags.bits) || 0);
  if (!(bits > 0) || bits > MAX_BITS_PER_CHEER) return false;
  return recordEvent(channel, { k: "bits", v: bits });
}

/**
 * Abo im Chat.
 * @param {'new'|'resub'|'gift'} kind  Neuabo, Verlängerung oder Geschenk —
 *   getrennt gezählt, weil das Overlay einstellen lässt, was mitzählt.
 */
function onSub(channel, kind) {
  const s = kind === "resub" || kind === "gift" ? kind : "new";
  return recordEvent(channel, { k: "sub", v: 1, s });
}

/* ── Sendung erkennen ─────────────────────────────────────────────────────── */

/**
 * Gleicht die laufende Sendung mit dem ab, was Twitch meldet.
 *
 * @param {object}      row        Zeile des Streamers
 * @param {object|null} stream     laufende Sendung oder null (offline)
 * @param {number|null} followers  aktuelle Follower-Gesamtzahl
 * @returns {object} der neue Zustand der Sendung
 */
function updateSession(row, stream, followers) {
  const state = readState(row);
  const s = state.session;
  const now = Date.now();
  const total = typeof followers === "number" ? followers : null;

  if (stream) {
    if (!s || s.id !== stream.id) {
      state.session = {
        id: stream.id,
        startedAt: stream.startedAt,
        // Ab hier wird gezählt. Normalerweise der Sendungsbeginn; der Knopf
        // "Zähler zurücksetzen" im Dashboard schiebt den Wert nach vorn.
        countFrom: stream.startedAt,
        endedAt: 0,
        live: true,
        viewers: stream.viewers,
        peakViewers: stream.viewers,
        // Erster bekannter Stand. Wird das Modul mitten in der Sendung
        // eingeschaltet, zählen die Follows eben ab diesem Moment.
        baseFollowers: total,
        followers: total,
      };
    } else {
      s.live = true;
      s.endedAt = 0;
      s.viewers = stream.viewers;
      s.peakViewers = Math.max(Number(s.peakViewers) || 0, stream.viewers);
      if (s.baseFollowers == null) s.baseFollowers = total;
      if (total != null) s.followers = total;
    }
  } else if (s && s.live) {
    s.live = false;
    s.endedAt = now;
  }

  writeState(row.user_id, state);
  return state.session;
}

/**
 * Anzeigedaten fürs Overlay. Absichtlich mit frischem Lesen der Zeile: zwischen
 * dem Twitch-Abgleich und diesem Aufruf kann der Chat-Bot geschrieben haben.
 * @returns {object|null} null, solange noch keine Sendung erkannt wurde
 */
function currentStats(userId) {
  const row = getByUser.get(String(userId));
  if (!row) return null;
  const state = readState(row);
  const s = state.session;
  if (!s) return null;

  const since = Math.max(Number(s.countFrom) || 0, Number(s.startedAt) || 0);
  const subs = { new: 0, resub: 0, gift: 0 };
  let bits = 0;
  for (const e of state.events) {
    if (!e || !(e.t >= since)) continue;
    if (e.k === "bits") bits += Number(e.v) || 0;
    else if (e.k === "sub") subs[e.s === "resub" || e.s === "gift" ? e.s : "new"] += Number(e.v) || 1;
  }

  const follows =
    s.baseFollowers == null || s.followers == null ? null : Math.max(0, s.followers - s.baseFollowers);

  return {
    live: !!s.live,
    startedAt: Number(s.startedAt) || 0,
    endedAt: Number(s.endedAt) || 0,
    since,
    viewers: Number(s.viewers) || 0,
    peakViewers: Number(s.peakViewers) || 0,
    follows,
    subs,
    bits,
  };
}

/**
 * Zähler auf null. Der Sendungsbeginn bleibt stehen (die Laufzeit soll weiter
 * stimmen), gezählt wird ab jetzt.
 * @returns {boolean} ob es überhaupt eine Sendung gab
 */
function resetStats(userId) {
  const row = getByUser.get(String(userId));
  if (!row) return false;
  const state = readState(row);
  if (!state.session) return false;

  state.session.countFrom = Date.now();
  state.session.baseFollowers = state.session.followers ?? null;
  state.session.peakViewers = Number(state.session.viewers) || 0;
  writeState(row.user_id, state);
  return true;
}

/** Beim Trennen von Twitch: alles vergessen. */
function clearStats(userId) {
  setStats.run("", String(userId));
}

module.exports = {
  MODULE_ID,
  statsModuleOf,
  getStatsChannels,
  onCheer,
  onSub,
  updateSession,
  currentStats,
  resetStats,
  clearStats,
};
