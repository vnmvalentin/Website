// viewerGames.js — Viewer Games: Chat-Quiz im Stream (Overlay /clash/viewer-games/overlay/:key).
// Modi: Pixel-Raten und Zoom-Raten (bei beiden aktiv: zufällig je Runde). Das Bild wird in 6 Stufen deutlicher —
// je nach Einstellung nach Zeit (Zeitbalken) oder nach einer Anzahl falscher Tipps aus dem Chat. Zuschauer raten mit
// "!tipp <Karte>" (auch "!guess"). Wer zuerst trifft, bekommt Punkte (6 auf Stufe 1 … 1 auf Stufe 6).
//
// Lazy wie die übrigen Overlays: Es gibt keinen Taktgeber. Der Zustand rückt bei jeder Overlay-Abfrage und bei jedem
// Tipp anhand der Uhr vor. Der Bot liest einen Kanal nur, solange dessen Overlay in den letzten ALIVE_MS abgefragt hat.
// Chat-Anbindung wie core/twitchChat.js: lib/winchallengeIrc.js meldet sich per attachIrc() an (refresh/say).
const { ALL_CARDS } = require("../core/cards");
const store = require("./viewerGamesStore");

const STAGES = 6;
const ALIVE_MS = 45_000;
const GUESS_COOLDOWN_MS = 1500;
const MODES = ["pixel", "zoom"];

const DEFAULTS = {
  modes: ["pixel", "zoom"],
  advance: "time",          // "time" | "guesses"
  stageSeconds: 8,          // Zeit je Stufe (advance = time)
  guessesPerStage: 4,       // falsche Tipps je Stufe (advance = guesses)
  finalSeconds: 20,         // so lange bleibt die letzte Stufe stehen, dann wird aufgelöst
  pauseSeconds: 8,          // Pause zwischen zwei Runden (Auflösung sichtbar)
  announce: true,           // Gewinner im Chat ansagen
  showLeaderboard: true,
  language: "de",           // "de" | "en" — Overlay-Texte + Chat-Ansage
};
const clampInt = (v, a, b, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };

function normalizeSettings(raw = {}) {
  const modes = Array.isArray(raw.modes) ? raw.modes.filter((m) => MODES.includes(m)) : DEFAULTS.modes;
  return {
    modes: modes.length ? [...new Set(modes)] : ["pixel"],
    advance: raw.advance === "guesses" ? "guesses" : "time",
    stageSeconds: clampInt(raw.stageSeconds, 3, 60, DEFAULTS.stageSeconds),
    guessesPerStage: clampInt(raw.guessesPerStage, 1, 30, DEFAULTS.guessesPerStage),
    finalSeconds: clampInt(raw.finalSeconds, 5, 120, DEFAULTS.finalSeconds),
    pauseSeconds: clampInt(raw.pauseSeconds, 3, 60, DEFAULTS.pauseSeconds),
    announce: raw.announce !== false,
    showLeaderboard: raw.showLeaderboard !== false,
    language: raw.language === "en" ? "en" : "de",
  };
}

/* ── Kartennamen erkennen ─────────────────────────────────────────────── */
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
const CARD_BY_NORM = new Map(ALL_CARDS.map((c) => [norm(c.name), c]));
// Häufige Schreibweisen im Chat
const ALIASES = { pekka: "pekka", minipekka: "mini-pekka", log: "the-log", xbow: "x-bow", ewiz: "electro-wizard", ebarbs: "elite-barbarians", mk: "mega-knight", hog: "hog-rider", bossbandit: "boss-bandit" };
for (const [a, id] of Object.entries(ALIASES)) { const c = ALL_CARDS.find((x) => x.id === id); if (c) CARD_BY_NORM.set(a, c); }

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Karte zu einem Tipp: exakt (ohne Leerzeichen/Satzzeichen), sonst ein Tippfehler bei Namen ab 6 Zeichen */
function matchCard(text) {
  const n = norm(text);
  if (!n) return null;
  if (CARD_BY_NORM.has(n)) return CARD_BY_NORM.get(n);
  if (n.length < 6) return null;
  for (const [k, c] of CARD_BY_NORM) if (k.length >= 6 && lev(n, k) <= 1) return c;
  return null;
}

/* ── Runden ───────────────────────────────────────────────────────────── */
const states = new Map(); // userId -> { login, settings, round, lastPoll, lastGuess: Map }
let irc = null;
function attachIrc(api) { irc = api; }

function newRound(st, now) {
  const mode = st.settings.modes[Math.floor(Math.random() * st.settings.modes.length)];
  const card = ALL_CARDS[Math.floor(Math.random() * ALL_CARDS.length)];
  st.round = {
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    mode, cardId: card.id, cardName: card.name,
    fx: 0.2 + Math.random() * 0.6, fy: 0.2 + Math.random() * 0.6,
    startedAt: now, stage: 0, stageStartedAt: now, wrong: 0,
    status: "running", winner: null, points: 0, endedAt: 0,
  };
}

/** Uhr-basierter Fortschritt: Stufen nach Zeit, letzte Stufe läuft ab, nach der Pause neue Runde */
function advance(st, now) {
  const s = st.settings;
  if (!st.round) { newRound(st, now); return; }
  const r = st.round;
  if (r.status !== "running") {
    if (now - r.endedAt >= s.pauseSeconds * 1000) newRound(st, now);
    return;
  }
  if (s.advance === "time") {
    const stageMs = s.stageSeconds * 1000;
    const stage = Math.min(STAGES - 1, Math.floor((now - r.startedAt) / stageMs));
    if (stage !== r.stage) { r.stage = stage; r.stageStartedAt = r.startedAt + stage * stageMs; }
  }
  if (r.stage === STAGES - 1 && now - r.stageStartedAt >= s.finalSeconds * 1000) {
    r.status = "revealed";
    r.endedAt = now;
  }
}

