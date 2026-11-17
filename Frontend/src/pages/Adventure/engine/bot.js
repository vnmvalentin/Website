// engine/bot.js — ein simpler Spieler für Tests und Balance-Messungen: zielt auf den nächsten Gegner, weicht aus, kauft
// Kisten, sobald das Gold reicht, und aktiviert nach einer Weile den Teleporter. Kein Teil des Spiels im Browser.

import { nearestEnemy } from "./combat.js";
import { priceOf } from "./interact.js";
import { chooseUpgrade } from "./levelup.js";
import { dist2 } from "./util.js";
import { collectEnemies } from "./grid.js";
import { GEAR_REACH } from "./worldMechanics.js";

const nearby = [];

// Stufenaufstieg: Evolution vor Waffe verbessern vor neuer Waffe, Talente im Verhältnis dazu (ungefähr so, wie man
// es als Mensch auch macht)
export function botChoose(g) {
  if (!g.levelUp) return false;
  const p = g.player;
  // Talente ziehen mit: liegen sie mehr als die Hälfte hinter den Waffenstufen, gehen sie vor. Eine fünfte und
  // sechste Waffe nimmt der Bot nur, wenn sonst nichts Brauchbares im Angebot ist.
  const sum = (o) => Object.values(o).reduce((n, v) => n + v, 0);
  const owned = Object.keys(p.weapons).length, lagging = sum(p.talents) * 2 < sum(p.weapons);
  const score = (c) => (c.kind === "evolution" ? 5 : c.kind === "weapon" ? (p.weapons[c.id] ? 3 : owned < 4 ? 2 : 0.5) : c.kind === "talent" ? (lagging ? 3.5 : 1) : 0);
  const list = g.levelUp.choices;
  let best = 0;
  for (let i = 1; i < list.length; i++) if (score(list[i]) > score(list[best])) best = i;
  return chooseUpgrade(g, best);
}

