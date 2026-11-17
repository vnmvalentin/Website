// push/pushVersand.js — Mitteilungen verschicken (Web-Push über das Paket web-push: Verschlüsselung nach RFC 8291,
// Anmeldung beim Push-Dienst mit VAPID). Die VAPID-Schlüssel kommen aus der .env (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY)
// oder werden beim ersten Start erzeugt und in push.db gemerkt.
//
// Nachricht: { titel: { de, en }, text: { de, en }, url, tag } — jedes Gerät bekommt sie in seiner Sprache. Ein
// Gerät, das der Push-Dienst nicht mehr kennt (404/410), wird gelöscht; nach 5 anderen Fehlern in Folge ebenso.
'use strict';

const { themaInfo } = require('./themen');

const PARALLEL = 10;
const ICON = '/favicons/android-chrome-192x192.png';

const textIn = (wert, sprache) => (wert && typeof wert === 'object' ? (wert[sprache] || wert.de || '') : String(wert || ''));

/** Nur ein Pfad auf der eigenen Seite oder eine https-Adresse — sonst die Startseite */
function sichereUrl(url) {
  const u = String(url || '/');
  if (u.startsWith('/') && !u.startsWith('//')) return u.slice(0, 300);
  return /^https:\/\/[^\s]+$/.test(u) ? u.slice(0, 300) : '/';
}

/**
 * @param {object} deps
 * @param {ReturnType<import('./pushStore').createPushStore>} deps.store
 * @param {object} [deps.webpush]   das Paket web-push (Tests reichen eine Attrappe herein)
 * @param {string} [deps.subject]   Kontakt für den Push-Dienst: https-Adresse der Website
 */
function createPushVersand({ store, webpush = require('web-push'), subject = process.env.FRONTEND_URL || 'https://vnmvalentin.de', log = console } = {}) {
  let schluessel = null;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    schluessel = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    schluessel = store.kv('vapid');
    if (!schluessel?.publicKey || !schluessel?.privateKey) {
      schluessel = webpush.generateVAPIDKeys();
      store.setzeKv('vapid', schluessel);
      log.log?.('[push] neue VAPID-Schlüssel erzeugt');
    }
  }
  const vapidDetails = { subject: /^https:\/\//.test(subject) ? subject : 'https://vnmvalentin.de', publicKey: schluessel.publicKey, privateKey: schluessel.privateKey };

  function payloadFuer(abo, nachricht) {
    return JSON.stringify({
      titel: textIn(nachricht.titel, abo.sprache).slice(0, 120),
      text: textIn(nachricht.text, abo.sprache).slice(0, 300),
      url: sichereUrl(nachricht.url),
      tag: String(nachricht.tag || '').slice(0, 64) || undefined,
      icon: ICON,
    });
  }

  /** @returns {Promise<'ok'|'weg'|'fehler'>} */
  async function sendeAn(abo, nachricht, { ttl = 3600, urgency = 'normal' } = {}) {
    try {
      await webpush.sendNotification({ endpoint: abo.endpoint, keys: abo.keys }, payloadFuer(abo, nachricht), { TTL: ttl, urgency, vapidDetails });
      store.merkeOk(abo.endpoint);
      return 'ok';
    } catch (e) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) {
        store.entferne(abo.endpoint);
        return 'weg';
      }
      store.merkeFehler(abo.endpoint);
      log.error?.(`[push] Versand fehlgeschlagen (${code || e?.message || 'unbekannt'})`);
      return 'fehler';
    }
  }

  async function sendeAnListe(abos, nachricht, opt) {
    const ergebnis = { ok: 0, weg: 0, fehler: 0 };
    for (let i = 0; i < abos.length; i += PARALLEL) {
      const runde = await Promise.all(abos.slice(i, i + PARALLEL).map((a) => sendeAn(a, nachricht, opt)));
      for (const r of runde) ergebnis[r]++;
    }
    return ergebnis;
  }

  /**
   * Eine Mitteilung zu einem Thema. Persönliche Themen nur mit `konten`.
   * @returns {Promise<{ ok: number, weg: number, fehler: number }>}
   */
  async function sende({ thema, konten = null, ttl, urgency, ...nachricht }) {
    const info = themaInfo(thema);
    if (!info) throw new Error(`Unbekanntes Thema: ${thema}`);
    if (info.persoenlich && !Array.isArray(konten)) throw new Error(`Thema ${thema} braucht konten`);
    const abos = store.fuerThema(thema, { kontoIds: Array.isArray(konten) ? konten : null });
    return sendeAnListe(abos, nachricht, { ttl, urgency });
  }

  return {
    publicKey: schluessel.publicKey,
    sende,
    /** Probe an genau ein Gerät (Knopf „Test-Mitteilung“) */
    sendeTest: (abo, nachricht) => sendeAn(abo, nachricht, { ttl: 120 }),
  };
}

module.exports = { createPushVersand, sichereUrl };
