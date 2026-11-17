// Neue Welten (Ausbauplan „av-welten“): ab Zyklus 2 im Wechsel, vollständige Daten, Weltmechaniken, neue Bosse.
// Ausführen: npm test -- Adventure (im Frontend-Ordner)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, stepGame, TICK } from "../game.js";
import { loadStage } from "../stage.js";
import { spawnBoss } from "../bosses/index.js";
import { spawnEnemy } from "../enemies.js";
import { BIOMES, BIOMES_NEU, ALL_BIOMES, biomeFor } from "../../data/biomes.js";
import { BOSSES } from "../../data/bosses.js";
import { ENEMIES } from "../../data/enemies.js";
import { ITEMS } from "../../data/items.js";
import { CREATURES, BOSS_LOOK } from "../../render/flat/creatures.js";
import { CAST, BOSS_CAST } from "../../render3d/cast.js";
import { FLOORS } from "../../render/flat/world.js";
import { GRAVE_WARN, graveCount, SPORE_TRIGGER, SPORE_WARN, SPORE_REST, inPool, GEAR_REACH, gearAngle } from "../worldMechanics.js";
import { chooseUpgrade } from "../levelup.js";
import { generateWorld } from "../worldgen.js";

const idle = () => ({ held: {}, pressed: {}, aimX: 0, aimY: 0 });
// Ein Schritt; eine offene Stufenwahl (Kills durch Fallen geben Erfahrung) wird mit der ersten Karte erledigt
const spawnEnemyAt = (g, id, x, y) => spawnEnemy(g, id, x, y, {});
const step = (g) => { stepGame(g, TICK, idle()); if (g.levelUp) chooseUpgrade(g, 0); };
// Eine neue Welt laden (Zyklus 2), Spieler unverwundbar — geprüft wird nur die Mechanik
function neueWelt(id, seed = 31) {
  const g = createGame({ kitId: "default", seed });
  g.loop = 1; g.stagesCleared = 6; g.stageIndex = BIOMES_NEU.findIndex((b) => b.id === id);
  loadStage(g);
  assert.equal(g.biome.id, id);
  g.player.buffs.invuln = 1e9;
  return g;
}

test("Welt-Sätze: Zyklus 1 klassisch, ab Zyklus 2 im Wechsel neu/klassisch, sechs Welten je Satz", () => {
  assert.equal(BIOMES_NEU.length, BIOMES.length);
  for (let i = 0; i < BIOMES.length; i++) {
    assert.equal(biomeFor(i, 0), BIOMES[i], "Zyklus 1");
    assert.equal(biomeFor(i, 1), BIOMES_NEU[i], "Zyklus 2");
    assert.equal(biomeFor(i, 2), BIOMES[i], "Zyklus 3");
    assert.equal(biomeFor(i, 3), BIOMES_NEU[i], "Zyklus 4");
    assert.equal(!!BIOMES_NEU[i].final, !!BIOMES[i].final, "das Finale bleibt auf seinem Platz");
  }
  assert.ok(BIOMES_NEU.some((b) => !BIOMES.includes(b)), "mindestens eine neue Welt");
});

test("Jede neue Welt ist vollständig: Boden, Gegner mit Figur (2D und 3D), Futter und Koloss, Bosse mit Aussehen und Beute", () => {
  for (const b of ALL_BIOMES.filter((x) => !BIOMES.includes(x))) {
    assert.ok(FLOORS[b.id], `${b.id}: Boden fehlt`);
    assert.ok(b.obstacles.length >= 2, `${b.id}: Hindernisse`);
    for (const [id] of b.enemies) {
      assert.ok(ENEMIES[id], `${b.id}: Gegner ${id} fehlt`);
      assert.ok(CREATURES[ENEMIES[id].fig || id], `${id}: 2D-Figur fehlt`);
      assert.ok(CAST[id], `${id}: 3D-Besetzung fehlt`);
    }
    assert.ok(b.enemies.some(([id]) => ENEMIES[id].tier === "futter"), `${b.id}: kein Futter`);
    assert.ok(b.enemies.some(([id]) => ENEMIES[id].tier === "brocken" && ["brute", "charger"].includes(ENEMIES[id].ai)), `${b.id}: kein Koloss möglich`);
    for (const id of b.bosses) {
      assert.ok(BOSSES[id], `Boss ${id}`);
      assert.equal(ITEMS[BOSSES[id].item]?.rarity, "boss", `Boss-Item von ${id}`);
      assert.ok(BOSS_LOOK[id] && CREATURES[BOSS_LOOK[id].fig], `${id}: 2D-Aussehen`);
      assert.ok(BOSS_CAST[id], `${id}: 3D-Besetzung`);
    }
  }
});

