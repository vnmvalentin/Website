// inventiondle.js — "Der Zeitstrahl": rate das exakte Erfindungsjahr, von der Keilschrift bis
// zum ersten Touchscreen-Smartphone. Mechanisch identisch zu Tempdle/Velocidle (eine Zahl auf
// einer Skala schätzen) — nur die geratene Größe ist ein Jahr statt °C oder km/h.
//
// `value` ist ein Kalenderjahr, negativ für v. Chr. (z.B. -3500 fürs Rad). Ein fester
// Nullpunkt (Jahr 0, der Übergang v. Chr./n. Chr.) ist hier — genau wie 0°C bei Tempdle —
// ein echter, bedeutungsvoller Bezugspunkt, kein beliebig gewählter: die Skala in
// InventiondleRound.jsx nutzt deshalb dieselbe an einer festen Mitte gespiegelte
// Log-Skala aus guessWindow.js wie Tempdle (centeredWindow/centeredNormPos).
//
// Datensatz: inventiondle-entries.json, von Hand kuratiert. Bewusst nur gut belegte,
// vergleichsweise unstrittige Erfindungen/Entdeckungen mit einem einzelnen, breit
// akzeptierten Jahr — viele "Wer hat's erfunden"-Fragen sind in Wahrheit strittig
// (mehrere unabhängige Entdecker, schrittweise Entwicklung ohne klaren Stichtag); solche
// Fälle wurden bewusst gemieden, damit die "richtige" Antwort nicht selbst angreifbar ist.
const entries = require('../../data/inventiondle-entries.json');
const { seededPick, todayDateKey } = require('../dailySeed');

const ROUNDS_PER_GAME = 5;

const pool = entries.map((e) => ({
  id: `inventiondle-${e.id}`,
  category: 'invention',
  label: e.label,
  description: e.description,
  value: e.year,
  image: e.image || null,
}));

function buildRounds(seedStr) {
  return seededPick(pool, ROUNDS_PER_GAME, seedStr).map((entry, index) => ({ index, ...entry }));
}

// Tagesrätsel: exakt reproduzierbar aus (Spiel-ID, Datum) — siehe dailySeed.js.
function dailyRounds(dateKey = todayDateKey()) {
  return { dateKey, rounds: buildRounds(`inventiondle:${dateKey}`) };
}

// Übungsmodus: neue zufällige Runden bei jedem Aufruf, zählt nicht für die Bestenliste.
function practiceRounds() {
  return { rounds: buildRounds(`inventiondle:practice:${Date.now()}:${Math.random()}`) };
}

// Die Deckelung des Reglerfensters (kein Jahr in der Zukunft) lebt rein im Frontend
// (InventiondleRound.jsx's WINDOW_OPTIONS) — sie betrifft nur die Regler-DARSTELLUNG.
//
// `answerType: 'year'` (statt der Standard-Zahlenformel aus core/scoring.js, siehe
// dleRoutes.js) — core/yearScoring.js dort für die Begründung: ein Kalenderjahr hat keinen
// echten Nullpunkt, die normale Toleranzformel (0,5 × |Istwert|) machte moderne Jahreszahlen
// praktisch beliebig ungenau ratbar.
module.exports = { id: 'inventiondle', unit: '', answerType: 'year', ROUNDS_PER_GAME, dailyRounds, practiceRounds };
