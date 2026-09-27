// data/totems.js — Totem-Köpfe, Basen und Lanen-Eigenschaften. Texte in i18n/de.js (totems.*).
// Köpfe und Basen hängen vom Zirkel ab (allHeads(z) / allBases(z)); ohne Zirkel gilt der Moor-Zirkel.
import { tribeIdsOf } from "./tribes.js";

/**
 * Lanen-Eigenschaften: funktionieren nur mit einem Lanenkopf.
 * Die Wirkung wertet die Kampf-Engine aus (battle.js → laneProp).
 */
export const LANE_PROPS = ["doppelknochen", "wut", "heilig", "blutquelle", "wegzoll", "aufmarsch"];

/** Moor: Sigils, die als Totem-Basis erlaubt sind (Aura-taugliche Sigils, siehe sigils/index.js → aura). */
export const TOTEM_BASE_SIGILS = [
  "schwinge", "hochwuchs", "fluchtreflex", "wucht", "aderlass", "durchbohren", "hinterhalt", "rudelruf",
  "rachsucht", "ruestungsbrecher", "dornenkleid", "schildrinde", "panzer", "leibwaechter", "moosheilung",
  "knochenmark", "aschenspende", "wachsquelle", "faeulnis", "stinkdruese", "leittier",
];

/**
 * Runde 3: Nebendeck-Totem (wie der Eichhörnchen-Kopf in Inscryption). Das Nebendeck ist für alle gleich (Moorling);
 * der Nebendeck-Kopf gibt jedem gezogenen Moorling ein Sigil. Opfer-Sigils (Doppelblut, Wachsgabe, Leichtes Mark)
 * gibt es NUR für diesen Kopf — auf einem ganzen Stamm wären sie zu stark.
 * Balancing (5000 Matches, KI normal): Dreifachblut auf jedem Moorling gewann 56,0 % der Kämpfe → Doppelblut (54,5 %).
 * Ewiges Opfer fehlt absichtlich: ein unsterblicher Moorling bezahlt jede 1-Blut-Karte umsonst.
 * Hochwuchs, Fluchtreflex und Leibwächter fehlen: ein 0/1 überlebt keinen Treffer (42–43 % in denselben Läufen).
 */
export const SIDE_ONLY_SIGILS = ["doppelblut", "wachsgabe", "markleicht", "salzgabe"];
/** Moor: Basen für den Nebendeck-Kopf. */
export const SIDE_TOTEM_SIGILS = [
  "doppelblut", "wachsgabe", "markleicht", "aschenspende", "knochenmark", "dornenkleid", "stinkdruese", "schildrinde",
];

/** Gezeiten: Totem-Basen (Grund-Auren ohne Moos/Wachs + Gezeiten-Auren). */
export const GEZEITEN_TOTEM_BASE_SIGILS = [
  "schwinge", "hochwuchs", "fluchtreflex", "wucht", "aderlass", "durchbohren", "hinterhalt", "rudelruf", "rachsucht",
  "ruestungsbrecher", "dornenkleid", "schildrinde", "panzer", "leibwaechter", "knochenmark", "aschenspende", "faeulnis",
  "stinkdruese", "leittier", "brandung", "gezeitenschild", "salzkruste", "salzader", "perle", "tintenwolke", "schlick", "anker",
];
/**
 * Gezeiten: Basen für den Nebendeck-Kopf (Strandkrabbe). Salzgabe ersetzt Wachsgabe, Perle gibt Salz beim Tod.
 * Dornenkleid (42 %) und Stinkdrüse (38 %) fehlen: auf einer 0/1-Krabbe zu schwach (Gezeiten-Lauf, 5000 Matches).
 */
export const GEZEITEN_SIDE_TOTEM_SIGILS = [
  "doppelblut", "salzgabe", "markleicht", "perle", "aschenspende", "knochenmark", "schildrinde",
];

/** Alle Basen, die auf einem Nebendeck-Kopf erlaubt sind (über alle Zirkel). */
const ANY_SIDE_SIGIL = new Set([...SIDE_TOTEM_SIGILS, ...GEZEITEN_SIDE_TOTEM_SIGILS]);

/**
 * @typedef {{ kind: "tribe", tribe: string } | { kind: "lane", lane: number } | { kind: "side" }} TotemHead
 * @typedef {{ kind: "sigil", sigil: string } | { kind: "prop", prop: string }} TotemBase
 */

/** @param {any} [z] Zirkel-Paket @returns {TotemHead[]} */
export function allHeads(z) {
  return [
    ...tribeIdsOf(z?.id || "moor").map((tribe) => ({ kind: "tribe", tribe })),
    ...[0, 1, 2, 3].map((lane) => ({ kind: "lane", lane })),
    { kind: "side" },
  ];
}

/** @param {any} [z] Zirkel-Paket @returns {TotemBase[]} */
export function allBases(z) {
  const sigils = [...new Set([...(z?.totemBaseSigils || TOTEM_BASE_SIGILS), ...(z?.sideTotemSigils || SIDE_TOTEM_SIGILS)])];
  return [
    ...sigils.map((sigil) => ({ kind: "sigil", sigil })),
    ...LANE_PROPS.map((prop) => ({ kind: "prop", prop })),
  ];
}

/** @param {TotemHead} a @param {TotemHead} b */
export function sameHead(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "tribe") return a.tribe === /** @type {any} */ (b).tribe;
  if (a.kind === "lane") return a.lane === /** @type {any} */ (b).lane;
  return true;
}

/** @param {TotemBase} a @param {TotemBase} b */
export function sameBase(a, b) {
  return a.kind === b.kind && (a.kind === "sigil" ? a.sigil === /** @type {any} */ (b).sigil : a.prop === /** @type {any} */ (b).prop);
}

/** Totem-Platz eines Kopfes. @param {TotemHead} head @returns {"tribe"|"lane"|"side"} */
export function totemSlot(head) {
  return head.kind;
}

/**
 * Passen Kopf und Basis zusammen? Gibt einen Fehler-Schlüssel zurück oder null.
 * @param {TotemHead} head @param {TotemBase} base @param {any} [z] Zirkel-Paket: Nebendeck-Basen aus dessen Liste
 */
export function combineError(head, base, z) {
  if (base.kind === "prop") return head.kind === "lane" ? null : "propNeedsLane";
  if (head.kind === "side") return (z ? z.sideTotemSigils.includes(base.sigil) : ANY_SIDE_SIGIL.has(base.sigil)) ? null : "notForSide";
  return SIDE_ONLY_SIGILS.includes(base.sigil) ? "sideOnlyBase" : null;
}
