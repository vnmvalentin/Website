// engine/battle.js — ein Kampf: Zugablauf, Opfer, Angriff, Tod, Waage.
//
// Alle Funktionen hier MUTIEREN den übergebenen Kampfzustand. Rein nach außen wird das Ganze durch match.js:
// applyAction klont den Match-State, bevor irgendetwas hiervon aufgerufen wird.
//
// Reihenfolge-Regeln (Auftrag 6.1): aktive Seite vor passiver, Lanes links → rechts (erst Front, dann Hinterreihe),
// Sigils in Slot-Reihenfolge. Jede Hook-Auslösung verbraucht ein Stück des Ketten-Budgets (CHAIN_LIMIT pro Aktion);
// ist es aufgebraucht, feuern keine weiteren Hooks mehr — Endlosschleifen sind damit ausgeschlossen.

import { resolveCard } from "./cards.js";
import { SIGILS, parseSigil } from "./sigils/index.js";
import { shuffle } from "./rng.js";
import { applyItemEffect } from "./items.js";

/** @typedef {import("./types.js").Unit} Unit */
/** @typedef {import("./types.js").Card} Card */
/** @typedef {import("./types.js").GameEvent} GameEvent */

export const LANES = 4;
export const HAND_LIMIT = 8;
export const WAX_MAX = 6;
export const SCALE_WIN = 5;
export const STALEMATE_TURN = 30;
export const CANDLE_WARNING_TURN = 25;
export const CHAIN_LIMIT = 200;
export const CANDLE_ESCALATION = 6;

/** Gewicht des Patt-Brechers am Ende von Zug `turn` (1, alle 6 Züge eines mehr). @param {number} turn */
export function candleWeight(turn) {
  return turn < STALEMATE_TURN ? 0 : 1 + Math.floor((turn - STALEMATE_TURN) / CANDLE_ESCALATION);
}

/**
 * Erster Zug ohne Angriff (Runde 2, A1): In den ersten beiden Zügen – dem jeweils ersten eigenen Zug beider Spieler –
 * greift niemand an. Vorher konnte der Startspieler sofort auf das leere Brett des Gegners schlagen.
 */
export const NO_ATTACK_TURNS = 2;

/** Bewegungs-Sigils am Zugende (Wandern, Rammbock): laufen vor Kerzendocht und den übrigen Effekten. */
const MOVE_SIGILS = new Set(["wanderer", "rammbock"]);

/**
 * Ausgleich zwischen Start- und Zweitspieler. Als Objekt, damit Varianten gemessen werden können
 * (wax/bones/side: Bonus für den Zweiten; starterDraws: Startspieler zieht im ersten Zug; starterBones/starterWax).
 * Gemessen mit erstem Zug ohne Angriff (A1) und Überlaufschaden (A2), Balancing-Tool, KI normal, 5000 Matches:
 *   kein Ausgleich, Startspieler zieht nicht: 46,8 % · Startspieler +1 Wachs: 54,9 % · Startspieler +1 Knochen: ~55 %
 *   · Startspieler zieht + Zweiter +1 Wachs: ~55 % · Startspieler zieht nur aus dem Nebendeck: ~73 %
 *   · Startspieler zieht + Zweiter +1 Wachs +1 Knochen: 51,3 % (schwer, 2000 Matches: 50,5 %)  ← gewählt
 */
export const SECOND_PLAYER_BONUS = { wax: 1, bones: 1, side: 0, starterDraws: true, starterBones: 0, starterWax: 0 };

export const SIDE_TYPES = {
  moorling: "side_moorling",
  knochenkaefer: "side_knochenkaefer",
  wachsling: "side_wachsling",
};

/**
 * Totems eines Spielers → Auren für den Kampf.
 * @param {any} totems { tribe: {head, base}|null, lane: {head, base}|null }
 */
export function totemAuras(totems) {
  const a = { tribe: null, tribeSigil: null, lane: null, laneSigil: null, laneProp: null };
  if (totems?.tribe?.head?.kind === "tribe" && totems.tribe.base?.kind === "sigil") {
    a.tribe = totems.tribe.head.tribe;
    a.tribeSigil = totems.tribe.base.sigil;
  }
  if (totems?.lane?.head?.kind === "lane" && totems.lane.base) {
    a.lane = totems.lane.head.lane;
    if (totems.lane.base.kind === "sigil") a.laneSigil = totems.lane.base.sigil;
    else a.laneProp = totems.lane.base.prop;
  }
  return a;
}

/**
 * Neuen Kampf aufbauen.
 * @param {{ battleNo: number, starter: 0|1, rng: number,
 *   players: Array<{ deck: import("./types.js").DeckCard[], sideType: string, items: string[], totems: any }> }} opts
 */
export function createBattle(opts) {
  const state = {
    battleNo: opts.battleNo,
    turn: 1,
    active: opts.starter,
    starter: opts.starter,
    phase: "main",
    winner: /** @type {null|0|1} */ (null),
    overkill: 0,
    scale: 0,
    rng: opts.rng >>> 0,
    uidSeq: 0,
    pending: /** @type {any[]} */ ([]),
    players: opts.players.map((p) => ({
      deck: p.deck.map((dc) => resolveCard(dc.baseId, dc.mods, "")),
      hand: /** @type {Card[]} */ ([]),
      sideType: p.sideType in SIDE_TYPES ? p.sideType : "moorling",
      front: /** @type {(Unit|null)[]} */ ([null, null, null, null]),
      back: /** @type {(Unit|null)[]} */ ([null, null, null, null]),
      bones: 0,
      wax: 0,
      bloodBonus: 0,
      drew: false,
      hammerUsed: false,
      items: [...p.items],
      decay: 0,
      auras: totemAuras(p.totems),
      peek: false,
      stats: { direct: 0, sacrifices: 0, played: 0, kills: 0, damageByCard: /** @type {Record<string, number>} */ ({}) },
    })),
  };
  const r = new Resolver(state);
  for (const p of /** @type {const} */ ([0, 1])) shuffle(state, state.players[p].deck);
  r.emit({ type: "battleStart", battleNo: state.battleNo, starter: state.starter });
  for (const p of /** @type {const} */ ([0, 1])) {
    const P = state.players[p];
    const dread = P.deck.reduce((s, c) => s + (c.dread || 0), 0);
    if (dread > 0) r.addScale(1 - p, dread, "dread");
    for (let i = 0; i < 3; i++) r.drawCardFromDeck(p, "start");
    r.addToHand(p, r.newSideCard(p), "start", true);
    if (p !== state.starter) {
      for (let i = 0; i < SECOND_PLAYER_BONUS.side; i++) r.addToHand(p, r.newSideCard(p), "start", true);
      if (SECOND_PLAYER_BONUS.wax) r.gainWax(p, SECOND_PLAYER_BONUS.wax, null);
      if (SECOND_PLAYER_BONUS.bones) state.players[p].bones += SECOND_PLAYER_BONUS.bones;
    } else {
      if (SECOND_PLAYER_BONUS.starterBones) state.players[p].bones += SECOND_PLAYER_BONUS.starterBones;
      if (SECOND_PLAYER_BONUS.starterWax) r.gainWax(p, SECOND_PLAYER_BONUS.starterWax, null);
    }
  }
  r.startTurn(state.starter, !SECOND_PLAYER_BONUS.starterDraws);
  r.checkWin();
  return { state, events: r.events };
}

