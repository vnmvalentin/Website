// engine/modes/moorwanderung/view.js — gefilterte Sicht und Ereignisse der Moorwanderung pro Empfänger.
//
// Versteckte Information: Deck, Items, Totems, Splitter-Details und Pfad-Szenen anderer Spieler werden nie verschickt.
// Öffentlich sind Name, Siegel, Deckgröße, öffentlich gewordene Karten (in Duellen gespielt), Status und Platzierung.
// Den eigenen Kampf (NPC oder Duell) bekommt man wie im Duellmodus gefiltert (filterBattle); fremde Kämpfe nur als
// öffentliche Sicht ohne Hände zum Zuschauen.

import { deepClone } from "../../match.js";
import { resolveCard } from "../../cards.js";
import { filterBattle } from "../../view.js";
import { statusOf, pathsPerRound, pathBudgetSeconds } from "./run.js";

const CARD_FIELDS = ["card", "cards", "victimCard"];

/**
 * @param {any} state Run-State
 * @param {number|null} viewer Spielerindex oder null (Zuschauer)
 */
export function viewForRun(state, viewer) {
  const s = state;
  const own = (/** @type {number} */ q) => q === viewer || s.phase === "over";
  const v = {
    mode: s.mode,
    seed: s.seed,
    settings: deepClone(s.settings),
    phase: s.phase,
    round: s.round,
    pathNo: s.pathNo,
    pathInRound: s.pathInRound,
    pathsPerRound: pathsPerRound(s.settings),
    viewer,
    step: s.step,
    winner: s.winner,
    placements: deepClone(s.placements),
    players: s.players.map((/** @type {any} */ P, /** @type {number} */ q) => {
      const pub = {
        name: P.name,
        seals: P.seals,
        alive: P.alive,
        place: P.place,
        deckSize: P.deck.length,
        itemCount: P.items.length,
        publicCards: { ...P.publicCards },
        // Startdeck erst sichtbar, wenn alle gewählt haben
        starter: s.phase === "starter" && !own(q) ? (P.starter ? "?" : null) : P.starter,
        status: statusOf(s, q),
        stats: s.phase === "over" ? deepClone(P.stats) : undefined,
      };
      if (!own(q)) return pub;
      return {
        ...pub,
        deck: P.deck.map((/** @type {any} */ dc) => ({ ...dc, card: resolveCard(dc.baseId, dc.mods, dc.uid) })),
        items: [...P.items],
        totems: deepClone(P.totems),
        heads: deepClone(P.heads),
        bases: deepClone(P.bases),
        shards: P.shards,
        catchup: P.catchup,
        auto: P.auto,
      };
    }),
    /** @type {any} */ path: null,
    /** @type {any} */ battle: null,
    /** @type {any} */ battleInfo: null,
    /** @type {any} */ duels: null,
    /** @type {Record<string, any>} */ watch: {},
  };

  if (s.path) {
    const me = viewer !== null ? s.path.players[viewer] : null;
    let scene = me?.scene ? deepClone(me.scene) : null;
    if (scene) {
      delete scene.key;
      if (scene.kind === "cardChoice" && scene.variant === "hidden") scene.offers = scene.offers.map(() => null);
      if (scene.kind === "scout" && scene.looked !== null && scene.looked !== undefined) {
        const T = s.players[scene.looked];
        scene.report = { name: T.name, seals: T.seals, sealsTotal: s.settings.seals, deckSize: T.deck.length, publicCards: { ...T.publicCards }, status: statusOf(s, scene.looked) };
      }
    }
    v.path = {
      map: deepClone(s.path.map),
      tier: s.path.tier,
      biome: s.path.biome,
      cycle: s.path.cycle,
      budgetSeconds: pathBudgetSeconds(s),
      me: me ? { level: me.level, strand: me.strand, visited: [...me.visited], route: [...(me.route || [])], chosen: [...me.chosen], done: me.done, scene } : null,
      progress: s.path.players.map((/** @type {any} */ pp) => ({ level: pp.level, done: pp.done })),
    };
  }

  // Eigener Kampf (NPC oder Duell) gefiltert für den eigenen Sitz; andere Kämpfe öffentlich zum Zuschauen
  const fights = [];
  if (s.phase === "path") {
    s.path.players.forEach((/** @type {any} */ pp, /** @type {number} */ q) => {
      if (pp.fight) fights.push({ key: `f${q}`, battle: pp.fight.battle, seats: [q, null], info: { kind: pp.fight.kind, npcId: pp.fight.npcId || null, bossId: pp.fight.bossId || null } });
    });
  }
  if (s.phase === "duels") {
    v.duels = { round: s.duels.round, pairs: s.duels.pairs.map((/** @type {any} */ x) => ({ id: x.id, seats: x.seats, ghost: x.ghost, done: x.done, winner: x.winner, loser: x.loser, scale: x.battle.scale, turn: x.battle.turn })) };
    for (const x of s.duels.pairs) fights.push({ key: `d${x.id}`, battle: x.battle, seats: x.seats, info: { kind: "duel", id: x.id, ghost: x.ghost, done: x.done } });
  }
  for (const f of fights) {
    const seat = viewer === null ? -1 : f.seats.indexOf(viewer);
    if (seat >= 0) {
      v.battle = filterBattle(f.battle, /** @type {0|1} */ (seat));
      v.battleInfo = { ...f.info, key: f.key, seat, seats: f.seats };
    } else {
      v.watch[f.key] = { ...f.info, seats: f.seats, battle: filterBattle(f.battle, null) };
    }
  }
  return v;
}

/**
 * Ereignisse für einen Empfänger: nur das eigene Publikum; private Kartendetails nur für den Berechtigten.
 * @param {any[]} events @param {number|null} viewer
 */
export function eventsForRun(events, viewer) {
  const out = [];
  for (const e of events) {
    if (e.audience && !(viewer !== null && e.audience.includes(viewer))) continue;
    if (e.onlyFor !== undefined && e.onlyFor !== viewer) {
      const c = { ...e };
      for (const f of CARD_FIELDS) delete c[f];
      delete c.onlyFor;
      delete c.private;
      out.push(c);
      continue;
    }
    out.push(e);
  }
  return out;
}
