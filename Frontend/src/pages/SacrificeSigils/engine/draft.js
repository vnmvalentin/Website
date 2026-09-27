// engine/draft.js — Pool-Erzeugung und Draft in 6 Runden à 4 Karten: gemeinsamer Pool (abwechselnd A-B-A-B, erster
// Pick wechselt je Runde) oder getrennte Pools (gleichzeitig 2 aus 4).
import { COLLECTIBLE, CARDS } from "./cards.js";
import { pickWeighted, randInt, shuffle, streamFrom } from "./rng.js";
import { TOTEM_BASE_SIGILS, LANE_PROPS } from "../data/totems.js";
import { TRIBE_IDS } from "../data/tribes.js";
import { SIDE_TYPES } from "./battle.js";

export const POOL_RARITY = { common: 14, uncommon: 6, rare: 3, legendary: 1 };
export const PICKS_PER_PLAYER = 12;
/** Runde 2 (B2): 6 Runden à 4 aufgedeckte Karten, je Runde 2 Picks pro Spieler. */
export const DRAFT_ROUNDS = 6;
export const ROUND_SIZE = 4;
export const PICKS_PER_ROUND = 2;
/** Doppelte (gewöhnliche/ungewöhnliche) Karten im Pool: mindestens 3, höchstens 5 Paare. */
export const DUPLICATES_MIN = 3;
export const DUPLICATES_MAX = 5;

/**
 * Pool aus dem Seed: 24 Karten in 6 Runden à 4 (Runde r = pool[4r … 4r+3]) + 4 Totem-Köpfe (mit Start-Basis)
 * + die 3 Nebendeck-Typen. 3–5 gewöhnliche/ungewöhnliche Karten kommen doppelt vor, nie in derselben Runde;
 * Legendäre bleiben einzigartig.
 * @param {string} seed
 */
export function generatePool(seed) {
  const s = streamFrom("pool", seed);
  const dupCount = DUPLICATES_MIN + randInt(s, DUPLICATES_MAX - DUPLICATES_MIN + 1);
  /** @type {Record<string, number>} */
  const dups = { common: 0, uncommon: 0 };
  for (let i = 0; i < dupCount; i++) {
    // Gewichtet nach Plätzen; ungewöhnlich höchstens die Hälfte der eigenen Plätze
    const uncommon = randInt(s, POOL_RARITY.common + POOL_RARITY.uncommon) >= POOL_RARITY.common;
    if (uncommon && (dups.uncommon + 1) * 2 <= POOL_RARITY.uncommon) dups.uncommon += 1;
    else dups.common += 1;
  }
  /** @type {string[]} */
  const pairs = [];
  /** @type {string[]} */
  const singles = [];
  for (const [rarity, n] of Object.entries(POOL_RARITY)) {
    const d = dups[rarity] || 0;
    const candidates = shuffle(s, COLLECTIBLE.filter((c) => c.rarity === rarity).map((c) => c.id));
    for (let i = 0; i < n - d; i++) (i < d ? pairs : singles).push(candidates[i % candidates.length]);
  }
  /** @type {string[][]} */
  const rounds = Array.from({ length: DRAFT_ROUNDS }, () => []);
  const open = () => rounds.map((_, i) => i).filter((i) => rounds[i].length < ROUND_SIZE);
  for (const id of pairs) {
    const a = open();
    const r1 = a[randInt(s, a.length)];
    rounds[r1].push(id);
    const b = open().filter((i) => i !== r1);
    rounds[b[randInt(s, b.length)]].push(id);
  }
  shuffle(s, singles);
  for (const id of singles) {
    const a = open();
    rounds[a[0]].push(id);
  }
  /** @type {Array<{ pid: string, baseId: string }>} */
  const cards = [];
  for (const r of rounds) for (const baseId of shuffle(s, r)) cards.push({ pid: `k${cards.length + 1}`, baseId });

  // Köpfe: bevorzugt Stämme, die im Pool vorkommen; einer davon ist ein Lanenkopf
  const tribeCounts = new Map();
  for (const c of cards) {
    const t = CARDS[c.baseId].tribe;
    if (t !== "stammlose") tribeCounts.set(t, (tribeCounts.get(t) || 0) + 1);
  }
  const tribes = [];
  const weighted = TRIBE_IDS.filter((t) => t !== "stammlose").map((t) => [t, 1 + (tribeCounts.get(t) || 0) * 3]);
  while (tribes.length < 3) {
    const t = pickWeighted(s, /** @type {any} */ (weighted.filter(([id]) => !tribes.includes(id))));
    tribes.push(t);
  }
  const sigilPool = shuffle(s, [...TOTEM_BASE_SIGILS]);
  const heads = tribes.map((tribe, i) => ({ head: { kind: "tribe", tribe }, base: { kind: "sigil", sigil: sigilPool[i] } }));
  const lane = randInt(s, 4);
  heads.push({ head: { kind: "lane", lane }, base: { kind: "prop", prop: LANE_PROPS[randInt(s, LANE_PROPS.length)] } });
  shuffle(s, heads);
  return { cards, heads, sides: Object.keys(SIDE_TYPES) };
}

