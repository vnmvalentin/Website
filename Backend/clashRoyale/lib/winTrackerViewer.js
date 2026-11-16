// winTrackerViewer.js — Chat-Befehle für Zuschauer des Win Trackers (Ausbauplan „wt-zuschauer"): !rang, !session,
// !deck und !rekord, englisch auch !rank und !record. Zuschauer fragen ständig nach Rang und Deck; die Moderatoren-
// Befehle (!tracker …) helfen ihnen nicht.
//
// Hier steht nur, was ohne Datenbank geht (und deshalb ohne sie testbar ist): Befehl erkennen, Einstellungen prüfen,
// Abklingzeit, Antworttext. Die Zahlen holt winTrackerChat.js — dieselben, die das Overlay zeigt
// (crWinTrackerRoutes.overlayState), damit Chat und Overlay nie auseinanderlaufen.
//
// Standard: alle Befehle AUS. Viele Kanäle haben schon einen !rank-Befehl über Nightbot oder Streamer.bot — ein Update,
// nach dem unser Bot ungefragt doppelt antwortet, wäre schlimmer als ein Schalter, den man einmal umlegt.

const VIEWER_COMMANDS = ['rang', 'session', 'deck', 'rekord'];
const ALIASES = { rang: 'rang', rank: 'rang', session: 'session', deck: 'deck', rekord: 'rekord', record: 'rekord' };
const COOLDOWNS_S = [15, 30, 60, 120];
const DEFAULT_COOLDOWN_S = 30;
const UC_LEAGUE = 7;
const SITE = 'https://vnmvalentin.de';
// Twitch schneidet Nachrichten bei 500 Zeichen ab (siehe trySendChatViaHelix in winchallengeIrc.js)
const MAX_REPLY = 480;

/** Name des getrackten Modus — auch von den Moderatoren-Antworten (winTrackerChat.js, !tracker reset) genutzt. */
const MODE_LABELS = {
  de: { medals: 'Ranked (Medaillen)', trophies: 'Trophäenstraße', '2v2': '2v2 Ranked',
    'c:20win': '20-Siege-Challenge', 'c:classic': 'Classic Challenge', 'c:grand': 'Grand Challenge',
    'c:duel': 'Crown Series', 'c:grandduel': 'Crown Series (Grand Duels)', 'c:global': 'Global Tournament' },
  en: { medals: 'Ranked (medals)', trophies: 'Trophy Road', '2v2': '2v2 Ranked',
    'c:20win': '20 Win Challenge', 'c:classic': 'Classic Challenge', 'c:grand': 'Grand Challenge',
    'c:duel': 'Crown Series', 'c:grandduel': 'Crown Series (Grand Duels)', 'c:global': 'Global Tournament' },
};

const T = {
  de: {
    league: (n) => (n === UC_LEAGUE ? 'Ultimate Champion' : `Liga ${n}`),
    medals: (n) => `${n} Medaillen`,
    steps: (n) => `${n} Stufen`,
    trophies: (n) => `${n} Trophäen`,
    step: (s, max) => `Stufe ${s}/${max}`,
    place: (n) => `Platz ${n}`,
    noRanked: 'noch nicht in Ranked',
    session: (label, w, l, pct) => `Session ${label}: ${w} ${w === 1 ? 'Sieg' : 'Siege'}, ${l} ${l === 1 ? 'Niederlage' : 'Niederlagen'} (${pct} %)`,
    sessionEmpty: (label) => `Session ${label}: noch kein Spiel.`,
    deck: (label, names, url) => `Deck · ${label}: ${names}${url ? ` → ${url}` : ''}`,
    deckNone: 'Noch kein Deck erfasst.',
    record: (name, parts) => `${name} – Rekorde: ${parts.join(' · ')}`,
    bestTrophies: (n) => `Trophäenstraße ${n}`,
    seasonMedals: (n) => `diese Saison bis ${n} Medaillen`,
    seasonPlace: (n) => `bester Platz ${n}`,
    best2v2: (n) => `2v2 ${n} Medaillen`,
    recordNone: (name) => `${name}: noch keine Rekorde erfasst.`,
    noAccount: 'Noch kein Account im Win Tracker verknüpft.',
    forms: { ev1: 'Evo', hero: 'Held' },
  },
  en: {
    league: (n) => (n === UC_LEAGUE ? 'Ultimate Champion' : `League ${n}`),
    medals: (n) => `${n} medals`,
    steps: (n) => `${n} steps`,
    trophies: (n) => `${n} trophies`,
    step: (s, max) => `step ${s}/${max}`,
    place: (n) => `rank ${n}`,
    noRanked: 'not in ranked yet',
    session: (label, w, l, pct) => `${label} session: ${w} ${w === 1 ? 'win' : 'wins'}, ${l} ${l === 1 ? 'loss' : 'losses'} (${pct}%)`,
    sessionEmpty: (label) => `${label} session: no games yet.`,
    deck: (label, names, url) => `Deck · ${label}: ${names}${url ? ` → ${url}` : ''}`,
    deckNone: 'No deck recorded yet.',
    record: (name, parts) => `${name} – records: ${parts.join(' · ')}`,
    bestTrophies: (n) => `Trophy Road ${n}`,
    seasonMedals: (n) => `up to ${n} medals this season`,
    seasonPlace: (n) => `best rank ${n}`,
    best2v2: (n) => `2v2 ${n} medals`,
    recordNone: (name) => `${name}: no records yet.`,
    noAccount: 'No account linked in the Win Tracker yet.',
    forms: { ev1: 'Evo', hero: 'Hero' },
  },
};

