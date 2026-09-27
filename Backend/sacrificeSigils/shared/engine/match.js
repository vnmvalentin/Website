// engine/match.js — Match-Zustandsmaschine: Draft → Extras → Pfad → Kampf → [Pfad → Zwischenspiel → Kampf]×n → Ende.
//
//   applyAction(state, action) → { state, events, error? }
//
// Rein: der übergebene State wird nie verändert (Arbeitskopie per deepClone). Deterministisch: aller Zufall kommt
// aus dem Seed (Pool, Karte, Szenen) bzw. aus dem Kampf-RNG im State (Seed + geheimes Salz + Kampfnummer).

import { hashParts, normalizeSeed } from "./rng.js";
import { CARDS } from "./cards.js";
import { createBattle, battleAction, SIDE_TYPES } from "./battle.js";
import { createDraft, applyPick, pickable, poolCard, draftDone, extrasTurn, PICKS_PER_PLAYER } from "./draft.js";
import { generateMap, createPlayerPath, reachable, createScene, sceneAction, defaultOp } from "./path.js";

export const DEFAULT_SETTINGS = {
  draftMode: "shared",
  winsNeeded: 2,
  turnTimer: 60,
  pathLength: 3,
  spectators: true,
};

const TIMERS = [45, 60, 90, 0];
/** Splitter für beide vor dem ersten Pfad. */
export const START_SHARDS = 3;
const PATH_LENGTHS = [2, 3, 4];

/** Einstellungen säubern (Lobby-Eingaben sind nicht vertrauenswürdig). @param {any} s */
export function normalizeSettings(s = {}) {
  return {
    draftMode: s.draftMode === "separate" ? "separate" : "shared",
    winsNeeded: [1, 2, 3].includes(s.winsNeeded) ? s.winsNeeded : DEFAULT_SETTINGS.winsNeeded,
    turnTimer: TIMERS.includes(s.turnTimer) ? s.turnTimer : DEFAULT_SETTINGS.turnTimer,
    pathLength: PATH_LENGTHS.includes(s.pathLength) ? s.pathLength : DEFAULT_SETTINGS.pathLength,
    spectators: s.spectators !== false,
  };
}

/**
 * Schnelle Tiefenkopie für reine Daten (Objekte, Arrays, Primitive).
 * @template T
 * @param {T} v
 * @returns {T}
 */
export function deepClone(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = deepClone(v[i]);
    return /** @type {any} */ (out);
  }
  /** @type {any} */
  const out = {};
  for (const k in v) out[k] = deepClone(/** @type {any} */ (v)[k]);
  return out;
}

function newMatchPlayer(/** @type {string} */ name) {
  return {
    name,
    deck: /** @type {any[]} */ ([]),
    sideType: "moorling",
    heads: /** @type {any[]} */ ([]),
    bases: /** @type {any[]} */ ([]),
    totems: { tribe: /** @type {any} */ (null), lane: /** @type {any} */ (null) },
    items: /** @type {string[]} */ ([]),
    shards: 0,
    cardSeq: 0,
    stats: { direct: 0, sacrifices: 0, played: 0, kills: 0, damageByCard: /** @type {Record<string, number>} */ ({}) },
  };
}

/**
 * Neues Match.
 * @param {{ seed: string, settings?: any, names?: string[], salt?: string, draftRound?: number }} opts
 */
export function createMatch(opts) {
  const settings = normalizeSettings(opts.settings);
  const seed = normalizeSeed(opts.seed) || "MOOR";
  return {
    version: 1,
    seed,
    salt: opts.salt || "",
    settings,
    phase: "draft",
    players: [newMatchPlayer(opts.names?.[0] || "Zeichner I"), newMatchPlayer(opts.names?.[1] || "Zeichner II")],
    draft: createDraft(seed, settings.draftMode, opts.draftRound || 0),
    draftRound: opts.draftRound || 0,
    battle: /** @type {any} */ (null),
    battleNo: 0,
    path: /** @type {any} */ (null),
    pathNo: 0,
    interlude: /** @type {any} */ (null),
    wins: [0, 0],
    lastLoser: /** @type {0|1|null} */ (null),
    legends: /** @type {Record<string, number>} */ ({}),
    history: /** @type {any[]} */ ([]),
    winner: /** @type {0|1|null} */ (null),
    endReason: /** @type {string|null} */ (null),
    step: 0,
  };
}

/**
 * Aktion anwenden.
 * @param {any} state
 * @param {any} action { type, player, ... }
 * @returns {{ state: any, events: any[], error?: string }}
 */