/** Wer wählt in Runde `r` zuerst? Wechselt jede Runde. @param {0|1} first @param {number} r @returns {0|1} */
export function roundFirst(first, r) {
  return /** @type {0|1} */ (r % 2 === 0 ? first : 1 - first);
}

/**
 * Pick-Reihenfolge im gemeinsamen Pool: pro Runde A, B, A, B; der erste Pick wechselt jede Runde.
 * @param {0|1} first
 * @returns {Array<0|1>}
 */
export function roundOrder(first) {
  /** @type {Array<0|1>} */
  const order = [];
  for (let r = 0; r < DRAFT_ROUNDS; r++) {
    const a = roundFirst(first, r);
    const b = /** @type {0|1} */ (1 - a);
    order.push(a, b, a, b);
  }
  return order;
}

/** Pool-IDs von Runde `r`. @param {any} draft @param {number} r @returns {string[]} */
export function roundPids(draft, r) {
  return draft.pool.slice(r * ROUND_SIZE, (r + 1) * ROUND_SIZE).map((/** @type {any} */ c) => c.pid);
}

/**
 * Aktuelle Runde von `p` (gemeinsam: für beide gleich; getrennt: eigene Runde, Spieler 2 beginnt versetzt).
 * @param {any} draft @param {0|1} p
 */
export function draftRound(draft, p) {
  if (draft.mode === "shared") return Math.min(DRAFT_ROUNDS - 1, Math.floor(draft.index / ROUND_SIZE));
  return Math.min(DRAFT_ROUNDS - 1, Math.floor(draft.picks[p].length / PICKS_PER_ROUND));
}

/** Getrennte Pools: Spieler 2 sieht die Runden versetzt, damit beide nicht dieselben Karten vor sich haben. */
function separateRoundIndex(/** @type {number} */ p, /** @type {number} */ r) {
  return p === 0 ? r : (r + DRAFT_ROUNDS / 2) % DRAFT_ROUNDS;
}

/**
 * Draft-Zustand anlegen.
 * @param {string} seed @param {"shared"|"separate"} mode @param {number} round Draft-Runde (Revanche tauscht den ersten Pick)
 */
export function createDraft(seed, mode, round = 0) {
  const pool = generatePool(seed);
  const s = streamFrom("firstPick", seed);
  const first = /** @type {0|1} */ ((randInt(s, 2) + round) % 2);
  // Nach 6 Runden geht der Wechsel weiter: Kopf wählt zuerst, wer Runde 1 begonnen hat, Nebendeck der andere
  const second = /** @type {0|1} */ (1 - first);
  const draft = {
    mode,
    first,
    pool: pool.cards,
    heads: pool.heads,
    sides: pool.sides,
    picks: /** @type {string[][]} */ ([[], []]),
    order: mode === "shared" ? roundOrder(first) : [],
    index: 0,
    taken: /** @type {Record<string, number>} */ ({}),
    offers: /** @type {string[][]} */ ([[], []]),
    extras: [{ head: /** @type {number|null} */ (null), side: /** @type {string|null} */ (null) }, { head: null, side: null }],
    /** Gemeinsamer Pool: Kopf und Nebendeck nacheinander, exklusiv. */
    extraOrder: mode === "shared" ? [[first, "head"], [second, "head"], [second, "side"], [first, "side"]] : [],
    extraIndex: 0,
  };
  if (mode === "separate") {
    refillOffer(draft, 0, {});
    refillOffer(draft, 1, {});
  }
  return draft;
}

