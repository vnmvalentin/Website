// engine/modes/moorwanderung/run.js — Zustandsmaschine der Moorwanderung (Run-Modus für 2–6 Spieler).
//
//   createRun({ seed, settings, names, salt }) → Run-State
//   applyRunAction(state, action)             → { state, events, error? }   (rein: der State wird geklont)
//   awaitingRun(state)                        → wer gerade etwas tun muss
//
// Ablauf: Startdeck wählen → [Pfad(e) → Duellrunde] … → nur noch 1 Spieler mit Siegeln.
// Kämpfe sind gewöhnliche Kämpfe der Engine (2 Sitze). Sitze ohne Menschen (NPC, Spiegelgeist, Moorfürst, und Spieler,
// deren Budget abgelaufen ist) spielt die Engine selbst mit der KI – deterministisch über `aiRng`, also auch auf dem
// Server nachvollziehbar und schummelsicher.
//
// Ereignisse tragen ihr Publikum: `audience` (Liste von Spielern, die sie sehen) und bei privaten Kampf-Ereignissen
// `onlyFor` (Spieler, der die Karte sehen darf). Gefiltert wird in view.js (eventsForRun).

import { hashParts, normalizeSeed, randInt, streamFrom } from "../../rng.js";
import { CARDS } from "../../cards.js";
import { createBattle, battleAction } from "../../battle.js";
import { deepClone } from "../../match.js";
import { ZIRKEL, DEFAULT_ZIRKEL, getZirkel } from "../../zirkel/index.js";
import { createPlayerPath, reachable, createScene, sceneAction, defaultOp } from "../../path.js";
import { battleChoice } from "../../ai/index.js";
import { startersOf, starterById } from "../../../data/modes/moorwanderung/starterDecks.js";
import { budgetFor } from "../../../data/modes/moorwanderung/budgets.js";
import { generateRunMap } from "./mapgen.js";
import { makePairs } from "./pairing.js";
import { mirrorOf, lordDeck } from "./npc.js";

export const RUN_MODE = "moorwanderung";
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const PATH_LEVELS = { short: 4, normal: 6, long: 8 };
export const START_SHARDS = 3;
/** Splitter: Duellsieg, Aufholbonus für den Verlierer. */
export const DUEL_REWARD = { win: 3, catchup: 4 };

export const RUN_DEFAULTS = {
  players: 4,
  seals: 3,
  pathsPerRound: /** @type {"auto"|1|2|3} */ ("auto"),
  pathLength: "normal",
  oddMode: "mirror",
  hardBoss: false,
  pace: "normal",
  zirkel: DEFAULT_ZIRKEL,
  spectators: true,
};

const BATTLE_ACTIONS = new Set(["draw", "discard", "seer", "play", "hammer", "rush", "item", "endTurn"]);

/** Einstellungen säubern (Lobby-Eingaben sind nicht vertrauenswürdig). @param {any} s */
export function normalizeRunSettings(s = {}) {
  const players = Number.isInteger(s.players) ? Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, s.players)) : RUN_DEFAULTS.players;
  return {
    players,
    seals: [2, 3, 4].includes(s.seals) ? s.seals : RUN_DEFAULTS.seals,
    pathsPerRound: [1, 2, 3].includes(s.pathsPerRound) ? s.pathsPerRound : "auto",
    pathLength: s.pathLength in PATH_LEVELS ? s.pathLength : RUN_DEFAULTS.pathLength,
    oddMode: s.oddMode === "lord" ? "lord" : "mirror",
    hardBoss: s.hardBoss === true,
    pace: ["relaxed", "normal", "fast"].includes(s.pace) ? s.pace : RUN_DEFAULTS.pace,
    zirkel: typeof s.zirkel === "string" && ZIRKEL[s.zirkel] ? s.zirkel : DEFAULT_ZIRKEL,
    spectators: s.spectators !== false,
  };
}

/** Pfade pro Duellrunde („auto“: 2, bei 5–6 Spielern 1). @param {any} settings */
export function pathsPerRound(settings) {
  return settings.pathsPerRound === "auto" ? (settings.players >= 5 ? 1 : 2) : settings.pathsPerRound;
}

/** Budget-Werte der Einstellung. @param {any} state */
export function runBudget(state) {
  return budgetFor(state.settings.pace);
}

