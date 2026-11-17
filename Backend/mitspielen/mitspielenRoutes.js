// mitspielen/mitspielenRoutes.js — /api/mitspielen: „Jetzt mitspielen“ im Stream (Ausbauplan mitspielen).
//
// Öffentlich
//   GET  /api/mitspielen            { aktiv, spiel, spielName, notiz, modus, url, seit, live, schlange, ich }
//                                   url nur im Modus „offen“ oder für Aufgerufene
//   GET  /api/mitspielen/chat       Klartext für den Chat-Befehl !mitspielen (Streamer.bot „Fetch URL“), ?lang=en
//   POST /api/mitspielen/anstellen  Warteschlange (jedes Konto, auch Gast) → { position }
//   POST /api/mitspielen/verlassen
// Betreiber
//   GET  /api/mitspielen/steuerung  Raum, Wartende, Aufgerufene, Adresse für den Chat-Befehl
//   PUT  /api/mitspielen/raum       { url, notiz, modus: offen|schlange, rundeGroesse }
//   POST /api/mitspielen/beenden
//   POST /api/mitspielen/aufrufen   { anzahl } — die Nächsten bekommen den Link in der Glocke und als Mitteilung
//
// Raumlinks nur auf die eigene Website (Pfad oder https://vnmvalentin.de/…). Optional: DISCORD_MITSPIELEN_WEBHOOK_URL
// postet beim Setzen eines neuen Raums nach Discord.
'use strict';

const express = require('express');
const { bremseMiddleware } = require('../lib/bremse');
const { SPIELE, spielVonPfad } = require('../analytics/spiele');

const MODI = new Set(['offen', 'schlange']);
const EIGENE_HOSTS = new Set(['vnmvalentin.de', 'www.vnmvalentin.de']);
const SPIEL_NAMEN = Object.fromEntries(SPIELE.map((s) => [s.id, s.name]));

