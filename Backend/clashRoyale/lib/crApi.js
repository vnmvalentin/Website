// Zugriff auf die offizielle Clash-Royale-API.
//
// Denselben Client gab es dreimal im Projekt: in crWinTrackerRoutes.js, in nuzlockeRoutes.js
// und im inzwischen entfernten officialModeScanner.js (Auto-Erkennung von Spezialmodus-
// Kartenpools) — jeweils mit eigener Zeitbegrenzung und eigener Fehlerbehandlung. Beim
// Nachrüsten des Lobby-Trackings wäre eine vierte Kopie dazugekommen.
//
// Hier liegt nur der Transport plus die Umformungen, die mehr als ein Aufrufer braucht.
// Wie die Daten danach aussehen sollen, entscheidet weiterhin jeder Aufrufer selbst.
//
// Zum Token: Supercell bindet API-Tokens an die IP des Servers. Fehlt er oder passt die
// IP nicht, liefern alle Funktionen hier null statt zu werfen — die aufrufenden Features
// (Win-Tracker, Nuzlocke, Lobby-Tracking) sind allesamt optional und dürfen die Seite
// nicht mitreißen.
//
// Token pro Aufrufer: der geteilte CR_API_TOKEN bleibt die Voreinstellung (Nuzlocke,
// Lobby-Tracking und der Rest nutzen ihn unverändert, ohne etwas anzupassen), aber jede
// Funktion nimmt optional ein eigenes `token` entgegen — z.B. verwendet der Win-Tracker
// CLASH_ROYALE_API_TOKEN_WINTRACKER, damit er ein eigenes Rate-Limit-Kontingent hat und
// nicht am selben Token wie die anderen CR-Features hängt.

const CR_API_TOKEN = process.env.CLASH_ROYALE_API_TOKEN || '';
const CR_API_BASE = process.env.CLASH_ROYALE_API_BASE || 'https://api.clashroyale.com/v1';

const DEFAULT_TIMEOUT_MS = 8000;

/** Ohne Token ist die API nicht nutzbar — Features können sich danach richten. */
const isConfigured = (token) => !!(token || CR_API_TOKEN);

// Spieler-Tags nutzen ein eingeschränktes Alphabet; O wird als 0 gelesen, weil beides
// in der Spielschrift fast gleich aussieht und Spieler es beim Abtippen verwechseln.
const TAG_CHARS = /^[0289PYLQGRJCUV]{3,12}$/;

