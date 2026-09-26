// engine/ai/index.js — KI-Gegner für Übung und Balancing-Tool (gleiche Engine, gleiche KI).
//
//   leicht   zufällige legale Züge mit einfachen Heuristiken
//   normal   1-Zug-Lookahead: jede Kandidat-Aktion wird angewandt, der Zug zu Ende gespielt und bewertet (gierig)
//   schwer   2-Zug-Lookahead: zusätzlich die Angriffsphase des Gegners im Folgezug (nur öffentliche Information)
//            plus Draft- und Pfad-Heuristiken (Synergien, Kostenmischung, Risiko am Lagerfeuer)
//
// Die KI sieht im Kampf nur, was ein Spieler sehen dürfte (Hand/Deck des Gegners nicht).

import { battleAction, Resolver, LANES, HAND_LIMIT } from "../battle.js";
import { deepClone, awaiting } from "../match.js";
import { CARDS, cardValue, costBudget, resolveCard } from "../cards.js";
import { pickable, poolCard } from "../draft.js";
import { reachable } from "../path.js";
import { parseSigil, sigilPower } from "../sigils/index.js";
import { rand, randInt } from "../rng.js";
import { MIN_DECK } from "../../data/events.js";
import { MAX_ITEMS } from "../../data/items.js";

/** @typedef {"easy"|"normal"|"hard"} AiLevel */

/**
 * Nächste Aktion der KI für Spieler `p` (oder null, wenn sie nichts tun muss).
 * @param {any} match @param {0|1} p @param {AiLevel} level @param {{ rng: number }} rng Zufall der KI (nicht der des Spiels)
 */
export function aiAction(match, p, level, rng) {
  if (!awaiting(match).includes(p)) return null;
  switch (match.phase) {
    case "draft": return draftChoice(match, p, level, rng);
    case "extras": return extrasChoice(match, p);
    case "battle": return battleChoice(match.battle, p, level, rng);
    case "path": return pathChoice(match, p, level, rng);
    case "interlude": return { type: "chooseStarter", player: p, starter: p };
    default: return null;
  }
}

// ───────────────────────── Bewertung von Karten ─────────────────────────

/** Grobe Stärke einer Karte, unabhängig vom Kontext. @param {any} def */
export function cardScore(def) {
  const rarityBonus = { common: 0, uncommon: 0.6, rare: 1.3, legendary: 2.2 }[def.rarity] || 0;
  const eff = cardValue(def) - costBudget(def.cost);
  const raw = cardValue(def);
  return raw * 0.55 + eff * 1.2 + rarityBonus;
}

/** @param {any} dc Deckkarte */
function deckCardScore(dc) {
  const c = resolveCard(dc.baseId, dc.mods, dc.uid);
  const def = CARDS[dc.baseId];
  const pseudo = { ...def, attack: c.special ? { special: c.special } : c.attack, health: c.health, sigils: c.sigils, cost: c.cost };
  return cardScore(pseudo);
}

// ───────────────────────── Draft ─────────────────────────

/** @param {any} match @param {0|1} p @param {AiLevel} level @param {{rng:number}} rng */
function draftChoice(match, p, level, rng) {
  const d = match.draft;
  const options = pickable(d, p, match.legends);
  if (!options.length) return null;
  if (level === "easy") return { type: "draftPick", player: p, pid: options[randInt(rng, options.length)] };
  const mine = d.picks[p].filter(Boolean).map((/** @type {string} */ pid) => CARDS[poolCard(d, pid).baseId]);
  const tribes = new Map();
  const costs = { blood: 0, bones: 0, wax: 0 };
  for (const c of mine) {
    tribes.set(c.tribe, (tribes.get(c.tribe) || 0) + 1);
    costs[c.cost.type] += 1;
  }
  let best = options[0];
  let bestScore = -Infinity;
  for (const pid of options) {
    const def = CARDS[poolCard(d, pid).baseId];
    let score = cardScore(def) + rand(rng) * 0.3;
    if (level === "hard") {
      score += (tribes.get(def.tribe) || 0) * 0.35;
      // Opfer-Futter wird gebraucht, wenn viele Blutkarten da sind
      if (def.cost.type === "blood" && def.cost.amount === 0) score += costs.blood * 0.15;
      // Knochenkarten ohne Knochen-Motor sind schwächer
      if (def.cost.type === "bones" && def.cost.amount >= 6) score -= 0.4;
      if (def.cost.type === "wax" && def.cost.amount >= 5) score -= 0.3;
    }
    if (score > bestScore) { bestScore = score; best = pid; }
  }
  return { type: "draftPick", player: p, pid: best };
}