/** Eingabe (Pfad oder ganze Adresse der eigenen Seite) → Pfad samt ?…, sonst null */
function pruefeRaumlink(roh, frontendUrl = process.env.FRONTEND_URL || 'https://vnmvalentin.de') {
  let s = String(roh || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    let u;
    try { u = new URL(s); } catch { return null; }
    let eigen = EIGENE_HOSTS.has(u.hostname);
    try { eigen = eigen || u.origin === new URL(frontendUrl).origin; } catch { /* nur die festen Hosts */ }
    if (!eigen) return null;
    s = u.pathname + u.search;
  }
  if (!s.startsWith('/') || s.startsWith('//') || s.length > 200 || /[\s<>"'\\]/.test(s)) return null;
  return s;
}

const spielZu = (pfad) => spielVonPfad(String(pfad).split('?')[0].replace(/\/+$/, '') || '/');

/**
 * @param {object} deps
 * @param {ReturnType<import('./mitspielenStore').createMitspielenStore>} deps.store
 * @param {Function} deps.optionalKonto  @param {Function} deps.requireKonto  @param {Function} deps.requireAuth
 * @param {(req) => boolean} deps.istBetreiber
 * @param {(kontoId: string) => { name: string } | null} deps.kontoAnsicht
 * @param {(n: object) => Promise<any>} deps.melde   lib/mitteilungen.js meldeMitteilung
 * @param {() => Promise<{ live: boolean }>} [deps.liveZustand]
 */
function createMitspielenRouter({
  store, optionalKonto, requireKonto, requireAuth, istBetreiber, kontoAnsicht, melde,
  liveZustand = async () => ({ live: false }), frontendUrl = process.env.FRONTEND_URL || 'https://vnmvalentin.de',
  discordPost = null, log = console,
}) {
  const router = express.Router();
  const bremse = bremseMiddleware({ fensterMs: 60_000, max: 30, meldung: 'Zu viele Anfragen. Bitte kurz warten.' });
  const nurBetreiber = (req, res, next) => (istBetreiber(req) ? next() : res.status(403).json({ error: 'Nur für den Betreiber.' }));
  const basis = frontendUrl.replace(/\/+$/, '');
  const spielName = (r) => (r.spiel && SPIEL_NAMEN[r.spiel]) || null;

  function steuerung() {
    const r = store.raum();
    return {
      raum: r && { ...r, spielName: spielName(r), link: `${basis}${r.pfad}` },
      wartende: store.wartende(),
      aufgerufene: store.aufgerufene(),
      chatAdresse: `${basis}/api/mitspielen/chat`,
    };
  }

  router.get('/', optionalKonto, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const r = store.raum();
    if (!r) return res.json({ aktiv: false });
    let live = false;
    try { live = Boolean((await liveZustand())?.live); } catch { /* ohne Live-Stand */ }
    const ich = req.kontoId ? store.eintrag(req.kontoId) : null;
    const darf = r.modus === 'offen' || ich?.status === 'aufgerufen';
    return res.json({
      aktiv: true,
      spiel: r.spiel,
      spielName: spielName(r),
      notiz: r.notiz,
      modus: r.modus,
      url: darf ? r.pfad : null,
      seit: r.gesetzt,
      live,
      schlange: r.modus === 'schlange' ? { wartend: store.wartende().length, runde: r.runde } : null,
      ich: ich ? { status: ich.status, position: ich.position } : null,
    });
  });

  router.get('/chat', bremse, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('text/plain; charset=utf-8');
    const en = req.query.lang === 'en';
    const r = store.raum();
    if (!r) return res.send(en ? 'No room is open right now.' : 'Gerade ist kein Raum offen.');
    const name = spielName(r) || (en ? 'the stream room' : 'dem Stream-Raum');
    if (r.modus === 'offen') {
      return res.send(en ? `Play along in ${name}: ${basis}${r.pfad}` : `Jetzt mitspielen bei ${name}: ${basis}${r.pfad}`);
    }
    const n = store.wartende().length;
    return res.send(en
      ? `Queue up for ${name}: ${basis}/mitspielen (${n} waiting)`
      : `Stell dich für ${name} an: ${basis}/mitspielen (${n} ${n === 1 ? 'wartet' : 'warten'})`);
  });

  router.post('/anstellen', requireKonto, bremse, (req, res) => {
    const name = kontoAnsicht(req.kontoId)?.name || 'Gast';
    const r = store.stelleAn(req.kontoId, name);
    if (!r.ok) return res.status(r.fehler === 'kein-raum' ? 404 : 409).json({ error: r.fehler === 'kein-raum' ? 'Gerade ist kein Raum offen.' : 'Die Warteschlange ist voll.', fehler: r.fehler });
    return res.json({ position: r.position });
  });

  router.post('/verlassen', requireKonto, bremse, (req, res) => {
    store.verlasse(req.kontoId);
    res.json({ ok: true });
  });

  router.get('/steuerung', requireAuth, nurBetreiber, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(steuerung());
  });

  router.put('/raum', requireAuth, nurBetreiber, (req, res) => {
    const pfad = pruefeRaumlink(req.body?.url, frontendUrl);
    if (!pfad) return res.status(400).json({ error: 'Bitte einen Link auf vnmvalentin.de eintragen (z. B. den Raumlink aus dem Spiel).', fehler: 'link' });
    const modus = MODI.has(req.body?.modus) ? req.body.modus : 'offen';
    const rundeGroesse = Math.max(1, Math.min(50, Math.floor(Number(req.body?.rundeGroesse) || 4)));
    const notiz = String(req.body?.notiz || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120);
    const vorher = store.raum();
    const r = store.setzeRaum({ pfad, spiel: spielZu(pfad), notiz, modus, rundeGroesse });
    if (discordPost && (!vorher || vorher.pfad !== pfad)) {
      const name = spielName(r);
      const link = r.modus === 'offen' ? `${basis}${r.pfad}` : `${basis}/mitspielen`;
      Promise.resolve(discordPost(`**Jetzt mitspielen${name ? `: ${name}` : ''}**${notiz ? ` — ${notiz}` : ''}\n${link}`))
        .catch((e) => log.error('[mitspielen] Discord:', e.message));
    }
    return res.json(steuerung());
  });

  router.post('/beenden', requireAuth, nurBetreiber, (req, res) => {
    store.beende();
    res.json(steuerung());
  });

  router.post('/aufrufen', requireAuth, nurBetreiber, async (req, res) => {
    const r = store.raum();
    if (!r) return res.status(404).json({ error: 'Gerade ist kein Raum offen.' });
    const dran = store.rufeAuf(req.body?.anzahl);
    const name = spielName(r);
    if (dran.length) {
      await melde({
        thema: 'mitspielen',
        konten: dran.map((d) => d.kontoId),
        titel: { de: 'Du bist dran!', en: "You're up!" },
        text: {
          de: `Komm jetzt in den Raum${name ? ` (${name})` : ''} — du spielst in der nächsten Runde mit.`,
          en: `Join the room now${name ? ` (${name})` : ''} — you're in the next round.`,
        },
        url: r.pfad,
        tag: 'mitspielen',
        ttl: 600,
      });
    }
    return res.json({ ...steuerung(), aufgerufen: dran });
  });

  return router;
}

/** Discord-Webhook (optional) */
function discordWebhook(url) {
  if (!url) return null;
  return async (text) => {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`Discord ${r.status}`);
  };
}

/** Anzeigename eines Spiels (analytics/spiele.js) oder null — auch für die Glocke (index.js) */
const spielNameVon = (id) => (id && SPIEL_NAMEN[id]) || null;

module.exports = { createMitspielenRouter, pruefeRaumlink, discordWebhook, spielNameVon };
