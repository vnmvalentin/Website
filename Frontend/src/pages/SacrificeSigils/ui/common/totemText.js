// ui/common/totemText.js — Beschreibung eines Totems (Kopf + Basis) als Text.
import { de } from "../../i18n/de.js";

/** Beschreibung eines Totems (Kopf + Basis). */
export function totemText(head, base) {
  const baseName = base.kind === "sigil" ? de.sigils[base.sigil].name : de.totems.props[base.prop].name;
  if (head.kind === "tribe") return de.totems.tribeAura(de.tribes[head.tribe].name, baseName);
  return base.kind === "sigil" ? de.totems.laneAura(head.lane, baseName) : `${de.totems.lane(head.lane)}: ${de.totems.props[base.prop].desc}`;
}
