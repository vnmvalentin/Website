// engine/game.js — ein Lauf als reiner Datenzustand plus stepGame(). Kein DOM, kein Canvas: der Renderer zeichnet nur,
// was hier steht, und Tests können einen ganzen Lauf ohne Browser simulieren.
//
// Ablauf eines Ticks: Spieler → Interaktion → Director → Gegner → Verbündete → Geschosse → Telegraphen → Flächen →
// Item-Effekte → Beute → Weltablauf → Optik. Ereignisse für die UI landen in g.events (die UI leert die Liste).

import { KITS } from "../data/kits.js";
import { ITEMS } from "../data/items.js";
import { BOSSES } from "../data/bosses.js";
import { DIFFICULTIES, coefficient, tierInfo } from "./difficulty.js";
import { createPlayer, maxCharges, cooldownOf } from "./player.js";
import { updatePlayer } from "./player.js";
import { updateInteract, updateShrineGroups } from "./interact.js";
import { updateDirector } from "./director.js";
import { updateEnemies } from "./enemies.js";
import { updateAllies } from "./allies.js";
import { updateProjectiles } from "./projectiles.js";
import { updateHazards, updateZones } from "./combat.js";
import { updateItemEffects } from "./procs.js";
import { updateWeapons } from "./weapons.js";
import { initHorde, updateHorde } from "./horde.js";
import { ELITE_AFFIXES } from "../data/enemies.js";
import { openLevelUp, rerollPrice } from "./levelup.js";
import { updatePickups, giveItem, rollItem } from "./loot.js";
import { loadStage, updateStage } from "./stage.js";
import { updateFx } from "./fx.js";
import { xpToNext } from "./stats.js";
import { makeRng, hashSeed } from "./util.js";

export const SNAPSHOT_VERSION = 1;
export const TICK = 1 / 60;

export function createGame({ kitId, difficulty = "normal", seed, lockedItems = [], snapshot = null, startItems = 0, ascension = 0 }) {
  const snap = snapshot && snapshot.v === SNAPSHOT_VERSION ? snapshot : null;
  const kit = KITS[snap?.kitId ?? kitId] || KITS.default;
  const g = {
    seed: snap?.seed ?? seed,
    kitId: kit.id,
    kit,
    difficulty: DIFFICULTIES[snap?.difficulty ?? difficulty] || DIFFICULTIES.normal,
    lockedItems,
    ascension: snap?.ascension ?? ascension,
    rng: makeRng(hashSeed(snap?.seed ?? seed, "kampf", snap?.stageIndex ?? 0, snap?.loop ?? 0)),
    fxRng: Math.random,
    nextUid: 1,
    time: snap?.time ?? 0,
    stageTime: 0,
    stageIndex: snap?.stageIndex ?? 0,
    loop: snap?.loop ?? 0,
    stagesCleared: snap?.stagesCleared ?? 0,
    coeff: 1,
    stats: {
      kills: 0, bossesKilled: 0, stagesCleared: 0, damageDealt: 0, damageTaken: 0,
      goldCollected: 0, goldSpent: 0, itemsCollected: 0,
      ...(snap?.stats || {}),
    },
    player: createPlayer(kit, snap?.player),
    events: [],
    fx: { texts: [], particles: [], rings: [], bolts: [], slashes: [], shake: 0, sfx: { hit: 0, crit: 0, kill: 0, gold: 0, hurt: 0 } },
    over: false,
    won: snap?.won ?? false,
    inputEnabled: true,
    prompt: null,
    horde: initHorde(),
    levelUp: null, // offene Wahl beim Stufenaufstieg (engine/levelup.js) — solange gesetzt, steht das Spiel
  };
  loadStage(g);
  if (!snap && startItems > 0) {
    for (let i = 0; i < startItems; i++) giveItem(g, rollItem(g, { common: 100 }));
  }
  g.events = g.events.filter((e) => e.type === "stageStart");
  return g;
}

export function stepGame(g, dt, input) {
  if (g.over || g.levelUp) return;
  g.time += dt;
  g.stageTime += dt;
  g.coeff = coefficient(g.time, g.stagesCleared, g.difficulty);

  updatePlayer(g, dt, input);
  updateInteract(g, input);
  updateDirector(g, dt);
  updateHorde(g, dt);
  updateEnemies(g, dt);
  updateAllies(g, dt);
  updateProjectiles(g, dt);
  updateHazards(g, dt);
  updateZones(g, dt);
  updateItemEffects(g, dt);
  updateWeapons(g, dt);
  updatePickups(g, dt);
  updateShrineGroups(g);
  updateStage(g, dt);
  for (const w of g.walls) w.t -= dt;
  if (g.walls.length) g.walls = g.walls.filter((w) => w.t > 0);
  updateFx(g, dt);
  if (g.player.pendingLevels > 0 && g.player.alive && !g.over && !g.levelUp) openLevelUp(g);
}

