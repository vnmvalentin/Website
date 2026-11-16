// fehler/fehlerStore.js — Fehlerbilder in SQLite (data/fehler.db, Env FEHLER_DB).
//
// Ein Fehlerbild = alle Meldungen mit derselben Signatur (fehler/signatur.js). Gespeichert werden Zähler, erstes und
// letztes Auftreten, die geschwärzte Nachricht samt Stack des ersten Auftretens und die letzten 10 Beispiele (Zeit,
// Seite, Browser, Gerät, Kontext). Je Tag eine Zählzeile für den Verlauf. Status: offen | erledigt | stumm — ein
// erledigtes Bild, das wieder auftritt, springt auf offen zurück (Rückfall), ein stummes zählt nur still mit.
// Deckel: höchstens 2000 Fehlerbilder; Aufräumen löscht Tageszeilen nach 90 Tagen und erledigte/stumme Bilder, die
// seit 90 Tagen nicht mehr kamen.

const Database = require("better-sqlite3");
const { dataPath } = require("../lib/dataDir");
const { schwaerze, signaturVon } = require("./signatur");

const MAX_BILDER = 2000;
const MAX_BEISPIELE = 10;
const AUFBEWAHRUNG_MS = 90 * 24 * 60 * 60 * 1000;
const STATUS = new Set(["offen", "erledigt", "stumm"]);