export function applyAction(state, action) {
  if (!action || typeof action !== "object") return { state, events: [], error: "badAction" };
  if (action.player !== 0 && action.player !== 1) return { state, events: [], error: "badPlayer" };
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
  const p = /** @type {0|1} */ (a.player);
  if (s.phase === "over") return "matchOver";
  if (a.type === "surrender") {
    endMatch(s, /** @type {0|1} */ (1 - p), "surrender", events);
    return null;
  }
  switch (s.phase) {
    case "draft": return draftPhase(s, p, a, events);
    case "extras": return extrasPhase(s, p, a, events);
    case "battle": return battlePhase(s, p, a, events);
    case "path": return pathPhase(s, p, a, events);
    case "interlude": return interludePhase(s, p, a, events);
    default: return "badPhase";
  }
}

// ───────────────────────── Draft ─────────────────────────

/** @param {any} s @param {0|1} p @param {any} a @param {any[]} events */
function draftPhase(s, p, a, events) {
  const d = s.draft;
  if (a.type === "timeout") {
    const options = pickable(d, p, s.legends);
    if (!options.length) return draftDone(d, p) ? null : "notYourPick";
    return draftPhase(s, p, { type: "draftPick", pid: options[0], player: p }, events);
  }
  if (a.type !== "draftPick") return "wrongPhase";
  const res = applyPick(d, p, a.pid, s.legends);
  if (res.error) return res.error;
  events.push({ type: "draftPick", player: p, pid: a.pid, baseId: res.baseId, count: d.picks[p].length, hiddenFrom: d.mode === "separate" ? 1 - p : null });
  if (draftDone(d, 0) && draftDone(d, 1)) {
    s.phase = "extras";
    events.push({ type: "phase", phase: "extras" });
  }
  return null;
}

/** @param {any} s @param {0|1} p @param {any} a @param {any[]} events */
function extrasPhase(s, p, a, events) {
  const d = s.draft;
  const ex = d.extras[p];
  if (ex.head !== null && ex.side !== null) return "alreadyChosen";
  const step = extrasTurn(d);
  if (step) {
    // Gemeinsamer Pool: Kopf und Nebendeck nacheinander mit wechselndem Erstzugriff, Gewähltes ist weg
    if (step[0] !== p) return "notYourPick";
    const kind = step[1];
    const other = d.extras[1 - p];
    if (a.type === "timeout") {
      a = kind === "head"
        ? { type: "draftExtras", head: d.heads.findIndex((/** @type {any} */ _, /** @type {number} */ i) => i !== other.head) }
        : { type: "draftExtras", side: Object.keys(SIDE_TYPES).find((k) => k !== other.side) };
    }
    if (a.type !== "draftExtras") return "wrongPhase";
    if (kind === "head") {
      if (!Number.isInteger(a.head) || !d.heads[a.head]) return "badHead";
      if (other.head === a.head) return "headTaken";
      ex.head = a.head;
    } else {
      if (!(a.side in SIDE_TYPES)) return "badSide";
      if (other.side === a.side) return "sideTaken";
      ex.side = a.side;
    }
    d.extraIndex += 1;
    events.push({ type: "extrasChosen", player: p, kind, head: kind === "head" ? a.head : undefined, side: kind === "side" ? a.side : undefined });
  } else {
    if (a.type === "timeout") a = { type: "draftExtras", head: 0, side: "moorling" };
    if (a.type !== "draftExtras") return "wrongPhase";
    if (!Number.isInteger(a.head) || !d.heads[a.head]) return "badHead";
    if (!(a.side in SIDE_TYPES)) return "badSide";
    ex.head = a.head;
    ex.side = a.side;
    events.push({ type: "extrasChosen", player: p });
  }
  if (d.extras.every((/** @type {any} */ e) => e.head !== null && e.side !== null)) {
    for (const q of /** @type {const} */ ([0, 1])) {
      const P = s.players[q];
      P.deck = [];
      for (const pid of d.picks[q]) newDeckCard(s, q, poolCard(d, pid).baseId);
      const bundle = d.heads[d.extras[q].head];
      P.heads = [bundle.head];
      P.bases = [bundle.base];
      P.totems = { tribe: null, lane: null };
      P.totems[bundle.head.kind === "tribe" ? "tribe" : "lane"] = { head: bundle.head, base: bundle.base };
      P.sideType = d.extras[q].side;
    }
    // Runde 2 (B1): direkt nach dem Draft geht es auf den Pfad – beide mit 3 Start-Splittern
    for (const P of s.players) P.shards += START_SHARDS;
    startPath(s, events);
  }
  return null;
}

/**
 * Karte ins Deck legen (neue UID). Legendäre Karten werden für den Gegner gesperrt.
 * @param {any} s @param {number} p @param {string} baseId @param {any[]} [mods]
 */