test("Friedhof: ein Grab kündigt sich an, weckt dann Tote und ruht danach", () => {
  const g = createGame({ kitId: "default", seed: 31 });
  g.loop = 1; g.stagesCleared = 6; g.stageIndex = 0;
  loadStage(g);
  assert.equal(g.biome.id, "friedhof");
  const grave = g.obstacles.find((o) => o.sprite === "grave");
  assert.ok(grave, "der Friedhof hat Gräber");
  g.enemies = [];
  g.player.x = grave.x + grave.r + 60; g.player.y = grave.y;
  g.player.buffs.invuln = 1e9; // nur die Mechanik prüfen
  const vor = g.enemies.length;
  stepGame(g, TICK, idle());
  assert.ok(grave.wakeAt > g.time, "Ankündigung läuft");
  for (let t = 0; t < GRAVE_WARN + 0.2; t += TICK) stepGame(g, TICK, idle());
  const geweckt = g.enemies.filter((e) => !e.dead).length - vor;
  assert.ok(geweckt >= graveCount(g) - 1, `${geweckt} Tote geweckt (erwartet ${graveCount(g)})`);
  // Ruht: direkt danach erwacht es nicht noch einmal
  const n = g.enemies.length;
  for (let i = 0; i < 30; i++) stepGame(g, TICK, idle());
  assert.equal(grave.wakeAt, null);
  assert.ok(g.enemies.length <= n + 40, "kein zweites Erwachen desselben Grabs (nur Nachschub der Horde)");
});

test("Neue Bosse kämpfen fehlerfrei durch alle Angriffe (auch Phase 2)", () => {
  for (const b of ALL_BIOMES.filter((x) => !BIOMES.includes(x))) {
    for (const id of b.bosses) {
      const g = createGame({ kitId: "default", seed: 44 });
      g.loop = 1; g.stagesCleared = 6;
      g.stageIndex = BIOMES_NEU.indexOf(b);
      loadStage(g);
      g.player.buffs.invuln = 1e9; // nur der Boss wird geprüft (ein Treffer kostet in Zyklus 2 einen Anteil des Lebens)
      const boss = spawnBoss(g, id, g.player.x + 300, g.player.y);
      const seen = new Set();
      for (let i = 0; i < Math.round(40 / TICK); i++) {
        if (i === Math.round(20 / TICK)) boss.hp = boss.maxHp * 0.3; // Raserei
        step(g);
        seen.add(boss.state);
      }
      assert.ok(boss.phase2, `${id}: Phase 2 erreicht`);
      assert.ok(seen.size >= 4, `${id}: nur ${[...seen].join(", ")}`);
      assert.ok(Number.isFinite(boss.x) && Number.isFinite(boss.y), `${id}: Lage`);
    }
  }
});

test("Pilzwald: ein Sporenpilz kündigt sich an, stößt eine Wolke aus (macht langsam, kein Schaden) und ruht dann", () => {
  const g = neueWelt("pilzwald");
  const pilz = g.obstacles.find((o) => o.sprite === "sporeshroom");
  assert.ok(pilz, "der Pilzwald hat Sporenpilze");
  g.enemies = [];
  g.player.buffs.invuln = 0; // Wolken schaden nicht — der Zustand soll trotzdem ankommen
  g.player.stats.dodge = 0;
  g.director.t = 1e9; g.director.giantT = 1e9;
  g.player.x = pilz.x + pilz.r + SPORE_TRIGGER * 0.5; g.player.y = pilz.y;
  const hp = g.player.hp;
  step(g);
  assert.ok(pilz.puffAt > g.time, "Ankündigung läuft");
  for (let t = 0; t < SPORE_WARN + 0.5; t += TICK) step(g);
  assert.ok(g.zones.some((z) => z.kind === "spores"), "Sporenwolke liegt");
  assert.ok(g.player.status.slowT > 0 && g.player.status.slowPct > 0, "in der Wolke langsamer");
  assert.equal(g.player.hp, hp, "die Wolke selbst macht keinen Schaden (auch nicht den Mindestschaden ab Zyklus 2)");
  assert.ok(pilz.restUntil >= g.time + SPORE_REST - SPORE_WARN - 1, "ruht danach");
});