// Spielstand am Anfang einer Welt — beim Fortsetzen wird die Welt aus Seed + Nummer neu gebaut
export function snapshotGame(g) {
  const p = g.player;
  return {
    v: SNAPSHOT_VERSION,
    kitId: g.kitId,
    difficulty: g.difficulty.id,
    ascension: g.ascension,
    seed: g.seed,
    stageIndex: g.stageIndex,
    loop: g.loop,
    stagesCleared: g.stagesCleared,
    time: Math.round(g.time),
    won: g.won,
    stats: { ...g.stats, damageDealt: Math.round(g.stats.damageDealt), damageTaken: Math.round(g.stats.damageTaken) },
    player: {
      level: p.level, xp: Math.floor(p.xp), gold: Math.floor(p.gold), items: { ...p.items }, itemOrder: [...p.itemOrder],
      equipment: p.equipment, soulStacks: p.soulStacks, hpFrac: Math.max(0.05, p.hp / p.stats.maxHp),
      weapons: { ...p.weapons }, weaponOrder: [...p.weaponOrder], talents: { ...p.talents }, talentOrder: [...p.talentOrder],
      pendingLevels: p.pendingLevels,
    },
  };
}

// Was das HUD braucht, kompakt und fertig gerechnet (wird ~10× pro Sekunde abgefragt)
export function hudState(g) {
  const p = g.player;
  const kit = g.kit;
  const tier = tierInfo(g.coeff);
  const slot = (name) => {
    const ab = kit.abilities[name];
    if (name === "primary") return { name: ab.name, ready: true, charges: 1, max: 1, progress: 1 };
    const cd = p.cds[name];
    const max = maxCharges(p, kit, name);
    const need = cooldownOf(p, kit, name);
    return { name: ab.name, charges: cd.charges, max, progress: cd.charges >= max ? 1 : cd.t / need, left: cd.charges > 0 ? 0 : need - cd.t };
  };
  const champ = g.enemies.find((e) => e.champion && !e.dead);
  const boss = g.boss && !g.boss.dead ? { name: g.boss.name, title: BOSSES[g.boss.bossId]?.title, hp: Math.max(0, g.boss.hp), maxHp: g.boss.maxHp, phase2: !!g.boss.phase2 } : null;
  return {
    hp: p.hp, maxHp: p.stats.maxHp, shield: p.shield, shieldMax: p.stats.shieldMax,
    level: p.level, xp: p.xp, xpNext: xpToNext(p.level), gold: Math.floor(p.gold),
    time: g.time, coeff: g.coeff, tier,
    stageName: g.biome.name, stageIndex: g.stageIndex, loop: g.loop, stagesCleared: g.stagesCleared,
    kills: g.stats.kills,
    items: p.itemOrder.filter((id) => p.items[id] > 0 && ITEMS[id]).map((id) => ({ id, n: p.items[id] })),
    weapons: p.weaponOrder.filter((id) => p.weapons[id]).map((id) => ({ id, level: p.weapons[id] })),
    talents: p.talentOrder.filter((id) => p.talents[id]).map((id) => ({ id, level: p.talents[id] })),
    levelUp: g.levelUp ? { level: g.levelUp.level, shrine: !!g.levelUp.shrine, choices: g.levelUp.choices, rerollPrice: rerollPrice(g), more: g.levelUp.shrine ? 0 : p.pendingLevels - 1 } : null,
    equipment: p.equipment ? { id: p.equipment, left: Math.max(0, p.equipCd) } : null,
    slots: { primary: slot("primary"), secondary: slot("secondary"), utility: slot("utility"), special: slot("special") },
    boss,
    champion: champ ? { name: champ.name, hp: Math.max(0, champ.hp), maxHp: champ.maxHp, affixes: champ.affixes.map((a) => ELITE_AFFIXES[a]?.name) } : null,
    bloodMoon: g.horde.blood > 0 ? Math.ceil(g.horde.blood) : 0,
    curse: !!g.curse,
    tele: { state: g.teleporter.state, charge: g.teleporter.charge, discovered: g.teleporter.discovered, final: !!g.biome.final },
    prompt: g.prompt ? { ...g.prompt, canAfford: g.prompt.affordable !== false } : null,
    status: {
      poison: p.status.poisonT > 0, burn: p.status.burnT > 0, slow: p.status.slowT > 0, frozen: p.status.freezeT > 0, stunned: p.status.stunT > 0,
      invuln: p.buffs.invuln > 0, overdrive: p.buffs.overdrive > 0, hyper: p.buffs.hyper > 0, boots: p.buffs.boots > 0,
    },
    alive: p.alive,
  };
}
