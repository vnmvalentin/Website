// useFontLink.js — lädt eine Google-Fonts-Datei einmal per <link> in den <head>.
//
// Vorher stand derselbe Effekt in 14 Dateien (jede Spiel-Hülle, Startseite, Overlays). Per <link> statt
// @import, weil ein @import im Build mitten in der CSS-Datei landet, wo Browser ihn ignorieren.
// Der Link bleibt nach dem Verlassen stehen: die Schrift ist dann im Cache und ein Zurückkehren blitzt nicht.
import { useEffect } from "react";

/** @param {string} href  vollständige Adresse (fonts.googleapis.com/css2?…) */
export function useFontLink(href) {
  useEffect(() => {
    if (!href || document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }, [href]);
}