export function botInput(g, opts = {}) {
  const p = g.player;
  const held = { up: false, down: false, left: false, right: false, primary: true, secondary: true, utility: false, special: true };
  const pressed = { interact: false, equipment: true };
  const target = nearestEnemy(g, p.x, p.y, 900);
  let aimX = p.x + 100, aimY = p.y;
  if (target) { aimX = target.x; aimY = target.y; }

  // Ziel zum Hinlaufen: Teleporter (wenn Zeit), sonst erschwingliche Kiste, sonst Teleporter
  const t = g.teleporter;
  let goal = null;
  const wantTele = t.state === "ready" || (t.state === "idle" && g.stageTime > (opts.teleAfter ?? 150)) || g.biome.final;
  if (!wantTele) {
    let best = null; let bd = Infinity;
    for (const o of g.interactables) {
      if (o.used || o.type === "combatShrine" || o.type === "curseShrine" || o.type === "sacrificeAltar") continue;
      if (priceOf(g, o) > p.gold) continue;
      const d = dist2(p.x, p.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    goal = best;
  }
  // Im Finale erst nach dem Sieg: dann durch den Teleporter in den nächsten Zyklus (ein Mensch klickt „Weiter“)
  if (!goal && wantTele && t.state !== "charging" && (!g.biome.final || t.state === "ready")) goal = t;
  if (t.state === "charging") goal = { x: t.x + Math.cos(g.time) * 250, y: t.y + Math.sin(g.time) * 250 };
  // Nichts zu tun: kreisen statt den Boss viel zu früh zu rufen (ein Mensch farmt erst ein wenig)
  if (!goal && !g.biome.final) goal = { x: p.x + Math.cos(g.time * 0.4) * 300, y: p.y + Math.sin(g.time * 0.4) * 300 };
  // Items am Boden einsammeln
  const item = g.pickups.find((k) => k.type === "item" || (k.type === "equipment" && !p.equipment));
  if (item) goal = item;

  let mx = 0, my = 0;
  if (goal) {
    const a = Math.atan2(goal.y - p.y, goal.x - p.x);
    mx += Math.cos(a); my += Math.sin(a);
    if (dist2(p.x, p.y, goal.x, goal.y) < 60 * 60) pressed.interact = true;
    // Hindernis direkt voraus: seitlich daran vorbei (Zahnradfallen mit ihrer ganzen Klinge — ein Mensch sieht sie kreisen)
    for (const o of g.obstacles) {
      const or = o.sprite === "gear" ? GEAR_REACH : o.r;
      const ax = o.x - p.x, ay = o.y - p.y;
      const along = ax * Math.cos(a) + ay * Math.sin(a);
      if (along < 0 || along > or + 90) continue;
      const side = -ax * Math.sin(a) + ay * Math.cos(a);
      if (Math.abs(side) > or + p.r + 6) continue;
      const s = side >= 0 ? -1 : 1;
      mx += -Math.sin(a) * s * 1.5; my += Math.cos(a) * s * 1.5;
    }
  }
  // Weg vom Weltrand
  const edge = 110;
  if (p.x < edge) mx += 2;
  if (p.x > g.world.w - edge) mx -= 2;
  if (p.y < edge) my += 2;
  if (p.y > g.world.h - edge) my -= 2;
  // Ausweichen (abschaltbar). In einer Horde hilft "weg vom Nächsten" nicht — dann steht man in der Ecke. Stattdessen
  // die Umgebung in zwölf Richtungen teilen, die Gefahr in jeder zählen und in die freieste laufen. So macht es auch
  // ein Mensch: Lücke suchen, im Bogen um die Menge herum.
  if (opts.evade !== false) {
    const SECT = 12, R = 300, TAU = Math.PI * 2;
    const danger = new Float32Array(SECT);
    let total = 0;
    for (const e of collectEnemies(g, p.x, p.y, R, nearby)) {
      if (e.hidden) continue;
      const d = Math.sqrt(dist2(p.x, p.y, e.x, e.y));
      // Gefährliche Einzelne (alles außer Futter): direkt Abstand halten, wie bisher
      if (e.tier !== "futter") {
        if (d < e.r + 140) { const a = Math.atan2(p.y - e.y, p.x - e.x); mx += Math.cos(a) * 1.6; my += Math.sin(a) * 1.6; }
        continue;
      }
      const close = 1 - Math.min(1, Math.max(0, d - e.r) / R);
      const w = close * close;
      const s = Math.floor((((Math.atan2(e.y - p.y, e.x - p.x) % TAU) + TAU) % TAU) / TAU * SECT) % SECT;
      danger[s] += w; danger[(s + 1) % SECT] += w * 0.5; danger[(s + SECT - 1) % SECT] += w * 0.5;
      total += w;
    }
    if (total > 0.15) {
      // Bei gleicher Gefahr gewinnt die Richtung, die am ehesten zum Ziel führt; der Weltrand zählt als Gefahr
      const goalA = goal ? Math.atan2(goal.y - p.y, goal.x - p.x) : p.moveAngle;
      let bestA = 0, bestScore = Infinity;
      for (let s = 0; s < SECT; s++) {
        const a = ((s + 0.5) / SECT) * TAU;
        const ex = p.x + Math.cos(a) * 220, ey = p.y + Math.sin(a) * 220;
        const wall = ex < 60 || ey < 60 || ex > g.world.w - 60 || ey > g.world.h - 60 ? 3 : 0;
        const score = danger[s] + wall - Math.cos(a - goalA) * 0.35;
        if (score < bestScore) { bestScore = score; bestA = a; }
      }
      const k = Math.min(2.5, 0.6 + total * 0.8);
      mx += Math.cos(bestA) * k; my += Math.sin(bestA) * k;
    }
  }
  // Geschossen seitlich ausweichen (nur solchen, die auf dich zufliegen und nah sind)
  if (opts.evade !== false) for (const b of g.eBullets) {
    const dx = p.x - b.x, dy = p.y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 240 * 240) continue;
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const along = (dx * b.vx + dy * b.vy) / sp;
    if (along <= 0) continue;
    const side = (dx * -b.vy + dy * b.vx) / sp; // Abstand quer zur Flugbahn
    if (Math.abs(side) > p.r + b.r + 18) continue;
    const s = side >= 0 ? 1 : -1;
    mx += (-b.vy / sp) * s * 2.2; my += (b.vx / sp) * s * 2.2;
  }
  for (const h of g.hazards) {
    if (h.friendly || h.shape !== "circle") continue;
    if (dist2(p.x, p.y, h.x, h.y) < (h.r + 30) * (h.r + 30)) { const a = Math.atan2(p.y - h.y, p.x - h.x); mx += Math.cos(a) * 3; my += Math.sin(a) * 3; }
  }
  if (Math.abs(mx) > 0.2) { held.right = mx > 0; held.left = mx < 0; }
  if (Math.abs(my) > 0.2) { held.down = my > 0; held.up = my < 0; }
  if (p.hp < p.stats.maxHp * 0.4) held.utility = true;
  return { held, pressed, aimX, aimY };
}
