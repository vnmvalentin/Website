// Kernidee „Sägen im Takt" (Katalog Nr. 9) — alle bewegten Sägen im Level teilen sich EINEN
// Rhythmus, statt jede ihr eigenes Tempo und ihre eigene Phase zu würfeln.
//
// Der Bogen einführen → variieren → zuspitzen: Am Levelanfang ein großzügiger, leicht zu lesender
// Takt, zum Ende hin ein engerer (kürzere Periode). "Brechen" bleibt hier bewusst aus — ein
// Taktbruch mitten im Level widerspräche der festen Fairness-Regel ("Warten muss immer möglich
// sein"): Der Rhythmus darf enger werden, nie unvorhersehbar.
//
// Nur PARAMETER werden angepasst (`wandleElement`), keine neue Mechanik — eine stillstehende Säge
// hat keinen Takt (sie dreht sich nur auf der Stelle) und bleibt unberührt.

import { TILE } from '../../../sim/config.js';
import { gefahrenImBaustein } from './vertrag.js';

const PERIOD_START = 3.2;
const PERIOD_END_NORMAL = 2.0;
const PERIOD_END_STARK = 1.6;

/** Bahnlänge in Kacheln (Hin- und Rückweg zählt `pathAt` separat, siehe sim/elements/util.js) */
function pfadLaenge(path) {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i][0] - path[i - 1][0];
    const dy = path[i][1] - path[i - 1][1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

export default {
  id: 'saegenTakt',
  label: 'Sägen im Takt',
  beschreibung: 'Alle Sägen im Level teilen sich einen Rhythmus, der zum Ende hin enger wird.',
  kompatibel: ['parcours', 'turm', 'hoehlen'],

  gewichtePalette(liste, gewichte, kontext) {
    // Sägen sind das Thema dieser Idee — sie sollen häufiger vorkommen als in der Grundverteilung,
    // bei "stark" noch deutlicher.
    const mult = kontext.tier === 'stark' ? 3 : 2;
    return { liste, gewichte: liste.map((art, i) => (kontext.kategorie(art) === 'saw' ? gewichte[i] * mult : gewichte[i])) };
  },

  // Ein Baustein bringt Sägen mit eigenem Tempo mit — sie liefen NICHT im gemeinsamen Takt.
  erlaubtBaustein(tpl) {
    return !gefahrenImBaustein(tpl).has('saw');
  },

  wandleElement(spec, kontext) {
    if (spec.type !== 'saw' || (!spec.path && !spec.orbit)) return spec;
    const periodEnd = kontext.tier === 'stark' ? PERIOD_END_STARK : PERIOD_END_NORMAL;
    const period = PERIOD_START + (periodEnd - PERIOD_START) * kontext.fortschritt;
    if (spec.orbit) return { ...spec, turnsPerSecond: 1 / period, phase: 0 };
    const totalPx = pfadLaenge(spec.path) * TILE;
    if (totalPx <= 0) return spec;
    return { ...spec, speed: (2 * totalPx) / period, phase: 0 };
  },
};
