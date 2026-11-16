// Uhr der Auktions-Auflösung in der 2D-Ansicht.
//
// WARUM ES SIE GIBT: Früher steuerten allein CSS-Verzögerungen, wann ein Gebot, der Stempel oder der Gewinner
// erscheint. Sind Animationen abgeschaltet oder läuft der Browser ohne Hardwarebeschleunigung (dann setzt
// html[data-low-gfx] jede Verzögerung auf 0), stand deshalb sofort alles da — während die Töne und die
// Mitspieler in 3D noch Karte für Karte auflösten. Jetzt entscheidet diese Uhr, was schon im Bild sein darf;
// das CSS bewegt nur noch, was gerade erscheint.

import { useEffect, useRef, useState } from 'react';

/**
 * @param {string|null} key    wechselt, wenn eine Auflösung (neu) beginnt; null = keine läuft
 * @param {number[]} marks     Zeitpunkte in Sekunden ab Beginn, an denen sich etwas ändert
 * @returns {number} die zuletzt erreichte Marke in Sekunden; -1, solange noch keine erreicht ist
 */
export function useRevealClock(key, marks) {
  const [state, setState] = useState({ key: null, t: -1 });
  // Die Marken stehen mit Beginn der Auflösung fest — gelesen wird der Stand beim Start
  const marksRef = useRef(marks);
  marksRef.current = marks;

  useEffect(() => {
    if (key == null) return undefined;
    const sorted = [...new Set(marksRef.current.filter((m) => Number.isFinite(m)))].sort((a, b) => a - b);
    const timers = sorted.map((m) => setTimeout(() => setState({ key, t: m }), Math.max(0, m * 1000)));
    return () => timers.forEach(clearTimeout);
  }, [key]);

  return key != null && state.key === key ? state.t : -1;
}
