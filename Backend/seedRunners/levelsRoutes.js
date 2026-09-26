// Seed Runners — HTTP-Schnittstelle der veröffentlichten Level (unter /api/seed-runners). Dünn: prüft Eingaben und Anmeldung,
// ruft levelService.js und übersetzt dessen Status in HTTP-Codes. Die Regeln stehen im Dienst.
//
//   Lesen (ohne Login; mit Login zusätzlich "eigene" …)
//     GET  /levels?sort=new|popular|rated|hardest|random&q=&tag=&difficulty=&speed=&page=&mine=1
//     GET  /levels/:code                 Level mit Bestenliste und "was kann ich hier" (Kopfzeile X-Player-Key für Gäste)
//     GET  /levels/:code/doc             das Dokument zum Spielen ({ hash, doc })
//     GET  /levels/:code/ghost/:which    Geist: "creator" oder die runId eines Bestenlisten-Eintrags
//     GET  /creators/:id                 Ersteller-Profil
//   Spielen (Gäste erlaubt)
//     POST /levels/:code/play            ein Versuch beginnt (zählt Spiele)
//     POST /levels/:code/submit          { playerKey, name, ticks, log, fp } → wird nachgespielt
//   Sterne und Favoriten (Gäste über playerKey, Angemeldete über ihr Konto; ref = { kind: 'custom', code } | { kind: 'pfad', seed, biome })
//     POST /ratings                      { ref, stars (0–5), playerKey }
//     POST /ratings/lookup               { refs: [...], playerKey } → Sterne, eigene Sterne, Favorit
//     GET  /ratings/top                  bestbewertete Zufallslevel (Kopfzeile X-Player-Key für "meine")
//     GET  /favorites                    eigene Favoriten (Kopfzeile X-Player-Key)
//     POST /favorites                    { ref, on, info?, playerKey }
//   Mit Login
//     POST   /levels/publish             { doc, hash? } → veröffentlichen (setzt eine Verifizierung voraus)
//     PATCH  /levels/:code               { name?, description?, tags?, difficulty?, biome? } (Ersteller)
//     DELETE /levels/:code               löschen (Ersteller oder Moderation)
//     POST   /levels/:code/reverify      { ticks, log, fp } Ersteller spielt neu durch (nach Physik-Änderung)
//     POST   /levels/:code/report        { reason, note? }
//   Moderation (nur Admin)
//     GET  /mod/reports · GET /mod/levels/hidden · POST /mod/levels/:code/hide|unhide · POST /mod/reports/:id/dismiss
//     POST /mod/accounts/:id/ban|unban · GET /mod/bans · POST /mod/reverify
'use strict';

const { isCode } = require('./shareCode');

const STATUS_CODE = {
  ok: 200,
  'nicht-besser': 200,
  ungueltig: 400,
  'nicht-gefunden': 404,
  gesperrt: 403,
  'nicht-erlaubt': 403,
  ungeprueft: 409,
  'nicht-verifiziert': 409,
  veraltet: 409,
  doppelt: 409,
  limit: 409,
  'kein-versuch': 409,
  eigenes: 409,
  abgelehnt: 422,
  'zu-viele': 429,
  busy: 503,
  fehler: 503,
};

const ACCOUNT_RE = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * @param {import('express').Router} router
 * @param {{ levelService: object, requireAuth: Function, optionalAuth?: Function, isAdmin?: (req) => boolean,
 *           makeLimiter: (perMinute: number) => (key: string) => boolean, clientIp: (req) => string }} deps
 */
