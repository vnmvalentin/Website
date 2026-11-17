// Die Kits seit November 2026 (Mönch, Jägerin, Nekromantin, Alchemist): jede Fähigkeit tut, was die Beschreibung sagt.
// Ausführen: npm test -- Adventure (im Frontend-Ordner)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, stepGame, TICK } from "../game.js";
import { firePrimary, castAbility, ELEMENTS } from "../abilities.js";
import { spawnEnemy } from "../enemies.js";
import { RAISE_CAP } from "../allies.js";
import { attackSpeedNow } from "../stats.js";
import { chooseUpgrade } from "../levelup.js";
import { KITS } from "../../data/kits.js";

// Ohne Tasten, der Zeiger bleibt, wo er ist (sonst dreht sich der Held zum Punkt 0,0)
const idle = (g) => ({ held: {}, pressed: {}, aimX: g.player.aimX, aimY: g.player.aimY });
const step = (g, n = 1) => { for (let i = 0; i < n; i++) { stepGame(g, TICK, idle(g)); if (g.levelUp) chooseUpgrade(g, 0); } };

// Leere Welt ohne Nachschub, Spieler unverwundbar und nach rechts zielend
function arena(kitId) {
  const g = createGame({ kitId, seed: 5 });
  g.enemies = [];
  g.director.t = 1e9; g.director.giantT = 1e9;
  g.player.buffs.invuln = 1e9;
  const p = g.player;
  p.aim = 0; p.aimX = p.x + 300; p.aimY = p.y;
  return g;
}
// Ein Gegner, der stillsteht (viel Leben, damit er nicht sofort fällt)
function dummy(g, dx, dy, hp = 1e6, id = "orc") {
  const e = spawnEnemy(g, id, g.player.x + dx, g.player.y + dy, {});
  e.hp = e.maxHp = hp; e.speed = 0; e.spawnT = 1;
  return e;
}

test("Neue Kits sind vollständig: vier Fähigkeiten mit Name und Beschreibung", () => {
  for (const id of ["moench", "jaegerin", "nekromantin", "alchemist"]) {
    const kit = KITS[id];
    assert.ok(kit, id);
    for (const slot of ["primary", "secondary", "utility", "special"]) {
      assert.ok(kit.abilities[slot]?.id && kit.abilities[slot].name && kit.abilities[slot].desc, `${id}.${slot}`);
    }
  }
});

test("Mönch: Schlag trifft vor ihm, nicht hinter ihm; jeder dritte ist eine Druckwelle rundum", () => {
  const g = arena("moench");
  const front = dummy(g, 90, 0), back = dummy(g, -90, 0);
  firePrimary(g);
  assert.ok(front.hp < front.maxHp, "vorne getroffen");
  assert.equal(back.hp, back.maxHp, "hinten nicht");
  firePrimary(g);
  const before = back.hp;
  firePrimary(g); // dritter Schlag
  assert.ok(back.hp < before, "Druckwelle trifft auch hinten");
});

test("Mönch: Chi-Welle geht durch alle Gegner einer Reihe", () => {
  const g = arena("moench");
  const row = [120, 220, 320, 420].map((dx) => dummy(g, dx, 0));
  castAbility(g, "secondary");
  step(g, Math.round(1 / TICK));
  assert.ok(row.every((e) => e.hp < e.maxHp), "alle vier getroffen");
});

test("Jägerin: Fangeisen löst aus, wenn ein Gegner hineintritt — Schaden und festgefroren", () => {
  const g = arena("jaegerin");
  castAbility(g, "secondary");
  const trap = g.allies.find((a) => a.kind === "trap");
  assert.ok(trap, "Fangeisen liegt");
  const e = dummy(g, 0, 0, 1e6, "skeletonwarrior");
  e.x = trap.x; e.y = trap.y;
  step(g, 3);
  assert.ok(!g.allies.includes(trap) || trap.hp <= 0, "Fangeisen verbraucht");
  assert.ok(e.hp < e.maxHp, "Schaden");
  assert.ok(e.freezeT > 0, "festgefroren");
});

test("Jägerin: Salto legt ein Fangeisen und springt vom Zeiger weg; das Rudel jagt", () => {
  const g = arena("jaegerin");
  const x0 = g.player.x;
  castAbility(g, "utility");
  step(g, Math.round(0.4 / TICK));
  assert.ok(g.player.x < x0 - 150, "weg vom Zeiger (nach links)");
  assert.ok(g.allies.some((a) => a.kind === "trap"), "Fangeisen am Absprung");
  castAbility(g, "special");
  assert.equal(g.allies.filter((a) => a.kind === "wolf").length, 2, "zwei Wölfe");
  const e = dummy(g, 200, 0);
  step(g, Math.round(3 / TICK));
  assert.ok(e.hp < e.maxHp, "die Wölfe beißen");
});

test("Nekromantin: Getötete stehen als Skelette auf, höchstens RAISE_CAP", () => {
  const g = arena("nekromantin");
  g.kit = { ...g.kit, abilities: { ...g.kit.abilities, primary: { ...g.kit.abilities.primary, raise: 1 } } };
  for (let i = 0; i < RAISE_CAP + 6; i++) {
    const e = spawnEnemy(g, "goblin", g.player.x + 120, g.player.y, {});
    e.hp = 1; e.speed = 0; e.spawnT = 1;
    // die schon Aufgestandenen sollen den nächsten nicht selbst erschlagen
    for (const a of g.allies) { a.atkCd = 1e9; a.speed = 0; }
    g.player.aimX = e.x; g.player.aimY = e.y;
    firePrimary(g);
    step(g, Math.round(0.4 / TICK));
  }
  const n = g.allies.filter((a) => a.kind === "skeleton").length;
  assert.ok(n >= 3, `${n} Skelette aufgestanden`);
  assert.ok(n <= RAISE_CAP, `nicht mehr als ${RAISE_CAP}`);
});