/** Pfad-Budget in Sekunden (gleich für alle Spieler eines Pfads). @param {any} state */
export function pathBudgetSeconds(state) {
  const b = runBudget(state);
  const levels = PATH_LEVELS[state.settings.pathLength];
  return levels * b.node + (state.path?.map?.fightRows?.length ? b.fightsPerPath * b.fight : 0);
}

function newRunPlayer(/** @type {string} */ name, /** @type {any} */ settings) {
  const z = getZirkel(settings.zirkel);
  return {
    name,
    starter: /** @type {string|null} */ (null),
    deck: /** @type {any[]} */ ([]),
    sideType: Object.keys(z.sideDeckTypes)[0],
    heads: /** @type {any[]} */ ([]),
    bases: /** @type {any[]} */ ([]),
    totems: { tribe: /** @type {any} */ (null), lane: /** @type {any} */ (null), side: /** @type {any} */ (null) },
    items: /** @type {string[]} */ ([]),
    shards: 0,
    seals: settings.seals,
    alive: true,
    place: /** @type {number|null} */ (null),
    /** Öffentlich bekannte Karten (in Duellen gespielt): baseId → Anzahl gesehen */
    publicCards: /** @type {Record<string, number>} */ ({}),
    catchup: false,
    ghostCount: 0,
    lastOpponent: /** @type {number|null} */ (null),
    met: /** @type {Record<string, number>} */ ({}),
    lastDuelScale: /** @type {number|null} */ (null),
    auto: false,
    cardSeq: 0,
    stats: { duelsWon: 0, duelsLost: 0, npcWins: 0, npcLosses: 0, eliteWins: 0, bossWins: 0, bossLosses: 0, fuses: 0, damageByCard: /** @type {Record<string, number>} */ ({}) },
  };
}

/**
 * Neuer Run.
 * @param {{ seed: string, settings?: any, names: string[], salt?: string }} opts
 */
export function createRun(opts) {
  const names = opts.names.slice(0, MAX_PLAYERS);
  if (names.length < MIN_PLAYERS) throw new Error("Moorwanderung braucht mindestens 2 Spieler");
  const settings = { ...normalizeRunSettings(opts.settings), players: names.length };
  const seed = normalizeSeed(opts.seed) || "MOOR";
  const salt = opts.salt || "";
  return {
    mode: RUN_MODE,
    version: 1,
    seed,
    salt,
    settings,
    phase: "starter",
    round: 0,
    pathNo: 0,
    pathInRound: 0,
    players: names.map((n) => newRunPlayer(n, settings)),
    legends: /** @type {Record<string, number>} */ ({}),
    path: /** @type {any} */ (null),
    duels: /** @type {any} */ (null),
    aiRng: hashParts("runai", seed, salt),
    placements: /** @type {Array<{ player: number, place: number, round: number }>} */ ([]),
    winner: /** @type {number|null} */ (null),
    history: /** @type {any[]} */ ([]),
    step: 0,
  };
}

/**
 * Aktion anwenden.
 * @param {any} state @param {any} action { type, player, … }
 * @returns {{ state: any, events: any[], error?: string }}
 */
export function applyRunAction(state, action) {
  if (!action || typeof action !== "object") return { state, events: [], error: "badAction" };
  if (!Number.isInteger(action.player) || action.player < 0 || action.player >= state.players.length) return { state, events: [], error: "badPlayer" };
  const s = deepClone(state);
  /** @type {any[]} */
  const events = [];
  const error = dispatch(s, action, events);
  if (error) return { state, events: [], error };
  s.step += 1;
  return { state: s, events };
}

/** @param {any} s @param {any} a @param {any[]} events @returns {string|null} */
function dispatch(s, a, events) {
  const p = a.player;
  if (s.phase === "over") return "matchOver";
  if (a.type === "surrender") return surrender(s, p, events);
  switch (s.phase) {
    case "starter": return starterPhase(s, p, a, events);
    case "path": return pathPhase(s, p, a, events);
    case "duels": return duelPhase(s, p, a, events);
    default: return "badPhase";
  }
}

// ───────────────────────── Startdeck ─────────────────────────