/**
 * Getrennte Pools: Angebot = Karten der eigenen Runde, ohne eigene Picks dieser Runde und ohne gesperrte Legendäre.
 * @param {any} draft @param {number} p @param {Record<string, number>} legends
 */
function refillOffer(draft, p, legends) {
  if (draft.picks[p].length >= PICKS_PER_PLAYER) {
    draft.offers[p] = [];
    return;
  }
  const r = Math.floor(draft.picks[p].length / PICKS_PER_ROUND);
  const mine = new Set(draft.picks[p]);
  draft.offers[p] = roundPids(draft, separateRoundIndex(p, r)).filter((pid) => {
    if (mine.has(pid)) return false;
    const def = CARDS[poolCard(draft, pid).baseId];
    return !(def.unique && legends[def.id] !== undefined && legends[def.id] !== p);
  });
}

/** @param {any} draft @param {string} pid */
export function poolCard(draft, pid) {
  return draft.pool.find((/** @type {any} */ c) => c.pid === pid) || null;
}

/** Wer ist im gemeinsamen Draft am Zug? @param {any} draft */
export function sharedTurn(draft) {
  return draft.mode === "shared" && draft.index < draft.order.length ? draft.order[draft.index] : null;
}

/** @param {any} draft @param {number} p */
export function draftDone(draft, p) {
  return draft.picks[p].length >= PICKS_PER_PLAYER;
}

/**
 * Pick anwenden. Legendäre Karten sind einzigartig: `legends` = { baseId: spieler } des Matches.
 * @param {any} draft @param {0|1} p @param {string} pid @param {Record<string, number>} legends
 * @returns {{ error?: string, baseId?: string }}
 */
export function applyPick(draft, p, pid, legends) {
  if (draftDone(draft, p)) return { error: "draftDone" };
  const card = poolCard(draft, pid);
  if (!card) return { error: "badPick" };
  const def = CARDS[card.baseId];
  if (def.unique && legends[def.id] !== undefined && legends[def.id] !== p) return { error: "legendTaken" };
  if (draft.mode === "shared") {
    if (sharedTurn(draft) !== p) return { error: "notYourPick" };
    if (draft.taken[pid] !== undefined) return { error: "alreadyTaken" };
    if (!roundPids(draft, draftRound(draft, p)).includes(pid)) return { error: "notOffered" };
    draft.taken[pid] = p;
    draft.picks[p].push(pid);
    draft.index += 1;
  } else {
    if (!draft.offers[p].includes(pid)) return { error: "notOffered" };
    draft.picks[p].push(pid);
  }
  if (def.unique) legends[def.id] = p;
  if (draft.mode === "separate") {
    refillOffer(draft, p, legends);
    // Legendäre: beim anderen sofort aus dem Angebot nehmen
    if (def.unique) draft.offers[1 - p] = draft.offers[1 - p].filter((/** @type {string} */ x) => poolCard(draft, x).baseId !== def.id);
  }
  return { baseId: card.baseId };
}

/**
 * Welche Pool-Karten kann `p` gerade wählen?
 * @param {any} draft @param {0|1} p @param {Record<string, number>} legends
 */
export function pickable(draft, p, legends) {
  if (draftDone(draft, p)) return [];
  const ids = draft.mode === "shared"
    ? (sharedTurn(draft) === p ? roundPids(draft, draftRound(draft, p)).filter((pid) => draft.taken[pid] === undefined) : [])
    : [...draft.offers[p]];
  return ids.filter((pid) => {
    const def = CARDS[poolCard(draft, pid).baseId];
    return !(def.unique && legends[def.id] !== undefined && legends[def.id] !== p);
  });
}

/** Gemeinsamer Pool: wer wählt gerade Kopf bzw. Nebendeck? @param {any} draft @returns {null|[0|1, "head"|"side"]} */
export function extrasTurn(draft) {
  if (draft.mode !== "shared") return null;
  return draft.extraOrder[draft.extraIndex] || null;
}
