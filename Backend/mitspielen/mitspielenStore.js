// mitspielen/mitspielenStore.js — „Jetzt mitspielen“ im Stream: der eine Stream-Raum, den der Betreiber gerade offen
// hat (Raumlink eines beliebigen Spiels, ohne Änderung an den Spielen), und die Warteschlange für volle Räume.
// data/mitspielen.db, Env MITSPIELEN_DB.
//
//   modus „offen“     der Raumlink steht für alle sichtbar da
//   modus „schlange“  der Link geht nur an die, die aufgerufen werden („Nächste Runde“) — so läuft der Raum nicht über
// Ein Raum läuft nach 8 Stunden von selbst ab (falls „Beenden“ vergessen wird).
'use strict';

const Database = require('better-sqlite3');
const { dataPath } = require('../lib/dataDir');

const ABLAUF_MS = 8 * 60 * 60 * 1000;
const MAX_SCHLANGE = 200;

function createMitspielenStore({ datei = process.env.MITSPIELEN_DB || dataPath('mitspielen.db'), now = Date.now } = {}) {
  const db = new Database(datei);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS raum (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      pfad TEXT NOT NULL,
      spiel TEXT,
      notiz TEXT NOT NULL DEFAULT '',
      modus TEXT NOT NULL DEFAULT 'offen',
      runde_groesse INTEGER NOT NULL DEFAULT 4,
      runde INTEGER NOT NULL DEFAULT 0,
      gesetzt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schlange (
      konto_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      beigetreten INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'wartet',
      runde INTEGER,
      aufgerufen INTEGER
    );
  `);

  const st = {
    raum: db.prepare('SELECT * FROM raum WHERE id = 1'),
    setze: db.prepare(`INSERT INTO raum (id, pfad, spiel, notiz, modus, runde_groesse, runde, gesetzt)
      VALUES (1, @pfad, @spiel, @notiz, @modus, @rundeGroesse, 0, @t)
      ON CONFLICT(id) DO UPDATE SET pfad = excluded.pfad, spiel = excluded.spiel, notiz = excluded.notiz,
        modus = excluded.modus, runde_groesse = excluded.runde_groesse, gesetzt = excluded.gesetzt`),
    weg: db.prepare('DELETE FROM raum'),
    schlangeLeer: db.prepare('DELETE FROM schlange'),
    eintrag: db.prepare('SELECT * FROM schlange WHERE konto_id = ?'),
    anstellen: db.prepare("INSERT INTO schlange (konto_id, name, beigetreten) VALUES (?, ?, ?) ON CONFLICT(konto_id) DO UPDATE SET name = excluded.name"),
    verlassen: db.prepare('DELETE FROM schlange WHERE konto_id = ?'),
    wartende: db.prepare("SELECT * FROM schlange WHERE status = 'wartet' ORDER BY beigetreten, rowid"),
    aufgerufene: db.prepare("SELECT * FROM schlange WHERE status = 'aufgerufen' ORDER BY aufgerufen DESC, beigetreten"),
    anzahl: db.prepare('SELECT COUNT(*) AS n FROM schlange'),
    aufrufen: db.prepare("UPDATE schlange SET status = 'aufgerufen', runde = ?, aufgerufen = ? WHERE konto_id = ? AND status = 'wartet'"),
    altAufgerufenWeg: db.prepare("DELETE FROM schlange WHERE status = 'aufgerufen' AND runde < ?"),
    rundeHoch: db.prepare('UPDATE raum SET runde = runde + 1 WHERE id = 1'),
    umzug: db.prepare('UPDATE schlange SET konto_id = ? WHERE konto_id = ? AND NOT EXISTS (SELECT 1 FROM schlange WHERE konto_id = ?)'),
  };

  const zuRaum = (r) => (r ? {
    pfad: r.pfad, spiel: r.spiel || null, notiz: r.notiz, modus: r.modus, rundeGroesse: r.runde_groesse, runde: r.runde, gesetzt: r.gesetzt,
  } : null);
  const zuEintrag = (r) => ({ kontoId: r.konto_id, name: r.name, beigetreten: r.beigetreten, status: r.status, runde: r.runde, aufgerufen: r.aufgerufen });

  /** Aktueller Raum oder null (abgelaufene werden samt Schlange weggeräumt) */
  function raum() {
    const r = st.raum.get();
    if (r && now() - r.gesetzt > ABLAUF_MS) {
      beende();
      return null;
    }
    return zuRaum(r);
  }

  /** Neuer Raum (oder geänderter): bei anderem Raumlink beginnt die Warteschlange von vorn */
  const setzeRaum = db.transaction(({ pfad, spiel = null, notiz = '', modus = 'offen', rundeGroesse = 4 }) => {
    const alt = st.raum.get();
    if (!alt || alt.pfad !== pfad) st.schlangeLeer.run();
    st.setze.run({ pfad, spiel, notiz, modus, rundeGroesse, t: alt && alt.pfad === pfad ? alt.gesetzt : now() });
    return zuRaum(st.raum.get());
  });

  const beende = db.transaction(() => {
    st.weg.run();
    st.schlangeLeer.run();
  });

  /** @returns {{ ok: true, position: number } | { ok: false, fehler: "kein-raum"|"voll" }} */
  const stelleAn = db.transaction((kontoId, name) => {
    if (!raum()) return { ok: false, fehler: 'kein-raum' };
    const da = st.eintrag.get(kontoId);
    if (!da && st.anzahl.get().n >= MAX_SCHLANGE) return { ok: false, fehler: 'voll' };
    if (!da || da.status !== 'wartet') {
      if (da) st.verlassen.run(kontoId); // nach dem Aufruf wieder hinten anstellen
      st.anstellen.run(kontoId, String(name || 'Gast').slice(0, 32), now());
    }
    return { ok: true, position: position(kontoId) };
  });

  function position(kontoId) {
    const i = st.wartende.all().findIndex((e) => e.konto_id === kontoId);
    return i < 0 ? null : i + 1;
  }

  /** Die nächsten `anzahl` Wartenden aufrufen. Aufgerufene der vorletzten Runde fallen dabei weg. @returns {Array} */
  const rufeAuf = db.transaction((anzahl) => {
    const r = st.raum.get();
    if (!r) return [];
    st.rundeHoch.run();
    const runde = r.runde + 1;
    st.altAufgerufenWeg.run(runde - 1);
    const t = now();
    const dran = st.wartende.all().slice(0, Math.max(1, Math.min(50, Number(anzahl) || r.runde_groesse)));
    for (const e of dran) st.aufrufen.run(runde, t, e.konto_id);
    return dran.map((e) => ({ kontoId: e.konto_id, name: e.name }));
  });

  return {
    raum,
    setzeRaum,
    beende,
    stelleAn,
    verlasse: (kontoId) => st.verlassen.run(kontoId).changes > 0,
    eintrag: (kontoId) => { const e = st.eintrag.get(kontoId); return e ? { ...zuEintrag(e), position: e.status === 'wartet' ? position(kontoId) : null } : null; },
    wartende: () => st.wartende.all().map(zuEintrag),
    aufgerufene: () => st.aufgerufene.all().map(zuEintrag),
    rufeAuf,
    kontoUmziehen: (ziel, quelle) => st.umzug.run(ziel, quelle, ziel).changes,
    kontoWeg: (kontoId) => st.verlassen.run(kontoId).changes,
    close: () => db.close(),
  };
}

module.exports = { createMitspielenStore, ABLAUF_MS };
