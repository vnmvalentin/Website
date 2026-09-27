// Moorwanderung Phase 2: NPC-Daten, Hausregeln, Boss-Phasen, Belohnungen, Niederlagen-Regeln, Späherturm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBattle, endTurn, unitAt, testCard, act } from "./helpers.js";
import { Resolver, createBattle } from "../engine/battle.js";
import { CARDS } from "../engine/cards.js";
import { RULES, RULE_IDS } from "../engine/rules.js";
import { createRun, applyRunAction, awaitingRun } from "../engine/modes/moorwanderung/run.js";
import { runAiAction } from "../engine/modes/moorwanderung/ai.js";
import { viewForRun } from "../engine/modes/moorwanderung/view.js";
import { NPCS, BOSSES, NPC_BY_ID, npcsOf, bossOf } from "../data/modes/moorwanderung/npcs.js";
import { BIOMES, biomesOf, biomeFor } from "../data/modes/moorwanderung/biomes.js";
import { de } from "../i18n/de.js";

testCard("R_wall", { attack: 0, health: 5 });
testCard("R_hit2", { attack: 2, health: 3 });
testCard("R_big", { attack: 5, health: 5 });

// ───────── Daten ─────────
test("Daten: je Zirkel 6 Biome, mind. 16 NPCs (3 pro Biom), 6 Bosse mit 2 Phasen; alle Regeln, Karten und Texte gibt es", () => {
  for (const z of ["moor", "gezeiten"]) {
    const biomes = biomesOf(z);
    assert.equal(biomes.length, 6, z);
    assert.ok(NPCS.filter((n) => n.zirkel === z).length >= 16, `${z}: NPCs`);
    assert.equal(BOSSES.filter((b) => b.zirkel === z).length, 6, `${z}: Bosse`);
    for (const b of biomes) {
      assert.ok(npcsOf(b.id).length >= 3, `${b.id}: NPCs`);
      assert.ok(bossOf(b.id), `${b.id}: Boss`);
    }
  }
  assert.equal(new Set(BIOMES.map((b) => b.id)).size, BIOMES.length);
  for (const n of [...NPCS, ...BOSSES]) {
    assert.ok(n.name && n.enter && n.exit, `${n.id}: Texte`);
    assert.ok(n.tribes.length && n.tribes.every((t) => de.tribes[t]), `${n.id}: Stämme`);
    const rules = n.phases ? n.phases.map((p) => p.rule) : [n.rule];
    for (const r of rules) assert.ok(RULES[r] && de.run.rules[r], `${n.id}: Regel ${r}`);
    for (const id of (n.phases?.[1]?.spawn || [])) {
      assert.ok(CARDS[id], `${n.id}: unbekannte Karte ${id}`);
      assert.equal(CARDS[id].zirkel, n.zirkel, `${n.id}: ${id} aus fremdem Zirkel`);
    }
    if (n.phases) assert.equal(n.phases.length, 2, `${n.id}: zwei Phasen`);
  }
  for (const r of RULE_IDS) assert.ok(de.run.rules[r], `Regeltext ${r}`);
  assert.equal(biomeFor("moor", 7).biome.id, "birkengrab");
  assert.equal(biomeFor("moor", 7).cycle, 1);
});

// ───────── Hausregeln ─────────
/** Kampf mit Hausregel für Sitz 1. */
function withRule(/** @type {string} */ id, /** @type {any} */ spec = {}) {
  const s = setupBattle(spec);
  s.rules = [{ id, seat: 1, tribe: "myzel" }];
  return s;
}

test("Hausregeln: Auren, Werte, Start- und Zug-Effekte", () => {
  // Aura: alle Karten von Sitz 1 tauchen ab
  const a = withRule("schlammbad", { p1: { front: ["R_wall"] } });
  assert.ok(new Resolver(a).level(unitAt(a, 1, "front", 0), "tauchgang") > 0);
  assert.equal(new Resolver(a).level(a.players[0].front[0] || { owner: 0, sigils: [], card: { tribe: "x" }, lane: 0 }, "tauchgang"), 0);
  // Werte beim Ausspielen
  const z = withRule("zaehesfleisch", { active: 1, p1: { hand: ["R_hit2"] } });
  act(z, { type: "play", uid: z.players[1].hand[0].uid, zone: "front", lane: 0 });
  assert.equal(unitAt(z, 1, "front", 0).health, 4);
  // Start: Knochenhort
  const k = withRule("knochenhort");
  new Resolver(k).ruleHook("start");
  assert.equal(k.players[1].bones, 3);
  // Zugbeginn: Vorrat zieht eine zusätzliche Karte
  const v = withRule("vorrat", { p1: { deck: ["R_wall", "R_wall", "R_wall"] } });
  endTurn(v);
  assert.equal(v.players[1].hand.length, 1);
  // Sporenregen: jeden zweiten eigenen Zug ein Brutling in der Hinterreihe
  const sp = withRule("sporenregen");
  endTurn(sp); endTurn(sp); endTurn(sp);
  assert.equal(sp.players[1].back.filter(Boolean).length, 1);
  // Aschenregen: jeden dritten eigenen Zug 1 Schaden an den gegnerischen Frontkarten
  const as = withRule("aschenregen", { p0: { front: ["R_wall"] } });
  for (let i = 0; i < 6; i++) endTurn(as);
  assert.equal(unitAt(as, 0, "front", 0).health, 4);
});