/**
 * Kampf-Aktion anwenden (mutiert `state`).
 * @param {any} state Kampfzustand
 * @param {any} action { type, player, ... }
 * @returns {{ events: GameEvent[], error?: string }}
 */
export function battleAction(state, action) {
  const r = new Resolver(state);
  const error = r.dispatch(action);
  return error ? { events: [], error } : { events: r.events };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

export class Resolver {
  /** @param {any} state */
  constructor(state) {
    this.state = state;
    /** @type {GameEvent[]} */
    this.events = [];
    this.budget = CHAIN_LIMIT;
    this.chainWarned = false;
  }

  // ───────────── Grundlagen ─────────────

  /** @param {GameEvent} ev */
  emit(ev) {
    this.events.push(ev);
  }

  get over() {
    return this.state.phase === "over";
  }

  /** @param {number} p */
  P(p) {
    return this.state.players[p];
  }

  /** @param {number} p @param {"front"|"back"} zone @returns {(Unit|null)[]} */
  row(p, zone) {
    return this.state.players[p][zone];
  }

  newUid() {
    this.state.uidSeq += 1;
    return `u${this.state.uidSeq}`;
  }

  /** Einheiten eines Spielers: Front 0..3, dann Hinterreihe 0..3. @param {number} p @returns {Unit[]} */
  units(p) {
    const P = this.state.players[p];
    const out = [];
    for (const u of P.front) if (u) out.push(u);
    for (const u of P.back) if (u) out.push(u);
    return out;
  }

  /** @param {Unit} u */
  onBoard(u) {
    return !!u && this.row(u.owner, u.zone)[u.lane] === u;
  }

  /** Auf dem Feld und nicht tödlich getroffen. @param {Unit} u */
  alive(u) {
    return this.onBoard(u) && u.health > 0;
  }

  /** Sigils einer Einheit inkl. Totem-Auren, dedupliziert (höchste Stufe zählt). @param {Unit} u */
  sigilList(u) {
    /** @type {Map<string, number>} */
    const map = new Map();
    const add = (/** @type {string} */ ref) => {
      const { id, n } = parseSigil(ref);
      if (!SIGILS[id]) return;
      map.set(id, Math.max(map.get(id) || 0, n));
    };
    for (const ref of u.sigils) add(ref);
    const a = this.state.players[u.owner].auras;
    if (a.tribeSigil && a.tribe === u.card.tribe) add(a.tribeSigil);
    if (a.laneSigil && a.lane === u.lane) add(a.laneSigil);
    return map;
  }

  /** @param {Unit} u @param {string} id */
  level(u, id) {
    return this.sigilList(u).get(id) || 0;
  }

  /** Lanen-Eigenschaft des Totems von `p` in `lane`. @param {number} p @param {number} lane */
  laneProp(p, lane) {
    const a = this.state.players[p].auras;
    return a.lane === lane ? a.laneProp : null;
  }

  /**
   * Hook aller Sigils einer Einheit auslösen.
   * @param {Unit} u @param {string} hook @param {...any} args
   */
  /**
   * Hook aller Sigils einer Einheit ausführen.
   * Für onTurnEnd: `only`/`except` (Set von Sigil-IDs) teilen die Zugende-Effekte in feste Schritte.
   * @param {Unit} u @param {string} hook @param {...any} args
   */
  runHook(u, hook, ...args) {
    /** @type {Set<string>|null} */
    let only = null;
    /** @type {Set<string>|null} */
    let except = null;
    if (hook === "onTurnEnd") {
      only = args[0] || null;
      except = args[1] || null;
      args = [];
    }
    for (const [id, n] of this.sigilList(u)) {
      if ((only && !only.has(id)) || (except && except.has(id))) continue;
      const fn = SIGILS[id].hooks[hook];
      if (!fn) continue;
      if (!this.spend()) return;
      fn(this, u, ...args, n);
      if (this.over) return;
    }
  }

  /**
   * Hook als Reduktion (Rückgabewert wird durchgereicht).
   * @template T
   * @param {Unit} u @param {string} hook @param {T} value @param {...any} args
   * @returns {T}
   */
  reduceHook(u, hook, value, ...args) {
    let v = value;
    for (const [id, n] of this.sigilList(u)) {
      const fn = SIGILS[id].hooks[hook];
      if (!fn) continue;
      v = fn(this, u, v, ...args, n);
    }
    return v;
  }

  spend() {
    if (this.budget <= 0) {
      if (!this.chainWarned) {
        this.chainWarned = true;
        this.emit({ type: "chainLimit" });
      }
      return false;
    }
    this.budget -= 1;
    return true;
  }

  // ───────────── Werte ─────────────

  /** @param {Unit} u */
  opposing(u) {
    if (u.zone !== "front") return null;
    return this.row(1 - u.owner, "front")[u.lane];
  }

  /** @param {Unit} u */
  specialValue(u) {
    const P = this.state.players[u.owner];
    switch (u.special) {
      case "schwarmzahl":
        return this.units(u.owner).filter((o) => o.card.tribe === "schwaerme").length;
      case "knochenlast":
        return Math.floor(P.bones / 3);
      case "flammenmass":
        return Math.floor(P.wax / 2);
      case "handschwere":
        return P.hand.length;
      default:
        return 0;
    }
  }

  /**
   * Effektiver Angriff.
   * @param {Unit} u @param {boolean} [noMirror]
   */
  attackOf(u, noMirror = false) {
    let a = u.special ? this.specialValue(u) + u.attack : u.attack;
    const sig = this.sigilList(u);
    if (sig.get("spiegelbild")) {
      const o = this.opposing(u);
      a = o && !noMirror ? this.attackOf(o, true) : 0;
    }
    a = this.reduceHook(u, "selfAttack", 0) + a;
    // Auren eigener Nachbarn (Leittier)
    for (const s of this.units(u.owner)) {
      if (s === u) continue;
      a += this.reduceHook(s, "auraAttack", 0, u);
    }
    if (this.laneProp(u.owner, u.lane) === "wut") a += 1;
    if (u.zone === "front") {
      const o = this.opposing(u);
      if (o) a -= this.level(o, "stinkdruese");
      if (this.laneProp(1 - u.owner, u.lane) === "wegzoll") a -= 1;
    }
    return Math.max(0, a);
  }

  /** Blutwert beim Opfern. @param {Unit} u */
  bloodValueOf(u) {
    let v = this.reduceHook(u, "bloodValue", 1);
    if (this.laneProp(u.owner, u.lane) === "blutquelle") v += 1;
    return v;
  }

  // ───────────── Ressourcen & Waage ─────────────

  /**
   * Waage zugunsten von `p` verschieben.
   * @param {number} p @param {number} n @param {string} reason @param {string} [sourceUid]
   */
  addScale(p, n, reason, sourceUid) {
    if (n <= 0 || this.over) return;
    this.state.scale += p === 0 ? n : -n;
    if (reason === "attack" || reason === "overflow") this.state.players[p].stats.direct += n;
    this.emit({ type: "scale", player: p, amount: n, scale: this.state.scale, reason, source: sourceUid });
    this.checkWin();
  }

  checkWin() {
    const s = this.state;
    if (s.phase === "over") return;
    if (s.scale >= SCALE_WIN || s.scale <= -SCALE_WIN) {
      s.phase = "over";
      s.winner = s.scale > 0 ? 0 : 1;
      s.overkill = Math.abs(s.scale) - SCALE_WIN;
      s.pending = [];
      this.emit({ type: "battleEnd", winner: s.winner, overkill: s.overkill, scale: s.scale });
    }
  }

  /** @param {number} p @param {number} n @param {Unit|null} src */
  gainBones(p, n, src) {
    if (n <= 0) return;
    this.state.players[p].bones += n;
    this.emit({ type: "bones", player: p, amount: n, total: this.state.players[p].bones, source: src?.uid });
  }

  /** @param {number} p @param {number} n @param {Unit|null} src */
  gainWax(p, n, src) {
    const P = this.state.players[p];
    const before = P.wax;
    P.wax = Math.min(WAX_MAX, P.wax + n);
    if (P.wax !== before) this.emit({ type: "wax", player: p, amount: P.wax - before, total: P.wax, source: src?.uid });
  }

  // ───────────── Karten & Hand ─────────────

  /** @param {number} p */
  newSideCard(p) {
    const id = SIDE_TYPES[this.state.players[p].sideType] || SIDE_TYPES.moorling;
    return resolveCard(id, [], this.newUid());
  }

  /**
   * Karte auf die Hand. Der aktive Spieler darf über das Limit ziehen und muss dann abwerfen; der passive
   * Spieler verbrennt eine überzählige Karte sofort (er ist gerade nicht am Zug, um zu entscheiden).
   * @param {number} p @param {Card} card @param {string} reason @param {boolean} [hidden] Karte nur für p sichtbar
   */
  addToHand(p, card, reason, hidden = false) {
    const P = this.state.players[p];
    if (!card.uid) card.uid = this.newUid();
    if (P.hand.length >= HAND_LIMIT && p !== this.state.active) {
      this.emit({ type: "burn", player: p, card, reason });
      return;
    }
    P.hand.push(card);
    /** @type {GameEvent} */
    const ev = { type: "handAdd", player: p, uid: card.uid, card, reason, handSize: P.hand.length };
    if (hidden) ev.private = /** @type {0|1} */ (p);
    this.emit(ev);
    this.queueDiscardIfNeeded(p);
  }

  /** @param {number} p */
  queueDiscardIfNeeded(p) {
    const P = this.state.players[p];
    if (P.hand.length > HAND_LIMIT && p === this.state.active && !this.state.pending.some((x) => x.kind === "discard")) {
      this.state.pending.push({ kind: "discard", player: p });
      this.emit({ type: "mustDiscard", player: p });
    }
  }

  /**
   * Oberste Karte des Hauptdecks ziehen (ohne Verwesung). Gibt false zurück, wenn das Deck leer ist.
   * @param {number} p @param {string} reason
   */
  drawCardFromDeck(p, reason) {
    const P = this.state.players[p];
    const card = P.deck.pop();
    if (!card) return false;
    // Eine offene Seher-Wahl zeigt nie mehr Karten, als noch im Deck liegen
    for (const pend of this.state.pending) {
      if (pend.kind === "seer" && pend.player === p) pend.count = Math.min(pend.count, P.deck.length);
    }
    this.state.pending = this.state.pending.filter((/** @type {any} */ x) => !(x.kind === "seer" && x.count <= 0));
    card.uid = this.newUid();
    this.emit({ type: "draw", player: p, pile: "main", uid: card.uid, card, private: p, deckSize: P.deck.length, reason });
    // addToHand ohne zweites Ereignis
    if (P.hand.length >= HAND_LIMIT && p !== this.state.active) {
      this.emit({ type: "burn", player: p, card, reason });
      return true;
    }
    P.hand.push(card);
    this.queueDiscardIfNeeded(p);
    return true;
  }

  /** @param {number} p @param {number} n @param {string} reason */
  drawMain(p, n, reason) {
    for (let i = 0; i < n; i++) {
      if (!this.drawCardFromDeck(p, reason)) {
        this.emit({ type: "deckEmpty", player: p, reason });
        return;
      }
    }
  }

  /** Seher: die obersten 3 Karten ansehen und neu ordnen (Wahl des Spielers). @param {number} p */
  startSeer(p) {
    const P = this.state.players[p];
    const n = Math.min(3, P.deck.length);
    if (n === 0) return;
    this.state.pending.push({ kind: "seer", player: p, count: n });
    this.emit({ type: "seer", player: p, count: n, cards: P.deck.slice(-n).reverse(), private: p });
  }

  // ───────────── Einheiten ─────────────

  /**
   * @param {Card} card @param {0|1} owner @param {"front"|"back"} zone @param {number} lane
   * @returns {Unit}
   */
  makeUnit(card, owner, zone, lane) {
    const wickRef = card.sigils.find((s) => parseSigil(s).id === "kerzendocht");
    const u = {
      uid: card.uid,
      card,
      owner,
      zone,
      lane,
      attack: card.attack,
      special: card.special,
      health: card.health,
      maxHealth: card.health,
      sigils: [...card.sigils],
      turns: 0,
      wick: wickRef ? parseSigil(wickRef).n : null,
      submerged: false,
      dir: /** @type {1|-1} */ (1),
      shieldUsed: false,
      glued: 0,
      stunned: false,
      rushed: false,
    };
    const prop = this.laneProp(owner, lane);
    if (prop === "heilig") { u.health += 2; u.maxHealth += 2; }
    if (prop === "wut") { u.health = Math.max(1, u.health - 1); u.maxHealth = Math.max(1, u.maxHealth - 1); }
    return u;
  }

  /** @param {Unit} u */
  place(u) {
    this.row(u.owner, u.zone)[u.lane] = u;
  }

  /**
   * Token/Folgekarte erzeugen.
   * @param {number} p @param {"front"|"back"} zone @param {number} lane @param {string} baseId @param {string} reason
   * @param {import("./types.js").Mod[]} [mods]
   */
  spawn(p, zone, lane, baseId, reason, mods) {
    if (this.row(p, zone)[lane]) return null;
    const card = resolveCard(baseId, mods || [], this.newUid());
    const u = this.makeUnit(card, /** @type {0|1} */ (p), zone, lane);
    this.place(u);
    this.emit({ type: "spawn", player: p, uid: u.uid, zone, lane, card, reason });
    return u;
  }

  /**
   * @param {Unit} u @param {"front"|"back"} zone @param {number} lane @param {string} reason
   */
  moveUnit(u, zone, lane, reason) {
    if (!this.onBoard(u) || this.row(u.owner, zone)[lane]) return false;
    const from = { zone: u.zone, lane: u.lane };
    this.row(u.owner, u.zone)[u.lane] = null;
    u.zone = zone;
    u.lane = lane;
    this.row(u.owner, zone)[lane] = u;
    this.emit({ type: "move", player: u.owner, uid: u.uid, from, to: { zone, lane }, reason });
    return true;
  }

  /**
   * Wanderer/Rammbock: eine Lane in Pfeilrichtung, am Rand umkehren.
   * @param {Unit} u @param {boolean} push Rammbock schiebt eigene Karten mit
   */
  stepUnit(u, push) {
    if (!this.onBoard(u) || u.glued > 0) return;
    const row = this.row(u.owner, u.zone);
    // Sichtbar machen (Runde 2, C3): erst die Richtung zeigen, dann gleiten oder anstoßen
    this.emit({ type: "wanderStart", uid: u.uid, dir: u.dir });
    for (let attempt = 0; attempt < 2; attempt++) {
      const t = u.lane + u.dir;
      if (t < 0 || t >= LANES) {
        u.dir = /** @type {1|-1} */ (-u.dir);
        this.emit({ type: "turnAround", uid: u.uid, dir: u.dir });
        continue;
      }
      if (!row[t]) {
        this.moveUnit(u, u.zone, t, push ? "ram" : "wander");
        return;
      }
      if (!push) {
        this.emit({ type: "moveBlocked", uid: u.uid, dir: u.dir });
        return;
      }
      let e = t;
      while (e >= 0 && e < LANES && row[e]) e += u.dir;
      if (e < 0 || e >= LANES) {
        u.dir = /** @type {1|-1} */ (-u.dir);
        this.emit({ type: "turnAround", uid: u.uid, dir: u.dir });
        continue;
      }
      for (let i = t; i !== e; i += u.dir) {
        if (row[i]?.glued) {
          this.emit({ type: "moveBlocked", uid: u.uid, dir: u.dir });
          return;
        }
      }
      for (let i = e; i !== t; i -= u.dir) {
        const pushed = row[i - u.dir];
        if (pushed) this.moveUnit(pushed, u.zone, i, "pushed");
      }
      this.moveUnit(u, u.zone, t, "ram");
      return;
    }
  }

  /** @param {Unit} u @param {number} atk @param {number} hp @param {string} reason */
  buff(u, atk, hp, reason) {
    if (!this.onBoard(u)) return;
    if (atk) u.attack = Math.max(0, u.attack + atk);
    if (hp) {
      u.health += hp;
      u.maxHealth = Math.max(1, u.maxHealth + hp);
    }
    this.emit({ type: atk + hp >= 0 ? "buff" : "debuff", uid: u.uid, attack: atk, health: hp, reason });
    if (u.health <= 0) this.kill(u, "debuff", null);
  }

  /** @param {Unit} u @param {number} n */
  heal(u, n) {
    if (!this.alive(u) || u.health >= u.maxHealth) return;
    const amount = Math.min(n, u.maxHealth - u.health);
    u.health += amount;
    this.emit({ type: "heal", uid: u.uid, amount, health: u.health });
  }

  /**
   * Nicht-Kampfschaden (Dornen, Fäulnis, Hunger …). Panzer wirkt, Schildrinde nicht.
   * @param {Unit} u @param {number} n @param {Unit|null} source @param {string} cause
   */
  damageUnit(u, n, source, cause) {
    if (!this.alive(u) || n <= 0) return;
    const dmg = source && this.level(source, "ruestungsbrecher") ? n : this.reduceHook(u, "modifyDamage", n);
    u.health -= dmg;
    this.emit({ type: "damage", uid: u.uid, amount: dmg, health: u.health, source: source?.uid, cause });
    if (source && source.owner !== u.owner) this.trackDamage(source, dmg);
    if (u.health <= 0) this.kill(u, cause, source);
  }

  /** @param {Unit} source @param {number} dmg */
  trackDamage(source, dmg) {
    const st = this.state.players[source.owner].stats.damageByCard;
    st[source.card.baseId] = (st[source.card.baseId] || 0) + dmg;
  }

  /**
   * Einheit stirbt: Slot leeren, Knochen, onDeath, onAllyDeath.
   * @param {Unit} u @param {string} cause @param {Unit|null} killer
   */
  kill(u, cause, killer) {
    if (!this.onBoard(u)) return;
    this.row(u.owner, u.zone)[u.lane] = null;
    this.emit({ type: "death", player: u.owner, uid: u.uid, zone: u.zone, lane: u.lane, cause });
    if (killer && killer.owner !== u.owner) this.state.players[killer.owner].stats.kills += 1;
    let bones = this.reduceHook(u, "bonesOnDeath", 1);
    if (this.laneProp(u.owner, u.lane) === "doppelknochen") bones *= 2;
    this.gainBones(u.owner, bones, u);
    this.runHook(u, "onDeath", { cause });
    if (this.over) return;
    for (const o of this.units(u.owner)) {
      if (this.over) return;
      this.runHook(o, "onAllyDeath", u);
    }
  }

  /** Wiedergänger: mit vollen Werten zurück, ohne das Sigil. @param {Unit} u */
  revive(u) {
    if (this.row(u.owner, u.zone)[u.lane]) return;
    const card = { ...u.card, uid: this.newUid(), sigils: u.card.sigils.filter((s) => parseSigil(s).id !== "wiedergaenger") };
    const nu = this.makeUnit(card, u.owner, u.zone, u.lane);
    nu.sigils = u.sigils.filter((s) => parseSigil(s).id !== "wiedergaenger");
    this.place(nu);
    this.emit({ type: "revive", player: u.owner, uid: nu.uid, oldUid: u.uid, zone: u.zone, lane: u.lane, card });
  }

  /** Nesthüter: Kopie ohne das Sigil auf die Hand. @param {Unit} u */
  nestCopy(u) {
    const card = { ...u.card, uid: this.newUid(), sigils: u.card.sigils.filter((s) => parseSigil(s).id !== "nesthueter") };
    this.addToHand(u.owner, card, "nesthueter");
  }

  /** Häutung: Hülle bleibt, Karte flieht auf die Hand. @param {Unit} u */
  shed(u) {
    const zone = u.zone;
    const lane = u.lane;
    this.row(u.owner, zone)[lane] = null;
    this.emit({ type: "shed", player: u.owner, uid: u.uid, zone, lane });
    this.spawn(u.owner, zone, lane, "token_huelle", "shed");
    this.addToHand(u.owner, { ...u.card, uid: this.newUid() }, "shed");
  }

  /** Hunger: frisst eine Nachbarkarte. @param {Unit} u @param {Unit} prey */
  devour(u, prey) {
    const atk = prey.special ? 0 : prey.attack;
    const hp = Math.max(0, prey.health);
    this.emit({ type: "devour", uid: u.uid, prey: prey.uid });
    this.kill(prey, "eaten", null);
    if (!this.onBoard(u)) return;
    u.attack += atk;
    u.health += hp;
    u.maxHealth += hp;
    this.emit({ type: "buff", uid: u.uid, attack: atk, health: hp, reason: "hunger" });
  }

  /** Metamorphose. @param {Unit} u @param {string} baseId */
  transform(u, baseId) {
    if (!this.onBoard(u)) return;
    const card = resolveCard(baseId, u.card.mods, u.uid);
    const fresh = this.makeUnit(card, u.owner, u.zone, u.lane);
    Object.assign(u, { card, attack: fresh.attack, special: fresh.special, health: fresh.health, maxHealth: fresh.maxHealth,
      sigils: fresh.sigils, turns: 0, wick: fresh.wick });
    this.emit({ type: "transform", player: u.owner, uid: u.uid, card });
  }

  /** Nachrücken einer Seite. @param {number} p @param {string} reason */
  advanceRow(p, reason) {
    const P = this.state.players[p];
    for (let l = 0; l < LANES; l++) {
      const u = P.back[l];
      if (u && !P.front[l] && u.glued <= 0) this.moveUnit(u, "front", l, reason);
    }
  }

  /** Glockenschlag: beide Hinterreihen rücken vor (aktive Seite zuerst). @param {string} reason */
  advanceAll(reason) {
    const a = this.state.active;
    this.advanceRow(a, reason);
    this.advanceRow(1 - a, reason);
  }

  // ───────────── Zugablauf ─────────────

  /** @param {0|1} p @param {boolean} [first] */
  startTurn(p, first = false) {
    const s = this.state;
    const P = s.players[p];
    s.active = p;
    P.drew = first;
    P.hammerUsed = false;
    this.emit({ type: "turnStart", player: p, turn: s.turn });
    if (s.turn >= CANDLE_WARNING_TURN && s.turn < STALEMATE_TURN) {
      this.emit({ type: "candleWarning", turnsLeft: STALEMATE_TURN - s.turn });
    }
    this.gainWax(p, 1, null);
    for (const u of this.units(p)) {
      u.rushed = false;
      if (u.submerged) {
        u.submerged = false;
        this.emit({ type: "surface", uid: u.uid });
      }
    }
    // Schildrinde: gilt für den ersten Treffer in jedem gegnerischen Zug
    for (const u of this.units(1 - p)) u.shieldUsed = false;
    for (const u of this.units(p)) {
      if (this.over) return;
      if (this.onBoard(u)) this.runHook(u, "onTurnStart");
    }
    const a = P.auras;
    if (a.laneProp === "aufmarsch" && a.lane !== null) {
      const u = P.back[a.lane];
      if (u && !P.front[a.lane] && u.glued <= 0) this.moveUnit(u, "front", a.lane, "aufmarsch");
    }
  }

  /** @param {0|1} p */
  endTurn(p) {
    const s = this.state;
    if (s.turn <= NO_ATTACK_TURNS) {
      // Erster eigener Zug (beider Spieler): kein Angriff – sonst trifft der Startspieler ein leeres Brett
      this.emit({ type: "firstTurnNoAttack", player: p });
    } else {
      this.emit({ type: "attackPhase", player: p });
      this.attackPhase(p);
      if (this.over) return;
    }
    this.emit({ type: "turnEnd", player: p });
    // Feste Reihenfolge (Runde 2, C3): Wandern → Kerzendocht → übrige Zugende-Effekte (Regeneration, Fäulnis,
    // Metamorphose …) → Nachrücken. So ist jeder Schritt einzeln sichtbar und vorhersehbar.
    const mine = this.units(p);
    for (const u of mine) if (this.onBoard(u)) u.turns += 1;
    for (const u of mine) {
      if (this.over) return;
      if (this.onBoard(u)) this.runHook(u, "onTurnEnd", MOVE_SIGILS);
    }
    for (const u of this.units(p)) {
      if (this.over) return;
      if (this.onBoard(u) && u.wick !== null) {
        u.wick -= 1;
        this.emit({ type: "wick", uid: u.uid, left: u.wick });
        if (u.wick <= 0) this.kill(u, "wick", null);
      }
    }
    for (const u of this.units(p)) {
      if (this.over) return;
      if (this.onBoard(u)) this.runHook(u, "onTurnEnd", null, MOVE_SIGILS);
    }
    if (this.over) return;
    for (const u of this.units(p)) if (u.glued > 0) u.glued -= 1;
    this.advanceRow(p, "advance");
    this.checkWin();
    if (this.over) return;
    if (s.turn >= STALEMATE_TURN) {
      // Die Kerze brennt schneller, je länger es dauert: sonst pendelt die Waage bei festgefahrenen Brettern ewig
      const amount = candleWeight(s.turn);
      this.emit({ type: "candle", player: p, amount });
      this.addScale(1 - p, amount, "candle");
      if (this.over) return;
    }
    s.players[p].peek = false;
    s.pending = [];
    s.turn += 1;
    this.startTurn(/** @type {0|1} */ (1 - p));
  }

  /** @param {0|1} p */
  attackPhase(p) {
    for (let lane = 0; lane < LANES; lane++) {
      if (this.over) return;
      const u = this.row(p, "front")[lane];
      if (!u) continue;
      if (u.stunned) {
        u.stunned = false;
        this.emit({ type: "stunned", uid: u.uid });
        continue;
      }
      if (this.attackOf(u) <= 0) continue;
      const lanes = this.reduceHook(u, "modifyAttackTargets", [lane]);
      const strikes = this.level(u, "zwillingsbiss") > 0 ? 2 : 1;
      for (let s = 0; s < strikes; s++) {
        for (const tl of lanes) {
          if (!this.alive(u) || this.over) break;
          this.strike(u, tl);
        }
        if (this.alive(u) && !this.over && this.level(u, "hinterhalt") > 0) this.strikeBack(u, lane);
      }
      if (this.alive(u) && !this.over && this.level(u, "tauchgang") > 0 && u.glued <= 0) {
        u.submerged = true;
        this.emit({ type: "submerge", uid: u.uid });
      }
    }
  }

  /** @param {Unit} att @param {number} lane */
  strike(att, lane) {
    const dmg = this.attackOf(att);
    if (dmg <= 0) return;
    const q = 1 - att.owner;
    const flying = this.level(att, "schwinge") > 0;
    let tl = lane;
    if (!flying && tl === att.lane) {
      for (const l of [tl - 1, tl + 1]) {
        const d = l >= 0 && l < LANES ? this.row(q, "front")[l] : null;
        if (d && !d.submerged && this.level(d, "koeder") > 0) {
          tl = l;
          this.emit({ type: "lured", uid: att.uid, lure: d.uid });
          break;
        }
      }
    }
    let def = this.row(q, "front")[tl];
    if (flying) {
      if (def && !def.submerged && this.level(def, "hochwuchs") > 0) {
        this.emit({ type: "attack", uid: att.uid, lane: tl, target: def.uid, flying: true, blocked: true });
        this.overflow(att, q, tl, this.hitUnit(att, def, dmg), def.uid);
        return;
      }
      this.emit({ type: "attack", uid: att.uid, lane: tl, direct: true, flying: true });
      this.addScale(att.owner, dmg, "attack", att.uid);
      return;
    }
    if (!def) def = this.guardJump(q, tl);
    if (!def) {
      this.emit({ type: "attack", uid: att.uid, lane: tl, direct: true });
      this.addScale(att.owner, dmg, "attack", att.uid);
      return;
    }
    if (def.submerged) {
      // Tauchgang: der Schaden geht unter der abgetauchten Karte hindurch – auf die Hinterreihe bzw. die Waage
      this.emit({ type: "attack", uid: att.uid, lane: tl, submerged: true, target: def.uid });
      this.overflow(att, q, tl, dmg, def.uid);
      return;
    }
    this.emit({ type: "attack", uid: att.uid, lane: tl, target: def.uid });
    this.overflow(att, q, tl, this.hitUnit(att, def, dmg), def.uid);
  }

  /**
   * Überlaufschaden (Grundregel): Rest nach der Frontkarte trifft die Hinterreihe derselben Lane, was dann noch übrig
   * ist, die Waage. Durchbohren überspringt die Hinterreihe.
   * @param {Unit} att @param {number} q Verteidiger @param {number} lane @param {number} rest @param {string} from
   */
  overflow(att, q, lane, rest, from) {
    if (rest <= 0 || this.over) return;
    const back = this.level(att, "durchbohren") > 0 ? null : this.row(q, "back")[lane];
    let fromZone = "front";
    if (back) {
      this.emit({ type: "overflow", uid: att.uid, player: q, lane, from, fromZone, to: back.uid, amount: rest });
      rest = this.hitUnit(att, back, rest, true);
      if (rest <= 0 || this.over) return;
      from = back.uid;
      fromZone = "back";
    }
    this.emit({ type: "overflow", uid: att.uid, player: q, lane, from, fromZone, to: null, amount: rest });
    this.addScale(att.owner, rest, "overflow", att.uid);
  }

  /** Hinterhalt: zusätzlich die Hinterreihe derselben Lane (voller Angriff, ohne Überlauf auf die Waage). @param {Unit} att @param {number} lane */
  strikeBack(att, lane) {
    const def = this.row(1 - att.owner, "back")[lane];
    if (!def) return;
    const dmg = this.attackOf(att);
    if (dmg <= 0) return;
    this.emit({ type: "attack", uid: att.uid, lane, target: def.uid, ambush: true });
    this.hitUnit(att, def, dmg);
  }

  /** Leibwächter (aus der Front) oder Grabwühler (von überall) springt in eine direkt angegriffene Lane. */
  guardJump(/** @type {number} */ q, /** @type {number} */ lane) {
    for (const u of this.row(q, "front")) {
      if (u && u.lane !== lane && u.glued <= 0 && !u.submerged && this.level(u, "leibwaechter") > 0) {
        this.moveUnit(u, "front", lane, "guard");
        return u;
      }
    }
    for (const u of this.units(q)) {
      if (u.glued <= 0 && !u.submerged && this.level(u, "grabwuehler") > 0 && !(u.zone === "front" && u.lane === lane)) {
        this.moveUnit(u, "front", lane, "burrow");
        return u;
      }
    }
    return null;
  }

  /**
   * Treffer auf eine Karte. Schildrinde und Panzer gelten pro getroffener Karte.
   * @param {Unit} att @param {Unit} def @param {number} dmg
   * @param {boolean} [spill] Überlauf-Treffer: Todesstachel wirkt nur auf die erste getroffene Karte
   * @returns {number} Überschuss, der weiterwandert (nur wenn die Karte am Schaden stirbt)
   */
  hitUnit(att, def, dmg, spill = false) {
    const breaker = this.level(att, "ruestungsbrecher") > 0;
    if (!breaker && this.level(def, "schildrinde") > 0 && !def.shieldUsed) {
      def.shieldUsed = true;
      this.emit({ type: "shield", uid: def.uid, source: att.uid });
      this.runHook(def, "onStruck", att);
      return 0;
    }
    if (!breaker) dmg = this.reduceHook(def, "modifyDamage", dmg);
    const before = def.health;
    def.health -= dmg;
    this.emit({ type: "damage", uid: def.uid, amount: dmg, health: def.health, source: att.uid, cause: "attack" });
    this.trackDamage(att, Math.min(dmg, Math.max(0, before)));
    if (!spill && dmg > 0 && def.health > 0 && this.level(att, "todesstachel") > 0) {
      def.health = 0;
      this.emit({ type: "deathtouch", uid: def.uid, source: att.uid });
    }
    const excess = Math.max(0, dmg - Math.max(0, before));
    this.runHook(att, "onHit", def);
    if (this.over) return 0;
    this.runHook(def, "onStruck", att);
    if (this.over) return 0;
    if (this.onBoard(def) && def.health <= 0) {
      if (this.level(def, "haeutung") > 0) this.shed(def);
      else this.kill(def, "combat", att);
      return this.over ? 0 : excess;
    }
    if (this.onBoard(def)) this.runHook(def, "onSurvivedHit", att);
    return 0;
  }

  // ═════════════ Aktionen ═════════════

  /** @param {any} a @returns {string|null} Fehlertext (Schlüssel) oder null */
  dispatch(a) {
    const s = this.state;
    if (s.phase === "over") return "battleOver";
    const p = a.player;
    if (p !== 0 && p !== 1) return "badPlayer";
    if (a.type === "timeout") return p === s.active ? this.timeout(p) : "notYourTurn";
    if (p !== s.active) return "notYourTurn";
    const pend = s.pending[0];
    if (pend) {
      if (pend.kind === "discard" && a.type !== "discard") return "mustDiscard";
      if (pend.kind === "seer" && a.type !== "seer") return "mustOrder";
    }
    switch (a.type) {
      case "draw": return this.actDraw(p, a.pile);
      case "discard": return this.actDiscard(p, a.uid);
      case "seer": return this.actSeer(p, a.order);
      case "play": return this.actPlay(p, a);
      case "hammer": return this.actHammer(p, a.zone, a.lane);
      case "rush": return this.actRush(p, a.lane);
      case "item": return this.actItem(p, a);
      case "endTurn": return this.actEndTurn(p);
      default: return "unknownAction";
    }
  }

  /** @param {0|1} p @param {string} pile */
  actDraw(p, pile) {
    const P = this.state.players[p];
    if (P.drew) return "alreadyDrew";
    if (pile !== "main" && pile !== "side") return "badPile";
    P.drew = true;
    if (pile === "side") {
      const card = this.newSideCard(p);
      this.emit({ type: "draw", player: p, pile: "side", uid: card.uid, card, deckSize: P.deck.length });
      P.hand.push(card);
      this.queueDiscardIfNeeded(p);
      return null;
    }
    if (!this.drawCardFromDeck(p, "draw")) {
      P.decay += 1;
      this.emit({ type: "decay", player: p, amount: P.decay });
      this.addScale(1 - p, P.decay, "decay");
    }
    return null;
  }

  /** @param {0|1} p @param {string} uid */
  actDiscard(p, uid) {
    const P = this.state.players[p];
    const i = P.hand.findIndex((c) => c.uid === uid);
    if (i < 0) return "cardNotInHand";
    const [card] = P.hand.splice(i, 1);
    this.emit({ type: "discard", player: p, uid, card });
    if (P.hand.length <= HAND_LIMIT) this.state.pending = this.state.pending.filter((x) => x.kind !== "discard");
    return null;
  }

  /** @param {0|1} p @param {number[]} order Indizes der gezeigten Karten, [0] = neue oberste Karte */
  actSeer(p, order) {
    const pend = this.state.pending[0];
    if (!pend || pend.kind !== "seer") return "noSeer";
    const n = pend.count;
    if (!Array.isArray(order) || order.length !== n || new Set(order).size !== n || order.some((i) => !Number.isInteger(i) || i < 0 || i >= n)) {
      return "badOrder";
    }
    const P = this.state.players[p];
    const shown = P.deck.slice(-n).reverse(); // shown[0] = oberste Karte
    const reordered = order.map((i) => shown[i]);
    P.deck.splice(P.deck.length - n, n, ...reordered.reverse());
    this.state.pending.shift();
    this.emit({ type: "seerDone", player: p });
    return null;
  }

  /**
   * Karte ausspielen.
   * @param {0|1} p @param {{ uid: string, zone: "front"|"back", lane: number, sacrifices?: Array<{zone: "front"|"back", lane: number}> }} a
   */
  actPlay(p, a) {
    const P = this.state.players[p];
    if (!P.drew) return "mustDrawFirst";
    const idx = P.hand.findIndex((c) => c.uid === a.uid);
    if (idx < 0) return "cardNotInHand";
    const card = P.hand[idx];
    if (a.zone !== "front" && a.zone !== "back") return "badSlot";
    if (!Number.isInteger(a.lane) || a.lane < 0 || a.lane >= LANES) return "badSlot";
    const sacs = Array.isArray(a.sacrifices) ? a.sacrifices : [];
    // Mehr als 8 Opfer sind nie gültig (8 Slots) — begrenzt auch die Arbeit bei manipulierten Nachrichten
    if (sacs.length > LANES * 2) return "badSacrifice";
    /** @type {Unit[]} */
    const victims = [];
    for (const sref of sacs) {
      if (!sref || (sref.zone !== "front" && sref.zone !== "back") || !Number.isInteger(sref.lane)) return "badSacrifice";
      const u = P[sref.zone][sref.lane];
      if (!u) return "badSacrifice";
      if (victims.includes(u)) return "badSacrifice";
      if (this.laneProp(p, u.lane) === "heilig") return "sacredLane";
      victims.push(u);
    }
    const cost = card.cost;
    if (cost.type === "blood") {
      const need = Math.max(0, cost.amount - P.bloodBonus);
      if (need === 0) {
        if (victims.length) return "tooManySacrifices";
      } else {
        const values = victims.map((u) => this.bloodValueOf(u));
        const sum = values.reduce((x, y) => x + y, 0);
        if (sum < need) return "notEnoughBlood";
        if (sum - Math.min(...values) >= need) return "tooManySacrifices";
      }
    } else {
      if (victims.length) return "tooManySacrifices";
      if (cost.type === "bones" && P.bones < cost.amount) return "notEnoughBones";
      if (cost.type === "wax" && P.wax < cost.amount) return "notEnoughWax";
    }
    // Zielslot muss nach den Opfern frei sein (Ewiges Opfer bleibt stehen)
    const occupant = P[a.zone][a.lane];
    if (occupant && !(victims.includes(occupant) && this.level(occupant, "ewigesopfer") === 0)) return "slotOccupied";

    // — ab hier gültig —
    P.hand.splice(idx, 1);
    if (cost.type === "bones") {
      P.bones -= cost.amount;
      this.emit({ type: "spend", player: p, resource: "bones", amount: cost.amount, total: P.bones });
    } else if (cost.type === "wax") {
      P.wax -= cost.amount;
      this.emit({ type: "spend", player: p, resource: "wax", amount: cost.amount, total: P.wax });
    } else if (cost.amount > 0 && P.bloodBonus > 0) {
      this.emit({ type: "spend", player: p, resource: "vial", amount: Math.min(P.bloodBonus, cost.amount) });
      P.bloodBonus = 0;
    }
    for (const v of victims) {
      if (this.over) return null;
      const value = this.bloodValueOf(v);
      P.stats.sacrifices += 1;
      this.emit({ type: "sacrifice", player: p, uid: v.uid, zone: v.zone, lane: v.lane, blood: value });
      this.runHook(v, "onSacrificed");
      if (this.level(v, "ewigesopfer") > 0) {
        this.emit({ type: "undying", uid: v.uid });
      } else {
        this.kill(v, "sacrifice", null);
      }
    }
    if (this.over) return null;
    if (P[a.zone][a.lane]) {
      // Durch einen Opfer-Effekt (Nachgeburt/Wiedergänger) belegt: Karte geht zurück auf die Hand
      P.hand.push(card);
      this.emit({ type: "playFizzle", player: p, uid: card.uid });
      return null;
    }
    const u = this.makeUnit(card, p, a.zone, a.lane);
    this.place(u);
    P.stats.played += 1;
    this.emit({ type: "play", player: p, uid: u.uid, zone: a.zone, lane: a.lane, card });
    this.runHook(u, "onPlay");
    if (this.over) return null;
    for (const o of this.units(1 - p)) {
      if (this.over) break;
      this.runHook(o, "onEnemyPlayed", u);
    }
    return null;
  }

  /** @param {0|1} p @param {"front"|"back"} zone @param {number} lane */
  actHammer(p, zone, lane) {
    const P = this.state.players[p];
    if (!P.drew) return "mustDrawFirst";
    if (P.hammerUsed) return "hammerUsed";
    const u = (zone === "front" || zone === "back") && Number.isInteger(lane) ? P[zone][lane] : null;
    if (!u) return "badTarget";
    P.hammerUsed = true;
    this.emit({ type: "hammer", player: p, uid: u.uid });
    this.kill(u, "hammer", null);
    return null;
  }

  /** Vorpreschen. @param {0|1} p @param {number} lane */
  actRush(p, lane) {
    const P = this.state.players[p];
    const u = Number.isInteger(lane) ? P.back[lane] : null;
    if (!u || this.level(u, "vorpreschen") === 0) return "badTarget";
    if (u.rushed) return "alreadyRushed";
    if (P.front[lane] || u.glued > 0) return "slotOccupied";
    u.rushed = true;
    this.moveUnit(u, "front", lane, "rush");
    return null;
  }

  /** @param {0|1} p @param {any} a { item: string, target? } */
  actItem(p, a) {
    const P = this.state.players[p];
    if (!P.drew) return "mustDrawFirst";
    const i = P.items.indexOf(a.item);
    if (i < 0) return "noSuchItem";
    const err = applyItemEffect(this, p, a.item, a.target || {});
    if (err) return err;
    P.items.splice(i, 1);
    return null;
  }

  /** @param {0|1} p */
  actEndTurn(p) {
    const P = this.state.players[p];
    if (!P.drew) return "mustDrawFirst";
    this.endTurn(p);
    return null;
  }

  /** Zug-Timer abgelaufen: Pflichtziehen, offene Wahl auflösen, Zug beenden. @param {0|1} p */
  timeout(p) {
    const s = this.state;
    const P = s.players[p];
    this.emit({ type: "timeout", player: p });
    let guard = 0;
    while (s.pending.length && guard++ < 20) {
      const pend = s.pending[0];
      if (pend.kind === "seer") this.actSeer(p, Array.from({ length: pend.count }, (_, i) => i));
      else if (pend.kind === "discard") this.actDiscard(p, P.hand[P.hand.length - 1].uid);
      else s.pending.shift();
    }
    if (!P.drew) {
      this.actDraw(p, "side");
      while (s.pending.length && s.pending[0].kind === "discard") this.actDiscard(p, P.hand[P.hand.length - 1].uid);
    }
    if (this.over) return null;
    this.endTurn(p);
    return null;
  }
}
