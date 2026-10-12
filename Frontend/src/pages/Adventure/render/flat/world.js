// render/flat/world.js — Boden, Hindernisse, Kisten, Schreine, Teleporter, Aufsammelbares und Geschosse im flachen Stil.
// Alles mit dem Ursprung am Boden (Hindernisse/Objekte) bzw. in der Mitte (Geschosse); keine Bilddateien.

import { circle, ell, rrect, poly, line, curve, twoTone, TAU } from "./draw.js";

// ── Böden: ruhige Zweiton-Fliesen + wenige Details, als Kachel für ein Muster ──────────────────
export const FLOORS = {
  dungeon: { a: "#2b2733", b: "#302b39", detail: "dungeon", outside: "#121016" },
  cave: { a: "#1e2a35", b: "#22303c", detail: "cave", outside: "#0c1218" },
  desert: { a: "#c8a46a", b: "#cfad74", detail: "desert", outside: "#3a2c18" },
  ice: { a: "#cfe3ee", b: "#d8eaf3", detail: "ice", outside: "#2a3a48" },
  lava: { a: "#2a1614", b: "#311a17", detail: "lava", outside: "#120807" },
  storm: { a: "#1c1a2e", b: "#221f36", detail: "storm", outside: "#0a0912" },
};

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Eine 480 × 480-Kachel (4 × 4 Fliesen à 120) — wird als Muster wiederholt
export function makeFloorTile(biomeId) {
  const f = FLOORS[biomeId] || FLOORS.dungeon;
  const cv = document.createElement("canvas");
  cv.width = 480; cv.height = 480;
  const c = cv.getContext("2d");
  c.fillStyle = f.a; c.fillRect(0, 0, 480, 480);
  c.fillStyle = f.b;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) c.fillRect(x * 120, y * 120, 120, 120);
  const r = rng(biomeId.length * 7919);
  const at = () => [r() * 480, r() * 480];
  switch (f.detail) {
    case "dungeon":
      for (let i = 0; i < 6; i++) { const [x, y] = at(); line(c, x, y, x + 14, y + 6, 2, "#24202b"); line(c, x + 14, y + 6, x + 20, y + 18, 2, "#24202b"); }
      for (let i = 0; i < 10; i++) { const [x, y] = at(); circle(c, x, y, 3 + r() * 3, "#36423a"); }
      break;
    case "cave":
      for (let i = 0; i < 7; i++) { const [x, y] = at(); poly(c, [x, y, x + 4, y - 10, x + 8, y], "#2f4f63"); }
      for (let i = 0; i < 12; i++) { const [x, y] = at(); circle(c, x, y, 2 + r() * 2, "#2a3a48"); }
      break;
    case "desert":
      for (let i = 0; i < 8; i++) { const [x, y] = at(); curve(c, x, y, x + 20, y - 8, x + 40, y, 3, "#bb965c"); }
      for (let i = 0; i < 10; i++) { const [x, y] = at(); circle(c, x, y, 2 + r() * 2, "#b08b55"); }
      break;
    case "ice":
      for (let i = 0; i < 5; i++) { const [x, y] = at(); line(c, x, y, x + 18, y + 10, 2, "#b8d4e2"); line(c, x + 18, y + 10, x + 26, y + 4, 2, "#b8d4e2"); }
      for (let i = 0; i < 14; i++) { const [x, y] = at(); circle(c, x, y, 2, "#ffffff"); }
      break;
    case "lava":
      // Glutrisse: unregelmäßige Zickzacklinien, jeder anders gedreht
      for (let i = 0; i < 6; i++) {
        const [x, y] = at();
        const a = r() * Math.PI;
        c.save(); c.translate(x, y); c.rotate(a);
        c.strokeStyle = "#a8401f"; c.lineWidth = 3; c.lineJoin = "round"; c.lineCap = "round";
        c.beginPath(); c.moveTo(-22, 0); c.lineTo(-10, -5); c.lineTo(0, 3); c.lineTo(12, -3); c.lineTo(22, 2); c.stroke();
        circle(c, 0, 3, 2.5, "#ff7a2e");
        c.restore();
      }
      for (let i = 0; i < 10; i++) { const [x, y] = at(); circle(c, x, y, 2, "#4a2420"); }
      break;
    case "storm":
      for (let i = 0; i < 4; i++) { const [x, y] = at(); c.strokeStyle = "#2c2848"; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 14, 0, TAU); c.stroke(); line(c, x - 8, y, x + 8, y, 3, "#2c2848"); }
      break;
    default: break;
  }
  return cv;
}

