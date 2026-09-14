// probabildle.js — "Die Prozent-Skala": rate die statistische Wahrscheinlichkeit eines
// Ereignisses oder den prozentualen Anteil einer Eigenschaft, in Prozent (0-100 %).
//
// Datensatz: probabildle-entries.json, von Hand kuratiert (Wahrscheinlichkeit hat wie schon
// Tempdles Phänomene und Velocidles Einträge keine einzelne SPARQL-Kategorie, aus der sich
// "interessante, alltagsnahe" Werte sauber ziehen ließen). Bewusst NUR eine Handvoll wirklich
// winzige Werte (Lotto-Hauptgewinn, Royal Flush, …) als bekannte, ikonische Ausreißer — der
// große Rest bleibt in einem Bereich, den man mit Alltagswissen grob einschätzen kann, siehe
// dieselbe Lektion wie bei Tempdle/Velocidle (keine unschätzbaren Extremwerte).
//
// Anders als bei Tempdle (fester Nullpunkt, unbegrenzt nach oben und unten) oder Velocidle
// (Nullpunkt, unbegrenzt nach oben) ist Prozent auf beiden Seiten hart begrenzt: 0 % und
// 100 % sind echte, bedeutungsvolle Ränder. Die Rundenauswahl/Skalenlogik dafür lebt im
// Frontend als eigene, beidseitig gespiegelte Log-Skala mit fester Mitte bei 50 %ip (siehe
// ProbabildleRound.jsx) — strukturell verwandt mit Tempdles Skala, nur dass dort der
// Nullpunkt selbst der Bezug ist und hier die beiden Ränder 0 %/100 % es sind. Die
// Punkteformel (core/scoring.js) ist unverändert übernommen — sie arbeitet unit-agnostisch
// nur mit |Istwert| und Differenz.
const entries = require('../../data/probabildle-entries.json');
const { seededPick, todayDateKey } = require('../dailySeed');

const ROUNDS_PER_GAME = 5;

const pool = entries.map((e) => ({
  id: `probabildle-${e.id}`,
  category: 'probability',
  label: e.label,
  description: e.description,
  value: e.valuePercent,
  image: e.image || null,
}));

function buildRounds(seedStr) {
  return seededPick(pool, ROUNDS_PER_GAME, seedStr).map((entry, index) => ({ index, ...entry }));
}

// Tagesrätsel: exakt reproduzierbar aus (Spiel-ID, Datum) — siehe dailySeed.js.
function dailyRounds(dateKey = todayDateKey()) {
  return { dateKey, rounds: buildRounds(`probabildle:${dateKey}`) };
}

// Übungsmodus: neue zufällige Runden bei jedem Aufruf, zählt nicht für die Bestenliste.
function practiceRounds() {
  return { rounds: buildRounds(`probabildle:practice:${Date.now()}:${Math.random()}`) };
}

// Deutlich kleiner als die geteilte Standard-Mindesttoleranz (core/scoring.js' MIN_TOLERANCE
// = 7) — auf der hart begrenzten 0-100-%-Skala sind 7 Prozentpunkte 14 % des GESAMTEN
// Wertebereichs, wodurch jede Schätzung nahe 0 % (bzw. 100 %) bei kleinen (bzw. großen)
// Istwerten fast automatisch ~100 Punkte gab — unabhängig von tatsächlicher Genauigkeit
// (Nutzer-Feedback, siehe core/scoring.js-Kommentar zu MIN_TOLERANCE). dleRoutes.js reicht
// dies als dritten Parameter an scoreGuess weiter, ProbabildleRound.jsx im Frontend hält
// denselben Wert als eigene Konstante (siehe dortiger Kommentar).
const MIN_TOLERANCE_PERCENT = 2;

module.exports = { id: 'probabildle', unit: '%', ROUNDS_PER_GAME, dailyRounds, practiceRounds, minTolerance: MIN_TOLERANCE_PERCENT };
