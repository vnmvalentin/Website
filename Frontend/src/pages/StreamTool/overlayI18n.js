// overlayI18n.js — Texte, die die Twitch-Overlays IM STREAM zeigen (Widgets und Szenen), auf Deutsch und Englisch.
//
// Die Sprache steht in der Overlay-Einstellung (config.language), nicht im Browser: die OBS-Quelle hat keinen eigenen
// Sprachspeicher und soll trotzdem in der Sprache des Streamers erscheinen. Overlay-Seite und Editor-Vorschau setzen sie
// über <OverlayLangContext.Provider>; die Widgets lesen sie mit useOverlayText(). Die Texte des Editors selbst stehen
// getrennt davon (die Zuschauer sehen nur diese hier).
import { createContext, useContext } from 'react';
import { defineMessages } from '../../i18n/core.js';

const de = {
  // Abstimmung
  poll: 'Abstimmung',
  pollHint: 'Im Twitch-Chat abstimmen',
  demoHint: 'Vorschau — Demo-Daten',
  running: 'Läuft',
  ended: 'Beendet',
  votes: (n, shown) => `${shown} ${n === 1 ? 'Stimme' : 'Stimmen'}`,
  winner: 'Gewinner',

  // Ziele und Statistik
  goal: 'Ziel',
  reached: 'Erreicht',
  live: 'Live',
  offline: 'Offline',
  statLabels: { follows: 'Follows', subs: 'Abos', bits: 'Bits', viewers: 'Zuschauer', peak: 'Höchststand', uptime: 'Laufzeit' },

  // Raid-Clip
  raid: 'Raid',
  viewers: (shown) => `${shown} Zuschauer`,
  raidClipTitle: 'Clip des Raiders',
  clip: 'Clip',
  clipBy: (name) => `von ${name}`,

  // Vorhersage
  prediction: 'Vorhersage',
  predStatus: { ACTIVE: 'Einsätze offen', LOCKED: 'Gesperrt', RESOLVED: 'Entschieden', CANCELED: 'Abgebrochen' },
  won: 'Gewonnen',
  points: (shown) => `${shown} Punkte`,
  odds: 'Quote',
  predMeta: (pts, users) => `${pts} Punkte · ${users} dabei`,
  pot: (shown) => `${shown} Kanalpunkte im Pot`,
  participants: (shown) => `${shown} Teilnehmer`,
  versus: 'VERSUS',
  payoutNone: 'Niemand lag richtig',
  payoutShort: (n, shown, pot) => `${shown} Gewinner · ${pot} Punkte`,
  payoutOne: (pot) => `1 Gewinner bekommt ${pot} Punkte`,
  payoutMany: (shown, pot) => `${shown} Gewinner teilen sich ${pot} Punkte`,

  // Hype Train
  hype: 'Hype',
  level: (n) => `Level ${n}`,
  levelUp: (n) => `Level ${n}!`,
  levelWord: 'Level',
  hopsOn: 'steigt ein',
  hypeTrain: 'Hype Train',
  goldenTrain: 'Goldener Hype Train',
  passengers: (n) => `${n} ${n === 1 ? 'Fahrgast' : 'Fahrgäste'}`,

  // Flugzeug
  planeFallback: 'Deine Nachricht',

  // Murmelbahn
  marbleRun: 'Murmelbahn',
  marblePhase: { join: 'Anmeldung offen', race: 'Rennen läuft', done: 'Entschieden' },
  finished: (count, total) => `${count} / ${total} im Ziel`,
  marbleWinner: (wins) => (wins > 1 ? `Sieger · ${wins}. Sieg` : 'Sieger'),
  joinBefore: 'Schreib',
  joinAfter: 'in den Chat',
  marblesIn: (n) => `${n} ${n === 1 ? 'Murmel' : 'Murmeln'} dabei`,
  startIn: (time) => `Start in ${time}`,
  leaderboard: 'Bestenliste',

  // Alerts — Überschrift je Art und die Wörter für die Platzhalter {subs} {bits} {viewers} {tier}
  alertKinds: { follow: 'Neuer Follower', sub: 'Neues Abo', resub: 'Abo verlängert', gift: 'Geschenk-Abo', bits: 'Bits', raid: 'Raid' },
  anonymous: 'Anonym',
  subsWord: (n, shown) => `${shown} ${n === 1 ? 'Abo' : 'Abos'}`,
  bitsWord: (n, shown) => `${shown} ${n === 1 ? 'Bit' : 'Bits'}`,
  viewersWord: (n, shown) => `${shown} Zuschauer`,
  tierWord: { 1: 'Stufe 1', 2: 'Stufe 2', 3: 'Stufe 3', prime: 'Prime' },
  alertTest: 'Test',
  alertQuote: (s) => `„${s}“`,
  demoAlertMessage: { resub: 'Schon über ein Jahr dabei!', bits: 'Viel Glück im nächsten Match!' },
};

