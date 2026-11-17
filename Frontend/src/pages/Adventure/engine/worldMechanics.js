// engine/worldMechanics.js — Besonderheiten einzelner Welten (data/biomes.js, Feld `mechanic`), Ausbauplan „av-welten“.
// Jede Mechanik ist eine Funktion (g, dt), die stepGame nach den Gegnern aufruft. Zustand liegt an den Hindernissen
// selbst (sie werden je Welt neu gebaut) — ein Spielstand muss davon nichts wissen.
//
//   graeber     Friedhof: Kommt man an einem Grab (Hindernis „grave“) vorbei, kündigt es sich mit einem Kreis an und
//               weckt dann eine kleine Gruppe Toter. Danach ruht es eine Weile. Die Boss-Fähigkeit „Gräberruf“ der
//               Klagenden Witwe weckt alle Gräber in der Nähe auf einmal (wakeGrave).
//   sporen      Pilzwald: Ein Sporenpilz (Hindernis „sporeshroom“) kündigt sich an, wenn man ihm nahe kommt, und stößt
//               dann eine Sporenwolke aus (Fläche, macht langsam, kein Schaden). Danach ruht er.
//   pfuetzen    Sumpf: Giftpfützen am Boden (g.pools, engine/worldgen.js) — wer darin steht, wird vergiftet und
//               kommt schwer voran. Gift tötet nie (engine/player.js), es zermürbt nur.
//   zahnraeder  Uhrwerkturm: Jede Zahnradfalle (Hindernis „gear“) dreht eine Klinge im Kreis. Sie trifft dich höchstens
//               einmal je Umlauf und mahlt Gegner am Boden klein (Futter sofort, alle anderen um einen Anteil).

import { spawnEnemy, findSpawnPoint } from "./enemies.js";
import { addHazard, addZone, hurtPlayer, damageEnemy } from "./combat.js";
import { collectEnemies } from "./grid.js";
import { enemyDmgMult } from "./difficulty.js";
import { burst } from "./fx.js";
import { dist2, distToSegment } from "./util.js";

// ── Friedhof ──────────────────────────────────────────────────────────────
/** So nah muss man einem Grab kommen, damit es erwacht (Mitte zu Mitte, Pixel) */
export const GRAVE_TRIGGER = 170;
/** Danach ruht ein Grab so viele Sekunden */
export const GRAVE_REST = 32;
/** Ankündigung bis zum Erwachen */
export const GRAVE_WARN = 0.75;
const GRAVE_COLOR = "#9fe8c8";

/** Wie viele Tote ein Grab weckt: wächst mit den geschafften Welten, bleibt aber eine kleine Gruppe */
export const graveCount = (g) => Math.min(8, 3 + Math.floor(g.stagesCleared / 4));

/** Ein Grab erwachen lassen (Ankündigung jetzt, Tote nach GRAVE_WARN) */
export function wakeGrave(g, o) {
  if (o.wakeAt != null) return false;
  o.wakeAt = g.time + GRAVE_WARN;
  o.restUntil = g.time + GRAVE_REST;
  addHazard(g, { shape: "circle", x: o.x, y: o.y, r: o.r + 70, delay: GRAVE_WARN, dmg: 0, color: GRAVE_COLOR });
  return true;
}

function updateGraves(g) {
  const p = g.player;
  for (const o of g.obstacles) {
    if (o.sprite !== "grave") continue;
    if (o.wakeAt != null && g.time >= o.wakeAt) {
      o.wakeAt = null;
      const n = graveCount(g);
      for (let i = 0; i < n; i++) {
        const q = findSpawnPoint(g, o.x, o.y, o.r + 20, o.r + 90, 18) || { x: o.x + o.r + 30, y: o.y };
        // meist Masse, ab und zu ein Ghul-Krieger dazwischen
        const id = i === n - 1 && g.rng.chance(0.4) ? "skeletonwarrior" : g.rng.chance(0.5) ? "ghul" : "goblin";
        spawnEnemy(g, id, q.x, q.y, {});
      }
      burst(g, o.x, o.y, GRAVE_COLOR, 18, 220);
      g.fx.sfx.grave = (g.fx.sfx.grave || 0) + 1;
      continue;
    }
    if (!p.alive || g.time < (o.restUntil ?? 0)) continue;
    const reach = GRAVE_TRIGGER + o.r;
    if (dist2(p.x, p.y, o.x, o.y) < reach * reach) wakeGrave(g, o);
  }
}

// ── Pilzwald ──────────────────────────────────────────────────────────────
/** So nah muss man einem Sporenpilz kommen (Rand zu Mitte, Pixel) */
export const SPORE_TRIGGER = 130;
/** Ankündigung bis zur Wolke, Ruhezeit danach, Größe und Dauer der Wolke */
export const SPORE_WARN = 0.6;
export const SPORE_REST = 12;
export const SPORE_R = 140;
export const SPORE_T = 3.5;
export const SPORE_COLOR = "#c49aff";

/** Eine Sporenwolke an x, y (auch für platzende Bovisten und den Myzelkönig) */
export function sporeCloud(g, x, y, r = SPORE_R, t = SPORE_T) {
  addZone(g, { x, y, r, t, tick: 0.25, dmg: 0, effect: "slow", kind: "spores" });
  burst(g, x, y, SPORE_COLOR, 14, 160);
  g.fx.sfx.spores = (g.fx.sfx.spores || 0) + 1;
}