/** @param {any} s @param {number} p @param {any} a @param {any[]} events */
function starterPhase(s, p, a, events) {
  const P = s.players[p];
  if (P.starter) return "alreadyChosen";
  let id = a.deck;
  if (a.type === "timeout") id = startersOf(s.settings.zirkel)[0].id;
  else if (a.type !== "chooseStarter") return "wrongPhase";
  const def = starterById(id);
  if (!def || def.zirkel !== s.settings.zirkel) return "badStarter";
  applyStarter(s, p, def);
  events.push({ type: "starterChosen", player: p, audience: [p], deck: id });
  events.push({ type: "playerReady", player: p });
  if (s.players.every((/** @type {any} */ Q) => Q.starter || !Q.alive)) {
    events.push({ type: "startersRevealed", starters: s.players.map((/** @type {any} */ Q) => Q.starter) });
    startPath(s, events);
  }
  return null;
}

/** @param {any} s @param {number} p @param {any} def */
function applyStarter(s, p, def) {
  const P = s.players[p];
  P.starter = def.id;
  P.deck = [];
  for (const id of def.cards) newDeckCard(s, p, id);
  const head = { kind: "side" };
  const base = { kind: "sigil", sigil: def.sideSigil };
  P.heads = [head];
  P.bases = [base];
  P.totems = { tribe: null, lane: null, side: { head, base } };
  P.shards = START_SHARDS;
}

/** Karte ins Deck (neue UID); Legendäre sind pro Match einzigartig. @param {any} s @param {number} p @param {string} baseId @param {any[]} [mods] */
function newDeckCard(s, p, baseId, mods = []) {
  const P = s.players[p];
  P.cardSeq += 1;
  const dc = { uid: `p${p}c${P.cardSeq}`, baseId, mods };
  P.deck.push(dc);
  if (CARDS[baseId]?.unique) s.legends[baseId] = p;
  return dc;
}

// ───────────────────────── Pfad ─────────────────────────

/** Neuen Pfad beginnen: gleiche Karte für alle, eigener Fortschritt pro Spieler. @param {any} s @param {any[]} events */
function startPath(s, events) {
  s.phase = "path";
  s.pathNo += 1;
  const levels = PATH_LEVELS[s.settings.pathLength];
  const map = generateRunMap({ seed: s.seed, pathNo: s.pathNo, levels, zirkel: s.settings.zirkel, fights: false });
  s.path = {
    map,
    tier: s.pathNo - 1,
    players: s.players.map((/** @type {any} */ P) => ({ ...createPlayerPath(), done: !P.alive, fight: null })),
  };
  events.push({ type: "phase", phase: "path", pathNo: s.pathNo, round: s.round + 1, pathInRound: s.pathInRound + 1 });
  // Aufholbonus: zusätzliche Kartenwahl zu Beginn des Pfads
  s.players.forEach((/** @type {any} */ P, /** @type {number} */ q) => {
    if (!P.alive || !P.catchup) return;
    P.catchup = false;
    const scene = createScene(s, q, { type: "cardChoice", variant: "normal" }, -1, q);
    scene.bonus = true;
    s.path.players[q].scene = scene;
    events.push({ type: "catchupOffer", player: q, audience: [q] });
  });
}

/** @param {any} s @param {number} p @param {any} a @param {any[]} events */
function pathPhase(s, p, a, events) {
  const P = s.players[p];
  const pp = s.path.players[p];
  if (!P.alive) return "eliminated";
  if (pp.done) return "pathDone";
  if (a.type === "budgetExpired") return autoFinishPath(s, p, events);
  if (pp.fight) {
    if (a.type === "timeout") return battleTurn(s, p, { type: "timeout" }, events);
    if (BATTLE_ACTIONS.has(a.type)) return battleTurn(s, p, a, events);
    return "inFight";
  }
  if (a.type === "timeout") return pathTimeout(s, p, events);
  if (a.type === "chooseNode") return chooseNode(s, p, a.strand, events);
  if (a.type === "nodeAction") return nodeAction(s, p, a, events);
  return "wrongPhase";
}

/** Eine offene Entscheidung automatisch treffen (Timer). @param {any} s @param {number} p @param {any[]} events */
function pathTimeout(s, p, events) {
  const pp = s.path.players[p];
  if (!pp.scene) return chooseNode(s, p, reachable(pp.strand)[0], events);
  const err = nodeAction(s, p, { type: "nodeAction", player: p, ...defaultOp(pp.scene) }, events);
  if (err) closeRunScene(s, p, events);
  return null;
}

