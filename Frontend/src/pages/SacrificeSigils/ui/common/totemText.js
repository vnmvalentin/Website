// ui/common/totemText.js — Beschreibung eines Totems (Kopf + Basis) als Text.
import { de } from "../../i18n/de.js";
import { getZirkel } from "../../engine/zirkel/index.js";

/** Name der Nebendeck-Karte eines Zirkels (Moorling, Strandkrabbe). @param {string} [zirkel] */
export function sideName(zirkel) {
  return de.sides[Object.keys(getZirkel(zirkel).sideDeckTypes)[0]]?.name || de.sides.moorling.name;
}

/** Kurzname eines Kopfes ohne Art („Aschwölfe“, „Lane 2“, „Moorling“). @param {any} head @param {string} [zirkel] */
export function headName(head, zirkel) {
  if (head.kind === "tribe") return de.tribes[head.tribe].name;
  if (head.kind === "lane") return de.totems.lane(head.lane);
  return sideName(zirkel);
}

/** Kopf mit Art („Stammkopf: …“). */
export function headLabel(head) {
  if (head.kind === "tribe") return `${de.totems.tribeHead}: ${headName(head)}`;
  if (head.kind === "lane") return `${de.totems.laneHead}: ${headName(head)}`;
  return de.totems.sideHead;
}

/** Name des Totem-Platzes. @param {"tribe"|"lane"|"side"} slot */
export function slotLabel(slot) {
  return slot === "tribe" ? de.totems.tribeSlot : slot === "lane" ? de.totems.laneSlot : de.totems.sideSlot;
}

/** Beschreibung eines Totems (Kopf + Basis). @param {any} head @param {any} base @param {string} [zirkel] */
export function totemText(head, base, zirkel) {
  const baseName = base.kind === "sigil" ? de.sigils[base.sigil].name : de.totems.props[base.prop].name;
  if (head.kind === "tribe") return de.totems.tribeAura(de.tribes[head.tribe].name, baseName);
  if (head.kind === "side") return de.totems.sideAura(baseName, sideName(zirkel));
  return base.kind === "sigil" ? de.totems.laneAura(head.lane, baseName) : `${de.totems.lane(head.lane)}: ${de.totems.props[base.prop].desc}`;
}
