// Kernidee „Bröckelkette" (Katalog Nr. 5) — jede Plattform zerfällt beim Betreten, kein Zurück.
//
// Wirkt über die Motiv-Wahl: Höhlen und Parcours bekommen die Bröckelschlucht (motive/hoehlenraeume.js), der Turm
// die Bröckelleiter (motive/stockwerke.js). Keine Grundregel ändert sich — Bröckelblöcke tun, was sie immer tun.
// Die Bröckelschlucht ist seit 25.09.2026 nach dem Menschen-Bot bemessen (vorher nur Solver-belegt, und für
// Menschen kaum zu schaffen: Stücke so schmal, dass ein voller Sprung sie übersprang).

const MOTIVE = new Set(['broeckelschlucht', 'broeckelleiter']);

export default {
  id: 'broeckelkette',
  label: 'Bröckelkette',
  beschreibung: 'Jede Plattform zerfällt beim Betreten — kein Zurück, kein Stehenbleiben.',
  kompatibel: ['hoehlen', 'parcours', 'turm'],

  gewichteMotive(ids, gewichte, kontext) {
    const mult = kontext.tier === 'stark' ? 12 : 6;
    return gewichte.map((g, i) => (MOTIVE.has(ids[i]) ? Math.max(g, 1) * mult : g));
  },
};