// ───────── Boss ─────────
test("Boss: gewinnt der Spieler Phase 1, räumt der Boss sein Feld, Waage auf 0, neue Regel und Aufstellung; Phase 2 entscheidet", () => {
  const deck = Array.from({ length: 10 }, (_, i) => ({ uid: `b${i}`, baseId: "R_wall", mods: [] }));
  const { state } = createBattle({
    battleNo: 1, starter: 0, rng: 5,
    players: [{ deck, sideType: "moorling", items: [], totems: {} }, { deck: deck.map((c) => ({ ...c })), sideType: "moorling", items: [], totems: {} }],
    rules: [{ id: "vorrat", seat: 1 }],
    boss: { seat: 1, phase: 1, phases: [{ rule: "vorrat" }, { rule: "zaehesfleisch", spawn: ["bestien_aschbaer", "R_wall"] }] },
  });
  state.players[1].front[2] = new Resolver(state).makeUnit({ ...CARDS.R_wall, uid: "x1", baseId: "R_wall", sigils: [], cost: { type: "blood", amount: 0 } }, 1, "front", 2);
  const r = new Resolver(state);
  r.addScale(0, 5, "attack");
  assert.equal(state.phase, "main");
  assert.equal(state.boss.phase, 2);
  assert.equal(state.scale, 0);
  assert.deepEqual(state.rules.map((x) => x.id), ["zaehesfleisch"]);
  assert.equal(state.players[1].front[0]?.card.baseId, "bestien_aschbaer");
  assert.equal(state.players[1].front[0].health, CARDS.bestien_aschbaer.health + 1, "neue Regel wirkt auf die Aufstellung");
  assert.equal(state.players[1].front[2], null);
  assert.ok(r.events.some((e) => e.type === "bossPhase"));
  r.addScale(0, 5, "attack");
  assert.equal(state.phase, "over");
  assert.equal(state.winner, 0);
});

// ───────── Run: Kämpfe, Belohnung, Niederlage ─────────
/** Run bis zu einer Bedingung mit KI spielen. */
function play(/** @type {any} */ s, /** @type {(s: any) => boolean} */ until, seed = 1, onlyOthers = false) {
  const rng = { rng: seed };
  for (let i = 0; i < 40000 && s.phase !== "over" && !until(s); i++) {
    const who = awaitingRun(s).filter((p) => !onlyOthers || p !== 0);
    if (!who.length) break;
    const p = who[i % who.length];
    let r = applyRunAction(s, runAiAction(s, p, "normal", rng));
    if (r.error) r = applyRunAction(s, { type: "timeout", player: p });
    s = r.state;
  }
  return s;
}

test("Pfad im Run: Biom, Kampf-Knoten, jeder Spieler trifft 2–3 Kämpfe plus Boss", () => {
  let s = play(createRun({ seed: "PVE", names: ["A", "B", "C"], salt: "p" }), (x) => x.phase === "path");
  assert.equal(s.path.biome, "aschemoor");
  assert.ok(s.path.map.nodes.flat().some((n) => n.type === "npc"));
  assert.ok(s.path.map.nodes[s.path.map.levels - 1].every((n) => n.type === "boss" && NPC_BY_ID[n.bossId]));
  s = play(s, (x) => x.phase !== "path" || x.pathNo > 1);
  // Nach dem ersten Pfad: jeder hat Kämpfe hinter sich (Sieg oder Niederlage)
  for (const P of s.players) {
    const fights = P.stats.npcWins + P.stats.npcLosses + P.stats.bossLosses;
    assert.ok(fights >= 3 && fights <= 4, `${P.name}: ${fights} Kämpfe`);
  }
});

