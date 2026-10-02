// REST-Schnittstelle der Turniere — eingehängt unter /api/clash/tournaments (index.js).
// Phase 1: anlegen, bearbeiten, anmelden/abmelden, Teilnehmer entfernen, absagen.
// Phase 2: starten (von Hand oder automatisch zum Zeitpunkt), Gruppen/Bracket in GET /:id,
//          Ergebnis durch den Veranstalter eintragen (bis die API-Auswertung aus Phase 4 kommt).
// Plan: ../PLANUNG_TURNIER.md
//
// Identität:
//   • Twitch-Session (Cookie, requireAuth/optionalAuth aus index.js) — Veranstalter immer,
//     Teilnehmer bei signupMode 'twitch'
//   • bei signupMode 'open' zusätzlich ein Geheimschlüssel je Anmeldung, den der Browser
//     speichert und als Header X-Tournament-Secret mitschickt
// Fehler kommen als { error: '<schlüssel>' } — übersetzt wird im Client (Frontend …/ClashRoyale/tournament/tI18n.js).
const express = require('express');
const crypto = require('crypto');
const { nanoid } = require('nanoid');
const store = require('./store');
const { sanitizeSettings, defaultSettings, LIMITS } = require('./settings');
const lifecycle = require('./lifecycle');
const matchRoom = require('./matchRoom');
const registry = require('../core/registry');
require('../modes'); // registriert alle Modi in der Registry
const { isConfigured: crApiConfigured, normalizeTag, fetchPlayerSummary } = require('../lib/crApi');
const { crToken } = require('./crToken');

const MAX_ACTIVE_PER_OWNER = 5;
const AUTO_START_INTERVAL_MS = 30 * 1000;
// Aufbewahrung: beendete/abgesagte Turniere 90 Tage nach dem Ende, nie gestartete nach 60 Tagen ohne Änderung
const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_ENDED_DAYS = 90;
const KEEP_STALE_DAYS = 60;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FRIEND_LINK_PREFIX = 'https://link.clashroyale.com/';

const soloModeIds = () => registry.allModes().filter(m => registry.modeAllowsParty(m, 'solo')).map(m => m.id);

// Zeitkonstanter Vergleich der Anmelde-Geheimnisse (Länge darf vorab verglichen werden)
const safeEqual = (a, b) => {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};
const cleanName = (raw) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
const cleanFriendLink = (raw) => {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return s.startsWith(FRIEND_LINK_PREFIX) && s.length <= 300 ? s : null; // null = ungültig
};

/** Öffentliche Sicht auf einen Teilnehmer — ohne Twitch-ID, Geheimnis und Freundschaftslink */
const publicParticipant = (p, ownerId) => ({
  id: p.id,
  displayName: p.displayName,
  crTag: p.crTag,
  crName: p.crName,
  crLeague: p.crLeague,
  crTrophies: p.crTrophies,
  isOwner: !!p.twitchId && String(p.twitchId) === String(ownerId),
  joinedAt: p.joinedAt,
  dropped: !!p.droppedAt,
});

const summary = (t, count) => ({
  id: t.id,
  name: t.settings.name,
  status: t.status,
  maxPlayers: t.settings.maxPlayers,
  participantCount: count,
  startsAt: t.settings.startsAt,
  ownerLogin: t.ownerLogin,
});

/** Fehlerschlüssel aus lifecycle/structure (Error.message) — alles andere ist ein echter Fehler. */
const KNOWN_ERRORS = new Set([
  'tournamentAlreadyStarted', 'tournamentTooFewPlayers', 'tournamentNotRunning', 'tournamentMatchNotFound',
  'tournamentMatchNotPlayable', 'tournamentInvalidResult', 'tournamentResetBlocked', 'tournamentNotJoined',
  'tournamentNotDrawn',
]);
const sendKnown = (res, e) => {
  if (KNOWN_ERRORS.has(e?.message)) return res.status(400).json({ error: e.message });
  throw e;
};

