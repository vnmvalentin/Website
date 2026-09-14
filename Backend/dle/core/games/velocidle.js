// velocidle.js — "Der Tacho": rate die exakte Geschwindigkeit eines Tieres, Fahrzeugs oder
// Naturphänomens, in km/h.
//
// Datensatz: velocidle-entries.json, von Hand kuratiert (Geschwindigkeit hat keine einzelne
// SPARQL-Kategorie, aus der sich "interessante, alltagsnahe Vergleiche" sauber ziehen
// ließen — genau wie bei Tempdles Phänomenen). Bilder kommen über
// dle/tools/fetchVelocidleImages.js (Wikidata P18 / Wikipedia-Vorschaubild je `wikiTitle`).
//
// Anders als bei Tempdle gibt es hier KEINE negative Seite (eine Geschwindigkeit ist nie
// kleiner als 0) — die Rundenauswahl/Skalierungslogik lebt deshalb im Frontend als eigene,
// rein positive Log-Skala (siehe VelocidleRound.jsx), nicht die von Tempdle mit fester Mitte
// bei 0°C. Die Punkteformel (core/scoring.js) ist dagegen komplett wiederverwendet — sie
// arbeitet unit-agnostisch nur mit |Istwert| und Differenz, unabhängig von Einheit oder
// Vorzeichen.
const entries = require('../../data/velocidle-entries.json');
const { seededPick, todayDateKey } = require('../dailySeed');

const ROUNDS_PER_GAME = 5;

const pool = entries.map((e) => ({
  id: `velocidle-${e.id}`,
  category: 'velocity',
  label: e.label,
  description: e.description,
  value: e.valueKmh,
  image: e.image || null,
}));

function buildRounds(seedStr) {
  return seededPick(pool, ROUNDS_PER_GAME, seedStr).map((entry, index) => ({ index, ...entry }));
}

// Tagesrätsel: exakt reproduzierbar aus (Spiel-ID, Datum) — siehe dailySeed.js.
function dailyRounds(dateKey = todayDateKey()) {
  return { dateKey, rounds: buildRounds(`velocidle:${dateKey}`) };
}

// Übungsmodus: neue zufällige Runden bei jedem Aufruf, zählt nicht für die Bestenliste.
function practiceRounds() {
  return { rounds: buildRounds(`velocidle:practice:${Date.now()}:${Math.random()}`) };
}

// Deutlich kleiner als die geteilte Standard-Mindesttoleranz (core/scoring.js' MIN_TOLERANCE
// = 7 km/h): der Datensatz enthält bewusst einige sehr langsame Ausreißer (Schnecke 0,05 km/h,
// Faultier 0,25 km/h, Rolltreppe/Aorta-Blutfluss je 1 km/h, …) — für die überschreibt der
// Mindestwert von 7 die eigentlich vorgesehene, zum Istwert proportionale Toleranz (0,5 ×
// Istwert) komplett. Ein 80 % danebenliegender Tipp bei der Rolltreppe (0,2 statt 1 km/h) gab
// dadurch 89 statt der für die meisten anderen Einträge üblichen ~20 Punkte — derselbe Effekt,
// der zuerst bei Duratidles Kamerablitz auffiel (siehe core/games/duratidle.js). Mit 0,5
// verschwindet er für praktisch den gesamten Datensatz (Istwert ≥ 1 km/h reicht dafür schon).
const MIN_TOLERANCE_VELOCITY = 0.5;

module.exports = { id: 'velocidle', unit: ' km/h', ROUNDS_PER_GAME, dailyRounds, practiceRounds, minTolerance: MIN_TOLERANCE_VELOCITY };
