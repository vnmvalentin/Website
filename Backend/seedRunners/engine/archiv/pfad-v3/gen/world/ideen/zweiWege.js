// Kernidee „Zwei Wege, eine Wahl" (Katalog Nr. 12) — Abschnitte gabeln sich: sicher und langsam
// oder riskant und schnell, und beide finden wieder zusammen.
//
// Wie „Schlüsselkette" wirkt sie nur über die Motiv-Wahl: Sie bevorzugt die Gabelung
// (motive/ideenraeume.js). Riskant heißt dort: Wer oben patzt, fällt auf den unteren Weg und
// verliert Zeit. Beide Wege sind einzeln mit dem Solver belegt, der jeweils andere zugemauert.

const MOTIV = 'gabelung';

export default {
  id: 'zweiWege',
  label: 'Zwei Wege, eine Wahl',
  beschreibung: 'Abschnitte gabeln sich: oben schnell und riskant, unten sicher und langsam.',
  kompatibel: ['hoehlen', 'parcours'],

  gewichteMotive(ids, gewichte, kontext) {
    const mult = kontext.tier === 'stark' ? 12 : 6;
    return gewichte.map((g, i) => (ids[i] === MOTIV ? Math.max(g, 1) * mult : g));
  },
};
