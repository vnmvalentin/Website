// engine/draft.js — Pool-Erzeugung, Snake-Draft (gemeinsamer Pool) und gleichzeitiger Draft (getrennte Pools).
import { COLLECTIBLE, CARDS } from "./cards.js";
import { pickWeighted, randInt, shuffle, streamFrom } from "./rng.js";
import { TOTEM_BASE_SIGILS, LANE_PROPS } from "../data/totems.js";
import { TRIBE_IDS } from "../data/tribes.js";
import { SIDE_TYPES } from "./battle.js";

export const POOL_RARITY = { common: 14, uncommon: 6, rare: 3, legendary: 1 };
export const PICKS_PER_PLAYER = 12;
export const SEPARATE_OFFER = 5;

/**
 * Pool aus dem Seed: 24 Karten + 4 Totem-Köpfe (mit Start-Basis) + die 3 Nebendeck-Typen.
 * @param {string} seed
 */
export function generatePool(seed) {
  const s = streamFrom("pool", seed);
  /** @type {Array<{ pid: string, baseId: string }>} */
  const cards = [];
  for (const [rarity, n] of Object.entries(POOL_RARITY)) {
    const candidates = shuffle(s, COLLECTIBLE.filter((c) => c.rarity === rarity).map((c) => c.id));
    for (let i = 0; i < n; i++) cards.push({ pid: `k${cards.length + 1}`, baseId: candidates[i % candidates.length] });
  }
  shuffle(s, cards);
  cards.forEach((c, i) => (c.pid = `k${i + 1}`));

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

/**
 * Snake-Reihenfolge 1-2-2-2-…: erster Spieler 1 Pick, danach abwechselnd je 2, bis beide 12 haben.
 * @param {0|1} first
 * @returns {Array<0|1>}
 */
export function snakeOrder(first) {
  /** @type {Array<0|1>} */
  const order = [first];
  const counts = [0, 0];
  counts[first] = 1;
  let cur = /** @type {0|1} */ (1 - first);
  while (counts[0] < PICKS_PER_PLAYER || counts[1] < PICKS_PER_PLAYER) {
    for (let i = 0; i < 2; i++) {
      if (counts[cur] < PICKS_PER_PLAYER) {
        order.push(cur);
        counts[cur] += 1;
      }
    }
    cur = /** @type {0|1} */ (1 - cur);
  }
  return order;
}

/**
 * Draft-Zustand anlegen.
 * @param {string} seed @param {"shared"|"separate"} mode @param {number} round Draft-Runde (Revanche tauscht den ersten Pick)
 */
export function createDraft(seed, mode, round = 0) {
  const pool = generatePool(seed);
  const s = streamFrom("firstPick", seed);
  const first = /** @type {0|1} */ ((randInt(s, 2) + round) % 2);
  const draft = {
    mode,
    first,
    pool: pool.cards,
    heads: pool.heads,
    sides: pool.sides,
    picks: /** @type {string[][]} */ ([[], []]),
    order: mode === "shared" ? snakeOrder(first) : [],
    index: 0,
    taken: /** @type {Record<string, number>} */ ({}),
    queues: /** @type {string[][]} */ ([[], []]),
    offers: /** @type {string[][]} */ ([[], []]),
    extras: [{ head: /** @type {number|null} */ (null), side: /** @type {string|null} */ (null) }, { head: null, side: null }],
  };
  if (mode === "separate") {
    const order = shuffle(streamFrom("queue", seed), pool.cards.map((c) => c.pid));
    draft.queues = [[...order], [...order]];
    refillOffer(draft, 0);
    refillOffer(draft, 1);
  }
  return draft;
}

/** @param {any} draft @param {number} p */
function refillOffer(draft, p) {
  while (draft.offers[p].length < SEPARATE_OFFER && draft.queues[p].length) {
    draft.offers[p].push(draft.queues[p].shift());
  }
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
    draft.taken[pid] = p;
    draft.picks[p].push(pid);
    draft.index += 1;
    // Übersprungene Plätze (falls der Pool durch Sperren leer wäre) gibt es hier nicht: 24 Karten = 2 × 12
  } else {
    const i = draft.offers[p].indexOf(pid);
    if (i < 0) return { error: "notOffered" };
    draft.offers[p].splice(i, 1);
    draft.picks[p].push(pid);
    // Nicht gewählte Karten wandern ans Ende der eigenen Warteschlange, dann 5 neue
    draft.queues[p].push(...draft.offers[p]);
    draft.offers[p] = [];
    refillOffer(draft, p);
  }
  if (def.unique) {
    legends[def.id] = p;
    // Für den anderen Spieler sperren (getrennte Pools: aus Angebot und Warteschlange entfernen)
    if (draft.mode === "separate") {
      const q = 1 - p;
      const same = draft.pool.filter((/** @type {any} */ c) => c.baseId === def.id).map((/** @type {any} */ c) => c.pid);
      draft.offers[q] = draft.offers[q].filter((/** @type {string} */ x) => !same.includes(x));
      draft.queues[q] = draft.queues[q].filter((/** @type {string} */ x) => !same.includes(x));
      refillOffer(draft, q);
    }
  }
  if (draftDone(draft, p)) draft.offers[p] = [];
  return { baseId: card.baseId };
}

/**
 * Welche Pool-Karten kann `p` gerade wählen?
 * @param {any} draft @param {0|1} p @param {Record<string, number>} legends
 */
export function pickable(draft, p, legends) {
  if (draftDone(draft, p)) return [];
  const ids = draft.mode === "shared"
    ? (sharedTurn(draft) === p ? draft.pool.filter((/** @type {any} */ c) => draft.taken[c.pid] === undefined).map((/** @type {any} */ c) => c.pid) : [])
    : [...draft.offers[p]];
  return ids.filter((pid) => {
    const def = CARDS[poolCard(draft, pid).baseId];
    return !(def.unique && legends[def.id] !== undefined && legends[def.id] !== p);
  });
}
