// pages/PublicProfile/visitenkarte.js — kleine Helfer für Visitenkarte und Editor, ohne React (Tests: node --test).

export const VITRINE_MAX = 6; // wie Backend/profile/profileRoutes.js

const locale = (lang) => (lang === "en" ? "en-US" : "de-DE");

/** Zahl mit Tausendertrennung in der Sprache der Seite */
export function zahl(n, lang = "de") {
  return (Number(n) || 0).toLocaleString(locale(lang));
}

/**
 * Bestwert anzeigen. art "zeit": Millisekunden → 1:23,45 (Englisch 1:23.45), ab einer Stunde 1:02:03;
 * art "zahl": Tausendertrennung.
 */
export function formatiereBestwert(art, wert, lang = "de") {
  const w = Math.max(0, Math.round(Number(wert) || 0));
  if (art !== "zeit") return zahl(w, lang);
  const komma = lang === "en" ? "." : ",";
  const std = Math.floor(w / 3_600_000);
  const min = Math.floor((w % 3_600_000) / 60_000);
  const sek = Math.floor((w % 60_000) / 1000);
  const hundertstel = Math.floor((w % 1000) / 10);
  const zwei = (n) => String(n).padStart(2, "0");
  if (std > 0) return `${std}:${zwei(min)}:${zwei(sek)}`;
  return `${min}:${zwei(sek)}${komma}${zwei(hundertstel)}`;
}

/** Eintrag `index` um `delta` Plätze verschieben (neue Liste; außerhalb der Grenzen unverändert) */
export function verschiebe(liste, index, delta) {
  const ziel = index + delta;
  if (index < 0 || index >= liste.length || ziel < 0 || ziel >= liste.length) return liste;
  const neu = [...liste];
  const [x] = neu.splice(index, 1);
  neu.splice(ziel, 0, x);
  return neu;
}

/** Abzeichen in die Vitrine oder heraus. @returns {{ vitrine: string[], voll: boolean }} */
export function schalteVitrine(vitrine, key, max = VITRINE_MAX) {
  if (vitrine.includes(key)) return { vitrine: vitrine.filter((k) => k !== key), voll: false };
  if (vitrine.length >= max) return { vitrine, voll: true };
  return { vitrine: [...vitrine, key], voll: false };
}

/** Name eines Abzeichens oder Bestwerts ({ de, en } vom Server) in der Sprache der Seite */
export function nameIn(name, lang, ersatz = "") {
  if (!name || typeof name !== "object") return ersatz;
  return name[lang] || name.de || ersatz;
}
