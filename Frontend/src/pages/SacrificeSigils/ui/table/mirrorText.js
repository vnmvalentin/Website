// ui/table/mirrorText.js — Beschriftung der Bedien-Spiegelung (TableMirror.jsx): was ein Screenreader zu jedem Ziel am
// Tisch vorliest und was beim Fokus mit der Tastatur unten als Zeile steht. Kurz: Ort · Name · Zustand · Werte.
// Erklärungen (Regeln, Wirkung) liefert weiterhin die Phase selbst über ihre Tooltips (onHover).
import { CARDS } from "../../engine/cards.js";
import { parseSigil } from "../../engine/sigils/index.js";
import { de } from "../../i18n/de.js";

export const ROW_NAME = { oppBack: "Gegenüber hinten", oppFront: "Gegenüber vorn", ownFront: "Deine Front", ownBack: "Deine Hinterreihe" };

/** Gruppen in Lesereihenfolge, mit Überschrift für Screenreader. */
export const GROUPS = [
  ["hand", "Deine Hand"],
  ["brett", "Brett"],
  ["auslage", "Karten auf dem Tisch"],
  ["karte", "Pfadkarte"],
  ["tisch", "Gegenstände"],
];

/** Reihenfolge der Gegenstände: erst das, womit man handelt, dann das, was man nachschaut. */
const ITEM_ORDER = ["note", "choice", "ware", "deck", "sideDeck", "seal", "hammer", "item", "candle", "fire", "pool",
  "scale", "bones", "third", "tide", "totem", "hourglass", "podium", "oppHand", "oppDeck", "oppSeal", "oppItem"];
export const itemRank = (t) => {
  const i = ITEM_ORDER.indexOf(t.pick.type === "deck" && t.pick.pile === "side" ? "sideDeck" : t.pick.type);
  return i < 0 ? ITEM_ORDER.length : i;
};

/** Kosten einer Karte in Worten. @param {any} cost */
function costText(cost) {
  if (!cost || (cost.type === "blood" && !cost.amount)) return "kostenlos";
  return `${cost.amount} ${de.costs[cost.type]?.name || cost.type}`;
}

/**
 * Eine Karte in Worten: Name, Kosten, Angriff, Leben, Sigils.
 * @param {{ card: any, attack?: number, health?: number, maxHealth?: number, submerged?: boolean }} info
 */
export function cardText(info) {
  const card = info.card;
  const def = CARDS[card.baseId] || CARDS[card.id] || card;
  const baseAttack = typeof def.attack === "number" ? def.attack : 0;
  const special = card.special ?? (typeof def.attack === "object" ? def.attack.special : null);
  const atk = info.attack ?? (typeof card.attack === "number" ? card.attack : baseAttack);
  const hp = info.health ?? card.health ?? def.health;
  const maxHp = info.maxHealth ?? hp;
  const sigils = (card.sigils || def.sigils || []).map((s) => de.sigils[parseSigil(s).id]?.name).filter(Boolean);
  const parts = [
    def.name || card.name || "Karte",
    costText(card.cost || def.cost),
    special ? `Angriff: ${de.specials[special]?.name || special}` : `${atk} Angriff`,
    hp < maxHp ? `${hp} von ${maxHp} Leben` : `${hp} Leben`,
  ];
  if (sigils.length) parts.push(sigils.join(", "));
  if (info.submerged) parts.push("abgetaucht");
  return parts.join(", ");
}

/** Beschriftung eines Ziels der Szene (room.targets()). @param {any} t */
export function targetText(t) {
  const p = t.pick;
  const info = t.info || {};
  const st = t.state || {};
  const flags = (...f) => f.filter(Boolean).map((x) => `, ${x}`).join("");
  switch (p.type) {
    case "hand": return `${cardText(info)}${flags(st.selected && "gewählt", st.marked && "wird geopfert")}`;
    case "unit": return `${ROW_NAME[p.row]} ${p.lane + 1}: ${cardText(info)}${flags(st.marked && "zum Opfern gewählt", st.target && "wählbar")}`;
    case "slot": return `${ROW_NAME[p.row]} ${p.lane + 1}: leer${flags(st.target && "hier legen möglich")}`;
    case "loose": return info.card ? `${cardText(info)}${flags(info.dim && "nicht wählbar", st.pickable && "wählbar", st.selected && "gewählt")}` : "Verdeckte Karte";
    case "node": {
      const n = de.nodes[info.node];
      return `Ebene ${info.level + 1}: ${n?.name || info.node}${flags(st.option && "erreichbar", st.done && "besucht")}`;
    }
    case "deck": return p.pile === "main" ? `Hauptdeck${info.count != null ? `, ${info.count} Karten` : ""}${flags(info.drawable && "ziehen möglich")}` : `Nebendeck${flags(info.drawable && "ziehen möglich")}`;
    case "pool": return `Vorrat${info.label ? `: ${info.label}` : ""}`;
    case "seal": return `Siegelstempel${flags(info.ready && "jetzt möglich")}`;
    case "oppSeal": return `Siegelstempel gegenüber${flags(info.ready && "wählbar")}`;
    case "hammer": return `Hammer${flags(info.active && "in der Hand")}`;
    case "item": return `Item: ${info.label}`;
    case "oppItem": return "Item gegenüber";
    case "oppHand": return `Hand gegenüber${info.count ? `, ${info.count} Karten` : ""}`;
    case "oppDeck": return "Stapel gegenüber";
    case "scale": return `Waage: ${info.count > 0 ? "+" : ""}${info.count ?? 0}`;
    case "bones": return `${de.costs.bones.name}: ${info.count ?? 0}`;
    case "third": return `${de.costs[info.kind]?.name || "Wachs"}: ${info.count ?? 0}`;
    case "tide": return "Gezeitenpegel";
    case "totem": return `${p.owner === "me" ? "Dein Totem" : "Totem gegenüber"}${info.label ? `: ${info.label}` : ""}`;
    case "hourglass": return "Stundenglas";
    case "candle": return `Kerze ${p.index === 0 ? "links" : "rechts"}${info.lit === true ? ", brennt" : info.lit === false ? ", aus" : ""}`;
    case "fire": return "Feuerschale";
    case "podium": return `Podest, Platz ${info.place}`;
    case "note": return `Zettel: ${(info.lines || []).map((l) => (/[.!?:…]$/.test(l) ? l : `${l}.`)).join(" ")}${flags(info.dim && "nicht wählbar")}`;
    case "choice": return `${info.label || "Wahl"}${flags(info.chosen && "gewählt", !info.chosen && info.choosable && "wählbar")}`;
    case "ware": return `Ware: ${info.label}${flags(info.dim && "nicht kaufbar")}`;
    default: return p.type;
  }
}

/** Stabiler Schlüssel eines Ziels (für den Fokus über einen neuen Stand hinweg). @param {any} pick */
export function pickKey(pick) {
  if (pick.uid) return `${pick.type === "unit" ? "card" : pick.type}:${pick.uid}`;
  if (pick.type === "slot") return `slot:${pick.row}:${pick.lane}`;
  return [pick.type, pick.pile, pick.id, pick.index, pick.owner, pick.lv, pick.st, pick.place].filter((x) => x !== undefined).join(":");
}