// ── Hindernisse (sprite-Schlüssel aus data/biomes.js), Ursprung = Mitte des Kollisionskreises ───
const ROCK = { dungeon: ["#4a4452", "#5c5566"], cave: ["#3b5566", "#4d6e82"], desert: ["#9b7a48", "#b08b55"], ice: ["#8fb3c7", "#a6c6d8"], lava: ["#4a2a24", "#5e352d"], storm: ["#3a3550", "#4a4466"] };

function rockShape(c, r, col, seed) {
  c.fillStyle = col;
  c.beginPath();
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; const rr = r * (0.82 + (((i + seed) * 37) % 10) / 45); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.78); }
  c.closePath(); c.fill();
}

export function drawObstacle(c, o, biomeId) {
  const r = o.r;
  const seed = Math.round(o.x + o.y) % 7;
  c.save(); c.translate(o.x, o.y);
  ell(c, 0, r * 0.55, r * 1.05, r * 0.32, "rgba(0,0,0,0.22)");
  const rock = ROCK[biomeId] || ROCK.dungeon;
  switch (o.sprite) {
    case "pillar":
      rrect(c, -r * 0.75, r * 0.1, r * 1.5, r * 0.45, 4, "#4a4452");
      twoTone(c, (c) => c.roundRect(-r * 0.5, -r * 2.1, r, r * 2.3, 6), "#6b6378", "#57506a", -r * 0.4);
      rrect(c, -r * 0.75, -r * 2.3, r * 1.5, r * 0.4, 4, "#7a7288");
      break;
    case "tree": // Riesenpilz im Verlies
      rrect(c, -r * 0.22, -r * 1.1, r * 0.44, r * 1.4, 6, "#e8dcc4");
      twoTone(c, (c) => c.ellipse(0, -r * 1.15, r * 1.05, r * 0.62, 0, Math.PI, 0), "#8a4dc2", "#6a35a0", -r * 1.3);
      rrect(c, -r * 1.05, -r * 1.2, r * 2.1, r * 0.18, 4, "#6a35a0");
      for (const [x, y, s] of [[-0.45, -1.45, 0.14], [0.2, -1.6, 0.12], [0.55, -1.3, 0.1]]) circle(c, x * r, y * r, s * r, "#efe6d2");
      break;
    case "stone1": case "stone2": { // Kristalle in der Höhle
      const col = o.sprite === "stone1" ? ["#5ec8ff", "#3f98d0"] : ["#a07bff", "#7a55d8"];
      rockShape(c, r * 0.8, rock[0], seed);
      for (const [x, h, w] of [[-0.35, 1.5, 0.3], [0.1, 2.0, 0.34], [0.45, 1.2, 0.26]]) {
        twoTone(c, (c) => { c.moveTo(x * r - w * r, 0); c.lineTo(x * r - w * r * 0.6, -h * r * 0.8); c.lineTo(x * r, -h * r); c.lineTo(x * r + w * r * 0.6, -h * r * 0.8); c.lineTo(x * r + w * r, 0); c.closePath(); }, col[0], col[1], -h * r * 0.45);
      }
      break;
    }
    case "cactus":
      twoTone(c, (c) => c.roundRect(-r * 0.32, -r * 2.2, r * 0.64, r * 2.4, r * 0.32), "#5d9a4a", "#4a7d3a", -r);
      rrect(c, -r * 0.95, -r * 1.5, r * 0.38, r * 0.9, r * 0.19, "#5d9a4a"); rrect(c, -r * 0.95, -r * 0.8, r * 0.8, r * 0.3, r * 0.15, "#5d9a4a");
      rrect(c, r * 0.55, -r * 1.8, r * 0.38, r * 0.8, r * 0.19, "#4a7d3a"); rrect(c, r * 0.2, -r * 1.2, r * 0.7, r * 0.3, r * 0.15, "#4a7d3a");
      break;
    case "cactus2":
      twoTone(c, (c) => c.ellipse(0, -r * 0.6, r * 0.8, r * 0.8, 0, 0, TAU), "#6aa858", "#4f8a42", -r * 0.4);
      for (let i = -2; i <= 2; i++) line(c, i * r * 0.28, -r * 1.25, i * r * 0.3, -r * 0.05, 2, "#4f8a42");
      circle(c, 0, -r * 1.4, r * 0.22, "#ff7aa0");
      break;
    case "cactus3":
      twoTone(c, (c) => c.ellipse(0, -r * 0.7, r * 0.55, r * 0.9, 0, 0, TAU), "#5d9a4a", "#4a7d3a", -r * 0.5);
      twoTone(c, (c) => c.ellipse(r * 0.55, -r * 1.25, r * 0.38, r * 0.5, 0.5, 0, TAU), "#6aa858", "#4f8a42", -r * 1.1);
      circle(c, -r * 0.1, -r * 1.6, r * 0.16, "#f5cf4a");
      break;
    case "icespikes":
      for (const [x, h, w] of [[-0.45, 1.3, 0.32], [0.05, 1.9, 0.36], [0.5, 1.1, 0.28]]) {
        twoTone(c, (c) => { c.moveTo(x * r - w * r, r * 0.2); c.lineTo(x * r, -h * r); c.lineTo(x * r + w * r, r * 0.2); c.closePath(); }, "#e6f6ff", "#a8d8f0", -h * r * 0.35);
      }
      break;
    case "icebarrel": // verschneite Tanne
      rrect(c, -r * 0.15, -r * 0.4, r * 0.3, r * 0.6, 3, "#6b4a2b");
      for (const [y, w] of [[-0.3, 1.0], [-1.0, 0.8], [-1.6, 0.55]]) {
        poly(c, [-w * r, y * r, 0, (y - 0.9) * r, w * r, y * r], "#3f7a5a");
        poly(c, [-w * r * 0.55, (y - 0.4) * r, 0, (y - 0.9) * r, w * r * 0.55, (y - 0.4) * r], "#f4f8fb");
      }
      break;
    case "vulkan": case "vulkan2":
      rockShape(c, r, rock[0], seed);
      c.save(); c.translate(0, -r * 0.15); rockShape(c, r * 0.65, rock[1], seed + 2); c.restore();
      c.strokeStyle = "#ff7a2e"; c.lineWidth = 3; c.lineJoin = "round"; c.lineCap = "round";
      c.beginPath(); c.moveTo(-r * 0.5, -r * 0.05); c.lineTo(-r * 0.2, r * 0.08); c.lineTo(r * 0.05, -r * 0.12); c.lineTo(r * 0.4, r * 0.05); c.stroke();
      if (o.sprite === "vulkan") { ell(c, 0, -r * 0.3, r * 0.3, r * 0.12, "#ffb04a"); }
      break;
    default: // rock
      rockShape(c, r, rock[0], seed);
      c.save(); c.translate(-r * 0.15, -r * 0.2); rockShape(c, r * 0.55, rock[1], seed + 3); c.restore();
      break;
  }
  c.restore();
}

