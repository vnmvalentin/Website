// giveaways/core.js — die Logik der Giveaways ohne Datenbank, Twitch und Discord (testbar).
//
// Ein Giveaway hat Wege (wie man mitmacht: Website, Chat-Stichwort, Discord-Knopf), Bedingungen (folgt dem Kanal,
// ist auf dem Discord-Server, war bei mindestens N Streams der letzten 30 Tage) und eine Ziehungsart: automatisch am
// Ende oder von Hand im Stream (dann wartet es nach dem Ende auf den Knopf). Geprüft wird beim Mitmachen und bei der
// Ziehung noch einmal für jeden gezogenen Gewinner — wer inzwischen entfolgt ist, wird übersprungen.
'use strict';

const crypto = require('crypto');

const MAX_TITLE = 80;
const MAX_PRIZE = 120;
const MAX_QUANTITY = 50;
const MAX_STREAMS = 20;
/** Zeitraum für „war bei N Streams“. */
const STREAM_WINDOW_MS = 30 * 24 * 3600 * 1000;
/** Ende frühestens eine Minute, spätestens 60 Tage nach dem Anlegen. */
const MIN_RUN_MS = 60 * 1000;
const MAX_RUN_MS = 60 * 24 * 3600 * 1000;
const DEFAULT_STICHWORT = '!giveaway';
const STICHWORT_RE = /^![a-z0-9_äöüß-]{2,24}$/i;
const BEDINGUNGEN = ['follow', 'discord', 'streams'];
const ZIEHUNGEN = ['auto', 'stream'];
/** So lange nach einer Ziehung zeigt das Overlay den Ziehungs-Moment. */
const SHOW_MS = 45 * 1000;

