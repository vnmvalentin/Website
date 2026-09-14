// tempdle.js — "Das Thermometer": rate die exakte Temperatur eines Phänomens.
//
// Datensatz kommt aus einer kuratierten JSON-Datei statt live von Wikidata (siehe
// dle/tools/fetchTempdleData.js für die Herkunft/Begründung):
//  - tempdle-phenomena.json:  von Hand kuratierte Alltags-/Naturphänomene (Lava, Mars,
//                              Pizza-Ofen, …) — für die gibt es keine einzelne SPARQL-
//                              Abfrage, die sie sauber als eine Kategorie liefert.
// Die Datei trägt inzwischen auch ein `image`-Feld (Wikimedia-Bild-URL) — geholt von
// dle/tools/fetchTempdleImages.js. Fehlt es (kein passendes Bild gefunden), bleibt es
// null — das Frontend blendet das Bild dann einfach aus, siehe TempdleRound.jsx.
//
// Chemische Elemente (tempdle-elements.json, Schmelzpunkte) sind ABSICHTLICH nicht mehr
// Teil des Pools: den exakten Schmelzpunkt eines Metalls kennt praktisch niemand aus
// Alltagserfahrung, das war reines Auswendiglernen statt Schätzen. Die Datei bleibt als
// Rohdaten liegen, wird hier aber nicht mehr eingebunden — siehe auch die allgemeine
// Bereinigung sehr extremer, kaum schätzbarer Werte in tempdle-phenomena.json selbst.
const phenomena = require('../../data/tempdle-phenomena.json');
const { seededPick, todayDateKey } = require('../dailySeed');

const ROUNDS_PER_GAME = 5;

const pool = phenomena.map((p) => ({
  id: `phenomenon-${p.id}`,
  category: 'phenomenon',
  label: p.label,
  description: p.description,
  value: p.valueC,
  image: p.image || null,
}));

function buildRounds(seedStr) {
  return seededPick(pool, ROUNDS_PER_GAME, seedStr).map((entry, index) => ({ index, ...entry }));
}

// Tagesrätsel: exakt reproduzierbar aus (Spiel-ID, Datum) — der Server muss sich also
// zwischen "Runden anfragen" und "Einsendung prüfen" nichts merken, siehe dailySeed.js.
function dailyRounds(dateKey = todayDateKey()) {
  return { dateKey, rounds: buildRounds(`tempdle:${dateKey}`) };
}

// Übungsmodus: neue zufällige Runden bei jedem Aufruf, zählt nicht für die Bestenliste —
// deshalb reicht ein einfacher Zeit+Zufalls-Seed, ohne dass er je wieder reproduziert
// werden müsste.
function practiceRounds() {
  return { rounds: buildRounds(`tempdle:practice:${Date.now()}:${Math.random()}`) };
}

module.exports = { id: 'tempdle', unit: '°C', ROUNDS_PER_GAME, dailyRounds, practiceRounds };
