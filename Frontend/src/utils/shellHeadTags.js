// shellHeadTags.js — Kopf-Angaben der ausgelieferten HTML-Datei aufräumen, sobald React (components/SEO.jsx) eigene setzt.
//
// Die Datei vom Server bringt schon Titel, Canonical, robots usw. mit: die vorgerenderte Seite selbst oder — für jede
// Adresse ohne eigene Datei — die vorgerenderte Startseite als Hülle. React 19 hängt seine Tags NEBEN diese, ohne sie zu
// ersetzen; danach stünden zwei Titel, Canonicals und robots-Angaben im Kopf, und Google verwirft widersprüchliche
// Canonicals ganz.

// Genau die Tags, die SEO.jsx selbst setzt
const SHELL_HEAD_TAGS = [
  "title", 'meta[name="description"]', 'meta[name="keywords"]', 'meta[name="robots"]',
  'link[rel="canonical"]', 'link[rel="alternate"][hreflang]', 'meta[property^="og:"]', 'meta[name^="twitter:"]',
].map((s) => `head > ${s}`).join(",");

/**
 * Markiert die Kopf-Angaben der ausgelieferten Datei. Muss VOR dem ersten Rendern laufen (main.jsx): dann gibt es noch
 * keine Tags von React, und removeShellHeadTags trifft garantiert nur fremde Elemente — nie eins, das React verwaltet.
 */
export function markShellHeadTags() {
  if (typeof document === "undefined") return;
  document.querySelectorAll(SHELL_HEAD_TAGS).forEach((el) => el.setAttribute("data-shell", ""));
}

/** Entfernt die markierten Tags; aufgerufen, sobald SEO.jsx die eigenen eingefügt hat. */
export function removeShellHeadTags() {
  if (typeof document === "undefined") return;
  document.querySelectorAll("head > [data-shell]").forEach((el) => el.remove());
}
