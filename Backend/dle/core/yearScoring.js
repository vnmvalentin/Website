// yearScoring.js — dedizierte Punkteformel für Inventiondle, weil core/scoring.js' Formel
// (Toleranz = 0,5 × |Istwert|) für ein KALENDERJAHR schlicht falsch ist: Jahr 0 ist ein
// willkürlicher Epochenwechsel, keine physikalische Größe mit echtem Nullpunkt wie km/h, °C,
// g oder $. Bei einem modernen Erfindungsjahr wie 2007 ergibt 0,5 × 2007 eine Toleranz von
// über 1000 Jahren — dadurch gab z.B. "immer 1900 raten" quer über fast den gesamten
// Datensatz (1880er bis 2007) 90-100 Punkte, unabhängig von der tatsächlichen Genauigkeit
// (Nutzer-Feedback samt Durchrechnung: Durchschnitt 88 von 100 Punkten für diese eine feste
// Schätzung über alle n.-Chr.-Einträge hinweg).
//
// Lösung: die Toleranz richtet sich nach dem ALTER des Ereignisses (Abstand zum aktuellen
// Jahr), nicht nach der rohen Jahreszahl selbst. Ein Ereignis von vor 19 Jahren (iPhone, 2007)
// verdient eine enge Toleranz — present und gut dokumentiert, kein Grund für große Nachsicht.
// Ein Ereignis von vor über 5000 Jahren (Rad) verdient dagegen eine deutlich großzügigere,
// weil selbst die Forschung solche Daten nur grob eingrenzen kann. MAX_TOLERANCE_YEARS
// deckelt das nach oben, damit selbst uralte Erfindungen nicht zu "jede Schätzung ist
// ungefähr richtig" werden — anders als bei den anderen sechs Zahl-Spielen (siehe dortiger
// scoring.js-Kommentar zur bewusst fehlenden Obergrenze) ergibt eine Obergrenze hier
// tatsächlich Sinn, weil es für ein Kalenderjahr keine reale Größe gibt, die eine
// unbegrenzt wachsende Toleranz rechtfertigen würde.
const MIN_TOLERANCE_YEARS = 8;
const TOLERANCE_RATIO = 0.25;
const MAX_TOLERANCE_YEARS = 250;

function toleranceForYear(actual, currentYear = new Date().getFullYear()) {
  const age = Math.max(Math.abs(currentYear - actual), 0);
  return Math.min(Math.max(age * TOLERANCE_RATIO, MIN_TOLERANCE_YEARS), MAX_TOLERANCE_YEARS);
}

// Exponentieller Abfall, dieselbe Grundform wie core/scoring.js.
function scoreYearGuess(guess, actual, currentYear = new Date().getFullYear()) {
  const tolerance = toleranceForYear(actual, currentYear);
  const diff = Math.abs(guess - actual);
  const score = Math.round(100 * Math.exp(-diff / tolerance));
  return Math.max(0, Math.min(100, score));
}

module.exports = { toleranceForYear, scoreYearGuess, MIN_TOLERANCE_YEARS, TOLERANCE_RATIO, MAX_TOLERANCE_YEARS };
