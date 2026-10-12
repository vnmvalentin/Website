// Kernidee „Die Decke lebt" (Katalog Nr. 21) — alle Gefahr kommt von oben.
//
// Wirkt über die Motiv-Wahl: bevorzugt den Deckengang (motive/ideenraeume.js: Tunnel mit hängenden Stacheln,
// Fallblöcken, Lasern aus der Decke) und den Steinschlaggang der Höhlen. Keine Grundregel ändert sich.

const MOTIVE = new Set(['deckengang', 'steinschlaggang']);

export default {
  id: 'deckeLebt',
  label: 'Die Decke lebt',
  beschreibung: 'Alle Gefahr kommt von oben — hängende Stacheln, fallende Brocken, Laser aus der Decke.',
  kompatibel: ['hoehlen', 'parcours'],

  gewichteMotive(ids, gewichte, kontext) {
    const mult = kontext.tier === 'stark' ? 12 : 6;
    return gewichte.map((g, i) => (MOTIVE.has(ids[i]) ? Math.max(g, 1) * mult : g));
  },
};
