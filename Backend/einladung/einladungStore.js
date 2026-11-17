// einladung/einladungStore.js — Einladungslinks: je Konto ein Code, und wer über welchen Code dazugekommen ist.
// data/einladungen.db, Env EINLADUNG_DB (Tests und Prüfstände nie gegen die echte Datei).
//
// Ablauf (einladungDienst.js): Ein neues Konto nimmt einen Code an (angenommen, Tag gemerkt). Kommt es an einem
// späteren Tag wieder (kontoStore-Beobachter „aktiv“), ist die Einladung bestätigt — erst dann gibt es Abzeichen.
'use strict';

const crypto = require('crypto');
const Database = require('better-sqlite3');
const { dataPath } = require('../lib/dataDir');

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'; // ohne 0/O, 1/I/L, U
const CODE_LAENGE = 8;
const CODE_FORM = new RegExp(`^[${ALPHABET}]{${CODE_LAENGE}}$`);

function neuerCode() {
  let c = '';
  for (const b of crypto.randomBytes(CODE_LAENGE)) c += ALPHABET[b % ALPHABET.length];
  return c;
}

/** Eingabe tolerant: Kleinbuchstaben, O → 0 gibt es nicht (Alphabet ohne beides), Leerzeichen weg */
const normalisiere = (roh) => {
  const c = String(roh || '').toUpperCase().replace(/[\s-]/g, '');
  return CODE_FORM.test(c) ? c : null;
};

function createEinladungStore({ datei = process.env.EINLADUNG_DB || dataPath('einladungen.db'), now = Date.now } = {}) {
  const db = new Database(datei);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS codes (
      konto_id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      erstellt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS einladungen (
      gast_id TEXT PRIMARY KEY,
      werber_id TEXT NOT NULL,
      angenommen INTEGER NOT NULL,
      angenommen_tag TEXT NOT NULL,
      bestaetigt INTEGER
    );
    CREATE INDEX IF NOT EXISTS einladungen_werber ON einladungen (werber_id);
  `);

  const st = {
    codeVon: db.prepare('SELECT code FROM codes WHERE konto_id = ?'),
    kontoVon: db.prepare('SELECT konto_id FROM codes WHERE code = ?'),
    codeNeu: db.prepare('INSERT INTO codes (konto_id, code, erstellt) VALUES (?, ?, ?)'),
    einladung: db.prepare('SELECT * FROM einladungen WHERE gast_id = ?'),
    neu: db.prepare('INSERT INTO einladungen (gast_id, werber_id, angenommen, angenommen_tag) VALUES (?, ?, ?, ?)'),
    bestaetige: db.prepare('UPDATE einladungen SET bestaetigt = ? WHERE gast_id = ? AND bestaetigt IS NULL'),
    zaehle: db.prepare(`SELECT
        SUM(CASE WHEN bestaetigt IS NOT NULL THEN 1 ELSE 0 END) AS bestaetigt,
        SUM(CASE WHEN bestaetigt IS NULL THEN 1 ELSE 0 END) AS wartend
      FROM einladungen WHERE werber_id = ?`),
    gesamt: db.prepare(`SELECT COUNT(*) AS angenommen, SUM(CASE WHEN bestaetigt IS NOT NULL THEN 1 ELSE 0 END) AS bestaetigt FROM einladungen`),
    codeUmzug: db.prepare('UPDATE codes SET konto_id = ? WHERE konto_id = ?'),
    codeWeg: db.prepare('DELETE FROM codes WHERE konto_id = ?'),
    werberUmzug: db.prepare('UPDATE einladungen SET werber_id = ? WHERE werber_id = ?'),
    gastUmzug: db.prepare('UPDATE einladungen SET gast_id = ? WHERE gast_id = ?'),
    gastWeg: db.prepare('DELETE FROM einladungen WHERE gast_id = ?'),
    werberWeg: db.prepare('DELETE FROM einladungen WHERE werber_id = ?'),
    selbst: db.prepare('DELETE FROM einladungen WHERE gast_id = werber_id'),
  };

  /** Code des Kontos, beim ersten Mal angelegt */
  const codeFuer = db.transaction((kontoId) => {
    const da = st.codeVon.get(kontoId);
    if (da) return da.code;
    for (let i = 0; i < 5; i++) {
      const c = neuerCode();
      if (!st.kontoVon.get(c)) {
        st.codeNeu.run(kontoId, c, now());
        return c;
      }
    }
    throw new Error('Kein freier Einladungscode');
  });

  /**
   * Ein (neues) Konto nimmt einen Code an. Ob das Konto neu genug ist, prüft der Aufrufer.
   * @returns {{ ok: true, werber: string } | { ok: false, fehler: "unbekannt"|"eigener"|"schon" }}
   */
  const nimmAn = db.transaction((gastId, codeRoh, tag) => {
    const code = normalisiere(codeRoh);
    const werber = code ? st.kontoVon.get(code)?.konto_id : null;
    if (!werber) return { ok: false, fehler: 'unbekannt' };
    if (werber === gastId) return { ok: false, fehler: 'eigener' };
    if (st.einladung.get(gastId)) return { ok: false, fehler: 'schon' };
    st.neu.run(gastId, werber, now(), tag);
    return { ok: true, werber };
  });

  /** Gast an einem Tag aktiv: bestätigt, wenn es ein späterer Tag als der Annahme-Tag ist. @returns {string|null} Werber */
  const bestaetige = db.transaction((gastId, tag) => {
    const e = st.einladung.get(gastId);
    if (!e || e.bestaetigt || !(tag > e.angenommen_tag)) return null;
    st.bestaetige.run(now(), gastId);
    return e.werber_id;
  });

  function stand(kontoId) {
    const z = st.zaehle.get(kontoId) || {};
    const e = st.einladung.get(kontoId);
    return {
      code: st.codeVon.get(kontoId)?.code || null,
      bestaetigt: z.bestaetigt || 0,
      wartend: z.wartend || 0,
      eingeladenVon: e ? { werber: e.werber_id, bestaetigt: Boolean(e.bestaetigt) } : null,
    };
  }

  /** Konto zusammengeführt: Code und Einladungen ziehen um; was doppelt wäre, bleibt beim Ziel */
  const zusammenfuehren = db.transaction((ziel, quelle) => {
    if (ziel === quelle) return;
    if (st.codeVon.get(ziel)) st.codeWeg.run(quelle);
    else st.codeUmzug.run(ziel, quelle);
    st.werberUmzug.run(ziel, quelle);
    if (st.einladung.get(ziel)) st.gastWeg.run(quelle);
    else st.gastUmzug.run(ziel, quelle);
    st.selbst.run(); // sich selbst eingeladen (zwei eigene Konten zusammengelegt) zählt nicht
  });

  const loesche = db.transaction((kontoId) => {
    st.codeWeg.run(kontoId);
    st.gastWeg.run(kontoId);
    st.werberWeg.run(kontoId);
  });

  return {
    codeFuer,
    kontoVonCode: (roh) => { const c = normalisiere(roh); return c ? st.kontoVon.get(c)?.konto_id || null : null; },
    nimmAn,
    bestaetige,
    stand,
    zahlen: () => { const g = st.gesamt.get(); return { angenommen: g.angenommen || 0, bestaetigt: g.bestaetigt || 0 }; },
    zusammenfuehren,
    loesche,
    close: () => db.close(),
  };
}

module.exports = { createEinladungStore, normalisiere, CODE_FORM };
