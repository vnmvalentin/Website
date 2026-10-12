// engine/levelup.js — Stufenaufstieg im Lauf: jede Stufe öffnet eine Wahl aus drei Karten (neue Waffe, Waffe verbessern,
// Talent). Solange die Wahl offen ist, steht das Spiel (stepGame tut nichts). Die UI ruft chooseUpgrade/rerollOffer.
//
// Die allererste Wahl bietet nur Waffen an, damit jeder Lauf mit einer automatischen Waffe beginnt. Ist alles
// ausgebaut, gibt es Gold oder Heilung als Trostpreis.

import { WEAPONS, WEAPON_IDS, TALENTS, TALENT_IDS, MAX_WEAPONS, MAX_TALENTS, EVOLUTION_OF } from "../data/weapons.js";
import { recalcStats } from "./stats.js";
import { healPlayer } from "./combat.js";
import { giveItem } from "./loot.js";
import { chestPrice } from "./difficulty.js";
import { floatText, ring, shake } from "./fx.js";

const OFFER_SIZE = 3;

export function rerollPrice(g) {
  return Math.round(chestPrice(10, g.coeff) * Math.pow(2, g.levelUp?.rerolls || 0));
}

function candidates(g) {
  const p = g.player;
  const ownedW = p.weaponOrder.filter((id) => p.weapons[id]);
  const ownedT = p.talentOrder.filter((id) => p.talents[id]);
  const list = [];
  // Evolution: Waffe ausgebaut + passendes Talent vorhanden → sehr wahrscheinlich im Angebot
  for (const id of ownedW) {
    const evo = EVOLUTION_OF[id];
    if (evo && p.weapons[id] >= WEAPONS[id].levels.length && p.talents[WEAPONS[evo].talent]) list.push({ kind: "evolution", id: evo, from: id, level: 1, w: 12 });
  }
  for (const id of ownedW) {
    if (p.weapons[id] < WEAPONS[id].levels.length) list.push({ kind: "weapon", id, level: p.weapons[id] + 1, w: 3 });
  }
  if (ownedW.length < MAX_WEAPONS) {
    for (const id of WEAPON_IDS) if (!p.weapons[id] && !p.weapons[EVOLUTION_OF[id]]) list.push({ kind: "weapon", id, level: 1, w: ownedW.length < 2 ? 2.5 : 1.4 });
  }
  if (ownedW.length === 0) return list; // erste Wahl: nur Waffen
  for (const id of ownedT) {
    if (p.talents[id] < TALENTS[id].max) list.push({ kind: "talent", id, level: p.talents[id] + 1, w: 2 });
  }
  if (ownedT.length < MAX_TALENTS) {
    for (const id of TALENT_IDS) if (!p.talents[id]) list.push({ kind: "talent", id, level: 1, w: 1 });
  }
  return list;
}

function rollChoices(g) {
  const pool = candidates(g);
  const out = [];
  while (out.length < OFFER_SIZE && pool.length) {
    const total = pool.reduce((s, c) => s + c.w, 0);
    let roll = g.rng.next() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) { roll -= pool[i].w; if (roll <= 0) { idx = i; break; } }
    const { w: _w, ...choice } = pool.splice(idx, 1)[0];
    out.push(choice);
  }
  if (!out.length) out.push({ kind: "gold", amount: Math.round(chestPrice(25, g.coeff)) }, { kind: "heal", amount: 0.35 });
  return out;
}

export function openLevelUp(g) {
  g.levelUp = { level: g.player.level - g.player.pendingLevels + 1, choices: rollChoices(g), rerolls: 0 };
  g.events.push({ type: "levelChoice" });
}

// Schicksalsschrein: dieselbe Kartenwahl, aber mit Items und ohne Neu würfeln
export function openItemChoice(g, ids) {
  g.levelUp = { shrine: true, level: g.player.level, choices: ids.map((id) => ({ kind: "item", id })), rerolls: 0 };
  g.events.push({ type: "levelChoice" });
}

export function rerollOffer(g) {
  const lu = g.levelUp;
  if (!lu || lu.shrine) return false;
  const price = rerollPrice(g);
  if (g.player.gold < price) return false;
  g.player.gold -= price;
  g.stats.goldSpent += price;
  lu.rerolls++;
  lu.choices = rollChoices(g);
  return true;
}

export function chooseUpgrade(g, index) {
  const lu = g.levelUp;
  const c = lu?.choices[index];
  if (!c) return false;
  const p = g.player;
  if (c.kind === "weapon") {
    if (!p.weapons[c.id]) { p.weaponOrder.push(c.id); p.weaponState[c.id] = { t: 0 }; }
    p.weapons[c.id] = c.level;
  } else if (c.kind === "evolution") {
    // ersetzt die Grundwaffe am selben Platz
    p.weaponOrder = p.weaponOrder.map((id) => (id === c.from ? c.id : id));
    delete p.weapons[c.from];
    delete p.weaponState[c.from];
    p.weapons[c.id] = 1;
    p.weaponState[c.id] = { t: 0 };
    g.stats.evolutions = (g.stats.evolutions || 0) + 1;
    shake(g, 6);
  } else if (c.kind === "talent") {
    if (!p.talents[c.id]) p.talentOrder.push(c.id);
    p.talents[c.id] = c.level;
  } else if (c.kind === "item") {
    giveItem(g, c.id);
  } else if (c.kind === "gold") {
    p.gold += c.amount;
  } else if (c.kind === "heal") {
    healPlayer(g, p.stats.maxHp * c.amount);
  }
  recalcStats(p, g.kit);
  if (!lu.shrine) p.pendingLevels = Math.max(0, p.pendingLevels - 1);
  g.levelUp = null;
  ring(g, p.x, p.y, 140, "#f0a33c", 0.5);
  if (c.kind === "weapon" || c.kind === "talent" || c.kind === "evolution") {
    const def = c.kind === "talent" ? TALENTS[c.id] : WEAPONS[c.id];
    floatText(g, p.x, p.y - 60, c.level > 1 ? `${def.name} ${c.level}` : def.name, def.color, { size: 18, life: 1.2, jitter: false });
  }
  g.events.push({ type: "upgradeChosen", choice: c });
  return true;
}
