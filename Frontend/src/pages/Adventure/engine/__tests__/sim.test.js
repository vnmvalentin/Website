// Headless-Tests für adVentures: komplette Läufe mit dem Bot (engine/bot.js), Spielstand speichern/laden, gleiche Welt
// aus gleichem Seed, und dass die Freischalt-Tabelle des Backends nur existierende Items/Kits nennt.
// Ausführen: npm test -- Adventure (im Frontend-Ordner)

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
import { WEAPONS, WEAPON_IDS, TALENTS, TALENT_IDS, EVOLUTION_IDS, MAX_WEAPONS, MAX_TALENTS, BOON_IDS } from "../../data/weapons.js";
import { ENEMIES, ELITE_AFFIX_IDS } from "../../data/enemies.js";
import { killEnemy, damageEnemy, enemiesNear, nearestEnemy } from "../combat.js";
import { hordeTarget } from "../director.js";
import { makeRng } from "../util.js";
import { CREATURES } from "../../render/flat/creatures.js";
import { priceOf } from "../interact.js";
import { SKINS } from "../../data/skins.js";
import { PIXEL_ICONS, PALETTE } from "../../ui/pixelIcons.js";
import { grantXp, dropXp, XP_MAX, XP_WAIT } from "../loot.js";
import { chooseUpgrade, rerollOffer, openLevelUp } from "../levelup.js";
import { spawnEnemy, CONTACT_GATE } from "../enemies.js";
import { stageMult } from "../difficulty.js";
import { activateTeleporter, leaveStage, loadStage } from "../stage.js";
import { recalcStats } from "../stats.js";
import { CURVE_STEP, summarizeTimeline } from "../timeline.js";
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

test("Raumgitter: findet dieselben Gegner wie die Suche über alle, auch Bosse und nach Bewegung", () => {
  const g = createGame({ kitId: "default", seed: 71 });
  const p = g.player;
  g.enemies = [];
  const rng = makeRng(5);
  for (let i = 0; i < 400; i++) spawnEnemy(g, rng.pick(["goblin", "orc", "bat", "zombie"]), rng.range(50, g.world.w - 50), rng.range(50, g.world.h - 50), {});
  spawnBoss(g, "fallenKnight", p.x + 200, p.y + 100);
  spawnEnemy(g, "orc", p.x - 300, p.y, { giant: true });
  const brute = (x, y, r) => g.enemies.filter((e) => !e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 < (r + e.r) ** 2);
  const same = (a, b, msg) => assert.deepEqual(a.map((e) => e.uid).sort((x, y) => x - y), b.map((e) => e.uid).sort((x, y) => x - y), msg);
  const probe = (label) => {
    for (let i = 0; i < 60; i++) {
      const x = rng.range(-100, g.world.w + 100), y = rng.range(-100, g.world.h + 100), r = rng.pick([0, 20, 90, 300, 900]);
      same(enemiesNear(g, x, y, r), brute(x, y, r), `${label}: Kreis ${Math.round(x)}/${Math.round(y)} r=${r}`);
      const near = nearestEnemy(g, x, y, 700);
      let best = null, bd = 700 * 700;
      for (const e of g.enemies) { const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (!e.dead && !e.invuln && d < bd) { bd = d; best = e; } }
      assert.equal(near?.uid, best?.uid, `${label}: nächster Gegner`);
    }
  };
  probe("frisch");
  // Tote werden übersprungen, neue sofort gefunden, und nach einem Tick stimmen die Zellen wieder
  for (let i = 0; i < 80; i++) g.enemies[i * 3].dead = true;
  spawnEnemy(g, "goblin", 1000, 1000, {});
  probe("nach Tod und Nachschub");
  p.buffs.invuln = 99;
  for (let i = 0; i < 90; i++) stepGame(g, TICK, idle(g));
  probe("nach Bewegung");
});

