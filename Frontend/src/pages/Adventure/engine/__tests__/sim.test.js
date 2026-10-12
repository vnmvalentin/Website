// Headless-Tests für adVentures: komplette Läufe mit dem Bot (engine/bot.js), Spielstand speichern/laden, gleiche Welt
// aus gleichem Seed, und dass die Freischalt-Tabelle des Backends nur existierende Items/Kits nennt.
// Ausführen: npm run test:adventure (im Frontend-Ordner)

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createGame, stepGame, snapshotGame, TICK } from "../game.js";
import { botInput, botChoose } from "../bot.js";
import { generateWorld } from "../worldgen.js";
import { KITS, KIT_ORDER } from "../../data/kits.js";
import { ITEMS } from "../../data/items.js";
import { EQUIPMENT } from "../../data/equipment.js";
import { BIOMES } from "../../data/biomes.js";
import { BOSSES } from "../../data/bosses.js";
import { WEAPON_IDS, TALENT_IDS, EVOLUTION_IDS } from "../../data/weapons.js";
import { ENEMIES, ELITE_AFFIX_IDS } from "../../data/enemies.js";
import { killEnemy } from "../combat.js";
import { priceOf } from "../interact.js";
import { SKINS } from "../../data/skins.js";
import { PIXEL_ICONS, PALETTE } from "../../ui/pixelIcons.js";
import { grantXp } from "../loot.js";
import { chooseUpgrade, rerollOffer } from "../levelup.js";
import { spawnEnemy } from "../enemies.js";
import { spawnBoss } from "../bosses/index.js";
import { spawnPlayerBullet, updateProjectiles } from "../projectiles.js";

const require = createRequire(import.meta.url);
const progression = require("../../../../../../Backend/adventure/progression.js");
const meta = require("../../../../../../Backend/adventure/meta.js");

function play(g, seconds) {
  const steps = Math.round(seconds / TICK);
  for (let i = 0; i < steps && !g.over; i++) {
    botChoose(g);
    stepGame(g, TICK, botInput(g));
    g.events.length = 0;
    const p = g.player;
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.hp), `Spielerwerte kaputt bei t=${g.time}`);
    for (const e of g.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y) && !Number.isNaN(e.hp), `Gegner ${e.type} kaputt bei t=${g.time}`);
  }
}

for (const kitId of KIT_ORDER) {
  test(`Kit ${kitId}: 8 Minuten Lauf ohne Fehler, macht Fortschritt`, () => {
    const g = createGame({ kitId, seed: 1234 });
    play(g, 480);
    assert.ok(g.stats.kills > 50, `zu wenige Kills: ${g.stats.kills}`);
    assert.ok(g.stagesCleared >= 1 || g.over, "keine Welt geschafft");
  });
}

test("Gleicher Seed → gleiche Welt; anderer Seed → andere Welt", () => {
  const a = generateWorld(77, 2, 0, BIOMES[2]);
  const b = generateWorld(77, 2, 0, BIOMES[2]);
  const c = generateWorld(78, 2, 0, BIOMES[2]);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.obstacles, c.obstacles);
  assert.ok(a.interactables.length >= 25, "zu wenige Kisten/Schreine");
});

test("Spielstand: snapshot → createGame stellt Items, Stufe, Gold und Welt wieder her", () => {
  const g = createGame({ kitId: "ninja", seed: 99 });
  play(g, 200);
  const snap = JSON.parse(JSON.stringify(snapshotGame(g)));
  const h = createGame({ kitId: "default", seed: 1, snapshot: snap });
  assert.equal(h.kitId, "ninja");
  assert.equal(h.seed, 99);
  assert.equal(h.stageIndex, g.stageIndex);
  assert.equal(h.player.level, g.player.level);
  assert.deepEqual(h.player.items, g.player.items);
  assert.equal(h.player.gold, Math.floor(g.player.gold));
  assert.ok(JSON.stringify(snap).length < 24000, "Spielstand größer als das Server-Limit");
});

