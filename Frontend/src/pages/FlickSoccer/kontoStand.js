// kontoStand.js — Flick Soccer am Konto (utils/spielKonto.js): was gespeichert wird, wie zwei Geräte zusammenkommen,
// welche Abzeichen und Bestwerte daraus folgen. Rein, ohne React und Netz (node --test).
//
// Der Stand ist genau der Browser-Stand der Statistik (stats.js, Schlüssel flickSoccer.stats) — daraus folgen alle
// Freischaltungen. Einstellungen (Name, Design, Aufstellung) bleiben je Gerät.
import { COUNTERS, KEY, derive, normalizeStats } from './stats.js';
import { ACHIEVEMENTS, achievementDone } from './progress.js';
import { liesJson, maxJeSchluessel, schreibJson } from '../../utils/spielstand.js';

/** Erfolge des Spiels, die als Abzeichen ans Konto gehen (IDs = Backend/konto/erfolge.js, Bereich flick-soccer) */
export const KONTO_ABZEICHEN = ['anpfiff', 'hattrick', 'weisse_weste', 'profi', 'online', 'tour_ganz', 'trick_ganz', 'dauerbrenner'];

export function zusammenfuehren(konto, browser) {
  const a = normalizeStats(konto || {});
  const b = normalizeStats(browser || {});
  const out = {};
  for (const f of COUNTERS) out[f] = Math.max(Number(a[f]) || 0, Number(b[f]) || 0);
  out.formations = {};
  for (const id of new Set([...Object.keys(a.formations), ...Object.keys(b.formations)])) {
    const x = a.formations[id] || { p: 0, w: 0 };
    const y = b.formations[id] || { p: 0, w: 0 };
    out.formations[id] = { p: Math.max(x.p, y.p), w: Math.max(x.w, y.w) };
  }
  out.fieldWins = maxJeSchluessel(a.fieldWins, b.fieldWins);
  out.trick = maxJeSchluessel(a.trick, b.trick);
  out.tour = maxJeSchluessel(a.tour, b.tour);
  return out;
}

export const FLICK_KONTO = {
  lies: () => {
    const raw = liesJson(KEY);
    return raw && Object.keys(raw).length ? raw : null;
  },
  schreib: (stand) => schreibJson(KEY, normalizeStats(stand || {})),
  // ~10 je Partie, dazu 5 je gelöstem Trickschuss
  xp: (stand) => {
    const s = normalizeStats(stand || {});
    return s.played * 10 + Object.keys(s.trick).length * 5;
  },
  zusammenfuehren,
  erfolge: (stand) => {
    const d = derive(normalizeStats(stand || {}));
    return ACHIEVEMENTS.filter((a) => KONTO_ABZEICHEN.includes(a.id) && achievementDone(a, d)).map((a) => a.id);
  },
  bestwerte: (stand) => {
    const d = derive(normalizeStats(stand || {}));
    return { siege: d.wins, 'tour-sterne': d.tourStars };
  },
};
