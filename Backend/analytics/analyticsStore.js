// analyticsStore.js — Besucherzählung der Website ohne Cookies und ohne gespeicherte Adressen.
//
// Gespeichert werden ausschließlich Tagessummen (Aufrufe, Besucher, Verweildauer je Seite,
// Herkunft, Browsersprache, Gerät). Um einen Besucher am selben Tag nicht doppelt zu zählen,
// braucht es trotzdem ein Wiedererkennungsmerkmal: einen Hash aus Adresse + Browserkennung +
// einem Zufallswert, der jeden Tag neu gewürfelt wird. Der Hash steht nur für den laufenden Tag
// in der Tabelle `seen`; beim Tageswechsel werden Zufallswert und Hashes gelöscht. Danach lässt
// sich niemand mehr zuordnen, und über Tage hinweg ist ein Besucher nie wiedererkennbar.
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { dataPath } = require('../lib/dataDir');
const { SPIELE, spielVonPfad } = require('./spiele');

// ANALYTICS_DB biegt den Pfad für Prüfstände um — nie gegen die echte Datei testen.
const dbPath = process.env.ANALYTICS_DB || dataPath('analytics.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS page_day (
    day TEXT NOT NULL, path TEXT NOT NULL,
    views INTEGER NOT NULL DEFAULT 0, visitors INTEGER NOT NULL DEFAULT 0, seconds INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, path)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS day_total (
    day TEXT PRIMARY KEY,
    views INTEGER NOT NULL DEFAULT 0, visitors INTEGER NOT NULL DEFAULT 0,
    mobile INTEGER NOT NULL DEFAULT 0, desktop INTEGER NOT NULL DEFAULT 0
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS source_day (
    day TEXT NOT NULL, source TEXT NOT NULL, visitors INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, source)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS lang_day (
    day TEXT NOT NULL, lang TEXT NOT NULL, visitors INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, lang)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS seen (
    day TEXT NOT NULL, hash TEXT NOT NULL, scope TEXT NOT NULL,
    PRIMARY KEY (day, hash, scope)
  ) WITHOUT ROWID;
  -- Admin-Reiter „Spiele“ (seit 16.11.2026): Besucher je Spiel und Trichterstufen je Tag, ebenfalls nur Tagessummen
  CREATE TABLE IF NOT EXISTS game_day (
    day TEXT NOT NULL, game TEXT NOT NULL, visitors INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, game)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS funnel_day (
    day TEXT NOT NULL, step TEXT NOT NULL, visitors INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, step)
  ) WITHOUT ROWID;
  -- Begonnene Partien je Spiel und Tag, gemeldet von den Spielen selbst (lib/spielStatistik.js zaehlePartie)
  CREATE TABLE IF NOT EXISTS match_day (
    day TEXT NOT NULL, game TEXT NOT NULL, matches INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, game)
  ) WITHOUT ROWID;