/** @param {any} s @param {number} p @param {number} strand @param {any[]} events */
function chooseNode(s, p, strand, events) {
  const pp = s.path.players[p];
  if (pp.scene) return "sceneOpen";
  if (!reachable(pp.strand).includes(strand)) return "unreachable";
  const node = s.path.map.nodes[pp.level][strand];
  pp.strand = strand;
  pp.visited.push(node.type === "event" ? "event" : node.type);
  pp.chosen[pp.level] = true;
  events.push({ type: "nodeChosen", player: p, level: pp.level, strand, node, audience: [p] });
  events.push({ type: "progress", player: p, level: pp.level, levels: s.path.map.levels, node: node.type });
  pp.scene = createRunScene(s, p, node, pp.level, strand);
  if (pp.scene?.kind === "empty") closeRunScene(s, p, events);
  return null;
}

/**
 * Szene eines Knotens. Alte Knoten kommen aus engine/path.js, neue (Späherturm, Kämpfe) von hier.
 * @param {any} s @param {number} p @param {any} node @param {number} level @param {number} strand
 */
function createRunScene(s, p, node, level, strand) {
  switch (node.type) {
    case "scout": return { kind: "scout", looked: null };
    default: return createScene(s, p, node, level, strand);
  }
}

/** @param {any} s @param {number} p @param {any} a @param {any[]} events */
function nodeAction(s, p, a, events) {
  const pp = s.path.players[p];
  if (!pp.scene) return "noScene";
  const scene = pp.scene;
  if (scene.kind === "scout") {
    if (a.op === "leave" || a.op === "skip") { closeRunScene(s, p, events); return null; }
    if (a.op !== "look") return "badOp";
    if (!Number.isInteger(a.target) || a.target === p || !s.players[a.target]) return "badTarget";
    scene.looked = a.target;
    events.push({ type: "scouted", player: p, target: a.target, audience: [p] });
    return null;
  }
  const io = {
    emit: (/** @type {any} */ e) => {
      if (e.type === "fused") s.players[p].stats.fuses += 1;
      events.push({ ...e, player: e.player ?? p, audience: [p] });
    },
    newCard: (/** @type {number} */ q, /** @type {string} */ baseId, /** @type {any[]} */ mods) => newDeckCard(s, q, baseId, mods || []),
  };
  const res = sceneAction(s, p, a, io);
  if (res.error) return res.error;
  if (res.done) closeRunScene(s, p, events);
  return null;
}

/** Szene schließen; Bonus-Szenen (Aufholbonus) zählen nicht als Knoten. @param {any} s @param {number} p @param {any[]} events */
function closeRunScene(s, p, events) {
  const pp = s.path.players[p];
  const bonus = !!pp.scene?.bonus;
  pp.scene = null;
  if (bonus) return;
  pp.level += 1;
  events.push({ type: "nodeDone", player: p, level: pp.level, audience: [p] });
  if (pp.level >= s.path.map.levels) {
    pp.done = true;
    events.push({ type: "pathDone", player: p });
    checkPathEnd(s, events);
  }
}

/** Alle Lebenden fertig? Dann nächster Pfad oder Duellrunde. @param {any} s @param {any[]} events */
function checkPathEnd(s, events) {
  if (s.phase !== "path") return;
  if (!s.path.players.every((/** @type {any} */ pp, /** @type {number} */ q) => pp.done || !s.players[q].alive)) return;
  s.pathInRound += 1;
  for (const P of s.players) P.auto = false;
  if (checkRunEnd(s, events)) return;
  if (s.pathInRound >= pathsPerRound(s.settings)) startDuels(s, events);
  else startPath(s, events);
}

/** Zeitbudget abgelaufen: Rest des Pfads automatisch (Knoten per Standardregel, Kämpfe per KI „normal“). */
function autoFinishPath(/** @type {any} */ s, /** @type {number} */ p, /** @type {any[]} */ events) {
  const P = s.players[p];
  P.auto = true;
  events.push({ type: "budgetExpired", player: p });
  let guard = 0;
  while (s.phase === "path" && !s.path.players[p].done && P.alive && guard++ < 200) {
    const pp = s.path.players[p];
    if (pp.fight) {
      const ctx = battleCtx(s, p);
      if (!ctx) break;
      driveAi(s, ctx, events);
      if (ctx.battle.phase === "over") finishBattle(s, ctx, events);
      continue;
    }
    pathTimeout(s, p, events);
  }
  return null;
}