test("Sumpf: Giftpfützen liegen fest je Seed, halten Start und Teleporter frei und vergiften, ohne zu töten", () => {
  const a = neueWelt("sumpf", 7), b = neueWelt("sumpf", 7);
  assert.ok(a.pools.length >= 12, `${a.pools.length} Pfützen`);
  assert.deepEqual(a.pools, b.pools, "gleicher Seed, gleiche Pfützen");
  const w = generateWorld(7, a.stageIndex, 1, a.biome);
  for (const o of a.pools) assert.ok(Math.hypot(o.x - w.spawn.x, o.y - w.spawn.y) > 320 + o.r - 1, "Start bleibt frei");
  // Die klassischen Welten bekommen keine Pfützen und bauen sich genau wie vorher
  const g = createGame({ kitId: "default", seed: 7 });
  assert.deepEqual(g.pools, []);
  const pool = a.pools[0];
  a.player.buffs.invuln = 0;
  a.enemies = []; a.director.t = 1e9; a.director.giantT = 1e9;
  a.player.x = pool.x; a.player.y = pool.y;
  a.player.hp = 5;
  for (let t = 0; t < 3; t += TICK) step(a);
  assert.ok(inPool(a, a.player.x, a.player.y, a.player.r), "steht noch in der Pfütze");
  assert.ok(a.player.status.poisonT > 0, "vergiftet");
  assert.ok(a.player.status.slowPct > 0, "Morast bremst");
  assert.ok(a.player.alive && a.player.hp >= 1, "Gift aus der Pfütze tötet nicht");
});

test("Uhrwerkturm: die Klinge dreht sich, trifft dich einmal je Durchgang und mahlt Futter klein", () => {
  const g = neueWelt("uhrwerk");
  const rad = g.obstacles.find((o) => o.sprite === "gear");
  assert.ok(rad, "der Uhrwerkturm hat Zahnradfallen");
  g.enemies = []; g.director.t = 1e9; g.director.giantT = 1e9;
  const a0 = gearAngle(g, rad);
  step(g);
  assert.notEqual(gearAngle(g, rad), a0, "die Klinge dreht sich");
  // Spieler auf die Bahn der Klinge stellen (halbe Länge), weit weg von allem anderen
  g.player.buffs.invuln = 0; g.player.stats.dodge = 0;
  g.player.x = rad.x + Math.cos(Math.PI / 3) * GEAR_REACH * 0.6; g.player.y = rad.y + Math.sin(Math.PI / 3) * GEAR_REACH * 0.6;
  g.player.hp = g.player.stats.maxHp = 1e6;
  let treffer = 0, last = g.player.hp;
  for (let t = 0; t < 7; t += TICK) {
    g.player.status.slowT = 0; // Treffer nicht durch Verlangsamung verfälschen
    step(g);
    if (g.player.hp < last - 1) treffer++;
    last = g.player.hp;
  }
  assert.ok(treffer >= 1 && treffer <= 2, `${treffer} Treffer in einem Umlauf`);
  // Futter auf der Bahn fällt
  g.player.buffs.invuln = 1e9;
  g.player.x = rad.x + 600; g.player.y = rad.y;
  const kills = g.stats.kills;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6;
    const e = spawnEnemyAt(g, "blechknecht", rad.x + Math.cos(a) * GEAR_REACH * 0.6, rad.y + Math.sin(a) * GEAR_REACH * 0.6);
    e.speed = 0;
  }
  for (let t = 0; t < 7; t += TICK) step(g);
  assert.ok(g.stats.kills - kills >= 4, `${g.stats.kills - kills} Futter zermahlen`);
});
