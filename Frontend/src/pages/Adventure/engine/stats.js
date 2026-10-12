// engine/stats.js — rechnet aus Kit, Stufe und Items die Werte des Spielers aus. Wird nur neu berechnet, wenn sich
// Items oder Stufe ändern (recalcStats); kurzzeitige Buffs (Overdrive, Hyperfeuer …) rechnen die Getter unten drauf.

import { ITEMS } from "../data/items.js";
import { TALENTS } from "../data/weapons.js";

// Stufenkurve im Lauf: anfangs alle ~15–30 s eine Wahl (die eigentliche Belohnung fürs Aufsteigen), später seltener
export const xpToNext = (level) => Math.round(20 + 12 * Math.pow(level - 1, 1.7));

// Was jede Stufe nebenbei gibt. Bewusst klein: die Kraft kommt aus den Waffen und Talenten, die man wählt
// (vorher +20 % Schaden und +30 % Leben pro Stufe — damit lief jeder Lauf nach 10 Minuten von allein)
const LEVEL_DAMAGE = 0.04;
const LEVEL_HP = 0.08;

function addStats(sum, s) {
  for (const [k, v] of Object.entries(s)) {
    if (k.endsWith("Mult")) sum[k] = (sum[k] ?? 1) * v;
    else sum[k] = (sum[k] ?? 0) + v;
  }
}

function sumStats(items, talents) {
  const sum = {};
  for (const [id, n] of Object.entries(items)) {
    const def = ITEMS[id];
    if (!def || n <= 0) continue;
    addStats(sum, def.stats(n));
  }
  for (const [id, n] of Object.entries(talents || {})) {
    const def = TALENTS[id];
    if (!def || n <= 0) continue;
    addStats(sum, def.stats(n));
  }
  return sum;
}

export function recalcStats(player, kit) {
  const s = sumStats(player.items, player.talents);
  const L = player.level;
  const g = (k, d = 0) => s[k] ?? d;
  const soul = (player.soulStacks || 0) * 0.01;

  const maxHp = Math.round((kit.hp * (1 + LEVEL_HP * (L - 1)) + g("maxHp")) * (1 + g("maxHpPct")));
  const stats = {
    maxHp,
    damage: kit.damage * (1 + LEVEL_DAMAGE * (L - 1)) * (1 + g("damagePct") + soul),
    regen: 0.8 + 0.1 * (L - 1) + g("regen"),
    armor: kit.armor + g("armor"),
    critChance: Math.min(1, kit.crit + g("critChance")),
    critMult: 2,
    attackSpeed: 1 + g("attackSpeedPct"),
    moveSpeed: kit.speed * (1 + g("moveSpeedPct")),
    projectiles: g("projectiles"),
    pierce: g("pierce"),
    range: 1 + g("rangePct"),
    cdMult: g("cdMult", 1),
    lifeOnHit: g("lifeOnHit"),
    gold: 1 + g("goldPct"),
    pickupRadius: 120 * (1 + g("pickupPct")),
    dodge: 1 - 1 / (1 + 0.12 * g("dodgeStacks")),
    utilityCharges: g("utilityCharges"),
    secondaryCharges: g("secondaryCharges"),
    bossDamage: 1 + g("bossDamagePct"),
    luck: g("luck"),
    shieldMax: Math.round(maxHp * g("shieldPct")),
    // Waffen: Abklingzeit (Stoppuhr & Co. wirken mit), Fläche, zusätzliche Geschosse/Ziele
    weaponCd: g("cdMult", 1) * g("weaponCdMult", 1),
    area: 1 + g("areaPct"),
    weaponCount: g("weaponCount"),
    xpGain: 1 + g("xpPct"),
  };

  // Lebenspunkte prozentual mitziehen, wenn das Maximum steigt (sonst wäre eine Lebensbeere bei vollem Leben "leer")
  const prevMax = player.stats?.maxHp;
  if (prevMax && maxHp > prevMax) player.hp += maxHp - prevMax;
  player.hp = Math.min(player.hp, maxHp);
  player.stats = stats;
  return stats;
}

// Kurzzeit-Buffs auf die Grundwerte
export function attackSpeedNow(p) {
  let a = p.stats.attackSpeed;
  if (p.buffs.overdrive > 0) a *= 1.5;
  if (p.buffs.hyper > 0) a *= 2;
  if (p.buffs.fortress > 0) a *= 1.5;
  if (p.bloodStacks?.length) a *= 1 + 0.05 * p.bloodStacks.length;
  return a;
}

export function moveSpeedNow(p) {
  let m = p.stats.moveSpeed;
  if (p.buffs.overdrive > 0) m *= 1.8;
  if (p.buffs.boots > 0) m *= 2;
  if (p.buffs.acidSprint > 0) m *= 1.6;
  if (p.buffs.spin > 0) m *= 1.3;
  if (p.barrage) m *= 0.6; // Kugelhagel: wer feuert, steht fast
  if (p.buffs.harpoon > 0) m *= 1 + 0.4 * (p.items.harpune || 0);
  if (p.status.slowT > 0) m *= 1 - p.status.slowPct;
  return m;
}

// Für die Werte-Übersicht (Tab) — fertig formatiert, damit die UI nichts nachrechnen muss
export function statSheet(p) {
  const s = p.stats;
  const pc = (x) => `${Math.round(x * 100)} %`;
  return [
    ["Leben", `${Math.ceil(p.hp)} / ${s.maxHp}`],
    ["Regeneration", `${s.regen.toFixed(1)} / s`],
    ["Schild", s.shieldMax > 0 ? `${s.shieldMax}` : "–"],
    ["Rüstung", `${Math.round(s.armor)} (−${pc(s.armor / (100 + Math.max(0, s.armor)))} Schaden)`],
    ["Ausweichen", pc(s.dodge)],
    ["Schaden", `${s.damage.toFixed(1)}`],
    ["Angriffstempo", pc(attackSpeedNow(p))],
    ["Krit-Chance", pc(s.critChance)],
    ["Krit-Schaden", pc(s.critMult)],
    ["Zusatzgeschosse", `+${s.projectiles}`],
    ["Durchschlag", `${s.pierce}`],
    ["Reichweite", pc(s.range)],
    ["Abklingzeit", `−${pc(1 - s.cdMult)}`],
    ["Waffentempo", `+${pc(1 / s.weaponCd - 1)}`],
    ["Waffenfläche", pc(s.area)],
    ["Erfahrung", pc(s.xpGain)],
    ["Lauftempo", `${Math.round(moveSpeedNow(p))}`],
    ["Boss-/Eliteschaden", pc(s.bossDamage)],
    ["Leben pro Treffer", `${s.lifeOnHit}`],
    ["Gold", pc(s.gold)],
    ["Sammelradius", `${Math.round(s.pickupRadius)}`],
    ["Glück", `${s.luck}`],
  ];
}
