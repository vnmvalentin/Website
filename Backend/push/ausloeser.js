// push/ausloeser.js — wann die Website von selbst Mitteilungen verschickt.
//
//   Stream live:   createLiveWaechter fragt jede Minute den Live-Stand (routes/liveRoutes.js, eine Minute
//                  zwischengespeichert) und meldet einen neuen Stream genau einmal. Kein zweites Mal nach einem
//                  Neustart des Backends (Merker in push.db) und nicht, wenn der Stream schon länger als 15 Minuten
//                  läuft (Neustart mitten im Stream) oder der letzte Hinweis keine 30 Minuten her ist (Abbruch und
//                  Neustart des Streams).
//   Neue Updates:  meldeNeueVersion bekommt die neuesten Einträge der Updates-Seite (statusWatch/postUpdates.js nach
//                  jedem Frontend-Deploy) und meldet den neuesten, falls er noch nicht gemeldet war.
'use strict';

const MINUTE = 60 * 1000;
const SPAET_MS = 15 * MINUTE;
const RUHE_MS = 30 * MINUTE;

/**
 * @param {object} deps
 * @param {() => Promise<{ live: boolean, title?: string, game?: string, startedAt?: string }>} deps.zustand
 * @param {{ kv: Function, setzeKv: Function }} deps.store
 * @param {(nachricht: object) => Promise<any>} deps.melde   lib/mitteilungen.js meldeMitteilung
 */
function createLiveWaechter({ zustand, store, melde, now = Date.now, intervallMs = MINUTE, log = console }) {
  let timer = null;

  async function pruefe() {
    let s;
    try {
      s = await zustand();
    } catch (e) {
      log.error?.('[push] Live-Stand:', e.message);
      return null;
    }
    if (!s?.live || !s.startedAt) return null;
    const gemeldet = store.kv('live_gemeldet') || {};
    if (gemeldet.startedAt === s.startedAt) return null;
    const t = now();
    const start = Date.parse(s.startedAt);
    if (!Number.isFinite(start) || t - start > SPAET_MS || (gemeldet.um && t - gemeldet.um < RUHE_MS)) {
      // Diesen Stream nicht melden, aber merken; die Zeit der letzten echten Meldung bleibt stehen
      store.setzeKv('live_gemeldet', { startedAt: s.startedAt, um: gemeldet.um || null });
      return null;
    }
    store.setzeKv('live_gemeldet', { startedAt: s.startedAt, um: t });
    const titel = s.title ? String(s.title).slice(0, 140) : null;
    return melde({
      thema: 'live',
      titel: { de: 'vnmvalentin ist live', en: 'vnmvalentin is live' },
      text: {
        de: [titel, s.game].filter(Boolean).join(' · ') || 'Jetzt auf Twitch zuschauen',
        en: [titel, s.game].filter(Boolean).join(' · ') || 'Watch now on Twitch',
      },
      url: '/',
      tag: 'live',
      ttl: 3600,
      urgency: 'high',
    });
  }

  return {
    pruefe,
    start() {
      if (!timer) {
        timer = setInterval(() => { pruefe(); }, intervallMs);
        timer.unref?.();
      }
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}

/** „v6.26: Clash Royale Stats“ → { nummer: "v6.26", titel: "Clash Royale Stats" } */
function teileVersion(version) {
  const m = /^\s*(v[\d.]+)\s*:?\s*(.*)$/i.exec(String(version || ''));
  return m ? { nummer: m[1], titel: m[2] || m[1] } : { nummer: '', titel: String(version || '') };
}

/**
 * Neueste Version der Updates-Seite melden, falls noch nicht geschehen.
 * @param {Array<{ version: string, date: string }>} entries  neueste zuerst (wie NEWS_UPDATES)
 */
async function meldeNeueVersion({ entries, store, melde }) {
  const neueste = Array.isArray(entries) ? entries[0] : null;
  if (!neueste?.version) return null;
  const gemeldet = store.kv('updates_gemeldet') || [];
  if (gemeldet.includes(neueste.version)) return null;
  store.setzeKv('updates_gemeldet', [neueste.version, ...gemeldet].slice(0, 30));
  const { nummer, titel } = teileVersion(neueste.version);
  return melde({
    thema: 'updates',
    titel: { de: `Neu auf vnmvalentin.de${nummer ? ` (${nummer})` : ''}`, en: `New on vnmvalentin.de${nummer ? ` (${nummer})` : ''}` },
    text: { de: titel, en: titel },
    url: nummer ? `/updates?v=${encodeURIComponent(nummer)}` : '/updates',
    tag: 'updates',
    ttl: 24 * 3600,
  });
}

module.exports = { createLiveWaechter, meldeNeueVersion, teileVersion };
