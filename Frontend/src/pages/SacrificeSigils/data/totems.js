// data/totems.js — Totem-Köpfe, Basen und Lanen-Eigenschaften. Texte in i18n/de.js (totems.*).
import { TRIBE_IDS } from "./tribes.js";

/**
 * Lanen-Eigenschaften: funktionieren nur mit einem Lanenkopf.
 * Die Wirkung wertet die Kampf-Engine aus (battle.js → laneProp).
 */
export const LANE_PROPS = ["doppelknochen", "wut", "heilig", "blutquelle", "wegzoll", "aufmarsch"];

/** Sigils, die als Totem-Basis erlaubt sind (Aura-taugliche Sigils, siehe sigils/index.js → aura). */
export const TOTEM_BASE_SIGILS = [
  "schwinge", "hochwuchs", "fluchtreflex", "wucht", "aderlass", "durchbohren", "hinterhalt", "rudelruf",
  "rachsucht", "ruestungsbrecher", "dornenkleid", "schildrinde", "panzer", "leibwaechter", "moosheilung",
  "knochenmark", "aschenspende", "wachsquelle", "faeulnis", "stinkdruese", "leittier",
];

/**
 * @typedef {{ kind: "tribe", tribe: string } | { kind: "lane", lane: number }} TotemHead
 * @typedef {{ kind: "sigil", sigil: string } | { kind: "prop", prop: string }} TotemBase
 */

/** @returns {TotemHead[]} */
export function allHeads() {
  return [
    ...TRIBE_IDS.map((tribe) => ({ kind: "tribe", tribe })),
    ...[0, 1, 2, 3].map((lane) => ({ kind: "lane", lane })),
  ];
}

/** @returns {TotemBase[]} */
export function allBases() {
  return [
    ...TOTEM_BASE_SIGILS.map((sigil) => ({ kind: "sigil", sigil })),
    ...LANE_PROPS.map((prop) => ({ kind: "prop", prop })),
  ];
}

/** @param {TotemHead} a @param {TotemHead} b */
export function sameHead(a, b) {
  return a.kind === b.kind && (a.kind === "tribe" ? a.tribe === b.tribe : a.lane === b.lane);
}

/** @param {TotemBase} a @param {TotemBase} b */
export function sameBase(a, b) {
  return a.kind === b.kind && (a.kind === "sigil" ? a.sigil === b.sigil : a.prop === b.prop);
}