const en = {
  poll: 'Poll',
  pollHint: 'Vote in Twitch chat',
  demoHint: 'Preview — demo data',
  running: 'Live',
  ended: 'Ended',
  votes: (n, shown) => `${shown} ${n === 1 ? 'vote' : 'votes'}`,
  winner: 'Winner',

  goal: 'Goal',
  reached: 'Reached',
  live: 'Live',
  offline: 'Offline',
  statLabels: { follows: 'Follows', subs: 'Subs', bits: 'Bits', viewers: 'Viewers', peak: 'Peak', uptime: 'Uptime' },

  raid: 'Raid',
  viewers: (shown) => `${shown} viewers`,
  raidClipTitle: "Raider's clip",
  clip: 'Clip',
  clipBy: (name) => `by ${name}`,

  prediction: 'Prediction',
  predStatus: { ACTIVE: 'Open', LOCKED: 'Locked', RESOLVED: 'Decided', CANCELED: 'Canceled' },
  won: 'Won',
  points: (shown) => `${shown} points`,
  odds: 'Odds',
  predMeta: (pts, users) => `${pts} points · ${users} in`,
  pot: (shown) => `${shown} channel points in the pot`,
  participants: (shown) => `${shown} participants`,
  versus: 'VERSUS',
  payoutNone: 'Nobody got it right',
  payoutShort: (n, shown, pot) => `${shown} ${n === 1 ? 'winner' : 'winners'} · ${pot} points`,
  payoutOne: (pot) => `1 winner gets ${pot} points`,
  payoutMany: (shown, pot) => `${shown} winners share ${pot} points`,

  hype: 'Hype',
  level: (n) => `Level ${n}`,
  levelUp: (n) => `Level ${n}!`,
  levelWord: 'Level',
  hopsOn: 'hops on',
  hypeTrain: 'Hype Train',
  goldenTrain: 'Golden Kappa Train',
  passengers: (n) => `${n} ${n === 1 ? 'passenger' : 'passengers'}`,

  planeFallback: 'Your message',

  marbleRun: 'Marble race',
  marblePhase: { join: 'Open to join', race: 'Race on', done: 'Finished' },
  finished: (count, total) => `${count} / ${total} finished`,
  marbleWinner: (wins) => (wins > 1 ? `Winner · win #${wins}` : 'Winner'),
  joinBefore: 'Type',
  joinAfter: 'in chat',
  marblesIn: (n) => `${n} ${n === 1 ? 'marble' : 'marbles'} in`,
  startIn: (time) => `Starts in ${time}`,
  leaderboard: 'Leaderboard',

  alertKinds: { follow: 'New follower', sub: 'New sub', resub: 'Resub', gift: 'Gift sub', bits: 'Bits', raid: 'Raid' },
  anonymous: 'Anonymous',
  subsWord: (n, shown) => `${shown} ${n === 1 ? 'sub' : 'subs'}`,
  bitsWord: (n, shown) => `${shown} ${n === 1 ? 'bit' : 'bits'}`,
  viewersWord: (n, shown) => `${shown} ${n === 1 ? 'viewer' : 'viewers'}`,
  tierWord: { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', prime: 'Prime' },
  alertTest: 'Test',
  alertQuote: (s) => `“${s}”`,
  demoAlertMessage: { resub: 'Over a year already!', bits: 'Good luck in the next match!' },
};

export const OVERLAY_TEXTS = defineMessages({ de, en });

/** Sprache der Overlays; Overlay-Seite und Editor-Vorschau setzen sie aus config.language. */
export const OverlayLangContext = createContext('de');

const LOCALES = { de: 'de-DE', en: 'en-US' };
const formats = {};

/** Zahlen im Stream: „12.400“ und „1,5“ auf Deutsch, „12,400“ und „1.5“ auf Englisch. Je Sprache dasselbe Objekt. */
export function overlayFormat(lang) {
  const key = LOCALES[lang] ? lang : 'de';
  if (!formats[key]) {
    const locale = LOCALES[key];
    formats[key] = {
      num: (n) => Math.round(n || 0).toLocaleString(locale),
      decimal: (x) => {
        const s = Number(x || 0).toFixed(1);
        return key === 'de' ? s.replace('.', ',') : s;
      },
    };
  }
  return formats[key];
}

/** @returns {{ lang: string, t: object, num: (n: number) => string, decimal: (x: number) => string }} */
export function useOverlayText() {
  const lang = useContext(OverlayLangContext);
  return { lang, t: OVERLAY_TEXTS.dict(lang), ...overlayFormat(lang) };
}