const clean = (s, max) => String(s ?? '')
  .replace(/[\u0000-\u001f\u007f]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const int = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function parseTime(v) {
  if (typeof v === 'number') return v;
  const t = Date.parse(String(v || ''));
  return Number.isFinite(t) ? t : NaN;
}

/** Stichwort für den Chat: „giveaway“ wird zu „!giveaway“, Ungültiges zum Standard. */
function cleanStichwort(v) {
  let s = String(v || '').trim().toLowerCase();
  if (s && !s.startsWith('!')) s = `!${s}`;
  return STICHWORT_RE.test(s) ? s : DEFAULT_STICHWORT;
}

/**
 * Eingabe aus dem Anlege-Dialog prüfen.
 * @returns {{ giveaway: object } | { error: 'title_missing' | 'bad_end' }}
 */
function pruefeEingabe(body, now = Date.now()) {
  const b = body && typeof body === 'object' ? body : {};
  const title = clean(b.title, MAX_TITLE);
  if (!title) return { error: 'title_missing' };
  const endDate = parseTime(b.endDate);
  if (!Number.isFinite(endDate) || endDate < now + MIN_RUN_MS || endDate > now + MAX_RUN_MS) return { error: 'bad_end' };
  const bed = b.bedingungen && typeof b.bedingungen === 'object' ? b.bedingungen : {};
  const wege = b.wege && typeof b.wege === 'object' ? b.wege : {};
  return {
    giveaway: {
      title,
      prize: clean(b.prize, MAX_PRIZE),
      quantity: int(b.quantity, 1, MAX_QUANTITY, 1),
      endDate,
      bedingungen: { follow: bed.follow === true, discord: bed.discord === true, streams: int(bed.streams, 0, MAX_STREAMS, 0) },
      // Die Website geht immer — sie ist der Ort, an dem man Bedingungen sieht und sich wieder austrägt
      wege: { website: true, chat: wege.chat === true, discord: wege.discord === true },
      stichwort: cleanStichwort(b.stichwort),
      ziehung: ZIEHUNGEN.includes(b.ziehung) ? b.ziehung : 'auto',
    },
  };
}

/** Gespeicherten Stand prüfen (auch Giveaways aus der alten JSON-Datei). */
function normalize(raw) {
  const g = raw && typeof raw === 'object' ? raw : {};
  const bed = g.bedingungen && typeof g.bedingungen === 'object' ? g.bedingungen : {};
  // Altbestand: requirements [{ type: 'twitch-follow' }]
  const legacyFollow = Array.isArray(g.requirements) && g.requirements.some((r) => r && r.type === 'twitch-follow');
  const wege = g.wege && typeof g.wege === 'object' ? g.wege : {};
  const endDate = parseTime(g.endDate);
  return {
    id: String(g.id || ''),
    title: clean(g.title, MAX_TITLE),
    prize: clean(g.prize, MAX_PRIZE),
    quantity: int(g.quantity, 1, MAX_QUANTITY, 1),
    endDate: Number.isFinite(endDate) ? endDate : 0,
    createdAt: Number(g.createdAt) || 0,
    createdBy: String(g.createdBy || ''),
    bedingungen: { follow: bed.follow === true || legacyFollow, discord: bed.discord === true, streams: int(bed.streams, 0, MAX_STREAMS, 0) },
    wege: { website: true, chat: wege.chat === true, discord: wege.discord === true },
    stichwort: cleanStichwort(g.stichwort),
    ziehung: ZIEHUNGEN.includes(g.ziehung) ? g.ziehung : 'auto',
    winners: Array.isArray(g.winners) ? g.winners.filter((w) => w && typeof w === 'object' && w.key) : [],
    ersetzt: Array.isArray(g.ersetzt) ? g.ersetzt.filter((k) => typeof k === 'string') : [],
    drawnAt: Number(g.drawnAt) || 0,
    // Ziehungs-Moment im Overlay: wann und welche Gewinner (bei „neu ziehen“ nur der neue)
    showAt: Number(g.showAt) || 0,
    showKeys: Array.isArray(g.showKeys) ? g.showKeys.filter((k) => typeof k === 'string') : [],
    discordMessage: g.discordMessage && g.discordMessage.channelId && g.discordMessage.messageId
      ? { channelId: String(g.discordMessage.channelId), messageId: String(g.discordMessage.messageId) }
      : null,
  };
}

/** offen = man kann mitmachen · wartet = vorbei, Ziehung steht aus · gezogen */
function zustand(g, now = Date.now()) {
  if (g.drawnAt) return 'gezogen';
  return g.endDate > now ? 'offen' : 'wartet';
}

/** Welche Bedingungen gelten (in fester Reihenfolge). */
function aktiveBedingungen(g) {
  const b = g.bedingungen || {};
  return BEDINGUNGEN.filter((id) => (id === 'streams' ? b.streams > 0 : b[id] === true));
}

/**
 * Bedingungen gegen gesammelte Fakten prüfen.
 * @param {object} fakten  { twitchId, discordId, follow: true|false|null, discordMember: true|false|null, streams: number|null }
 *   null heißt: ließ sich gerade nicht prüfen.
 * @returns {{ ok: boolean, ergebnisse: Array<{ id, ok, grund?, wert?, noetig? }> }}
 */
function bewerte(g, fakten) {
  const f = fakten || {};
  const ergebnisse = aktiveBedingungen(g).map((id) => {
    if (id === 'follow') {
      if (!f.twitchId) return { id, ok: false, grund: 'need_twitch' };
      if (f.follow === null || f.follow === undefined) return { id, ok: false, grund: 'check_unavailable' };
      return f.follow ? { id, ok: true } : { id, ok: false, grund: 'not_following' };
    }
    if (id === 'discord') {
      if (!f.discordId) return { id, ok: false, grund: 'no_discord_link' };
      if (f.discordMember === null || f.discordMember === undefined) return { id, ok: false, grund: 'check_unavailable' };
      return f.discordMember ? { id, ok: true } : { id, ok: false, grund: 'not_in_discord' };
    }
    // streams
    const noetig = g.bedingungen.streams;
    if (!f.twitchId) return { id, ok: false, grund: 'need_twitch', noetig };
    const wert = Number(f.streams) || 0;
    return wert >= noetig ? { id, ok: true, wert, noetig } : { id, ok: false, grund: 'streams_short', wert, noetig };
  });
  return { ok: ergebnisse.every((e) => e.ok), ergebnisse };
}

/** Schlüssel eines Teilnehmers: Twitch-ID, sonst Discord-ID. */
const teilnehmerKey = ({ twitchId, discordId }) => (twitchId ? `t:${twitchId}` : discordId ? `d:${discordId}` : '');

/**
 * Zufällige Reihenfolge (Fisher-Yates mit crypto.randomInt — sort(() => Math.random() - 0.5) ist nicht gleichverteilt).
 * @param {string[]} keys
 * @param {(max: number) => number} [rnd]  Zufallszahl in [0, max) — nur für Tests ersetzen
 */
function mische(keys, rnd = (max) => crypto.randomInt(max)) {
  const out = [...keys];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Nachricht im Chat: ist es das Stichwort eines Giveaways? Nur das erste Wort zählt, Groß/klein egal. */
function chatStichwort(message) {
  const first = String(message || '').trim().split(/\s+/)[0] || '';
  return first.startsWith('!') ? first.toLowerCase() : '';
}

/** Öffentliche Ansicht für Website und Socket — ohne Twitch-/Discord-IDs der Teilnehmer. */
function publicView(g, { count = 0, now = Date.now() } = {}) {
  return {
    id: g.id,
    title: g.title,
    prize: g.prize,
    quantity: g.quantity,
    endDate: g.endDate,
    createdAt: g.createdAt,
    bedingungen: g.bedingungen,
    wege: g.wege,
    stichwort: g.wege.chat ? g.stichwort : null,
    ziehung: g.ziehung,
    zustand: zustand(g, now),
    count,
    drawnAt: g.drawnAt,
    winners: g.winners.map((w) => ({ name: w.name, avatar: w.avatar || null, via: w.via || 'website' })),
  };
}

module.exports = {
  MAX_TITLE, MAX_PRIZE, MAX_QUANTITY, MAX_STREAMS, STREAM_WINDOW_MS, DEFAULT_STICHWORT, BEDINGUNGEN, ZIEHUNGEN, SHOW_MS,
  cleanStichwort, pruefeEingabe, normalize, zustand, aktiveBedingungen, bewerte, teilnehmerKey, mische, chatStichwort,
  publicView,
};
