// Test-Helfer: Kampfzustände gezielt aufbauen, ohne Draft und Zufall.
import { createBattle, battleAction, Resolver } from "../engine/battle.js";
import { resolveCard, CARDS } from "../engine/cards.js";

let seq = 0;

/**
 * Karte als Deckkarte.
 * @param {string} baseId @param {any[]} [mods]
 */
export function dc(baseId, mods = []) {
  seq += 1;
  return { uid: `t${seq}`, baseId, mods };
}

/**
 * Kampf mit vorgegebenem Feld aufbauen.
 * Spec pro Spieler: { deck?: string[], hand?: string[], front?: (string|null)[], back?: (string|null)[], bones?, wax?,
 *   items?: string[], totems?: any, sideType? }
 * Aktiver Spieler ist `active` (Standard 0), hat bereits gezogen. `turn` (Standard 3) liegt hinter den
 * angriffslosen Eröffnungszügen.
 * @param {{ p0?: any, p1?: any, active?: 0|1, turn?: number, scale?: number }} spec
 */
export function setupBattle(spec = {}) {
  const pl = [spec.p0 || {}, spec.p1 || {}];
  const { state } = createBattle({
    battleNo: 1,
    starter: spec.active ?? 0,
    rng: 12345,
    players: pl.map((p) => ({
      deck: (p.deck || []).map((id) => dc(id)),
      sideType: p.sideType || "moorling",
      items: p.items || [],
      totems: p.totems || { tribe: null, lane: null },
    })),
  });
  const r = new Resolver(state);
  for (const q of [0, 1]) {
    const P = state.players[q];
    const p = pl[q];
    // Start-Hand verwerfen, damit Tests exakt kontrollieren
    P.hand = (p.hand || []).map((id) => resolveCard(id, [], r.newUid()));
    if (p.deck) P.deck = p.deck.map((id) => resolveCard(id, [], "")).reverse(); // deck[0] im Spec = oberste Karte
    P.bones = p.bones ?? 0;
    P.wax = p.wax ?? 0;
    for (const zone of ["front", "back"]) {
      (p[zone] || []).forEach((id, lane) => {
        if (!id) return;
        const card = resolveCard(id, [], r.newUid());
        const u = r.makeUnit(card, q, zone, lane);
        state.players[q][zone][lane] = u;
      });
    }
  }
  state.scale = spec.scale ?? 0;
  state.turn = spec.turn ?? 3;
  state.players[state.active].drew = true;
  state.pending = [];
  return state;
}

/** @param {any} state @param {any} action */
export function act(state, action) {
  const res = battleAction(state, { player: state.active, ...action });
  return res;
}

/** @param {any} state @param {number} p @param {"front"|"back"} zone @param {number} lane */
export function unitAt(state, p, zone, lane) {
  return state.players[p][zone][lane];
}

/** Zug des aktiven Spielers beenden. @param {any} state */
export function endTurn(state) {
  const p = state.active;
  state.players[p].drew = true;
  const res = battleAction(state, { type: "endTurn", player: p });
  if (res.error) throw new Error(res.error);
  return res;
}


/**
 * Testkarte registrieren (unabhängig von den echten Karten, damit Balancing-Änderungen keine Tests brechen).
 * @param {string} id
 * @param {{ attack?: number|{special: string}, health?: number, sigils?: string[], cost?: {type: string, amount: number},
 *   tribe?: string, evolvesTo?: string, rarity?: string }} o
 */
export function testCard(id, o = {}) {
  CARDS[id] = {
    id,
    name: id,
    tribe: o.tribe || "stammlose",
    cost: o.cost || { type: "blood", amount: 0 },
    attack: o.attack ?? 1,
    health: o.health ?? 1,
    sigils: o.sigils || [],
    rarity: o.rarity || "common",
    unique: o.rarity === "legendary",
    flavor: "",
    art: { silhouette: "construct", seed: 1, palette: "stammlose" },
    ...(o.evolvesTo ? { evolvesTo: o.evolvesTo } : {}),
    token: true,
  };
  return id;
}
