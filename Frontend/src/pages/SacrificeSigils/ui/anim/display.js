// ui/anim/display.js — Anzeige-Modell des Kampfs, das die Ereignisse der Engine Schritt für Schritt nachvollzieht.
//
// Die Engine liefert pro Aktion den End-State (gefiltert) und die Ereignisliste. Damit Animationen der Reihe nach
// ablaufen können, hält der Client ein eigenes Anzeige-Modell in derselben Form wie der Kampf-State und wendet jedes
// Ereignis darauf an. Am Ende einer Charge wird das Modell auf den echten State gesetzt — kleine Abweichungen
// (z. B. Lanen-Eigenschaften beim Ausspielen) korrigieren sich damit von selbst.
import { deepClone } from "../../engine/match.js";
import { parseSigil } from "../../engine/sigils/index.js";

/**
 * Kampf aus der gefilterten Sicht als Anzeige-Modell (verdeckte gegnerische Hand als Platzhalter).
 * @param {any} view Match-Sicht
 */
export function displayFromView(view) {
  if (!view?.battle) return null;
  const b = deepClone(view.battle);
  for (const P of b.players) {
    if (!P.hand) P.hand = Array.from({ length: P.handSize || 0 }, (_, i) => ({ uid: `hidden${i}`, hidden: true }));
    if (!P.deck) P.deck = [];
  }
  return b;
}

/** @param {any} b @param {string} uid */
export function findUnit(b, uid) {
  for (const P of b.players) {
    for (const zone of ["front", "back"]) {
      const i = P[zone].findIndex((u) => u && u.uid === uid);
      if (i >= 0) return { unit: P[zone][i], P, zone, lane: i };
    }
  }
  return null;
}

/** Einheit aus einer Karte bauen (vereinfachte makeUnit). */
function unitFrom(card, owner, zone, lane) {
  const wick = card.sigils?.find((s) => parseSigil(s).id === "kerzendocht");
  return {
    uid: card.uid, card, owner, zone, lane, attack: card.attack, special: card.special, health: card.health, maxHealth: card.health,
    sigils: [...(card.sigils || [])], turns: 0, wick: wick ? parseSigil(wick).n : null, submerged: false, dir: 1, shieldUsed: false,
    glued: 0, stunned: false, rushed: false,
  };
}

/** @param {any} P @param {string} uid */
function removeFromHand(P, uid) {
  const i = P.hand.findIndex((c) => c.uid === uid);
  if (i >= 0) return P.hand.splice(i, 1)[0];
  const h = P.hand.findIndex((c) => c.hidden);
  if (h >= 0) P.hand.splice(h, 1);
  return null;
}

/**
 * Ereignis auf das Anzeige-Modell anwenden (mutiert b).
 * @param {any} b @param {any} e
 */
export function applyDisplayEvent(b, e) {
  if (!b) return;
  const P = typeof e.player === "number" ? b.players[e.player] : null;
  switch (e.type) {
    case "turnStart":
      b.active = e.player;
      b.turn = e.turn;
      break;
    case "wax":
    case "bones":
      if (P) P[e.type] = e.total;
      break;
    case "spend":
      if (P && e.resource !== "vial") P[e.resource] = e.total;
      if (P && e.resource === "vial") P.bloodBonus = 0;
      break;
    case "draw":
      if (P) {
        P.hand.push(e.card ? { ...e.card, uid: e.uid } : { uid: e.uid, hidden: true });
        if (typeof e.deckSize === "number") P.deckSize = e.deckSize;
        P.handSize = P.hand.length;
      }
      break;
    case "handAdd":
      if (P && !P.hand.some((c) => c.uid === e.uid)) {
        P.hand.push(e.card ? { ...e.card, uid: e.uid } : { uid: e.uid, hidden: true });
        P.handSize = P.hand.length;
      }
      break;
    case "discard":
      if (P) { removeFromHand(P, e.uid); P.handSize = P.hand.length; }
      break;
    case "play":
      if (P) {
        removeFromHand(P, e.uid);
        P.handSize = P.hand.length;
        P[e.zone][e.lane] = unitFrom({ ...e.card, uid: e.uid }, e.player, e.zone, e.lane);
      }
      break;
    case "spawn":
    case "revive":
      if (P) P[e.zone][e.lane] = unitFrom({ ...e.card, uid: e.uid }, e.player, e.zone, e.lane);
      break;
    case "death":
    case "shed": {
      const f = findUnit(b, e.uid);
      if (f) f.P[f.zone][f.lane] = null;
      break;
    }
    case "move": {
      const f = findUnit(b, e.uid);
      if (f && !f.P[e.to.zone][e.to.lane]) {
        f.P[f.zone][f.lane] = null;
        f.unit.zone = e.to.zone;
        f.unit.lane = e.to.lane;
        f.P[e.to.zone][e.to.lane] = f.unit;
      }
      break;
    }
    case "damage":
    case "heal": {
      const f = findUnit(b, e.uid);
      if (f) f.unit.health = e.health;
      break;
    }
    case "deathtouch": {
      const f = findUnit(b, e.uid);
      if (f) f.unit.health = 0;
      break;
    }
    case "buff":
    case "debuff": {
      const f = findUnit(b, e.uid);
      if (f) {
        f.unit.attack = Math.max(0, f.unit.attack + (e.attack || 0));
        f.unit.health += e.health || 0;
        f.unit.maxHealth = Math.max(1, f.unit.maxHealth + (e.health || 0));
      }
      break;
    }
    case "transform": {
      const f = findUnit(b, e.uid);
      if (f) Object.assign(f.unit, unitFrom({ ...e.card, uid: e.uid }, f.unit.owner, f.zone, f.lane));
      break;
    }
    case "submerge":
    case "surface": {
      const f = findUnit(b, e.uid);
      if (f) f.unit.submerged = e.type === "submerge";
      break;
    }
    case "shield": {
      const f = findUnit(b, e.uid);
      if (f) f.unit.shieldUsed = true;
      break;
    }
    case "wick": {
      const f = findUnit(b, e.uid);
      if (f) f.unit.wick = e.left;
      break;
    }
    case "scale":
      b.scale = e.scale;
      break;
    case "battleEnd":
      b.phase = "over";
      b.winner = e.winner;
      break;
    case "item":
      if (P && Array.isArray(P.items)) {
        const i = P.items.indexOf(e.item);
        if (i >= 0) P.items.splice(i, 1);
      } else if (P && typeof P.itemCount === "number") P.itemCount = Math.max(0, P.itemCount - 1);
      break;
    default:
      break;
  }
}
