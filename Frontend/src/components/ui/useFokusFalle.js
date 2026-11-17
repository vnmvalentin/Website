// useFokusFalle.js — Fokus-Verhalten eines Fensters für Fenster, die ihr eigenes Aussehen behalten sollen (Handy-Menü,
// Feedback, System-Hinweis in Layout.jsx). Dialog.jsx macht dasselbe für Fenster im Website-Look.
//
// Solange `aktiv`: Fokus springt beim Öffnen ins Fenster, Tab und Umschalt+Tab bleiben darin, beim Schließen geht der
// Fokus zurück auf das Element, von dem aus geöffnet wurde. Escape regelt der Aufrufer selbst.
import { useEffect } from "react";

const FOKUSSIERBAR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const sichtbar = (el) => el.offsetParent !== null || el.getClientRects().length > 0;

/**
 * @param {{ current: HTMLElement | null }} ref   das Fenster
 * @param {boolean} aktiv
 * @param {object} [opts]
 * @param {string} [opts.start]   CSS-Auswahl für das erste Ziel (z. B. "textarea"); sonst das erste anspringbare Element
 */
export default function useFokusFalle(ref, aktiv, { start } = {}) {
  useEffect(() => {
    if (!aktiv) return undefined;
    const vorher = document.activeElement;
    const fenster = ref.current;
    if (!fenster) return undefined;
    const ziel = (start && fenster.querySelector(start)) || [...fenster.querySelectorAll(FOKUSSIERBAR)].find(sichtbar) || fenster;
    if (ziel === fenster && !fenster.hasAttribute("tabindex")) fenster.setAttribute("tabindex", "-1");
    ziel.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const teile = [...fenster.querySelectorAll(FOKUSSIERBAR)].filter(sichtbar);
      if (teile.length === 0) { e.preventDefault(); return; }
      const erstes = teile[0];
      const letztes = teile[teile.length - 1];
      const aktuell = document.activeElement;
      if (e.shiftKey && (aktuell === erstes || !fenster.contains(aktuell))) { e.preventDefault(); letztes.focus(); }
      else if (!e.shiftKey && (aktuell === letztes || !fenster.contains(aktuell))) { e.preventDefault(); erstes.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Zurück, wo man herkam — aber nur, wenn es das Element noch gibt und der Fokus nicht schon woanders steht
      const jetzt = document.activeElement;
      if (vorher && vorher.isConnected && (!jetzt || jetzt === document.body || fenster.contains(jetzt) || !jetzt.isConnected)) {
        vorher.focus({ preventScroll: true });
      }
    };
  }, [aktiv, ref, start]);
}
