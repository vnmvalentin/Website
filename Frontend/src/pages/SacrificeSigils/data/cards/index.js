// data/cards/index.js — alle Karten gesammelt. Neue Stammdatei hier eintragen.
import bestien from "./bestien.js";
import nachtvoegel from "./nachtvoegel.js";
import aasfresser from "./aasfresser.js";
import schwaerme from "./schwaerme.js";
import tiefe from "./tiefe.js";
import kriecher from "./kriecher.js";
import nager from "./nager.js";
import myzel from "./myzel.js";
import wurzelvolk from "./wurzelvolk.js";
import gebeine from "./gebeine.js";
import kerzenwesen from "./kerzenwesen.js";
import gehoernte from "./gehoernte.js";
import flatterer from "./flatterer.js";
import stammlose from "./stammlose.js";
import verflucht from "./verflucht.js";
import tokens from "./tokens.js";

/** @type {import("../../engine/types.js").CardDef[]} */
export const ALL_CARDS = [
  ...bestien, ...nachtvoegel, ...aasfresser, ...schwaerme, ...tiefe, ...kriecher, ...nager, ...myzel,
  ...wurzelvolk, ...gebeine, ...kerzenwesen, ...gehoernte, ...flatterer, ...stammlose, ...verflucht, ...tokens,
];
