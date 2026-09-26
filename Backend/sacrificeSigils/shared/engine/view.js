// engine/view.js — pro Empfänger gefilterter State und gefilterte Ereignisse.
//
// Versteckte Information (Auftrag 12): Hand, Deck-Reihenfolge, Deckinhalt und Pfad-Entscheidungen des Gegners werden
// NIE verschickt — nur Anzahlen und öffentliche Ereignisse. Zuschauer (viewer = null) bekommen die öffentliche Sicht.
// Auch das eigene Deck geht nur als (sortierte) Liste ohne Reihenfolge raus, und der Kampf-RNG und das Salz nie.

import { deepClone } from "./match.js";
import { resolveCard } from "./cards.js";
import { draftDone } from "./draft.js";

/**
 * @param {any} state Match-State
 * @param {0|1|null} viewer
 */
export function viewFor(state, viewer) {
  const v = deepClone(state);
  delete v.salt;
  v.viewer = viewer;

  // Match-Decks: eigenes Deck (aufgelöst), gegnerisches nur als Anzahl
  v.players = v.players.map((/** @type {any} */ P, /** @type {number} */ q) => {
    const own = q === viewer;
    const out = { ...P, deckSize: P.deck.length };
    if (own) {
      out.deck = P.deck.map((/** @type {any} */ dc) => ({ ...dc, card: resolveCard(dc.baseId, dc.mods, dc.uid) }));
    } else {
      delete out.deck;
      out.itemCount = P.items.length;
      delete out.items;
      delete out.heads;
      delete out.bases;
    }
    delete out.cardSeq;
    return out;
  });

  // Draft: bei getrennten Pools sieht man die Picks des Gegners erst nach dem Draft
  if (v.draft) {
    const d = v.draft;
    const allDone = draftDone(state.draft, 0) && draftDone(state.draft, 1);
    for (const q of [0, 1]) {
      if (q === viewer) continue;
      if (d.mode === "separate" && !allDone) {
        d.picks[q] = d.picks[q].map(() => null);
      }
      d.queues[q] = [];
      if (d.mode === "separate") d.offers[q] = [];
      // Extras (Kopf/Nebendeck) des Gegners erst nach beiden Wahlen
      if (!(d.extras[0].head !== null && d.extras[1].head !== null)) {
        d.extras[q] = { head: null, side: null, chosen: d.extras[q].head !== null };
      }
    }
    d.queues = d.queues.map(() => []);
  }

  // Kampf
  if (v.battle) {
    const b = v.battle;
    delete b.rng;
    b.players = b.players.map((/** @type {any} */ P, /** @type {number} */ q) => {
      const own = q === viewer;
      const peeking = viewer !== null && viewer !== q && b.players[viewer]?.peek;
      const out = { ...P, deckSize: P.deck.length, handSize: P.hand.length };
      if (own) {
        out.deckList = [...P.deck].sort((/** @type {any} */ a, /** @type {any} */ c) => a.name.localeCompare(c.name));
      }
      delete out.deck;
      if (!own && !peeking) delete out.hand;
      if (!own) {
        out.itemCount = P.items.length;
        delete out.items;
        out.bloodBonus = 0;
      }
      return out;
    });
    const pend = state.battle.pending[0];
    b.pending = pend && pend.player === viewer ? [pend] : [];
    if (pend && pend.player === viewer && pend.kind === "seer") {
      const deck = state.battle.players[viewer].deck;
      b.pending[0] = { ...pend, cards: deck.slice(-pend.count).reverse() };
    }
    b.opponentPending = !!pend && pend.player !== viewer;
  }

  // Pfad: eigene Szene sichtbar (verdeckte Kartenwahl ohne Karten), vom Gegner nur Fortschritt
  if (v.path) {
    v.path.players = v.path.players.map((/** @type {any} */ pp, /** @type {number} */ q) => {
      if (q === viewer) {
        if (pp.scene?.kind === "cardChoice" && pp.scene.variant === "hidden") {
          pp.scene = { ...pp.scene, offers: pp.scene.offers.map(() => null) };
        }
        if (pp.scene) delete pp.scene.key;
        return pp;
      }
      return { level: pp.level, done: pp.done, chosen: pp.chosen, thinking: !pp.done };
    });
  }
  return v;
}

const CARD_FIELDS = ["card", "cards", "victimCard"];

/**
 * Ereignisse für einen Empfänger filtern.
 * @param {any[]} events @param {0|1|null} viewer
 */
export function eventsFor(events, viewer) {
  const out = [];
  for (const e of events) {
    if (e.private !== undefined && e.private !== viewer) {
      // Pfad-Ereignisse des Gegners komplett verbergen, Kampf-Ereignisse ohne Karteninhalt weitergeben
      if (["gainCard", "fused", "transferred", "campfireLost", "campfireBoost", "removed", "bought", "totemPart",
        "totemBuilt", "copied", "ferried", "oracle", "deckChanged", "eclipse", "gamble", "nodeChosen", "seer"].includes(e.type)) {
        if (e.type === "nodeChosen") out.push({ type: "opponentChose", player: e.player, level: e.level });
        continue;
      }
      const c = { ...e };
      for (const f of CARD_FIELDS) delete c[f];
      delete c.private;
      out.push(c);
      continue;
    }
    if (e.type === "draftPick" && e.hiddenFrom !== null && e.hiddenFrom === viewer) {
      out.push({ type: "draftPick", player: e.player, count: e.count, hidden: true });
      continue;
    }
    if (e.type === "draftPick" && e.hiddenFrom !== null && viewer === null) {
      out.push({ type: "draftPick", player: e.player, count: e.count, hidden: true });
      continue;
    }
    out.push(e);
  }
  return out;
}