test("Horde-Kern: jede Art hat Stufe und Figur, jede Welt Futter; Futter fällt mit einem Schuss; Koloss steht fest", () => {
  for (const [id, def] of Object.entries(ENEMIES)) {
    assert.ok(["futter", "kaempfer", "brocken", "spezial", undefined].includes(def.tier), `${id}: unbekannte Stufe ${def.tier}`);
    assert.ok(CREATURES[def.fig || id], `${id}: Figur fehlt`);
  }
  for (const b of BIOMES) {
    if (b.final) continue;
    assert.ok(b.enemies.some(([id]) => ENEMIES[id].tier === "futter"), `${b.id}: kein Futter`);
    assert.ok(b.enemies.some(([id]) => ENEMIES[id].tier === "brocken" && ["brute", "charger"].includes(ENEMIES[id].ai)), `${b.id}: kein Koloss möglich`);
  }
  const g = createGame({ kitId: "default", seed: 72 });
  const p = g.player;
  g.enemies = [];
  for (const [id, def] of Object.entries(ENEMIES)) {
    if (def.tier !== "futter") continue;
    const e = spawnEnemy(g, id, p.x + 400, p.y, {});
    assert.ok(e.hp <= p.stats.damage, `${id}: ${e.hp} Leben übersteht einen Schuss (${p.stats.damage})`);
  }
  const giant = spawnEnemy(g, "orc", p.x + 300, p.y, { giant: true });
  const normal = spawnEnemy(g, "orc", p.x - 300, p.y, {});
  assert.ok(giant.maxHp > normal.maxHp * 5 && giant.r > normal.r * 1.4);
  damageEnemy(g, giant, 1, { knockback: 500 });
  damageEnemy(g, normal, 1, { knockback: 500 });
  assert.equal(giant.kbx, 0, "Koloss wird weggestoßen");
  assert.notEqual(normal.kbx, 0);
});

test("Horde-Kern: der Nachschub wächst mit der Zeit zur Horde, und im Gedränge trifft nicht jeder Gegner zugleich", () => {
  const g = createGame({ kitId: "knight", seed: 73 });
  const p = g.player;
  const still = { held: {}, pressed: {}, aimX: p.x + 100, aimY: p.y };
  const alive = () => g.enemies.filter((e) => !e.dead && e.aggro).length;
  let early = 0, hits = 0, last = 0;
  for (let i = 0; i < 150 / TICK; i++) {
    p.hp = p.stats.maxHp = 1e9; // steht nur da und lässt sich einkreisen
    stepGame(g, TICK, still);
    if (g.levelUp) g.player.pendingLevels = 0, g.levelUp = null;
    g.events.length = 0;
    if (i === Math.round(20 / TICK)) early = alive();
    if (g.stats.damageTaken > last) { hits++; last = g.stats.damageTaken; }
  }
  assert.ok(early >= 15, `nach 20 s nur ${early} Gegner`);
  assert.ok(alive() >= 80, `nach 150 s nur ${alive()} Gegner`);
  assert.ok(alive() <= hordeTarget(g) * 2.2 + 150, `mehr Gegner als die Zielmenge erlaubt: ${alive()}`);
  // 150 s mitten in der Horde: ohne Sperre wären das tausende Treffer
  assert.ok(hits > 50 && hits <= 150 / CONTACT_GATE + 80, `${hits} Treffer`);
});