test("Daten passen zusammen: Freischaltungen, Boss-Items, Welten-Bosse", () => {
  for (const u of progression.UNLOCK_TRACK) {
    if (u.kind === "kit") assert.ok(KITS[u.id], `Kit ${u.id} fehlt`);
    if (u.kind === "items") for (const id of u.ids) assert.ok(ITEMS[id] || EQUIPMENT[id], `Item ${id} fehlt`);
  }
  assert.deepEqual([...progression.KIT_IDS].sort(), [...KIT_ORDER].sort());
  for (const b of Object.values(BOSSES)) assert.equal(ITEMS[b.item]?.rarity, "boss", `Boss-Item ${b.item}`);
  for (const biome of BIOMES) for (const id of biome.bosses) assert.ok(BOSSES[id], `Boss ${id}`);
});

test("Stufenaufstieg: Spiel steht während der Wahl, erste Wahl nur Waffen, Wahl wirkt und übersteht den Spielstand", () => {
  const g = createGame({ kitId: "default", seed: 5 });
  grantXp(g, 10000);
  assert.ok(g.player.pendingLevels >= 3, "mehrere Stufen offen");
  stepGame(g, TICK, botInput(g));
  assert.ok(g.levelUp, "Wahl ist offen");
  assert.ok(g.levelUp.choices.every((c) => c.kind === "weapon" && c.level === 1), "erste Wahl bietet nur neue Waffen");
  const t = g.time;
  stepGame(g, TICK, botInput(g));
  assert.equal(g.time, t, "Spielzeit läuft während der Wahl nicht weiter");
  const first = g.levelUp.choices[0];
  assert.ok(chooseUpgrade(g, 0));
  assert.equal(g.player.weapons[first.id], 1);
  assert.equal(g.levelUp, null);
  stepGame(g, TICK, botInput(g));
  assert.ok(g.levelUp, "nächste offene Stufe öffnet die nächste Wahl");
  // Neu würfeln kostet Gold
  g.player.gold = 0;
  assert.equal(rerollOffer(g), false);
  g.player.gold = 99999;
  assert.ok(rerollOffer(g));
  while (g.levelUp) { chooseUpgrade(g, 0); stepGame(g, TICK, botInput(g)); }
  const snap = JSON.parse(JSON.stringify(snapshotGame(g)));
  const h = createGame({ kitId: "default", seed: 1, snapshot: snap });
  assert.deepEqual(h.player.weapons, g.player.weapons);
  assert.deepEqual(h.player.talents, g.player.talents);
  assert.deepEqual(h.player.weaponOrder, g.player.weaponOrder);
});

for (const id of WEAPON_IDS) {
  test(`Waffe ${id} trifft Gegner von selbst`, () => {
    const g = createGame({ kitId: "default", seed: 3 });
    const p = g.player;
    p.weapons[id] = 5; p.weaponOrder.push(id);
    g.enemies = [];
    const e = spawnEnemy(g, "orc", p.x + 90, p.y, {});
    e.hp = e.maxHp = 1e9;
    e.speed = 0;
    const before = g.stats.damageDealt;
    for (let i = 0; i < 6 / TICK; i++) { stepGame(g, TICK, { held: {}, pressed: {}, aimX: p.x - 300, aimY: p.y }); g.events.length = 0; }
    assert.ok(g.stats.damageDealt > before, `${id} hat keinen Schaden gemacht`);
  });
}

const idle = (g) => ({ held: {}, pressed: {}, aimX: g.player.x - 300, aimY: g.player.y });

