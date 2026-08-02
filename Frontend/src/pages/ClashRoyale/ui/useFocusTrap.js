// Fokus in einem Overlay halten, solange es offen ist.
//
// Modals und der Host-Drawer legen sich über die Seite. Ohne diese Klammer wandert der
// Tab-Fokus dahinter weiter — man tabbt sich unsichtbar durch die Lobby, während optisch
// ein Dialog offen ist. Der Hook übernimmt außerdem Escape und gibt den Fokus beim
// Schließen dorthin zurück, wo er herkam.

import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * @param {boolean}  active  Ob das Overlay gerade offen ist
 * @param {Function} onClose Wird bei Escape aufgerufen
 * @returns {React.RefObject} Ref für das Container-Element des Overlays
 */
export function useFocusTrap(active, onClose) {
  const containerRef = useRef(null);
  // In einem Ref statt in den Dependencies: sonst würde der Effekt bei jedem Render
  // neu aufgesetzt, weil onClose meist eine frische Inline-Funktion ist — und der
  // Fokus spränge dabei jedes Mal zurück auf das erste Element.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const previouslyFocused = document.activeElement;

    // Erstes bedienbares Element anspringen; notfalls den Container selbst
    const focusables = () => Array.from(container?.querySelectorAll(FOCUSABLE) || []);
    const first = focusables()[0];
    if (first) first.focus();
    else container?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      // Am Rand umlaufen statt aus dem Dialog herauszutabben
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Nur zurückgeben, wenn das Element noch im Dokument hängt
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return containerRef;
}
