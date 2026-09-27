// Gezeiten-Zirkel: Wasserstand, Salz, Flut/Ebbe, Gezeiten-Bindung, Daten und komplette KI-Matches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBattle, act, endTurn, unitAt, testCard, dc } from "./helpers.js";
import { createBattle, tideAt, isHighWater } from "../engine/battle.js";
import { createMatch, applyAction, awaiting } from "../engine/match.js";
import { aiAction } from "../engine/ai/index.js";
import { generatePool } from "../engine/draft.js";
import { CARDS, collectibleOf, cursedOf } from "../engine/cards.js";
import { getZirkel } from "../engine/zirkel/index.js";
import { GEZEITEN_SIDE_TOTEM_SIGILS, allHeads, allBases } from "../data/totems.js";
import { GEZEITEN_EVENTS } from "../data/events.js";
import { tribeIdsOf } from "../data/tribes.js";
import { de } from "../i18n/de.js";

const G = (/** @type {any} */ spec) => setupBattle({ zirkel: "gezeiten", ...spec });
testCard("Z_wall", { attack: 0, health: 5 });
testCard("Z_hit7", { attack: 7, health: 3 });
testCard("Z_hit2", { attack: 2, health: 3 });
testCard("Z_salt2", { attack: 1, health: 1, cost: { type: "salt", amount: 2 } });
testCard("Z_rusher", { attack: 1, health: 1, sigils: ["vorpreschen"] });

// ───────── Wasserstand ─────────
test("Gezeiten: Ebbe → steigend → Flut → fallend, je eine Runde; Kampf beginnt bei Ebbe", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((t) => tideAt(t)), [0, 0, 1, 1, 2, 2, 3, 3, 0]);
  assert.deepEqual([0, 1, 2, 3].map(isHighWater), [false, true, true, false]);
  const deck = Array.from({ length: 10 }, () => dc("Z_wall"));
  const { state } = createBattle({ zirkel: "gezeiten", battleNo: 1, starter: 0, rng: 3, players: [
    { deck, sideType: "strandkrabbe", items: [], totems: {} },
    { deck: deck.map((c) => ({ ...c })), sideType: "strandkrabbe", items: [], totems: {} },
  ] });
  assert.equal(state.tide, 0);
  // Ausgleich für den Zweiten (Gezeiten: +2 Salz +2 Knochen, siehe zirkel/gezeiten.js): Salz statt Wachs
  assert.equal(state.players[1].salt, 2);
  assert.equal(state.players[1].bones, 2);
  assert.equal(state.players[1].wax, 0);
  assert.ok(state.players[0].hand.some((c) => c.baseId === "side_strandkrabbe"));
  // Moor-Kämpfe haben keine Gezeiten
  const moor = createBattle({ battleNo: 1, starter: 0, rng: 3, players: [
    { deck: [], sideType: "moorling", items: [], totems: {} }, { deck: [], sideType: "moorling", items: [], totems: {} },
  ] });
  assert.equal(moor.state.tide, null);
});

test("Salz: +1 je eigener Karte in der Uferreihe zu Zugbeginn, höchstens 8", () => {
  const s = G({ tide: 1, p0: { front: ["Z_wall", "Z_wall", null, "Z_wall"], back: ["Z_wall", "Z_wall", null, "Z_wall"] } });
  endTurn(s);
  endTurn(s);
  assert.equal(s.players[0].salt, 3);
  s.players[0].salt = 7;
  endTurn(s);
  endTurn(s);
  assert.equal(s.players[0].salt, 8);
});

test("Salzkosten: zu wenig Salz wird abgelehnt, genug wird bezahlt", () => {
  const s = G({ p0: { hand: ["Z_salt2"], salt: 1 } });
  assert.equal(act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 0 }).error, "notEnoughSalt");
  s.players[0].salt = 3;
  assert.equal(act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 0 }).error, undefined);
  assert.equal(s.players[0].salt, 1);
});

test("Flut: Uferreihen rücken nicht nach, Überlauf geht an ihnen vorbei, Hinterhalt trifft sie nicht, Vorpreschen geht nicht", () => {
  const s = G({ tide: 2, p0: { front: ["Z_hit7"], back: [null, "Z_wall", null, "Z_rusher"] }, p1: { front: ["Z_hit2"], back: ["Z_wall"] } });
  assert.equal(act(s, { type: "rush", lane: 3 }).error, "flooded");
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0), null);
  assert.equal(unitAt(s, 1, "back", 0).health, 5); // unter Wasser: nicht getroffen
  assert.equal(s.scale, 7 - 3);
  assert.equal(unitAt(s, 0, "back", 1)?.card.baseId, "Z_wall"); // kein Nachrücken bei Flut
  // Gleiche Lage bei Niedrigwasser: Überlauf trifft die Uferreihe, Nachrücken klappt
  const lo = G({ tide: 3, p0: { front: ["Z_hit7"], back: [null, "Z_wall"] }, p1: { front: ["Z_hit2"], back: ["Z_wall"] } });
  endTurn(lo);
  assert.equal(unitAt(lo, 1, "back", 0).health, 1);
  assert.equal(unitAt(lo, 0, "front", 1)?.card.baseId, "Z_wall");
});

