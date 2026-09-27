// data/tribes.js — die 14 Stämme des Moor-Zirkels + Register aller Stämme (alle Zirkel).
// Namen/Identitätstexte stehen in i18n/de.js (tribes.<id>).
import { GEZEITEN_TRIBES } from "./gezeiten/tribes.js";

// color = Akzentfarbe (leuchtende Augen, Rahmenakzent), silhouettes = Artwork-Familien, preferred = typische Kosten.

/** @type {Array<{ id: import("../engine/types.js").Tribe, color: string, silhouettes: string[], preferred: string[] }>} */
export const TRIBES = [
  { id: "bestien", color: "#c8643a", silhouettes: ["quadruped"], preferred: ["blood"] },
  { id: "nachtvoegel", color: "#7d8fc4", silhouettes: ["bird"], preferred: ["blood"] },
  { id: "aasfresser", color: "#a39a5a", silhouettes: ["bird", "quadruped"], preferred: ["bones"] },
  { id: "schwaerme", color: "#c9a23a", silhouettes: ["insect"], preferred: ["blood", "wax"] },
  { id: "tiefe", color: "#3f8c93", silhouettes: ["fish"], preferred: ["blood"] },
  { id: "kriecher", color: "#6fa04a", silhouettes: ["serpent"], preferred: ["bones"] },
  { id: "nager", color: "#b08466", silhouettes: ["rodent"], preferred: ["blood"] },
  { id: "myzel", color: "#b46aa8", silhouettes: ["fungus"], preferred: ["bones"] },
  { id: "wurzelvolk", color: "#7c9a52", silhouettes: ["root"], preferred: ["wax"] },
  { id: "gebeine", color: "#d8d2bd", silhouettes: ["skeleton"], preferred: ["bones"] },
  { id: "kerzenwesen", color: "#f2b54a", silhouettes: ["candle"], preferred: ["wax"] },
  { id: "gehoernte", color: "#b5763c", silhouettes: ["horned"], preferred: ["blood"] },
  { id: "flatterer", color: "#9b7fd0", silhouettes: ["moth"], preferred: ["wax"] },
  { id: "stammlose", color: "#8e8a80", silhouettes: ["construct"], preferred: ["blood", "bones", "wax"], neutral: true },
].map((t) => ({ ...t, zirkel: "moor" }));

/** Stamm-IDs des Moor-Zirkels (Altcode; zirkelbewusst: tribeIdsOf). */
export const TRIBE_IDS = TRIBES.map((t) => t.id);

/** Alle Stämme aller Zirkel. */
export const ALL_TRIBES = [...TRIBES, ...GEZEITEN_TRIBES];

/** @type {Record<string, any>} */
export const TRIBE_BY_ID = Object.fromEntries(ALL_TRIBES.map((t) => [t.id, t]));

/** Stamm-IDs eines Zirkels. @param {string} [zirkel] */
export function tribeIdsOf(zirkel = "moor") {
  return ALL_TRIBES.filter((t) => t.zirkel === zirkel).map((t) => t.id);
}
