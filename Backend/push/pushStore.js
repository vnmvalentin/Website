// push/pushStore.js — Mitteilungen der Website (Web-Push): welches Gerät welche Themen abonniert hat, dazu die
// VAPID-Schlüssel. data/push.db, Env PUSH_DB (Tests und Prüfstände nie gegen die echte Datei).
//
// TABELLEN
//   abos   je Gerät (Push-Adresse des Browsers) die Schlüssel zum Verschlüsseln, die Themen, die Sprache und — wenn
//          beim Abonnieren jemand angemeldet war — das Konto (für persönliche Themen wie „Turnier startet gleich“)
//   kv     VAPID-Schlüssel (einmal erzeugt; ändern sie sich, gelten alle Abos nicht mehr) und Merker der Versand-Auslöser
'use strict';

const Database = require('better-sqlite3');
const { dataPath } = require('../lib/dataDir');

const MAX_JE_KONTO = 10; // Geräte je Konto
const FEHLER_BIS_WEG = 5; // so viele Fehlversuche in Folge, dann ist das Abo tot

function createPushStore({ datei = process.env.PUSH_DB || dataPath('push.db'), now = Date.now } = {}) {
  const db = new Database(datei);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS abos (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      konto_id TEXT,
      themen TEXT NOT NULL DEFAULT '[]',
      sprache TEXT NOT NULL DEFAULT 'de',
      erstellt INTEGER NOT NULL,
      geaendert INTEGER NOT NULL,
      zuletzt_ok INTEGER,
      fehler INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS abos_konto ON abos (konto_id);
    CREATE TABLE IF NOT EXISTS kv (schluessel TEXT PRIMARY KEY, wert TEXT NOT NULL);
  `);

  const st = {
    abo: db.prepare('SELECT * FROM abos WHERE endpoint = ?'),
    neu: db.prepare(`INSERT INTO abos (endpoint, p256dh, auth, konto_id, themen, sprache, erstellt, geaendert)
      VALUES (@endpoint, @p256dh, @auth, @kontoId, @themen, @sprache, @t, @t)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
        konto_id = COALESCE(excluded.konto_id, abos.konto_id), themen = excluded.themen, sprache = excluded.sprache,
        geaendert = excluded.geaendert, fehler = 0`),
    themen: db.prepare('UPDATE abos SET themen = ?, geaendert = ? WHERE endpoint = ?'),
    weg: db.prepare('DELETE FROM abos WHERE endpoint = ?'),
    alle: db.prepare('SELECT * FROM abos'),
    vonKonto: db.prepare('SELECT * FROM abos WHERE konto_id = ? ORDER BY geaendert DESC'),
    ok: db.prepare('UPDATE abos SET zuletzt_ok = ?, fehler = 0 WHERE endpoint = ?'),
    fehler: db.prepare('UPDATE abos SET fehler = fehler + 1 WHERE endpoint = ?'),
    totWeg: db.prepare('DELETE FROM abos WHERE fehler >= ?'),
    kontoUmzug: db.prepare('UPDATE abos SET konto_id = ? WHERE konto_id = ?'),
    kontoLoesen: db.prepare('UPDATE abos SET konto_id = NULL WHERE konto_id = ?'),
    kvLies: db.prepare('SELECT wert FROM kv WHERE schluessel = ?'),
    kvSchreib: db.prepare('INSERT INTO kv (schluessel, wert) VALUES (?, ?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert'),
    anzahl: db.prepare('SELECT COUNT(*) AS n FROM abos'),
  };

  const zuAbo = (r) => (r ? {
    endpoint: r.endpoint,
    keys: { p256dh: r.p256dh, auth: r.auth },
    kontoId: r.konto_id || null,
    themen: (() => { try { const t = JSON.parse(r.themen); return Array.isArray(t) ? t : []; } catch { return []; } })(),
    sprache: r.sprache || 'de',
    zuletztOk: r.zuletzt_ok || null,
    fehler: r.fehler,
  } : null);

  /** Abo anlegen oder auffrischen (gleiche Push-Adresse = gleiches Gerät). Ein Konto behält höchstens 10 Geräte. */
  const speichere = db.transaction(({ endpoint, keys, kontoId = null, themen = [], sprache = 'de' }) => {
    st.neu.run({ endpoint, p256dh: keys.p256dh, auth: keys.auth, kontoId, themen: JSON.stringify(themen), sprache, t: now() });
    if (kontoId) {
      for (const alt of st.vonKonto.all(kontoId).slice(MAX_JE_KONTO)) st.weg.run(alt.endpoint);
    }
    return zuAbo(st.abo.get(endpoint));
  });

  /** Alle Abos mit diesem Thema; mit `kontoIds` nur die Geräte dieser Konten */
  function fuerThema(thema, { kontoIds = null } = {}) {
    const zeilen = kontoIds ? kontoIds.flatMap((k) => st.vonKonto.all(String(k))) : st.alle.all();
    return zeilen.map(zuAbo).filter((a) => a.themen.includes(thema));
  }

  function merkeFehler(endpoint) {
    st.fehler.run(endpoint);
    st.totWeg.run(FEHLER_BIS_WEG);
  }

  function kv(schluessel) {
    const r = st.kvLies.get(schluessel);
    if (!r) return null;
    try { return JSON.parse(r.wert); } catch { return null; }
  }

  function zahlen() {
    const je = {};
    for (const a of st.alle.all().map(zuAbo)) for (const t of a.themen) je[t] = (je[t] || 0) + 1;
    return { geraete: st.anzahl.get().n, themen: je };
  }

  return {
    abo: (endpoint) => zuAbo(st.abo.get(endpoint)),
    speichere,
    setzeThemen: (endpoint, themen) => st.themen.run(JSON.stringify(themen), now(), endpoint).changes > 0,
    entferne: (endpoint) => st.weg.run(endpoint).changes > 0,
    fuerThema,
    merkeOk: (endpoint) => st.ok.run(now(), endpoint),
    merkeFehler,
    // Konto zusammengeführt bzw. gelöscht (konto/kontoStore.js, Beobachter in index.js). Beim Löschen bleiben die
    // Geräte-Abos (live, Updates) bestehen, verlieren aber die Verbindung zum Konto.
    kontoUmziehen: (ziel, quelle) => st.kontoUmzug.run(ziel, quelle).changes,
    kontoLoesen: (kontoId) => st.kontoLoesen.run(kontoId).changes,
    kv,
    setzeKv: (schluessel, wert) => st.kvSchreib.run(schluessel, JSON.stringify(wert)),
    zahlen,
    close: () => db.close(),
  };
}

module.exports = { createPushStore, MAX_JE_KONTO, FEHLER_BIS_WEG };
