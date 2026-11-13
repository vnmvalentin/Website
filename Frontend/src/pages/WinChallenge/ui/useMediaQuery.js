// ui/useMediaQuery.js — ob eine CSS-Medienabfrage gerade zutrifft. Der Editor entscheidet damit,
// ob die Seitenleiste mit dem großen Timer Platz hat oder alles in eine schmale Leiste oben rückt.
import { useSyncExternalStore } from "react";

const hasMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

/**
 * @param {string} query  z. B. "(min-width: 1280px)"
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      if (!hasMatchMedia()) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => (hasMatchMedia() ? window.matchMedia(query).matches : false),
    () => false
  );
}
