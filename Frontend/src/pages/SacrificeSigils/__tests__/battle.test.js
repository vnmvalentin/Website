// Grundregeln des Kampfs: Ressourcen, Opfer, Angriff, Waage, Hinterreihe, Deck leer, Handlimit, Patt-Brecher.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBattle, act, endTurn, unitAt, testCard, dc } from "./helpers.js";
import { createBattle, battleAction, WAX_MAX, STALEMATE_TURN } from "../engine/battle.js";

testCard("T_a2h2", { attack: 2, health: 2 });
testCard("T_a0h1", { attack: 0, health: 1 });
testCard("T_a0h3", { attack: 0, health: 3 });
testCard("T_a5h1", { attack: 5, health: 1 });
testCard("T_blood2", { attack: 3, health: 3, cost: { type: "blood", amount: 2 } });
testCard("T_blood1", { attack: 1, health: 1, cost: { type: "blood", amount: 1 } });
testCard("T_bones3", { attack: 1, health: 1, cost: { type: "bones", amount: 3 } });
testCard("T_wax2", { attack: 1, health: 1, cost: { type: "wax", amount: 2 } });

test("Kampfstart: Starthand 3+1, zweiter Spieler +1 Nebendeck-Karte und +1 Wachs, Startspieler zieht im ersten Zug nicht", () => {
  const deck = Array.from({ length: 10 }, () => dc("T_a2h2"));
  const { state } = createBattle({ battleNo: 1, starter: 0, rng: 7, players: [
    { deck, sideType: "moorling", items: [], totems: {} },
    { deck: deck.map((c) => ({ ...c })), sideType: "wachsling", items: [], totems: {} },
  ] });
  assert.equal(state.players[0].hand.length, 4);
  assert.equal(state.players[1].hand.length, 5);
  assert.equal(state.players[0].wax, 1); // eigener Zugbeginn
  assert.equal(state.players[1].wax, 1); // Ausgleich
  assert.equal(state.players[0].drew, true);
  assert.equal(state.players[1].hand.filter((c) => c.baseId === "side_wachsling").length, 2);
});

test("Wachs: +1 pro eigenem Zug, Maximum 6", () => {
  const s = setupBattle({ p0: { wax: 5 }, p1: { wax: 6 } });
  endTurn(s); // p1 beginnt: 6 bleibt 6
  assert.equal(s.players[1].wax, WAX_MAX);
  s.players[1].drew = true;
  endTurn(s); // p0: 5 → 6
  assert.equal(s.players[0].wax, 6);
});

test("Blut: Opfer bezahlt, gibt Knochen; zu wenig oder überflüssige Opfer sind ungültig", () => {
  const s = setupBattle({ p0: { hand: ["T_blood2"], front: ["T_a0h1", "T_a0h1", "T_a0h1"] } });
  const uid = s.players[0].hand[0].uid;
  assert.equal(act(s, { type: "play", uid, zone: "front", lane: 3, sacrifices: [{ zone: "front", lane: 0 }] }).error, "notEnoughBlood");
  assert.equal(act(s, { type: "play", uid, zone: "front", lane: 3, sacrifices: [0, 1, 2].map((lane) => ({ zone: "front", lane })) }).error, "tooManySacrifices");
  const res = act(s, { type: "play", uid, zone: "front", lane: 0, sacrifices: [{ zone: "front", lane: 0 }, { zone: "front", lane: 1 }] });
  assert.equal(res.error, undefined);
  assert.equal(unitAt(s, 0, "front", 0).card.baseId, "T_blood2");
  assert.equal(unitAt(s, 0, "front", 1), null);
  assert.equal(s.players[0].bones, 2);
  assert.equal(s.players[0].stats.sacrifices, 2);
});

test("Knochen und Wachs werden bezahlt, fehlende Ressourcen blocken", () => {
  const s = setupBattle({ p0: { hand: ["T_bones3", "T_wax2"], bones: 2, wax: 2 } });
  const [bonesCard, waxCard] = s.players[0].hand;
  assert.equal(act(s, { type: "play", uid: bonesCard.uid, zone: "front", lane: 0 }).error, "notEnoughBones");
  assert.equal(act(s, { type: "play", uid: waxCard.uid, zone: "front", lane: 0 }).error, undefined);
  assert.equal(s.players[0].wax, 0);
  s.players[0].bones = 3;
  assert.equal(act(s, { type: "play", uid: bonesCard.uid, zone: "back", lane: 0 }).error, undefined);
  assert.equal(s.players[0].bones, 0);
});