const dictFor = (lang) => (lang === 'en' ? T.en : T.de);
const fmt = (n, lang) => Math.round(Number(n) || 0).toLocaleString(lang === 'en' ? 'en-US' : 'de-DE');
const signed = (n, lang) => `${n > 0 ? '+' : n < 0 ? '-' : '±'}${fmt(Math.abs(n), lang)}`;
const clip = (s) => (s.length > MAX_REPLY ? `${s.slice(0, MAX_REPLY - 1)}…` : s);

/** Befehl einer Chatzeile ('rang' | 'session' | 'deck' | 'rekord') oder null. Groß/klein egal, Rest der Zeile egal. */
function parseViewerCommand(message) {
  const m = /^!([a-z]+)(?:\s|$)/i.exec(String(message || '').trim());
  return m ? ALIASES[m[1].toLowerCase()] || null : null;
}

/** Aktivierte Befehle aus Einstellung oder Anfrage (Liste oder „a,b") — nur bekannte, in fester Reihenfolge. */
function normalizeViewerCommands(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(',');
  const wanted = new Set(list.map((s) => String(s).trim().toLowerCase()));
  return VIEWER_COMMANDS.filter((c) => wanted.has(c));
}

function normalizeCooldownS(raw) {
  const n = Number(raw);
  return COOLDOWNS_S.includes(n) ? n : DEFAULT_COOLDOWN_S;
}

/**
 * Abklingzeit je Kanal und Befehl: nach einer Antwort schweigt derselbe Befehl im selben Kanal cooldownS Sekunden
 * lang. Moderatoren und der Streamer kommen immer durch (und starten die Zeit neu).
 */
function createCooldowns({ now = () => Date.now() } = {}) {
  const last = new Map();
  return {
    /** true = antworten (Zeitpunkt wird gemerkt), false = noch in der Abklingzeit */
    take(channel, cmd, cooldownS, bypass = false) {
      const key = `${channel}|${cmd}`;
      const t = now();
      const prev = last.get(key);
      if (!bypass && prev !== undefined && t - prev < cooldownS * 1000) return false;
      last.set(key, t);
      if (last.size > 5000) {
        for (const [k, v] of last) if (t - v > Math.max(...COOLDOWNS_S) * 1000) last.delete(k);
      }
      return true;
    },
  };
}

/** Name des getrackten Modus aus dem Overlay-Zustand (Saison-Modi tragen ihren eigenen). */
function modeLabelOf(state, lang) {
  const labels = MODE_LABELS[lang === 'en' ? 'en' : 'de'];
  const mode = state?.settings?.trackMode || 'medals';
  if (state?.seasonal?.label) return state.seasonal.label;
  return labels[mode] || labels.medals;
}

/** Adresse der Deck-Seite (Stats, dort auch „ins Spiel kopieren") — wie deckPath im Frontend (scout/scoutUtil.js). */
function deckUrl(cards, lang) {
  if (!Array.isArray(cards) || cards.length !== 8) return null;
  const keys = cards.map((c) => encodeURIComponent(c?.id || `n:${c?.name || ''}`)).sort().join(',');
  return `${SITE}/clash/decks/${keys}${lang === 'en' ? '?lang=en' : ''}`;
}

