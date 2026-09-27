// engine/zirkel/gezeiten.js — der Gezeiten-Zirkel: versunkene Küstenstadt, Salz statt Wachs, gemeinsamer Gezeitenstand.
// Regeln (battle.js): Ebbe → steigend → Flut → fallend, je eine Runde. Flut: Uferreihen (Hinterreihen) unter Wasser –
// kein Nachrücken, Überlauf geht an ihnen vorbei. Ebbe: wer eine ganz leere Lane hat, zieht zu Zugbeginn eine
// Nebendeck-Karte. Salz: zu Zugbeginn +1 je eigener Karte in der Uferreihe (höchstens 8).
import { CARDS, collectibleOf, cursedOf } from "../cards.js";
import { SIGILS } from "../sigils/index.js";
import { GEZEITEN_TRIBES } from "../../data/gezeiten/tribes.js";
import { GEZEITEN_SIDE_TYPES } from "../../data/gezeiten/sides.js";
import { NODE_TYPES, GEZEITEN_EVENTS } from "../../data/events.js";
import { GEZEITEN_TOTEM_BASE_SIGILS, GEZEITEN_SIDE_TOTEM_SIGILS } from "../../data/totems.js";

/** @type {import("./index.js").Zirkel} */
export const GEZEITEN = {
  id: "gezeiten",
  name: "Gezeiten-Zirkel",
  resources: [
    { id: "blood", kind: "sacrifice" },
    { id: "bones", kind: "stock" },
    { id: "salt", kind: "shore", max: 8 },
  ],
  bonusResource: "salt",
  /** Überschreibt Felder von SECOND_PLAYER_BONUS (battle.js); Messung siehe PLAN.md Abschnitt 8 */
  secondPlayerBonus: { wax: 2, bones: 2 },
  tide: true,
  tribes: GEZEITEN_TRIBES,
  cards: CARDS,
  collectible: collectibleOf("gezeiten"),
  cursed: cursedOf("gezeiten"),
  sigils: SIGILS,
  sideDeckTypes: GEZEITEN_SIDE_TYPES,
  totemBaseSigils: GEZEITEN_TOTEM_BASE_SIGILS,
  sideTotemSigils: GEZEITEN_SIDE_TOTEM_SIGILS,
  copyFlaw: "treibgut",
  pathNodeTypes: NODE_TYPES,
  events: GEZEITEN_EVENTS,
  theme: {
    palette: { ink: "#1b2329", parchment: "#d8c9a5", accent: "#3e5563", sea: "#6d7a3e", rust: "#8a4b2a" },
    table: "Nasses Treibholz im Sturmlicht",
    fonts: ["IM Fell English", "EB Garamond"],
  },
};
