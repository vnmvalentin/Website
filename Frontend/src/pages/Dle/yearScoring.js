// yearScoring.js — dedizierte Punkteformel für Inventiondle.
//
// WICHTIG: exaktes Duplikat von Backend/dle/core/yearScoring.js (siehe dort für die
// ausführliche Begründung, kurz: core/scoring.js' Toleranzformel 0,5 × |Istwert| ist für ein
// Kalenderjahr bedeutungslos — Jahr 0 ist kein physikalischer Nullpunkt wie km/h/°C/g/$, und
// bei modernen Jahreszahlen wie 2007 ergab das eine Toleranz von über 1000 Jahren). Hier
// verwendet, damit ein Ratewert direkt nach dem Klick bewertet werden kann, ohne auf eine
// Serverantwort zu warten. Der Server rechnet beim Einreichen unabhängig selbst nach — dieses
// Duplikat ist NIE die Quelle der in der Bestenliste gespeicherten Punktzahl. Ändert sich die
// Formel, unbedingt beide Seiten mitziehen.
const MIN_TOLERANCE_YEARS = 8;
const TOLERANCE_RATIO = 0.25;
const MAX_TOLERANCE_YEARS = 250;

export function toleranceForYear(actual, currentYear = new Date().getFullYear()) {
  const age = Math.max(Math.abs(currentYear - actual), 0);
  return Math.min(Math.max(age * TOLERANCE_RATIO, MIN_TOLERANCE_YEARS), MAX_TOLERANCE_YEARS);
}

// Exponentieller Abfall, dieselbe Grundform wie scoring.js.
export function scoreYearGuess(guess, actual, currentYear = new Date().getFullYear()) {
  const tolerance = toleranceForYear(actual, currentYear);
  const diff = Math.abs(guess - actual);
  const score = Math.round(100 * Math.exp(-diff / tolerance));
  return Math.max(0, Math.min(100, score));
}
