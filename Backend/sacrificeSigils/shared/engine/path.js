// engine/path.js — Moorkarte und Knoten-Szenen zwischen den Kämpfen.
//
// Die Karte entsteht aus Seed + Pfadnummer und ist für beide Spieler gleich. 3 Stränge, 2–4 Ebenen; von Strang s kommt
// man auf der nächsten Ebene zu s-1, s, s+1. Beide Spieler wählen gleichzeitig und unabhängig; jede Szene hat ihre
// eigenen Operationen (`nodeAction { op, … }`) und endet mit einem Abschluss-Op (pick/skip/leave …).
// Alle Würfe (Angebote, Lagerfeuer, Glücksspiel) kommen aus seed-abgeleiteten Strömen des Knotens.

import { COLLECTIBLE, CURSED, CARDS, RARITIES, resolveCard } from "./cards.js";
import { pickWeighted, rand, randInt, shuffle, streamFrom } from "./rng.js";
import { MIN_DECK, CAMPFIRE_RISK } from "../data/events.js";
import { ITEMS, MAX_ITEMS } from "../data/items.js";
import { allHeads, allBases, sameHead, sameBase } from "../data/totems.js";
import { parseSigil } from "./sigils/index.js";
import { getZirkel, zirkelOf } from "./zirkel/index.js";

export const STRANDS = 3;
const MAX_SIGILS = 4;

/**
 * Moorkarte erzeugen.
 * @param {string} seed @param {number} pathNo @param {number} levels
 */
