// giveaways/routes.js — Giveaways des Kanals (Community-Seite /Giveaways und OBS-Overlay /overlay/giveaway).
//
//   GET    /api/giveaways                    öffentlich: laufende und vergangene (ohne IDs der Teilnehmer)
//   GET    /api/giveaways/buehne             öffentlich: was das OBS-Overlay zeigt
//   GET    /api/giveaways/mein               angemeldet: wo bin ich dabei
//   GET    /api/giveaways/:id/pruefen        angemeldet: wie stehe ich zu den Bedingungen
//   POST   /api/giveaways/:id/join | leave   angemeldet (Twitch)
//   POST   /api/giveaways                    Betreiber: anlegen
//   DELETE /api/giveaways/:id                Betreiber
//   POST   /api/giveaways/:id/ziehen         Betreiber: jetzt ziehen (im Stream)
//   POST   /api/giveaways/:id/neu            Betreiber: einen Gewinner neu ziehen { index }
//   GET|PUT /api/giveaways/einstellungen     Betreiber: Discord-Kanal, Status von Twitch/Bot
//
// Die Logik steht in dienst.js (Abläufe) und core.js (Regeln), gespeichert wird in store.js (data/giveaways.db).
'use strict';

const express = require('express');
const liveBadges = require('../lib/liveBadges');
const { createGiveawayStore } = require('./store');
const { createGiveawayDienst, echteAbhaengigkeiten, setzeAktiv } = require('./dienst');

const TAKT_MS = 30 * 1000;

/** Fehlertexte (Deutsch); die Seite übersetzt nach code (Frontend/src/pages/Giveaways/giveawayTexts.js). */
const MESSAGES = {
  not_found: 'Giveaway nicht gefunden.',
  closed: 'Dieses Giveaway ist schon vorbei.',
  way_closed: 'Auf diesem Weg kann man hier nicht mitmachen.',
  conditions: 'Noch nicht alle Bedingungen erfüllt.',
  title_missing: 'Bitte einen Titel eingeben.',
  bad_end: 'Das Ende muss mindestens eine Minute und höchstens 60 Tage in der Zukunft liegen.',
  already_drawn: 'Hier wurde schon gezogen.',
  not_drawn: 'Hier wurde noch nicht gezogen.',
  no_candidates: 'Es ist niemand mehr übrig, der gezogen werden kann.',
  bad_channel: 'Diesen Discord-Kanal kennt der Bot nicht.',
  owner_only: 'Nur der Kanalbetreiber darf das.',
};
const STATUS = { not_found: 404, owner_only: 403 };

const fehler = (res, code, extra = {}) =>
  res.status(STATUS[code] || 400).json({ error: MESSAGES[code] || 'Das hat nicht geklappt.', code, ...extra });

/** Profilbild nur von Twitch übernehmen — alles andere würde fremde Adressen ins Overlay holen. */
const twitchAvatar = (v) => (/^https:\/\/static-cdn\.jtvnw\.net\/[\w./-]+$/.test(String(v || '')) ? String(v) : '');

/** Anzeigename: der aus dem Browser nur, wenn er zum Login passt (Twitch erlaubt nur andere Groß-/Kleinschreibung). */
function anzeigename(req) {
  const login = String(req.twitchLogin || '');
  const wunsch = String((req.body && req.body.displayName) || '').trim().slice(0, 40);
  return wunsch && login && wunsch.toLowerCase() === login.toLowerCase() ? wunsch : (login || wunsch || String(req.twitchId));
}

/**
 * @param {object} opts
 * @param {Function} opts.requireAuth
 * @param {string} opts.STREAMER_TWITCH_ID
 * @param {object} [opts.io]
 * @param {object} [opts.discordClient]
 * @param {object} [opts.kontoStore]
 * @param {object} [opts.dienst]   nur für Tests: fertiger Dienst (sonst mit echten Abhängigkeiten)
 * @param {boolean} [opts.ohneTakt] nur für Tests
 */
