// lib/sessionStore.js — Anmelde-Sitzungen in SQLite (data/sessions.db) statt in Backend/sessions.json.
//
// WARUM (Sicherheits-Durchgang, 16.11.2026)
//   - Das Nachschlagen in einem normalen Objekt (sessions[cookie]) ließ Cookies wie "session=constructor" oder
//     "session=__proto__" als angemeldet durchgehen, nur ohne Twitch-ID. Hier zählt nur eine Zeile mit geprüfter Form.
//   - Die Datei lag außerhalb von data/ und damit außerhalb der Datensicherung (sicherung/).
//   - Jede Anmeldung schrieb die ganze Datei neu.
// Ablauf nach 30 Tagen; wer die Seite nutzt, bekommt über verlaengere() wieder volle 30 Tage (index.js beim Abruf des
// Kontos). Abgelaufene Zeilen räumt purge() weg (beim Anlegen und stündlich aus index.js).
//
// KONTEN (seit 16.11.2026, konto/kontoStore.js): Jede Sitzung gehört zu einem Konto (konto_id). Twitch-ID und -Login
// stehen nur in Sitzungen, die mit Twitch angemeldet sind — Discord- und Gast-Sitzungen haben dort NULL, und die
// Twitch-Bereiche behandeln sie wie „nicht angemeldet“. Alte Sitzungen ohne konto_id bekommen ihr Konto beim ersten
// Gebrauch (setzeKonto aus index.js). Eine Tabelle aus der Zeit davor (Twitch-Spalten NOT NULL, ohne konto_id) wird beim
// Start einmal umgebaut.
//
// UMZUG: importiereJson() liest die alte sessions.json beim ersten Start einmal ein (nur gültige, nicht abgelaufene
// Einträge) und merkt sich das in der Tabelle meta. Die alte Datei bleibt unangetastet liegen. Ist sie kaputt, wird
// nichts als erledigt vermerkt und der nächste Start versucht es erneut.

const crypto = require("crypto");
const fs = require("fs");
const Database = require("better-sqlite3");
const { dataPath } = require("./dataDir");

const LEBENSDAUER_MS = 30 * 24 * 60 * 60 * 1000;
// Alte IDs stammen aus nanoid(24) (A–Z a–z 0–9 _ -), neue aus 18 Zufallsbytes in base64url (24 Zeichen)
const ID_FORM = /^[A-Za-z0-9_-]{16,64}$/;

const gueltigeId = (id) => typeof id === "string" && ID_FORM.test(id);

