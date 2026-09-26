// Seed Runners — HTTP-Schicht der Tages-Rangliste (/api/seed-runners). Ohne Login, wie die -dle-Spiele:
// Die Identität ist ein Schlüssel aus dem Browser-Token (siehe daily.js).
//
//   GET  /daily               Rangliste von heute (Top 50) + die des Vortags (Top 3) + eigener Platz
//                             (Kopfzeile X-Player-Key, optional)
//   GET  /daily/:dateKey      Rangliste eines der letzten 30 Tage
//   POST /daily/submit        { playerKey, name, dateKey, ticks, deaths, log, fp } → wird nachgespielt
//   POST /levels/check        { doc, forPublish? } → prüft ein Level-Dokument (Schema, Grenzen, Rauchtest) und
//                             liefert den Inhalts-Hash, Warnungen und Kennzahlen; 422 mit Fehlerliste, wenn ungültig
//   POST /levels/verify       (Login) { doc, log, ticks, fp, hash? } → Verifizierungslauf eines eigenen Levels: wird
//                             nachgespielt; Antwort wie bei submit, dazu { hash, ticks, deaths, improved }
//   GET  /levels/verification/:hash   (Login) Stand der Verifizierung dieses Kontos: { verified, current?, ticks?, … }
//
// Antwort von submit: { status, … } — 200 für ok und nicht-besser; 422 abgelehnt (das Log führt nicht
// zur Zeit); 409 ungeprüft (Sim-Stand von Browser und Server weicht ab); 503 Prüfer überlastet oder
// ausgefallen; 400 ungültige Eingabe; 429 zu viele Anfragen.
'use strict';

const express = require('express');
const { previousDay } = require('./daily');
const { checkLevel } = require('./levelCheck');
const { HASH_RE } = require('./levelVerify');
const { mountLevelRoutes } = require('./levelsRoutes');

const SUBMITS_PER_MINUTE = 8;
const CHECKS_PER_MINUTE = 20;
const VERIFIES_PER_MINUTE = 6;
// Je Adresse doppelt so viele wie je Konto: Konten sind billig, und die Validierung des Dokuments (bis rund 45 ms) läuft im
// Hauptprozess — ohne Grenze je Adresse ließe sie sich mit vielen Konten fluten
const VERIFIES_PER_IP_PER_MINUTE = 12;
const HISTORY_DAYS = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_CODE = { ok: 200, 'nicht-besser': 200, abgelehnt: 422, ungeprueft: 409, busy: 503, fehler: 503, ungueltig: 400 };

/** Client-Adresse hinter nginx: das letzte Element von X-Forwarded-For hat nginx selbst angehängt. */
function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return forwarded.length ? forwarded[forwarded.length - 1] : req.socket.remoteAddress || 'unbekannt';
}

/**
 * @param {{ daily: object, todayKey: () => string, now?: () => number, checkLevel?: Function,
 *           levelVerify?: object, levelService?: object, requireAuth?: Function, optionalAuth?: Function, isAdmin?: Function }} deps
 *   requireAuth  Express-Middleware, die `req.twitchId` (und `req.twitchLogin`) setzt; ohne sie sind die Login-Wege gesperrt
 *   optionalAuth wie requireAuth, lässt Gäste aber durch (dann bleibt req.twitchId leer)
 *   isAdmin      (req) => true für die Moderation
 */
