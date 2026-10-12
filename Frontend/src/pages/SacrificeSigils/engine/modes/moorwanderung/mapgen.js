// engine/modes/moorwanderung/mapgen.js — Pfadkarte der Moorwanderung.
//
// Wie im Duellmodus: 3 Stränge, von Strang s geht es auf der nächsten Ebene zu s-1, s, s+1. Alle Spieler bekommen
// dieselbe Karte (Seed + Pfadnummer). Neu:
//   - die letzte Ebene ist immer der Pfad-Boss (alle drei Stränge führen zu ihm)
//   - Kampf-Garantie durch Konstruktion: zwei ganze Ebenen bestehen nur aus NPC-Kämpfen, höchstens eine weitere Ebene
//     hat einen Elite-Kampf auf einem Randstrang (Nebenweg). Jeder Weg trifft also 2 oder 3 Kämpfe (ohne Boss).
//   - Späherturm als zusätzlicher Knotentyp
// `fights: false` erzeugt eine Karte ohne NPC-Knoten (nur alte Knoten + Boss-Ebene als Kartenwahl).

import { pickWeighted, rand, randInt, shuffle, streamFrom } from "../../rng.js";
import { getZirkel } from "../../zirkel/index.js";
import { STRANDS } from "../../path.js";
import { MAX_CAMPFIRES_PER_MAP } from "../../../data/events.js";

/** Späherturm-Gewicht in normalen Ebenen. */
const SCOUT_WEIGHT = 6;

/**
 * @param {{ seed: string, pathNo: number, levels: number, zirkel?: string, fights?: boolean,
 *   weights?: Record<string, number>, npcs?: string[], elites?: string[], boss?: string|null }} opts
 *   weights: Gewichts-Faktoren des Bioms je Knotentyp; npcs/elites: NPC-IDs des Bioms; boss: Boss-ID
 */
export function generateRunMap(opts) {
  const z = getZirkel(opts.zirkel);
  const s = streamFrom("runmap", opts.seed, opts.pathNo);
  const levels = opts.levels;
  const fights = opts.fights !== false;
  const inner = levels - 1; // Ebenen vor dem Boss
  // Kampf-Ebenen: nie die erste (erst eine Karte oder ein Ort), möglichst nicht direkt nebeneinander
  const candidates = Array.from({ length: inner - 1 }, (_, i) => i + 1);
  let fightRows = [];
  if (fights) {
    const spaced = [];
    for (const a of candidates) for (const b of candidates) if (a < b && b - a >= 2) spaced.push([a, b]);
    const options = spaced.length ? spaced : candidates.length >= 2 ? [[candidates[0], candidates[1]]] : [[0, 1]];
    fightRows = options[randInt(s, options.length)];
  }
  const eliteRowOptions = fights ? candidates.filter((r) => !fightRows.includes(r)) : [];
  const eliteRow = eliteRowOptions.length && rand(s) < 0.75 ? eliteRowOptions[randInt(s, eliteRowOptions.length)] : null;
  const eliteStrand = rand(s) < 0.5 ? 0 : STRANDS - 1;

  const npcs = shuffle(s, [...(opts.npcs || [])]);
  let npcIdx = 0;
  const nextNpc = () => (npcs.length ? npcs[npcIdx++ % npcs.length] : null);
  const weights = z.pathNodeTypes
    .map(([t, w]) => [t, w * (opts.weights?.[t] ?? 1)])
    .concat(fights ? [["scout", SCOUT_WEIGHT * (opts.weights?.scout ?? 1)]] : []);
  const usedEvents = new Set();
  let campfires = 0;

  const nodes = [];
  for (let lv = 0; lv < levels; lv++) {
    const row = [];
    if (lv === levels - 1) {
      for (let st = 0; st < STRANDS; st++) row.push(fights ? { type: "boss", bossId: opts.boss || null } : { type: "cardChoice", variant: "hidden" });
      nodes.push(row);
      continue;
    }
    if (fightRows.includes(lv)) {
      // Eine Ebene, ein NPC: alle Stränge treffen denselben Gegner (faire Stufe, gleiche Herausforderung)
      const npcId = nextNpc();
      for (let st = 0; st < STRANDS; st++) row.push({ type: "npc", npcId });
      nodes.push(row);
      continue;
    }
    const used = new Set();
    for (let st = 0; st < STRANDS; st++) {
      if (lv === eliteRow && st === eliteStrand) {
        const pool = opts.elites?.length ? opts.elites : opts.npcs || [];
        row.push({ type: "elite", npcId: pool.length ? pool[randInt(s, pool.length)] : null });
        continue;
      }
      const cc = row.filter((n) => n.type === "cardChoice").length;
      const options = weights.filter(([t]) => (!used.has(t) || t === "cardChoice") && (t !== "cardChoice" || cc < 2)
        && (t !== "campfire" || campfires < MAX_CAMPFIRES_PER_MAP));
      const type = pickWeighted(s, /** @type {any} */ (options));
      used.add(type);
      if (type === "campfire") campfires += 1;
      /** @type {any} */
      const node = { type };
      if (type === "cardChoice") {
        const v = rand(s);
        node.variant = v < 0.6 ? "normal" : v < 0.82 ? "costType" : "hidden";
        if (node.variant === "costType") node.costType = z.resources.map((r) => r.id)[randInt(s, z.resources.length)];
      }
      if (type === "event") {
        const free = z.events.filter((e) => !usedEvents.has(e));
        node.event = free[randInt(s, free.length)] || z.events[0];
        usedEvents.add(node.event);
      }
      row.push(node);
    }
    nodes.push(row);
  }
  return { pathNo: opts.pathNo, levels, nodes, fightRows, eliteRow };
}

/** Zählt die Kämpfe (NPC + Elite, ohne Boss) auf jedem möglichen Weg. Für Tests und Prüfungen. @param {any} map */
export function fightCountsPerRoute(map) {
  const counts = [];
  const walk = (lv, st, n) => {
    if (lv >= map.levels - 1) {
      counts.push(n);
      return;
    }
    const t = map.nodes[lv][st].type;
    const add = t === "npc" || t === "elite" ? 1 : 0;
    for (const next of [st - 1, st, st + 1]) if (next >= 0 && next < STRANDS) walk(lv + 1, next, n + add);
  };
  for (let st = 0; st < STRANDS; st++) walk(0, st, 0);
  return counts;
}
