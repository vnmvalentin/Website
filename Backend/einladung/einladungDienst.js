// einladung/einladungDienst.js — Einladungslinks (Ausbauplan einladungslink): wer zählt, wann es Abzeichen gibt.
//
//   Annehmen:   nur ein NEUES Konto (höchstens 3 Tage alt, kein Bestandskonto von vor dem Konto-Update), nur einmal,
//               nie der eigene Code. Der Browser schickt den Code aus dem Link (?einladung=…) nach der Anmeldung.
//   Bestätigen: kommt das neue Konto an einem späteren Tag wieder (kontoStore-Beobachter „aktiv“), zählt die
//               Einladung. Dann bekommen beide Abzeichen (Bereich „website“ in konto/erfolge.js): der Gast
//               „Eingeladen“, der Werber je nach Zahl bestätigter Freunde „Gastgeber“ (1), „Netzwerker“ (3),
//               „Botschafter“ (10). Der Werber erfährt es in der Glocke und als Mitteilung (Thema „einladungen“).
// Belohnt wird nur mit Abzeichen — keine Währung (Ausbauplan). Der Nutzer kann später Kosmetik ergänzen.
'use strict';

const { tagVon } = require('../konto/kontoStore');

const NEU_MS = 3 * 24 * 60 * 60 * 1000;
const STUFEN = [
  { ab: 1, id: 'gastgeber' },
  { ab: 3, id: 'netzwerker' },
  { ab: 10, id: 'botschafter' },
];

/**
 * @param {object} deps
 * @param {ReturnType<import('./einladungStore').createEinladungStore>} deps.store
 * @param {object} deps.kontoStore
 * @param {(nachricht: object) => Promise<any>} deps.melde   lib/mitteilungen.js meldeMitteilung
 */
function createEinladungDienst({ store, kontoStore, melde, now = Date.now, log = console }) {
  function annehmen(gastId, code) {
    const k = kontoStore.ansicht(gastId);
    if (!k) return { ok: false, fehler: 'konto-fehlt' };
    if (k.bestand || now() - k.erstellt > NEU_MS) return { ok: false, fehler: 'zu-alt' };
    return store.nimmAn(gastId, code, tagVon(now()));
  }

  /** Beobachter „aktiv“ des Kontospeichers: bestätigt die Einladung am zweiten Tag und vergibt Abzeichen */
  function aktiv(kontoId, tag) {
    const werber = store.bestaetige(kontoId, tag);
    if (!werber) return null;
    try {
      kontoStore.meldeErfolge(kontoId, 'website', ['eingeladen']);
      const n = store.stand(werber).bestaetigt;
      const r = kontoStore.meldeErfolge(werber, 'website', STUFEN.filter((s) => n >= s.ab).map((s) => s.id));
      const neu = r.ok ? r.neu : [];
      const name = kontoStore.ansicht(kontoId)?.name || '';
      melde({
        thema: 'einladungen',
        konten: [werber],
        titel: { de: 'Dein Freund ist dabei', en: 'Your friend joined' },
        text: {
          de: `${name || 'Ein Freund'} ist über deinen Link dazugekommen und geblieben.${neu.length ? ' Neues Abzeichen für deine Visitenkarte!' : ''}`,
          en: `${name || 'A friend'} joined through your link and stayed.${neu.length ? ' New badge for your profile card!' : ''}`,
        },
        url: '/profile',
        tag: `einladung-${kontoId}`,
      });
      return { werber, neu };
    } catch (e) {
      log.error('[einladung] Abzeichen:', e.message);
      return { werber, neu: [] };
    }
  }

  function meinStand(kontoId) {
    const code = store.codeFuer(kontoId);
    const s = store.stand(kontoId);
    return {
      code,
      bestaetigt: s.bestaetigt,
      wartend: s.wartend,
      stufen: STUFEN,
      naechste: STUFEN.find((x) => x.ab > s.bestaetigt) || null,
      eingeladen: Boolean(s.eingeladenVon),
    };
  }

  /** Name des Werbers zu einem Code (Hinweis für den Eingeladenen) oder null */
  function info(code) {
    const werber = store.kontoVonCode(code);
    const k = werber ? kontoStore.ansicht(werber) : null;
    return k ? { name: k.name } : null;
  }

  return { annehmen, aktiv, meinStand, info };
}

module.exports = { createEinladungDienst, STUFEN, NEU_MS };