function mountLevelRoutes(router, deps) {
  const { levelService: service, makeLimiter, clientIp } = deps;
  if (!service) return;
  const auth = deps.requireAuth || ((req, res) => res.status(503).json({ status: 'fehler', reason: 'Anmeldung ist nicht verfügbar.' }));
  const optional = deps.optionalAuth || ((req, res, next) => next());
  const isAdmin = deps.isAdmin || (() => false);
  const admin = [auth, (req, res, next) => (isAdmin(req) ? next() : res.status(403).json({ status: 'nicht-erlaubt', reason: 'Nur für die Moderation.' }))];

  const browseLimited = makeLimiter(240);
  const playLimited = makeLimiter(60);
  const submitLimited = makeLimiter(8);
  const publishLimited = makeLimiter(6);
  const rateLimited = makeLimiter(60);
  const reportLimited = makeLimiter(10);
  const tooMany = (res) => res.status(429).json({ status: 'zu-viele', reason: 'Zu viele Anfragen. Warte kurz.' });

  const viewerOf = (req) => ({
    accountId: req.twitchId ? String(req.twitchId) : null,
    name: req.twitchLogin ? String(req.twitchLogin) : '',
    isAdmin: !!req.twitchId && isAdmin(req),
  });
  const bodyOf = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  const send = (res, result) => res.status(STATUS_CODE[result.status] || 500).json(result);
  const guard = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error('[seed-runners] levels:', e);
      res.status(500).json({ status: 'fehler', reason: 'Serverfehler.' });
    }
  };
  const notFound = (res) => res.status(404).json({ status: 'nicht-gefunden', reason: 'Dieses Level gibt es nicht (mehr).' });
  /** Prüft den Code in der Adresse; antwortet selbst mit 404 */
  const codeOf = (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    if (isCode(code)) return code;
    notFound(res);
    return null;
  };

  // ── Lesen ──
  router.get('/levels', optional, guard((req, res) => {
    if (browseLimited(clientIp(req))) return tooMany(res);
    const q = req.query;
    return res.json(service.list({
      sort: String(q.sort || ''), q: q.q, tag: q.tag, difficulty: q.difficulty, speed: q.speed, page: q.page, limit: q.limit,
      mine: q.mine === '1' || q.mine === 'true',
    }, viewerOf(req)));
  }));

  router.get('/creators/:id', optional, guard((req, res) => {
    if (browseLimited(clientIp(req)) || !ACCOUNT_RE.test(req.params.id)) return browseLimited(clientIp(req)) ? tooMany(res) : notFound(res);
    const c = service.creator(req.params.id, viewerOf(req));
    return c ? res.json(c) : res.status(404).json({ status: 'nicht-gefunden', reason: 'Diesen Ersteller gibt es nicht.' });
  }));

  router.get('/levels/:code', optional, guard((req, res) => {
    const code = codeOf(req, res);
    if (!code) return undefined;
    if (browseLimited(clientIp(req))) return tooMany(res);
    const d = service.detail(code, viewerOf(req), String(req.headers['x-player-key'] || ''));
    return d ? res.json(d) : notFound(res);
  }));

  router.get('/levels/:code/doc', optional, guard((req, res) => {
    const code = codeOf(req, res);
    if (!code) return undefined;
    if (browseLimited(clientIp(req))) return tooMany(res);
    const d = service.doc(code, viewerOf(req));
    return d ? res.json(d) : notFound(res);
  }));

  router.get('/levels/:code/ghost/:which', optional, guard((req, res) => {
    const code = codeOf(req, res);
    if (!code) return undefined;
    if (browseLimited(clientIp(req))) return tooMany(res);
    if (!/^(creator|\d{1,12})$/.test(req.params.which)) return notFound(res);
    const g = service.ghost(code, viewerOf(req), req.params.which);
    return g ? res.json(g) : res.status(404).json({ status: 'nicht-gefunden', reason: 'Diesen Geist gibt es nicht.' });
  }));

  // ── Spielen ──
  router.post('/levels/:code/play', optional, guard((req, res) => {
    const code = codeOf(req, res);
    if (!code) return undefined;
    if (playLimited(clientIp(req))) return tooMany(res);
    const r = service.play(code, viewerOf(req), bodyOf(req).playerKey);
    return r ? res.json({ status: 'ok', ...r }) : notFound(res);
  }));

  router.post('/levels/:code/submit', optional, guard(async (req, res) => {
    const code = codeOf(req, res);
    if (!code) return undefined;
    if (submitLimited(clientIp(req))) return tooMany(res);
    const b = bodyOf(req);
    return send(res, await service.submit(code, viewerOf(req), { playerKey: b.playerKey, name: b.name, ticks: b.ticks, log: b.log, fp: b.fp }));
  }));

  // ── Sterne und Favoriten ──
  const headerKey = (req) => String(req.headers['x-player-key'] || '');
  router.post('/ratings', optional, guard((req, res) => {
    if (rateLimited(clientIp(req))) return tooMany(res);
    const b = bodyOf(req);
    return send(res, service.rate(viewerOf(req), b.playerKey, b.ref, b.stars));
  }));
  router.post('/ratings/lookup', optional, guard((req, res) => {
    if (browseLimited(clientIp(req))) return tooMany(res);
    const b = bodyOf(req);
    return send(res, service.ratings(viewerOf(req), b.playerKey, b.refs));
  }));
  router.get('/ratings/top', optional, guard((req, res) => {
    if (browseLimited(clientIp(req))) return tooMany(res);
    return send(res, service.topRandom(viewerOf(req), headerKey(req), req.query.limit));
  }));
  router.get('/favorites', optional, guard((req, res) => {
    if (browseLimited(clientIp(req))) return tooMany(res);
    return send(res, service.favorites(viewerOf(req), headerKey(req)));
  }));
  router.post('/favorites', optional, guard((req, res) => {
    if (rateLimited(clientIp(req))) return tooMany(res);
    const b = bodyOf(req);
    return send(res, service.favorite(viewerOf(req), b.playerKey, b.ref, b.on !== false, b.info));
  }));

  // ── Mit Login ──
  router.post('/levels/publish', auth, guard(async (req, res) => {
    if (publishLimited(String(req.twitchId))) return tooMany(res);
    const b = bodyOf(req);
    return send(res, await service.publish({ viewer: viewerOf(req), doc: b.doc, hash: b.hash }));
  }));

  router.patch('/levels/:code', auth, guard(async (req, res) => {
    const code = codeOf(req, res);
    return code ? send(res, await service.patchMeta(code, viewerOf(req), bodyOf(req))) : undefined;
  }));

  router.delete('/levels/:code', auth, guard((req, res) => {
    const code = codeOf(req, res);
    return code ? send(res, service.remove(code, viewerOf(req))) : undefined;
  }));

  router.post('/levels/:code/reverify', auth, guard(async (req, res) => {
    const code = codeOf(req, res);
    if (!code) return undefined;
    if (submitLimited(String(req.twitchId))) return tooMany(res);
    const b = bodyOf(req);
    return send(res, await service.reverify(code, viewerOf(req), { ticks: b.ticks, log: b.log, fp: b.fp }));
  }));


  router.post('/levels/:code/report', auth, guard((req, res) => {
    const code = codeOf(req, res);
    if (!code) return undefined;
    if (reportLimited(String(req.twitchId))) return tooMany(res);
    const b = bodyOf(req);
    return send(res, service.report(code, viewerOf(req), { reason: b.reason, note: b.note }));
  }));

  // ── Moderation ──
  router.get('/mod/reports', admin, guard((req, res) => res.json({ reports: service.moderation.reports() })));
  // Alle ausgeblendeten Level, nicht nur die mit noch offener Meldung — hide() schließt deren Meldungen automatisch
  // mit ab (siehe levelService.js), sonst gäbe es keinen Weg zurück zu einem längst ausgeblendeten Level
  router.get('/mod/levels/hidden', admin, guard((req, res) => res.json({ levels: service.moderation.hidden() })));
  router.get('/mod/bans', admin, guard((req, res) => res.json({ bans: service.moderation.bans() })));
  router.post('/mod/levels/:code/hide', admin, guard((req, res) => {
    const code = codeOf(req, res);
    return code ? send(res, service.moderation.hide(code, bodyOf(req).reason)) : undefined;
  }));
  router.post('/mod/levels/:code/unhide', admin, guard((req, res) => {
    const code = codeOf(req, res);
    return code ? send(res, service.moderation.unhide(code)) : undefined;
  }));
  router.post('/mod/reports/:id/dismiss', admin, guard((req, res) => send(res, service.moderation.dismiss(req.params.id))));
  router.post('/mod/accounts/:id/ban', admin, guard((req, res) => {
    if (!ACCOUNT_RE.test(req.params.id)) return res.status(400).json({ status: 'ungueltig', reason: 'Ungültiges Konto.' });
    return send(res, service.moderation.ban(req.params.id, bodyOf(req).reason));
  }));
  router.post('/mod/accounts/:id/unban', admin, guard((req, res) => {
    if (!ACCOUNT_RE.test(req.params.id)) return res.status(400).json({ status: 'ungueltig', reason: 'Ungültiges Konto.' });
    return send(res, service.moderation.unban(req.params.id));
  }));
  router.post('/mod/reverify', admin, guard(async (req, res) => res.json({ status: 'ok', summary: await service.reverifyStale() })));
}

module.exports = { mountLevelRoutes, STATUS_CODE };