/** @param {any} match @param {0|1} p */
function extrasChoice(match, p) {
  const d = match.draft;
  const mine = d.picks[p].map((/** @type {string} */ pid) => CARDS[poolCard(d, pid).baseId]);
  const tribes = new Map();
  const costs = { blood: 0, bones: 0, wax: 0 };
  for (const c of mine) {
    tribes.set(c.tribe, (tribes.get(c.tribe) || 0) + 1);
    costs[c.cost.type] += 1;
  }
  let head = 0;
  let best = -1;
  d.heads.forEach((/** @type {any} */ h, /** @type {number} */ i) => {
    const score = h.head.kind === "tribe" ? (tribes.get(h.head.tribe) || 0) : 1.5;
    if (score > best) { best = score; head = i; }
  });
  const side = costs.bones >= costs.blood && costs.bones >= costs.wax ? "knochenkaefer" : costs.wax > costs.blood ? "wachsling" : "moorling";
  return { type: "draftExtras", player: p, head, side };
}

// ───────────────────────── Kampf ─────────────────────────

/**
 * Bewertung eines Kampfzustands aus Sicht von `p`.
 * @param {any} b @param {0|1} p
 */
export function evaluateBattle(b, p) {
  if (b.phase === "over") return b.winner === p ? 10000 + b.overkill : -10000;
  const r = new Resolver(b);
  const q = 1 - p;
  const scale = p === 0 ? b.scale : -b.scale;
  let score = scale * 12;
  // Nahe am Verlust ist schlimmer als linear
  if (scale <= -3) score -= (scale + 2) * (scale + 2) * 6;
  if (scale >= 3) score += (scale - 2) * (scale - 2) * 4;
  for (const side of [p, q]) {
    const sign = side === p ? 1 : -1;
    for (const u of r.units(side)) {
      const atk = r.attackOf(u);
      // Präsenz: jede Karte auf dem Feld ist auch Opfer-Futter für Blutkarten
      let v = 0.6 + atk * 1.6 + Math.max(0, u.health) * 0.9;
      for (const [id, n] of r.sigilList(u)) v += Math.max(-1, sigilPower(id + (n > 1 ? `:${n}` : ""))) * 0.5;
      if (u.zone === "back") v *= 0.75;
      if (u.wick !== null) v *= Math.min(1, 0.4 + u.wick * 0.2);
      score += sign * v;
    }
    // Bedrohung: gegnerische Frontkarten ohne Blocker → direkter Schaden im nächsten Zug
    const other = side === p ? q : p;
    for (let l = 0; l < LANES; l++) {
      const u = b.players[side].front[l];
      if (!u) continue;
      const blocker = b.players[other].front[l];
      const flying = r.level(u, "schwinge") > 0;
      if (!blocker || (flying && r.level(blocker, "hochwuchs") === 0)) score += sign * r.attackOf(u) * 2.2;
    }
  }
  const P = b.players[p];
  score += P.bones * 0.35 + P.wax * 0.45 + Math.min(P.hand.length, 6) * 0.6 + P.items.length * 0.8 + P.bloodBonus * 0.8;
  const Q = b.players[q];
  score -= Q.bones * 0.2 + Q.wax * 0.25 + Math.min(Q.hand.length, 6) * 0.6;
  return score;
}

/**
 * Alle sinnvollen Kandidaten-Aktionen im aktuellen Zug (ohne Ziehen/Abwerfen/Seher).
 * @param {any} b @param {0|1} p
 */