test("Evolution: ausgebaute Waffe + Talent → Angebot; Wahl ersetzt die Waffe am selben Platz", () => {
  const g = createGame({ kitId: "default", seed: 8 });
  const p = g.player;
  Object.assign(p.weapons, { feuerkugeln: 2, dolche: 5 }); p.weaponOrder.push("feuerkugeln", "dolche");
  p.talents.praezision = 1; p.talentOrder.push("praezision");
  let found = false;
  for (let i = 0; i < 40 && !found; i++) {
    p.pendingLevels = 1;
    stepGame(g, TICK, idle(g));
    const idx = g.levelUp.choices.findIndex((c) => c.kind === "evolution");
    if (idx >= 0) { found = true; chooseUpgrade(g, idx); } else chooseUpgrade(g, 0);
    if (p.weapons.feuerkugeln > 4) { p.weapons.feuerkugeln = 2; }
  }
  assert.ok(found, "Evolution wurde nie angeboten");
  assert.equal(p.weapons.dolche, undefined);
  assert.equal(p.weapons.tausendklingen, 1);
  assert.equal(p.weaponOrder.indexOf("tausendklingen"), 1, "Platz bleibt gleich");
  // die Grundwaffe darf danach nicht wieder als neue Waffe kommen
  for (let i = 0; i < 30; i++) { p.pendingLevels = 1; stepGame(g, TICK, idle(g)); assert.ok(!g.levelUp.choices.some((c) => c.id === "dolche")); chooseUpgrade(g, 0); }
});

for (const id of EVOLUTION_IDS) {
  test(`Evolution ${id} trifft Gegner von selbst`, () => {
    const g = createGame({ kitId: "default", seed: 3 });
    const p = g.player;
    p.weapons[id] = 1; p.weaponOrder.push(id);
    g.enemies = [];
    // 140 px: liegt auch auf der Bahn der weiten Kreiswaffen (Sonnenkranz 150, Kriegsrad 170)
    const e = spawnEnemy(g, "orc", p.x + 140, p.y, {});
    e.hp = e.maxHp = 1e9;
    e.speed = 0;
    const before = g.stats.damageDealt;
    for (let i = 0; i < 6 / TICK; i++) { stepGame(g, TICK, idle(g)); g.events.length = 0; }
    assert.ok(g.stats.damageDealt > before, `${id} hat keinen Schaden gemacht`);
  });
}

test("Elite-Eigenschaften: jede läuft 20 s ohne Fehler, Teilend zerfällt, Hastig ist schneller", () => {
  for (const a of ELITE_AFFIX_IDS) {
    const g = createGame({ kitId: "knight", seed: 21 });
    const p = g.player;
    p.hp = p.stats.maxHp = 1e9;
    g.enemies = [];
    const e = spawnEnemy(g, "goblin", p.x + 200, p.y, { elite: a });
    if (a === "hastig") assert.ok(e.speed > ENEMIES.goblin.speed * 1.5);
    for (let i = 0; i < 20 / TICK; i++) { stepGame(g, TICK, botInput(g)); botChoose(g); g.events.length = 0; }
    assert.ok(Number.isFinite(p.hp));
  }
  const g = createGame({ kitId: "default", seed: 4 });
  g.enemies = [];
  const e = spawnEnemy(g, "goblin", g.player.x + 400, g.player.y, { elite: "teilend" });
  killEnemy(g, e);
  assert.equal(g.enemies.filter((o) => !o.dead && o.type === "goblin").length, 2);
});