const zweistellig = (n) => String(n).padStart(2, "0");
const tagVon = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}`;
};
const kurz = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

function createFehlerStore({ datei = process.env.FEHLER_DB || dataPath("fehler.db"), now = Date.now, maxBilder = MAX_BILDER } = {}) {
  const db = new Database(datei);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS fehlerbilder (
      signatur TEXT PRIMARY KEY,
      quelle TEXT NOT NULL,
      art TEXT NOT NULL,
      nachricht TEXT NOT NULL,
      stapel TEXT NOT NULL DEFAULT '',
      seite TEXT NOT NULL DEFAULT '',
      erstes INTEGER NOT NULL,
      letztes INTEGER NOT NULL,
      anzahl INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'offen',
      status_seit INTEGER,
      beispiele TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS fehlerbilder_letztes ON fehlerbilder (letztes);
    CREATE TABLE IF NOT EXISTS fehler_tage (
      signatur TEXT NOT NULL,
      tag TEXT NOT NULL,
      anzahl INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (signatur, tag)
    );
  `);
  const st = {
    get: db.prepare("SELECT * FROM fehlerbilder WHERE signatur = ?"),
    zahl: db.prepare("SELECT COUNT(*) AS n FROM fehlerbilder"),
    neu: db.prepare(`INSERT INTO fehlerbilder (signatur, quelle, art, nachricht, stapel, seite, erstes, letztes, beispiele)
      VALUES (@signatur, @quelle, @art, @nachricht, @stapel, @seite, @t, @t, @beispiele)`),
    wieder: db.prepare(`UPDATE fehlerbilder SET letztes = @t, anzahl = anzahl + 1, seite = @seite, beispiele = @beispiele,
      status = @status, status_seit = @statusSeit WHERE signatur = @signatur`),
    tag: db.prepare(`INSERT INTO fehler_tage (signatur, tag, anzahl) VALUES (?, ?, 1)
      ON CONFLICT(signatur, tag) DO UPDATE SET anzahl = anzahl + 1`),
    liste: db.prepare(`SELECT signatur, quelle, art, nachricht, seite, erstes, letztes, anzahl, status
      FROM fehlerbilder WHERE status = ? ORDER BY letztes DESC LIMIT ?`),
    tage7: db.prepare("SELECT signatur, SUM(anzahl) AS n FROM fehler_tage WHERE tag >= ? GROUP BY signatur"),
    verlauf: db.prepare("SELECT tag, anzahl FROM fehler_tage WHERE signatur = ? AND tag >= ? ORDER BY tag"),
    status: db.prepare("UPDATE fehlerbilder SET status = ?, status_seit = ? WHERE signatur = ?"),
    zaehler: db.prepare("SELECT status, COUNT(*) AS n FROM fehlerbilder GROUP BY status"),
    altTage: db.prepare("DELETE FROM fehler_tage WHERE tag < ?"),
    altBilder: db.prepare("DELETE FROM fehlerbilder WHERE status IN ('erledigt', 'stumm') AND letztes < ?"),
  };

  /**
   * Eine Meldung zählen. Liefert, ob das Bild neu ist, ob ein erledigtes wiederkam (Rückfall) und die Felder für
   * eine Benachrichtigung — oder { verworfen: true }, wenn der Deckel voll ist.
   */
  const melde = db.transaction((m) => {
    const t = now();
    const quelle = m.quelle === "server" ? "server" : "browser";
    const art = kurz(m.art, 40) || "error";
    const nachricht = schwaerze(m.nachricht, 500) || "(ohne Nachricht)";
    const signatur = signaturVon({ quelle, art, nachricht: m.nachricht, stapel: m.stapel });
    const seite = kurz(m.seite, 120);
    const beispiel = { zeit: t, seite, browser: kurz(m.browser, 60), geraet: kurz(m.geraet, 30), kontext: schwaerze(m.kontext, 120) };
    const bild = { signatur, quelle, art, nachricht, seite, browser: beispiel.browser, geraet: beispiel.geraet };
    const alt = st.get.get(signatur);
    if (!alt) {
      if (st.zahl.get().n >= maxBilder) return { ...bild, verworfen: true };
      st.neu.run({ signatur, quelle, art, nachricht, stapel: schwaerze(m.stapel, 4000), seite, t, beispiele: JSON.stringify([beispiel]) });
      st.tag.run(signatur, tagVon(t));
      return { ...bild, neu: true, wieder: false, stumm: false };
    }
    let beispiele = [];
    try {
      beispiele = JSON.parse(alt.beispiele);
    } catch {
      beispiele = [];
    }
    const rueckfall = alt.status === "erledigt";
    st.wieder.run({
      signatur,
      t,
      seite,
      beispiele: JSON.stringify([beispiel, ...beispiele].slice(0, MAX_BEISPIELE)),
      status: rueckfall ? "offen" : alt.status,
      statusSeit: rueckfall ? t : alt.status_seit,
    });
    st.tag.run(signatur, tagVon(t));
    return { ...bild, neu: false, wieder: rueckfall, stumm: alt.status === "stumm" };
  });

  /** Bilder eines Status, neueste zuerst, mit Anzahl der letzten 7 Tage */
  function liste({ status = "offen", limit = 200 } = {}) {
    if (!STATUS.has(status)) return [];
    const seit = tagVon(now() - 6 * 24 * 60 * 60 * 1000);
    const woche = new Map(st.tage7.all(seit).map((r) => [r.signatur, r.n]));
    return st.liste.all(status, Math.max(1, Math.min(500, limit))).map((r) => ({ ...r, woche: woche.get(r.signatur) || 0 }));
  }

  function details(signatur) {
    const r = st.get.get(String(signatur || ""));
    if (!r) return null;
    let beispiele = [];
    try {
      beispiele = JSON.parse(r.beispiele);
    } catch {
      beispiele = [];
    }
    const seit = tagVon(now() - 29 * 24 * 60 * 60 * 1000);
    return { ...r, beispiele, verlauf: st.verlauf.all(r.signatur, seit) };
  }

  function setzeStatus(signatur, status) {
    if (!STATUS.has(status)) return false;
    return st.status.run(status, now(), String(signatur || "")).changes > 0;
  }

  function zaehler() {
    const z = { offen: 0, erledigt: 0, stumm: 0 };
    for (const r of st.zaehler.all()) z[r.status] = r.n;
    return z;
  }

  function aufraeumen() {
    const grenze = now() - AUFBEWAHRUNG_MS;
    return { tage: st.altTage.run(tagVon(grenze)).changes, bilder: st.altBilder.run(grenze).changes };
  }

  return { melde, liste, details, setzeStatus, zaehler, aufraeumen, close: () => db.close() };
}

module.exports = { createFehlerStore, MAX_BILDER };