test("Angriff: leerer Slot → Waage, Blocker nimmt Schaden, Überschuss verfällt", () => {
  const s = setupBattle({ p0: { front: ["T_a2h2", "T_a2h2", "T_a5h1"] }, p1: { front: [null, "T_a0h3", "T_a0h1"] } });
  endTurn(s);
  assert.equal(s.scale, 2);
  assert.equal(unitAt(s, 1, "front", 1).health, 1);
  assert.equal(unitAt(s, 1, "front", 2), null);
  assert.equal(s.players[1].bones, 1);
});

test("Waage: 5 im Vorteil gewinnt, Überschuss zählt als Overkill", () => {
  const s = setupBattle({ p0: { front: ["T_a5h1", "T_a2h2"] }, scale: 0 });
  endTurn(s);
  assert.equal(s.phase, "over");
  assert.equal(s.winner, 0);
  assert.equal(s.overkill, 0);
  const t = setupBattle({ p0: { front: ["T_a5h1", "T_a2h2"] }, scale: 0 });
  t.scale = 1;
  endTurn(t);
  assert.equal(t.overkill, 1);
});

test("Hinterreihe greift nicht an, wird nicht angegriffen und rückt am Zugende nach", () => {
  const s = setupBattle({ p0: { back: ["T_a2h2"] }, p1: { front: ["T_a2h2"], back: [null, "T_a2h2"] } });
  endTurn(s);
  assert.equal(s.scale, 0);
  assert.equal(unitAt(s, 0, "front", 0).card.baseId, "T_a2h2");
  assert.equal(unitAt(s, 0, "back", 0), null);
  // p1 greift an: Lane 0 trifft die nachgerückte Karte, Hinterreihe von p1 rückt nach
  s.players[1].drew = true;
  endTurn(s);
  assert.equal(unitAt(s, 0, "front", 0), null);
  assert.equal(s.players[0].bones, 1);
  assert.equal(s.scale, 0);
  assert.ok(unitAt(s, 1, "front", 1));
});

test("Deck leer: Verwesung 1, dann 2, dann 3 zugunsten des Gegners", () => {
  const s = setupBattle({ p0: { deck: [] }, p1: { deck: [] } });
  s.players[0].drew = false;
  act(s, { type: "draw", pile: "main" });
  assert.equal(s.scale, -1);
  s.players[0].drew = false;
  act(s, { type: "draw", pile: "main" });
  assert.equal(s.scale, -3);
  s.players[0].drew = false;
  act(s, { type: "draw", pile: "side" });
  assert.equal(s.scale, -3);
});

test("Ziehen ist Pflicht und nur einmal pro Zug", () => {
  const s = setupBattle({ p0: { deck: ["T_a2h2"] } });
  s.players[0].drew = false;
  assert.equal(act(s, { type: "endTurn" }).error, "mustDrawFirst");
  assert.equal(act(s, { type: "draw", pile: "main" }).error, undefined);
  assert.equal(act(s, { type: "draw", pile: "side" }).error, "alreadyDrew");
});

test("Handlimit 8: Ziehen bei 8 Karten erzwingt Abwerfen", () => {
  const s = setupBattle({ p0: { hand: Array(8).fill("T_a0h1"), deck: ["T_a2h2"] } });
  s.players[0].drew = false;
  act(s, { type: "draw", pile: "main" });
  assert.equal(s.players[0].hand.length, 9);
  assert.equal(act(s, { type: "endTurn" }).error, "mustDiscard");
  act(s, { type: "discard", uid: s.players[0].hand[0].uid });
  assert.equal(s.players[0].hand.length, 8);
  assert.equal(act(s, { type: "endTurn" }).error, undefined);
});

test("Patt-Brecher: ab Zug 30 bekommt der aktive Spieler am Zugende 1 Gewicht gegen sich", () => {
  const s = setupBattle({});
  s.turn = STALEMATE_TURN;
  endTurn(s);
  assert.equal(s.scale, -1);
});

test("Hammer: eigene Karte zerstören gibt Knochen, einmal pro Zug", () => {
  const s = setupBattle({ p0: { front: ["T_a0h1", "T_a0h1"] } });
  assert.equal(act(s, { type: "hammer", zone: "front", lane: 0 }).error, undefined);
  assert.equal(s.players[0].bones, 1);
  assert.equal(act(s, { type: "hammer", zone: "front", lane: 1 }).error, "hammerUsed");
});

test("Zug-Timer: zieht aus dem Nebendeck, wenn noch nicht gezogen, und beendet den Zug", () => {
  const s = setupBattle({ p0: { hand: [] } });
  s.players[0].drew = false;
  const res = battleAction(s, { type: "timeout", player: 0 });
  assert.equal(res.error, undefined);
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.active, 1);
});

test("Nur der aktive Spieler darf handeln", () => {
  const s = setupBattle({});
  assert.equal(battleAction(s, { type: "endTurn", player: 1 }).error, "notYourTurn");
});