function updateSpores(g) {
  const p = g.player;
  for (const o of g.obstacles) {
    if (o.sprite !== "sporeshroom") continue;
    if (o.puffAt != null && g.time >= o.puffAt) {
      o.puffAt = null;
      sporeCloud(g, o.x, o.y);
      continue;
    }
    if (!p.alive || o.puffAt != null || g.time < (o.restUntil ?? 0)) continue;
    const reach = SPORE_TRIGGER + o.r;
    if (dist2(p.x, p.y, o.x, o.y) < reach * reach) {
      o.puffAt = g.time + SPORE_WARN;
      o.restUntil = g.time + SPORE_REST;
      addHazard(g, { shape: "circle", x: o.x, y: o.y, r: SPORE_R, delay: SPORE_WARN, dmg: 0, color: SPORE_COLOR });
    }
  }
}

// ── Sumpf ─────────────────────────────────────────────────────────────────
/** Gift aus einer Pfütze: wie ein Gifttreffer, aber schwächer und kürzer (läuft weiter, solange man darin steht) */
export const POOL_POISON = 0.6;
/** So viel langsamer im Morast */
export const POOL_SLOW = 0.3;

/** Steht der Punkt in einer Giftpfütze? (der Rand zählt erst ab einem Drittel des Körpers) */
export function inPool(g, x, y, r = 0) {
  for (const o of g.pools || []) {
    const rr = o.r - r * 0.3;
    if (rr > 0 && dist2(x, y, o.x, o.y) < rr * rr) return o;
  }
  return null;
}

function updatePools(g) {
  const p = g.player;
  if (!p.alive || !g.pools?.length || p.buffs.invuln > 0) return;
  if (!inPool(g, p.x, p.y, p.r)) return;
  const st = p.status;
  st.slowT = Math.max(st.slowT, 0.25);
  st.slowPct = Math.max(st.slowPct, POOL_SLOW);
  // Gift wie applyStatus("poison"), nur abgeschwächt: zwei Sekunden nach dem Herausgehen ist es vorbei
  const dps = (2 + g.coeff * 1.5) * POOL_POISON;
  if (st.poisonT < 2 || st.poisonDps < dps) { st.poisonT = Math.max(st.poisonT, 2); st.poisonDps = Math.max(st.poisonDps, dps); }
}

// ── Uhrwerkturm ───────────────────────────────────────────────────────────
/** Länge der Klinge ab der Mitte des Zahnrads, Breite, Drehung (Bogenmaß je Sekunde) */
export const GEAR_REACH = 150;
export const GEAR_W = 26;
export const GEAR_SPIN = 1.1;
/** Grundschaden eines Klingentreffers (skaliert wie ein Gegnertreffer) und Mindestabstand zwischen zwei Treffern */
export const GEAR_DMG = 14;
const GEAR_PLAYER_CD = 0.9;
const GEAR_ENEMY_CD = 0.6;
const gearHits = [];

/** Winkel der Klinge: aus Lage und Weltzeit, damit 2D, 3D und Spielstand nichts speichern müssen */
export function gearAngle(g, o) {
  const dir = Math.floor(o.x + o.y) % 2 ? 1 : -1;
  return ((o.x * 0.37 + o.y * 0.61) % (Math.PI * 2)) + dir * GEAR_SPIN * g.stageTime;
}

function updateGears(g) {
  const p = g.player;
  for (const o of g.obstacles) {
    if (o.sprite !== "gear") continue;
    const a = gearAngle(g, o);
    o.armA = a; // für die Zeichner
    const x2 = o.x + Math.cos(a) * GEAR_REACH, y2 = o.y + Math.sin(a) * GEAR_REACH;
    if (p.alive && g.time >= (o.hitT ?? 0) && distToSegment(p.x, p.y, o.x, o.y, x2, y2) < GEAR_W / 2 + p.r * 0.8) {
      o.hitT = g.time + GEAR_PLAYER_CD;
      if (hurtPlayer(g, GEAR_DMG * enemyDmgMult(g.coeff, g.difficulty), { source: { name: "Zahnradfalle" } })) {
        g.fx.sfx.gear = (g.fx.sfx.gear || 0) + 1;
        burst(g, p.x, p.y, "#d8b060", 10, 200);
      }
    }
    // Gegner am Boden: Futter fällt sofort, alle anderen verlieren einen Teil ihres Lebens (Bosse und Kolosse kaum)
    const mx = (o.x + x2) / 2, my = (o.y + y2) / 2;
    for (const e of collectEnemies(g, mx, my, GEAR_REACH / 2 + 40, gearHits)) {
      if (e.dead || e.flying || e.hidden || e.isBoss || g.time < (e.gearT ?? 0)) continue;
      if (distToSegment(e.x, e.y, o.x, o.y, x2, y2) > GEAR_W / 2 + e.r) continue;
      e.gearT = g.time + GEAR_ENEMY_CD;
      const share = e.tier === "futter" && !e.elite ? 1 : e.giant || e.champion ? 0.06 : e.elite ? 0.1 : 0.25;
      damageEnemy(g, e, e.maxHp * share, { proc: 0, canCrit: false, knockback: 140, fromX: o.x, fromY: o.y, silent: share >= 1 });
    }
  }
}

const MECHANICS = { graeber: updateGraves, sporen: updateSpores, pfuetzen: updatePools, zahnraeder: updateGears };

export function updateWorldMechanics(g) {
  const m = g.biome?.mechanic;
  if (m && MECHANICS[m]) MECHANICS[m](g);
}
