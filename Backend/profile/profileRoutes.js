// profile/profileRoutes.js — Visitenkarte /u/<adresse>: eine teilbare Seite je Konto (Twitch, Discord oder Gast),
// opt-in unter /profile. Seit 16.11.2026 am Konto statt an der Twitch-ID (Ausbauplan profil-visitenkarte).
//
//   GET  /api/public-profile/me        eigene Karte samt Auswahl für den Editor (Abschnitte, Abzeichen, Spiele, CR-Konten)
//   PUT  /api/public-profile/me        { an?, adresse?, einstellungen?, crTag? } — Teiländerungen
//   GET  /api/public-profile/u/:adr    die Karte (404, wenn es sie nicht gibt oder sie aus ist)
//
// Abschnitte (Reihenfolge und Ausblenden wählt der Besitzer):
//   lieblingsspiel, abzeichen (Vitrine zuerst), bestwerte, spiele (XP je Spiel) — aus dem Konto (konto/)
//   clash — gewähltes Clash-Royale-Konto (Stand aus der offiziellen API, im Hintergrund alle 30 min aufgefrischt)
//   winTracker, tournaments, seedRunners, adventure, garden — Twitch-Bereiche, nur mit verknüpftem Twitch
// Jede Quelle liefert Daten oder null; wirft eine, fehlt nur ihr Abschnitt.
//
// Adressen: 2–25 Zeichen a–z, 0–9, _ (wie Twitch-Logins). Eine Adresse, die einem anderen Twitch-Konto gehört, ist
// gesperrt — so kann sich niemand als Streamer ausgeben. Die eigene Twitch-Adresse geht immer, auch wenn sie in der
// Sperrliste steht. Profilbilder nur vom Twitch-CDN: ein Discord-Bild verriete die Discord-ID.
'use strict';

const express = require('express');
const { bremseMiddleware } = require('../lib/bremse');
const { SPIELE } = require('../analytics/spiele');

const ADRESSE_RE = /^[a-z0-9_]{2,25}$/;
const AVATAR_RE = /^https:\/\/static-cdn\.jtvnw\.net\/[A-Za-z0-9._\-/]+$/;
const CR_TAG_RE = /^[0289PYLQGRJCUV]{3,12}$/;
const VITRINE_RE = /^[a-z0-9-]{1,40}:[a-z0-9][a-z0-9_-]{0,47}$/;
const VITRINE_MAX = 6;
const CACHE_MS = 60 * 1000;
const CR_FRISCH_MS = 30 * 60 * 1000;
const CR_MAX_JE_MINUTE = 30;

// Wörter, die nach Betreiber, Team oder Seite klingen — als Adresse für niemanden außer dem echten Twitch-Inhaber
const RESERVIERT = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'hilfe', 'help', 'team', 'staff', 'mod', 'mods', 'moderator',
  'official', 'offiziell', 'owner', 'betreiber', 'vnm', 'vnmvalentin', 'valentin', 'twitch', 'discord', 'clash',
  'clashroyale', 'supercell', 'api', 'u', 'me', 'ich', 'profil', 'profile', 'konto', 'account', 'gast', 'guest',
  'null', 'undefined', 'login', 'anmelden', 'settings', 'einstellungen', 'impressum', 'datenschutz',
]);

// Standard-Reihenfolge; die Twitch-Bereiche wie bisher auf /u/
const ABSCHNITTE = [
  'lieblingsspiel', 'abzeichen', 'bestwerte', 'spiele', 'clash',
  'winTracker', 'tournaments', 'seedRunners', 'adventure', 'garden',
];
const TWITCH_QUELLEN = ['winTracker', 'tournaments', 'seedRunners', 'adventure', 'garden'];

const SPIEL_INFO = new Map(SPIELE.map((s) => [s.id, { id: s.id, name: s.name, pfad: (s.praefixe || s.exakt || ['/'])[0] }]));

/** Tag wie ihn Leute tippen (#, Kleinbuchstaben, O statt 0) → Großbuchstaben ohne # oder null */
function normalisiereCrTag(roh) {
  if (typeof roh !== 'string') return null;
  const t = roh.trim().toUpperCase().replace(/^#/, '').replace(/O/g, '0');
  return CR_TAG_RE.test(t) ? t : null;
}

/** Adresse aus einem Namen ableiten (Vorschlag für Konten ohne Twitch) */
function adresseAusName(name) {
  const a = String(name || '').toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 25);
  return ADRESSE_RE.test(a) ? a : '';
}

