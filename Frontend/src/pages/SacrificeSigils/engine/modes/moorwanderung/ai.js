// engine/modes/moorwanderung/ai.js — KI für alle Entscheidungen eines Run-Spielers (Übung gegen KI-Mitspieler,
// Balancing-Simulation). Kampfzüge und Pfad-Szenen nutzen die KI des Duellmodus; neu sind Startdeck, Belohnung,
// Späherturm.

import { battleChoice, pathChoice, sceneChoice, cardScore } from "../../ai/index.js";
import { CARDS } from "../../cards.js";
import { randInt, rand } from "../../rng.js";
import { reachable } from "../../path.js";
import { startersOf } from "../../../data/modes/moorwanderung/starterDecks.js";
import { awaitingRun } from "./run.js";

/** Knoten-Vorlieben der Run-KI zusätzlich zu denen des Duellmodus. */
const RUN_NODE_PRIORITY = { scout: 0.5, elite: 6.5 };
/** Ab dieser Deckgröße nimmt die KI nur noch Karten, die mindestens so gut sind wie das obere Drittel ihres Decks. */
const LEAN_DECK = 16;

/** Lohnt sich die Karte für dieses Deck? Hält KI-Decks schlank (sonst 40–60 Karten auf langen Runs). */
function worthTaking(/** @type {any[]} */ deck, /** @type {string} */ id) {
  if (deck.length < LEAN_DECK || !CARDS[id]) return true;
  const scores = deck.map((/** @type {any} */ dc) => cardScore(CARDS[dc.baseId])).sort((a, b) => b - a);
  return cardScore(CARDS[id]) >= scores[Math.floor(scores.length / 3)];
}

/**
 * Nächste Aktion für Spieler p (oder null).
 * @param {any} s Run-State @param {number} p @param {"easy"|"normal"|"hard"} level @param {{ rng: number }} rng
 */
export function runAiAction(s, p, level, rng) {
  if (!awaitingRun(s).includes(p)) return null;
  switch (s.phase) {
    case "starter": {
      const options = startersOf(s.settings.zirkel);
      return { type: "chooseStarter", player: p, deck: options[randInt(rng, options.length)].id };
    }
    case "path": {
      const pp = s.path.players[p];
      if (pp.fight) return withPlayer(battleChoice(pp.fight.battle, 0, level, rng), p);
      if (!pp.scene) return chooseNode(s, p, level, rng);
      return sceneDecision(s, p, pp.scene, level, rng);
    }
    case "duels": {
      const pair = s.duels.pairs.find((/** @type {any} */ x) => !x.done && x.seats.includes(p));
      if (!pair) return null;
      return withPlayer(battleChoice(pair.battle, pair.seats.indexOf(p), level, rng), p);
    }
    default:
      return null;
  }
}

/** Kampfaktion auf den Run-Spieler umschreiben (die Engine setzt den Sitz selbst). @param {any} a @param {number} p */
function withPlayer(a, p) {
  return a ? { ...a, player: p } : { type: "timeout", player: p };
}

/** Knotenwahl: Duellmodus-Heuristik, Elite nur mit gutem Deck, Späherturm selten. */
function chooseNode(/** @type {any} */ s, /** @type {number} */ p, /** @type {any} */ level, /** @type {any} */ rng) {
  const pp = s.path.players[p];
  const nodes = s.path.map.nodes[pp.level];
  const reach = reachable(pp.strand);
  const special = reach.filter((st) => RUN_NODE_PRIORITY[nodes[st].type] !== undefined);
  if (level !== "easy" && special.length) {
    const elite = special.find((st) => nodes[st].type === "elite");
    const strong = s.players[p].deck.length >= 11;
    if (elite !== undefined && strong && rand(rng) < 0.6) return { type: "chooseNode", player: p, strand: elite };
  }
  const a = pathChoice(s, p, level, rng);
  // Späherturm und Elite ohne starkes Deck meiden, wenn es Alternativen gibt
  const t = nodes[a.strand]?.type;
  if ((t === "scout" || t === "elite") && reach.length > 1 && rand(rng) < 0.8) {
    const alt = reach.find((st) => !["scout", "elite"].includes(nodes[st].type));
    if (alt !== undefined) return { type: "chooseNode", player: p, strand: alt };
  }
  return a;
}

/** Szenen: Belohnung und Späherturm selbst, alles andere wie im Duellmodus. */
function sceneDecision(/** @type {any} */ s, /** @type {number} */ p, /** @type {any} */ scene, /** @type {any} */ level, /** @type {any} */ rng) {
  const act = (/** @type {any} */ x) => ({ type: "nodeAction", player: p, ...x });
  if (scene.kind === "scout") {
    if (scene.looked === null || scene.looked === undefined) {
      const others = s.players.map((/** @type {any} */ _, /** @type {number} */ i) => i).filter((i) => i !== p && s.players[i].alive);
      if (others.length) return act({ op: "look", target: others[randInt(rng, others.length)] });
    }
    return act({ op: "leave" });
  }
  if (scene.kind === "reward") {
    if (!scene.offers?.length || scene.picked) return act({ op: "leave" });
    if (level === "easy") return act({ op: "pick", index: randInt(rng, scene.offers.length) });
    let best = 0;
    let bs = -Infinity;
    scene.offers.forEach((/** @type {string} */ id, /** @type {number} */ i) => {
      const sc = cardScore(CARDS[id]) + rand(rng) * 0.2;
      if (sc > bs) { bs = sc; best = i; }
    });
    return worthTaking(s.players[p].deck, scene.offers[best]) ? act({ op: "pick", index: best }) : act({ op: "skip" });
  }
  const a = sceneChoice(s, p, scene, level, rng);
  // Parallel laufende Pfade: eine angebotene Legendäre kann inzwischen vergeben sein – dann eine andere Karte nehmen
  if (scene.kind === "cardChoice" && a?.op === "pick") {
    const taken = (/** @type {number} */ i) => {
      const id = scene.offers[i];
      return !id || (CARDS[id]?.unique && s.legends[id] !== undefined && s.legends[id] !== p);
    };
    if (taken(a.index)) {
      const free = scene.offers.findIndex((/** @type {any} */ _, /** @type {number} */ i) => !taken(i));
      return free >= 0 ? act({ op: "pick", index: free }) : act({ op: "skip" });
    }
  }
  return a;
}
