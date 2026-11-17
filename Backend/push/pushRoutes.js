// push/pushRoutes.js — /api/push: Mitteilungen der Website abonnieren und abbestellen. Gilt je Gerät; wer dabei
// angemeldet ist (Twitch, Discord, Gast), dessen Konto wird gemerkt (für persönliche Themen).
//
//   GET    /api/push/schluessel   { publicKey, themen: [{ id, persoenlich, name, text }] }
//   PUT    /api/push/abo          { abo: { endpoint, keys: { p256dh, auth } }, themen: [...], sprache } → { themen }
//                                 leere Themenliste = abbestellen
//   POST   /api/push/abo/stand    { endpoint } → { themen, sprache }   (welche Themen dieses Gerät hat)
//   POST   /api/push/abo/abbestellen  { endpoint }   (POST statt DELETE: ein DELETE mit Inhalt geht nicht überall durch)
//   POST   /api/push/test         { endpoint } → schickt eine Probe-Mitteilung an dieses Gerät
//
// Die Push-Adresse (endpoint) ist eine geheime, zufällige Adresse des Browsers; wer sie kennt, darf das Abo ändern.
// Der Server schickt später Anfragen an diese Adresse — deshalb nur die bekannten Push-Dienste der Browser.
'use strict';

const express = require('express');
const { bremseMiddleware } = require('../lib/bremse');
const { THEMEN, themaInfo } = require('./themen');

const PUSH_DIENSTE = [
  (h) => h === 'fcm.googleapis.com' || h === 'android.googleapis.com', // Chrome, Edge (teils), Opera, Samsung
  (h) => h === 'updates.push.services.mozilla.com', // Firefox
  (h) => h === 'web.push.apple.com' || h.endsWith('.push.apple.com'), // Safari, iPhone (installierte Web-App)
  (h) => h.endsWith('.notify.windows.com'), // Edge unter Windows
];
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** Abo aus dem Browser prüfen. @returns {{ endpoint, keys } | null} */
function pruefeAbo(roh) {
  if (!roh || typeof roh !== 'object') return null;
  const endpoint = String(roh.endpoint || '');
  if (endpoint.length > 1000) return null;
  let url;
  try { url = new URL(endpoint); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!PUSH_DIENSTE.some((ok) => ok(url.hostname.toLowerCase()))) return null;
  const p256dh = String(roh.keys?.p256dh || '');
  const auth = String(roh.keys?.auth || '');
  if (!B64URL.test(p256dh) || p256dh.length < 80 || p256dh.length > 100) return null;
  if (!B64URL.test(auth) || auth.length < 16 || auth.length > 32) return null;
  return { endpoint, keys: { p256dh, auth } };
}

function createPushRouter({ store, versand, optionalKonto }) {
  const router = express.Router();
  const bremse = bremseMiddleware({ fensterMs: 60_000, max: 30, meldung: 'Zu viele Änderungen. Bitte kurz warten.' });
  const testBremse = bremseMiddleware({ fensterMs: 10 * 60_000, max: 5, meldung: 'Zu viele Proben. Bitte etwas warten.' });
  const endpointAus = (req) => String(req.body?.endpoint || '').slice(0, 1000);

  router.get('/schluessel', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ publicKey: versand.publicKey, themen: THEMEN.map(({ id, persoenlich, name, text }) => ({ id, persoenlich, name, text })) });
  });

  router.put('/abo', optionalKonto, bremse, (req, res) => {
    const abo = pruefeAbo(req.body?.abo);
    if (!abo) return res.status(400).json({ error: 'Ungültiges Abo.', fehler: 'abo' });
    const liste = Array.isArray(req.body?.themen) ? req.body.themen : [];
    const themen = [...new Set(liste.filter((t) => {
      const info = typeof t === 'string' ? themaInfo(t) : null;
      return info && (!info.persoenlich || req.kontoId);
    }))];
    if (!themen.length) {
      store.entferne(abo.endpoint);
      return res.json({ themen: [] });
    }
    const sprache = req.body?.sprache === 'en' ? 'en' : 'de';
    const gespeichert = store.speichere({ ...abo, kontoId: req.kontoId || null, themen, sprache });
    return res.json({ themen: gespeichert.themen });
  });

  router.post('/abo/stand', bremse, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const a = store.abo(endpointAus(req));
    res.json({ themen: a?.themen || [], sprache: a?.sprache || null });
  });

  router.post('/abo/abbestellen', bremse, (req, res) => {
    store.entferne(endpointAus(req));
    res.json({ ok: true });
  });

  router.post('/test', testBremse, async (req, res, next) => {
    try {
      const abo = store.abo(endpointAus(req));
      if (!abo) return res.status(404).json({ error: 'Dieses Gerät hat keine Mitteilungen abonniert.', fehler: 'kein-abo' });
      const ergebnis = await versand.sendeTest(abo, {
        titel: { de: 'So sehen Mitteilungen aus', en: 'This is what notifications look like' },
        text: { de: 'Mitteilungen von vnmvalentin.de sind auf diesem Gerät eingeschaltet.', en: 'Notifications from vnmvalentin.de are on for this device.' },
        url: '/profile',
        tag: 'test',
      });
      return res.json({ ergebnis });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}

module.exports = { createPushRouter, pruefeAbo };