test("Nekromantin: Heer der Toten ruft Skelette, die doppelt so hart zuschlagen", () => {
  const g = arena("nekromantin");
  castAbility(g, "special");
  assert.equal(g.allies.filter((a) => a.kind === "skeleton").length, KITS.nekromantin.abilities.special.shots);
  assert.ok(g.player.buffs.necroRage > 0, "Raserei der Skelette");
});

test("Alchemist: Flaschen wechseln die Elemente — Brand, Kälte, Gift", () => {
  const g = arena("alchemist");
  const seen = [];
  for (let i = 0; i < 3; i++) {
    const e = dummy(g, 250, 0);
    g.player.aimX = e.x; g.player.aimY = e.y;
    firePrimary(g);
    step(g, Math.round(0.8 / TICK));
    seen.push({ burn: e.burnT > 0, chill: e.slowPct > 0, poison: (e.poison?.length || 0) > 0 });
    e.dead = true; e.hp = 0;
  }
  assert.equal(ELEMENTS.length, 3);
  assert.ok(seen[0].burn, "erste Flasche brennt");
  assert.ok(seen[1].chill, "zweite bremst");
  assert.ok(seen[2].poison, "dritte vergiftet");
});

test("Alchemist: Elixier heilt und macht schneller; die Kettenreaktion trifft rund um den Einschlag", () => {
  const g = arena("alchemist");
  const p = g.player;
  p.hp = p.stats.maxHp * 0.5;
  const a0 = attackSpeedNow(p);
  castAbility(g, "secondary");
  assert.ok(p.hp > p.stats.maxHp * 0.6, "geheilt");
  assert.ok(attackSpeedNow(p) > a0 * 1.5, "schneller");
  const ring = [0, 1, 2, 3, 4, 5].map((i) => dummy(g, 300 + Math.cos((Math.PI * i) / 3) * 170, Math.sin((Math.PI * i) / 3) * 170));
  p.aimX = p.x + 300; p.aimY = p.y;
  castAbility(g, "special");
  step(g, Math.round(2 / TICK));
  assert.ok(ring.filter((e) => e.hp < e.maxHp).length >= 4, "Kette trifft rundum");
});

test("Gehaltene Taste: Ladungen kommen einzeln (Fangeisen nicht alle drei auf einmal)", () => {
  const g = arena("jaegerin");
  const hold = { held: { secondary: true }, pressed: {}, aimX: g.player.aimX, aimY: g.player.aimY };
  for (let i = 0; i < 5; i++) stepGame(g, TICK, hold);
  assert.equal(g.allies.filter((a) => a.kind === "trap").length, 1, "kurz gehalten: ein Fangeisen");
  for (let t = 0; t < 0.9; t += TICK) stepGame(g, TICK, hold);
  assert.equal(g.allies.filter((a) => a.kind === "trap").length, 3, "weiter gehalten: die übrigen im Abstand");
});

test("Wölfe teilen sich die Ziele statt beide denselben Gegner zu jagen", () => {
  const g = arena("jaegerin");
  castAbility(g, "special");
  const a = dummy(g, 220, -60), b = dummy(g, 220, 60);
  step(g, 3);
  const wolves = g.allies.filter((x) => x.kind === "wolf");
  assert.equal(wolves.length, 2);
  assert.ok(wolves[0].target && wolves[1].target, "beide haben ein Ziel");
  assert.notEqual(wolves[0].target, wolves[1].target, "verschiedene Ziele");
  assert.ok([a, b].includes(wolves[0].target) && [a, b].includes(wolves[1].target));
});

test("Rudel: Wölfe verteilen sich um den Helden, kündigen an (Bahn so lang wie der Sprung) und springen an", () => {
  const g = arena("default");
  g.player.buffs.invuln = 0; g.player.stats.dodge = 0;
  g.player.hp = g.player.stats.maxHp = 1e6;
  const pack = [0, 1, 2].map((i) => { const e = spawnEnemy(g, "gruftwolf", g.player.x + 400 + i * 30, g.player.y + i * 40, {}); e.spawnT = 1; e.atkCd = 1.5; return e; });
  const states = new Set();
  let hp = g.player.hp, hits = 0;
  for (let t = 0; t < 8; t += TICK) {
    step(g);
    for (const e of pack) { states.add(e.state); if (e.state === "aim") assert.equal(e.aimLen, 260); }
    if (g.player.hp < hp - 1) hits++;
    hp = g.player.hp;
  }
  assert.ok(states.has("aim") && states.has("charge"), `Zustände: ${[...states].join(", ")}`);
  assert.ok(hits >= 1, "mindestens ein Biss");
  // auf verschiedenen Plätzen: nicht alle aus derselben Richtung
  const angles = pack.map((e) => Math.atan2(e.y - g.player.y, e.x - g.player.x));
  assert.ok(Math.max(...angles) - Math.min(...angles) > 0.5, "verteilt im Kreis");
});
