// Geteilte Zustandsmaschine für die Seitenwechsel-Animation der Paginierung — von
// WinTrackerOverlayPage.jsx UND OverlayPreview.jsx genutzt (Pixel-Parität, dieselbe Regel wie bei
// useMeasuredWidth/useBlockHeights: eine Kopie statt zwei, die auseinanderlaufen könnten).
//
// Ablauf pro Zyklus: idle (Seite steht) -> out (aktive Seite gleitet nach links raus) -> kurze
// Lücke ohne sichtbaren Inhalt (fühlt sich sonst wie ein Hard-Cut mit Ruckler an, kein
// Überlappen zweier Seiten gleichzeitig, wie ausdrücklich gewünscht) -> Inhalt wird auf die NEUE
// Seite umgeschaltet, dabei UNSICHTBAR (weit rechts) positioniert, OHNE Transition (kein
// sichtbarer Sprung) -> im nächsten Frame Transition wieder an und auf 0 gesetzt -> "in" gleitet
// von rechts rein -> zurück zu idle.
import { useEffect, useState } from "react";

export const SLIDE_MS = 320;
export const GAP_MS = 90;

/**
 * @returns `{ index, phase, offsetPct, transitionOn }`
 *   index: welche Seite gerade angezeigt wird (0-basiert)
 *   phase: 'idle' | 'out' | 'in' — nur für Debug/Styling-Zwecke nach außen sichtbar
 *   offsetPct: aktuelle horizontale Verschiebung in % der eigenen Breite (an transform:translateX anlegen)
 *   transitionOn: ob die CSS-Transition gerade aktiv sein soll (false = sofortiger Sprung, für den
 *     unsichtbaren Reset auf die Startposition der einlaufenden Seite)
 */
export function usePagedTransition(pageCount, intervalMs, enabled) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState("idle");
  const [offsetPct, setOffsetPct] = useState(0);
  const [transitionOn, setTransitionOn] = useState(false);

  // Bei Deaktivierung/zu wenigen Seiten sauber auf den Ruhezustand zurückfallen, statt mitten in
  // einer Animation stehenzubleiben.
  useEffect(() => {
    if (enabled && pageCount > 1) return undefined;
    setPhase("idle");
    setOffsetPct(0);
    setTransitionOn(false);
    setIndex((i) => (pageCount ? i % pageCount : 0));
    return undefined;
  }, [enabled, pageCount]);

  useEffect(() => {
    if (!enabled || pageCount <= 1) return undefined;
    let raf = null;
    const timers = [];
    const schedule = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };

    const tick = () => {
      // 1) Aktive Seite nach links raus.
      setTransitionOn(true);
      setPhase("out");
      setOffsetPct(-100);

      schedule(() => {
        // 2) Lücke ist vorbei: Inhalt umschalten, dabei UNSICHTBAR weit rechts positionieren,
        // Transition dafür kurz aus (kein sichtbarer Sprung durchs Bild).
        setTransitionOn(false);
        setIndex((i) => (i + 1) % pageCount);
        setPhase("in");
        setOffsetPct(100);

        raf = requestAnimationFrame(() => {
          raf = requestAnimationFrame(() => {
            // 3) Zwei rAF-Schritte, damit der Browser die Sprung-Position sicher gerendert hat,
            // bevor die Transition wieder an geht — sonst überspringt er manchmal den Sprung UND
            // die Transition in einem Bildlauf (dann "gleitet" nichts sichtbar).
            setTransitionOn(true);
            setOffsetPct(0);
            schedule(() => setPhase("idle"), SLIDE_MS);
          });
        });
      }, SLIDE_MS + GAP_MS);
    };

    const t = setInterval(tick, intervalMs);
    return () => {
      clearInterval(t);
      timers.forEach(clearTimeout);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled, pageCount, intervalMs]);

  return { index, phase, offsetPct, transitionOn };
}