test("Schreine: Schicksal öffnet eine Item-Wahl, Würfel tauscht hoch, Opfer kostet Leben, Fluch stärkt Gegner", () => {
  const g = createGame({ kitId: "default", seed: 12 });
  const p = g.player;
  p.gold = 1e6;
  const use = (type) => {
    const o = g.interactables.find((x) => x.type === type);
    assert.ok(o, `${type} fehlt in der Welt`);
    p.x = o.x; p.y = o.y + 20;
    stepGame(g, TICK, { ...idle(g), pressed: { interact: true } });
    return o;
  };
  use("fateShrine");
  assert.ok(g.levelUp?.shrine && g.levelUp.choices.every((c) => c.kind === "item"));
  const levels = p.pendingLevels;
  const pick = g.levelUp.choices[0].id;
  chooseUpgrade(g, 0);
  assert.ok(p.items[pick] >= 1);
  assert.equal(p.pendingLevels, levels, "Schrein-Wahl verbraucht keine Stufe");

  p.items = { schleifstein: 1 }; p.itemOrder = ["schleifstein"];
  const before = g.pickups.length;
  use("diceShrine");
  assert.equal(p.items.schleifstein, undefined);
  const drop = g.pickups.slice(before).find((k) => k.type === "item");
  assert.equal(ITEMS[drop.id].rarity, "uncommon");

  p.hp = p.stats.maxHp;
  use("sacrificeAltar");
  assert.ok(p.hp < p.stats.maxHp * 0.85);

  use("curseShrine");
  assert.ok(g.curse);
  const cursed = spawnEnemy(g, "goblin", p.x + 500, p.y, {});
  g.curse = false;
  const normal = spawnEnemy(g, "goblin", p.x + 500, p.y, {});
  assert.ok(cursed.maxHp > normal.maxHp);
});

test("Horde: Blutmond, Einkreisung und Champion kommen innerhalb von 5 Minuten", () => {
  const g = createGame({ kitId: "knight", seed: 30 });
  const p = g.player;
  const seen = new Set();
  for (let i = 0; i < 300 / TICK; i++) {
    p.hp = p.stats.maxHp;
    botChoose(g);
    stepGame(g, TICK, { held: {}, pressed: {}, aimX: p.x + 100, aimY: p.y });
    for (const ev of g.events) if (ev.type === "hordeEvent") seen.add(ev.kind);
    g.events.length = 0;
  }
  assert.deepEqual([...seen].sort(), ["blood", "champion", "ring"]);
});

for (const bossId of ["fallenKnight", "pharaoh", "lavaWurm"]) {
  test(`Neuer Boss ${bossId}: 60 s Kampf ohne Fehler, nutzt mehrere Angriffe, ist besiegbar`, () => {
    const g = createGame({ kitId: "knight", seed: 50 });
    const p = g.player;
    g.enemies = [];
    const b = spawnBoss(g, bossId, p.x + 300, p.y);
    const seen = new Set();
    for (let i = 0; i < 60 / TICK; i++) {
      p.hp = p.stats.maxHp;
      stepGame(g, TICK, idle(g));
      botChoose(g);
      if (b.state !== "idle" && b.state !== "intro") seen.add(b.state);
      if (bossId === "lavaWurm" && b.hidden) assert.ok(b.invuln, "abgetaucht muss unverwundbar sein");
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), "Boss-Position kaputt");
      g.events.length = 0;
    }
    assert.ok(seen.size >= 3, `nur ${[...seen].join(", ")} gesehen`);
    b.invuln = false; b.hidden = false;
    killEnemy(g, b);
    assert.ok(g.pickups.some((k) => k.type === "item" && k.id === BOSSES[bossId].item), "Boss-Item fehlt");
  });
}

test("Neue Gegner: alle laufen 20 s ohne Fehler; Schildträger blockt von vorn, Sandwurm ist unter der Erde unverwundbar", () => {
  for (const id of ["zombie", "shieldbearer", "bat", "sandworm", "bear", "kobold"]) {
    const g = createGame({ kitId: "default", seed: 61 });
    const p = g.player;
    p.hp = p.stats.maxHp = 1e9;
    g.enemies = [];
    spawnEnemy(g, id, p.x + 300, p.y, {});
    for (let i = 0; i < 20 / TICK; i++) { stepGame(g, TICK, botInput(g)); botChoose(g); g.events.length = 0; }
    for (const e of g.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), `${id} Position kaputt`);
  }
  // Schild: Schuss von vorn wird geblockt, von hinten trifft er
  const g = createGame({ kitId: "default", seed: 62 });
  g.enemies = [];
  const s = spawnEnemy(g, "shieldbearer", 600, 600, {});
  s.shieldA = Math.PI; // schaut nach links
  const hp0 = s.hp;
  g.pBullets = [];
  spawnPlayerBullet(g, { x: 560, y: 600, angle: 0, speed: 600, dmg: 10, range: 200 });
  for (let i = 0; i < 20; i++) updateProjectiles(g, TICK);
  assert.equal(s.hp, hp0, "Schuss von vorn hat getroffen");
  spawnPlayerBullet(g, { x: 640, y: 600, angle: Math.PI, speed: 600, dmg: 10, range: 200 });
  for (let i = 0; i < 20; i++) updateProjectiles(g, TICK);
  assert.ok(s.hp < hp0, "Schuss von hinten wurde geblockt");
});

