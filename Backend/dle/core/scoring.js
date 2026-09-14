// scoring.js — Punkteformel für alle "Zahl auf einer Skala raten"-Spiele (Tempdle, Velocidle,
// Probabildle, Duratidle, Inventiondle, Pricedle, Balancdle).
//
// WICHTIG: Ein exaktes Duplikat dieser Datei liegt im Frontend
// (Frontend/src/pages/Dle/scoring.js) für sofortiges Feedback direkt nach jeder Runde, ohne
// auf eine Serverantwort zu warten. Der Server rechnet beim Einreichen (POST /submit)
// trotzdem selbst nach — das Frontend-Duplikat ist NUR fürs Anzeigetempo, nie die
// Vertrauensquelle für die gespeicherte Bestenlisten-Punktzahl. Ändert sich die Formel hier,
// unbedingt im Frontend mitziehen.
//
// Toleranz skaliert mit |Istwert| × TOLERANCE_RATIO, mit einer Mindesttoleranz nahe 0 (siehe
// MIN_TOLERANCE) — und BEWUSST OHNE Obergrenze. Es gab hier zwischenzeitlich einen Umweg: eine
// Version mit fester Obergrenze (MAX_TOLERANCE = 500) machte riesige Werte (z.B. ein
// 109.000-$-Gegenstand) faktisch ungratbar, weil 500 davon nur 0,5 % ausmacht. Die Reparatur
// dafür (Toleranz stattdessen aus der pro Runde zufällig gezogenen Reglerfenster-Spanne
// ableiten, siehe guessWindow.js) hat dieses Problem zwar behoben, aber ein NEUES eingeführt:
// dieselbe Abweichung bei demselben Istwert ergab je nach Zufalls-Fenster unterschiedliche
// Punktzahlen — 30 g daneben bei einem 370-g-Gegenstand gab mal 97, mal deutlich weniger,
// rein nach Los der Fensterbreite. Das fühlte sich beim echten Spielen falsch an (User-
// Feedback: "man sollte wirklich nah rankommen für hohe Punkte", 30 g bei 370 g sollten
// ca. 85 Punkte geben, nicht 97). Die eigentliche Lösung war einfacher als gedacht: die feste
// Obergrenze ersatzlos WEGLASSEN, statt eine ganz neue (zufallsbehaftete) Toleranzquelle
// einzuführen — tolerance = |Istwert| × 0.5 skaliert dann von allein proportional mit,
// bei 3 genauso wie bei 300.000, ganz ohne Zufallskomponente. Das per-Runde zufällige
// Reglerfenster in guessWindow.js bleibt trotzdem bestehen — es steuert weiterhin sinnvoll
// die REGLER-AUFLÖSUNG (und verrät nicht die Antwort), hat mit der Punkteformel hier aber
// nichts mehr zu tun.
//
// MIN_TOLERANCE = 7 (nicht z.B. 25): bei kleinen Beträgen nah an 0 muss die Punkte-Spanne eng
// bleiben (siehe historisches Beispiel: bei "Speiseeis" nah an 0°C gab ein größerer Mindestwert
// trotz 9-12° Abweichung noch 60-70 Punkte, deutlich zu großzügig).
// TOLERANCE_RATIO = 0.5 (nicht z.B. 0.22): eine Schätzung 4 km/h neben 44,7 km/h (Usain Bolt)
// soll deutlich mehr als 65 Punkte geben (mit 0.5 sind es ca. 84).
// MIN_TOLERANCE optional pro Aufruf überschreibbar: Probabildle braucht eine deutlich
// KLEINERE Mindesttoleranz als 7, weil 7 Prozentpunkte auf einer hart begrenzten 0-100-%-
// Skala satte 14 % des gesamten Wertebereichs ausmachen — bei Istwerten unter ~14 % (bzw.
// über ~86 %) reichte praktisch jede Schätzung nahe 0 % (bzw. 100 %) für fast 100 Punkte,
// unabhängig davon, wie genau tatsächlich geraten wurde (Nutzer-Feedback: "beim Blitzschlag
// fast immer hohe Punktzahl, weil man einfach auf die kleinste Stelle gehen kann" — fühlte
// sich wie reines Raten an, nicht wie Schätzen). Siehe core/games/probabildle.js für den
// tatsächlich verwendeten Wert. Die anderen sechs Spiele behalten unverändert 7, weil ihre
// Wertebereiche real unbegrenzt sind (km/h, °C, g, $, Jahre) — 7 Einheiten sind dort nie ein
// so großer Anteil der gesamten Skala.
const MIN_TOLERANCE = 7;
const TOLERANCE_RATIO = 0.5;

function toleranceFor(actual, minTolerance = MIN_TOLERANCE) {
  return Math.max(Math.abs(actual) * TOLERANCE_RATIO, minTolerance);
}

// Exponentieller Abfall statt einer harten linearen Grenze auf 0: bei einem Treffer exakt
// auf der Toleranz gibt's noch ~37 Punkte, danach wird's schnell, aber sanft, weniger.
function scoreGuess(guess, actual, minTolerance = MIN_TOLERANCE) {
  const tolerance = toleranceFor(actual, minTolerance);
  const diff = Math.abs(guess - actual);
  const score = Math.round(100 * Math.exp(-diff / tolerance));
  return Math.max(0, Math.min(100, score));
}

module.exports = { toleranceFor, scoreGuess, MIN_TOLERANCE, TOLERANCE_RATIO };
