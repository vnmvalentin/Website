// Moorwanderung Phase 3: Budget-Ablauf (Auto-Auflösung), Lager (Totem-Umbau), Warten auf die anderen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, applyRunAction, awaitingRun, pathBudgetSeconds } from "../engine/modes/moorwanderung/run.js";
import { runAiAction } from "../engine/modes/moorwanderung/ai.js";
import { viewForRun } from "../engine/modes/moorwanderung/view.js";

const names = (/** @type {number} */ n) => Array.from({ length: n }, (_, i) => `Z${i}`);

function play(/** @type {any} */ s, /** @type {(s: any) => boolean} */ until, seed = 1, skip = /** @type {number[]} */ ([])) {
  const rng = { rng: seed };
  for (let i = 0; i < 40000 && s.phase !== "over" && !until(s); i++) {
    const who = awaitingRun(s).filter((p) => !skip.includes(p));
    if (!who.length) break;
    const p = who[i % who.length];
    let r = applyRunAction(s, runAiAction(s, p, "normal", rng));
    if (r.error) r = applyRunAction(s, { type: "timeout", player: p });
    s = r.state;
  }
  return s;
}

test("Budget: gleiches Pfad-Budget für alle, abhängig von Länge und Tempo", () => {
  const a = play(createRun({ seed: "B1", names: names(3), settings: { pace: "fast", pathLength: "short" } }), (x) => x.phase === "path");
  const b = play(createRun({ seed: "B1", names: names(3), settings: { pace: "relaxed", pathLength: "long" } }), (x) => x.phase === "path");
  assert.equal(pathBudgetSeconds(a), 4 * 40 + 4 * 150);
  assert.equal(pathBudgetSeconds(b), 8 * 90 + 4 * 360);
  assert.equal(viewForRun(a, 0).path.budgetSeconds, pathBudgetSeconds(a));
});

test("Budget abgelaufen mitten im NPC-Kampf: die KI spielt zu Ende, der Rest des Pfads wird automatisch entschieden", () => {
  // Spieler 0 steht, alle anderen spielen; dann läuft sein Budget ab, während er im Kampf ist
  let s = play(createRun({ seed: "AUTO", names: names(4), salt: "a" }), (x) => x.phase === "path" && !!x.path.players[0].fight, 2);
  assert.ok(s.path.players[0].fight, "Spieler 0 kämpft");
  s = play(s, (x) => x.phase !== "path" || x.path.players.every((pp, q) => q === 0 || pp.done), 3, [0]);
  assert.equal(s.path.players[0].done, false);
  const r = applyRunAction(s, { type: "budgetExpired", player: 0 });
  assert.equal(r.error, undefined);
  assert.ok(r.events.some((e) => e.type === "budgetExpired" && e.player === 0));
  assert.ok(r.events.some((e) => e.type === "fightEnd" && e.player === 0), "Kampf wurde zu Ende gespielt");
  // Alle waren fertig, also geht es direkt weiter
  assert.ok(r.state.pathNo > s.pathNo || r.state.phase === "duels", `Phase ${r.state.phase}`);
});

test("Budget-Ablauf für alle 6 gleichzeitig: jeder Pfad wird fertig, das Spiel geht in die nächste Phase", () => {
  let s = play(createRun({ seed: "SECHS", names: names(6), salt: "s" }), (x) => x.phase === "path");
  const pathNo = s.pathNo;
  for (let p = 0; p < 6; p++) {
    const r = applyRunAction(s, { type: "budgetExpired", player: p });
    if (r.error) assert.equal(r.error, "pathDone");
    else s = r.state;
  }
  assert.ok(s.pathNo > pathNo || s.phase === "duels");
});

test("Lager: Totems umbauen nur, wenn der eigene Pfad fertig ist; ungültige Kombinationen abgelehnt", () => {
  let s = play(createRun({ seed: "LAGER", names: names(3), salt: "l" }), (x) => x.phase === "path");
  assert.equal(applyRunAction(s, { type: "campTotem", player: 0, head: 0, base: 0 }).error, "notInCamp");
  s = play(s, (x) => x.phase === "path" && x.path.players[0].done, 4, [1, 2]);
  assert.ok(s.path.players[0].done);
  // Vorhandene Teile: Nebendeck-Kopf und Nebendeck-Sigil des Startdecks
  const P = s.players[0];
  const side = P.heads.findIndex((h) => h.kind === "side");
  const sideBase = P.bases.findIndex((b) => b.kind === "sigil");
  const r = applyRunAction(s, { type: "campTotem", player: 0, head: side, base: sideBase });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.state.players[0].totems.side.base, P.bases[sideBase]);
  assert.equal(applyRunAction(s, { type: "campTotem", player: 0, head: 99, base: 0 }).error, "badIndex");
});