function normalizeTag(raw) {
  const tag = String(raw || '').trim().toUpperCase().replace(/^#/, '').replace(/O/g, '0');
  return TAG_CHARS.test(tag) ? tag : null;
}

/**
 * GET auf die API.
 * @param {string} path
 * @param {{timeoutMs?: number, token?: string}} [opts] `token` überschreibt den geteilten
 *   CR_API_TOKEN für diesen einen Aufruf.
 * @returns Daten, `{ notFound: true }` bei 404, `null` ohne Token
 * @throws bei jedem anderen HTTP-Fehler und bei Zeitüberschreitung
 */
async function crApiGet(path, { timeoutMs = DEFAULT_TIMEOUT_MS, token } = {}) {
  const useToken = token || CR_API_TOKEN;
  if (!useToken) return null;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${CR_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${useToken}` },
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
async function fetchBattlelog(tag, { safe = false, token } = {}) {
  const get = safe ? crApiGetSafe : crApiGet;
  const data = await get(`/players/%23${tag}/battlelog`, { token });
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
      // arena.rawName — nötig um 2v2-Ranked-Matches von einem gewöhnlichen 2v2-Freundschaftsspiel
      // zu unterscheiden: beide teilen denselben gameMode.name ("TeamVsTeam"), nur die Arena
      // verrät die laufende 2v2-Ranked-Season (z.B. "2v2League_202609Arena2"). Empirisch geprüft
      // an echten Battlelogs (siehe Kommentar in crWinTrackerRoutes.js bei isLeague2v2Arena).
      //
      // Für KÜNFTIGE Leaderboard-Modi (nicht nur 2v2): GET /events (ungedokumentiert, aber
      // funktioniert) liefert die aktuell laufende Event-Rotation als
      // [{ eventTag, title, description }] — u.a. "2v2 League" (eventTag "#2C9J990U" zur Zeit
      // dieses Kommentars), "Seasonal Trophy Road", "Merge Tactics" (AutoChess) und die
      // Challenges. JEDES Battle mit `b.eventTag` gesetzt gehört zu genau einem dieser Einträge —
      // empirisch an 30/30 2v2-League-Matches bestätigt (Ranked1v1 hat dagegen IMMER
      // eventTag:null, taucht auch nicht in /events auf). Das ist robuster als die
      // arena.rawName-Präfixsuche hier (kein Raten des Namensschemas nötig), aber eine
      // zusätzliche Anfrage + season-abhängige eventTags — für 2v2 reicht arena.rawName, aber
      // für einen KÜNFTIGEN neuen Leaderboard-Modus zuerst hier nachsehen, welchen `title` das
      // Event trägt, statt erneut Namen zu erraten. "Merge Tactics" hat denselben
      // progress[key]-Aufbau wie 2v2 League (siehe extractLeague2v2Progress unten) — dort steht
      // der Schlüssel "AutoChess_<season>", noch nicht getrackt.
      arenaRawName: b.arena?.rawName || '',
      // Nur bei 2v2-Ranked genutzt (siehe applyLeague2v2Deltas in crWinTrackerRoutes.js) — die
      // API liefert hier kein trophyChange, wohl aber den Kontostand VOR dem Match.
      startingTrophies: typeof team.startingTrophies === 'number' ? team.startingTrophies : null,
      // Rohe Kartenliste des eigenen Teams (Name, Level, Evo-Stufe) — nicht persistiert in
      // cr_wintracker_battles, aber während des Syncs verfügbar, um das "aktuelle Deck" je
      // Modus abzuleiten (die API kennt keinen eigenen Endpoint dafür).
      cards: Array.isArray(team.cards) ? team.cards : [],
    };
  });
}

/**
 * Spielerprofil in der Form, die Win-Tracker und Lobby-Tracking brauchen.
 * @param {string} tag
 * @param {string} [token] überschreibt den geteilten CR_API_TOKEN für diesen Aufruf.
 * @returns Profil, `{ notFound: true }`, oder null ohne Token
 */
async function fetchPlayerSummary(tag, token) {
  const data = await crApiGet(`/players/%23${tag}`, { token });
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
    league2v2: extractLeague2v2Progress(data),
    // Generische Liste ALLER progress-Einträge (siehe Kommentar an extractLeague2v2Progress) —
    // nicht nur der 2v2-Sonderfall. Dient winTrackerRoutes.recordDiscoveredModes(), um KÜNFTIGE
    // Ranked-artige Event-Leiterboards automatisch zu bemerken, sobald Supercell sie einführt
    // (z.B. war "Merge Tactics"/AutoChess zum Zeitpunkt dieses Kommentars schon so ein Eintrag,
    // aber noch nicht als eigener trackMode ausgebaut).
    seasonalProgress: extractAllSeasonalProgress(data),
  };
}

function extractAllSeasonalProgress(data) {
  const progress = data?.progress;
  if (!progress || typeof progress !== 'object') return [];
  const out = [];
  for (const [key, entry] of Object.entries(progress)) {
    if (!key || !entry?.arena?.rawName) continue; // "" ist ein Katalog-Rest ohne echten Modus
    out.push({
      key,
      arenaRawName: entry.arena.rawName,
      arenaName: entry.arena.name || '',
      trophies: entry.trophies || 0,
      bestTrophies: entry.bestTrophies || entry.trophies || 0,
    });
  }
  return out;
}

// 2v2 Ranked (seit September 2026): die API führt dafür keinen eigenen Top-Level-Block wie
// currentPathOfLegendSeasonResult, sondern einen Eintrag in `progress` — einem generischen
// Sammelbecken für mehrere zeitlich befristete Event-Leiterboards (u.a. auch AutoChess und die
// saisonale Trophäenstraße stehen dort drin). Der Schlüssel ist saisongebunden benannt
// (z.B. "2v2League_202609"), deshalb hier bewusst NICHT hart verdrahtet, sondern per Präfix auf
// arena.rawName gesucht — bleibt so über künftige Season-Wechsel hinweg gültig. Empirisch
// bestätigt an einem echten Account (#R09228V) während der laufenden September-2026-Season:
// trophies steigt bei Sieg (~10-30) und sinkt bei Niederlage (~25-50), also echtes Medaillen-
// artiges Elo, kein reiner Stufenzähler. Liefert null außerhalb eines laufenden 2v2-Ranked-Fensters
// (der Key fehlt dann schlicht in `progress`) — der Win-Tracker zeigt dann "keine Daten" statt
// eines falschen Werts.
function extractLeague2v2Progress(data) {
  const progress = data?.progress;
  if (!progress || typeof progress !== 'object') return null;
  for (const entry of Object.values(progress)) {
    const rawName = entry?.arena?.rawName || '';
    if (/^2v2league/i.test(rawName)) {
      return {
        trophies: entry.trophies || 0,
        bestTrophies: entry.bestTrophies || entry.trophies || 0,
        arenaName: entry.arena?.name || '',
      };
    }
  }
  return null;
}

/**
 * Namen der Karten, die ein Spieler freigeschaltet hat. Die API liefert in `cards` NUR
 * Karten, die der Account jemals gefunden hat — nicht der komplette Kartensatz mit
 * Platzhaltern. Empirisch bestätigt: ein Account mit King-Tower-Level 12 hatte 104 von 123
 * Karten im Array, die übrigen 19 fehlten komplett (nicht etwa mit level:0 o.ä. markiert).
 * @param {string} tag
 * @param {string} [token]
 * @returns `{ names: string[] }`, `{ notFound: true }`, oder null ohne Token
 */
async function fetchPlayerCards(tag, token) {
  const data = await crApiGet(`/players/%23${tag}`, { token });
  if (!data || data.notFound) return data;
  return { names: (data.cards || []).map((c) => c.name).filter(Boolean) };
}

module.exports = {
  CR_API_BASE,
  isConfigured,
  normalizeTag,
  crApiGet,
  crApiGetSafe,
  parseBattleTimeMs,
  resultOf,
  fetchPlayerCards,
  fetchBattlelog,
  fetchPlayerSummary,
};
