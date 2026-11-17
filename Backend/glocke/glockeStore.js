// glocke/glockeStore.js — die Glocke der Website: persönliche Nachrichten je Konto (Antworten auf Feedback, später
// Turnier-Termine, Einladungen …) und die Liste der neuesten Updates. data/glocke.db, Env GLOCKE_DB.
//
// Nachrichten entstehen über lib/mitteilungen.js (meldeMitteilung mit `konten`) — index.js legt sie hier ab und
// verschickt sie zusätzlich als Mitteilung (push/). Je Konto bleiben höchstens 100, nicht älter als 90 Tage.
// Gleiche `tag` ersetzt eine noch ungelesene ältere Nachricht (z. B. ein Turnier, das sich verschiebt).
'use strict';

const Database = require('better-sqlite3');
const { dataPath } = require('../lib/dataDir');

const MAX_JE_KONTO = 100;
const BEHALTEN_MS = 90 * 24 * 60 * 60 * 1000;

const sauber = (wert, max) => {
  if (wert && typeof wert === 'object') {
    return { de: String(wert.de || '').slice(0, max), en: String(wert.en || wert.de || '').slice(0, max) };
  }
  const t = String(wert || '').slice(0, max);
  return { de: t, en: t };
};

function createGlockeStore({ datei = process.env.GLOCKE_DB || dataPath('glocke.db'), now = Date.now } = {}) {
  const db = new Database(datei);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS eintraege (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      konto_id TEXT NOT NULL,
      thema TEXT NOT NULL,
      titel TEXT NOT NULL,
      text TEXT NOT NULL,
      url TEXT,
      tag TEXT,
      erstellt INTEGER NOT NULL,
      gelesen INTEGER
    );
    CREATE INDEX IF NOT EXISTS eintraege_konto ON eintraege (konto_id, erstellt DESC);
    CREATE TABLE IF NOT EXISTS kv (schluessel TEXT PRIMARY KEY, wert TEXT NOT NULL);
  `);

  const st = {
    neu: db.prepare(`INSERT INTO eintraege (konto_id, thema, titel, text, url, tag, erstellt)
      VALUES (@kontoId, @thema, @titel, @text, @url, @tag, @t)`),
    tagWeg: db.prepare('DELETE FROM eintraege WHERE konto_id = ? AND tag = ? AND gelesen IS NULL'),
    liste: db.prepare('SELECT * FROM eintraege WHERE konto_id = ? ORDER BY erstellt DESC, id DESC LIMIT ?'),
    ungelesen: db.prepare('SELECT COUNT(*) AS n FROM eintraege WHERE konto_id = ? AND gelesen IS NULL'),
    alleGelesen: db.prepare('UPDATE eintraege SET gelesen = ? WHERE konto_id = ? AND gelesen IS NULL'),
    einerGelesen: db.prepare('UPDATE eintraege SET gelesen = ? WHERE konto_id = ? AND id = ? AND gelesen IS NULL'),
    zuViele: db.prepare(`DELETE FROM eintraege WHERE konto_id = ? AND id NOT IN (
      SELECT id FROM eintraege WHERE konto_id = ? ORDER BY erstellt DESC, id DESC LIMIT ?)`),
    alt: db.prepare('DELETE FROM eintraege WHERE erstellt < ?'),
    umzug: db.prepare('UPDATE eintraege SET konto_id = ? WHERE konto_id = ?'),
    weg: db.prepare('DELETE FROM eintraege WHERE konto_id = ?'),
    kvLies: db.prepare('SELECT wert FROM kv WHERE schluessel = ?'),
    kvSchreib: db.prepare('INSERT INTO kv (schluessel, wert) VALUES (?, ?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert'),
  };

  const zuEintrag = (r) => ({
    id: r.id,
    thema: r.thema,
    titel: JSON.parse(r.titel),
    text: JSON.parse(r.text),
    url: r.url || null,
    erstellt: r.erstellt,
    gelesen: Boolean(r.gelesen),
  });

  /** Nachricht an mehrere Konten. @returns {number} angelegte Einträge */
  const lege = db.transaction(({ konten, thema, titel, text = '', url = null, tag = null }) => {
    const t = now();
    const ids = [...new Set((konten || []).filter((k) => typeof k === 'string' && k))];
    const u = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url.slice(0, 300)
      : (typeof url === 'string' && /^https:\/\/\S+$/.test(url) ? url.slice(0, 300) : null);
    const g = tag ? String(tag).slice(0, 64) : null;
    for (const kontoId of ids) {
      if (g) st.tagWeg.run(kontoId, g);
      st.neu.run({ kontoId, thema: String(thema).slice(0, 40), titel: JSON.stringify(sauber(titel, 120)), text: JSON.stringify(sauber(text, 1000)), url: u, tag: g, t });
      st.zuViele.run(kontoId, kontoId, MAX_JE_KONTO);
    }
    return ids.length;
  });

  function kv(schluessel) {
    const r = st.kvLies.get(schluessel);
    if (!r) return null;
    try { return JSON.parse(r.wert); } catch { return null; }
  }

  return {
    lege,
    liste: (kontoId, { limit = 30 } = {}) => ({
      eintraege: st.liste.all(kontoId, Math.min(Math.max(1, limit), MAX_JE_KONTO)).map(zuEintrag),
      ungelesen: st.ungelesen.get(kontoId).n,
    }),
    /** ids leer/null = alle */
    markiereGelesen(kontoId, ids = null) {
      const t = now();
      if (!Array.isArray(ids) || !ids.length) return st.alleGelesen.run(t, kontoId).changes;
      return db.transaction(() => ids.reduce((n, id) => n + st.einerGelesen.run(t, kontoId, Number(id)).changes, 0))();
    },
    raeumeAuf: () => st.alt.run(now() - BEHALTEN_MS).changes,
    kontoUmziehen: (ziel, quelle) => st.umzug.run(ziel, quelle).changes,
    kontoLoeschen: (kontoId) => st.weg.run(kontoId).changes,
    kv,
    setzeKv: (schluessel, wert) => st.kvSchreib.run(schluessel, JSON.stringify(wert)),
    close: () => db.close(),
  };
}

module.exports = { createGlockeStore, MAX_JE_KONTO };