function stateFor(userId, row) {
  let st = states.get(userId);
  if (!st) {
    st = { login: row.twitch_login, settings: normalizeSettings(row.settings), round: null, lastPoll: 0, lastGuess: new Map() };
    states.set(userId, st);
  }
  return st;
}

/** Overlay-Abfrage: Zustand vorrücken, Kanal als aktiv merken (beim ersten Mal den Bot beitreten lassen) */
function poll(row, now = Date.now()) {
  const st = stateFor(row.user_id, row);
  st.login = row.twitch_login;
  const wasIdle = now - st.lastPoll > ALIVE_MS;
  st.lastPoll = now;
  if (wasIdle && irc?.refresh) irc.refresh().catch?.(() => {});
  advance(st, now);
  return publicView(row.user_id, st, now);
}

function publicView(userId, st, now) {
  const r = st.round;
  const s = st.settings;
  const ended = r.status !== "running";
  // Ende der laufenden Stufe (für den Zeitbalken): Zeitmodus = nächste Stufe, letzte Stufe = Auflösung
  let barFrom = r.stageStartedAt;
  let barTo = null;
  if (!ended) {
    if (r.stage === STAGES - 1) barTo = r.stageStartedAt + s.finalSeconds * 1000;
    else if (s.advance === "time") barTo = r.stageStartedAt + s.stageSeconds * 1000;
  } else {
    barFrom = r.endedAt;
    barTo = r.endedAt + s.pauseSeconds * 1000;
  }
  return {
    serverNow: now,
    settings: { language: s.language, showLeaderboard: s.showLeaderboard, advance: s.advance, guessesPerStage: s.guessesPerStage },
    round: {
      id: r.id, mode: r.mode, cardId: r.cardId, fx: r.fx, fy: r.fy, stage: r.stage, stages: STAGES,
      status: r.status, wrong: r.wrong, winner: r.winner, points: r.points,
      cardName: ended ? r.cardName : null,
      barFrom, barTo,
      // Zeitmodus aus: wie viele falsche Tipps fehlen bis zur nächsten Stufe
      guessesLeft: s.advance === "guesses" && r.stage < STAGES - 1 ? s.guessesPerStage - (r.wrong % s.guessesPerStage) : null,
    },
    leaderboard: s.showLeaderboard ? store.top(userId, 5) : [],
  };
}

/** Neue Einstellungen übernehmen (laufende Runde bleibt, Modus-Liste gilt ab der nächsten) */
function applySettings(userId, row) {
  const st = states.get(userId);
  if (st) st.settings = normalizeSettings(row.settings);
}

/** Sofort eine neue Runde (Knopf im Editor) */
function skipRound(userId, row) {
  const st = stateFor(userId, row);
  newRound(st, Date.now());
}

/** Kanäle für den Bot: nur Streamer mit gerade laufendem Overlay */
function getChannels(now = Date.now()) {
  const out = [];
  for (const st of states.values()) if (st.login && now - st.lastPoll <= ALIVE_MS) out.push(st.login);
  return out;
}

const SAY = {
  de: (who, card, pts) => `@${who} hat es erraten: ${card} (+${pts} ${pts === 1 ? "Punkt" : "Punkte"})`,
  en: (who, card, pts) => `@${who} got it: ${card} (+${pts} ${pts === 1 ? "point" : "points"})`,
};

/** Chatzeile aus irgendeinem Kanal. Schnell raus, wenn es kein Tipp ist oder der Kanal kein Overlay offen hat. */
function onChatMessage(channel, tags, message, now = Date.now()) {
  const text = String(message || "").trim();
  const m = text.match(/^!(tipp|tip|guess)\s+(.+)$/i);
  if (!m) return null;
  const login = String(channel || "").replace(/^#/, "").toLowerCase();
  let userId = null;
  let st = null;
  for (const [uid, s] of states) if (s.login === login && now - s.lastPoll <= ALIVE_MS) { userId = uid; st = s; break; }
  if (!st) return null;
  advance(st, now);
  const r = st.round;
  if (!r || r.status !== "running") return null;
  const viewer = String(tags?.username || "").toLowerCase();
  if (!viewer) return null;
  const last = st.lastGuess.get(viewer) || 0;
  if (now - last < GUESS_COOLDOWN_MS) return null;
  st.lastGuess.set(viewer, now);
  const card = matchCard(m[2]);
  if (!card) return null;
  const display = String(tags["display-name"] || viewer);
  if (card.id === r.cardId) {
    r.status = "solved";
    r.endedAt = now;
    r.points = STAGES - r.stage;
    r.winner = display;
    try { store.addScore(userId, viewer, display, r.points); } catch (e) { console.warn("[viewer-games] Punkte:", e.message); }
    if (st.settings.announce && irc?.say) irc.say(`#${login}`, SAY[st.settings.language](display, r.cardName, r.points));
    return { solved: true };
  }
  r.wrong += 1;
  if (st.settings.advance === "guesses" && r.stage < STAGES - 1 && r.wrong % st.settings.guessesPerStage === 0) {
    r.stage += 1;
    r.stageStartedAt = now;
  }
  return { solved: false };
}

module.exports = { attachIrc, poll, getChannels, onChatMessage, applySettings, skipRound, normalizeSettings, matchCard, DEFAULTS, STAGES, _states: states };