/** Alte Turniere löschen (siehe KEEP_*_DAYS). Gibt die Zahl der gelöschten zurück. */
function runCleanup(now = Date.now()) {
  const ids = store.purgeOld({ endedBefore: now - KEEP_ENDED_DAYS * DAY_MS, staleBefore: now - KEEP_STALE_DAYS * DAY_MS, now });
  if (ids.length) console.log(`[Turnier] ${ids.length} alte Turniere gelöscht`);
  return ids.length;
}

/**
 * Startet fällige Turniere mit autoStart (auch bereits ausgeloste — die werden nur noch freigegeben). Klappt der Start nicht (zu wenige Anmeldungen), wird
 * autoStart abgeschaltet — sonst würde es alle 30 s erneut versucht; der Veranstalter startet dann von Hand.
 */
function runAutoStart(now = Date.now()) {
  for (const t of store.listRegistrationTournaments()) {
    if (!t.settings.autoStart || !t.settings.startsAt || t.settings.startsAt > now) continue;
    try {
      lifecycle.startTournament(t);
      matchRoom.notifyTournament(t.id);
    } catch (e) {
      console.warn(`[Turnier] Autostart ${t.id} fehlgeschlagen: ${e.message}`);
      store.updateSettings(t.id, { ...t.settings, autoStart: false });
    }
  }
}