// ───────────────────────── Kämpfe (gemeinsam für NPC und Duell) ─────────────────────────

/**
 * Laufender Kampf eines Spielers mit Sitz-Zuordnung.
 * @param {any} s @param {number} p
 * @returns {null | { kind: "fight"|"duel", key: string, battle: any, seats: Array<number|null>, seat: number,
 *   aiSeats: number[], aiLevel: string, pair?: any }}
 */
function battleCtx(s, p) {
  if (s.phase === "path") {
    const f = s.path.players[p].fight;
    if (!f) return null;
    return { kind: "fight", key: `f${p}`, battle: f.battle, seats: [p, null], seat: 0, aiSeats: s.players[p].auto ? [0, 1] : [1], aiLevel: f.aiLevel || "normal" };
  }
  if (s.phase === "duels") {
    const pair = s.duels.pairs.find((/** @type {any} */ x) => !x.done && x.seats.includes(p));
    if (!pair) return null;
    return duelCtx(s, pair, p);
  }
  return null;
}

/** @param {any} s @param {any} pair @param {number|null} [p] */
function duelCtx(s, pair, p = null) {
  const aiSeats = pair.seats.map((/** @type {any} */ q, /** @type {number} */ i) => (q === null ? i : -1)).filter((/** @type {number} */ i) => i >= 0);
  return { kind: /** @type {const} */ ("duel"), key: `d${pair.id}`, battle: pair.battle, seats: pair.seats, seat: p === null ? -1 : pair.seats.indexOf(p), aiSeats, aiLevel: "hard", pair };
}

/** Kampf-Ereignisse mit Publikum versehen; im Duell gespielte Karten werden öffentlich. */
function tagBattle(/** @type {any} */ s, /** @type {any} */ ctx, /** @type {any[]} */ evs, /** @type {any[]} */ events) {
  const audience = ctx.seats.filter((/** @type {any} */ q) => q !== null);
  for (const e of evs) {
    const out = { ...e, ctx: ctx.key, audience };
    if (e.private !== undefined) out.onlyFor = ctx.seats[e.private] ?? -1;
    if (ctx.kind === "duel" && e.type === "play" && e.card) {
      const owner = ctx.seats[e.player];
      if (owner !== null && owner !== undefined) {
        const pc = s.players[owner].publicCards;
        pc[e.card.baseId] = (pc[e.card.baseId] || 0) + 1;
      }
    }
    events.push(out);
  }
}

/** Kampfzug eines Menschen. @param {any} s @param {number} p @param {any} a @param {any[]} events */
function battleTurn(s, p, a, events) {
  const ctx = battleCtx(s, p);
  if (!ctx) return "noBattle";
  const res = battleAction(ctx.battle, { ...a, player: ctx.seat });
  if (res.error) return res.error;
  tagBattle(s, ctx, res.events, events);
  driveAi(s, ctx, events);
  if (ctx.battle.phase === "over") finishBattle(s, ctx, events);
  return null;
}

/** Züge der KI-Sitze spielen, bis ein Mensch dran ist oder der Kampf endet. */
function driveAi(/** @type {any} */ s, /** @type {any} */ ctx, /** @type {any[]} */ events) {
  let guard = 0;
  while (ctx.battle.phase !== "over" && guard++ < 400) {
    const seat = ctx.battle.active;
    if (!ctx.aiSeats.includes(seat)) return;
    const rng = { rng: s.aiRng };
    let a = null;
    try {
      a = battleChoice(ctx.battle, seat, ctx.aiLevel, rng);
    } catch {
      a = null;
    }
    s.aiRng = rng.rng;
    let res = a ? battleAction(ctx.battle, { ...a, player: seat }) : { error: "noAction", events: [] };
    if (res.error) res = battleAction(ctx.battle, { type: "timeout", player: seat });
    tagBattle(s, ctx, res.events, events);
  }
}

/** Kampf zu Ende: Duell auswerten bzw. (Phase 2) NPC-Kampf. @param {any} s @param {any} ctx @param {any[]} events */
function finishBattle(s, ctx, events) {
  if (ctx.kind === "duel") finishDuel(s, ctx.pair, events);
}

// ───────────────────────── Duelle ─────────────────────────

