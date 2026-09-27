// data/gezeiten/cards/index.js — alle Karten des Gezeiten-Zirkels. Neue Stammdatei hier eintragen.
import muschelvolk from "./muschelvolk.js";
import ertrunkene from "./ertrunkene.js";
import tangwesen from "./tangwesen.js";
import moewen from "./moewen.js";
import waerter from "./waerter.js";
import scherenvolk from "./scherenvolk.js";
import quallen from "./quallen.js";
import robben from "./robben.js";
import raubfische from "./raubfische.js";
import tiefseeleuchter from "./tiefseeleuchter.js";
import schnecken from "./schnecken.js";
import korallen from "./korallen.js";
import wracks from "./wracks.js";
import treibgut from "./treibgut.js";
import verflucht from "./verflucht.js";
import tokens from "./tokens.js";

/** @type {import("../../../engine/types.js").CardDef[]} */
export const GEZEITEN_CARDS = [
  ...muschelvolk, ...ertrunkene, ...tangwesen, ...moewen, ...waerter, ...scherenvolk, ...quallen, ...robben,
  ...raubfische, ...tiefseeleuchter, ...schnecken, ...korallen, ...wracks, ...treibgut, ...verflucht, ...tokens,
];