module.exports = function createGiveawayRouter({ requireAuth, STREAMER_TWITCH_ID, io, discordClient, kontoStore, dienst: testDienst, ohneTakt } = {}) {
  const router = express.Router();
  const operatorId = String(STREAMER_TWITCH_ID || '');

  const sende = (payload) => {
    if (!io) return;
    io.to(liveBadges.ROOM_GIVEAWAYS).emit('giveaways_update', payload);
    liveBadges.broadcast(io);
  };
  let store = null;
  let dienst = testDienst;
  if (!dienst) {
    store = createGiveawayStore();
    dienst = createGiveawayDienst(echteAbhaengigkeiten({ store, operatorId, discordClient, kontoStore, sende }));
    // Punkt in der Navigation: wer bei offenen Giveaways schon dabei ist
    if (typeof liveBadges.setzeGiveawayQuelle === 'function') liveBadges.setzeGiveawayQuelle(() => store.offeneTeilnahmen());
  }
  setzeAktiv(dienst);

  if (!ohneTakt) {
    const timer = setInterval(() => { dienst.takt().catch((e) => console.error('[giveaways] Takt:', e.message)); }, TAKT_MS);
    if (typeof timer.unref === 'function') timer.unref();
  }

  const nurBetreiber = (req, res, next) => (operatorId && String(req.twitchId) === operatorId ? next() : fehler(res, 'owner_only'));

  router.get('/api/giveaways', (_req, res) => {
    res.json(dienst.oeffentlich());
  });

  router.get('/api/giveaways/buehne', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(dienst.buehne());
  });

  router.get('/api/giveaways/mein', requireAuth, (req, res) => {
    const id = String(req.twitchId);
    // Auch per Chat oder (verknüpftem) Discord eingetragen zählt — die Twitch-ID steht dann mit in der Zeile
    res.json({ dabei: dienst.meine(id), betreiber: id === operatorId });
  });

  router.get('/api/giveaways/einstellungen', requireAuth, nurBetreiber, (_req, res) => {
    res.json(dienst.status());
  });

  router.put('/api/giveaways/einstellungen', requireAuth, nurBetreiber, (req, res) => {
    const r = dienst.setzeDiscord({ guildId: req.body?.guildId || '', channelId: req.body?.channelId || '' });
    if (r.error) return fehler(res, r.error);
    res.json(dienst.status());
  });

  router.get('/api/giveaways/:id/pruefen', requireAuth, async (req, res) => {
    const r = await dienst.pruefe(String(req.params.id), { twitchId: String(req.twitchId) });
    if (r.error) return fehler(res, r.error);
    res.json(r);
  });

  router.post('/api/giveaways', requireAuth, nurBetreiber, async (req, res) => {
    const r = await dienst.anlegen(req.body, req.twitchId);
    if (r.error) return fehler(res, r.error);
    res.status(201).json(r);
  });

  router.delete('/api/giveaways/:id', requireAuth, nurBetreiber, async (req, res) => {
    const r = await dienst.loeschen(String(req.params.id));
    if (r.error) return fehler(res, r.error);
    res.json(r);
  });

  router.post('/api/giveaways/:id/join', requireAuth, async (req, res) => {
    const r = await dienst.mitmachen(String(req.params.id), {
      twitchId: String(req.twitchId),
      name: anzeigename(req),
      avatar: twitchAvatar(req.body && req.body.profileImageUrl),
    }, 'website');
    if (r.error) return fehler(res, r.error, r.ergebnisse ? { ergebnisse: r.ergebnisse } : {});
    res.json({ ok: true, neu: r.neu });
  });

  router.post('/api/giveaways/:id/leave', requireAuth, (req, res) => {
    const r = dienst.austragen(String(req.params.id), String(req.twitchId));
    if (r.error) return fehler(res, r.error);
    res.json(r);
  });

  router.post('/api/giveaways/:id/ziehen', requireAuth, nurBetreiber, async (req, res) => {
    const r = await dienst.ziehe(String(req.params.id));
    if (r.error) return fehler(res, r.error);
    res.json(r);
  });

  router.post('/api/giveaways/:id/neu', requireAuth, nurBetreiber, async (req, res) => {
    const r = await dienst.zieheNeu(String(req.params.id), req.body && req.body.index);
    if (r.error) return fehler(res, r.error);
    res.json(r);
  });

  return router;
};

module.exports.MESSAGES = MESSAGES;
