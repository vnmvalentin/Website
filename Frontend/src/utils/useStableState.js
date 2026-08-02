// useStableState — State, der sich nur ändert, wenn die Daten wirklich neu sind.
//
// Hintergrund: Die OBS-Overlays pollen ihre Route im Sekundentakt und laufen dabei
// stunden- bis tagelang durch. Wird das Ergebnis ungeprüft in den State geschrieben,
// rendert React bei jedem Durchlauf den kompletten Baum neu — auch wenn sich seit
// dem letzten Mal nichts geändert hat. Bei einem Bingo-Overlay mit 800 ms Takt sind
// das über 100.000 überflüssige Renderdurchläufe pro Tag, auf demselben Rechner, auf
// dem gleichzeitig gestreamt wird.
//
// Der Vergleich über JSON.stringify ist bewusst simpel: Die Payloads sind wenige
// Kilobyte groß und der Vergleich läuft höchstens einmal pro Sekunde — das ist um
// Größenordnungen billiger als ein Re-Render. Voraussetzung ist, dass die Route
// ihre Felder in stabiler Reihenfolge liefert, was bei JSON aus SQLite/JS-Objekten
// der Fall ist.
import { useCallback, useRef, useState } from "react";

/**
 * @param {*} initial Startwert
 * @returns {[*, (next: *) => void]} wie useState, aber der Setter ignoriert
 *          inhaltsgleiche Werte
 */
export function useStableState(initial) {
  const [value, setValue] = useState(initial);
  const rawRef = useRef(undefined);

  const setIfChanged = useCallback((next) => {
    let raw;
    try {
      raw = JSON.stringify(next);
    } catch {
      // Zirkuläre Struktur o.ä. — dann lieber setzen als schlucken
      setValue(next);
      return;
    }
    if (raw === rawRef.current) return;
    rawRef.current = raw;
    setValue(next);
  }, []);

  return [value, setIfChanged];
}