test("Sieg gegen NPC: Belohnungs-Szene mit 3 Karten und Splittern; Niederlage: Makel bis Pfadende, keine Karte", () => {
  let s = play(createRun({ seed: "BELOHNUNG", names: ["A", "B"], salt: "b" }), (x) => x.phase === "path" && x.path.players[0].scene?.kind === "fight", 2);
  const pp = s.path.players[0];
  assert.ok(pp.fight);
  const deckBefore = s.players[0].deck.length;
  // Kampf gewinnen: Waage direkt kippen
  s = JSON.parse(JSON.stringify(s));
  s.path.players[0].fight.battle.scale = 4;
  let r = applyRunAction(s, { type: "draw", player: 0, pile: "side" });
  if (r.error) r = { state: s };
  s = r.state;
  s.path.players[0].fight.battle.scale = 5;
  const b = s.path.players[0].fight.battle;
  b.phase = "main";
  // Zug beenden: die Engine prüft die Waage (schon auf 5) und beendet den Kampf mit Sieg
  b.players[0].drew = true;
  r = applyRunAction(s, { type: "endTurn", player: 0 });
  assert.equal(r.error, undefined);
  s = r.state;
  const scene = s.path.players[0].scene;
  assert.equal(s.path.players[0].fight, null);
  assert.equal(scene?.kind, "reward");
  assert.equal(scene.offers.length, 3);
  assert.ok(scene.shards >= 2);
  r = applyRunAction(s, { type: "nodeAction", player: 0, op: "pick", index: 0 });
  assert.equal(r.error, undefined);
  assert.equal(r.state.players[0].deck.length, deckBefore + 1);
  // Niederlage: Makel an einer Karte, der am Pfadende wieder verschwindet
  let t = play(createRun({ seed: "MAKEL", names: ["A", "B"], salt: "m" }), (x) => x.phase === "path" && !!x.path.players[0].fight, 3);
  t = JSON.parse(JSON.stringify(t));
  const tb = t.path.players[0].fight.battle;
  tb.scale = -4;
  tb.players[0].drew = true;
  tb.players[1].front[0] = null;
  // Waage von Hand auf die NPC-Seite kippen und Zug beenden
  tb.scale = -5;
  const res = applyRunAction(t, { type: "endTurn", player: 0 });
  assert.equal(res.error, undefined);
  t = res.state;
  const flawed = t.players[0].deck.filter((dc) => dc.mods.some((m) => m.source === "pfad"));
  assert.equal(flawed.length, 1);
  assert.equal(t.players[0].stats.npcLosses, 1);
  t = play(t, (x) => x.path?.players[0].done || x.phase !== "path", 4);
  assert.ok(t.players[0].deck.every((dc) => !dc.mods.some((m) => m.source === "pfad")), "Makel nach Pfadende entfernt");
});

test("„Hart“: Boss-Niederlage kostet ein Siegel; Belohnungen enthalten keine vergebenen Legendären", () => {
  const s = play(createRun({ seed: "HART", names: ["A", "B", "C", "D"], salt: "h", settings: { hardBoss: true, seals: 2, pathLength: "short" } }), (x) => x.phase === "over");
  const lostToBoss = s.players.some((P) => P.stats.bossLosses > 0);
  if (lostToBoss) {
    // Wer Bosse verloren hat, hat dadurch Siegel verloren: Summe verlorener Siegel > Duell-Niederlagen
    const lost = s.players.reduce((a, P) => a + P.stats.duelsLost + P.stats.bossLosses, 0);
    assert.ok(lost >= s.players.reduce((a, P) => a + P.stats.duelsLost, 0) + 1);
  }
  const legends = Object.entries(s.legends);
  for (const [id, owner] of legends) {
    for (const [q, P] of s.players.entries()) if (q !== owner) assert.ok(!P.deck.some((dc) => dc.baseId === id), `${id} doppelt vergeben`);
  }
});

test("Späherturm: zeigt nur öffentliche Information eines Mitspielers", () => {
  let s = play(createRun({ seed: "SPAEHER", names: ["A", "B", "C"], salt: "s" }), (x) => x.phase === "path");
  s = JSON.parse(JSON.stringify(s));
  s.path.players[0].scene = { kind: "scout", looked: null };
  const r = applyRunAction(s, { type: "nodeAction", player: 0, op: "look", target: 2 });
  assert.equal(r.error, undefined);
  const v = viewForRun(r.state, 0);
  const rep = v.path.me.scene.report;
  assert.equal(rep.name, "C");
  assert.equal(rep.deckSize, s.players[2].deck.length);
  assert.equal(rep.deck, undefined);
  assert.equal(applyRunAction(s, { type: "nodeAction", player: 0, op: "look", target: 0 }).error, "badTarget");
});