function newDeckCard(s, p, baseId, mods = []) {
  const P = s.players[p];
  P.cardSeq += 1;
  const dc = { uid: `p${p}c${P.cardSeq}`, baseId, mods };
  P.deck.push(dc);
  if (CARDS[baseId]?.unique) s.legends[baseId] = p;
  return dc;
}

// ───────────────────────── Kampf ─────────────────────────

/** @param {any} s @param {0|1} starter @param {any[]} events */
function startBattle(s, starter, events) {
  s.battleNo += 1;
  s.phase = "battle";
  s.interlude = null;
  s.path = null;
  const { state, events: ev } = createBattle({
    battleNo: s.battleNo,
    starter,
    rng: hashParts("battle", s.seed, s.salt, s.battleNo),
    players: s.players.map((/** @type {any} */ P) => ({ deck: P.deck, sideType: P.sideType, items: P.items, totems: P.totems })),
  });
  s.battle = state;
  events.push({ type: "phase", phase: "battle", battleNo: s.battleNo, starter });
  events.push(...ev);
  if (state.phase === "over") finishBattle(s, events);
}

/** @param {any} s @param {0|1} p @param {any} a @param {any[]} events */
function battlePhase(s, p, a, events) {
  const res = battleAction(s.battle, a);
  if (res.error) return res.error;
  events.push(...res.events);
  if (s.battle.phase === "over") finishBattle(s, events);
  return null;
}

/** @param {any} s @param {any[]} events */
function finishBattle(s, events) {
  const b = s.battle;
  const w = /** @type {0|1} */ (b.winner);
  const l = /** @type {0|1} */ (1 - w);
  s.wins[w] += 1;
  s.lastLoser = l;
  const shards = [0, 0];
  shards[w] = 3 + b.overkill;
  shards[l] = 2;
  for (const q of /** @type {const} */ ([0, 1])) {
    const P = s.players[q];
    const bs = b.players[q].stats;
    P.shards += shards[q];
    P.items = [...b.players[q].items];
    P.stats.direct += bs.direct;
    P.stats.sacrifices += bs.sacrifices;
    P.stats.played += bs.played;
    P.stats.kills += bs.kills;
    for (const [id, dmg] of Object.entries(bs.damageByCard)) P.stats.damageByCard[id] = (P.stats.damageByCard[id] || 0) + /** @type {number} */ (dmg);
  }
  s.history.push({ battleNo: s.battleNo, winner: w, overkill: b.overkill, turns: b.turn, scale: b.scale });
  events.push({ type: "battleResult", winner: w, overkill: b.overkill, shards, wins: [...s.wins] });
  if (s.wins[w] >= s.settings.winsNeeded) {
    endMatch(s, w, "wins", events);
    return;
  }
  startPath(s, events);
}

/** Pfad-Phase beginnen (nach dem Draft und nach jedem Kampf außer dem letzten). @param {any} s @param {any[]} events */
function startPath(s, events) {
  s.pathNo += 1;
  s.phase = "path";
  s.path = {
    map: generateMap(s.seed, s.pathNo, s.settings.pathLength),
    players: [createPlayerPath(), createPlayerPath()],
  };
  events.push({ type: "phase", phase: "path", pathNo: s.pathNo });
}

/** @param {any} s @param {0|1} winner @param {string} reason @param {any[]} events */
function endMatch(s, winner, reason, events) {
  s.phase = "over";
  s.winner = winner;
  s.endReason = reason;
  if (s.battle && s.battle.phase !== "over") {
    s.battle.phase = "over";
    s.battle.winner = winner;
  }
  events.push({ type: "matchEnd", winner, reason, wins: [...s.wins] });
}

// ───────────────────────── Pfad ─────────────────────────

/** @param {any} s @param {0|1} p @param {any} a @param {any[]} events */
function pathPhase(s, p, a, events) {
  const pp = s.path.players[p];
  if (pp.done) return "pathDone";
  if (a.type === "timeout") {
    let guard = 0;
    if (!pp.scene) {
      const err = pathPhase(s, p, { type: "chooseNode", player: p, strand: reachable(pp.strand)[0] }, events);
      if (err) return err;
    }
    while (pp.scene && guard++ < 12) {
      const err = pathPhase(s, p, { type: "nodeAction", player: p, ...defaultOp(pp.scene) }, events);
      // Standard-Op nicht möglich (z. B. nichts zu wählen): Szene ohne Wirkung schließen
      if (err) closeScene(s, p, events);
      if (s.phase !== "path") return null;
    }
    if (pp.scene) closeScene(s, p, events);
    return null;
  }
  if (a.type === "chooseNode") {
    if (pp.scene) return "sceneOpen";
    if (!reachable(pp.strand).includes(a.strand)) return "unreachable";
    const node = s.path.map.nodes[pp.level][a.strand];
    pp.strand = a.strand;
    pp.visited.push(node.type === "event" ? "event" : node.type);
    pp.chosen[pp.level] = true;
    pp.scene = createScene(s, p, node, pp.level, a.strand);
    events.push({ type: "nodeChosen", player: p, level: pp.level, strand: a.strand, node, private: p });
    if (pp.scene.kind === "empty") closeScene(s, p, events);
    return null;
  }
  if (a.type === "nodeAction") {
    if (!pp.scene) return "noScene";
    const io = {
      emit: (/** @type {any} */ e) => events.push(e),
      newCard: (/** @type {number} */ q, /** @type {string} */ baseId, /** @type {any[]} */ mods) => newDeckCard(s, q, baseId, mods || []),
    };
    const res = sceneAction(s, p, a, io);
    if (res.error) return res.error;
    if (res.done) closeScene(s, p, events);
    return null;
  }
  return "wrongPhase";
}

