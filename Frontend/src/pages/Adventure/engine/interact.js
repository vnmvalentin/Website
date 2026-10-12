// engine/interact.js — alles, was man mit E benutzt: Kisten (kosten Gold, Preis steigt mit der Schwierigkeit),
// Schreine, Ausrüstung am Boden und der Teleporter. Das nächste Objekt in Reichweite liefert den Hinweis fürs HUD.

import { chestPrice } from "./difficulty.js";
import { rollItem, rollEquipment, spawnItem, spawnEquipment, equip } from "./loot.js";
import { healPlayer } from "./combat.js";
import { spawnEnemy, findSpawnPoint, pickElite } from "./enemies.js";
import { activateTeleporter, leaveStage } from "./stage.js";
import { floatText, burst, ring, shake } from "./fx.js";
import { openItemChoice } from "./levelup.js";
import { recalcStats } from "./stats.js";
import { ITEMS } from "../data/items.js";
import { ascPrice } from "./ascension.js";
import { EQUIPMENT } from "../data/equipment.js";
import { enemyPoolFor } from "../data/biomes.js";
import { ENEMIES } from "../data/enemies.js";
import { dist2 } from "./util.js";

export const INTERACT_INFO = {
  // Seit den automatischen Waffen tötet man etwa doppelt so viel — Grundpreise höher, Anstieg steiler (difficulty.js)
  chest: { name: "Kiste", base: 30 },
  bigChest: { name: "Große Kiste", base: 65 },
  equipChest: { name: "Ausrüstungstruhe", base: 38 },
  luckShrine: { name: "Glücksschrein", base: 22 },
  combatShrine: { name: "Kampfschrein", base: 0 },
  healShrine: { name: "Heilquelle", base: 0 },
  fateShrine: { name: "Schicksalsschrein", base: 65 },
  sacrificeAltar: { name: "Opferaltar", base: 0 },
  curseShrine: { name: "Fluchschrein", base: 0 },
  diceShrine: { name: "Würfelschrein", base: 40 },
};

const SACRIFICE_PCT = 0.2;

// Items, die der Würfelschrein eintauschen kann (gewöhnlich → selten, selten → legendär)
function tradeable(p) {
  return p.itemOrder.filter((id) => p.items[id] > 0 && (ITEMS[id]?.rarity === "common" || ITEMS[id]?.rarity === "uncommon"));
}

// Grund, warum ein Objekt gerade nicht benutzbar ist (vor dem Bezahlen geprüft), sonst null
function blockedReason(g, o) {
  const p = g.player;
  if (o.type === "diceShrine" && !tradeable(p).length) return "Kein Item zum Eintauschen";
  if (o.type === "sacrificeAltar" && p.hp <= p.stats.maxHp * (SACRIFICE_PCT + 0.05)) return "Zu wenig Leben";
  return null;
}

export function priceOf(g, obj) {
  const info = INTERACT_INFO[obj.type];
  if (!info.base) return 0;
  const mult = obj.type === "luckShrine" ? Math.pow(1.5, obj.uses) : 1;
  return Math.round(chestPrice(info.base, g.coeff) * mult * ascPrice(g));
}

function findTarget(g) {
  const p = g.player;
  let best = null;
  let bd = Infinity;
  const consider = (kind, obj, range) => {
    const d = dist2(p.x, p.y, obj.x, obj.y);
    if (d < range * range && d < bd) { bd = d; best = { kind, obj }; }
  };
  for (const o of g.interactables) if (!o.used) consider("object", o, 75);
  for (const k of g.pickups) if (k.type === "equipment" && k.t > 0.4) consider("equipment", k, 60);
  const t = g.teleporter;
  if (t && (t.state === "idle" || t.state === "ready")) consider("teleporter", t, 110);
  return best;
}

export function updateInteract(g, input) {
  const p = g.player;
  const target = p.alive ? findTarget(g) : null;
  g.prompt = null;
  if (!target) return;

  if (target.kind === "teleporter") {
    const t = target.obj;
    if (t.state === "idle") g.prompt = { text: g.biome.final ? "" : "Teleporter aktivieren", sub: "Ruft den Boss dieser Welt" };
    else g.prompt = { text: g.biome.final ? "Weiter in den nächsten Zyklus" : "Weiterreisen", sub: "Zur nächsten Welt" };
    if (!g.prompt.text) { g.prompt = null; return; }
    if (input.pressed.interact) {
      if (t.state === "idle") activateTeleporter(g);
      else leaveStage(g);
    }
    return;
  }

  if (target.kind === "equipment") {
    const k = target.obj;
    g.prompt = { text: `${EQUIPMENT[k.id].name} aufnehmen`, sub: EQUIPMENT[k.id].desc };
    if (input.pressed.interact) {
      g.pickups = g.pickups.filter((x) => x !== k);
      equip(g, k.id, k.x, k.y);
    }
    return;
  }

  const o = target.obj;
  const info = INTERACT_INFO[o.type];
  const price = o.type === "diceShrine" ? Math.round(priceOf(g, o) * Math.pow(1.6, o.uses)) : priceOf(g, o);
  const affordable = p.gold >= price;
  const subs = {
    chest: "Ein zufälliges Item",
    bigChest: "Seltenes oder legendäres Item",
    equipChest: "Ausrüstung für die Taste Q",
    luckShrine: "45 % Chance auf ein Item",
    combatShrine: "Ruft Elite-Gegner, die ein seltenes Item hüten",
    healShrine: "Heilt dich vollständig",
    fateShrine: "Wähle 1 von 3 Items",
    sacrificeAltar: `Kostet ${SACRIFICE_PCT * 100} % deines max. Lebens — gibt ein legendäres Item`,
    curseShrine: "Gegner bis zur nächsten Welt stärker, dafür +50 % Gold und Erfahrung",
    diceShrine: "Tauscht ein gewöhnliches/seltenes Item gegen eins der nächsten Seltenheit",
  };
  g.prompt = { text: price ? `${info.name} öffnen` : `${info.name} benutzen`, sub: subs[o.type], price, affordable };
  if (!input.pressed.interact) return;
  const blocked = blockedReason(g, o);
  if (blocked) { floatText(g, p.x, p.y - 50, blocked, "#ff8a6a", { size: 14, jitter: false }); return; }
  if (!affordable) { floatText(g, p.x, p.y - 50, "Zu wenig Gold", "#ff8a6a", { size: 14, jitter: false }); return; }
  p.gold -= price;
  g.stats.goldSpent += price;
  activateObject(g, o);
}