test("Erfahrungskristalle: ein Kill lässt einen fallen, gezählt wird beim Einsammeln, nichts geht verloren", () => {
  const g = createGame({ kitId: "default", seed: 81 });
  const p = g.player;
  const xpOnGround = () => g.pickups.filter((k) => k.type === "xp");
  g.enemies = []; g.pickups = [];
  g.teleporter.state = "ready"; // kein Nachschub
  const xp0 = p.xp;
  killEnemy(g, spawnEnemy(g, "orc", p.x + 900, p.y, {}));
  assert.equal(xpOnGround().length, 1, "kein Kristall");
  assert.equal(p.xp, xp0, "Erfahrung schon vor dem Einsammeln gutgeschrieben");
  // weit weg: bleibt erst liegen, kommt nach XP_WAIT Sekunden von selbst
  for (let i = 0; i < 2 / TICK; i++) stepGame(g, TICK, idle(g));
  assert.equal(xpOnGround().length, 1, "Kristall kam zu früh");
  for (let i = 0; i < (XP_WAIT + 3) / TICK; i++) stepGame(g, TICK, idle(g));
  assert.equal(xpOnGround().length, 0, "Kristall kam nicht an");
  assert.ok(p.xp > xp0);
  // Deckel: mehr als XP_MAX liegen nie herum, der Wert bleibt aber vollständig
  for (let i = 0; i < XP_MAX + 80; i++) dropXp(g, p.x + 2000, p.y, 1);
  assert.ok(xpOnGround().length <= XP_MAX, `${xpOnGround().length} Kristalle`);
  assert.ok(Math.abs(xpOnGround().reduce((n, k) => n + k.value, 0) - (XP_MAX + 80)) < 1e-6, "Erfahrung ging beim Zusammenlegen verloren");
});

test("Kill-Serie: wächst mit jedem Kill, meldet 25 und zieht die Kristalle an, endet nach einer Pause", () => {
  const g = createGame({ kitId: "default", seed: 82 });
  const p = g.player;
  g.enemies = []; g.pickups = []; g.events.length = 0;
  g.teleporter.state = "ready";
  for (let i = 0; i < 25; i++) killEnemy(g, spawnEnemy(g, "goblin", p.x + 1200, p.y, {}));
  assert.equal(g.streak.n, 25);
  assert.ok(g.events.some((ev) => ev.type === "streak" && ev.n === 25), "keine Meldung bei 25");
  assert.ok(g.pickups.filter((k) => k.type === "xp" && k.pull).length >= 24, "Sog hat die Kristalle nicht erfasst");
  for (let i = 0; i < 3 / TICK; i++) stepGame(g, TICK, idle(g));
  assert.equal(g.streak.n, 0, "Serie endet nicht");
  assert.equal(g.stats.bestStreak, 25);
});

test("Todesarten: gefroren zersplittert, brennend verkohlt, Stoß schleudert weg, Blitz funkt — mit laufender Nummer", () => {
  const g = createGame({ kitId: "default", seed: 83 });
  const p = g.player;
  g.enemies = [];
  const kill = (prep, opts = {}) => { const e = spawnEnemy(g, "orc", p.x + 300, p.y, {}); prep(e); damageEnemy(g, e, 1e9, opts); return g.fx.deaths[g.fx.deaths.length - 1]; };
  assert.equal(kill((e) => { e.freezeT = 1; }).kind, "shatter");
  assert.equal(kill((e) => { e.burnT = 2; }).kind, "burn");
  assert.equal(kill(() => {}, { knockback: 500 }).kind, "blast");
  assert.equal(kill(() => {}, { kind: "shock" }).kind, "shock");
  const last = kill(() => {});
  assert.equal(last.kind, "hit");
  assert.ok(last.dirX > 0.9, "Richtung zeigt nicht vom Spieler weg");
  assert.deepEqual(g.fx.deaths.map((d) => d.seq), [1, 2, 3, 4, 5]);
});

