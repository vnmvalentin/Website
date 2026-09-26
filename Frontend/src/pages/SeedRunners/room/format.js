// Zeitformate für Rennen. Zeiten sind Sim-Ticks (120 pro Sekunde); angezeigt wird m:ss.hh
// (Hundertstel), das ist genau genug und für alle gleich lesbar.
import { TICK_HZ } from '../sim/config.js';

export function formatTicks(ticks) {
  if (ticks === null || ticks === undefined || !Number.isFinite(ticks)) return '–';
  const totalHundredths = Math.floor((ticks / TICK_HZ) * 100);
  const m = Math.floor(totalHundredths / 6000);
  const s = Math.floor((totalHundredths % 6000) / 100);
  const h = totalHundredths % 100;
  return `${m}:${String(s).padStart(2, '0')}.${String(h).padStart(2, '0')}`;
}

/** Abstand zum Ersten: "+0:03.25" */
export function formatGap(ticks) {
  if (ticks === null || ticks === undefined || !Number.isFinite(ticks)) return '–';
  return ticks === 0 ? '–' : `+${formatTicks(ticks)}`;
}