test("Jedes Item, jede Waffe und jedes Talent hat ein Pixelsymbol (12 × 12, nur bekannte Farben)", () => {
  for (const id of [...Object.keys(ITEMS), ...WEAPON_IDS, ...TALENT_IDS]) {
    const rows = PIXEL_ICONS[id];
    assert.ok(rows, `Symbol ${id} fehlt`);
    assert.equal(rows.length, 12, id);
    for (const r of rows) {
      assert.equal(r.length, 12, id);
      for (const ch of r) assert.ok(ch === "." || PALETTE[ch], `${id}: unbekannte Farbe ${ch}`);
    }
  }
});

test("Albtraum+: Stufen wirken (Gegnerleben, Preise, Regeneration) und überstehen den Spielstand", () => {
  const base = createGame({ kitId: "default", seed: 40, difficulty: "hard" });
  const asc = createGame({ kitId: "default", seed: 40, difficulty: "hard", ascension: 5 });
  const a = spawnEnemy(base, "goblin", 500, 500, {});
  const b = spawnEnemy(asc, "goblin", 500, 500, {});
  assert.ok(b.maxHp > a.maxHp * 1.15);
  const chest = (g) => g.interactables.find((o) => o.type === "chest");
  assert.ok(priceOf(asc, chest(asc)) > priceOf(base, chest(base)));
  const snap = JSON.parse(JSON.stringify(snapshotGame(asc)));
  assert.equal(createGame({ kitId: "x", seed: 1, snapshot: snap }).ascension, 5);
});

test("Meta (Backend): Erfolge eindeutig, je Kit drei Farbvarianten wie im Frontend, Tagesseed stabil", () => {
  const ids = meta.ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...meta.SKIN_IDS].sort(), Object.keys(SKINS).sort());
  for (const kit of KIT_ORDER) assert.equal(meta.ACHIEVEMENTS.filter((a) => a.kit === kit).length, 3);
  assert.equal(meta.dailySeed("2026-10-04"), meta.dailySeed("2026-10-04"));
  assert.notEqual(meta.dailySeed("2026-10-04"), meta.dailySeed("2026-10-05"));
  assert.equal(meta.weekKey(new Date("2026-01-01T12:00:00Z")), "2026-W01");
  assert.equal(meta.ASCENSIONS.length, 5);
  const got = meta.newAchievements([], { won: true, difficulty: "hard", kitId: "ninja", stagesCleared: 5, bossesKilled: 6, kills: 900, timeSec: 1500, mode: "normal", ascension: 0 }, { evolutions: 0, champions: 0, loop: 0, itemCount: 50 });
  assert.ok(got.some((a) => a.id === "gold_ninja") && got.some((a) => a.id === "siegAlbtraum"));
});

test("Account-Fortschritt: XP-Kurve und Freischaltungen", () => {
  assert.equal(progression.levelInfo(0).level, 1);
  assert.equal(progression.levelInfo(progression.xpForLevel(1)).level, 2);
  const lv1 = progression.unlocksFor(1, []);
  assert.deepEqual(lv1.kits, ["default"]);
  assert.ok(!lv1.difficulties.includes("hard"));
  // gekaufte Skins zählen als freie Kits
  assert.ok(progression.unlocksFor(1, ["cyber"]).kits.includes("cyber"));
  assert.equal(progression.unlocksFor(20, []).lockedItems.length, 0);
});