test("Waffen für die Horde: sechs Plätze, Stufe 8, Evolution übernimmt Stufen, Kills laden die Spezialfähigkeit, Rückstoß reißt mit", () => {
  assert.equal(MAX_WEAPONS, 6);
  for (const id of WEAPON_IDS) assert.equal(WEAPONS[id].levels.length, 8, id);
  for (const id of EVOLUTION_IDS) assert.equal(WEAPONS[id].levels.length, 4, id);

  // Evolution aus Stufe 7 → Evolution Stufe 3 (nichts geht verloren)
  const g = createGame({ kitId: "default", seed: 91 });
  const p = g.player;
  p.weapons.dolche = 7; p.weaponOrder.push("dolche");
  p.talents.praezision = 1; p.talentOrder.push("praezision");
  let evo = null;
  for (let i = 0; i < 40 && !evo; i++) {
    p.pendingLevels = 1;
    stepGame(g, TICK, idle(g));
    const idx = g.levelUp.choices.findIndex((c) => c.kind === "evolution");
    if (idx >= 0) { evo = g.levelUp.choices[idx]; chooseUpgrade(g, idx); } else { g.levelUp = null; p.pendingLevels = 0; }
  }
  assert.equal(evo?.level, 3, "Evolution wurde nicht mit Stufe 3 angeboten");
  assert.equal(p.weapons.tausendklingen, 3);

  // Jeder Kill schenkt der Spezialfähigkeit ein Stück Abklingzeit
  p.weapons = {}; p.weaponOrder = [];
  g.enemies = []; g.teleporter.state = "ready";
  const cd = p.cds.special;
  cd.charges = 0; cd.t = 0;
  killEnemy(g, spawnEnemy(g, "goblin", p.x + 900, p.y, {}));
  assert.ok(cd.t > 0.1, "Kill hat die Spezialfähigkeit nicht geladen");

  // Wer weggeschleudert wird, reißt den Nachbarn mit
  const a = spawnEnemy(g, "goblin", p.x + 500, p.y, {}), b = spawnEnemy(g, "goblin", p.x + 520, p.y, {});
  a.speed = b.speed = 0;
  a.kbx = 600;
  stepGame(g, TICK, idle(g));
  assert.ok(b.kbx > 50, `Nachbar wurde nicht mitgerissen (${b.kbx})`);
});

test("Ablauf: Welt ohne Lager, hinten wird es steiler, Ansturm nach dem Boss, Segen nach vollem Ausbau", () => {
  // Keine herumstehenden Lager mehr — die Horde kommt von selbst
  for (let i = 0; i < 5; i++) assert.equal(generateWorld(41, i, 0, BIOMES[i]).camps.length, 0, BIOMES[i].id);

  // Schwierigkeit pro Welt: Welt 2 wie gehabt, danach wächst jeder Schritt (auch über die Tabelle hinaus)
  assert.equal(stageMult(0), 1);
  assert.ok(stageMult(1) <= 1.3, `Welt 2 zu hart: ${stageMult(1)}`);
  for (let s = 1; s <= 9; s++) assert.ok(stageMult(s) / stageMult(s - 1) >= 1.2, `Welt ${s + 1} wächst zu wenig`);
  assert.ok(stageMult(5) >= 3.6, `Finale zu weich: ${stageMult(5)}`);

  // Boss fällt, bevor der Teleporter voll ist → Ansturm statt Leerlauf; die Welt endet erst mit voller Ladung
  const g = createGame({ kitId: "knight", seed: 52 });
  activateTeleporter(g);
  assert.ok(g.boss, "kein Boss am Teleporter");
  g.events.length = 0;
  killEnemy(g, g.boss);
  assert.ok(g.events.some((e) => e.type === "hordeEvent" && e.kind === "rush"), "kein Ansturm gemeldet");
  assert.equal(g.teleporter.state, "charging");

  // Alles ausgebaut: sechs Evolutionen und vier Talente auf Höchststufe → die Wahl besteht aus Segen
  const p = g.player;
  p.weapons = {}; p.weaponState = {};
  p.weaponOrder = EVOLUTION_IDS.slice(0, MAX_WEAPONS);
  for (const id of p.weaponOrder) { p.weapons[id] = WEAPONS[id].levels.length; p.weaponState[id] = { t: 0 }; }
  p.talents = {};
  p.talentOrder = TALENT_IDS.slice(0, MAX_TALENTS);
  for (const id of p.talentOrder) p.talents[id] = TALENTS[id].max;
  recalcStats(p, g.kit);
  const before = { damage: p.stats.damage, maxHp: p.stats.maxHp };
  for (let round = 1; round <= 2; round++) {
    p.pendingLevels = 1;
    openLevelUp(g);
    assert.equal(g.levelUp.choices.length, 3);
    assert.ok(g.levelUp.choices.every((c) => c.kind === "boon" && BOON_IDS.includes(c.id)), JSON.stringify(g.levelUp.choices));
    const i = g.levelUp.choices.findIndex((c) => c.id === "kraft");
    assert.equal(g.levelUp.choices[i].level, round);
    assert.ok(chooseUpgrade(g, i));
  }
  assert.equal(p.boons.kraft, 2);
  assert.ok(Math.abs(p.stats.damage / before.damage - 1.08) < 0.03, `Schaden ${before.damage} → ${p.stats.damage}`);
  assert.equal(p.stats.maxHp, before.maxHp);
  // Segen überstehen den Spielstand
  assert.equal(createGame({ snapshot: JSON.parse(JSON.stringify(snapshotGame(g))) }).player.boons.kraft, 2);
});

