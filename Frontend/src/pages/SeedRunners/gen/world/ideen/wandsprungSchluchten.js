// Kernidee „Wandsprung-Schluchten" (Katalog Nr. 20) — schmale Senkrechte, nur mit Wandsprüngen zu nehmen.
//
// Wirkt über die Motiv-Wahl: bevorzugt die Kletterschlucht (motive/ideenraeume.js: Felsstufe höher als jeder
// Doppelsprung, davor ein 4 breiter Schacht zwischen Säule und Wand). Maße wie der Chunk `wall-shaft`, den der
// Menschen-Bot in jedem Tempo schafft; keine Stacheln an den Schachtwänden (siehe PLANUNG_WELTTYPEN.md, Abschnitt 14).

const MOTIV = 'kletterschlucht';

export default {
  id: 'wandsprungSchluchten',
  label: 'Wandsprung-Schluchten',
  beschreibung: 'Schmale Schluchten, nur mit Wandsprüngen zu erklimmen.',
  kompatibel: ['hoehlen', 'parcours'],

  gewichteMotive(ids, gewichte, kontext) {
    const mult = kontext.tier === 'stark' ? 12 : 6;
    return gewichte.map((g, i) => (ids[i] === MOTIV ? Math.max(g, 1) * mult : g));
  },
};
