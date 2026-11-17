// Das Spiel nach dem Sieg (engine/twists.js): Wendungen je Zyklus, Zyklus-Druck, gedämpfte Beute — und dass der erste
// Zyklus davon nichts merkt. Ausführen: npm test -- Adventure (im Frontend-Ordner)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../game.js";
import { BIOMES } from "../../data/biomes.js";
import { hurtPlayer } from "../combat.js";
import {
  TWISTS, TWIST_IDS, twistForLoop, activeTwist, beyond, depthOf, WORLDS_PER_LOOP, rewardCoeff, LOOP_REWARD_FROM,
  loopEnemySpeed, loopHitFloor, loopDodge, loopHordeCap, twHeal, twEnemySpeed,
} from "../twists.js";

test("Wendungen: keine im ersten Zyklus, aus dem Seed bestimmt, nie zweimal hintereinander dieselbe", () => {
  assert.equal(twistForLoop(123, 0), null);
  for (const seed of [1, 22, 333, 4444, 55555]) {
    let prev = null;
    for (let loop = 1; loop <= 12; loop++) {
      const id = twistForLoop(seed, loop);
      assert.ok(TWIST_IDS.includes(id), `${seed}/${loop}: ${id}`);
      assert.notEqual(id, prev, `Seed ${seed}: Zyklus ${loop + 1} wiederholt ${id}`);
      assert.equal(twistForLoop(seed, loop), id, "gleicher Seed, gleiche Wendung");
      prev = id;
    }
  }
  // Über viele Seeds kommt jede Wendung vor
  const seen = new Set();
  for (let seed = 1; seed < 400; seed++) seen.add(twistForLoop(seed, 1));
  assert.deepEqual([...seen].sort(), [...TWIST_IDS].sort());
  for (const id of TWIST_IDS) assert.ok(TWISTS[id].name && TWISTS[id].desc && Object.keys(TWISTS[id].mods).length, id);
});

test("Erster Zyklus bleibt unverändert: kein Druck, keine Wendung, volle Beute", () => {
  const g = createGame({ kitId: "default", seed: 7 });
  assert.equal(WORLDS_PER_LOOP, BIOMES.length, "eine Welt je Biom");
  for (let cleared = 0; cleared < WORLDS_PER_LOOP; cleared++) {
    g.stagesCleared = cleared;
    g.loop = 0;
    g.coeff = 40; // auch eine hohe Gefahr im ersten Zyklus (langsamer Spieler) bleibt ungedämpft
    assert.equal(beyond(g), 0);
    assert.equal(activeTwist(g), null);
    assert.equal(loopEnemySpeed(g), 1);
    assert.equal(loopHitFloor(g), 0);
    assert.equal(loopDodge(g), 1);
    assert.equal(loopHordeCap(g), 700);
    assert.equal(rewardCoeff(g), 40);
    assert.equal(twHeal(g), 1);
    assert.equal(depthOf(g), cleared + 1);
  }
});

test("Ab Zyklus 2: Druck wächst je Welt, Beute oberhalb der Schwelle gedämpft, Wendung aktiv", () => {
  const g = createGame({ kitId: "default", seed: 7 });
  g.loop = 1;
  g.stagesCleared = WORLDS_PER_LOOP; // erste Welt von Zyklus 2 = Tiefe 7
  assert.equal(depthOf(g), 7);
  assert.equal(beyond(g), 1);
  assert.ok(loopEnemySpeed(g) > 1 && loopHitFloor(g) > 0 && loopDodge(g) < 1);
  const id = activeTwist(g);
  assert.equal(id, twistForLoop(7, 1));
  g.coeff = LOOP_REWARD_FROM * 4;
  assert.equal(rewardCoeff(g), LOOP_REWARD_FROM * 2, "Wurzel oberhalb der Schwelle");
  g.coeff = LOOP_REWARD_FROM / 2;
  assert.equal(rewardCoeff(g), LOOP_REWARD_FROM / 2, "darunter unverändert");
  // Tiefer: mehr Druck
  const flach = { speed: loopEnemySpeed(g), floor: loopHitFloor(g) };
  g.stagesCleared += 6;
  g.loop = 2;
  assert.ok(loopEnemySpeed(g) > flach.speed && loopHitFloor(g) > flach.floor);
  // Wendung „Hast“ wirkt auf das Tempo
  g.twistLoop = g.loop;
  g.twistId = "hast";
  assert.equal(twEnemySpeed(g), TWISTS.hast.mods.enemySpeed);
});

test("Zyklus-Druck: ein Treffer kostet mindestens den Mindestanteil des Lebens, trotz Rüstung", () => {
  const g = createGame({ kitId: "default", seed: 9 });
  const p = g.player;
  p.stats.armor = 100000; // Rüstung schluckt sonst praktisch alles
  p.stats.dodge = 0;
  g.loop = 2;
  g.stagesCleared = WORLDS_PER_LOOP + 6; // Tiefe 13
  g.twistLoop = g.loop;
  g.twistId = "hast"; // eine Wendung ohne Einfluss auf Schaden oder Heilung
  const vorher = p.hp = p.stats.maxHp;
  hurtPlayer(g, 1);
  const verlust = vorher - p.hp;
  assert.ok(verlust >= p.stats.maxHp * loopHitFloor(g) - 1e-9, `verloren ${verlust}, Boden ${p.stats.maxHp * loopHitFloor(g)}`);
  // Im ersten Zyklus gilt kein Boden
  const g1 = createGame({ kitId: "default", seed: 9 });
  g1.player.stats.armor = 100000;
  g1.player.stats.dodge = 0;
  const h = g1.player.hp = g1.player.stats.maxHp;
  hurtPlayer(g1, 1);
  assert.ok(h - g1.player.hp <= 1, "erster Zyklus: kleiner Treffer bleibt klein");
});
