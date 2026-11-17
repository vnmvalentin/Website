// einladung/einladungRoutes.js — /api/einladung (Ablauf in einladungDienst.js).
//
//   GET  /api/einladung/mein          eigener Code und Stand { code, bestaetigt, wartend, stufen, naechste, eingeladen }
//   GET  /api/einladung/info/:code    { name } des Werbers — für den Hinweis „X hat dich eingeladen“
//   POST /api/einladung/annehmen      { code } → { ok } oder { ok: false, fehler: unbekannt|eigener|schon|zu-alt }
//
// Der Link selbst ist /?einladung=<CODE>&ref=einladung — ref zählt die Besucherstatistik als Herkunft „Link: einladung“.
'use strict';

const express = require('express');
const { bremseMiddleware } = require('../lib/bremse');

function createEinladungRouter({ dienst, requireKonto }) {
  const router = express.Router();
  const bremse = bremseMiddleware({ fensterMs: 60_000, max: 20, meldung: 'Zu viele Anfragen. Bitte kurz warten.' });

  router.get('/mein', requireKonto, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(dienst.meinStand(req.kontoId));
  });

  router.get('/info/:code', bremse, (req, res) => {
    const i = dienst.info(req.params.code);
    if (!i) return res.status(404).json({ error: 'Diesen Einladungslink gibt es nicht.' });
    res.set('Cache-Control', 'public, max-age=300');
    return res.json(i);
  });

  router.post('/annehmen', requireKonto, bremse, (req, res) => {
    const r = dienst.annehmen(req.kontoId, req.body?.code);
    res.status(r.ok ? 200 : 400).json(r.ok ? { ok: true } : { ok: false, fehler: r.fehler });
  });

  return router;
}

module.exports = { createEinladungRouter };
