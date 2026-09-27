// engine/zirkel/moor.js — der Moor-Zirkel: Blut, Knochen, Wachs, Tiere aus dem Aschemoor (Inhalt bis Runde 2).
import { CARDS, collectibleOf, cursedOf } from "../cards.js";
import { SIGILS } from "../sigils/index.js";
import { TRIBES } from "../../data/tribes.js";
import { SIDE_TYPES } from "../../data/sides.js";
import { TOTEM_BASE_SIGILS, SIDE_TOTEM_SIGILS } from "../../data/totems.js";
import { NODE_TYPES, EVENTS } from "../../data/events.js";

/** @type {import("./index.js").Zirkel} */
export const MOOR = {
  id: "moor",
  name: "Moor-Zirkel",
  resources: [
    // Blut wird nie gespeichert (Opfer beim Ausspielen), Knochen bleiben, Wachs wächst pro Zug bis max
    { id: "blood", kind: "sacrifice" },
    { id: "bones", kind: "stock" },
    { id: "wax", kind: "perTurn", gain: 1, max: 6 },
  ],
  /** Ausgleich für den Zweitspieler und Kerzenstumpf gehen an diese Ressource */
  bonusResource: "wax",
  tide: false,
  tribes: TRIBES,
  cards: CARDS,
  collectible: collectibleOf("moor"),
  cursed: cursedOf("moor"),
  totemBaseSigils: TOTEM_BASE_SIGILS,
  sideTotemSigils: SIDE_TOTEM_SIGILS,
  /** Makel des Kopisten */
  copyFlaw: "kerzendocht:4",
  sigils: SIGILS,
  sideDeckTypes: SIDE_TYPES,
  pathNodeTypes: NODE_TYPES,
  events: EVENTS,
  theme: {
    palette: { ink: "#1a1612", parchment: "#d9c9a3", wax: "#8e1b1b", candle: "#f2b54a", brass: "#b08d57" },
    table: "Eichentisch im Kerzenlicht",
    fonts: ["IM Fell English", "EB Garamond"],
  },
};
