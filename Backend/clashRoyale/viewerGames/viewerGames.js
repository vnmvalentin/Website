// viewerGames.js — Viewer Games: Chat-Quiz im Stream (Overlay /clash/viewer-games/overlay/:key).
// Modi (mehrere aktiv: zufällig je Runde):
//   • pixel / zoom — das Kartenbild wird in 6 Stufen deutlicher, je nach Einstellung nach Zeit (Zeitbalken) oder nach
//     einer Anzahl falscher Tipps. Wer zuerst trifft, bekommt Punkte (6 auf Stufe 1 … 1 auf Stufe 6).
//   • stat — Werte schätzen: eine Karte und ein Wert (Lebenspunkte, Schaden, Schaden pro Sekunde, Turnierniveau). Der
//     Chat schätzt mit "!tipp 1700"; nach Ablauf gewinnt, wer am nächsten liegt (Punkte nach Genauigkeit).
//   • wordle — Chat-Wordle: eine geheime Karte, jeder Tipp zeigt Elixier, Seltenheit, Art und Jahr im Vergleich.
//     Wer sie trifft, bekommt Punkte — je weniger Tipps davor, desto mehr.
// Zuschauer raten mit "!tipp <Karte oder Zahl>" (auch "!tip", "!guess"). Punkte zählen insgesamt und je Clash-Royale-
// Saison (viewerGamesStore.js); das Overlay zeigt wahlweise die Saison oder alles.
//
// Lazy wie die übrigen Overlays: Es gibt keinen Taktgeber. Der Zustand rückt bei jeder Overlay-Abfrage und bei jedem
// Tipp anhand der Uhr vor. Der Bot liest einen Kanal nur, solange dessen Overlay in den letzten ALIVE_MS abgefragt hat.
// Chat-Anbindung wie core/twitchChat.js: lib/winchallengeIrc.js meldet sich per attachIrc() an (refresh/say).
const { ALL_CARDS, ELIXIR_COST } = require("../core/cards");
const store = require("./viewerGamesStore");
// Kampfwerte, Art und Jahr — Spiegel der Frontend-Daten (tools/kartenSpiegel.js, `npm run spiegel -- clash`)
const FACTS = require("../core/cardFacts.json").karten;
const { seasonKeyAt, seasonLabel } = require("../lib/winTrackerRecap");

const STAGES = 6;
const ALIVE_MS = 45_000;
const GUESS_COOLDOWN_MS = 1500;
const MODES = ["pixel", "zoom", "stat", "wordle"];
const ESTIMATE_STATS = ["hp", "damage", "dps"];
/** Im Wordle so viele Tipps sichtbar (neueste zuerst); gemerkt werden mehr */
const WORDLE_SHOWN = 6;
const WORDLE_KEEP = 40;