function activateObject(g, o) {
  const p = g.player;
  switch (o.type) {
    case "chest":
      o.used = true;
      spawnItem(g, o.x, o.y, rollItem(g, { common: 79, uncommon: 20, legendary: 1 }));
      burst(g, o.x, o.y, "#f5cf4a", 14, 200);
      break;
    case "bigChest":
      o.used = true;
      spawnItem(g, o.x, o.y, rollItem(g, { uncommon: 80, legendary: 20 }));
      burst(g, o.x, o.y, "#86d05f", 18, 240);
      break;
    case "equipChest":
      o.used = true;
      spawnEquipment(g, o.x, o.y, rollEquipment(g));
      burst(g, o.x, o.y, "#f0a33c", 14, 200);
      break;
    case "luckShrine":
      o.uses++;
      if (g.rng.chance(0.45)) {
        spawnItem(g, o.x, o.y, rollItem(g, { common: 70, uncommon: 28, legendary: 2 }));
        o.wins = (o.wins || 0) + 1;
        if (o.wins >= 2) o.used = true;
        ring(g, o.x, o.y, 90, "#86d05f", 0.4);
      } else {
        floatText(g, o.x, o.y - 50, "Nichts …", "#b8b0a0", { size: 15, jitter: false });
      }
      if (o.uses >= 4) o.used = true;
      break;
    case "combatShrine": {
      o.used = true;
      const groupId = `shrine-${o.id}`;
      const pool = enemyPoolFor(g.biome, g.loop).filter(([id]) => ENEMIES[id].ai !== "turret");
      const n = 2 + Math.floor(g.stagesCleared / 2);
      for (let i = 0; i < n; i++) {
        const q = findSpawnPoint(g, o.x, o.y, 120, 260, 30) || { x: o.x + 100, y: o.y };
        spawnEnemy(g, g.rng.weighted(pool), q.x, q.y, { elite: pickElite(g), groupId });
      }
      g.shrineGroups.push({ groupId, x: o.x, y: o.y });
      ring(g, o.x, o.y, 220, "#d9473a", 0.5);
      floatText(g, o.x, o.y - 60, "Elite erscheinen!", "#ff7a5a", { size: 18, jitter: false, life: 1.4 });
      break;
    }
    case "healShrine":
      o.used = true;
      healPlayer(g, p.stats.maxHp);
      ring(g, p.x, p.y, 120, "#7be06b", 0.5);
      break;
    case "fateShrine": {
      o.used = true;
      const ids = [];
      for (let i = 0; i < 20 && ids.length < 3; i++) {
        const id = rollItem(g, { common: 30, uncommon: 60, legendary: 10 });
        if (!ids.includes(id)) ids.push(id);
      }
      ring(g, o.x, o.y, 140, "#f5cf4a", 0.5);
      openItemChoice(g, ids);
      break;
    }
    case "sacrificeAltar":
      o.used = true;
      p.hp -= p.stats.maxHp * SACRIFICE_PCT;
      p.hurtFlash = 0.3;
      floatText(g, p.x, p.y - 40, `-${Math.round(p.stats.maxHp * SACRIFICE_PCT)}`, "#ff5a4a", { size: 18 });
      burst(g, o.x, o.y, "#8a1f1f", 22, 260);
      spawnItem(g, o.x, o.y, rollItem(g, { legendary: 100 }));
      break;
    case "curseShrine":
      o.used = true;
      g.curse = true;
      ring(g, o.x, o.y, 300, "#7a3fc8", 0.7);
      shake(g, 6);
      g.events.push({ type: "message", text: "Verflucht: Gegner stärker, +50 % Gold und Erfahrung bis zur nächsten Welt" });
      break;
    case "diceShrine": {
      o.uses++;
      const list = tradeable(p);
      const id = list[Math.floor(g.rng.next() * list.length)];
      const next = ITEMS[id].rarity === "common" ? "uncommon" : "legendary";
      p.items[id]--;
      if (p.items[id] <= 0) { delete p.items[id]; p.itemOrder = p.itemOrder.filter((x) => x !== id); }
      recalcStats(p, g.kit);
      floatText(g, o.x, o.y - 70, `${ITEMS[id].name} eingetauscht`, "#e8e2d4", { size: 14, jitter: false, life: 1.4 });
      spawnItem(g, o.x, o.y, rollItem(g, { [next]: 100 }));
      if (o.uses >= 2) o.used = true;
      break;
    }
    default:
      break;
  }
}

// Kampfschrein-Gruppe besiegt → Belohnung
export function updateShrineGroups(g) {
  if (!g.shrineGroups.length) return;
  g.shrineGroups = g.shrineGroups.filter((sg) => {
    if (g.enemies.some((e) => e.groupId === sg.groupId)) return true;
    spawnItem(g, sg.x, sg.y, rollItem(g, { uncommon: 85, legendary: 15 }));
    ring(g, sg.x, sg.y, 160, "#86d05f", 0.5);
    return false;
  });
}

export { spawnEquipment };