export function candidateActions(b, p) {
  const r = new Resolver(b);
  const P = b.players[p];
  /** @type {any[]} */
  const out = [];
  const own = r.units(p);
  for (const card of P.hand) {
    const cost = card.cost;
    if (cost.type === "bones" && P.bones < cost.amount) continue;
    if (cost.type === "wax" && P.wax < cost.amount) continue;
    /** @type {Array<any[]>} */
    let sacSets = [[]];
    if (cost.type === "blood") {
      const need = Math.max(0, cost.amount - P.bloodBonus);
      if (need > 0) sacSets = sacrificeSets(r, own, need).slice(0, 2);
      if (!sacSets.length) continue;
    }
    for (const sacs of sacSets) {
      const freed = new Set(sacs.filter((u) => r.level(u, "ewigesopfer") === 0).map((u) => `${u.zone}${u.lane}`));
      for (const zone of /** @type {const} */ (["front", "back"])) {
        for (let lane = 0; lane < LANES; lane++) {
          if (P[zone][lane] && !freed.has(`${zone}${lane}`)) continue;
          out.push({ type: "play", player: p, uid: card.uid, zone, lane, sacrifices: sacs.map((u) => ({ zone: u.zone, lane: u.lane })) });
        }
      }
    }
  }
  for (const it of P.items) {
    for (const target of itemTargets(r, p, it)) out.push({ type: "item", player: p, item: it, target });
  }
  for (let l = 0; l < LANES; l++) {
    const u = P.back[l];
    if (u && !P.front[l] && !u.rushed && r.level(u, "vorpreschen") > 0) out.push({ type: "rush", player: p, lane: l });
  }
  if (!P.hammerUsed) {
    for (const u of own) {
      // Hammer nur auf wertlose Karten (Nebendeck/Token) oder bald verlöschende Kerzen
      if (u.card.token || (u.wick !== null && u.wick <= 1)) out.push({ type: "hammer", player: p, zone: u.zone, lane: u.lane });
    }
  }
  return out;
}

/**
 * Minimale Opfer-Kombinationen (billigste zuerst).
 * @param {Resolver} r @param {any[]} own @param {number} need
 */
function sacrificeSets(r, own, need) {
  const cand = own.filter((u) => r.laneProp(u.owner, u.lane) !== "heilig");
  const vals = cand.map((u) => r.bloodValueOf(u));
  const worth = cand.map((u) => r.attackOf(u) * 1.5 + u.health + (u.card.token ? -2 : 0) + (r.level(u, "ewigesopfer") ? -3 : 0));
  /** @type {Array<{set: any[], cost: number}>} */
  const sets = [];
  const n = cand.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0;
    let min = Infinity;
    let cost = 0;
    const set = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += vals[i];
        min = Math.min(min, vals[i]);
        cost += worth[i];
        set.push(cand[i]);
      }
    }
    if (sum >= need && sum - min < need) sets.push({ set, cost });
  }
  sets.sort((a, b) => a.cost - b.cost);
  return sets.map((s) => s.set);
}

/** @param {Resolver} r @param {0|1} p @param {string} item */
function itemTargets(r, p, item) {
  const q = 1 - p;
  const enemies = r.units(q);
  switch (item) {
    case "schere":
    case "leimtopf":
      return enemies.map((u) => ({ zone: u.zone, lane: u.lane }));
    case "tintenfass":
    case "stundenglas":
      return enemies.filter((u) => u.zone === "front").map((u) => ({ lane: u.lane }));
    case "pinzette":
      return enemies.flatMap((u) => u.sigils.map((s) => ({ zone: u.zone, lane: u.lane, sigil: s })));
    case "moorlaterne": {
      const out = [];
      for (let l = 0; l < LANES; l++) if (!r.row(p, "front")[l]) out.push({ zone: "front", lane: l });
      return out;
    }
    case "gluehwurmglas":
      return [];
    default:
      return [{}];
  }
}

/** @param {any} b @param {any} a */
function simulate(b, a) {
  const c = deepClone(b);
  const res = battleAction(c, a);
  return res.error ? null : c;
}

/**
 * Gegnerische Angriffsphase im Folgezug grob simulieren (schwer): Er zieht aus dem Nebendeck und beendet den Zug.
 * @param {any} b @param {0|1} q
 */
function simulateOpponentAttack(b, q) {
  if (b.phase === "over" || b.active !== q) return b;
  let c = deepClone(b);
  c.pending = [];
  if (!c.players[q].drew) battleAction(c, { type: "draw", player: q, pile: "side" });
  c.pending = [];
  const res = battleAction(c, { type: "endTurn", player: q });
  return res.error ? b : c;
}

