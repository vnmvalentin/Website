// Auswahl und Laden der Geister für ein Spiel auf einem veröffentlichten Level. Ein Geist ist nur ein gespeichertes Input-Log; er läuft
// in einer eigenen Welt mit (client/ghost.js). Nur Logs, die mit DERSELBEN Physik aufgenommen wurden wie die des Browsers, laufen
// dieselbe Strecke — ein Log aus einer älteren Physik würde sichtbar in die Irre laufen, deshalb wird es übersprungen.
import { getGhost } from './levelsApi.js';
import { SIM_FINGERPRINT } from '../version.js';

export const MAX_GHOSTS = 3;

const CREATOR_COLOR = '#fbbf24';
const OTHER_COLORS = ['#38bdf8', '#f472b6', '#a3e635'];

/** Auswahl umschalten: ein gewählter Geist fällt heraus, ein neuer kommt dazu, solange Platz ist. Die Reihenfolge bleibt erhalten. */
export function toggleGhost(selected, id) {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return selected.length >= MAX_GHOSTS ? selected : [...selected, id];
}

/** Farbe je Geist: der Ersteller immer bernsteinfarben, die anderen der Reihe nach */
export function ghostColors(selected) {
  const colors = { creator: CREATOR_COLOR };
  let i = 0;
  for (const id of selected) {
    if (id === 'creator') continue;
    colors[id] = OTHER_COLORS[i % OTHER_COLORS.length];
    i++;
  }
  return colors;
}

/**
 * @param {string} code
 * @param {(string | number)[]} selected  'creator' oder die runId eines Bestenlisten-Eintrags
 * @returns {Promise<{ ghosts: { log: number[], ticks: number, name: string, color: string }[], skipped: number }>}
 *   skipped: wie viele Geister fehlten oder aus einer anderen Physik stammen
 */
export async function loadGhosts(code, selected, { fetchGhost = getGhost, simFp = SIM_FINGERPRINT } = {}) {
  const colors = ghostColors(selected);
  const loaded = await Promise.all(selected.map(async (id) => {
    try {
      const g = await fetchGhost(code, id);
      if (!g || g.simFp !== simFp || !Array.isArray(g.log)) return null;
      return { log: g.log, ticks: g.ticks, name: g.name || '', color: colors[id] };
    } catch {
      return null;
    }
  }));
  const ghosts = loaded.filter(Boolean);
  return { ghosts, skipped: selected.length - ghosts.length };
}