export function generateMap(seed, pathNo, levels, zirkelId) {
  const z = getZirkel(zirkelId);
  const s = streamFrom("map", seed, pathNo);
  const usedEvents = new Set();
  const nodes = [];
  for (let lv = 0; lv < levels; lv++) {
    const row = [];
    const used = new Set();
    for (let st = 0; st < STRANDS; st++) {
      const options = z.pathNodeTypes.filter(([t]) => !used.has(t) || t === "cardChoice");
      // Kartenwahl höchstens zweimal pro Ebene
      const cc = row.filter((n) => n.type === "cardChoice").length;
      const type = pickWeighted(s, /** @type {any} */ (options.filter(([t]) => t !== "cardChoice" || cc < 2)));
      used.add(type);
      /** @type {any} */
      const node = { type };
      if (type === "cardChoice") {
        const v = rand(s);
        node.variant = v < 0.6 ? "normal" : v < 0.82 ? "costType" : "hidden";
        if (node.variant === "costType") node.costType = ["blood", "bones", "wax"][randInt(s, 3)];
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
  return { pathNo, levels, nodes };
}

/** Erreichbare Stränge auf der aktuellen Ebene. @param {number|null} strand */
export function reachable(strand) {
  if (strand === null) return [0, 1, 2];
  return [strand - 1, strand, strand + 1].filter((x) => x >= 0 && x < STRANDS);
}

/** Pfad-Zustand eines Spielers. */
export function createPlayerPath() {
  return { level: 0, strand: /** @type {number|null} */ (null), visited: /** @type {string[]} */ ([]), scene: /** @type {any} */ (null), done: false, chosen: /** @type {boolean[]} */ ([]) };
}

// ───────────────────────── Kartenangebote ─────────────────────────

const RARITY_WEIGHTS = { common: 55, uncommon: 28, rare: 12, legendary: 5 };
const HIDDEN_WEIGHTS = { common: 35, uncommon: 35, rare: 21, legendary: 9 };

/**
 * @param {{rng:number}} s @param {number} n @param {(c: any) => boolean} filter @param {Record<string, number>} weights
 * @param {Record<string, number>} legends
 */
function offerCards(s, n, filter, weights, legends, collectible = COLLECTIBLE) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const rarity = pickWeighted(s, /** @type {any} */ (RARITIES.map((r) => [r, weights[r]])));
    let pool = collectible.filter((c) => filter(c) && c.rarity === rarity && !out.includes(c.id) && !(c.unique && legends[c.id] !== undefined));
    if (!pool.length) pool = collectible.filter((c) => filter(c) && !out.includes(c.id) && !(c.unique && legends[c.id] !== undefined));
    if (!pool.length) break;
    out.push(pool[randInt(s, pool.length)].id);
  }
  return out;
}

// ───────────────────────── Szenen ─────────────────────────

/**
 * Szene beim Betreten eines Knotens erzeugen.
 * @param {any} match @param {number} p @param {any} node @param {number} level @param {number} strand
 */
export function createScene(match, p, node, level, strand) {
  const key = ["scene", match.seed, match.path.map.pathNo, level, strand];
  const s = streamFrom(...key);
  const legends = match.legends;
  switch (node.type) {
    case "cardChoice": {
      const filter = node.variant === "costType" ? (/** @type {any} */ c) => c.cost.type === node.costType : () => true;
      const weights = node.variant === "hidden" ? HIDDEN_WEIGHTS : RARITY_WEIGHTS;
      return { kind: "cardChoice", variant: node.variant, costType: node.costType || null, offers: offerCards(s, 3, filter, weights, legends, zirkelOf(match).collectible) };
    }
    case "fuse": return { kind: "fuse" };
    case "transfer": return { kind: "transfer" };
    case "campfire": return { kind: "campfire", target: null, uses: 0, key };
    case "remove": return { kind: "remove" };
    case "merchant": {
      const items = shuffle(s, ITEMS.map((i) => i.id)).slice(0, 3);
      return { kind: "merchant", offers: items.map((id) => {
        const def = ITEMS.find((i) => i.id === id);
        return { item: id, price: /** @type {any} */ (def).price + randInt(s, 2), sold: false };
      }) };
    }
    case "shrine": {
      const player = match.players[p];
      const heads = allHeads().filter((h) => !player.heads.some((x) => sameHead(x, h)));
      const bases = allBases().filter((b) => !player.bases.some((x) => sameBase(x, b)));
      const hs = shuffle(s, heads).slice(0, 1).map((head) => ({ head }));
      const bs = shuffle(s, bases).slice(0, 2).map((base) => ({ base }));
      return { kind: "shrine", offers: [...hs, ...bs], taken: false };
    }
    case "copyist": return { kind: "copyist", flaw: rand(s) < 0.5 ? "health" : "wick" };
    case "event": {
      /** @type {any} */
      const scene = { kind: "event", event: node.event, key };
      if (node.event === "knochenorakel") scene.offers = offerCards(s, 5, (c) => c.rarity === "uncommon", { common: 0, uncommon: 1, rare: 0, legendary: 0 }, legends, zirkelOf(match).collectible);
      return scene;
    }
    default:
      return { kind: "empty" };
  }
}

/** @param {any} player @param {string} uid */
function deckIndex(player, uid) {
  return player.deck.findIndex((/** @type {any} */ c) => c.uid === uid);
}

/** @param {any} dc */
function resolved(dc) {
  return resolveCard(dc.baseId, dc.mods, dc.uid);
}

/**
 * Operation in einer Szene anwenden.
 * @param {any} match @param {0|1} p @param {any} a { op, ... }
 * @param {{ emit: (e: any) => void, newCard: (p: number, baseId: string, mods?: any[]) => any }} io
 * @returns {{ error?: string, done?: boolean }}
 */
export function sceneAction(match, p, a, io) {
  const pp = match.path.players[p];
  const scene = pp.scene;
  const player = match.players[p];
  if (!scene) return { error: "noScene" };
  const op = a.op;
  const fin = () => ({ done: true });
  const emit = (/** @type {any} */ e) => io.emit({ ...e, player: p, private: p });

  switch (scene.kind) {
    case "cardChoice": {
      if (op === "skip" && !scene.offers.length) return fin();
      if (op !== "pick") return { error: "badOp" };
      const baseId = scene.offers[a.index];
      if (!baseId) return { error: "badIndex" };
      const def = CARDS[baseId];
      if (def.unique && match.legends[baseId] !== undefined && match.legends[baseId] !== p) return { error: "legendTaken" };
      const dc = io.newCard(p, baseId);
      emit({ type: "gainCard", card: resolved(dc) });
      return fin();
    }
    case "fuse": {
      if (op === "skip") return fin();
      if (op !== "fuse") return { error: "badOp" };
      const ia = deckIndex(player, a.a);
      const ib = deckIndex(player, a.b);
      if (ia < 0 || ib < 0 || ia === ib) return { error: "badTarget" };
      const A = player.deck[ia];
      const B = player.deck[ib];
      if (A.baseId !== B.baseId) return { error: "notSame" };
      const rb = resolved(B);
      A.mods.push({ kind: "fuse", attack: rb.attack, health: rb.health, sigils: rb.sigils });
      player.deck.splice(ib, 1);
      emit({ type: "fused", uid: A.uid, removed: B.uid, card: resolved(A) });
      return fin();
    }
    case "transfer": {
      if (op === "skip") return fin();
      if (op !== "transfer") return { error: "badOp" };
      if (player.deck.length <= MIN_DECK) return { error: "deckTooSmall" };
      const id = deckIndex(player, a.donor);
      const it = deckIndex(player, a.target);
      if (id < 0 || it < 0 || id === it) return { error: "badTarget" };
      const donor = resolved(player.deck[id]);
      const target = resolved(player.deck[it]);
      const ref = donor.sigils.find((s) => s === a.sigil);
      if (!ref) return { error: "badSigil" };
      const sid = parseSigil(ref).id;
      if (zirkelOf(match).sigils[sid]?.cursedOnly) return { error: "cursedSigil" };
      if (target.sigils.length >= MAX_SIGILS && !target.sigils.some((s) => parseSigil(s).id === sid)) return { error: "tooManySigils" };
      player.deck[it].mods.push({ kind: "sigilAdd", sigil: ref });
      const [removed] = player.deck.splice(id, 1);
      emit({ type: "transferred", sigil: ref, donor: removed.uid, uid: player.deck[deckIndex(player, a.target)].uid, card: resolved(player.deck[deckIndex(player, a.target)]) });
      return fin();
    }
    case "campfire": {
      if (op === "leave") return fin();
      if (op !== "boost") return { error: "badOp" };
      if (scene.uses >= CAMPFIRE_RISK.length) return { error: "campfireSpent" };
      const uid = scene.target || a.uid;
      const i = deckIndex(player, uid);
      if (i < 0) return { error: "badTarget" };
      if (a.stat !== "attack" && a.stat !== "health") return { error: "badStat" };
      const risk = CAMPFIRE_RISK[scene.uses];
      const roll = rand(streamFrom(...scene.key, "fire", scene.uses));
      scene.target = uid;
      scene.uses += 1;
      if (risk > 0 && roll < risk) {
        const [lost] = player.deck.splice(i, 1);
        emit({ type: "campfireLost", uid: lost.uid, card: resolved(lost), risk });
        return fin();
      }
      player.deck[i].mods.push(a.stat === "attack" ? { kind: "campfire", attack: 1 } : { kind: "campfire", health: 2 });
      emit({ type: "campfireBoost", uid, stat: a.stat, risk, card: resolved(player.deck[i]), next: CAMPFIRE_RISK[scene.uses] ?? null });
      return scene.uses >= CAMPFIRE_RISK.length ? fin() : {};
    }
    case "remove": {
      if (op === "skip") return fin();
      if (op !== "remove") return { error: "badOp" };
      if (player.deck.length <= MIN_DECK) return { error: "deckTooSmall" };
      const i = deckIndex(player, a.uid);
      if (i < 0) return { error: "badTarget" };
      const [gone] = player.deck.splice(i, 1);
      emit({ type: "removed", uid: gone.uid, card: resolved(gone) });
      return fin();
    }
    case "merchant": {
      if (op === "leave") return fin();
      if (op !== "buy") return { error: "badOp" };
      const offer = scene.offers[a.index];
      if (!offer || offer.sold) return { error: "badIndex" };
      if (player.items.length >= MAX_ITEMS) return { error: "tooManyItems" };
      if (player.shards < offer.price) return { error: "notEnoughShards" };
      player.shards -= offer.price;
      player.items.push(offer.item);
      offer.sold = true;
      emit({ type: "bought", item: offer.item, price: offer.price, shards: player.shards });
      return {};
    }
    case "shrine": {
      if (op === "leave") return fin();
      if (op === "take") {
        if (scene.taken) return { error: "alreadyTaken" };
        const offer = scene.offers[a.index];
        if (!offer) return { error: "badIndex" };
        if (offer.head) player.heads.push(offer.head);
        else player.bases.push(offer.base);
        scene.taken = true;
        emit({ type: "totemPart", part: offer });
        return {};
      }
      if (op === "assemble") {
        const head = player.heads[a.head];
        const base = player.bases[a.base];
        if (!head || !base) return { error: "badIndex" };
        if (head.kind === "tribe" && base.kind !== "sigil") return { error: "propNeedsLane" };
        const slot = head.kind === "tribe" ? "tribe" : "lane";
        player.totems[slot] = { head, base };
        emit({ type: "totemBuilt", slot, totem: player.totems[slot] });
        return {};
      }
      return { error: "badOp" };
    }
    case "copyist": {
      if (op === "skip") return fin();
      if (op !== "copy") return { error: "badOp" };
      const i = deckIndex(player, a.uid);
      if (i < 0) return { error: "badTarget" };
      const src = player.deck[i];
      if (CARDS[src.baseId].unique) return { error: "uniqueCard" };
      const flaw = scene.flaw === "health" ? { kind: "stat", health: -1, source: "copyist" } : { kind: "sigilAdd", sigil: "kerzendocht:4" };
      const dc = io.newCard(p, src.baseId, [...src.mods.map((/** @type {any} */ m) => ({ ...m })), flaw, { kind: "mark", mark: "copied" }]);
      emit({ type: "copied", from: src.uid, uid: dc.uid, card: resolved(dc), flaw: scene.flaw });
      return fin();
    }
    case "event":
      return eventAction(match, p, a, io, scene, emit);
    default:
      return fin();
  }
}

/**
 * @param {any} match @param {0|1} p @param {any} a @param {any} io @param {any} scene @param {(e: any) => void} emit
 * @returns {{ error?: string, done?: boolean }}
 */
function eventAction(match, p, a, io, scene, emit) {
  const player = match.players[p];
  const op = a.op;
  const fin = () => ({ done: true });
  if (op === "skip" || op === "decline" || op === "leave") return fin();
  const s = streamFrom(...scene.key, "event", p);
  switch (scene.event) {
    case "faehrmann": {
      if (op !== "swap") return { error: "badOp" };
      const i = deckIndex(player, a.uid);
      if (i < 0) return { error: "badTarget" };
      const def = CARDS[player.deck[i].baseId];
      const ri = RARITIES.indexOf(def.rarity);
      if (ri >= RARITIES.length - 1) return { error: "noHigherRarity" };
      const target = RARITIES[ri + 1];
      const pool = zirkelOf(match).collectible.filter((c) => c.rarity === target && !(c.unique && match.legends[c.id] !== undefined));
      if (!pool.length) return { error: "noHigherRarity" };
      const [old] = player.deck.splice(i, 1);
      const dc = io.newCard(p, pool[randInt(s, pool.length)].id);
      emit({ type: "ferried", removed: old.uid, uid: dc.uid, card: resolved(dc) });
      return fin();
    }
    case "tintenwitwe": {
      if (op !== "accept") return { error: "badOp" };
      const c = CURSED[randInt(s, CURSED.length)];
      const dc = io.newCard(p, c.id, [{ kind: "dread" }]);
      emit({ type: "gainCard", card: resolved(dc), cursed: true });
      return fin();
    }
    case "knochenorakel": {
      if (op !== "offer") return { error: "badOp" };
      if (!Array.isArray(a.uids) || a.uids.length !== 2 || a.uids[0] === a.uids[1]) return { error: "badTarget" };
      if (player.deck.length - 2 + 1 < MIN_DECK) return { error: "deckTooSmall" };
      const baseId = scene.offers?.[a.pick];
      if (!baseId) return { error: "badIndex" };
      const idx = a.uids.map((/** @type {string} */ u) => deckIndex(player, u));
      if (idx.some((/** @type {number} */ i) => i < 0)) return { error: "badTarget" };
      player.deck = player.deck.filter((/** @type {any} */ c) => !a.uids.includes(c.uid));
      const dc = io.newCard(p, baseId);
      emit({ type: "oracle", removed: a.uids, uid: dc.uid, card: resolved(dc) });
      return fin();
    }
    case "spiegelbrunnen": {
      if (op !== "mirror") return { error: "badOp" };
      const i = deckIndex(player, a.uid);
      if (i < 0) return { error: "badTarget" };
      const src = player.deck[i];
      if (CARDS[src.baseId].unique) return { error: "uniqueCard" };
      const mods = [];
      for (const m of src.mods) {
        if (m.kind === "sigilAdd" || m.kind === "sigilRemove") mods.push({ ...m });
        if (m.kind === "fuse") for (const sg of m.sigils) mods.push({ kind: "sigilAdd", sigil: sg });
      }
      mods.push({ kind: "mark", mark: "mirrored" });
      const dc = io.newCard(p, src.baseId, mods);
      emit({ type: "copied", from: src.uid, uid: dc.uid, card: resolved(dc), flaw: null });
      return fin();
    }
    case "wachszieher": {
      if (op !== "accept") return { error: "badOp" };
      for (const dc of player.deck) {
        const def = CARDS[dc.baseId];
        if (def.cost.type === "wax") dc.mods.push({ kind: "cost", delta: -1 });
        if (def.cost.type === "blood") dc.mods.push({ kind: "stat", health: -1, source: "wachszieher" });
      }
      emit({ type: "deckChanged", reason: "wachszieher" });
      return fin();
    }
    case "mondfinsternis": {
      if (op !== "choose") return { error: "badOp" };
      const i = deckIndex(player, a.uid);
      if (i < 0) return { error: "badTarget" };
      player.deck[i].mods.push({ kind: "sigilAdd", sigil: "wiedergaenger" });
      const others = player.deck.filter((/** @type {any} */ c) => c.uid !== a.uid);
      let victim = null;
      if (others.length) {
        victim = others[randInt(s, others.length)];
        victim.mods.push({ kind: "sigilAdd", sigil: "kerzendocht:3" });
      }
      emit({ type: "eclipse", uid: a.uid, victim: victim?.uid ?? null, card: resolved(player.deck[i]), victimCard: victim ? resolved(victim) : null });
      return fin();
    }
    case "gluecksspieler": {
      if (op !== "bet") return { error: "badOp" };
      const amount = Math.floor(Number(a.amount));
      if (!Number.isFinite(amount) || amount < 1 || amount > player.shards) return { error: "badAmount" };
      const win = rand(s) < 0.5;
      player.shards += win ? amount : -amount;
      emit({ type: "gamble", amount, win, shards: player.shards });
      return fin();
    }
    case "stammestreue": {
      if (op !== "choose") return { error: "badOp" };
      if (!zirkelOf(match).tribes.some((t) => t.id === a.tribe)) return { error: "badTribe" };
      for (const dc of player.deck) {
        const def = CARDS[dc.baseId];
        if (def.tribe === a.tribe) dc.mods.push({ kind: "stat", health: 1, source: "treue" });
        else if (resolved(dc).attack > 0) dc.mods.push({ kind: "stat", attack: -1, source: "treue" });
      }
      emit({ type: "deckChanged", reason: "stammestreue", tribe: a.tribe });
      return fin();
    }
    default:
      return fin();
  }
}

/**
 * Standard-Operation bei Zeitablauf (erste Option bzw. verlassen).
 * @param {any} scene
 */
export function defaultOp(scene) {
  switch (scene.kind) {
    case "cardChoice": return scene.offers.length ? { op: "pick", index: 0 } : { op: "skip" };
    case "shrine": return scene.taken ? { op: "leave" } : { op: "take", index: 0 };
    case "campfire":
    case "merchant": return { op: "leave" };
    case "event": return { op: "skip" };
    default: return { op: "skip" };
  }
}