const einzigartig = (liste, erlaubt) => [...new Set((Array.isArray(liste) ? liste : []).filter(erlaubt))];

/** Einstellungen prüfen; Unbekanntes fällt weg. crTag ändert nur PUT mit eigenem Feld (mit API-Prüfung). */
function bereinigeEinstellungen(roh, alt) {
  const e = roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {};
  const istAbschnitt = (k) => typeof k === 'string' && ABSCHNITTE.includes(k);
  return {
    reihenfolge: einzigartig(e.reihenfolge ?? alt.reihenfolge, istAbschnitt),
    versteckt: einzigartig(e.versteckt ?? alt.versteckt, istAbschnitt),
    lieblingsspiel: typeof (e.lieblingsspiel ?? alt.lieblingsspiel) === 'string' && SPIEL_INFO.has(e.lieblingsspiel ?? alt.lieblingsspiel)
      ? (e.lieblingsspiel ?? alt.lieblingsspiel) : '',
    vitrine: einzigartig(e.vitrine ?? alt.vitrine, (v) => typeof v === 'string' && VITRINE_RE.test(v)).slice(0, VITRINE_MAX),
    crTag: alt.crTag || '',
  };
}

/** Nur was die Karte vom CR-Konto zeigt */
function crKurz(tag, s) {
  return {
    tag,
    name: String(s.name || '').slice(0, 40),
    trophies: Number(s.trophies) || 0,
    bestTrophies: Number(s.bestTrophies) || 0,
    seasonMedals: Number(s.seasonMedals) || 0,
    leagueNumber: Number(s.leagueNumber) || 0,
    polRank: s.polRank ?? null,
    clan: s.clan?.name ? String(s.clan.name).slice(0, 40) : '',
  };
}

/**
 * Alle Abschnitte einer Karte, in der Reihenfolge des Besitzers.
 * @returns {{ alle: string[], sichtbar: string[], sections: object }}  alle = vorhandene samt versteckten (Editor)
 */
function baueAbschnitte({ konto, karte, quellen = {} }) {
  const e = karte.einstellungen;
  const out = {};
  const sicher = (key, fn) => {
    try {
      const v = fn();
      if (v && !(Array.isArray(v) && v.length === 0)) out[key] = v;
    } catch (err) {
      console.error(`[profile] ${key}:`, err.message);
    }
  };

  if (konto) {
    const xpVon = new Map(konto.spiele.map((s) => [s.spiel, s.xp]));
    sicher('lieblingsspiel', () => {
      const info = SPIEL_INFO.get(e.lieblingsspiel);
      return info ? { ...info, xp: xpVon.get(info.id) || 0 } : null;
    });
    sicher('abzeichen', () => {
      if (!konto.erfolge.length) return null;
      const alle = konto.erfolge.map((x) => ({ key: `${x.spiel}:${x.erfolg}`, spiel: x.spiel, erfolg: x.erfolg, name: x.name, text: x.text, erreicht: x.erreicht }));
      const vitrine = e.vitrine.map((k) => alle.find((x) => x.key === k)).filter(Boolean);
      const gezeigt = new Set(vitrine.map((x) => x.key));
      return { vitrine, weitere: alle.filter((x) => !gezeigt.has(x.key)) };
    });
    sicher('bestwerte', () => (konto.bestwerte || []).map(({ spiel, spielName, wert, name, art, zahl }) => ({ spiel, spielName, wert, name, art, zahl })));
    sicher('spiele', () => (konto.spiele.length ? konto.spiele.map(({ spiel, name, xp }) => ({ spiel, name, xp })) : null));
  }
  sicher('clash', () => (e.crTag && karte.crStand?.tag === e.crTag ? karte.crStand : null));

  const twitchId = konto?.twitch?.id || null;
  if (twitchId) {
    for (const key of TWITCH_QUELLEN) {
      if (typeof quellen[key] === 'function') sicher(key, () => quellen[key](twitchId));
    }
  }

  const vorhanden = (k) => Object.prototype.hasOwnProperty.call(out, k);
  const alle = [...e.reihenfolge.filter(vorhanden), ...ABSCHNITTE.filter((k) => vorhanden(k) && !e.reihenfolge.includes(k))];
  const versteckt = new Set(e.versteckt);
  const sichtbar = alle.filter((k) => !versteckt.has(k));
  const sections = Object.fromEntries(sichtbar.map((k) => [k, out[k]]));
  return { alle, sichtbar, sections };
}