/** @param {any} s @param {0|1} p @param {any[]} events */
function closeScene(s, p, events) {
  const pp = s.path.players[p];
  pp.scene = null;
  pp.level += 1;
  events.push({ type: "nodeDone", player: p, level: pp.level });
  if (pp.level >= s.path.map.levels) {
    pp.done = true;
    events.push({ type: "pathDone", player: p });
  }
  if (s.path.players.every((/** @type {any} */ x) => x.done)) {
    if (s.battleNo === 0) {
      // Erster Pfad (direkt nach dem Draft): kein Verlierer, der wählt – wer zuerst gepickt hat, beginnt als Zweiter
      startBattle(s, /** @type {0|1} */ (1 - s.draft.first), events);
      return;
    }
    s.phase = "interlude";
    s.interlude = {
      revealed: s.path.players.map((/** @type {any} */ x) => [...x.visited]),
      chooser: s.lastLoser ?? 0,
    };
    events.push({ type: "phase", phase: "interlude", revealed: s.interlude.revealed, chooser: s.interlude.chooser });
  }
}

/** @param {any} s @param {0|1} p @param {any} a @param {any[]} events */
function interludePhase(s, p, a, events) {
  const it = s.interlude;
  if (p !== it.chooser) return "notChooser";
  let starter = a.starter;
  if (a.type === "timeout") starter = p;
  else if (a.type !== "chooseStarter") return "wrongPhase";
  if (starter !== 0 && starter !== 1) return "badStarter";
  events.push({ type: "starterChosen", chooser: p, starter });
  startBattle(s, starter, events);
  return null;
}

// ───────────────────────── Hilfen für Server/Client ─────────────────────────

/**
 * Wer muss gerade etwas tun? (Für Timer und „Gegner denkt …“)
 * @param {any} s
 * @returns {Array<0|1>}
 */
export function awaiting(s) {
  switch (s.phase) {
    case "draft": {
      const d = s.draft;
      if (d.mode === "shared") return d.index < d.order.length ? [d.order[d.index]] : [];
      return /** @type {Array<0|1>} */ ([0, 1].filter((p) => !draftDone(d, p)));
    }
    case "extras": {
      const step = extrasTurn(s.draft);
      if (step) return [step[0]];
      return /** @type {Array<0|1>} */ ([0, 1].filter((p) => s.draft.extras[p].head === null));
    }
    case "battle":
      return s.battle.phase === "over" ? [] : [s.battle.active];
    case "path":
      return /** @type {Array<0|1>} */ ([0, 1].filter((p) => !s.path.players[p].done));
    case "interlude":
      return [s.interlude.chooser];
    default:
      return [];
  }
}

export { PICKS_PER_PLAYER };

/**
 * Match direkt im Kampf beginnen (Tutorial, Tests): feste Decks, kein Draft, kein Pfad nötig.
 * @param {{ seed: string, names?: string[], decks: string[][], sideTypes?: string[], winsNeeded?: number, starter?: 0|1, totems?: any[] }} opts
 */
export function createBattleMatch(opts) {
  const s = createMatch({ seed: opts.seed, names: opts.names, salt: `direkt-${opts.seed}` });
  s.settings.winsNeeded = opts.winsNeeded || 1;
  s.draft.picks = [[], []];
  s.draft.extras = [{ head: 0, side: "moorling" }, { head: 0, side: "moorling" }];
  s.draft.extraIndex = s.draft.extraOrder.length;
  for (const q of /** @type {const} */ ([0, 1])) {
    const P = s.players[q];
    P.deck = [];
    for (const id of opts.decks[q]) newDeckCard(s, q, id);
    P.sideType = opts.sideTypes?.[q] || "moorling";
    P.totems = opts.totems?.[q] || { tribe: null, lane: null };
  }
  /** @type {any[]} */
  const events = [];
  startBattle(s, opts.starter ?? 0, events);
  return s;
}