// ── Kisten, Schreine, Teleporter ─────────────────────────────────────────
const SHRINE_GEM = { luckShrine: "#86d05f", combatShrine: "#d9473a", healShrine: "#5ec8ff", fateShrine: "#f5cf4a", curseShrine: "#a07bff", diceShrine: "#ffffff" };

export function drawInteractable(c, o, time) {
  c.save(); c.translate(o.x, o.y);
  if (o.used) c.globalAlpha *= 0.4;
  ell(c, 0, 14, 32, 9, "rgba(0,0,0,0.25)");
  if (o.type === "chest" || o.type === "bigChest" || o.type === "equipChest") {
    const s = o.type === "bigChest" ? 1.35 : 1;
    const band = o.type === "bigChest" ? "#86d05f" : o.type === "equipChest" ? "#f0a33c" : "#f5cf4a";
    c.scale(s, s);
    twoTone(c, (c) => c.roundRect(-26, -26, 52, 38, 7), "#8a5a3a", "#6b4428", -4);
    rrect(c, -26, -14, 52, 7, 2, band);
    rrect(c, -6, -20, 12, 16, 3, band);
    circle(c, 0, -11, 2.5, "#3d2a1a");
  } else if (o.type === "sacrificeAltar") {
    twoTone(c, (c) => c.roundRect(-30, -30, 60, 40, 6), "#5a4452", "#45343f", -10);
    rrect(c, -36, -36, 72, 10, 4, "#6b5262");
    ell(c, 0, -38, 16, 6, "#3a1018");
    ell(c, 0, -38, 12, 4, "#d9473a");
  } else {
    const gem = SHRINE_GEM[o.type] || "#ffffff";
    twoTone(c, (c) => { c.moveTo(-18, 10); c.lineTo(-12, -80); c.lineTo(12, -80); c.lineTo(18, 10); c.closePath(); }, "#6b6378", "#57506a", -30);
    rrect(c, -22, 2, 44, 10, 4, "#4a4452");
    const glow = o.used ? 0.3 : 0.65 + Math.sin(time * 3 + o.x) * 0.3;
    c.globalAlpha *= glow;
    poly(c, [0, -72, 9, -58, 0, -44, -9, -58], gem);
    c.globalAlpha /= glow;
  }
  c.restore();
}