test("Horde: Blutmond, Einkreisung, Champion und Koloss kommen innerhalb von 5 Minuten", () => {
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
  assert.deepEqual([...seen].sort(), ["blood", "champion", "giant", "ring"]);
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

test("Auswertung: Kill-Verlauf zählt jeden Kill, übersteht den Spielstand und wird je Welt zusammengefasst", () => {
  const g = createGame({ kitId: "knight", seed: 64 });
  assert.deepEqual(g.stats.marks, [[0, 0, 0, 0]]);
  play(g, 70);
  assert.ok(g.stats.kills > 20, `nur ${g.stats.kills} Kills`);
  assert.equal(g.stats.curve.reduce((a, b) => a + b, 0), g.stats.kills);
  assert.ok(g.stats.curve.length <= Math.ceil(g.time / CURVE_STEP));

  // Fortsetzen: die Kurve geht weiter, die Welt wird nicht doppelt vermerkt
  const snap = JSON.parse(JSON.stringify(snapshotGame(g)));
  const h = createGame({ kitId: "knight", seed: 64, snapshot: snap });
  assert.deepEqual(h.stats.marks, [[0, 0, 0, 0]]);
  play(h, 20);
  assert.equal(h.stats.curve.reduce((a, b) => a + b, 0), h.stats.kills);

  // Nächste Welt: Marke mit Zeitpunkt und Kills bis dahin
  const killsBefore = h.stats.kills;
  h.teleporter.state = "ready";
  leaveStage(h);
  assert.deepEqual(h.stats.marks[1], [Math.round(h.time), 1, 0, killsBefore]);

  // Zusammenfassung aus festen Zahlen: vier Abschnitte, zwei Welten
  const s = summarizeTimeline({ kills: 100, curve: [10, 20, 30, 40], marks: [[0, 0, 0, 0], [30, 1, 0, 30]] }, 60);
  assert.deepEqual(s.points.map((p) => p.perMin), [40, 80, 120, 160]);
  assert.equal(s.peak.from, 45);
  assert.deepEqual(s.worlds.map((w) => [w.index, w.to - w.from, w.kills, w.perMin]), [[0, 30, 30, 60], [1, 30, 70, 140]]);
  // Angebrochener Rest: 4 s werden nicht hochgerechnet, 10 s schon
  assert.equal(summarizeTimeline({ kills: 5, curve: [1, 1, 3], marks: [[0, 0, 0, 0]] }, 34).points.length, 2);
  assert.equal(summarizeTimeline({ kills: 5, curve: [1, 1, 3], marks: [[0, 0, 0, 0]] }, 40).points[2].perMin, 18);
  // Keine Kurve, wenn der Lauf zu kurz war oder die Aufzeichnung nicht bei 0 beginnt (alter Spielstand)
  assert.equal(summarizeTimeline({ kills: 3, curve: [3], marks: [[0, 0, 0, 0]] }, 12), null);
  assert.equal(summarizeTimeline({ kills: 50, curve: [0, 0, 0, 50], marks: [[45, 1, 0, 0]] }, 90), null);
  assert.equal(summarizeTimeline({ kills: 0 }, 300), null);

  // Auch ein sehr langer Lauf bleibt unter dem Speicher-Limit des Servers
  for (let i = 0; i < 4000; i++) { h.time = i * CURVE_STEP; h.stats.kills += 900; for (let k = 0; k < 900; k++) h.stats.curve[Math.min(479, i)] = (h.stats.curve[Math.min(479, i)] || 0) + 1; }
  for (let i = 0; i < 60; i++) { h.stageIndex = i % 6; h.loop = Math.floor(i / 6); h.time = i * 300; loadStage(h); }
  assert.ok(h.stats.marks.length <= 40);
  assert.ok(JSON.stringify(snapshotGame(h)).length < 24000, `Spielstand ${JSON.stringify(snapshotGame(h)).length} Zeichen`);
});

test("Finale: kleine Wellen, solange Thunderwing lebt — gedeckelt, in Phase 2 mit Funkendrachen, nach dem Sieg Ruhe", () => {
  const g = createGame({ kitId: "default", seed: 7 });
  g.stageIndex = BIOMES.findIndex((b) => b.final);
  loadStage(g);
  assert.ok(g.biome.final, "kein Finale geladen");
  const seen = new Map(); // uid → Art aller Wellen-Gegner, die je aufgetaucht sind
  let maxAlive = 0;
  const run = (sec) => {
    for (let i = 0; i < sec / TICK; i++) {
      g.player.hp = g.player.stats.maxHp; // der Test prüft den Nachschub, nicht das Überleben
      stepGame(g, TICK, idle(g));
      g.events.length = 0;
      let alive = 0;
      for (const e of g.enemies) if (e.wave) { seen.set(e.uid, e.type); if (!e.dead) alive++; }
      maxAlive = Math.max(maxAlive, alive);
    }
  };
  run(20);
  assert.ok(g.boss && !g.boss.dead, "Thunderwing fehlt");
  assert.ok(seen.size >= 16, `zu wenig Wellen: ${seen.size}`);
  assert.ok([...seen.values()].every((t) => ENEMIES[t].tier === "futter"), "in Phase 1 nur Futter");
  g.boss.phase2 = true;
  run(20);
  assert.ok([...seen.values()].includes("firespirit"), "Phase 2 ohne Funkendrachen");
  assert.ok(maxAlive <= 45, `Deckel überschritten: ${maxAlive}`);
  g.boss.dead = true;
  g.boss = null;
  const before = seen.size;
  run(25);
  assert.equal(seen.size, before, "nach dem Boss kommen weiter Wellen");
});

test("Touch-Stick: input.move lenkt stufenlos in jede Richtung, ohne Stick gelten weiter die Tasten", () => {
  const g = createGame({ kitId: "default", seed: 91 });
  g.enemies = []; g.pickups = [];
  const p = g.player;
  const x0 = p.x, y0 = p.y;
  // schräg nach rechts unten im Verhältnis 3:1 — mit Tasten ginge nur 1:1
  const step = (input) => stepGame(g, TICK, { held: {}, pressed: {}, aimX: p.x + 100, aimY: p.y, ...input });
  for (let i = 0; i < 30; i++) step({ move: { x: 0.95, y: 0.32 } });
  const dx = p.x - x0, dy = p.y - y0;
  assert.ok(dx > 0 && dy > 0, `falsche Richtung ${dx}/${dy}`);
  assert.ok(Math.abs(Math.atan2(dy, dx) - Math.atan2(0.32, 0.95)) < 0.05, `Winkel ${Math.atan2(dy, dx)}`);
  const x1 = p.x;
  for (let i = 0; i < 30; i++) step({ held: { left: true }, move: null });
  assert.ok(p.x < x1, "Tasten wirken ohne Stick nicht mehr");
});
