// Kernidee „Sprungpad-Ketten" (Katalog Nr. 11) — man berührt fast nie den Boden, nur Federn.
//
// Wirkt über die Motiv-Wahl: Höhlen und Parcours bekommen die Federkette (motive/ideenraeume.js: Federn auf Säulen
// über einer Stachelgrube, im gemessenen Abstand eines Federsprungs — rechts halten genügt), der Turm das Federfeld.

const MOTIVE = new Set(['federkette', 'federfeld']);

export default {
  id: 'sprungpadKetten',
  label: 'Sprungpad-Ketten',
  beschreibung: 'Man berührt fast nie den Boden — Feder um Feder über den Abgrund.',
  kompatibel: ['hoehlen', 'parcours', 'turm'],

  gewichteMotive(ids, gewichte, kontext) {
    const mult = kontext.tier === 'stark' ? 12 : 6;
    return gewichte.map((g, i) => (MOTIVE.has(ids[i]) ? Math.max(g, 1) * mult : g));
  },
};