function rankReply(state, t, lang) {
  const parts = [];
  const league = Number(state.leagueNumber) || 0;
  if (league === UC_LEAGUE) {
    parts.push(t.league(league), t.medals(fmt(state.seasonMedals, lang)));
    if (state.polRank > 0) parts.push(t.place(fmt(state.polRank, lang)));
  } else if (league > 0) {
    parts.push(t.league(league));
    if (state.ladder?.maxSteps) parts.push(t.step(state.ladder.step, state.ladder.maxSteps));
  } else {
    parts.push(t.noRanked);
  }
  if (state.trophies > 0) parts.push(t.trophies(fmt(state.trophies, lang)));
  return `${state.playerName}: ${parts.join(' · ')}`;
}

function sessionReply(state, t, lang) {
  const label = modeLabelOf(state, lang);
  const { wins = 0, losses = 0, winPct = 0, profit = 0 } = state.daily || {};
  if (!wins && !losses) return t.sessionEmpty(label);
  const mode = state.settings?.trackMode || 'medals';
  let gain = null;
  if (mode.startsWith('c:')) gain = null; // Challenge: der Lauf zählt Siege, keinen Stand
  else if (mode === 'medals' && state.ladder) gain = t.steps(signed(state.ladder.sessionDelta || 0, lang));
  else if (mode === 'medals' || mode === '2v2') gain = t.medals(signed(profit, lang));
  else gain = t.trophies(signed(profit, lang));
  return `${t.session(label, wins, losses, winPct)}${gain ? ` · ${gain}` : ''}`;
}

function deckReply(state, t, lang) {
  const cards = state.deck?.cards;
  if (!Array.isArray(cards) || !cards.length) return t.deckNone;
  const names = cards.map((c) => (c?.variant && t.forms[c.variant] ? `${c.name} (${t.forms[c.variant]})` : c?.name || '?')).join(', ');
  return t.deck(modeLabelOf(state, lang), names, deckUrl(cards, lang));
}

/**
 * @param {object|null} record  { bestTrophies, seasonMedals, seasonRank, best2v2 } — Saisonwerte aus dem Verlauf
 *   (cr_wintracker_snapshots), null/0 = unbekannt
 */
function recordReply(state, t, lang, record) {
  const r = record || {};
  const parts = [];
  const bestTrophies = Math.max(Number(r.bestTrophies) || 0, Number(state.bestTrophies) || 0);
  if (bestTrophies > 0) parts.push(t.bestTrophies(fmt(bestTrophies, lang)));
  if (r.seasonMedals > 0) parts.push(t.seasonMedals(fmt(r.seasonMedals, lang)));
  if (r.seasonRank > 0) parts.push(t.seasonPlace(fmt(r.seasonRank, lang)));
  const best2v2 = Math.max(Number(r.best2v2) || 0, Number(state.league2v2BestTrophies) || 0);
  if (best2v2 > 0) parts.push(t.best2v2(fmt(best2v2, lang)));
  return parts.length ? t.record(state.playerName, parts) : t.recordNone(state.playerName);
}

/**
 * Antworttext für einen Zuschauer-Befehl.
 * @param {'rang'|'session'|'deck'|'rekord'} cmd
 * @param {{ state: object, lang?: string, record?: object }} ctx  state = crWinTrackerRoutes.overlayState(…)
 * @returns {string}
 */
function viewerReply(cmd, { state, lang = 'de', record = null } = {}) {
  const t = dictFor(lang);
  if (!state?.hasAccount) return t.noAccount;
  const text = cmd === 'rang' ? rankReply(state, t, lang)
    : cmd === 'session' ? sessionReply(state, t, lang)
      : cmd === 'deck' ? deckReply(state, t, lang)
        : recordReply(state, t, lang, record);
  return clip(text);
}

module.exports = {
  VIEWER_COMMANDS, COOLDOWNS_S, DEFAULT_COOLDOWN_S, MODE_LABELS,
  parseViewerCommand, normalizeViewerCommands, normalizeCooldownS, createCooldowns, viewerReply, deckUrl, modeLabelOf,
};