module.exports = function createTournamentRouter({
  requireAuth, optionalAuth, isAdmin = () => false, autoStartIntervalMs = AUTO_START_INTERVAL_MS,
  cleanupIntervalMs = autoStartIntervalMs > 0 ? CLEANUP_INTERVAL_MS : 0,
} = {}) {
  const router = express.Router();
  if (!requireAuth || !optionalAuth) return router;
  // Turniere erstellen ist ein Content-Creator-Feature: nur der Admin und von ihm freigegebene Twitch-Accounts
  const canCreate = (req) => !!req.twitchId && (isAdmin(req) || store.isCreator(req.twitchId, req.twitchLogin));
  const TWITCH_LOGIN = /^[a-z0-9_]{3,25}$/;
  if (autoStartIntervalMs > 0) setInterval(() => runAutoStart(), autoStartIntervalMs).unref();
  if (cleanupIntervalMs > 0) {
    const cleanup = () => { try { runCleanup(); } catch (e) { console.error('[Turnier] Aufräumen fehlgeschlagen:', e.message); } };
    setTimeout(cleanup, 60 * 1000).unref();
    setInterval(cleanup, cleanupIntervalMs).unref();
  }

  const loadOr404 = (req, res) => {
    const t = store.getTournament(req.params.id);
    if (!t || t.status === 'deleted') { res.status(404).json({ error: 'tournamentNotFound' }); return null; }
    return t;
  };
  const isOwner = (t, req) => !!req.twitchId && String(req.twitchId) === String(t.ownerId);
  const findMe = (t, req) => {
    const secret = String(req.get('X-Tournament-Secret') || '');
    return store.listParticipants(t.id).find(p =>
      (req.twitchId && p.twitchId && String(p.twitchId) === String(req.twitchId))
      || (secret && p.secret && safeEqual(p.secret, secret))
    ) || null;
  };

  // Grundlagen für das Formular: erlaubte Modi, Standardwerte, Grenzen
  router.get('/meta', optionalAuth, (req, res) => {
    const modes = soloModeIds();
    res.json({ soloModes: modes, defaults: defaultSettings(modes), limits: LIMITS, canCreate: canCreate(req), isAdmin: isAdmin(req) });
  });

  // ── Admin: Freigaben für Turnier-Ersteller ──
  router.get('/creators', requireAuth, (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'noPermission' });
    res.json({ creators: store.listCreators() });
  });
  router.post('/creators', requireAuth, (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'noPermission' });
    const login = String(req.body?.login || '').trim().replace(/^@/, '').toLowerCase();
    if (!TWITCH_LOGIN.test(login)) return res.status(400).json({ error: 'tournamentCreatorInvalid' });
    store.addCreator(login, req.twitchLogin);
    res.json({ creators: store.listCreators() });
  });
  router.delete('/creators/:login', requireAuth, (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'noPermission' });
    store.removeCreator(req.params.login);
    res.json({ creators: store.listCreators() });
  });

  // Offene (gelistete) Turniere für den Hub
  router.get('/', (req, res) => {
    res.json({ tournaments: store.listListed().map(t => summary(t, store.countParticipants(t.id))) });
  });

  // Eigene Turniere des Veranstalters
  router.get('/mine', requireAuth, (req, res) => {
    res.json({ tournaments: store.listByOwner(req.twitchId).map(t => summary(t, store.countParticipants(t.id))) });
  });

  router.get('/:id', optionalAuth, (req, res) => {
    const t = loadOr404(req, res); if (!t) return;
    const participants = store.listParticipants(t.id);
    const me = findMe(t, req);
    res.json({
      tournament: {
        id: t.id, settings: t.settings, status: t.status, ownerLogin: t.ownerLogin,
        createdAt: t.createdAt, startedAt: t.startedAt,
      },
      participants: participants.map(p => publicParticipant(p, t.ownerId)),
      isOwner: isOwner(t, req),
      // Eigene Anmeldung inklusive Freundschaftslink (den sehen sonst nur spätere Gegner)
      me: me ? { ...publicParticipant(me, t.ownerId), friendLink: me.friendLink } : null,
      loggedIn: !!req.twitchId,
      structure: lifecycle.structureView(t, participants),
      // Nur für den Veranstalter: was gerade Aufmerksamkeit braucht (Phase 5)
      ownerOverview: isOwner(t, req) ? matchRoom.ownerOverview(t) : null,
    });
  });

  router.post('/', requireAuth, (req, res) => {
    if (!canCreate(req)) return res.status(403).json({ error: 'tournamentCreateNotAllowed' });
    if (store.countActiveByOwner(req.twitchId) >= MAX_ACTIVE_PER_OWNER) {
      return res.status(400).json({ error: 'tournamentTooMany', params: { max: MAX_ACTIVE_PER_OWNER } });
    }
    const { settings, errors } = sanitizeSettings(req.body?.settings, soloModeIds());
    if (errors.length) return res.status(400).json({ error: errors[0], errors });
    const t = store.createTournament({ id: nanoid(10), ownerId: req.twitchId, ownerLogin: req.twitchLogin, settings });
    res.json({ id: t.id });
  });

  // Einstellungen ändern — nur der Veranstalter, nur vor dem Start
  router.patch('/:id', requireAuth, (req, res) => {
    const t = loadOr404(req, res); if (!t) return;
    if (!isOwner(t, req)) return res.status(403).json({ error: 'noPermission' });
    if (t.status !== 'registration') return res.status(400).json({ error: 'tournamentAlreadyStarted' });
    const { settings, errors } = sanitizeSettings(req.body?.settings, soloModeIds(), t.settings);
    if (errors.length) return res.status(400).json({ error: errors[0], errors });
    if (settings.maxPlayers < store.countParticipants(t.id)) {
      return res.status(400).json({ error: 'tournamentBelowParticipants' });
    }
    res.json({ tournament: store.updateSettings(t.id, settings) });
  });

  // Turnier absagen bzw. abbrechen (vor oder nach dem Start) — bleibt als "abgesagt" sichtbar
  router.post('/:id/cancel', requireAuth, (req, res) => {
    const t = loadOr404(req, res); if (!t) return;
    if (!isOwner(t, req)) return res.status(403).json({ error: 'noPermission' });
    if (!['registration', 'drawn', 'running'].includes(t.status)) return res.status(400).json({ error: 'tournamentNotRunning' });
    store.setStatus(t.id, 'cancelled');
    matchRoom.notifyTournament(t.id);
    res.json({ ok: true });
  });

  // Turnier endgültig löschen (Veranstalter oder Admin). Ausgeloste/laufende erst absagen — sonst stünden
  // Spieler mitten im Match plötzlich ohne Turnier da.
  router.delete('/:id', requireAuth, (req, res) => {
    const t = loadOr404(req, res); if (!t) return;
    if (!isOwner(t, req) && !isAdmin(req)) return res.status(403).json({ error: 'noPermission' });
    if (t.status === 'drawn' || t.status === 'running') return res.status(400).json({ error: 'tournamentDeleteActive' });
    store.deleteTournament(t.id);
    matchRoom.notifyTournament(t.id);
    res.json({ ok: true });
  });

  // ── Phase 5: Werkzeuge des Veranstalters ──
  const ownerAction = (path, fn) => router.post(path, requireAuth, (req, res) => {
    const t = loadOr404(req, res); if (!t) return;
    if (!isOwner(t, req)) return res.status(403).json({ error: 'noPermission' });
    let touchedMatch;
    try { touchedMatch = fn(t, req); } catch (e) { return sendKnown(res, e); }
    if (touchedMatch) matchRoom.broadcastRoom(t.id, touchedMatch);
    matchRoom.notifyTournament(t.id);
    res.json({ ok: true, status: store.getTournament(t.id).status });
  });
  const resultFrom = (b = {}) => ({ winner: b.winner, scoreA: Number(b.scoreA), scoreB: Number(b.scoreB), crownsA: b.crownsA, crownsB: b.crownsB });

  // Entschiedenes Match neu spielen lassen bzw. Ergebnis korrigieren
  ownerAction('/:id/matches/:mid/reset', (t, req) => { lifecycle.resetMatch(t, String(req.params.mid)); return String(req.params.mid); });
  ownerAction('/:id/matches/:mid/correct', (t, req) => { lifecycle.correctMatch(t, String(req.params.mid), resultFrom(req.body)); return String(req.params.mid); });
  // Spieler disqualifizieren (offene und künftige Matches kampflos verloren)
  ownerAction('/:id/participants/:pid/disqualify', (t, req) => { lifecycle.disqualify(t, String(req.params.pid)); return null; });
  // Pausieren / fortsetzen
  ownerAction('/:id/pause', (t, req) => { lifecycle.setPaused(t, !!req.body?.paused); return null; });

  // Auslosen bzw. neu auslosen, ohne zu starten ('drawn') — und die Auslosung zurücknehmen
  ownerAction('/:id/draw', (t) => { lifecycle.drawTournament(t); return null; });
  ownerAction('/:id/undraw', (t) => { lifecycle.undoDraw(t); return null; });

  // Turnier starten — Matches freigeben (aus der Anmeldung heraus: auslosen und starten in einem Schritt)
  router.post('/:id/start', requireAuth, (req, res) => {
    const t = loadOr404(req, res); if (!t) return;
    if (!isOwner(t, req)) return res.status(403).json({ error: 'noPermission' });
    try { lifecycle.startTournament(t); } catch (e) { return sendKnown(res, e); }
    matchRoom.notifyTournament(t.id);
    res.json({ ok: true });
  });

  // Ergebnis eines Matches eintragen (Serienstand) — Veranstalter; ab Phase 4 kommt es meist per API
  router.post('/:id/matches/:mid/result', requireAuth, (req, res) => {
    const t = loadOr404(req, res); if (!t) return;
    if (!isOwner(t, req)) return res.status(403).json({ error: 'noPermission' });
    const b = req.body || {};
    try {
      lifecycle.reportResult(t, String(req.params.mid), {
        winner: b.winner, scoreA: Number(b.scoreA), scoreB: Number(b.scoreB), crownsA: b.crownsA, crownsB: b.crownsB,
      });
    } catch (e) { return sendKnown(res, e); }
    matchRoom.broadcastRoom(t.id, String(req.params.mid));
    matchRoom.notifyTournament(t.id);
    res.json({ ok: true, status: store.getTournament(t.id).status });
  });

  // Anmelden: CR-Kürzel ist Pflicht und wird über die API geprüft
  router.post('/:id/join', optionalAuth, async (req, res) => {
    const t = loadOr404(req, res); if (!t) return;
    if (t.status !== 'registration') return res.status(400).json({ error: 'tournamentAlreadyStarted' });
    if (t.settings.signupMode === 'twitch' && !req.twitchId) return res.status(401).json({ error: 'tournamentLoginRequired' });
    if (findMe(t, req)) return res.status(400).json({ error: 'tournamentAlreadyJoined' });
    if (store.countParticipants(t.id) >= t.settings.maxPlayers) return res.status(400).json({ error: 'tournamentFull' });

    const displayName = cleanName(req.body?.displayName) || cleanName(req.twitchLogin);
    if (!displayName) return res.status(400).json({ error: 'nameMissing' });
    const friendLink = cleanFriendLink(req.body?.friendLink);
    if (friendLink === null) return res.status(400).json({ error: 'tournamentFriendLinkInvalid' });

    const tag = normalizeTag(req.body?.crTag);
    if (!tag) return res.status(400).json({ error: 'invalidTag' });
    if (store.listParticipants(t.id).some(p => p.crTag === tag)) return res.status(400).json({ error: 'tournamentTagTaken' });
    // Derselbe Schlüssel wie die Kampfsuche (crToken.js)
    if (!crApiConfigured(crToken())) return res.status(503).json({ error: 'apiNotConfigured' });
    let cr;
    try { cr = await fetchPlayerSummary(tag, crToken()); } catch { return res.status(502).json({ error: 'tagLookupFailed' }); }
    if (!cr || cr.notFound) return res.status(400).json({ error: 'tagNotFound' });

    // Während der API-Abfrage kann sich jemand anderes angemeldet haben — erneut prüfen
    if (store.countParticipants(t.id) >= t.settings.maxPlayers) return res.status(400).json({ error: 'tournamentFull' });
    const secret = req.twitchId ? null : crypto.randomBytes(18).toString('base64url');
    try {
      const p = store.addParticipant({
        id: nanoid(10), tournamentId: t.id, twitchId: req.twitchId || null, twitchLogin: req.twitchLogin || '',
        displayName, crTag: tag, crName: cr.name, crLeague: Number(cr.leagueNumber) || 0,
        crTrophies: Number(cr.trophies) || 0, friendLink, secret,
      });
      res.json({ participant: { ...publicParticipant(p, t.ownerId), friendLink: p.friendLink }, secret });
    } catch (e) {
      // UNIQUE-Verletzung (Doppelklick, paralleles Anmelden mit demselben Account/Tag)
      if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(400).json({ error: 'tournamentAlreadyJoined' });
      throw e;
    }
  });

  // Eigene Anmeldung zurückziehen (vor dem Start)
  router.post('/:id/leave', optionalAuth, (req, res) => {
    const t = loadOr404(req, res); if (!t) return;
    if (t.status !== 'registration') return res.status(400).json({ error: 'tournamentAlreadyStarted' });
    const me = findMe(t, req);
    if (!me) return res.status(404).json({ error: 'tournamentNotJoined' });
    store.removeParticipant(t.id, me.id);
    res.json({ ok: true });
  });

  // Freundschaftslink nachträglich setzen/ändern
  router.patch('/:id/me', optionalAuth, (req, res) => {
    const t = loadOr404(req, res); if (!t) return;
    const me = findMe(t, req);
    if (!me) return res.status(404).json({ error: 'tournamentNotJoined' });
    const friendLink = cleanFriendLink(req.body?.friendLink);
    if (friendLink === null) return res.status(400).json({ error: 'tournamentFriendLinkInvalid' });
    store.setFriendLink(t.id, me.id, friendLink);
    res.json({ ok: true, friendLink });
  });

  // Veranstalter entfernt einen Teilnehmer (vor dem Start)
  router.delete('/:id/participants/:pid', requireAuth, (req, res) => {
    const t = loadOr404(req, res); if (!t) return;
    if (!isOwner(t, req)) return res.status(403).json({ error: 'noPermission' });
    if (t.status !== 'registration') return res.status(400).json({ error: 'tournamentAlreadyStarted' });
    if (!store.removeParticipant(t.id, req.params.pid)) return res.status(404).json({ error: 'tournamentNotJoined' });
    res.json({ ok: true });
  });

  return router;
};
module.exports.runAutoStart = runAutoStart;
module.exports.runCleanup = runCleanup;
