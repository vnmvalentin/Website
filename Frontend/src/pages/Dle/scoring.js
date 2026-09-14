// scoring.js — Punkteformel für alle "Zahl auf einer Skala raten"-Spiele (Tempdle, Velocidle,
// Probabildle, Duratidle, Inventiondle, Pricedle, Balancdle).
//
// WICHTIG: exaktes Duplikat von Backend/dle/core/scoring.js. Hier verwendet, damit ein
// Ratewert direkt nach dem Klick bewertet werden kann, ohne auf eine Serverantwort zu
// warten (siehe TempdleRound.jsx & Co.). Der Server rechnet beim Einreichen (POST /submit)
// unabhängig selbst nach — dieses Duplikat ist NIE die Quelle der in der Bestenliste
// gespeicherten Punktzahl. Ändert sich die Formel, unbedingt beide Seiten mitziehen.
//
// Toleranz = |Istwert| × 0.5, mit Mindesttoleranz 7, BEWUSST OHNE Obergrenze — siehe
// Backend-Duplikat für die ausführliche Begründung (kurz: eine feste Obergrenze machte große
// Werte ungratbar, eine stattdessen vom zufälligen Reglerfenster abgeleitete Toleranz machte
// dieselbe Abweichung je nach Zufall unterschiedlich viele Punkte wert — beides unerwünscht).
//
// MIN_TOLERANCE optional pro Aufruf überschreibbar (siehe Backend-Duplikat): Probabildle
// braucht eine deutlich KLEINERE Mindesttoleranz als 7, weil 7 Prozentpunkte auf einer hart
// begrenzten 0-100-%-Skala satte 14 % des gesamten Wertebereichs ausmachen — bei Istwerten
// unter ~14 % (bzw. über ~86 %) reichte praktisch jede Schätzung nahe 0 % (bzw. 100 %) für
// fast 100 Punkte, unabhängig davon, wie genau tatsächlich geraten wurde (Nutzer-Feedback:
// "beim Blitzschlag fast immer hohe Punktzahl, weil man einfach auf die kleinste Stelle
// gehen kann" — fühlte sich wie reines Raten an, nicht wie Schätzen). Die anderen sechs
// Spiele behalten unverändert 7, weil ihre Wertebereiche real unbegrenzt sind (km/h, °C, g,
// $, Jahre) — 7 Einheiten sind dort nie ein so großer Anteil der gesamten Skala.
const MIN_TOLERANCE = 7;
const TOLERANCE_RATIO = 0.5;

export function toleranceFor(actual, minTolerance = MIN_TOLERANCE) {
  return Math.max(Math.abs(actual) * TOLERANCE_RATIO, minTolerance);
}

// Exponentieller Abfall statt harter linearer Grenze auf 0 — siehe Backend-Duplikat für die
// ausführliche Begründung.
export function scoreGuess(guess, actual, minTolerance = MIN_TOLERANCE) {
  const tolerance = toleranceFor(actual, minTolerance);
  const diff = Math.abs(guess - actual);
  const score = Math.round(100 * Math.exp(-diff / tolerance));
  return Math.max(0, Math.min(100, score));
}
