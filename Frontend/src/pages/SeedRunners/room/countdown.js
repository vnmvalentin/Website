// countdown.js — reiner Rechenkern des gemeinsamen Start-Countdowns (aus RaceView.jsx "Hauptschleife"
// und "Anzeige" herausgezogen, damit er ohne rAF/React direkt getestet werden kann).
//
// Zwei Zeitpunkte, bewusst getrennt:
//   · startPerf         DER tatsächliche Auslöser (löst den Lauf aus, sobald `now >= startPerf`). Wird JEDES
//                        Bild neu aus der aktuell besten Uhrenmessung berechnet — das hält ihn maximal genau.
//   · displayStartPerf  Die ANGEZEIGTE Grundlage für "3"/"2"/"1". Wird einmalig eingefroren, sobald sie zum
//                        ersten Mal ins sichtbare Fenster (≤ 3,05 s) fällt, und danach nicht mehr verändert.
//
// Ohne diese Trennung springt die angezeigte Zahl: Trifft NACH dem ersten Eintritt ins Fenster eine genauere
// Uhrenprobe ein, verschiebt sich der aus ihr direkt abgeleitete Rest-Wert — mal nach oben (die Zahl
// verschwindet wieder, "Gleich geht's los …" bleibt länger stehen als erwartet), mal nach unten (sie
// überspringt eine Stufe, z. B. direkt von "3" auf "1", oder beginnt erst bei "2"). Mit dem Einfrieren ist
// displayStartPerf ab dem ersten Eintritt fix, also zählt die Anzeige garantiert 3 → 2 → 1 ohne Sprung.

export const VISIBLE_WINDOW_MS = 3050;

/** startPerf für dieses Bild: Serverzeit `at` über den Uhrenabgleich `sync` auf die performance.now()-Skala
 * von `now` projiziert. `sync.toLocal` und `Date.now()` liegen auf derselben (Date.now-)Skala, `now`/das
 * Ergebnis auf der von `performance.now()` — die Differenzbildung macht das timebase-unabhängig. */
export function projectStartPerf(now, at, sync) {
  return now + (sync.toLocal(at) - Date.now());
}

/** Eingefrorenes displayStartPerf für dieses Bild: unverändert, sobald einmal gesetzt; sonst gesetzt, sobald
 * der Rest bis startPerf erstmals ins sichtbare Fenster fällt. `null`, solange es noch zu früh ist. */
export function freezeDisplayStart(prevDisplayStartPerf, now, startPerf) {
  if (prevDisplayStartPerf != null) return prevDisplayStartPerf;
  return startPerf - now <= VISIBLE_WINDOW_MS ? startPerf : null;
}

/** Angezeigte Zahl (3/2/1, als number) aus dem eingefrorenen displayStartPerf — oder null (dann zeigt die
 * Oberfläche "Gleich geht's los …" statt einer Zahl). */
export function countdownNumber(now, displayStartPerf) {
  if (displayStartPerf == null) return null;
  const remaining = (displayStartPerf - now) / 1000;
  return remaining > 0 && remaining <= VISIBLE_WINDOW_MS / 1000 ? Math.ceil(remaining - 0.05) : null;
}