/**
 * @param {object} deps
 * @param {ReturnType<import('./profileStore').createProfileStore>} deps.store
 * @param {(kontoId: string) => object|null} deps.kontoAnsicht  kontoFuerBrowser(kontoStore.ansicht(id))
 * @param {() => object} [deps.getSources]  Twitch-Quellen { winTracker(twitchId), … }
 * @param {(login: string) => Promise<string|null>} [deps.twitchIdVonLogin]  Twitch-ID zu einem Login, null = gibt es
 *        nicht; wirft, wenn Twitch nicht erreichbar ist
 * @param {(tag: string) => Promise<object|null>} [deps.holeCrSpieler]  crApi.fetchPlayerSummary
 * @param {(twitchId: string) => Array<{tag: string, name: string}>} [deps.crKontenVon]  bekannte CR-Konten (Twitch)
 */
function createVisitenkarten({
  store, kontoAnsicht, getSources = () => ({}), twitchIdVonLogin = null, holeCrSpieler = null, crKontenVon = () => [],
  now = Date.now, log = console,
}) {
  const cache = new Map(); // adresse → { at, body }
  const crLaeuft = new Set();
  let crFenster = { ab: 0, n: 0 };

  const quellen = () => {
    try { return getSources?.() || {}; } catch { return {}; }
  };
  const vergiss = (...adressen) => adressen.forEach((a) => a && cache.delete(a));

  function crAbfrageFrei() {
    const t = now();
    if (t - crFenster.ab > 60_000) crFenster = { ab: t, n: 0 };
    if (crFenster.n >= CR_MAX_JE_MINUTE) return false;
    crFenster.n++;
    return true;
  }

  /** Stand des CR-Kontos im Hintergrund auffrischen, wenn er älter als 30 min ist (Seite wartet nie darauf) */
  function crAuffrischen(karte) {
    const tag = karte.einstellungen.crTag;
    if (!tag || !holeCrSpieler || crLaeuft.has(karte.kontoId)) return;
    if (karte.crStand?.tag === tag && now() - karte.crStandAt < CR_FRISCH_MS) return;
    if (!crAbfrageFrei()) return;
    crLaeuft.add(karte.kontoId);
    Promise.resolve()
      .then(() => holeCrSpieler(tag))
      .then((s) => {
        if (s && !s.notFound && store.karte(karte.kontoId)?.einstellungen.crTag === tag) {
          store.merkeCrStand(karte.kontoId, crKurz(tag, s));
          vergiss(karte.adresse);
        }
      })
      .catch((e) => log.error(`[profile] CR-Stand ${tag}:`, e.message))
      .finally(() => crLaeuft.delete(karte.kontoId));
  }

  function oeffentlich(karte) {
    const konto = kontoAnsicht(karte.kontoId);
    if (!konto) return null;
    const { sichtbar, sections } = baueAbschnitte({ konto, karte, quellen: quellen() });
    const avatar = konto.twitch?.avatar && AVATAR_RE.test(konto.twitch.avatar) ? konto.twitch.avatar : '';
    return {
      adresse: karte.adresse,
      login: karte.adresse, // älterer Name des Felds (Link-Vorschau)
      displayName: konto.name,
      avatar,
      twitchLogin: konto.twitch && karte.twitchLogin ? karte.twitchLogin : null,
      stufe: konto.spiele.length ? konto.stufe : null,
      reihenfolge: sichtbar,
      sections,
    };
  }

  /** Öffentliche Karte zu einer Adresse oder null (auch für die Link-Vorschau) */
  function karteZu(adresseRoh) {
    const adresse = String(adresseRoh || '').toLowerCase();
    if (!ADRESSE_RE.test(adresse)) return null;
    const hit = cache.get(adresse);
    if (hit && now() - hit.at < CACHE_MS) return hit.body;
    const karte = store.vonAdresse(adresse);
    if (!karte || !karte.an) {
      cache.delete(adresse);
      return null;
    }
    crAuffrischen(karte);
    const body = oeffentlich(karte);
    if (!body) return null;
    cache.set(adresse, { at: now(), body });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return body;
  }

  function vorschlag(req, konto) {
    const kandidaten = [String(req.twitchLogin || '').toLowerCase(), adresseAusName(konto?.name)];
    for (const k of kandidaten) {
      if (ADRESSE_RE.test(k) && store.adresseFrei(k, req.kontoId) && (k === String(req.twitchLogin || '').toLowerCase() || !RESERVIERT.has(k))) return k;
    }
    return '';
  }

  function editorAntwort(req) {
    const konto = kontoAnsicht(req.kontoId);
    let karte = store.karte(req.kontoId);
    const login = String(req.twitchLogin || '').toLowerCase();
    if (karte && login && ADRESSE_RE.test(login) && karte.twitchLogin !== login) {
      store.merkeTwitchLogin(req.kontoId, login);
      karte = store.karte(req.kontoId);
    }
    const ersatz = { kontoId: req.kontoId, adresse: '', an: false, einstellungen: store.leereEinstellungen(), crStand: null, crStandAt: 0 };
    const { alle } = baueAbschnitte({ konto, karte: karte || ersatz, quellen: quellen() });
    const e = (karte || ersatz).einstellungen;
    const twitchId = konto?.twitch?.id || null;
    let crKonten = [];
    try { crKonten = twitchId ? (crKontenVon(twitchId) || []) : []; } catch (err) { log.error('[profile] CR-Konten:', err.message); }
    return {
      an: Boolean(karte?.an),
      adresse: karte?.adresse || '',
      vorschlag: karte ? '' : vorschlag(req, konto),
      einstellungen: e,
      abschnitte: alle.map((key) => ({ key, versteckt: e.versteckt.includes(key) })),
      erfolge: (konto?.erfolge || []).map((x) => ({ key: `${x.spiel}:${x.erfolg}`, name: x.name, spiel: x.spiel })),
      spiele: SPIELE.map((s) => ({ id: s.id, name: s.name })),
      crKonten: crKonten.reduce((liste, c) => {
        const tag = c && normalisiereCrTag(c.tag);
        if (tag && !liste.some((x) => x.tag === tag)) liste.push({ tag, name: String(c.name || '').slice(0, 40) });
        return liste;
      }, []),
      cr: e.crTag ? { tag: e.crTag, name: karte?.crStand?.tag === e.crTag ? karte.crStand.name : '' } : null,
      twitch: Boolean(konto?.twitch),
    };
  }

  /** Prüft eine neue Adresse; null = in Ordnung, sonst { status, fehler } */
  async function pruefeAdresse(adresse, req, konto) {
    if (!ADRESSE_RE.test(adresse)) return { status: 400, fehler: 'adresse-form' };
    if (!store.adresseFrei(adresse, req.kontoId)) return { status: 409, fehler: 'vergeben' };
    const eigeneTwitchId = konto?.twitch?.id ? String(konto.twitch.id) : '';
    // Mit Twitch angemeldet und die Adresse ist der eigene Login: ohne Rückfrage bei Twitch
    if (eigeneTwitchId && adresse === String(req.twitchLogin || '').toLowerCase()) return null;
    const gesperrt = RESERVIERT.has(adresse) ? { status: 409, fehler: 'reserviert' } : null;
    if (!twitchIdVonLogin) return gesperrt || { status: 503, fehler: 'twitch-pruefung' };
    let id;
    try {
      id = await twitchIdVonLogin(adresse);
    } catch (e) {
      log.error('[profile] Twitch-Prüfung:', e.message);
      return gesperrt || { status: 503, fehler: 'twitch-pruefung' };
    }
    // Der eigene Twitch-Name geht immer — auch wenn er in der Sperrliste steht oder man per Discord angemeldet ist
    if (id && eigeneTwitchId && String(id) === eigeneTwitchId) return null;
    if (gesperrt) return gesperrt;
    if (id) return { status: 409, fehler: 'twitch-name' };
    return null;
  }

  function router({ requireKonto }) {
    const r = express.Router();
    const bremse = bremseMiddleware({ fensterMs: 60_000, max: 30, meldung: 'Zu viele Änderungen. Bitte kurz warten.' });

    r.get('/me', requireKonto, (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(editorAntwort(req));
    });

    r.put('/me', requireKonto, bremse, async (req, res, next) => {
      try {
        const body = req.body || {};
        const konto = kontoAnsicht(req.kontoId);
        if (!konto) return res.status(401).json({ error: 'Konto nicht gefunden.', fehler: 'konto-fehlt' });
        const alt = store.karte(req.kontoId);
        const altE = alt?.einstellungen || store.leereEinstellungen();

        let adresse = alt?.adresse || '';
        if (typeof body.adresse === 'string' && body.adresse.trim().toLowerCase() !== adresse) {
          adresse = body.adresse.trim().toLowerCase();
          const f = await pruefeAdresse(adresse, req, konto);
          if (f) return res.status(f.status).json({ error: 'Diese Adresse geht nicht.', fehler: f.fehler });
        }
        if (!adresse) return res.status(400).json({ error: 'Bitte eine Adresse wählen.', fehler: 'adresse-fehlt' });

        const einstellungen = bereinigeEinstellungen(body.einstellungen, altE);
        let crNeu; // undefined = unverändert, null = entfernt, sonst neuer Stand
        if (body.crTag !== undefined) {
          const roh = typeof body.crTag === 'string' ? body.crTag.trim() : '';
          if (!roh) {
            einstellungen.crTag = '';
            crNeu = null;
          } else {
            const tag = normalisiereCrTag(roh);
            if (!tag) return res.status(400).json({ error: 'Ungültiger Spieler-Tag.', fehler: 'cr-form' });
            if (tag !== altE.crTag || alt?.crStand?.tag !== tag) {
              if (!holeCrSpieler) return res.status(503).json({ error: 'Clash Royale ist gerade nicht erreichbar.', fehler: 'cr-fehler' });
              let s;
              try {
                s = await holeCrSpieler(tag);
              } catch (e) {
                log.error('[profile] CR-Abfrage:', e.message);
                return res.status(503).json({ error: 'Clash Royale ist gerade nicht erreichbar.', fehler: 'cr-fehler' });
              }
              if (!s || s.notFound) return res.status(404).json({ error: 'Diesen Spieler gibt es nicht.', fehler: 'cr-unbekannt' });
              crNeu = crKurz(tag, s);
            }
            einstellungen.crTag = tag;
          }
        }

        const login = String(req.twitchLogin || '').toLowerCase();
        const gespeichert = store.speichere(req.kontoId, {
          adresse,
          an: typeof body.an === 'boolean' ? body.an : Boolean(alt?.an),
          einstellungen,
          twitchLogin: ADRESSE_RE.test(login) ? login : (alt?.twitchLogin || null),
        });
        if (!gespeichert.ok) return res.status(409).json({ error: 'Diese Adresse ist schon vergeben.', fehler: 'vergeben' });
        if (crNeu !== undefined) store.merkeCrStand(req.kontoId, crNeu);
        vergiss(alt?.adresse, adresse);
        return res.json(editorAntwort(req));
      } catch (e) {
        return next(e);
      }
    });

    r.get('/u/:adresse', (req, res) => {
      const body = karteZu(req.params.adresse);
      if (!body) return res.status(404).json({ error: 'Dieses Profil gibt es nicht oder es ist nicht öffentlich.' });
      // Kein Browser-Zwischenspeicher: Ausschalten soll sofort wirken. Der Server hält die Karte selbst 60 s und
      // verwirft sie bei jeder Änderung; über das ETag bekommt der Browser sonst nur ein 304.
      res.set('Cache-Control', 'no-cache');
      return res.json(body);
    });

    return r;
  }

  return { router, karteZu, vergiss };
}

module.exports = {
  createVisitenkarten, baueAbschnitte, bereinigeEinstellungen, normalisiereCrTag, adresseAusName,
  ADRESSE_RE, ABSCHNITTE, RESERVIERT, VITRINE_MAX,
  LOGIN_RE: ADRESSE_RE,
};
