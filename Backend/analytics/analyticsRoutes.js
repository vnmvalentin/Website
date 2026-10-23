// analyticsRoutes.js — öffentlicher Zähl-Endpunkt der Besucherstatistik (POST /api/analytics/hit).
// Die Auswertung selbst liegt hinter der Admin-Prüfung in routes/adminRoutes.js.
const express = require('express');
const store = require('./analyticsStore');
const { normalizePath, normalizeSource, normalizeLang, isBot, isMobile } = require('./normalize');

const HITS_PER_MINUTE = 120;

/** Client-Adresse hinter nginx: das letzte Element von X-Forwarded-For hat nginx selbst angehängt. */
function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return forwarded.length ? forwarded[forwarded.length - 1] : req.socket.remoteAddress || 'unbekannt';
}

/**
 * @param {{ optionalAuth: Function, STREAMER_TWITCH_ID?: string }} deps
 *   optionalAuth  setzt req.twitchId, wenn eine Session da ist — nur um die eigenen Aufrufe des Betreibers auszulassen
 */
function createAnalyticsRouter({ optionalAuth, STREAMER_TWITCH_ID }) {
  const router = express.Router();

  const buckets = new Map();
  function rateLimited(ip, now) {
    const b = buckets.get(ip);
    if (!b || now - b.start > 60000) {
      buckets.set(ip, { start: now, count: 1 });
      if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.start > 60000) buckets.delete(k);
      return false;
    }
    return ++b.count > HITS_PER_MINUTE;
  }

  // Antwortet immer mit 204: der Browser wartet nicht auf das Ergebnis, und ein Fehler hier darf
  // nie auf der Seite sichtbar werden.
  router.post('/hit', optionalAuth, (req, res) => {
    res.status(204).end();
    try {
      const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);
      if (isBot(userAgent)) return;
      // Die eigenen Aufrufe würden die Zahlen einer kleinen Seite spürbar verfälschen.
      if (STREAMER_TWITCH_ID && String(req.twitchId || '') === String(STREAMER_TWITCH_ID)) return;

      const now = Date.now();
      const ip = clientIp(req);
      if (rateLimited(ip, now)) return;

      const body = req.body || {};
      const path = normalizePath(body.p);
      if (!path) return;

      if (body.t === 'time') {
        store.recordTime({ ip, userAgent, path, seconds: body.s, now });
      } else if (body.t === 'view') {
        store.recordView({
          ip, userAgent, path, now,
          // Herkunft nur beim Einstieg: bei Klicks innerhalb der Seite schickt der Browser nichts mit.
          source: body.e ? normalizeSource(body.r, body.c) : null,
          lang: normalizeLang(body.l),
          mobile: isMobile(userAgent),
        });
      }
    } catch (e) {
      console.error('[analytics] Aufruf nicht gezählt:', e.message);
    }
  });

  return router;
}

module.exports = { createAnalyticsRouter };