function createSeedRunnersRouter(deps) {
  const { daily, todayKey } = deps;
  const now = deps.now || Date.now;
  const check = deps.checkLevel || checkLevel;
  const auth = deps.requireAuth || ((req, res) => res.status(503).json({ status: 'fehler', reason: 'Anmeldung ist nicht verfügbar.' }));
  const router = express.Router();

  // Ein einfaches Zeitfenster je Adresse: Jede Prüfung kostet Rechenzeit, aber ein ehrlicher Spieler
  // schickt höchstens einen Lauf alle paar Sekunden.
  function makeLimiter(perMinute) {
    const buckets = new Map();
    return (ip) => {
      const t = now();
      const b = buckets.get(ip);
      if (!b || t - b.start > 60000) {
        buckets.set(ip, { start: t, count: 1 });
        if (buckets.size > 5000) for (const [k, v] of buckets) if (t - v.start > 60000) buckets.delete(k);
        return false;
      }
      return ++b.count > perMinute;
    };
  }
  const limited = makeLimiter(SUBMITS_PER_MINUTE);
  const checkLimited = makeLimiter(CHECKS_PER_MINUTE);
  const verifyLimited = makeLimiter(VERIFIES_PER_MINUTE);
  const verifyIpLimited = makeLimiter(VERIFIES_PER_IP_PER_MINUTE);

  router.get('/daily', (req, res) => {
    const today = todayKey();
    res.json({
      today: daily.board(today, 50),
      yesterday: daily.board(previousDay(today), 3),
      me: daily.me(today, String(req.headers['x-player-key'] || '')),
    });
  });

  router.get('/daily/:dateKey', (req, res) => {
    const { dateKey } = req.params;
    if (!DATE_RE.test(dateKey)) return res.status(400).json({ error: 'Ungültiges Datum.' });
    // Nur die letzten Tage: Ältere Listen gibt es nicht als Abruf (sie bleiben in der Datenbank)
    let oldest = todayKey();
    for (let i = 0; i < HISTORY_DAYS; i++) oldest = previousDay(oldest);
    if (dateKey < oldest || dateKey > todayKey()) return res.status(404).json({ error: 'Dafür gibt es keine Rangliste.' });
    res.json({ board: daily.board(dateKey, 50) });
  });

  router.post('/daily/submit', async (req, res) => {
    if (limited(clientIp(req))) return res.status(429).json({ status: 'zu-viele', error: 'Zu viele Einsendungen. Warte kurz.' });
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await daily.submit({
        dateKey: String(body.dateKey || ''),
        playerKey: String(body.playerKey || ''),
        name: body.name,
        ticks: body.ticks,
        deaths: body.deaths,
        log: body.log,
        fp: body.fp,
      });
      res.status(STATUS_CODE[result.status] || 500).json(result);
    } catch (e) {
      console.error('[seed-runners] daily/submit:', e);
      res.status(500).json({ status: 'fehler', error: 'Serverfehler.' });
    }
  });

  // Der Editor prüft laufend selbst; das hier ist die Prüfung, der der Server traut (und die den Hash bestimmt)
  router.post('/levels/check', async (req, res) => {
    if (checkLimited(clientIp(req))) return res.status(429).json({ ok: false, errors: ['Zu viele Prüfungen. Warte kurz.'] });
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null;
    if (!body || body.doc === undefined) return res.status(400).json({ ok: false, errors: ['Es fehlt das Level-Dokument (Feld „doc“).'] });
    try {
      const result = await check(body.doc, { requireName: body.forPublish === true });
      res.status(result.ok ? 200 : 422).json(result);
    } catch (e) {
      console.error('[seed-runners] levels/check:', e);
      res.status(500).json({ ok: false, errors: ['Serverfehler.'] });
    }
  });

  // Verifizierung: nur mit Login (das Ergebnis gehört dem Konto, das später veröffentlicht). Limit je KONTO und je Adresse —
  // eine Prüfung kostet Rechenzeit, und ein Konto braucht nicht mehr als ein paar Läufe pro Minute.
  router.post('/levels/verify', auth, async (req, res) => {
    if (!deps.levelVerify) return res.status(503).json({ status: 'fehler', reason: 'Die Verifizierung ist nicht verfügbar.' });
    const accountId = String(req.twitchId || '');
    if (verifyIpLimited(clientIp(req)) || verifyLimited(accountId)) return res.status(429).json({ status: 'zu-viele', reason: 'Zu viele Verifizierungen. Warte kurz.' });
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const result = await deps.levelVerify.submit({ accountId, doc: body.doc, log: body.log, ticks: body.ticks, fp: body.fp, hash: body.hash });
      res.status(STATUS_CODE[result.status] || 500).json(result);
    } catch (e) {
      console.error('[seed-runners] levels/verify:', e);
      res.status(500).json({ status: 'fehler', reason: 'Serverfehler.' });
    }
  });

  router.get('/levels/verification/:hash', auth, async (req, res) => {
    if (!deps.levelVerify) return res.status(503).json({ verified: false });
    if (!HASH_RE.test(req.params.hash)) return res.status(400).json({ error: 'Ungültiger Hash.' });
    try {
      res.json(await deps.levelVerify.status(String(req.twitchId || ''), req.params.hash));
    } catch (e) {
      console.error('[seed-runners] levels/verification:', e);
      res.status(500).json({ error: 'Serverfehler.' });
    }
  });

  // Veröffentlichte Level: Browser, Läufe, Likes, Meldungen, Moderation (levelsRoutes.js). Zuletzt, damit die festen Wege
  // oben (levels/check, levels/verify, levels/verification/:hash) den allgemeinen "levels/:code" vorgehen
  mountLevelRoutes(router, { ...deps, makeLimiter, clientIp });

  return router;
}

module.exports = { createSeedRunnersRouter };