const DEFAULTS = {
  modes: ["pixel", "zoom"],
  advance: "time",          // "time" | "guesses" (pixel/zoom)
  stageSeconds: 8,          // Zeit je Stufe (advance = time)
  guessesPerStage: 4,       // falsche Tipps je Stufe (advance = guesses)
  finalSeconds: 20,         // so lange bleibt die letzte Stufe stehen, dann wird aufgelöst
  estimateSeconds: 30,      // Werte schätzen: so lange nimmt der Chat Schätzungen an
  wordleSeconds: 150,       // Chat-Wordle: so lange wird geraten, dann aufgelöst
  pauseSeconds: 8,          // Pause zwischen zwei Runden (Auflösung sichtbar)
  announce: true,           // Gewinner im Chat ansagen
  showLeaderboard: true,
  leaderboardScope: "season", // "season" (laufende Clash-Royale-Saison) | "all"
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
    estimateSeconds: clampInt(raw.estimateSeconds, 10, 120, DEFAULTS.estimateSeconds),
    wordleSeconds: clampInt(raw.wordleSeconds, 30, 600, DEFAULTS.wordleSeconds),
    pauseSeconds: clampInt(raw.pauseSeconds, 3, 60, DEFAULTS.pauseSeconds),
    announce: raw.announce !== false,
    showLeaderboard: raw.showLeaderboard !== false,
    leaderboardScope: raw.leaderboardScope === "all" ? "all" : "season",
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

/** Schätzung aus dem Chat: „1700“, „1.697“, „1,697“, „1,7k“. null, wenn es keine Zahl ist. */
function parseEstimate(text) {
  const t = String(text || "").trim().toLowerCase().replace(/\s+/g, "");
  const k = /^(\d+(?:[.,]\d+)?)k$/.exec(t);
  const n = k ? Math.round(parseFloat(k[1].replace(",", ".")) * 1000)
    : /^(\d{1,3}(?:[.,]\d{3})+|\d+)$/.test(t) ? Number(t.replace(/[.,]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
}

/** Punkte fürs Schätzen nach der Abweichung vom echten Wert (Anteil). */
function estimatePoints(relErr) {
  return relErr <= 0.02 ? 6 : relErr <= 0.05 ? 5 : relErr <= 0.1 ? 4 : relErr <= 0.2 ? 3 : relErr <= 0.35 ? 2 : 1;
}
/** Punkte im Wordle nach der Zahl der Fehltipps davor. */
function wordlePoints(before) {
  return before <= 2 ? 6 : before <= 5 ? 5 : before <= 9 ? 4 : before <= 14 ? 3 : before <= 20 ? 2 : 1;
}

/** Hinweise eines Wordle-Tipps im Vergleich zur gesuchten Karte. up/down = die gesuchte liegt höher/tiefer. */
function wordleHints(guess, secret) {
  const g = FACTS[guess.id] || {};
  const s = FACTS[secret.id] || {};
  const cmp = (a, b) => (a === b ? "eq" : b > a ? "up" : "down");
  const ge = ELIXIR_COST[guess.id];
  const se = ELIXIR_COST[secret.id];
  return {
    elixir: { v: ge ?? null, r: typeof ge === "number" && typeof se === "number" ? cmp(ge, se) : "?" },
    rarity: { v: guess.rarity, r: guess.rarity === secret.rarity ? "eq" : "no" },
    type: { v: g.type || null, r: g.type && s.type ? (g.type === s.type ? "eq" : "no") : "?" },
    year: { v: g.released ?? null, r: g.released && s.released ? cmp(g.released, s.released) : "?" },
  };
}

/* ── Runden ───────────────────────────────────────────────────────────── */
const states = new Map(); // userId -> { login, settings, round, lastPoll, lastGuess: Map }
let irc = null;
function attachIrc(api) { irc = api; }
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function newRound(st, now) {
  const s = st.settings;
  const mode = pick(s.modes);
  const base = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, mode, startedAt: now, status: "running", winner: null, points: 0, endedAt: 0 };
  if (mode === "stat") {
    const card = pick(ALL_CARDS.filter((c) => ESTIMATE_STATS.some((k) => typeof FACTS[c.id]?.[k] === "number")));
    const stat = pick(ESTIMATE_STATS.filter((k) => typeof FACTS[card.id][k] === "number"));
    st.round = { ...base, cardId: card.id, cardName: card.name, stat, value: FACTS[card.id][stat], of: FACTS[card.id].of?.[stat] || null,
      answers: new Map(), endsAt: now + s.estimateSeconds * 1000, winnerGuess: null };
    return;
  }
  if (mode === "wordle") {
    const card = pick(ALL_CARDS.filter((c) => FACTS[c.id]?.type && FACTS[c.id]?.released));
    st.round = { ...base, cardId: card.id, cardName: card.name, guesses: [], endsAt: now + s.wordleSeconds * 1000 };
    return;
  }
  const card = pick(ALL_CARDS);
  st.round = {
    ...base, cardId: card.id, cardName: card.name,
    fx: 0.2 + Math.random() * 0.6, fy: 0.2 + Math.random() * 0.6,
    stage: 0, stageStartedAt: now, wrong: 0,
  };
}

/** Punkte gutschreiben (insgesamt + Saison) und im Chat ansagen */
function award(st, userId, login, viewer, display, points, chatLine) {
  try { store.addScore(userId, viewer, display, points, seasonKeyAt(Date.now())); } catch (e) { console.warn("[viewer-games] Punkte:", e.message); }
  if (st.settings.announce && irc?.say && chatLine) irc.say(`#${login}`, chatLine);
}

/** Schätzrunde auflösen: wer am nächsten liegt (bei Gleichstand wer früher geschätzt hat) */
function resolveEstimate(st, userId, now) {
  const r = st.round;
  r.endedAt = now;
  let best = null;
  for (const [viewer, a] of r.answers) {
    const diff = Math.abs(a.value - r.value);
    if (!best || diff < best.diff || (diff === best.diff && a.at < best.at)) best = { viewer, ...a, diff };
  }
  if (!best) { r.status = "revealed"; return; }
  r.status = "solved";
  r.winner = best.display;
  r.winnerGuess = best.value;
  r.points = estimatePoints(r.value ? best.diff / r.value : 1);
  award(st, userId, st.login, best.viewer, best.display, r.points, SAY_EST[st.settings.language](best.display, best.value, r.value, r.cardName, r.points));
}

/** Uhr-basierter Fortschritt: Stufen nach Zeit, letzte Stufe läuft ab, nach der Pause neue Runde */
function advance(st, now, userId) {
  const s = st.settings;
  if (!st.round) { newRound(st, now); return; }
  const r = st.round;
  if (r.status !== "running") {
    if (now - r.endedAt >= s.pauseSeconds * 1000) newRound(st, now);
    return;
  }
  if (r.mode === "stat") {
    if (now >= r.endsAt) resolveEstimate(st, userId, now);
    return;
  }
  if (r.mode === "wordle") {
    if (now >= r.endsAt) { r.status = "revealed"; r.endedAt = now; }
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
  advance(st, now, row.user_id);
  return publicView(row.user_id, st, now);
}

function publicView(userId, st, now) {
  const r = st.round;
  const s = st.settings;
  const ended = r.status !== "running";
  // Ende der laufenden Stufe bzw. Runde (für den Zeitbalken): Zeitmodus = nächste Stufe, letzte Stufe = Auflösung
  let barFrom = r.stageStartedAt ?? r.startedAt;
  let barTo = null;
  if (ended) {
    barFrom = r.endedAt;
    barTo = r.endedAt + s.pauseSeconds * 1000;
  } else if (r.mode === "stat" || r.mode === "wordle") {
    barFrom = r.startedAt;
    barTo = r.endsAt;
  } else if (r.stage === STAGES - 1) barTo = r.stageStartedAt + s.finalSeconds * 1000;
  else if (s.advance === "time") barTo = r.stageStartedAt + s.stageSeconds * 1000;

  const round = { id: r.id, mode: r.mode, status: r.status, winner: r.winner, points: r.points, barFrom, barTo, cardName: ended ? r.cardName : null };
  if (r.mode === "stat") {
    // Karte und Frage sind offen, nur der Wert bleibt bis zur Auflösung verborgen
    Object.assign(round, { cardId: r.cardId, cardName: r.cardName, stat: r.stat, of: r.of, answers: r.answers.size, value: ended ? r.value : null, winnerGuess: r.winnerGuess });
  } else if (r.mode === "wordle") {
    Object.assign(round, { cardId: ended ? r.cardId : null, guesses: r.guesses.slice(0, WORDLE_SHOWN), total: r.guesses.length });
  } else {
    Object.assign(round, {
      cardId: r.cardId, fx: r.fx, fy: r.fy, stage: r.stage, stages: STAGES, wrong: r.wrong,
      // Zeitmodus aus: wie viele falsche Tipps fehlen bis zur nächsten Stufe
      guessesLeft: s.advance === "guesses" && r.stage < STAGES - 1 ? s.guessesPerStage - (r.wrong % s.guessesPerStage) : null,
    });
  }
  const season = seasonKeyAt(now);
  return {
    serverNow: now,
    settings: { language: s.language, showLeaderboard: s.showLeaderboard, advance: s.advance, guessesPerStage: s.guessesPerStage, leaderboardScope: s.leaderboardScope },
    round,
    leaderboard: s.showLeaderboard ? (s.leaderboardScope === "season" ? store.topSeason(userId, season, 5) : store.top(userId, 5)) : [],
    season: s.leaderboardScope === "season" ? seasonLabel(season, s.language) : null,
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

const fmt = (n, lang) => Number(n).toLocaleString(lang === "en" ? "en-US" : "de-DE");
const SAY = {
  de: (who, card, pts) => `@${who} hat es erraten: ${card} (+${pts} ${pts === 1 ? "Punkt" : "Punkte"})`,
  en: (who, card, pts) => `@${who} got it: ${card} (+${pts} ${pts === 1 ? "point" : "points"})`,
};
const SAY_EST = {
  de: (who, guess, value, card, pts) => `@${who} lag am nächsten: ${fmt(guess, "de")} (richtig: ${fmt(value, "de")} bei ${card}) +${pts} ${pts === 1 ? "Punkt" : "Punkte"}`,
  en: (who, guess, value, card, pts) => `@${who} was closest: ${fmt(guess, "en")} (answer: ${fmt(value, "en")} for ${card}) +${pts} ${pts === 1 ? "point" : "points"}`,
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
  advance(st, now, userId);
  const r = st.round;
  if (!r || r.status !== "running") return null;
  const viewer = String(tags?.username || "").toLowerCase();
  if (!viewer) return null;
  const last = st.lastGuess.get(viewer) || 0;
  if (now - last < GUESS_COOLDOWN_MS) return null;
  st.lastGuess.set(viewer, now);
  const display = String(tags["display-name"] || viewer);

  if (r.mode === "stat") {
    // Die letzte Schätzung je Zuschauer zählt (Tippfehler lassen sich korrigieren); der Zeitpunkt entscheidet Gleichstände
    const value = parseEstimate(m[2]);
    if (value === null) return null;
    r.answers.set(viewer, { value, at: now, display });
    return { answered: true };
  }

  const card = matchCard(m[2]);
  if (!card) return null;

  if (r.mode === "wordle") {
    if (r.guesses.some((g) => g.cardId === card.id)) return null; // schon geraten
    if (card.id === r.cardId) {
      r.status = "solved";
      r.endedAt = now;
      r.points = wordlePoints(r.guesses.length);
      r.winner = display;
      award(st, userId, login, viewer, display, r.points, SAY[st.settings.language](display, r.cardName, r.points));
      return { solved: true };
    }
    r.guesses.unshift({ cardId: card.id, name: card.name, by: display, hints: wordleHints(card, ALL_CARDS.find((c) => c.id === r.cardId)) });
    if (r.guesses.length > WORDLE_KEEP) r.guesses.length = WORDLE_KEEP;
    return { solved: false };
  }

  if (card.id === r.cardId) {
    r.status = "solved";
    r.endedAt = now;
    r.points = STAGES - r.stage;
    r.winner = display;
    award(st, userId, login, viewer, display, r.points, SAY[st.settings.language](display, r.cardName, r.points));
    return { solved: true };
  }
  r.wrong += 1;
  if (st.settings.advance === "guesses" && r.stage < STAGES - 1 && r.wrong % st.settings.guessesPerStage === 0) {
    r.stage += 1;
    r.stageStartedAt = now;
  }
  return { solved: false };
}

module.exports = {
  attachIrc, poll, getChannels, onChatMessage, applySettings, skipRound, normalizeSettings, matchCard, parseEstimate, estimatePoints,
  wordlePoints, wordleHints, DEFAULTS, STAGES, MODES, _states: states,
};
