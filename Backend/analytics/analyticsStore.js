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

// ANALYTICS_DB biegt den Pfad für Prüfstände um — nie gegen die echte Datei testen.
const dbPath = process.env.ANALYTICS_DB || path.join(__dirname, 'data', 'analytics.db');
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
};

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
  };
}

module.exports = { recordView, recordTime, getReport, dayKey };
