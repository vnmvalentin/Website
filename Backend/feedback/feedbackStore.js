// feedback/feedbackStore.js — Feedback der Website (Fenster „Feedback“ im Kopf), damit der Betreiber im Admin
// antworten kann. data/feedback.db, Env FEEDBACK_DB. Die Antwort landet in der Glocke des Absenders (glocke/), wenn
// er beim Senden angemeldet war — ohne Konto gibt es niemanden, dem sie zugestellt werden könnte.
'use strict';

const Database = require('better-sqlite3');
const { dataPath } = require('../lib/dataDir');

const STATUS = new Set(['offen', 'beantwortet', 'erledigt']);

function createFeedbackStore({ datei = process.env.FEEDBACK_DB || dataPath('feedback.db'), now = Date.now } = {}) {
  const db = new Database(datei);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      konto_id TEXT,
      name TEXT NOT NULL,
      nachricht TEXT NOT NULL,
      seite TEXT,
      erstellt INTEGER NOT NULL,
      antwort TEXT,
      beantwortet INTEGER,
      status TEXT NOT NULL DEFAULT 'offen'
    );
    CREATE INDEX IF NOT EXISTS feedback_status ON feedback (status, erstellt DESC);
  `);

  const st = {
    neu: db.prepare('INSERT INTO feedback (konto_id, name, nachricht, seite, erstellt) VALUES (?, ?, ?, ?, ?)'),
    eins: db.prepare('SELECT * FROM feedback WHERE id = ?'),
    nachStatus: db.prepare('SELECT * FROM feedback WHERE status = ? ORDER BY erstellt DESC LIMIT ?'),
    alle: db.prepare('SELECT * FROM feedback ORDER BY erstellt DESC LIMIT ?'),
    anzahl: db.prepare('SELECT status, COUNT(*) AS n FROM feedback GROUP BY status'),
    antwort: db.prepare("UPDATE feedback SET antwort = ?, beantwortet = ?, status = 'beantwortet' WHERE id = ?"),
    status: db.prepare('UPDATE feedback SET status = ? WHERE id = ?'),
    umzug: db.prepare('UPDATE feedback SET konto_id = ? WHERE konto_id = ?'),
    loesen: db.prepare('UPDATE feedback SET konto_id = NULL WHERE konto_id = ?'),
  };

  const zuEintrag = (r) => r && ({
    id: r.id,
    kontoId: r.konto_id || null,
    name: r.name,
    nachricht: r.nachricht,
    seite: r.seite || null,
    erstellt: r.erstellt,
    antwort: r.antwort || null,
    beantwortet: r.beantwortet || null,
    status: r.status,
  });

  return {
    lege({ kontoId = null, name, nachricht, seite = null }) {
      const s = typeof seite === 'string' && seite.startsWith('/') ? seite.slice(0, 200) : null;
      const r = st.neu.run(kontoId, String(name).slice(0, 100), String(nachricht).slice(0, 2000), s, now());
      return zuEintrag(st.eins.get(r.lastInsertRowid));
    },
    eins: (id) => zuEintrag(st.eins.get(Number(id))) || null,
    liste(status = 'offen', limit = 200) {
      const zeilen = STATUS.has(status) ? st.nachStatus.all(status, limit) : st.alle.all(limit);
      return zeilen.map(zuEintrag);
    },
    zahlen: () => Object.fromEntries(st.anzahl.all().map((r) => [r.status, r.n])),
    antworte(id, text) {
      st.antwort.run(String(text).slice(0, 1000), now(), Number(id));
      return zuEintrag(st.eins.get(Number(id))) || null;
    },
    setzeStatus(id, status) {
      if (!STATUS.has(status)) return null;
      st.status.run(status, Number(id));
      return zuEintrag(st.eins.get(Number(id))) || null;
    },
    // Konto zusammengeführt bzw. gelöscht: Feedback bleibt (für den Betreiber), hängt aber am neuen bzw. keinem Konto
    kontoUmziehen: (ziel, quelle) => st.umzug.run(ziel, quelle).changes,
    kontoLoesen: (kontoId) => st.loesen.run(kontoId).changes,
    close: () => db.close(),
  };
}

module.exports = { createFeedbackStore };