/** @param {any} s @param {any[]} events */
function startDuels(s, events) {
  s.phase = "duels";
  s.round += 1;
  s.pathInRound = 0;
  s.path = null;
  const stream = streamFrom("pair", s.seed, s.round);
  const { pairs, ghost } = makePairs(s.players, stream);
  s.duels = { round: s.round, pairs: /** @type {any[]} */ ([]) };
  pairs.forEach(([a, b]) => s.duels.pairs.push(createDuel(s, s.duels.pairs.length, a, b, stream, events)));
  if (ghost !== null) s.duels.pairs.push(createDuel(s, s.duels.pairs.length, ghost, null, stream, events));
  events.push({
    type: "duelsStart",
    round: s.round,
    pairs: s.duels.pairs.map((/** @type {any} */ x) => ({ id: x.id, seats: x.seats, ghost: x.ghost })),
  });
  for (const pair of s.duels.pairs) {
    const ctx = duelCtx(s, pair);
    driveAi(s, ctx, events);
    if (pair.battle.phase === "over" && !pair.done) finishDuel(s, pair, events);
  }
}

/**
 * Ein Duell anlegen. b === null ⇒ Gegner ohne Menschen (Spiegelgeist oder Moorfürst) auf Sitz 1.
 * @param {any} s @param {number} id @param {number} a @param {number|null} b @param {{ rng: number }} stream @param {any[]} events
 */
function createDuel(s, id, a, b, stream, events) {
  const A = s.players[a];
  /** @type {any} */
  let ghost = null;
  let second;
  if (b === null) {
    A.ghostCount += 1;
    if (s.settings.oddMode === "lord") {
      const alive = s.players.filter((/** @type {any} */ P) => P.alive);
      const exclude = new Set(Object.keys(s.legends));
      const deck = lordDeck(alive, s.settings.zirkel, Math.max(0, s.pathNo - 1), streamFrom("lord", s.seed, s.round), exclude);
      ghost = { kind: "lord", of: null };
      second = { deck, sideType: A.sideType, items: [], totems: { tribe: null, lane: null, side: null } };
    } else {
      const others = s.players.map((/** @type {any} */ P, /** @type {number} */ i) => (P.alive && i !== a ? i : -1)).filter((/** @type {number} */ i) => i >= 0);
      const of = others[randInt(stream, others.length)];
      const m = mirrorOf(s.players[of]);
      ghost = { kind: "mirror", of };
      second = { deck: m.deck, sideType: m.sideType, items: [], totems: m.totems };
    }
  } else {
    const B = s.players[b];
    second = { deck: B.deck, sideType: B.sideType, items: B.items, totems: B.totems };
  }
  const seats = [a, b];
  // Startspieler: wer weniger Siegel hat; Gleichstand (und Geist) per Seed
  const sealsB = b === null ? A.seals : s.players[b].seals;
  const starter = /** @type {0|1} */ (A.seals < sealsB ? 0 : sealsB < A.seals ? 1 : randInt(stream, 2));
  const { state, events: ev } = createBattle({
    zirkel: s.settings.zirkel,
    battleNo: s.round * 10 + id,
    starter,
    rng: hashParts("duel", s.seed, s.salt, s.round, id),
    players: [{ deck: A.deck, sideType: A.sideType, items: A.items, totems: A.totems }, second],
  });
  const pair = { id, seats, ghost, battle: state, done: false, winner: /** @type {number|null} */ (null), loser: /** @type {number|null} */ (null) };
  tagBattle(s, duelCtx(s, pair), ev, events);
  return pair;
}

