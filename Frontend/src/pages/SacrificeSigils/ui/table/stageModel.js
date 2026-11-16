// ui/table/stageModel.js — Hilfen für die Phasen am Tisch vor dem Kampf (Draft, Totem-Wahl; Rebuild Phase 4).
//
// Die Szene (scene/tableRoom.js) kennt nur einen Stand: das Anzeigemodell des Kampfs. Draft und Totem-Wahl benutzen
// dasselbe Modell — leer bis auf das, was sie zeigen (eigene Karten als Hand, die des Gegenübers als seine Hand, frei
// ausliegende Karten, Totem-Köpfe zur Wahl). So bleibt der Tisch von Phase zu Phase derselbe.

import { headName } from "../common/totemText.js";

/** Plätze für n Dinge nebeneinander, mittig um x = 0. @param {number} n @param {number} gap */
export function rowX(n, gap) {
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * gap);
}

/**
 * Leeres Modell des Tischs für eine Phase vor dem Kampf.
 * @param {{ stage: "draft" | "extras" | "interlude" | "result" | "scene" | "map" | "starter" | "camp", zirkel: string, seat: number, myTurn: boolean, oppTurn: boolean }} o
 */
export function stageModel({ stage, zirkel, seat, myTurn, oppTurn }) {
  return {
    stage,
    zirkel: zirkel || "moor",
    turn: 0,
    stalemateTurn: 30,
    scale: 0,
    third: zirkel === "gezeiten" ? "salt" : "wax",
    tide: null,
    flooded: false,
    myTurn,
    oppTurn,
    seat,
    units: [],
    hand: [],
    oppHand: [],
    me: { bones: 0, third: 0, deck: 0, items: [], totems: [] },
    opp: { items: 0, deck: 0, totems: [] },
    itemNames: {},
    loose: [],
    pool: null,
    choices: [],
  };
}

/** Totems eines Spielers, wie sie im Kampf auf dem Tisch stehen. @param {any} player @param {string} [zirkel] */
export function totemsOnTable(player, zirkel) {
  const t = player?.totems;
  return (t ? [t.tribe, t.lane, t.side].filter(Boolean) : []).map((x) => ({ kind: x.head.kind, label: headName(x.head, zirkel) }));
}

/** Restzeit eines Timers in ms (Serverzeit mit Uhrenabgleich). @param {any} tm @param {number} clockOffset */
export function timeLeft(tm, clockOffset) {
  return tm.paused ? tm.remaining : Math.max(0, tm.deadline - (Date.now() + (clockOffset || 0)));
}
