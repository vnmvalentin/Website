// Kernidee „Laser-Ampeln" (Katalog Nr. 10) — alle Laser im Level laufen im selben Takt: gehen,
// halten, gehen — wie eine Ampel, nicht wie ein individuelles Rätsel je Laser.
//
// Bogen: ein großzügiges Zeitfenster am Anfang, das zum Ende hin knapper wird (aber nie unter eine
// noch faire Vorwarnzeit fällt — die feste Regel "jede Gefahr ist sichtbar, bevor sie tötet" gilt
// uneingeschränkt weiter). Drehende Laser (`spin`) sind ein eigenes Bild ("wandernde Wand", siehe
// sim/elements/laser.js) und nicht Teil dieser Idee — sie bleiben unverändert.

import { gefahrenImBaustein } from './vertrag.js';

const PERIOD_START = 2.6;
const PERIOD_END_NORMAL = 2.0;
const PERIOD_END_STARK = 1.6;
const DUTY = 0.55;      // Anteil der Periode, den der Laser "geht" (an ist)
const WARN = 0.5;

export default {
  id: 'laserAmpeln',
  label: 'Laser-Ampeln',
  beschreibung: 'Alle Laser im Level laufen im selben Takt: gehen, halten, gehen.',
  kompatibel: ['parcours', 'turm', 'hoehlen'],

  gewichtePalette(liste, gewichte, kontext) {
    const mult = kontext.tier === 'stark' ? 3 : 2;
    return { liste, gewichte: liste.map((art, i) => (kontext.kategorie(art) === 'laser' ? gewichte[i] * mult : gewichte[i])) };
  },

  // Ein Baustein bringt Laser mit eigenem Takt mit — sie wären keine Ampeln im selben Rhythmus.
  erlaubtBaustein(tpl) {
    return !gefahrenImBaustein(tpl).has('laser');
  },

  wandleElement(spec, kontext) {
    if (spec.type !== 'laser' || spec.spin) return spec;
    const periodEnd = kontext.tier === 'stark' ? PERIOD_END_STARK : PERIOD_END_NORMAL;
    const period = PERIOD_START + (periodEnd - PERIOD_START) * kontext.fortschritt;
    return { ...spec, period, on: period * DUTY, warn: WARN, phase: 0 };
  },
};