/** @param {any} s @param {any} pair @param {any[]} events */
function finishDuel(s, pair, events) {
  if (pair.done) return;
  pair.done = true;
  const b = pair.battle;
  const winSeat = b.winner;
  const loseSeat = 1 - winSeat;
  const winner = pair.seats[winSeat];
  const loser = pair.seats[loseSeat];
  pair.winner = winner;
  pair.loser = loser;
  // Waage aus Sicht des Verlierers (negativ): wer knapper verloren hat, landet beim gleichzeitigen Ausscheiden höher
  const loserScale = loseSeat === 0 ? b.scale : -b.scale;
  const [a, c] = pair.seats;
  if (a !== null && c !== null) {
    s.players[a].lastOpponent = c;
    s.players[c].lastOpponent = a;
    s.players[a].met[c] = (s.players[a].met[c] || 0) + 1;
    s.players[c].met[a] = (s.players[c].met[a] || 0) + 1;
  } else if (a !== null) {
    s.players[a].lastOpponent = null;
  }
  for (const [seat, q] of pair.seats.entries()) {
    if (q === null) continue;
    const st = s.players[q].stats;
    for (const [id, dmg] of Object.entries(b.players[seat].stats.damageByCard)) st.damageByCard[id] = (st.damageByCard[id] || 0) + /** @type {number} */ (dmg);
  }
  if (winner !== null) {
    const W = s.players[winner];
    W.stats.duelsWon += 1;
    W.shards += DUEL_REWARD.win;
  }
  if (loser !== null) {
    const L = s.players[loser];
    if (L.alive) {
      L.seals = Math.max(0, L.seals - 1);
      L.stats.duelsLost += 1;
      L.shards += DUEL_REWARD.catchup;
      L.catchup = true;
      L.lastDuelScale = loserScale;
    }
  }
  events.push({ type: "duelEnd", id: pair.id, round: s.round, winner, loser, ghost: pair.ghost, scale: b.scale, seals: loser !== null ? s.players[loser].seals : null });
  if (s.duels.pairs.every((/** @type {any} */ x) => x.done)) finishDuelRound(s, events);
}

/** @param {any} s @param {any[]} events */
function finishDuelRound(s, events) {
  const out = s.players.map((/** @type {any} */ P, /** @type {number} */ q) => (P.alive && P.seals <= 0 ? q : -1)).filter((/** @type {number} */ q) => q >= 0);
  if (out.length) eliminate(s, out, events);
  s.history.push({ round: s.round, pairs: s.duels.pairs.map((/** @type {any} */ x) => ({ seats: x.seats, winner: x.winner, ghost: x.ghost })) });
  events.push({ type: "roundEnd", round: s.round, seals: s.players.map((/** @type {any} */ P) => P.seals) });
  if (checkRunEnd(s, events)) return;
  s.duels = null;
  startPath(s, events);
}

// ───────────────────────── Ausscheiden, Ende ─────────────────────────

/**
 * Spieler scheiden gleichzeitig aus. Wer im letzten Duell knapper verloren hat, landet höher; dann mehr Karten.
 * Scheiden alle Übrigen zugleich aus, bekommt der Beste davon Platz 1.
 * @param {any} s @param {number[]} group @param {any[]} events
 */
function eliminate(s, group, events) {
  const aliveBefore = s.players.filter((/** @type {any} */ P) => P.alive).length;
  const aliveAfter = aliveBefore - group.length;
  const sorted = [...group].sort((x, y) => {
    const X = s.players[x];
    const Y = s.players[y];
    return (Y.lastDuelScale ?? -99) - (X.lastDuelScale ?? -99) || Y.deck.length - X.deck.length || x - y;
  });
  sorted.forEach((q, i) => {
    const P = s.players[q];
    P.alive = false;
    P.seals = 0;
    P.place = aliveAfter + 1 + i;
    s.placements.push({ player: q, place: P.place, round: s.round });
    events.push({ type: "eliminated", player: q, place: P.place });
    if (s.path?.players[q]) s.path.players[q].done = true;
  });
}

/** Nur noch einer (oder keiner) übrig? Dann Ende. @param {any} s @param {any[]} events */
function checkRunEnd(s, events) {
  const alive = s.players.map((/** @type {any} */ P, /** @type {number} */ q) => (P.alive ? q : -1)).filter((/** @type {number} */ q) => q >= 0);
  if (alive.length > 1) return false;
  if (alive.length === 1) {
    const w = alive[0];
    s.players[w].place = 1;
    s.placements.push({ player: w, place: 1, round: s.round });
    s.winner = w;
  } else {
    const first = s.placements.find((x) => x.place === 1);
    s.winner = first ? first.player : null;
  }
  s.phase = "over";
  events.push({ type: "runEnd", winner: s.winner, placements: [...s.placements].sort((x, y) => x.place - y.place) });
  return true;
}