export function drawTeleporter(c, t, time) {
  c.save(); c.translate(t.x, t.y);
  ell(c, 0, 46, 70, 18, "rgba(0,0,0,0.3)");
  const col = t.state === "ready" ? "#86d05f" : t.state === "charging" ? "#d9473a" : "#8a8396";
  // Steinbogen
  twoTone(c, (c) => { c.moveTo(-60, 50); c.lineTo(-60, -40); c.arc(0, -40, 60, Math.PI, 0); c.lineTo(60, 50); c.lineTo(38, 50); c.lineTo(38, -40); c.arc(0, -40, 38, 0, Math.PI, true); c.lineTo(-38, 50); c.closePath(); }, "#6b6378", "#57506a", 0);
  // Wirbel im Tor
  c.save();
  c.beginPath(); c.moveTo(-38, 50); c.lineTo(-38, -40); c.arc(0, -40, 38, Math.PI, 0); c.lineTo(38, 50); c.closePath(); c.clip();
  c.fillStyle = "#1a1622"; c.fillRect(-40, -80, 80, 140);
  const spin = time * (t.state === "idle" ? 0.6 : 2.4);
  for (let i = 0; i < 3; i++) {
    c.strokeStyle = col; c.globalAlpha = 0.35 + i * 0.2; c.lineWidth = 6;
    c.beginPath(); c.arc(0, 0, 12 + i * 12, spin + i, spin + i + Math.PI * 1.2); c.stroke();
  }
  c.restore();
  circle(c, 0, -92, 7, col);
  c.restore();
}

// ── Aufsammelbares ───────────────────────────────────────────────────────
export function drawCoin(c, x, y, size) {
  circle(c, x, y, size / 2, "#f5cf4a");
  circle(c, x, y, size / 2 - 3, "#e0b030");
  rrect(c, x - 1.5, y - size / 4, 3, size / 2, 1.5, "#fff3a0");
}

export function drawHealOrb(c, x, y) {
  circle(c, x, y, 9, "#7be06b");
  rrect(c, x - 1.8, y - 5, 3.6, 10, 1.5, "#ffffff");
  rrect(c, x - 5, y - 1.8, 10, 3.6, 1.5, "#ffffff");
}

