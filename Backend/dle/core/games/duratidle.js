// duratidle.js — "Die Stoppuhr": rate die exakte Dauer eines Ereignisses oder Vorgangs, vom
// Flügelschlag einer Stubenfliege bis zur Regierungszeit einer Königin.
//
// Datensatz: duratidle-entries.json, von Hand kuratiert. Anders als Tempdle/Velocidle/
// Probabildle (jeweils EINE feste Einheit für den ganzen Datensatz: °C, km/h, %) braucht
// Dauer zwingend UNTERSCHIEDLICHE Einheiten pro Eintrag — ein Flügelschlag in Sekunden
// anzugeben wäre eine lächerliche Kommazahl, eine Königinnen-Regierungszeit in Millisekunden
// eine unlesbare Ziffernwurst. Jeder Eintrag trägt deshalb sein eigenes `unit`-Feld
// (Millisekunden/Sekunden/Minuten/Stunden/Tage/Wochen/Monate/Jahre), und `value` ist die Zahl
// IN DIESER EINHEIT. Das funktioniert mit der geteilten Punkteformel (core/scoring.js) ohne
// Änderung, weil die Formel rein verhältnisbasiert arbeitet (Toleranz skaliert mit |Istwert|)
// — Einheit und reale Größenordnung sind ihr egal, solange Schätzung und Istwert in
// derselben Einheit vorliegen. Das GuessScaleGamePage-Grundgerüst reicht `round` unverändert
// durch, DuratidleRound.jsx liest deshalb `round.unit` statt eines global über das Spiel
// gesetzten Einheits-Strings (siehe dortiger Kommentar) — deshalb ist der hier exportierte
// `unit` bewusst leer.
//
// Bewusst NICHT im Datensatz: geologische/kosmologische Zeiträume (Alter des Universums,
// Halbwertszeiten radioaktiver Elemente in Jahrmilliarden, …) — dieselbe Lektion wie bei den
// astronomischen Ausreißern, die aus Tempdle/Velocidle geflogen sind: niemand kann so etwas
// aus Alltagserfahrung schätzen.
const entries = require('../../data/duratidle-entries.json');
const { seededPick, todayDateKey } = require('../dailySeed');

const ROUNDS_PER_GAME = 5;

const pool = entries.map((e) => ({
  id: `duratidle-${e.id}`,
  category: 'duration',
  label: e.label,
  description: e.description,
  value: e.value,
  unit: e.unit,
  image: e.image || null,
}));

function buildRounds(seedStr) {
  return seededPick(pool, ROUNDS_PER_GAME, seedStr).map((entry, index) => ({ index, ...entry }));
}

// Tagesrätsel: exakt reproduzierbar aus (Spiel-ID, Datum) — siehe dailySeed.js.
function dailyRounds(dateKey = todayDateKey()) {
  return { dateKey, rounds: buildRounds(`duratidle:${dateKey}`) };
}

// Übungsmodus: neue zufällige Runden bei jedem Aufruf, zählt nicht für die Bestenliste.
function practiceRounds() {
  return { rounds: buildRounds(`duratidle:practice:${Date.now()}:${Math.random()}`) };
}

// Deutlich kleiner als die geteilte Standard-Mindesttoleranz (core/scoring.js' MIN_TOLERANCE
// = 7): anders als Tempdle/Velocidle/Pricedle/Balancdle (jeweils EINE feste Einheit mit
// typischerweise großen Istwerten) trägt hier jeder Eintrag seine EIGENE Einheit
// (Millisekunden bis Jahre, siehe Dateikopf) — und fast die Hälfte aller Einträge hat einen
// Istwert unter 14 IN DIESER EIGENEN EINHEIT (z.B. "1 Millisekunde" beim Kamerablitz). Für
// die überschreibt der Mindestwert von 7 die eigentlich vorgesehene, zum Istwert
// proportionale Toleranz (0,5 × Istwert) komplett — ein 80 % danebenliegender Tipp beim
// Kamerablitz (0,2 ms statt 1 ms) gab dadurch 89 statt der für alle anderen, größeren
// Einträge üblichen ~20 Punkte (Nutzer-Feedback samt Screenshot). Mit 1 verschwindet dieser
// Effekt für praktisch den gesamten Datensatz (Istwert ≥ 2 reicht dafür schon), nur die
// allerkleinsten Werte (Kamerablitz, Mückenflügelschlag) bleiben minimal großzügiger als der
// Rest. dleRoutes.js reicht dies als dritten Parameter an scoreGuess weiter,
// DuratidleRound.jsx im Frontend hält denselben Wert als eigene Konstante.
const MIN_TOLERANCE_DURATION = 1;

module.exports = { id: 'duratidle', unit: '', ROUNDS_PER_GAME, dailyRounds, practiceRounds, minTolerance: MIN_TOLERANCE_DURATION };
