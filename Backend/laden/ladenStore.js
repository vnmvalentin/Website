// laden/ladenStore.js — Käufe des Ladens je Konto (Kosmetik), Unterstützer-Beiträge und die Zustimmung zum Verzicht
// auf das Widerrufsrecht vor einem Kauf (Nachweis mit Zeitpunkt). data/laden.db, Env LADEN_DB.
// Kartendaten liegen nie hier — die kennt nur Stripe.
'use strict';

const Database = require('better-sqlite3');
const { dataPath } = require('../lib/dataDir');

function createLadenStore({ datei = process.env.LADEN_DB || dataPath('laden.db'), now = Date.now } = {}) {
  const db = new Database(datei);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS zahlungen (
      session_id TEXT PRIMARY KEY,
      konto_id TEXT NOT NULL,
      typ TEXT NOT NULL,
      artikel_id TEXT,
      betrag_cent INTEGER NOT NULL,
      bezahlt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS zahlungen_konto ON zahlungen (konto_id);
    CREATE TABLE IF NOT EXISTS besitz (
      konto_id TEXT NOT NULL,
      artikel_id TEXT NOT NULL,
      seit INTEGER NOT NULL,
      PRIMARY KEY (konto_id, artikel_id)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS unterstuetzer (
      konto_id TEXT PRIMARY KEY,
      summe_cent INTEGER NOT NULL,
      anzahl INTEGER NOT NULL,
      erster INTEGER NOT NULL,
      letzter INTEGER NOT NULL,
      auf_liste INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS zustimmungen (
      konto_id TEXT NOT NULL,
      art TEXT NOT NULL,
      at INTEGER NOT NULL
    );
  `);
  // Nachgerüstet: Stripe-Zahlung (payment_intent) für Erstattungen und Rückbuchungen, Zeitpunkt der Rücknahme
  const spalten = new Set(db.prepare('PRAGMA table_info(zahlungen)').all().map((s) => s.name));
  if (!spalten.has('payment_intent')) db.exec('ALTER TABLE zahlungen ADD COLUMN payment_intent TEXT');
  if (!spalten.has('zurueck')) db.exec('ALTER TABLE zahlungen ADD COLUMN zurueck INTEGER');
  db.exec('CREATE INDEX IF NOT EXISTS zahlungen_pi ON zahlungen (payment_intent)');

  const st = {
    zahlung: db.prepare('SELECT 1 FROM zahlungen WHERE session_id = ?'),
    neueZahlung: db.prepare(`INSERT INTO zahlungen (session_id, konto_id, typ, artikel_id, betrag_cent, bezahlt, payment_intent)
      VALUES (?, ?, ?, ?, ?, ?, ?)`),
    zahlungZuPi: db.prepare('SELECT * FROM zahlungen WHERE payment_intent = ? AND zurueck IS NULL'),
    zurueck: db.prepare('UPDATE zahlungen SET zurueck = ? WHERE session_id = ?'),
    artikelNochBezahlt: db.prepare('SELECT 1 FROM zahlungen WHERE konto_id = ? AND artikel_id = ? AND zurueck IS NULL'),
    besitzEinzelnWeg: db.prepare('DELETE FROM besitz WHERE konto_id = ? AND artikel_id = ?'),
    unterstuetzungWeniger: db.prepare('UPDATE unterstuetzer SET summe_cent = MAX(0, summe_cent - ?), anzahl = anzahl - 1 WHERE konto_id = ?'),
    besitzNeu: db.prepare('INSERT OR IGNORE INTO besitz (konto_id, artikel_id, seit) VALUES (?, ?, ?)'),
    besitzVon: db.prepare('SELECT artikel_id FROM besitz WHERE konto_id = ? ORDER BY seit'),
    besitzt: db.prepare('SELECT 1 FROM besitz WHERE konto_id = ? AND artikel_id = ?'),
    unterstuetzer: db.prepare('SELECT * FROM unterstuetzer WHERE konto_id = ?'),
    unterstuetzt: db.prepare(`INSERT INTO unterstuetzer (konto_id, summe_cent, anzahl, erster, letzter, auf_liste)
      VALUES (@kontoId, @betrag, 1, @t, @t, @liste)
      ON CONFLICT(konto_id) DO UPDATE SET summe_cent = summe_cent + excluded.summe_cent, anzahl = anzahl + 1,
        letzter = excluded.letzter, auf_liste = MAX(auf_liste, excluded.auf_liste)`),
    liste: db.prepare('UPDATE unterstuetzer SET auf_liste = ? WHERE konto_id = ?'),
    dankesliste: db.prepare('SELECT konto_id, erster FROM unterstuetzer WHERE auf_liste = 1 ORDER BY erster'),
    alleUnterstuetzer: db.prepare('SELECT konto_id FROM unterstuetzer'),
    zustimmung: db.prepare('INSERT INTO zustimmungen (konto_id, art, at) VALUES (?, ?, ?)'),
    summen: db.prepare("SELECT typ, COUNT(*) AS n, SUM(betrag_cent) AS cent FROM zahlungen WHERE zurueck IS NULL GROUP BY typ"),
    // Konto zusammengeführt / gelöscht
    zahlungUmzug: db.prepare('UPDATE zahlungen SET konto_id = ? WHERE konto_id = ?'),
    besitzUmzug: db.prepare('INSERT OR IGNORE INTO besitz (konto_id, artikel_id, seit) SELECT ?, artikel_id, seit FROM besitz WHERE konto_id = ?'),
    besitzWeg: db.prepare('DELETE FROM besitz WHERE konto_id = ?'),
    unterstuetzerWeg: db.prepare('DELETE FROM unterstuetzer WHERE konto_id = ?'),
    zustimmungUmzug: db.prepare('UPDATE zustimmungen SET konto_id = ? WHERE konto_id = ?'),
  };

  /**
   * Bezahlte Sitzung verbuchen — jede Stripe-Sitzung nur einmal.
   * @returns {boolean} true, wenn neu verbucht
   */
  const verbuche = db.transaction(({ sessionId, kontoId, typ, artikelId = null, betragCent, aufListe = false, paymentIntent = null }) => {
    if (st.zahlung.get(sessionId)) return false;
    const t = now();
    st.neueZahlung.run(sessionId, kontoId, typ, artikelId, betragCent, t, paymentIntent);
    if (typ === 'artikel' && artikelId) st.besitzNeu.run(kontoId, artikelId, t);
    if (typ === 'unterstuetzer') st.unterstuetzt.run({ kontoId, betrag: betragCent, t, liste: aufListe ? 1 : 0 });
    return true;
  });

  /**
   * Erstattete oder zurückgebuchte Zahlung zurücknehmen: das Design ist weg (außer eine zweite, gültige Zahlung deckt
   * es), der Beitrag zählt nicht mehr; war es der letzte Beitrag, verschwindet der Unterstützer samt Dankesliste.
   * Die Buchung selbst bleibt mit Zeitpunkt der Rücknahme stehen. Jede Zahlung nur einmal.
   * @returns {{ kontoId: string, typ: string, artikelId: string|null, nochUnterstuetzer: boolean } | null}
   */
  const nimmZurueck = db.transaction((paymentIntent) => {
    if (!paymentIntent) return null;
    const z = st.zahlungZuPi.get(paymentIntent);
    if (!z) return null;
    st.zurueck.run(now(), z.session_id);
    if (z.typ === 'artikel' && z.artikel_id && !st.artikelNochBezahlt.get(z.konto_id, z.artikel_id)) {
      st.besitzEinzelnWeg.run(z.konto_id, z.artikel_id);
    }
    let nochUnterstuetzer = Boolean(st.unterstuetzer.get(z.konto_id));
    if (z.typ === 'unterstuetzer' && nochUnterstuetzer) {
      st.unterstuetzungWeniger.run(z.betrag_cent, z.konto_id);
      if (st.unterstuetzer.get(z.konto_id).anzahl <= 0) {
        st.unterstuetzerWeg.run(z.konto_id);
        nochUnterstuetzer = false;
      }
    }
    return { kontoId: z.konto_id, typ: z.typ, artikelId: z.artikel_id, nochUnterstuetzer };
  });

  /** Ziel übernimmt Besitz, Beiträge und Zustimmungen der Quelle */
  const zusammenfuehren = db.transaction((ziel, quelle) => {
    if (ziel === quelle) return;
    st.zahlungUmzug.run(ziel, quelle);
    st.besitzUmzug.run(ziel, quelle);
    st.besitzWeg.run(quelle);
    const q = st.unterstuetzer.get(quelle);
    if (q) {
      const z = st.unterstuetzer.get(ziel);
      if (z) {
        db.prepare(`UPDATE unterstuetzer SET summe_cent = summe_cent + ?, anzahl = anzahl + ?, erster = MIN(erster, ?),
          letzter = MAX(letzter, ?), auf_liste = MAX(auf_liste, ?) WHERE konto_id = ?`).run(q.summe_cent, q.anzahl, q.erster, q.letzter, q.auf_liste, ziel);
        st.unterstuetzerWeg.run(quelle);
      } else {
        db.prepare('UPDATE unterstuetzer SET konto_id = ? WHERE konto_id = ?').run(ziel, quelle);
      }
    }
    st.zustimmungUmzug.run(ziel, quelle);
  });

  return {
    verbuche,
    nimmZurueck,
    besitz: (kontoId) => st.besitzVon.all(kontoId).map((r) => r.artikel_id),
    besitzt: (kontoId, artikelId) => Boolean(st.besitzt.get(kontoId, artikelId)),
    unterstuetzer: (kontoId) => {
      const r = st.unterstuetzer.get(kontoId);
      return r ? { summeCent: r.summe_cent, anzahl: r.anzahl, seit: r.erster, aufListe: Boolean(r.auf_liste) } : null;
    },
    setzeDankesliste: (kontoId, an) => st.liste.run(an ? 1 : 0, kontoId).changes > 0,
    dankesliste: () => st.dankesliste.all().map((r) => ({ kontoId: r.konto_id, seit: r.erster })),
    unterstuetzerIds: () => st.alleUnterstuetzer.all().map((r) => r.konto_id),
    merkeZustimmung: (kontoId, art) => st.zustimmung.run(kontoId, art, now()),
    summen: () => Object.fromEntries(st.summen.all().map((r) => [r.typ, { anzahl: r.n, cent: r.cent || 0 }])),
    zusammenfuehren,
    // Konto gelöscht: Käufe bleiben als Buchung (Aufbewahrungspflicht), aber ohne Besitz, Dankesliste und Konto-Bezug
    kontoLoeschen: db.transaction((kontoId) => {
      st.besitzWeg.run(kontoId);
      st.unterstuetzerWeg.run(kontoId);
      st.zahlungUmzug.run('geloescht', kontoId);
      st.zustimmungUmzug.run('geloescht', kontoId);
    }),
    close: () => db.close(),
  };
}

module.exports = { createLadenStore };