// ── Geschosse (sprite-Schlüssel wie bisher), Ursprung = Mitte, zeigt nach rechts ───────────────
export function drawProjectile(c, key, x, y, angle, size, time) {
  const s = size / 20;
  c.save(); c.translate(x, y); c.rotate(angle); c.scale(s, s);
  switch (key) {
    case "proj_arrow": line(c, -14, 0, 8, 0, 3, "#8a5a3a"); poly(c, [8, -5, 16, 0, 8, 5], "#c9c3d1"); poly(c, [-14, 0, -18, -4, -10, 0, -18, 4], "#efe6d2"); break;
    case "proj_fireball": case "fire": ell(c, -6, 0, 12, 6, "#ff7a2e"); circle(c, 2, 0, 8, "#ff9a3c"); circle(c, 3, -1, 4, "#ffe14d"); break;
    case "proj_laser": rrect(c, -12, -3.5, 24, 7, 3.5, "#5ee0ff"); rrect(c, -8, -1.5, 16, 3, 1.5, "#d8fbff"); break;
    case "proj_shuriken": c.rotate(time * 18); poly(c, [0, -10, 3, -3, 10, 0, 3, 3, 0, 10, -3, 3, -10, 0, -3, -3], "#c9c3d1"); circle(c, 0, 0, 2.5, "#4a4552"); break;
    case "proj_poisonball": circle(c, 0, 0, 8, "#7fd35c"); circle(c, -2, -2, 3, "#d8ffc0"); break;
    case "proj_iceball": poly(c, [-9, 0, 0, -8, 9, 0, 0, 8], "#bfe9ff"); poly(c, [-4, 0, 0, -4, 4, 0, 0, 4], "#ffffff"); break;
    case "proj_sand": case "proj_spike": poly(c, [-10, -5, 12, 0, -10, 5], "#d8b070"); break;
    case "proj_block": c.rotate(time * 10); rrect(c, -7, -7, 14, 14, 3, "#a87443"); rrect(c, -7, -7, 14, 5, 2, "#c99460"); break;
    case "proj_grenade": circle(c, 0, 0, 8, "#4a5240"); rrect(c, -2, -11, 4, 5, 1, "#8a8396"); circle(c, 0, -12, 2 + Math.sin(time * 30), "#ffcc4a"); break;
    case "proj_web": circle(c, 0, 0, 9, "#efe6d2"); line(c, -7, -7, 7, 7, 1.5, "#b8b0a0"); line(c, -7, 7, 7, -7, 1.5, "#b8b0a0"); line(c, -9, 0, 9, 0, 1.5, "#b8b0a0"); break;
    case "electric_ball": circle(c, 0, 0, 9, "#ffe14d"); poly(c, [-3, -7, 3, -1, -1, 0, 4, 7, -3, 1, 1, 0], "#ffffff"); break;
    case "proj_feather": ell(c, 0, 0, 12, 4, "#efe6d2"); line(c, -12, 0, 10, 0, 1.5, "#b8b0a0"); break;
    case "proj_curse": circle(c, 0, 0, 10, "#f5cf4a"); ell(c, 0, 0, 7, 4.5, "#ffffff"); circle(c, 1, 0, 3, "#3f7fd6"); break;
    default: rrect(c, -9, -4, 18, 8, 4, "#fff3a0"); break; // proj_basic
  }
  c.restore();
}

// Kleine Flamme über brennenden Figuren, Eisblock über gefrorenen
export function drawBurn(c, x, y, s, time) {
  const f = Math.sin(time * 20 + x) * 0.15;
  poly(c, [x - 5 * s, y, x - 1 * s, y - (12 + f * 8) * s, x + 5 * s, y], "#ff7a2e");
  poly(c, [x - 2.5 * s, y, x, y - 6 * s, x + 2.5 * s, y], "#ffd84a");
}

export function drawIceBlock(c, x, y, w, h) {
  c.save(); c.globalAlpha *= 0.6;
  rrect(c, x - w / 2, y - h, w, h, 6, "#bfe9ff");
  c.globalAlpha /= 0.6; c.globalAlpha *= 0.8;
  poly(c, [x - w / 2 + 4, y - h + 6, x - w / 2 + 14, y - h + 6, x - w / 2 + 4, y - h + 18], "#ffffff");
  c.restore();
}
