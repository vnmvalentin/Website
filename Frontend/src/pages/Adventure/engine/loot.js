// engine/loot.js — XP und Stufenaufstieg im Lauf, Gold, Item-Würfe aus Kisten und alles, was am Boden liegt
// (Münzen, Items, Heilkugeln, Ausrüstung).

import { ITEMS, RARITY, itemsOfRarity } from "../data/items.js";
import { EQUIPMENT, EQUIPMENT_IDS } from "../data/equipment.js";
import { recalcStats, xpToNext } from "./stats.js";
import { floatText, ring } from "./fx.js";
import { healPlayer } from "./combat.js";
import { dist2 } from "./util.js";

const RANK = { common: 0, uncommon: 1, legendary: 2 };

// Jede neue Stufe merkt sich eine offene Wahl (pendingLevels); game.js öffnet sie nach dem Tick (engine/levelup.js)
export function grantXp(g, amount) {
  const p = g.player;
  p.xp += amount * p.stats.xpGain;
  let leveled = false;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    p.pendingLevels++;
    leveled = true;
  }
  if (leveled) {
    recalcStats(p, g.kit);
    p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.1);
    floatText(g, p.x, p.y - 56, `Stufe ${p.level}`, "#f0a33c", { size: 22, life: 1.4, jitter: false });
    ring(g, p.x, p.y, 120, "#f0a33c", 0.5);
    g.events.push({ type: "levelUp", level: p.level });
  }
}

export function dropGold(g, x, y, amount) {
  const value = Math.max(1, Math.round(amount * g.player.stats.gold));
  g.pickups.push({ type: "gold", x, y, value, t: 0, vx: (g.rng.next() - 0.5) * 120, vy: (g.rng.next() - 0.5) * 120 });
}

// Seltenheit würfeln; Glück würfelt öfter und nimmt das beste Ergebnis
export function rollRarity(g, weights) {
  const tries = 1 + Math.max(0, Math.floor(g.player.stats.luck));
  let best = null;
  for (let i = 0; i < tries; i++) {
    const r = g.rng.weighted(Object.entries(weights));
    if (!best || RANK[r] > RANK[best]) best = r;
  }
  return best;
}

export function rollItem(g, weights) {
  let rarity = rollRarity(g, weights);
  let pool = itemsOfRarity(rarity, g.lockedItems);
  // Falls eine Seltenheit (durch gesperrte Items) leer ist, eine Stufe darunter nehmen
  while (!pool.length && rarity !== "common") {
    rarity = rarity === "legendary" ? "uncommon" : "common";
    pool = itemsOfRarity(rarity, g.lockedItems);
  }
  return g.rng.pick(pool);
}

export function rollEquipment(g) {
  const pool = EQUIPMENT_IDS.filter((id) => !g.lockedItems.includes(id) && id !== g.player.equipment);
  return g.rng.pick(pool.length ? pool : EQUIPMENT_IDS);
}

export function spawnItem(g, x, y, id) {
  const a = g.rng.range(0, Math.PI * 2);
  g.pickups.push({ type: "item", id, x, y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140 - 60, t: 0 });
}

export function spawnEquipment(g, x, y, id) {
  g.pickups.push({ type: "equipment", id, x, y, vx: 0, vy: -80, t: 0 });
}

export function giveItem(g, id, n = 1) {
  const p = g.player;
  p.items[id] = (p.items[id] || 0) + n;
  if (!p.itemOrder.includes(id)) p.itemOrder.push(id);
  g.stats.itemsCollected += n;
  recalcStats(p, g.kit);
  if (p.stats.shieldMax > 0 && p.shield === 0) p.shield = p.stats.shieldMax;
  const def = ITEMS[id];
  if (id === "kompass" && g.teleporter && !g.teleporter.discovered) g.teleporter.discovered = true;
  g.events.push({ type: "item", id, count: p.items[id] });
  floatText(g, p.x, p.y - 58, def.name, RARITY[def.rarity].color, { size: 16, life: 1.2, jitter: false });
  g.events.push({ type: "itemsChanged" });
}

export function equip(g, id, x, y) {
  const p = g.player;
  if (p.equipment) spawnEquipment(g, x, y + 30, p.equipment);
  p.equipment = id;
  p.equipCd = 0;
  g.events.push({ type: "equipment", id });
  floatText(g, p.x, p.y - 58, EQUIPMENT[id].name, "#f0a33c", { size: 16, life: 1.2, jitter: false });
}

export function updatePickups(g, dt) {
  const p = g.player;
  const r2 = p.stats.pickupRadius * p.stats.pickupRadius;
  const keep = [];
  for (const k of g.pickups) {
    k.t += dt;
    // kurzer Auswurf
    if (k.vx || k.vy) {
      k.x += k.vx * dt; k.y += k.vy * dt;
      k.vx *= 0.9; k.vy *= 0.9;
      if (Math.abs(k.vx) < 4 && Math.abs(k.vy) < 4) { k.vx = 0; k.vy = 0; }
    }
    // Items/Ausrüstung nie in einem Hindernis oder außerhalb der Welt liegen lassen (sonst unerreichbar)
    if (k.type === "item" || k.type === "equipment") {
      for (const o of g.obstacles) {
        const rr = o.r + 26;
        const dx = k.x - o.x, dy = k.y - o.y;
        const d2o = dx * dx + dy * dy;
        if (d2o >= rr * rr) continue;
        const d = Math.sqrt(d2o) || 1;
        k.x = o.x + (dx / d) * rr; k.y = o.y + (dy / d) * rr;
      }
      k.x = Math.min(g.world.w - 130, Math.max(130, k.x));
      k.y = Math.min(g.world.h - 130, Math.max(130, k.y));
    }
    const d2 = dist2(k.x, k.y, p.x, p.y);
    if (k.type === "gold") {
      // Gold fliegt nach kurzer Zeit immer zu dir — es geht nichts verloren
      if (k.t > 0.45 || d2 < r2) {
        const a = Math.atan2(p.y - k.y, p.x - k.x);
        const sp = 520 + k.t * 600;
        k.x += Math.cos(a) * sp * dt; k.y += Math.sin(a) * sp * dt;
      }
      if (d2 < 26 * 26) {
        p.gold += k.value; g.stats.goldCollected += k.value; g.fx.sfx.gold++;
        if (p.items.skarabaeus) healPlayer(g, 0.6 * p.items.skarabaeus, true); // Goldener Skarabäus
        continue;
      }
    } else if (k.type === "heal") {
      if (d2 < r2) {
        const a = Math.atan2(p.y - k.y, p.x - k.x);
        k.x += Math.cos(a) * 480 * dt; k.y += Math.sin(a) * 480 * dt;
      }
      if (d2 < 28 * 28) { healPlayer(g, k.value); continue; }
      if (k.t > 20) continue;
    } else if (k.type === "item") {
      if (k.t > 0.5 && d2 < 40 * 40) { giveItem(g, k.id); continue; }
    }
    // Ausrüstung wird per Interaktion (E) aufgenommen, siehe interact.js
    keep.push(k);
  }
  g.pickups = keep;
}