const TABELLE = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    twitch_id TEXT,
    twitch_login TEXT,
    konto_id TEXT,
    erstellt INTEGER NOT NULL,
    laeuft_ab INTEGER NOT NULL
  );`;

/** Baut eine Tabelle aus der Zeit vor den Konten um (Twitch-Spalten NOT NULL, keine konto_id). */
function migriere(db) {
  const spalten = db.prepare("PRAGMA table_info(sessions)").all();
  const twitch = spalten.find((s) => s.name === "twitch_id");
  const hatKonto = spalten.some((s) => s.name === "konto_id");
  if (hatKonto && twitch && !twitch.notnull) return false;
  db.transaction(() => {
    db.exec(TABELLE.replace("CREATE TABLE IF NOT EXISTS sessions", "CREATE TABLE sessions_neu"));
    const konto = hatKonto ? "konto_id, " : "";
    db.exec(`INSERT INTO sessions_neu (id, twitch_id, twitch_login, ${konto}erstellt, laeuft_ab)
      SELECT id, twitch_id, twitch_login, ${konto}erstellt, laeuft_ab FROM sessions`);
    db.exec("DROP TABLE sessions");
    db.exec("ALTER TABLE sessions_neu RENAME TO sessions");
  })();
  return true;
}

function createSessionStore({ datei = process.env.SESSIONS_DB || dataPath("sessions.db"), now = Date.now, lebensdauerMs = LEBENSDAUER_MS } = {}) {
  const db = new Database(datei);
  db.pragma("journal_mode = WAL");
  db.exec(TABELLE);
  migriere(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS sessions_laeuft_ab ON sessions (laeuft_ab);
    CREATE INDEX IF NOT EXISTS sessions_konto ON sessions (konto_id);
    CREATE TABLE IF NOT EXISTS meta (schluessel TEXT PRIMARY KEY, wert TEXT NOT NULL);
  `);
  const st = {
    insert: db.prepare(`INSERT OR IGNORE INTO sessions (id, twitch_id, twitch_login, konto_id, erstellt, laeuft_ab)
      VALUES (?, ?, ?, ?, ?, ?)`),
    get: db.prepare("SELECT twitch_id, twitch_login, konto_id, laeuft_ab FROM sessions WHERE id = ?"),
    del: db.prepare("DELETE FROM sessions WHERE id = ?"),
    purge: db.prepare("DELETE FROM sessions WHERE laeuft_ab < ?"),
    setzeKonto: db.prepare("UPDATE sessions SET konto_id = ? WHERE id = ?"),
    ersetzeKonto: db.prepare("UPDATE sessions SET konto_id = ? WHERE konto_id = ?"),
    ohneTwitch: db.prepare("UPDATE sessions SET twitch_id = NULL, twitch_login = NULL WHERE konto_id = ?"),
    entferneKonto: db.prepare("DELETE FROM sessions WHERE konto_id = ?"),
    verlaengere: db.prepare("UPDATE sessions SET laeuft_ab = ? WHERE id = ?"),
    metaGet: db.prepare("SELECT wert FROM meta WHERE schluessel = ?"),
    metaSet: db.prepare(
      "INSERT INTO meta (schluessel, wert) VALUES (?, ?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert",
    ),
  };

  /**
   * Neue Sitzung, liefert die ID für das Cookie. create({ twitchId, twitchLogin, kontoId }) oder wie früher
   * create(twitchId, twitchLogin). Eine Sitzung braucht ein Konto oder Twitch-ID und Login.
   */
  function create(a, b, c) {
    const angaben = a !== null && typeof a === "object" ? a : { twitchId: a, twitchLogin: b, kontoId: c };
    const twitchId = angaben.twitchId ? String(angaben.twitchId) : null;
    const twitchLogin = angaben.twitchLogin ? String(angaben.twitchLogin) : null;
    const kontoId = angaben.kontoId ? String(angaben.kontoId) : null;
    if (Boolean(twitchId) !== Boolean(twitchLogin)) throw new Error("Twitch-ID und Login gehören zusammen");
    if (!kontoId && !twitchId) throw new Error("Sitzung braucht ein Konto oder Twitch-ID und Login");
    const t = now();
    st.purge.run(t);
    const id = crypto.randomBytes(18).toString("base64url");
    st.insert.run(id, twitchId, twitchLogin, kontoId, t, t + lebensdauerMs);
    return id;
  }

  /** @returns {{ twitchId: string|null, twitchLogin: string|null, kontoId: string|null, expiresAt: number } | null} */
  function get(id) {
    if (!gueltigeId(id)) return null;
    const row = st.get.get(id);
    if (!row) return null;
    if (row.laeuft_ab < now()) {
      st.del.run(id);
      return null;
    }
    return { twitchId: row.twitch_id, twitchLogin: row.twitch_login, kontoId: row.konto_id, expiresAt: row.laeuft_ab };
  }

  function remove(id) {
    if (gueltigeId(id)) st.del.run(id);
  }

  /** Entfernt abgelaufene Sitzungen, liefert die Anzahl */
  function purge() {
    return st.purge.run(now()).changes;
  }

  /** Alte Sitzung (vor den Konten) bekommt ihr Konto */
  function setzeKonto(id, kontoId) {
    if (gueltigeId(id) && kontoId) st.setzeKonto.run(String(kontoId), id);
  }

  /** Nach dem Zusammenführen zweier Konten: alle Sitzungen des aufgelösten Kontos zeigen aufs bleibende */
  function ersetzeKonto(altKonto, neuKonto) {
    return st.ersetzeKonto.run(String(neuKonto), String(altKonto)).changes;
  }

  /** Twitch vom Konto gelöst: dessen Sitzungen gelten für die Twitch-Bereiche ab sofort als nicht angemeldet */
  function ohneTwitch(kontoId) {
    return st.ohneTwitch.run(String(kontoId)).changes;
  }

  /** Konto gelöscht: alle seine Sitzungen beenden */
  function entferneKonto(kontoId) {
    return st.entferneKonto.run(String(kontoId)).changes;
  }

  /**
   * Gleitender Ablauf: Ist weniger als die halbe Lebensdauer übrig, gilt die Sitzung wieder volle 30 Tage.
   * @returns {number|null} neuer Ablaufzeitpunkt, wenn verlängert (dann das Cookie neu setzen), sonst null
   */
  function verlaengere(id) {
    const s = get(id);
    if (!s) return null;
    const t = now();
    if (s.expiresAt - t > lebensdauerMs / 2) return null;
    st.verlaengere.run(t + lebensdauerMs, id);
    return t + lebensdauerMs;
  }

  /**
   * Einmalige Übernahme der alten sessions.json.
   * @param {string} pfad
   * @param {{ beiAltdaten?: (alt: object) => void }} [opt] bekommt den alten Inhalt (z. B. für Discord-Verknüpfungen)
   */
  function importiereJson(pfad, { beiAltdaten } = {}) {
    if (st.metaGet.get("json_import")) return { importiert: 0, schonErledigt: true };
    let alt = {};
    try {
      if (fs.existsSync(pfad)) {
        const raw = fs.readFileSync(pfad, "utf8");
        if (raw.trim()) alt = JSON.parse(raw);
      }
    } catch (e) {
      return { importiert: 0, fehler: e.message };
    }
    const t = now();
    let importiert = 0;
    db.transaction(() => {
      for (const [id, s] of Object.entries(alt && typeof alt === "object" ? alt : {})) {
        if (!gueltigeId(id) || !s || typeof s !== "object") continue;
        if (!s.twitchId || !s.twitchLogin || !(Number(s.expiresAt) > t)) continue;
        importiert += st.insert.run(id, String(s.twitchId), String(s.twitchLogin), null, t, Number(s.expiresAt)).changes;
      }
      st.metaSet.run("json_import", new Date(t).toISOString());
    })();
    if (beiAltdaten) beiAltdaten(alt);
    return { importiert };
  }

  return {
    create, get, remove, purge, setzeKonto, ersetzeKonto, ohneTwitch, entferneKonto, verlaengere, importiereJson,
    close: () => db.close(),
  };
}

module.exports = { createSessionStore, LEBENSDAUER_MS, migriere };