/** Aufgeben / Verlassen: sofort ausgeschieden; ein laufendes Duell gewinnt der Gegner (ohne Siegelverlust). */
function surrender(/** @type {any} */ s, /** @type {number} */ p, /** @type {any[]} */ events) {
  const P = s.players[p];
  if (!P.alive) return "eliminated";
  if (s.phase === "starter" && !P.starter) applyStarter(s, p, startersOf(s.settings.zirkel)[0]);
  events.push({ type: "surrendered", player: p });
  P.seals = 0;
  P.lastDuelScale = -99;
  eliminate(s, [p], events);
  if (s.phase === "duels") {
    const pair = s.duels.pairs.find((/** @type {any} */ x) => !x.done && x.seats.includes(p));
    if (pair) {
      const seat = pair.seats.indexOf(p);
      pair.battle.phase = "over";
      pair.battle.winner = 1 - seat;
      finishDuel(s, pair, events);
      if (s.phase !== "duels") return null;
    }
    if (s.duels.pairs.every((/** @type {any} */ x) => x.done)) finishDuelRound(s, events);
    return null;
  }
  if (checkRunEnd(s, events)) return null;
  if (s.phase === "starter" && s.players.every((/** @type {any} */ Q) => Q.starter || !Q.alive)) startPath(s, events);
  else if (s.phase === "path") checkPathEnd(s, events);
  return null;
}

// ───────────────────────── Duellphase ─────────────────────────

/** @param {any} s @param {number} p @param {any} a @param {any[]} events */
function duelPhase(s, p, a, events) {
  if (!s.players[p].alive) return "eliminated";
  const ctx = battleCtx(s, p);
  if (!ctx) return "noBattle";
  if (a.type === "timeout") return battleTurn(s, p, { type: "timeout" }, events);
  if (!BATTLE_ACTIONS.has(a.type)) return "wrongPhase";
  return battleTurn(s, p, a, events);
}

// ───────────────────────── Hilfen für Server/Client ─────────────────────────

/**
 * Wer muss gerade etwas tun?
 * @param {any} s @returns {number[]}
 */
export function awaitingRun(s) {
  switch (s.phase) {
    case "starter":
      return s.players.map((/** @type {any} */ P, /** @type {number} */ q) => (P.alive && !P.starter ? q : -1)).filter((/** @type {number} */ q) => q >= 0);
    case "path":
      return s.players.map((/** @type {any} */ P, /** @type {number} */ q) => {
        const pp = s.path.players[q];
        if (!P.alive || pp.done) return -1;
        if (pp.fight) return pp.fight.battle.phase !== "over" && pp.fight.battle.active === 0 ? q : -1;
        return q;
      }).filter((/** @type {number} */ q) => q >= 0);
    case "duels": {
      const out = [];
      for (const pair of s.duels.pairs) {
        if (pair.done) continue;
        const q = pair.seats[pair.battle.active];
        if (q !== null && q !== undefined) out.push(q);
      }
      return out;
    }
    default:
      return [];
  }
}

/** Schlüssel, der sich ändert, sobald für p eine neue Entscheidung ansteht (Zug-Timer im Duell). @param {any} s @param {number} p */
export function runDecisionKey(s, p) {
  if (s.phase === "starter") return "starter";
  if (s.phase === "duels") {
    const pair = s.duels.pairs.find((/** @type {any} */ x) => !x.done && x.seats.includes(p));
    return pair ? `d${s.round}:${pair.id}:${pair.battle.turn}` : "";
  }
  return `p${s.pathNo}`;
}

/** Kurzstatus eines Spielers für die Fortschrittsleiste. @param {any} s @param {number} q */
export function statusOf(s, q) {
  const P = s.players[q];
  if (!P.alive) return { stage: "out" };
  if (s.phase === "starter") return { stage: P.starter ? "ready" : "choosing" };
  if (s.phase === "path") {
    const pp = s.path.players[q];
    if (pp.done) return { stage: "camp" };
    if (pp.fight) return { stage: "fight", fightKind: pp.fight.kind, npcId: pp.fight.npcId || null, bossId: pp.fight.bossId || null, level: pp.level, levels: s.path.map.levels };
    return { stage: pp.scene ? "scene" : "walking", scene: pp.scene?.kind || null, level: pp.level, levels: s.path.map.levels };
  }
  if (s.phase === "duels") {
    const pair = s.duels.pairs.find((/** @type {any} */ x) => x.seats.includes(q));
    if (!pair) return { stage: "camp" };
    const other = pair.seats.find((/** @type {any} */ x) => x !== q);
    return { stage: pair.done ? "duelDone" : "duel", vs: other ?? null, ghost: pair.ghost, won: pair.done ? pair.winner === q : null };
  }
  return { stage: "over" };
}