/** @param {any} b @param {0|1} p @param {AiLevel} level @param {{rng:number}} rng */
function battleChoice(b, p, level, rng) {
  const P = b.players[p];
  const pend = b.pending[0];
  if (pend?.kind === "discard") {
    let worst = P.hand[P.hand.length - 1];
    let ws = Infinity;
    for (const c of P.hand) {
      const s = cardScore({ ...CARDS[c.baseId], attack: c.special ? { special: c.special } : c.attack, health: c.health, sigils: c.sigils, cost: c.cost });
      if (s < ws) { ws = s; worst = c; }
    }
    return { type: "discard", player: p, uid: worst.uid };
  }
  if (pend?.kind === "seer") {
    const order = Array.from({ length: pend.count }, (_, i) => i);
    if (level !== "easy") {
      const shown = P.deck.slice(-pend.count).reverse();
      order.sort((i, j) => cardScore(CARDS[shown[j].baseId]) - cardScore(CARDS[shown[i].baseId]));
    }
    return { type: "seer", player: p, order };
  }
  if (!P.drew) {
    const wantSide = P.deck.length === 0 || (P.hand.length >= 6 && level !== "easy") ||
      (level !== "easy" && P.hand.every((/** @type {any} */ c) => c.cost.type === "blood" && c.cost.amount > 0) && new Resolver(b).units(p).length === 0);
    return { type: "draw", player: p, pile: wantSide ? "side" : "main" };
  }
  const cands = candidateActions(b, p);
  if (level === "easy") {
    // Leicht: meistens die erste spielbare Karte an einen zufälligen passenden Platz, sonst Zug beenden
    const plays = cands.filter((a) => a.type === "play" && a.zone === "front");
    if (plays.length && rand(rng) < 0.8) return plays[randInt(rng, plays.length)];
    const any = cands.filter((a) => a.type === "play");
    if (any.length && rand(rng) < 0.5) return any[randInt(rng, any.length)];
    return { type: "endTurn", player: p };
  }
  const evalAfterTurn = (/** @type {any} */ state) => {
    if (!state) return -Infinity;
    if (state.phase === "over") return evaluateBattle(state, p);
    const ended = simulate(state, { type: "endTurn", player: p });
    if (!ended) return evaluateBattle(state, p);
    if (level === "hard") return evaluateBattle(simulateOpponentAttack(ended, /** @type {0|1} */ (1 - p)), p);
    return evaluateBattle(ended, p);
  };
  const baseline = evalAfterTurn(b);
  let best = { type: "endTurn", player: p };
  let bestScore = baseline;
  for (const a of cands) {
    const after = simulate(b, a);
    if (!after) continue;
    // Offene Wahl (Seher/Abwerfen) nach der Aktion: Standard auflösen, damit das Zug-Ende simuliert werden kann
    let settled = after;
    let guard = 0;
    while (settled.pending.length && guard++ < 6) {
      const pa = battleChoice(settled, p, "easy", rng);
      const next = pa ? simulate(settled, pa) : null;
      if (!next) break;
      settled = next;
    }
    const score = evalAfterTurn(settled) + (a.type === "hammer" ? -0.5 : 0) + (a.type === "item" ? -1.5 : 0);
    if (score > bestScore + 0.05) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

// ───────────────────────── Pfad ─────────────────────────

const NODE_PRIORITY = { cardChoice: 8, campfire: 7, fuse: 6, transfer: 5, merchant: 4, shrine: 4, copyist: 5, remove: 2, event: 3 };

/** @param {any} match @param {0|1} p @param {AiLevel} level @param {{rng:number}} rng */
function pathChoice(match, p, level, rng) {
  const pp = match.path.players[p];
  const player = match.players[p];
  if (!pp.scene) {
    const options = reachable(pp.strand);
    if (level === "easy") return { type: "chooseNode", player: p, strand: options[randInt(rng, options.length)] };
    let best = options[0];
    let bs = -Infinity;
    for (const st of options) {
      const node = match.path.map.nodes[pp.level][st];
      let s = NODE_PRIORITY[node.type] || 1;
      if (node.type === "fuse" && !hasPair(player.deck)) s = 0;
      if (node.type === "merchant" && (player.shards < 3 || player.items.length >= MAX_ITEMS)) s = 0.5;
      if (node.type === "remove" && player.deck.length <= MIN_DECK + 2) s = 0;
      if (node.type === "transfer" && player.deck.length <= MIN_DECK) s = 0;
      s += rand(rng) * 0.5;
      if (s > bs) { bs = s; best = st; }
    }
    return { type: "chooseNode", player: p, strand: best };
  }
  return sceneChoice(match, p, pp.scene, level, rng);
}

/** @param {any[]} deck */
function hasPair(deck) {
  const seen = new Set();
  for (const c of deck) {
    if (seen.has(c.baseId)) return true;
    seen.add(c.baseId);
  }
  return false;
}

/** @param {any[]} deck @param {boolean} [allowUnique] */
function rankDeck(deck, allowUnique = true) {
  return [...deck].filter((c) => allowUnique || !CARDS[c.baseId].unique).sort((a, b) => deckCardScore(b) - deckCardScore(a));
}

/** @param {any} match @param {0|1} p @param {any} scene @param {AiLevel} level @param {{rng:number}} rng */
function sceneChoice(match, p, scene, level, rng) {
  const player = match.players[p];
  const act = (/** @type {any} */ x) => ({ type: "nodeAction", player: p, ...x });
  const ranked = rankDeck(player.deck);
  switch (scene.kind) {
    case "cardChoice": {
      if (!scene.offers.length) return act({ op: "skip" });
      if (scene.variant === "hidden" || level === "easy") return act({ op: "pick", index: randInt(rng, scene.offers.length) });
      let bi = 0;
      let bs = -Infinity;
      scene.offers.forEach((/** @type {string} */ id, /** @type {number} */ i) => {
        const s = cardScore(CARDS[id]);
        if (s > bs) { bs = s; bi = i; }
      });
      return act({ op: "pick", index: bi });
    }
    case "fuse": {
      const byBase = new Map();
      for (const c of ranked) {
        if (byBase.has(c.baseId)) return act({ op: "fuse", a: byBase.get(c.baseId), b: c.uid });
        byBase.set(c.baseId, c.uid);
      }
      return act({ op: "skip" });
    }
    case "transfer": {
      if (player.deck.length <= MIN_DECK) return act({ op: "skip" });
      const weakest = [...ranked].reverse().find((c) => resolveCard(c.baseId, c.mods).sigils.some((s) => sigilPower(s) > 0.9 && parseSigil(s).id !== "fluchmal"));
      const target = ranked.find((c) => c !== weakest && resolveCard(c.baseId, c.mods).sigils.length < 3);
      if (!weakest || !target) return act({ op: "skip" });
      const sig = resolveCard(weakest.baseId, weakest.mods).sigils.filter((s) => parseSigil(s).id !== "fluchmal").sort((x, y) => sigilPower(y) - sigilPower(x))[0];
      return act({ op: "transfer", donor: weakest.uid, target: target.uid, sigil: sig });
    }
    case "campfire": {
      const risk = [0, 0.2, 0.45, 0.7][scene.uses] ?? 1;
      const limit = level === "hard" ? 0.2 : level === "normal" ? 0 : 0.45;
      if (scene.uses > 0 && risk > limit) return act({ op: "leave" });
      const uid = scene.target || ranked[0]?.uid;
      if (!uid) return act({ op: "leave" });
      const c = player.deck.find((/** @type {any} */ x) => x.uid === uid);
      const r = resolveCard(c.baseId, c.mods);
      return act({ op: "boost", uid, stat: r.attack >= 1 || r.special ? "attack" : "health" });
    }
    case "remove": {
      if (player.deck.length <= MIN_DECK + 2) return act({ op: "skip" });
      return act({ op: "remove", uid: ranked[ranked.length - 1].uid });
    }
    case "merchant": {
      const i = scene.offers.findIndex((/** @type {any} */ o) => !o.sold && o.price <= player.shards);
      if (i < 0 || player.items.length >= MAX_ITEMS) return act({ op: "leave" });
      return act({ op: "buy", index: i });
    }
    case "shrine": {
      if (!scene.taken) {
        // Basis bevorzugen, wenn noch keine passende da ist
        const idx = scene.offers.findIndex((/** @type {any} */ o) => o.base);
        return act({ op: "take", index: idx >= 0 ? idx : 0 });
      }
      const build = bestTotem(player);
      if (build) return act({ op: "assemble", head: build.head, base: build.base });
      return act({ op: "leave" });
    }
    case "copyist": {
      const best = rankDeck(player.deck, false)[0];
      return best ? act({ op: "copy", uid: best.uid }) : act({ op: "skip" });
    }
    case "event":
      return eventChoice(match, p, scene, level, rng, ranked);
    default:
      return act({ op: "skip" });
  }
}

/** Beste noch nicht gebaute Totem-Kombination (oder null). @param {any} player */
function bestTotem(player) {
  const tribes = new Map();
  for (const c of player.deck) tribes.set(CARDS[c.baseId].tribe, (tribes.get(CARDS[c.baseId].tribe) || 0) + 1);
  let best = null;
  let bs = 0;
  player.heads.forEach((/** @type {any} */ h, /** @type {number} */ hi) => {
    player.bases.forEach((/** @type {any} */ b, /** @type {number} */ bi) => {
      if (h.kind === "tribe" && b.kind !== "sigil") return;
      const slot = h.kind === "tribe" ? "tribe" : "lane";
      const cur = player.totems[slot];
      const weight = h.kind === "tribe" ? (tribes.get(h.tribe) || 0) : 3;
      const power = b.kind === "sigil" ? sigilPower(b.sigil) : 1.5;
      const score = weight * power;
      const curScore = cur ? (cur.head.kind === "tribe" ? (tribes.get(cur.head.tribe) || 0) : 3) * (cur.base.kind === "sigil" ? sigilPower(cur.base.sigil) : 1.5) : 0;
      if (score > curScore + 0.5 && score > bs) { bs = score; best = { head: hi, base: bi }; }
    });
  });
  return best;
}

/** @param {any} match @param {0|1} p @param {any} scene @param {AiLevel} level @param {{rng:number}} rng @param {any[]} ranked */
function eventChoice(match, p, scene, level, rng, ranked) {
  const player = match.players[p];
  const act = (/** @type {any} */ x) => ({ type: "nodeAction", player: p, ...x });
  const worst = [...ranked].reverse();
  switch (scene.event) {
    case "faehrmann": {
      const c = worst.find((x) => CARDS[x.baseId].rarity !== "legendary");
      return c ? act({ op: "swap", uid: c.uid }) : act({ op: "skip" });
    }
    case "tintenwitwe":
      return act({ op: level === "easy" && rand(rng) < 0.5 ? "accept" : "decline" });
    case "knochenorakel":
      if (player.deck.length - 1 < MIN_DECK || worst.length < 2 || !scene.offers?.length) return act({ op: "skip" });
      return act({ op: "offer", uids: [worst[0].uid, worst[1].uid], pick: 0 });
    case "spiegelbrunnen": {
      const c = rankDeck(player.deck, false)[0];
      return c ? act({ op: "mirror", uid: c.uid }) : act({ op: "skip" });
    }
    case "wachszieher": {
      let wax = 0;
      let blood = 0;
      for (const c of player.deck) {
        const t = CARDS[c.baseId].cost.type;
        if (t === "wax") wax++;
        if (t === "blood") blood++;
      }
      return act({ op: wax > blood ? "accept" : "decline" });
    }
    case "mondfinsternis":
      return ranked[0] ? act({ op: "choose", uid: ranked[0].uid }) : act({ op: "skip" });
    case "gluecksspieler":
      if (player.shards >= 4 && (level === "easy" || rand(rng) < 0.3)) return act({ op: "bet", amount: Math.floor(player.shards / 2) });
      return act({ op: "leave" });
    case "stammestreue": {
      const tribes = new Map();
      for (const c of player.deck) tribes.set(CARDS[c.baseId].tribe, (tribes.get(CARDS[c.baseId].tribe) || 0) + 1);
      const [tribe, n] = [...tribes.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
      if (!tribe || n < player.deck.length * 0.5) return act({ op: "skip" });
      return act({ op: "choose", tribe });
    }
    default:
      return act({ op: "skip" });
  }
}

export { HAND_LIMIT };
