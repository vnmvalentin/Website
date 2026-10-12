// ui/common/totemText.js — Beschreibung eines Totems (Kopf + Körper) als Text.
//   Kopf = WER bekommt es (Stamm, Lane, Nebendeck-Karte) · Körper (intern „base“) = WAS sie bekommen (Sigil oder Lanen-Eigenschaft).
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

/** Art des Kopfes („Stammkopf“, „Lanenkopf“, „Nebendeck-Kopf“). @param {any} head */
export function headKind(head) {
  return head.kind === "tribe" ? de.totems.tribeHead : head.kind === "lane" ? de.totems.laneHead : de.totems.sideHead;
}

/** Wen der Kopf trifft („alle Nager-Karten“, „jede eigene Karte in Lane 2“). @param {any} head @param {string} [zirkel] */
export function headTarget(head, zirkel) {
  if (head.kind === "tribe") return de.totems.targetTribe(de.tribes[head.tribe].name);
  if (head.kind === "lane") return de.totems.targetLane(head.lane);
  return de.totems.targetSide(sideName(zirkel));
}

/** Name des Körpers (Sigil oder Lanen-Eigenschaft). @param {any} base */
export function baseName(base) {
  return base.kind === "sigil" ? de.sigils[base.sigil].name : de.totems.props[base.prop].name;
}

/** Was der Körper bewirkt. @param {any} base */
export function baseDesc(base) {
  return base.kind === "sigil" ? de.sigils[base.sigil].desc : de.totems.props[base.prop].desc;
}

/** Name des Totem-Platzes. @param {"tribe"|"lane"|"side"} slot */
export function slotLabel(slot) {
  return slot === "tribe" ? de.totems.tribeSlot : slot === "lane" ? de.totems.laneSlot : de.totems.sideSlot;
}

/** Beschreibung eines Totems (Kopf + Körper). @param {any} head @param {any} base @param {string} [zirkel] */
export function totemText(head, base, zirkel) {
  const name = baseName(base);
  if (head.kind === "tribe") return de.totems.tribeAura(de.tribes[head.tribe].name, name);
  if (head.kind === "side") return de.totems.sideAura(name, sideName(zirkel));
  return base.kind === "sigil" ? de.totems.laneAura(head.lane, name) : `${de.totems.lane(head.lane)}: ${de.totems.props[base.prop].desc}`;
}
