// Zugriff auf die offizielle Clash-Royale-API.
//
// Denselben Client gab es dreimal im Projekt: in crWinTrackerRoutes.js, in
// nuzlockeRoutes.js und in clashRoyale/core/officialModeScanner.js — jeweils mit eigener
// Zeitbegrenzung und eigener Fehlerbehandlung. Beim Nachrüsten des Lobby-Trackings wäre
// eine vierte Kopie dazugekommen.
//
// Hier liegt nur der Transport plus die Umformungen, die mehr als ein Aufrufer braucht.
// Wie die Daten danach aussehen sollen, entscheidet weiterhin jeder Aufrufer selbst.
//
// Zum Token: Supercell bindet API-Tokens an die IP des Servers. Fehlt er oder passt die
// IP nicht, liefern alle Funktionen hier null statt zu werfen — die aufrufenden Features
// (Win-Tracker, Nuzlocke, Lobby-Tracking) sind allesamt optional und dürfen die Seite
// nicht mitreißen.

const CR_API_TOKEN = process.env.CLASH_ROYALE_API_TOKEN || '';
const CR_API_BASE = process.env.CLASH_ROYALE_API_BASE || 'https://api.clashroyale.com/v1';

const DEFAULT_TIMEOUT_MS = 8000;

/** Ohne Token ist die API nicht nutzbar — Features können sich danach richten. */
const isConfigured = () => !!CR_API_TOKEN;

// Spieler-Tags nutzen ein eingeschränktes Alphabet; O wird als 0 gelesen, weil beides
// in der Spielschrift fast gleich aussieht und Spieler es beim Abtippen verwechseln.
const TAG_CHARS = /^[0289PYLQGRJCUV]{3,12}$/;

function normalizeTag(raw) {
  const tag = String(raw || '').trim().toUpperCase().replace(/^#/, '').replace(/O/g, '0');
  return TAG_CHARS.test(tag) ? tag : null;
}

/**
 * GET auf die API.
 * @returns Daten, `{ notFound: true }` bei 404, `null` ohne Token
 * @throws bei jedem anderen HTTP-Fehler und bei Zeitüberschreitung
 */
async function crApiGet(path, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!CR_API_TOKEN) return null;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${CR_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${CR_API_TOKEN}` },
      signal: ctrl.signal,
    });
    if (res.status === 404) return { notFound: true };
    if (!res.ok) throw new Error(`Royale API HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Wie crApiGet, wirft aber nie — für Hintergrundschleifen (Modus-Scanner, Lobby-Tracking),
 * die pro Durchlauf Dutzende Anfragen stellen und bei einem 429 oder einem Netzhänger
 * nicht abbrechen dürfen.
 */
async function crApiGetSafe(path, opts) {
  try {
    const data = await crApiGet(path, opts);
    return data && !data.notFound ? data : null;
  } catch {
    return null;
  }
}

// "20260721T101530.000Z" (kompaktes API-Format) → Unix-Millisekunden
function parseBattleTimeMs(bt) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d{3})Z$/.exec(String(bt || ''));
  if (!m) return Date.now();
  const [, y, mo, d, h, mi, s, ms] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms);
}

// Sieg/Niederlage. Die Trophäenänderung ist das verlässlichere Signal (sie fehlt aber in
// Modi ohne Wertung), deshalb erst sie, dann der Kronenvergleich.
function resultOf(team, opponent) {
  const tc = team?.trophyChange;
  if (typeof tc === 'number' && tc !== 0) return tc > 0 ? 'win' : 'loss';
  const cf = team?.crowns ?? 0;
  const ca = opponent?.crowns ?? 0;
  if (cf > ca) return 'win';
  if (cf < ca) return 'loss';
  return 'draw';
}

/** Battlelog eines Spielers, vereinheitlicht. Liefert immer ein Array (ggf. leer). */
async function fetchBattlelog(tag, { safe = false } = {}) {
  const get = safe ? crApiGetSafe : crApiGet;
  const data = await get(`/players/%23${tag}/battlelog`);
  if (!Array.isArray(data)) return [];
  return data.map((b) => {
    const team = b.team?.[0] || {};
    const opponent = b.opponent?.[0] || {};
    return {
      battleTime: b.battleTime,
      battleTimeMs: parseBattleTimeMs(b.battleTime),
      result: resultOf(team, opponent),
      trophyChange: typeof team.trophyChange === 'number' ? team.trophyChange : 0,
      crownsFor: team.crowns ?? 0,
      crownsAgainst: opponent.crowns ?? 0,
      opponentName: opponent.name || '',
      gameMode: b.gameMode?.name || '',
    };
  });
}

/**
 * Spielerprofil in der Form, die Win-Tracker und Lobby-Tracking brauchen.
 * @returns Profil, `{ notFound: true }`, oder null ohne Token
 */
async function fetchPlayerSummary(tag) {
  const data = await crApiGet(`/players/%23${tag}`);
  if (!data || data.notFound) return data;
  const pol = data.currentPathOfLegendSeasonResult || null;
  return {
    name: data.name || '',
    trophies: data.trophies || 0,
    bestTrophies: data.bestTrophies || data.trophies || 0,
    // "Medaillen": Punktestand der laufenden Ranked-Season (Path of Legend) — im Gegensatz
    // zu den Lifetime-"Trophäen" oben startet dieser Wert jede Season wieder bei 0.
    seasonMedals: pol?.trophies || 0,
    leagueNumber: pol?.leagueNumber || 0,
    polRank: typeof pol?.rank === 'number' ? pol.rank : null,
  };
}

module.exports = {
  CR_API_BASE,
  isConfigured,
  normalizeTag,
  crApiGet,
  crApiGetSafe,
  parseBattleTimeMs,
  resultOf,
  fetchBattlelog,
  fetchPlayerSummary,
};