test("Ebbe: wer eine ganz leere Lane hat, bekommt zu Zugbeginn eine Nebendeck-Karte", () => {
  const s = G({ tide: 3, p0: { front: ["Z_wall", "Z_wall", "Z_wall"], back: [null, null, null, "Z_wall"] }, p1: { front: ["Z_wall"] } });
  endTurn(s); // Zug 4 (Spieler 1): noch fallend
  assert.equal(s.players[1].hand.length, 0);
  endTurn(s); // Zug 5: Ebbe, Spieler 0 hat keine leere Lane
  assert.equal(s.players[0].hand.filter((c) => c.baseId === "side_strandkrabbe").length, 0);
  endTurn(s); // Zug 6: Ebbe, Spieler 1 hat leere Lanes
  assert.equal(s.players[1].hand.filter((c) => c.baseId === "side_strandkrabbe").length, 1);
});

test("Gezeiten-Bindung: Karten nur bei passendem Wasserstand spielbar", () => {
  const high = Object.values(CARDS).find((c) => c.tide === "high" && c.cost.type === "blood" && c.cost.amount === 1);
  assert.ok(high, "es gibt eine Hochwasser-Karte für 1 Blut");
  const s = G({ tide: 0, p0: { hand: [high.id], front: ["Z_wall"] } });
  const play = () => act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 1, sacrifices: [{ zone: "front", lane: 0 }] });
  assert.equal(play().error, "wrongTide");
  s.tide = 1;
  assert.equal(play().error, undefined);
});

// ───────── Daten ─────────
test("Gezeiten-Zirkel: 14 Stämme, über 160 sammelbare Karten, 8+ Flüche, festes Nebendeck, eigene Totem-Listen", () => {
  const z = getZirkel("gezeiten");
  assert.equal(z.tribes.length, 14);
  assert.equal(tribeIdsOf("gezeiten").length, 14);
  assert.ok(collectibleOf("gezeiten").length >= 160);
  assert.ok(cursedOf("gezeiten").length >= 8);
  assert.ok(collectibleOf("gezeiten").every((c) => c.zirkel === "gezeiten"));
  assert.deepEqual(Object.keys(z.sideDeckTypes), ["strandkrabbe"]);
  assert.ok(z.collectible.some((c) => c.cost.type === "salt"));
  assert.ok(!z.collectible.some((c) => c.cost.type === "wax"));
  assert.ok(!getZirkel("moor").collectible.some((c) => c.cost.type === "salt"));
  assert.ok(allHeads(z).every((h) => h.kind !== "tribe" || tribeIdsOf("gezeiten").includes(h.tribe)));
  assert.ok(allBases(z).some((b) => b.kind === "sigil" && b.sigil === "salzkruste"));
  for (const t of tribeIdsOf("gezeiten")) assert.ok(de.tribes[t]?.name, `Stamm ${t}`);
  for (const e of GEZEITEN_EVENTS) assert.ok(de.events[e]?.name, `Ereignis ${e}`);
  for (const s of GEZEITEN_SIDE_TOTEM_SIGILS) assert.ok(de.sigils[s]?.name, `Nebendeck-Sigil ${s}`);
});

test("Draft im Gezeiten-Zirkel: nur Gezeiten-Karten, Stammköpfe der Gezeiten, Nebendeck-Totem aus der Gezeiten-Liste", () => {
  for (let i = 0; i < 50; i++) {
    const pool = generatePool(`GZ${i}`, "gezeiten");
    assert.ok(pool.cards.every((c) => CARDS[c.baseId].zirkel === "gezeiten"));
    assert.ok(pool.heads.every((h) => h.head.kind !== "tribe" || tribeIdsOf("gezeiten").includes(h.head.tribe)));
    assert.ok(pool.sides.every((x) => GEZEITEN_SIDE_TOTEM_SIGILS.includes(x)));
  }
});

// ───────── Komplette Matches ─────────
test("Gezeiten: 300 KI-Matches (alle Stufen, beide Draft-Modi) ohne Exception, Endlosschleife oder Fremdkarten", () => {
  const levels = ["easy", "normal", "hard"];
  for (let g = 0; g < 300; g++) {
    let s = createMatch({ seed: `GEZ${g}`, settings: { zirkel: "gezeiten", draftMode: g % 2 ? "separate" : "shared", pathLength: 2 + (g % 3) }, salt: String(g) });
    assert.equal(s.settings.zirkel, "gezeiten");
    const rng = { rng: g + 7 };
    let steps = 0;
    let sawFlood = false;
    while (s.phase !== "over") {
      assert.ok(steps++ < 8000, `Spiel ${g} endet nicht (Phase ${s.phase})`);
      const who = awaiting(s);
      const p = who[g % who.length];
      const a = steps % 19 === 0 ? { type: "timeout", player: p } : aiAction(s, p, levels[g % 3], rng);
      const res = applyAction(s, a);
      s = res.error ? applyAction(s, { type: "timeout", player: p }).state : res.state;
      if (s.battle?.tide === 2) sawFlood = true;
    }
    for (const P of s.players) assert.ok(P.deck.every((c) => CARDS[c.baseId].zirkel === "gezeiten"), `Spiel ${g}: Fremdkarte im Deck`);
    if (g < 20) assert.ok(sawFlood || s.history.every((h) => h.turns < 5), `Spiel ${g}: nie Flut erreicht`);
  }
});

test("Gezeiten: Determinismus (gleicher Seed, gleiche KI-Aktionen → gleicher End-State)", () => {
  const run = () => {
    let s = createMatch({ seed: "GEZDET", settings: { zirkel: "gezeiten" }, salt: "x" });
    const rng = { rng: 5 };
    for (let i = 0; s.phase !== "over" && i < 8000; i++) {
      const p = awaiting(s)[0];
      const r = applyAction(s, aiAction(s, p, "normal", rng));
      s = r.error ? applyAction(s, { type: "timeout", player: p }).state : r.state;
    }
    return s;
  };
  assert.deepEqual(run(), run());
});
