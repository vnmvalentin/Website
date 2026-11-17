// glocke/glockeRoutes.js — /api/glocke: was die Glocke im Kopf der Website zeigt.
//
//   GET  /api/glocke           { eintraege, ungelesen, updates, mitspielen }   eintraege/ungelesen nur angemeldet (sonst leer);
//                              updates = die neuesten Versionen der Updates-Seite [{ version, date }] — der Browser
//                              vergleicht sie mit seinem Merker (utils/updatesGesehen.js)
//   POST /api/glocke/gelesen   { ids? } — ohne ids alle; → { ungelesen }
//
// Die Updates-Liste legt statusWatch/postUpdates.js nach jedem Frontend-Deploy ab (kv „updates“) — so muss nicht jede
// Seite die große Liste aus Frontend/src/utils/newData.js laden, nur um zu zählen.
'use strict';

const express = require('express');
const { bremseMiddleware } = require('../lib/bremse');

/** @param {{ mitspielen?: () => object|null }} deps  mitspielen: offener Stream-Raum (mitspielen/), sonst null */
function createGlockeRouter({ store, optionalKonto, requireKonto, mitspielen = () => null }) {
  const router = express.Router();
  const bremse = bremseMiddleware({ fensterMs: 60_000, max: 60, meldung: 'Zu viele Anfragen. Bitte kurz warten.' });

  router.get('/', optionalKonto, bremse, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const updates = (store.kv('updates') || []).slice(0, 5);
    let raum = null;
    try { raum = mitspielen(); } catch { /* ohne Raum */ }
    if (!req.kontoId) return res.json({ eintraege: [], ungelesen: 0, updates, mitspielen: raum });
    const { eintraege, ungelesen } = store.liste(req.kontoId);
    return res.json({ eintraege, ungelesen, updates, mitspielen: raum });
  });

  router.post('/gelesen', requireKonto, bremse, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 100) : null;
    store.markiereGelesen(req.kontoId, ids);
    res.json({ ungelesen: store.liste(req.kontoId, { limit: 1 }).ungelesen });
  });

  return router;
}

module.exports = { createGlockeRouter };
