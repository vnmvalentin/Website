// laden/ladenRoutes.js — /api/laden (Ablauf in ladenDienst.js).
//
//   GET  /api/laden/katalog          { verfuegbar, unterstuetzer: { betraege }, artikel, spiele }  verfuegbar = Stripe
//                                    eingerichtet; spiele = { [spielId]: { name, pfad, wo } } (katalog.js SPIEL_INFO)
//   GET  /api/laden/mein             { besitz, unterstuetzer }                              angemeldet
//   POST /api/laden/checkout         { typ: unterstuetzer|artikel, betragCent | artikelId, aufListe, zustimmung: true,
//                                      returnPath, lang } → { url } der Stripe-Bezahlseite
//   PUT  /api/laden/dankesliste      { an } — auf der Dankesliste stehen (nur Unterstützer)
//   GET  /api/laden/dankesliste      { namen: [{ name, seit }] }
//   GET  /api/laden/besitz/:spiel    { artikel: [ids] } — ANDOCKSTELLE für Spiele im Browser (ohne Anmeldung leer)
'use strict';

const express = require('express');
const { bremseMiddleware } = require('../lib/bremse');
const { UNTERSTUETZER_BETRAEGE, spielInfo } = require('./katalog');

function createLadenRouter({ dienst, store, optionalKonto, requireKonto, eingerichtet = () => true, log = console }) {
  const router = express.Router();
  const bremse = bremseMiddleware({ fensterMs: 60_000, max: 10, meldung: 'Zu viele Versuche. Bitte kurz warten.' });

  router.get('/katalog', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const artikel = dienst.artikel();
    // Spiele in der Reihenfolge ihres ersten Artikels, mit Name, Adresse und wo man ein Design auswählt
    const spiele = {};
    for (const a of artikel) if (!spiele[a.spiel]) spiele[a.spiel] = spielInfo(a.spiel);
    res.json({ verfuegbar: eingerichtet(), unterstuetzer: { betraege: UNTERSTUETZER_BETRAEGE }, artikel, spiele });
  });

  router.get('/mein', requireKonto, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(dienst.meinStand(req.kontoId));
  });

  router.post('/checkout', requireKonto, bremse, async (req, res) => {
    if (!eingerichtet()) return res.status(503).json({ error: 'Bezahlen ist noch nicht eingerichtet.', fehler: 'aus' });
    const b = req.body || {};
    if (b.zustimmung !== true) return res.status(400).json({ error: 'Bitte bestätige zuerst den Hinweis zum Widerrufsrecht.', fehler: 'zustimmung' });
    try {
      const r = await dienst.checkout({
        kontoId: req.kontoId, typ: b.typ, artikelId: b.artikelId, betragCent: b.betragCent,
        aufListe: b.aufListe === true, returnPath: b.returnPath, lang: b.lang === 'en' ? 'en' : 'de',
      });
      if (r.fehler) return res.status(r.fehler === 'schon' ? 409 : 400).json({ error: 'Das geht so nicht.', fehler: r.fehler });
      return res.json(r);
    } catch (e) {
      log.error('[laden] checkout:', e.message);
      return res.status(502).json({ error: 'Die Bezahlseite ließ sich nicht öffnen. Bitte später erneut versuchen.', fehler: 'stripe' });
    }
  });

  router.put('/dankesliste', requireKonto, bremse, (req, res) => {
    if (!store.unterstuetzer(req.kontoId)) return res.status(403).json({ error: 'Nur für Unterstützer.', fehler: 'kein-unterstuetzer' });
    store.setzeDankesliste(req.kontoId, req.body?.an === true);
    res.json(dienst.meinStand(req.kontoId));
  });

  router.get('/dankesliste', (req, res) => {
    // no-cache statt max-age: wer sich ein- oder austrägt, sieht es sofort (ETag spart trotzdem die Übertragung)
    res.set('Cache-Control', 'no-cache');
    res.json({ namen: dienst.dankesliste() });
  });

  router.get('/besitz/:spiel', optionalKonto, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ artikel: req.kontoId ? dienst.besitzImSpiel(req.kontoId, String(req.params.spiel)) : [] });
  });

  return router;
}

module.exports = { createLadenRouter };