`);

// Obergrenze unterschiedlicher Seiten je Tag. Unbekannte Adressen (Tippfehler, Scanner) landen
// sonst als je eigene Zeile in der Tabelle; alles darüber wird unter einem Sammelnamen gezählt.
const MAX_PATHS_PER_DAY = 300;
const OVERFLOW_PATH = '(sonstige)';
const MAX_SECONDS_PER_REPORT = 1800;
const LIVE_WINDOW_MS = 5 * 60 * 1000;

const stmt = {
  getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
  setMeta: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  clearSeen: db.prepare('DELETE FROM seen WHERE day <> ?'),
  markSeen: db.prepare('INSERT OR IGNORE INTO seen (day, hash, scope) VALUES (?, ?, ?)'),
  hasPath: db.prepare('SELECT 1 FROM page_day WHERE day = ? AND path = ?'),
  countPaths: db.prepare('SELECT COUNT(*) AS n FROM page_day WHERE day = ?'),
  addPage: db.prepare(`INSERT INTO page_day (day, path, views, visitors) VALUES (?, ?, 1, ?)
    ON CONFLICT(day, path) DO UPDATE SET views = views + 1, visitors = visitors + excluded.visitors`),
  addSeconds: db.prepare('UPDATE page_day SET seconds = seconds + ? WHERE day = ? AND path = ?'),
  addTotal: db.prepare(`INSERT INTO day_total (day, views, visitors, mobile, desktop) VALUES (?, 1, ?, ?, ?)
    ON CONFLICT(day) DO UPDATE SET views = views + 1, visitors = visitors + excluded.visitors,
      mobile = mobile + excluded.mobile, desktop = desktop + excluded.desktop`),
  addSource: db.prepare(`INSERT INTO source_day (day, source, visitors) VALUES (?, ?, 1)
    ON CONFLICT(day, source) DO UPDATE SET visitors = visitors + 1`),
  addLang: db.prepare(`INSERT INTO lang_day (day, lang, visitors) VALUES (?, ?, 1)
    ON CONFLICT(day, lang) DO UPDATE SET visitors = visitors + 1`),
  series: db.prepare('SELECT day, views, visitors, mobile, desktop FROM day_total WHERE day >= ? ORDER BY day ASC'),
  pages: db.prepare(`SELECT path, SUM(views) AS views, SUM(visitors) AS visitors, SUM(seconds) AS seconds
    FROM page_day WHERE day >= ? GROUP BY path ORDER BY views DESC LIMIT 200`),
  sources: db.prepare(`SELECT source, SUM(visitors) AS visitors FROM source_day WHERE day >= ?
    GROUP BY source ORDER BY visitors DESC LIMIT 50`),
  langs: db.prepare(`SELECT lang, SUM(visitors) AS visitors FROM lang_day WHERE day >= ?
    GROUP BY lang ORDER BY visitors DESC LIMIT 20`),
  hasSeen: db.prepare('SELECT 1 FROM seen WHERE day = ? AND hash = ? AND scope = ?'),
  addGame: db.prepare(`INSERT INTO game_day (day, game, visitors) VALUES (?, ?, 1)
    ON CONFLICT(day, game) DO UPDATE SET visitors = visitors + 1`),
  addStep: db.prepare(`INSERT INTO funnel_day (day, step, visitors) VALUES (?, ?, 1)
    ON CONFLICT(day, step) DO UPDATE SET visitors = visitors + 1`),
  games: db.prepare('SELECT day, game, visitors FROM game_day WHERE day >= ?'),
  steps: db.prepare('SELECT step, SUM(visitors) AS visitors FROM funnel_day WHERE day >= ? GROUP BY step'),
  firstTracked: db.prepare('SELECT MIN(day) AS day FROM funnel_day'),
  visitorsSince: db.prepare('SELECT SUM(visitors) AS v FROM day_total WHERE day >= ?'),
  startSince: db.prepare("SELECT SUM(visitors) AS v FROM page_day WHERE day >= ? AND path = '/'"),
  addMatch: db.prepare(`INSERT INTO match_day (day, game, matches) VALUES (?, ?, 1)
    ON CONFLICT(day, game) DO UPDATE SET matches = matches + 1`),
  matches: db.prepare('SELECT day, game, matches FROM match_day WHERE day >= ?'),
  matchGames: db.prepare('SELECT game, MIN(day) AS since FROM match_day GROUP BY game'),
  // ohne LIMIT: die Spielzeit je Spiel darf nicht davon abhängen, ob eine Spielseite unter den 200 meistbesuchten ist
  pagesAll: db.prepare('SELECT path, SUM(views) AS views, SUM(seconds) AS seconds FROM page_day WHERE day >= ? GROUP BY path'),
};
const GAME_IDS = new Set(SPIELE.map((s) => s.id));

const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' });
/** Kalendertag in deutscher Zeit (JJJJ-MM-TT) — der Server läuft in UTC, der Tag soll trotzdem um Mitternacht hier kippen. */
function dayKey(ts = Date.now()) {
  return dayFormat.format(new Date(ts));
}

let saltDay = null;
let salt = null;
function saltFor(day) {
  if (saltDay === day && salt) return salt;
  const storedDay = stmt.getMeta.get('salt_day')?.value;
  const stored = stmt.getMeta.get('salt')?.value;
  if (storedDay === day && stored) {
    salt = stored;
  } else {
    salt = crypto.randomBytes(32).toString('hex');
    db.transaction(() => {
      stmt.setMeta.run('salt', salt);
      stmt.setMeta.run('salt_day', day);
      stmt.clearSeen.run(day);
    })();
  }
  saltDay = day;
  return salt;
}

function visitorHash(day, ip, userAgent) {
  return crypto.createHash('sha256').update(`${saltFor(day)}|${ip}|${userAgent}`).digest('hex').slice(0, 32);
}

// Wer in den letzten Minuten etwas gemeldet hat. Nur im Arbeitsspeicher: nach einem Neustart
// stimmt die Zahl ohnehin erst wieder, wenn sich die offenen Tabs gemeldet haben.
const live = new Map();
function touchLive(hash, now) {
  live.set(hash, now);
  if (live.size > 5000) for (const [k, t] of live) if (now - t > LIVE_WINDOW_MS) live.delete(k);
}
function liveCount(now = Date.now()) {
  let n = 0;
  for (const t of live.values()) if (now - t <= LIVE_WINDOW_MS) n++;
  return n;
}

const recordViewTx = db.transaction(({ day, hash, path: rawPath, source, lang, mobile }) => {
  let pagePath = rawPath;
  if (!stmt.hasPath.get(day, pagePath) && stmt.countPaths.get(day).n >= MAX_PATHS_PER_DAY) pagePath = OVERFLOW_PATH;

  const newToday = stmt.markSeen.run(day, hash, '*').changes > 0;
  const newOnPage = stmt.markSeen.run(day, hash, `p:${pagePath}`).changes > 0;
  stmt.addPage.run(day, pagePath, newOnPage ? 1 : 0);
  stmt.addTotal.run(day, newToday ? 1 : 0, newToday && mobile ? 1 : 0, newToday && !mobile ? 1 : 0);
  if (newToday && lang) stmt.addLang.run(day, lang);
  // Herkunft zählt je Besucher und Quelle einmal am Tag — wer zehnmal über denselben Link kommt, ist ein Besucher.
  if (source && stmt.markSeen.run(day, hash, `s:${source}`).changes > 0) stmt.addSource.run(day, source);

  // Spiele und Trichter (Admin-Reiter „Spiele“): je Besucher und Tag einmal, über dieselben Tages-Hashes in `seen` —
  // also auch nur innerhalb eines Tages. „Startseite → Spiel“ zählt, sobald beides am selben Tag vorkam, egal in
  // welcher Reihenfolge. Bewusst rawPath: ein Spiel zählt auch dann, wenn die Seitenliste des Tages schon voll ist.
  const game = spielVonPfad(rawPath);
  if (game) {
    if (stmt.markSeen.run(day, hash, `g:${game}`).changes > 0) stmt.addGame.run(day, game);
    if (stmt.markSeen.run(day, hash, 'g').changes > 0) stmt.addStep.run(day, 'spiel');
  }
  if (game || rawPath === '/') {
    const sahStart = rawPath === '/' || Boolean(stmt.hasSeen.get(day, hash, 'p:/'));
    const spielte = Boolean(game) || Boolean(stmt.hasSeen.get(day, hash, 'g'));
    if (sahStart && spielte && stmt.markSeen.run(day, hash, 'fs').changes > 0) stmt.addStep.run(day, 'start_spiel');
  }
});

/**
 * Zählt einen Seitenaufruf.
 * @param {{ ip: string, userAgent: string, path: string, source?: string|null, lang?: string|null, mobile?: boolean, now?: number }} hit
 */
function recordView({ ip, userAgent, path: pagePath, source = null, lang = null, mobile = false, now = Date.now() }) {
  const day = dayKey(now);
  const hash = visitorHash(day, ip, userAgent);
  recordViewTx({ day, hash, path: pagePath, source, lang, mobile });
  touchLive(hash, now);
}

/** Bucht sichtbare Zeit auf eine Seite, die heute schon gezählt wurde (sonst verfällt die Meldung). */
function recordTime({ ip, userAgent, path: pagePath, seconds, now = Date.now() }) {
  const s = Math.floor(Number(seconds));
  if (!Number.isFinite(s) || s < 1) return;
  const day = dayKey(now);
  stmt.addSeconds.run(Math.min(s, MAX_SECONDS_PER_REPORT), day, pagePath);
  touchLive(visitorHash(day, ip, userAgent), now);
}

/** Zählt eine begonnene Partie (über lib/spielStatistik.js). Unbekannte Spiele werden verworfen → false. */
function recordMatch(game, now = Date.now()) {
  if (!GAME_IDS.has(game)) return false;
  stmt.addMatch.run(dayKey(now), game);
  return true;
}

/** Auswertung der letzten `days` Tage (heute eingeschlossen) fürs Admin-Dashboard. */
function getReport(days, now = Date.now()) {
  const span = Math.min(Math.max(Math.floor(Number(days)) || 30, 1), 365);
  const from = dayKey(now - (span - 1) * 24 * 60 * 60 * 1000);
  const byDay = new Map(stmt.series.all(from).map((r) => [r.day, r]));

  // Lücken auffüllen: ein Tag ohne Besuch hat keine Zeile, soll im Verlauf aber als 0 stehen.
  const series = [];
  for (let i = span - 1; i >= 0; i--) {
    const day = dayKey(now - i * 24 * 60 * 60 * 1000);
    if (series.length && series[series.length - 1].day === day) continue; // Zeitumstellung
    const r = byDay.get(day);
    series.push({ day, views: r?.views || 0, visitors: r?.visitors || 0, mobile: r?.mobile || 0, desktop: r?.desktop || 0 });
  }

  const sum = (key) => series.reduce((s, r) => s + r[key], 0);
  const pages = stmt.pages.all(from);
  return {
    days: span,
    from,
    to: dayKey(now),
    live: liveCount(now),
    totals: {
      views: sum('views'),
      // Summe der Tageswerte: wer an drei Tagen kommt, zählt dreimal. Über Tage hinweg ist
      // absichtlich niemand wiedererkennbar, eine echte Zahl "verschiedene Personen" gibt es nicht.
      visitors: sum('visitors'),
      mobile: sum('mobile'),
      desktop: sum('desktop'),
      seconds: pages.reduce((s, p) => s + p.seconds, 0),
    },
    series,
    pages,
    sources: stmt.sources.all(from),
    langs: stmt.langs.all(from),
    ...spieleUndTrichter(from, series),
  };
}

/**
 * Besucher je Spiel (mit Tagesverlauf und Spielzeit) und der Trichter Besucher → Startseite → Spiel. Gezählt wird erst
 * seit dem 16.11.2026; ältere Tage im Zeitraum würden die Anteile verfälschen, deshalb rechnet der Trichter ab `seit`.
 */
function spieleUndTrichter(from, series) {
  const ersterTag = stmt.firstTracked.get()?.day || null;
  const ab = ersterTag && ersterTag > from ? ersterTag : from;
  const pages = stmt.pagesAll.all(from);

  const nachSpielUndTag = (rows, feld) => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r.game)) m.set(r.game, new Map());
      m.get(r.game).set(r.day, r[feld]);
    }
    return m;
  };
  const besuche = nachSpielUndTag(stmt.games.all(from), 'visitors');
  const partien = nachSpielUndTag(stmt.matches.all(from), 'matches');
  // Partien gibt es nur von Spielen, die zaehlePartie aufrufen — alle anderen zeigen „–“ statt einer falschen 0
  const partienSeit = new Map(stmt.matchGames.all().map((r) => [r.game, r.since]));

  const spiele = SPIELE.map((s) => {
    const tage = besuche.get(s.id) || new Map();
    const tagePartien = partien.get(s.id) || new Map();
    const meldet = partienSeit.has(s.id);
    const verlauf = series.map((d) => ({
      day: d.day,
      visitors: tage.get(d.day) || 0,
      matches: meldet ? tagePartien.get(d.day) || 0 : null,
    }));
    const seiten = pages.filter((p) => spielVonPfad(p.path) === s.id);
    return {
      id: s.id,
      name: s.name,
      visitors: verlauf.reduce((x, d) => x + d.visitors, 0),
      views: seiten.reduce((x, p) => x + p.views, 0),
      seconds: seiten.reduce((x, p) => x + p.seconds, 0),
      matches: meldet ? verlauf.reduce((x, d) => x + d.matches, 0) : null,
      matchesSince: partienSeit.get(s.id) || null,
      series: verlauf,
    };
  }).sort((a, b) => b.visitors - a.visitors || b.views - a.views);

  const stufen = Object.fromEntries(stmt.steps.all(ab).map((r) => [r.step, r.visitors]));
  const trichter = ersterTag
    ? {
      seit: ab,
      visitors: stmt.visitorsSince.get(ab)?.v || 0,
      start: stmt.startSince.get(ab)?.v || 0,
      game: stufen.spiel || 0,
      startToGame: stufen.start_spiel || 0,
    }
    : null;
  return { spiele, trichter, spieleSeit: ersterTag };
}

module.exports = { recordView, recordTime, recordMatch, getReport, dayKey };
