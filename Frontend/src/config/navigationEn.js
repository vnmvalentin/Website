// config/navigationEn.js — englische Texte der Seitenliste (navigation.js) für Kopf, Menü, Verzeichnis, Übersichtsseiten
// und Startseite. Eigene Datei, damit navigation.js für alle Spuren nur hinzufügend wächst.
//
// Neuer Eintrag in navigation.js → hier dieselbe Kennung ergänzen (id, sonst href bzw. action); fehlt sie, steht dort
// Deutsch, und der Test pages/Website/__tests__/huelle.test.js meldet sie. Die Texte selbst stehen in navigationEnTexte.js.
import { NAV_CATEGORIES } from "./navigation.js";
import { NAV_EN } from "./navigationEnTexte.js";

export { NAV_EN };

/** Kennung eines Eintrags für die Übersetzung: id, sonst href, sonst action */
export const navKennung = (link) => link.id || link.href || link.action || link.to || link.label;

const zwischenspeicher = new Map();

/** Die Seitenliste in einer Sprache — gleiche Form wie NAV_CATEGORIES; je Sprache immer dasselbe Objekt */
export function navigationFuer(lang) {
  if (lang !== "en") return NAV_CATEGORIES;
  if (zwischenspeicher.has(lang)) return zwischenspeicher.get(lang);
  const liste = NAV_CATEGORIES.map((c) => ({
    ...c,
    ...(NAV_EN.kategorien[c.key] || {}),
    links: c.links.map((l) => ({ ...l, ...(NAV_EN.links[navKennung(l)] || {}) })),
  }));
  zwischenspeicher.set(lang, liste);
  return liste;
}

export const kategorieFuer = (key, lang) => navigationFuer(lang).find((c) => c.key === key) || null;

/** Wie showcaseLinks() in navigation.js, in der gewünschten Sprache */
export function showcaseLinksFuer(lang) {
  return navigationFuer(lang).flatMap((c) => c.links.filter((l) => l.id && l.to && !l.soon && !l.locked).map((l) => ({ ...l, category: c.key })));
}
