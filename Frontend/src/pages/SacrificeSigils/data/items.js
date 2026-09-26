// data/items.js — die 12 Items. Namen/Texte in i18n/de.js (items.<id>), Wirkung in engine/items.js.
// target: was der Spieler beim Benutzen auswählt.
//   none        keine Auswahl
//   enemyUnit   gegnerische Karte (Front oder Hinterreihe)
//   enemyFront  Lane mit gegnerischer Frontkarte
//   ownSlot     freier eigener Slot
//   enemySigil  gegnerische Karte + eines ihrer Sigils

export const ITEMS = [
  { id: "schere", price: 6, target: "enemyUnit" },
  { id: "blutphiole", price: 4, target: "none" },
  { id: "knochensack", price: 3, target: "none" },
  { id: "waagstein", price: 5, target: "none" },
  { id: "kerzenstumpf", price: 3, target: "none" },
  { id: "rabenfeder", price: 4, target: "none" },
  { id: "tintenfass", price: 5, target: "enemyFront" },
  { id: "stundenglas", price: 3, target: "enemyFront" },
  { id: "leimtopf", price: 2, target: "enemyUnit" },
  { id: "pinzette", price: 4, target: "enemySigil" },
  { id: "gluehwurmglas", price: 2, target: "none" },
  { id: "moorlaterne", price: 3, target: "ownSlot" },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const MAX_ITEMS = 3;
