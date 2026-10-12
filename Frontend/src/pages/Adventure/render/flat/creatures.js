// render/flat/creatures.js — alle Gegner und Bosse im flachen Stil. Jede Figur ist eine Funktion (c, p):
//   p.t    Animationszeit (pro Figur versetzt, damit Gruppen nicht im Gleichschritt wippen)
//   p.move läuft gerade · p.atk Angriff 0…1 (sonst −1) · p.pal Farben überschreiben (Bosse) · p.pose Boss-Pose
// Koordinaten: Füße bei (0, 0), Figur schaut nach rechts, etwa 100 Einheiten hoch (siehe draw.js).

import { circle, ell, rrect, poly, line, curve, twoTone, eyes, bob, step, strike, crown, TAU } from "./draw.js";

const BONE = "#ece4cf", BONE_D = "#c4b99c", HOLE = "#2a2230";

function legs(c, x, top, len, gap, w, col, s) {
  line(c, x - gap / 2, top, x - gap / 2 + s * 7, top + len, w, col);
  line(c, x + gap / 2, top, x + gap / 2 - s * 7, top + len, w, col);
}

// ── Schleim ───────────────────────────────────────────────────────────────
function slime(c, p) {
  const pal = { body: "#7fd35c", dark: "#55a83e", ...p.pal };
  let sq = p.move ? Math.abs(Math.sin(p.t * 9)) : (Math.sin(p.t * 3) + 1) * 0.15;
  if (p.pose === "charge1" || p.pose === "charge2") sq = 0.9;
  if (p.pose === "slam") sq = -0.35;
  const sx = 1 + sq * 0.14, sy = 1 - sq * 0.16;
  c.save(); c.scale(sx, sy);
  twoTone(c, (c) => { c.moveTo(-44, 0); c.bezierCurveTo(-48, -50, -22, -66, 0, -66); c.bezierCurveTo(22, -66, 48, -50, 44, 0); c.closePath(); }, pal.body, pal.dark, -16);
  ell(c, -18, -46, 10, 6, "rgba(255,255,255,0.55)", -0.5);
  circle(c, -26, -38, 3, "rgba(255,255,255,0.55)");
  eyes(c, 8, -34, 7.5, 24, { look: 0.4 });
  c.fillStyle = "#1a1622"; c.beginPath(); c.arc(10, -20, 6, 0.1, Math.PI - 0.1); c.fill();
  c.restore();
  if (p.boss) crown(c, 0, -66 * sy - 2, 40);
}

// ── Goblin ────────────────────────────────────────────────────────────────
function goblin(c, p) {
  const b = bob(p, 6), s = step(p, 13), a = strike(p);
  legs(c, 0, -22, 22, 14, 8, "#3d5a2a", s);
  c.save(); c.translate(0, b);
  rrect(c, -16, -46, 32, 28, 10, "#8a5a3a");
  rrect(c, -16, -26, 32, 6, 3, "#5e3c24");
  // Ohren, Kopf
  poly(c, [-18, -66, -42, -76, -20, -56], "#6fae4a");
  poly(c, [16, -66, 38, -80, 20, -56], "#6fae4a");
  twoTone(c, (c) => c.arc(0, -62, 22, 0, TAU), "#7cc152", "#5d9a3a", -52);
  ell(c, 18, -58, 6, 4.5, "#5d9a3a");
  eyes(c, 6, -66, 6, 18, { white: "#ffe14d", pupil: "#1a1622", look: 0.45 });
  line(c, 2, -50, 12, -50, 2.5, "#2a3a1a");
  // Dolch
  c.save(); c.translate(18 + a * 14, -34); c.rotate(-0.3 + a * 0.5);
  rrect(c, -4, -3, 8, 10, 2, "#5e3c24"); poly(c, [-3, -3, 3, -3, 1, -26, -1, -26], "#d8d8e0");
  c.restore();
  c.restore();
}

// ── Skelette ──────────────────────────────────────────────────────────────
function skeletonBody(c, p, pal) {
  const b = bob(p, 4), s = step(p, 12);
  legs(c, 0, -34, 34, 12, 5, pal.bone, s);
  c.save(); c.translate(0, b);
  rrect(c, -9, -40, 18, 8, 3, pal.dark); // Becken
  line(c, 0, -40, 0, -52, 5, pal.bone);
  rrect(c, -16, -70, 32, 22, 8, pal.bone);
  for (let i = 0; i < 3; i++) rrect(c, -12, -66 + i * 6, 24, 3, 1.5, pal.dark);
  twoTone(c, (c) => c.arc(0, -86, 17, 0, TAU), pal.bone, pal.dark, -78);
  rrect(c, -9, -76, 20, 9, 3, pal.bone);
  for (let i = 0; i < 4; i++) rrect(c, -6 + i * 5, -72, 2, 5, 1, pal.dark);
  eyes(c, 5, -88, 5.5, 15, { glow: HOLE });
  circle(c, -1.5, -88, 1.8, pal.eye); circle(c, 13.5, -88, 1.8, pal.eye);
  c.restore();
  return b;
}

function skeleton(c, p) {
  const pal = { bone: BONE, dark: BONE_D, eye: "#ff5a4a", ...p.pal };
  const b = skeletonBody(c, p, pal);
  const a = strike(p);
  c.save(); c.translate(0, b);
  line(c, 8, -64, 24, -56, 5, pal.bone);
  // Bogen mit Sehne
  c.strokeStyle = "#8a5a3a"; c.lineWidth = 5; c.lineCap = "round";
  c.beginPath(); c.arc(16, -56, 28, -1.2, 1.2); c.stroke();
  line(c, 16 + Math.cos(-1.2) * 28, -56 + Math.sin(-1.2) * 28, 16 + Math.cos(1.2) * 28 - a * 10, -56 + Math.sin(1.2) * 28, 1.5, "#ece4cf");
  c.restore();
}

function skeletonwarrior(c, p) {
  const pal = { bone: BONE, dark: BONE_D, eye: "#ff5a4a", ...p.pal };
  const b = skeletonBody(c, p, pal);
  const a = strike(p);
  c.save(); c.translate(0, b);
  circle(c, -16, -56, 13, pal.shield || "#7a5a3a"); circle(c, -16, -56, 5, "#c9a06b");
  c.save(); c.translate(14, -58); c.rotate(-0.9 + a * 1.6);
  rrect(c, -3, -2, 6, 12, 2, "#5e3c24"); rrect(c, -8, -4, 16, 4, 2, "#8a8396"); poly(c, [-3, -4, 3, -4, 2, -36, 0, -42, -2, -36], "#dcdce6");
  c.restore();
  c.restore();
}

// ── Ork, Troll ────────────────────────────────────────────────────────────
function brute(c, p, pal) {
  const b = bob(p, 4, 8), s = step(p, 8), a = strike(p);
  legs(c, 0, -30, 30, 26, 14, pal.pants, s);
  c.save(); c.translate(0, b);
  twoTone(c, (c) => c.roundRect(-34, -84, 68, 58, 22), pal.skin, pal.dark, -46);
  rrect(c, -34, -36, 68, 10, 4, pal.belt);
  // Kopf
  twoTone(c, (c) => c.arc(8, -86, 19, 0, TAU), pal.skin, pal.dark, -80);
  eyes(c, 14, -90, 4.5, 13, { white: pal.eye || "#ffffff", look: 0.5 });
  if (pal.tusks) { poly(c, [12, -76, 16, -76, 14, -84], "#fff8e8"); poly(c, [22, -76, 26, -76, 24, -84], "#fff8e8"); }
  if (pal.helmet) twoTone(c, (c) => c.arc(8, -92, 20, Math.PI, 0), pal.helmet, "#5a5464", -96);
  if (pal.horns) { curve(c, -6, -98, -22, -112, -26, -96, 6, pal.horns); curve(c, 20, -98, 36, -112, 40, -96, 6, pal.horns); }
  // Waffe (Axt/Keule), holt beim Angriff aus
  c.save(); c.translate(30, -62); c.rotate(-1.4 + a * 2.2);
  rrect(c, -4, -6, 8, 52, 4, "#6b4a2b");
  if (pal.club) rrect(c, -10, 30, 20, 30, 9, "#8a5a3a");
  else twoTone(c, (c) => { c.moveTo(4, 30); c.quadraticCurveTo(30, 34, 26, 58); c.quadraticCurveTo(14, 46, 4, 48); c.closePath(); }, "#c9c3d1", "#8a8396", 46);
  c.restore();
  circle(c, 30, -56, 8, pal.dark);
  c.restore();
}
const orc = (c, p) => brute(c, p, { skin: "#6fae4a", dark: "#4f8a32", pants: "#5e3c24", belt: "#3d2a1a", tusks: true, helmet: "#8a8396", ...p.pal });
const troll = (c, p) => brute(c, p, { skin: "#7e95a8", dark: "#5c7184", pants: "#4a3a2a", belt: "#2e2a24", club: true, eye: "#ffe14d", ...p.pal });
function minotaur(c, p) {
  brute(c, p, { skin: "#9a5a3a", dark: "#76432b", pants: "#3d2a1a", belt: "#2a1c12", horns: p.boss ? "#f5cf4a" : "#ece4cf", eye: "#ff5a4a", ...p.pal });
  if (p.boss) crown(c, 8 , -112 + bob(p, 4, 8), 30);
}

// ── Nekromant, Schamane, Feuermagier (Roben) ──────────────────────────────
function robe(c, p, pal) {
  const hover = Math.sin(p.t * 3) * 3 - 4;
  const a = strike(p);
  c.save(); c.translate(0, hover);
  twoTone(c, (c) => { c.moveTo(-30, 0); c.lineTo(-18, -66); c.quadraticCurveTo(0, -74, 18, -66); c.lineTo(30, 0); c.quadraticCurveTo(0, 6, -30, 0); }, pal.robe, pal.dark, -26);
  rrect(c, -20, -40, 40, 6, 3, pal.trim);
  // Stab
  line(c, 26, -10, 30 + a * 8, -96, 5, "#6b4a2b");
  circle(c, 30 + a * 8, -100, 8 + a * 3, pal.orb);
  circle(c, 28 + a * 8, -102, 3, "rgba(255,255,255,0.7)");
  circle(c, 24, -50, 7, pal.dark); // Hand
  // Kopf
  if (pal.hat) poly(c, [-22, -70, 22, -70, 6, -112, -2, -104], pal.hat);
  if (pal.mask) {
    ell(c, 2, -80, 16, 20, pal.mask);
    rrect(c, -6, -84, 6, 3, 1, "#ffffff"); rrect(c, 6, -84, 6, 3, 1, "#ffffff"); rrect(c, -2, -72, 10, 3, 1, "#d9473a");
    for (let i = 0; i < 5; i++) poly(c, [-14 + i * 7, -96, -10 + i * 7, -118 + (i % 2) * 8, -6 + i * 7, -96], ["#d9473a", "#f5cf4a", "#5ec8ff", "#f5cf4a", "#d9473a"][i]);
  } else {
    twoTone(c, (c) => c.arc(0, -78, 20, 0, TAU), pal.hood, pal.dark, -70);
    ell(c, 5, -76, 12, 11, "#1a1622");
    eyes(c, 6, -78, 3.2, 10, { glow: pal.eye });
    if (pal.beard) poly(c, [-4, -68, 16, -68, 6, -48], "#efe6d2");
  }
  c.restore();
  if (p.boss) crown(c, 0, -102 + hover, 32);
}
const nekromant = (c, p) => robe(c, p, { robe: "#5a3a8a", dark: "#3e2766", hood: "#4a2f75", trim: "#9be05a", orb: "#9be05a", eye: "#9be05a", ...p.pal });
const shaman = (c, p) => robe(c, p, { robe: "#5d8a4d", dark: "#3f6633", trim: "#f5cf4a", orb: "#86d05f", mask: "#a87443", ...p.pal });
const firewizard = (c, p) => robe(c, p, { robe: "#c4402f", dark: "#8e2a1f", hood: "#a33526", trim: "#f5cf4a", orb: "#ffb04a", eye: "#ffe14d", hat: "#8e2a1f", beard: true, ...p.pal });

// ── Spinne ────────────────────────────────────────────────────────────────
function spider(c, p) {
  const pal = { body: "#3b3346", dark: "#2a2433", mark: "#d9473a", eye: "#ff5a4a", ...p.pal };
  const s = p.move ? p.t * 14 : 0;
  const lift = p.pose === "attack" ? -6 : 0;
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < 4; i++) {
      const ph = Math.sin(s + i * 1.6 + side * 0.8) * 5;
      const x0 = -8 + i * 10, kx = -30 + i * 22 + ph, ky = side ? -46 : -40;
      const fx = -40 + i * 26 + ph * 1.5;
      c.strokeStyle = side ? pal.dark : pal.body; c.lineWidth = 6; c.lineCap = "round"; c.lineJoin = "round";
      c.beginPath(); c.moveTo(x0, -26); c.lineTo(kx, ky); c.lineTo(fx, 0); c.stroke();
    }
  }
  c.save(); c.translate(0, lift + (p.move ? Math.sin(p.t * 14) * 1.5 : 0));
  twoTone(c, (c) => c.ellipse(-10, -30, 30, 22, 0, 0, TAU), pal.body, pal.dark, -24);
  poly(c, [-14, -40, -6, -40, -10, -32], pal.mark); poly(c, [-14, -24, -6, -24, -10, -32], pal.mark);
  circle(c, 22, -28, 13, pal.body);
  for (const [x, y, r] of [[26, -32, 3.5], [32, -30, 3.5], [24, -25, 2.5], [31, -24, 2.5]]) circle(c, x, y, r, pal.eye);
  line(c, 30, -18, 34, -12, 3, BONE); line(c, 24, -18, 26, -12, 3, BONE);
  c.restore();
  if (p.boss) crown(c, 20, -42 + lift, 24);
}

// ── Mumie ─────────────────────────────────────────────────────────────────
function mummy(c, p) {
  const b = bob(p, 4, 9), s = step(p, 9), a = strike(p);
  legs(c, 0, -30, 30, 14, 10, "#b5a581", s);
  c.save(); c.translate(0, b);
  // ausgestreckte Arme (wie ein Zombie)
  line(c, 4, -58, 36 + a * 8, -60, 9, "#cdbf9b");
  twoTone(c, (c) => c.roundRect(-16, -66, 32, 40, 12), "#ddd0ac", "#b5a581", -40);
  for (let i = 0; i < 4; i++) line(c, -14, -60 + i * 9, 14, -56 + i * 9, 2.5, "#b5a581");
  twoTone(c, (c) => c.arc(0, -80, 17, 0, TAU), "#ddd0ac", "#b5a581", -74);
  line(c, -15, -84, 15, -88, 3, "#b5a581"); line(c, -15, -74, 15, -78, 3, "#b5a581");
  circle(c, 8, -81, 4.5, "#ffe14d"); circle(c, -3, -80, 3.5, "#3a3020");
  line(c, 8, -58, 38 + a * 8, -54, 9, "#ddd0ac");
  c.restore();
}

// ── Skorpion ──────────────────────────────────────────────────────────────
function scorpion(c, p) {
  const pal = { body: "#e0883a", dark: "#b8612a", ...p.pal };
  const a = strike(p), s = p.move ? Math.sin(p.t * 16) * 4 : 0;
  for (let i = 0; i < 3; i++) { line(c, -18 + i * 12, -14, -26 + i * 12 + s, 0, 4, pal.dark); line(c, -14 + i * 12, -14, -6 + i * 12 - s, 0, 4, pal.dark); }
  // Schwanz bogenförmig über den Rücken
  const segs = [[-26, -20], [-36, -36], [-34, -54], [-22, -66], [-6 + a * 16, -66 + a * 12]];
  segs.forEach(([x, y], i) => circle(c, x, y, 9 - i * 0.8, i % 2 ? pal.dark : pal.body));
  poly(c, [-6 + a * 16, -72 + a * 12, 6 + a * 18, -62 + a * 14, -4 + a * 16, -58 + a * 12], "#2a2230");
  twoTone(c, (c) => c.ellipse(0, -20, 28, 14, 0, 0, TAU), pal.body, pal.dark, -16);
  // Scheren
  for (const dy of [-6, 6]) {
    line(c, 20, -20 + dy, 34, -24 + dy, 5, pal.dark);
    poly(c, [32, -30 + dy, 48, -32 + dy, 44, -24 + dy, 48, -18 + dy, 34, -20 + dy], pal.body);
  }
  eyes(c, 20, -28, 3.2, 8, { look: 0.5 });
}

// ── Golem ─────────────────────────────────────────────────────────────────
function golem(c, p) {
  const pal = { body: "#8a8178", dark: "#6b635b", rune: "#5ec8ff", ...p.pal };
  const b = bob(p, 3, 7), s = step(p, 7), a = strike(p);
  rrect(c, -26 + s * 4, -30, 18, 30, 5, pal.dark);
  rrect(c, 8 - s * 4, -30, 18, 30, 5, pal.dark);
  c.save(); c.translate(0, b);
  twoTone(c, (c) => c.roundRect(-32, -82, 64, 56, 10), pal.body, pal.dark, -46);
  rrect(c, -14, -100, 30, 22, 6, pal.body);
  eyes(c, 3, -90, 3.5, 12, { glow: pal.rune });
  poly(c, [0, -70, 8, -60, 0, -50, -8, -60], pal.rune);
  rrect(c, -46, -78 + a * 6, 16, 44, 7, pal.dark);
  rrect(c, 30 + a * 10, -78 - a * 12, 16, 44, 7, pal.body);
  c.restore();
  if (p.boss) crown(c, 1, -100 + b, 34);
}

// ── Eiswelt ───────────────────────────────────────────────────────────────
function snowman(c, p) {
  const b = p.move ? -Math.abs(Math.sin(p.t * 10)) * 5 : 0, a = strike(p);
  c.save(); c.translate(0, b);
  twoTone(c, (c) => c.arc(0, -22, 24, 0, TAU), "#ffffff", "#d6e6f0", -12);
  twoTone(c, (c) => c.arc(0, -56, 18, 0, TAU), "#ffffff", "#d6e6f0", -48);
  twoTone(c, (c) => c.arc(0, -82, 14, 0, TAU), "#ffffff", "#d6e6f0", -76);
  rrect(c, -16, -70, 32, 7, 3, "#d9473a"); rrect(c, 4, -70, 7, 18, 3, "#b8302a");
  line(c, 14, -58, 34 + a * 6, -72 - a * 6, 3.5, "#6b4a2b"); line(c, -14, -58, -32, -70, 3.5, "#6b4a2b");
  poly(c, [10, -82, 26, -79, 10, -76], "#f0882a");
  circle(c, 2, -86, 2.6, "#1a1622"); circle(c, 10, -86, 2.6, "#1a1622");
  for (let i = 0; i < 3; i++) circle(c, 4, -60 + i * 8, 2.2, "#1a1622");
  c.restore();
}

function penguin(c, p) {
  const b = bob(p, 4, 14), w = p.move ? Math.sin(p.t * 14) * 0.15 : 0, a = strike(p);
  c.save(); c.translate(0, b); c.rotate(w + a * 0.5);
  ell(c, -8, -2, 9, 4, "#f0882a"); ell(c, 8, -2, 9, 4, "#f0882a");
  twoTone(c, (c) => c.ellipse(0, -36, 22, 34, 0, 0, TAU), "#2a2a3a", "#1c1c28", -20);
  ell(c, 5, -32, 14, 24, "#f4f4f8");
  ell(c, -18, -38, 6, 18, "#1c1c28", 0.3);
  eyes(c, 8, -54, 4, 12, { look: 0.5 });
  poly(c, [14, -50, 28, -47, 14, -44], "#f0a33c");
  twoTone(c, (c) => c.arc(2, -64, 18, Math.PI, 0), "#8a8396", "#6b6574", -68);
  poly(c, [-14, -66, -22, -82, -10, -70], "#efe6d2"); poly(c, [16, -66, 24, -82, 12, -70], "#efe6d2");
  c.restore();
}

function yeti(c, p) {
  const pal = { fur: "#f2f5f8", dark: "#c9d8e4", face: "#7fb2d6", ...p.pal };
  const b = bob(p, 4, 8), s = step(p, 8), a = strike(p);
  legs(c, 0, -26, 26, 26, 16, pal.dark, s);
  c.save(); c.translate(0, b);
  twoTone(c, (c) => { c.ellipse(0, -56, 36, 40, 0, 0, TAU); }, pal.fur, pal.dark, -36);
  ell(c, 12, -66, 18, 15, pal.face);
  eyes(c, 14, -70, 4.5, 14, { look: 0.5 });
  rrect(c, 6, -60, 16, 5, 2, "#1a1622"); poly(c, [8, -60, 11, -54, 14, -60], "#ffffff");
  line(c, 26, -56, 44 + a * 8, -30 - a * 22, 14, pal.fur);
  line(c, -28, -56, -40, -26, 14, pal.dark);
  if (p.boss) { poly(c, [-14, -90, -26, -116, -4, -94], "#9ad9ff"); poly(c, [22, -90, 34, -116, 14, -94], "#9ad9ff"); crown(c, 4, -96, 30); }
  c.restore();
}

function icespirit(c, p) {
  const h = Math.sin(p.t * 3) * 4 - 16, a = strike(p);
  c.save(); c.translate(0, h);
  for (let i = 0; i < 3; i++) ell(c, -10 - i * 8 + Math.sin(p.t * 4 + i) * 3, -8 + i * 6, 7 - i * 2, 4 - i, "rgba(160,220,255,0.6)");
  twoTone(c, (c) => { c.moveTo(0, -84); c.lineTo(24, -46); c.lineTo(0, -10); c.lineTo(-24, -46); c.closePath(); }, "#bfe9ff", "#7fc8f0", -46);
  poly(c, [0, -84, 10, -48, 0, -30, -8, -50], "rgba(255,255,255,0.6)");
  eyes(c, 4, -50, 4, 12, { look: 0.5 });
  circle(c, 30, -50, 6 + a * 6, "rgba(160,220,255,0.8)");
  c.restore();
}

// ── Lava ──────────────────────────────────────────────────────────────────
function flame(c, x, y, w, h, t, outer, inner) {
  const f = Math.sin(t * 12) * 0.08;
  c.fillStyle = outer;
  c.beginPath(); c.moveTo(x - w, y);
  c.bezierCurveTo(x - w * 1.1, y - h * 0.5, x - w * 0.3, y - h * (0.7 + f), x - w * 0.1, y - h);
  c.bezierCurveTo(x + w * 0.2, y - h * 0.7, x + w * 0.5, y - h * (0.85 - f), x + w * 0.6, y - h * 0.65);
  c.bezierCurveTo(x + w * 1.1, y - h * 0.4, x + w, y, x, y + 2); c.closePath(); c.fill();
  c.fillStyle = inner;
  c.beginPath(); c.moveTo(x - w * 0.5, y - 2); c.quadraticCurveTo(x - w * 0.4, y - h * 0.5, x, y - h * 0.62); c.quadraticCurveTo(x + w * 0.5, y - h * 0.4, x + w * 0.45, y - 2); c.closePath(); c.fill();
}

function firespirit(c, p) {
  const h = Math.sin(p.t * 5) * 3 - 6, a = strike(p);
  c.save(); c.translate(0, h); c.scale(1 + a * 0.2, 1 + a * 0.2);
  flame(c, 0, -6, 26, 74, p.t, "#ff7a2e", "#ffd84a");
  eyes(c, 4, -30, 4.5, 13, { look: 0.5 });
  c.restore();
}

function firespewer(c, p) {
  const a = strike(p);
  twoTone(c, (c) => { c.moveTo(-36, 0); c.lineTo(-16, -60); c.lineTo(16, -60); c.lineTo(36, 0); c.closePath(); }, "#5e352d", "#4a2a24", -22);
  ell(c, 0, -60, 17, 6, "#2a1614");
  ell(c, 0, -60, 12 + a * 4, 4 + a * 2, "#ff7a2e");
  for (const [x, y] of [[-14, -30], [10, -18], [-4, -42]]) line(c, x, y, x + 6, y + 6, 3, "#ff9a3c");
  eyes(c, 2, -36, 4.5, 16, { glow: "#ffcc4a" });
  if (a > 0) flame(c, 0, -62, 10, 30 * a, p.t, "#ff7a2e", "#ffd84a");
}

// ── Thunderwing (Drache) ──────────────────────────────────────────────────
function dragon(c, p) {
  const pal = { body: "#3f7fd6", dark: "#2b5aa8", belly: "#f5cf4a", wing: "#24407a", wingFront: "#2f5296", horn: "#ffe14d", ...p.pal };
  const fly = p.pose === "fly";
  const flap = fly ? Math.sin(p.t * 9) : Math.sin(p.t * 2) * 0.2;
  const walk = p.pose === "walk" ? Math.sin(p.t * 8) : 0;
  const open = p.pose === "attack" ? 0.6 + Math.sin(p.t * 20) * 0.1 : p.pose === "charge" ? 0.35 : 0.08;
  // hinterer Flügel (nach hinten oben, der Kopf bleibt frei)
  poly(c, [-16, -58, -42, -108 - flap * 18, -78, -96 - flap * 24, -62, -68, -32, -52], pal.wing);
  // Schwanz mit Blitzspitze
  curve(c, -30, -36, -64, -26, -80, -50, 12, pal.dark);
  poly(c, [-80, -50, -94, -62, -86, -54, -98, -54, -82, -44], pal.horn);
  // Beine
  const ly = fly ? 16 : 24;
  rrect(c, -24 + walk * 5, -24, 12, ly, 5, pal.dark);
  rrect(c, 4 - walk * 5, -24, 12, ly, 5, pal.dark);
  // Körper
  twoTone(c, (c) => c.ellipse(-6, -44, 32, 24, -0.1, 0, TAU), pal.body, pal.dark, -36);
  ell(c, 2, -36, 20, 12, pal.belly, -0.1);
  // Hals + Kopf nach rechts oben
  line(c, 14, -54, 28, -78, 16, pal.body);
  c.save(); c.translate(34, -86);
  twoTone(c, (c) => c.roundRect(-14, -12, 36, 22, 10), pal.body, pal.dark, 2);
  c.fillStyle = "#1a1622"; c.beginPath(); c.moveTo(8, 4); c.lineTo(22, 4 - open * 6); c.lineTo(22, 4 + open * 14); c.closePath(); c.fill();
  rrect(c, 4, 6 + open * 6, 18, 6, 3, pal.dark);
  poly(c, [-8, -10, -24, -26, -2, -12], pal.horn); poly(c, [2, -12, -6, -30, 8, -12], pal.horn);
  eyes(c, 6, -3, 3.5, 8, { white: "#ffe14d", look: 0.4 });
  c.restore();
  // vorderer Flügel, kleiner und nach hinten gekippt
  poly(c, [-6, -58, -22, -112 - flap * 22, -54, -108 - flap * 28, -44, -76, -16, -52], pal.wingFront);
  line(c, -6, -58, -22, -112 - flap * 22, 3, pal.dark);
}

// ── Ei der Spinnenkönigin ─────────────────────────────────────────────────
function egg(c, p) {
  const w = Math.sin(p.t * 6) * 0.06;
  c.save(); c.rotate(w);
  twoTone(c, (c) => c.ellipse(0, -22, 18, 22, 0, 0, TAU), "#efe6d2", "#c9c0aa", -16);
  for (let i = 0; i < 4; i++) curve(c, -16, -30 + i * 8, 0, -36 + i * 8, 16, -30 + i * 8, 1.5, "rgba(120,110,90,0.5)");
  c.restore();
}

// ── Neue Gegner (Oktober 2026) ────────────────────────────────────────────
function zombie(c, p) {
  const b = p.move ? -Math.abs(Math.sin(p.t * 6)) * 3 : 0, s = step(p, 6), a = strike(p);
  const lean = 0.12;
  legs(c, 0, -30, 30, 14, 10, "#3f4a6a", s);
  c.save(); c.translate(0, b); c.rotate(lean);
  twoTone(c, (c) => c.roundRect(-16, -64, 32, 38, 10), "#5f7fb0", "#4a6690", -40);
  poly(c, [-16, -30, -10, -24, -4, -30, 2, -24, 8, -30, 16, -26, 16, -30, -16, -30], "#4a6690"); // zerrissener Saum
  rrect(c, -6, -50, 10, 6, 2, "#8fb07a"); // Loch im Hemd
  line(c, 2, -56, 34 + a * 6, -54, 9, "#8fb07a");
  twoTone(c, (c) => c.arc(2, -78, 18, 0, TAU), "#9cc285", "#7da86a", -72);
  circle(c, 10, -80, 6, "#ffffff"); circle(c, 12, -79, 3, "#1a1622");
  circle(c, -1, -81, 4, "#ffffff"); circle(c, 0, -80, 1.8, "#1a1622");
  line(c, 2, -68, 14, -70, 2.5, "#3a4a2a");
  rrect(c, -14, -96, 10, 6, 3, "#5a4a3a"); rrect(c, -4, -98, 12, 6, 3, "#5a4a3a");
  line(c, 0, -54, 36 + a * 6, -48, 9, "#9cc285");
  c.restore();
}

function shieldbearer(c, p) {
  const b = bob(p, 3, 9), s = step(p, 9);
  legs(c, 0, -30, 30, 16, 11, "#4a4452", s);
  c.save(); c.translate(0, b);
  line(c, -10, -58, 30, -64, 6, "#8a5a3a"); // Speer hinter dem Schild
  poly(c, [30, -70, 40, -64, 30, -58], "#c9c3d1");
  twoTone(c, (c) => c.roundRect(-18, -66, 34, 40, 10), "#7a6d8a", "#5e5370", -40);
  twoTone(c, (c) => c.arc(-2, -80, 17, 0, TAU), "#f2c49b", "#d9a57a", -74);
  twoTone(c, (c) => c.arc(-2, -84, 18, Math.PI, 0), "#8a8396", "#6b6574", -88);
  rrect(c, -20, -86, 36, 5, 2, "#6b6574");
  eyes(c, 4, -78, 2.6, 9, { pr: 0.8 });
  // großer Turmschild vorn
  twoTone(c, (c) => c.roundRect(12, -82, 24, 66, 8), "#b8b8c8", "#8a8a9a", -46);
  rrect(c, 16, -60, 16, 6, 2, "#d9473a");
  rrect(c, 21, -74, 6, 40, 2, "#d9473a");
  c.restore();
}

function bat(c, p) {
  const flap = Math.sin(p.t * 22);
  const h = -50 + Math.sin(p.t * 5) * 5;
  c.save(); c.translate(0, h); c.scale(1.6, 1.6);
  for (const side of [-1, 1]) {
    poly(c, [side * 8, -4, side * 36, -14 - flap * 16, side * 30, 2 - flap * 4, side * 22, -2, side * 14, 6], "#4a3a66");
  }
  twoTone(c, (c) => c.ellipse(0, 0, 14, 13, 0, 0, TAU), "#6a4e8e", "#523a70", 3);
  poly(c, [-10, -8, -12, -20, -4, -11], "#6a4e8e"); poly(c, [10, -8, 12, -20, 4, -11], "#6a4e8e");
  eyes(c, 2, -2, 3.2, 9, { white: "#ffe14d", look: 0.4 });
  poly(c, [-2, 6, 0, 11, 2, 6], "#ffffff"); poly(c, [4, 6, 6, 11, 8, 6], "#ffffff");
  c.restore();
}

function sandworm(c, p) {
  const sway = Math.sin(p.t * 4) * 4, a = strike(p);
  ell(c, 0, -2, 34, 10, "#a88a5a"); // aufgewühlter Sand
  c.save(); c.translate(sway * 0.3, 0);
  for (let i = 0; i < 4; i++) {
    const y = -12 - i * 18, w = 22 - i * 1.5;
    twoTone(c, (c) => c.ellipse(sway * (i / 4), y, w, 12, 0, 0, TAU), i % 2 ? "#c9875a" : "#d89a68", "#a8683e", y + 4);
  }
  // Kopf mit Maul nach oben
  c.translate(sway, -84);
  twoTone(c, (c) => c.ellipse(0, 0, 22, 18, 0, 0, TAU), "#d89a68", "#a8683e", 6);
  const open = 6 + a * 10;
  ell(c, 6, -6, 14, open, "#3a1a1a");
  for (let i = 0; i < 5; i++) poly(c, [-6 + i * 6, -6 - open + 1, -3 + i * 6, -6 - open + 6, i * 6, -6 - open + 1], "#fff8e8");
  circle(c, -10, -8, 3, "#1a1622");
  c.restore();
}

function bear(c, p) {
  const pal = { fur: "#a8784e", dark: "#86593a", snow: "#f4f8fb" };
  if (p.pose === "roll") {
    // als Schneeball mit Bärenpfoten — dreht sich
    c.save(); c.translate(0, -34); c.rotate(p.t * 14);
    twoTone(c, (c) => c.arc(0, 0, 34, 0, TAU), pal.snow, "#d6e6f0", 10);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; ell(c, Math.cos(a) * 28, Math.sin(a) * 28, 10, 7, pal.fur, a); }
    circle(c, 0, -8, 9, pal.dark); circle(c, 3, -10, 2.5, "#1a1622");
    c.restore();
    return;
  }
  const dizzy = p.pose === "dizzy";
  const b = bob(p, 4, 8), s = step(p, 8);
  legs(c, 0, -22, 22, 30, 15, pal.dark, s);
  c.save(); c.translate(0, b);
  twoTone(c, (c) => c.ellipse(-4, -44, 38, 26, 0, 0, TAU), pal.fur, pal.dark, -34);
  twoTone(c, (c) => c.ellipse(-8, -62, 30, 10, 0, Math.PI, 0), pal.snow, "#d6e6f0", -66); // Schnee auf dem Rücken
  twoTone(c, (c) => c.arc(28, -60, 18, 0, TAU), pal.fur, pal.dark, -54);
  circle(c, 20, -76, 6, pal.fur); circle(c, 36, -74, 6, pal.fur);
  ell(c, 40, -56, 8, 6, "#e8c9a0"); circle(c, 46, -58, 3, "#1a1622");
  if (dizzy) { for (const s2 of [-1, 1]) { line(c, 26 + s2 * 3 - 3, -66, 26 + s2 * 3 + 3, -60, 2, "#1a1622"); line(c, 26 + s2 * 3 + 3, -66, 26 + s2 * 3 - 3, -60, 2, "#1a1622"); }
    for (let i = 0; i < 3; i++) { const a = p.t * 6 + i * 2.1; circle(c, 26 + Math.cos(a) * 16, -86 + Math.sin(a) * 5, 3, "#ffe14d"); } }
  else eyes(c, 28, -64, 3, 10, { look: 0.5 });
  rrect(c, -10, -26, 30, 6, 3, "#5ec8ff"); // Schal
  c.restore();
}

function kobold(c, p) {
  const b = bob(p, 4, 12), s = step(p, 12), a = strike(p);
  legs(c, 0, -20, 20, 12, 7, "#a8401f", s);
  c.save(); c.translate(0, b);
  curve(c, -12, -24, -28, -20, -32, -6, 6, "#c4501f"); // Schwanz
  twoTone(c, (c) => c.roundRect(-13, -46, 26, 26, 9), "#e0703a", "#c4501f", -30);
  twoTone(c, (c) => c.ellipse(4, -56, 16, 13, 0, 0, TAU), "#e0703a", "#c4501f", -52);
  poly(c, [-8, -66, -14, -78, -2, -68], "#f5cf4a"); poly(c, [4, -68, 2, -80, 10, -68], "#f5cf4a");
  eyes(c, 10, -58, 3, 8, { white: "#ffe14d", look: 0.5 });
  // Mörserrohr auf der Schulter, zeigt schräg nach oben
  c.save(); c.translate(-4, -46); c.rotate(-0.9 - a * 0.2);
  rrect(c, -4, -9, 34, 18, 6, "#4a4452");
  rrect(c, 26, -11, 8, 22, 3, "#2a2632");
  if (a > 0.3) circle(c, 38, 0, 6 * a, "#ffcc4a");
  c.restore();
  c.restore();
}

// ── Neue Bosse ────────────────────────────────────────────────────────────
function fallenknight(c, p) {
  const b = bob(p, 3, 8), s = step(p, 8), a = strike(p);
  const guard = p.pose === "guard";
  legs(c, 0, -32, 32, 18, 12, "#2e2a3a", s);
  c.save(); c.translate(0, b);
  // zerrissener Umhang
  poly(c, [-14, -76, -30, -20, -22, -26, -16, -16, -8, -26, 0, -70], "#8a1f2e");
  twoTone(c, (c) => c.roundRect(-20, -78, 40, 48, 12), "#4a4458", "#363244", -50);
  rrect(c, -20, -40, 40, 7, 3, "#2a2632");
  twoTone(c, (c) => c.arc(2, -92, 19, 0, TAU), "#4a4458", "#363244", -88);
  rrect(c, 0, -96, 20, 5, 2, "#ff3a3a"); // glühender Sehschlitz
  poly(c, [-8, -108, -2, -124, 6, -108], "#8a1f2e");
  if (guard) {
    twoTone(c, (c) => c.roundRect(14, -92, 30, 72, 10), "#3a3548", "#2a2636", -50);
    poly(c, [29, -78, 36, -64, 29, -50, 22, -64], "#8a1f2e");
  } else {
    // Großschwert, holt beim Angriff aus
    c.save(); c.translate(18, -58); c.rotate(-1.9 + a * 2.6);
    rrect(c, -4, -4, 8, 16, 3, "#2a2632"); rrect(c, -12, -8, 24, 6, 3, "#8a8396");
    poly(c, [-5, -8, 5, -8, 4, -66, 0, -76, -4, -66], "#c9c3d1"); line(c, 0, -10, 0, -66, 1.5, "#8a8396");
    c.restore();
  }
  c.restore();
}

function pharaoh(c, p) {
  const hover = Math.sin(p.t * 2.5) * 4 - 10, a = strike(p);
  c.save(); c.translate(0, hover);
  twoTone(c, (c) => { c.moveTo(-26, 4); c.lineTo(-16, -62); c.quadraticCurveTo(0, -70, 16, -62); c.lineTo(26, 4); c.closePath(); }, "#efe6d2", "#cfc4a8", -24);
  rrect(c, -18, -40, 36, 10, 3, "#3f7fd6"); rrect(c, -18, -40, 36, 4, 2, "#f5cf4a");
  // Kragen
  twoTone(c, (c) => c.ellipse(0, -62, 26, 10, 0, 0, TAU), "#f5cf4a", "#3f7fd6", -60);
  // Nemes-Kopftuch, gestreift
  poly(c, [-24, -60, -18, -100, 18, -100, 24, -60, 14, -66, -14, -66], "#f5cf4a");
  for (let i = 0; i < 4; i++) poly(c, [-22 + i * 0.5, -66 - i * 9, 22 - i * 0.5, -66 - i * 9, 21 - i * 0.5, -70 - i * 9, -21 + i * 0.5, -70 - i * 9], "#3f7fd6");
  ell(c, 2, -80, 12, 14, "#7a5a3a");
  eyes(c, 4, -82, 3, 9, { glow: "#5ee0ff" });
  rrect(c, -1, -72, 6, 10, 2, "#3f7fd6"); // Bart
  poly(c, [-6, -102, 0, -112, 6, -102], "#d9473a");
  // Anch-Stab
  line(c, 30, 0, 32 + a * 4, -96, 5, "#f5cf4a");
  c.strokeStyle = "#f5cf4a"; c.lineWidth = 5; c.beginPath(); c.ellipse(32 + a * 4, -106, 7, 9, 0, 0, TAU); c.stroke();
  line(c, 22 + a * 4, -96, 42 + a * 4, -96, 5, "#f5cf4a");
  if (a > 0) circle(c, 32 + a * 4, -106, 5 + a * 4, "#5ee0ff");
  c.restore();
}

// Lavawurm-Kopf (der Körper kommt aus drawWormBody, weil er an Weltpositionen hängt)
function lavaworm(c, p) {
  const open = p.pose === "attack" ? 0.6 + Math.sin(p.t * 16) * 0.15 : 0.15;
  c.save(); c.translate(0, -42);
  twoTone(c, (c) => c.ellipse(0, 0, 40, 36, 0, 0, TAU), "#6a2a1e", "#4e1e16", 12);
  for (const [x, y] of [[-20, -14], [-8, 16], [-26, 8]]) line(c, x, y, x + 10, y - 6, 3, "#ff7a2e");
  // Maul nach vorn
  c.fillStyle = "#2a0e0a";
  c.beginPath(); c.moveTo(14, -4); c.lineTo(44, -4 - open * 24); c.lineTo(44, -4 + open * 24); c.closePath(); c.fill();
  for (let i = 0; i < 3; i++) { poly(c, [20 + i * 8, -4 - open * (6 + i * 7), 24 + i * 8, -4 - open * (6 + i * 7) + 7, 28 + i * 8, -4 - open * (6 + i * 7)], "#fff3d0"); poly(c, [20 + i * 8, -4 + open * (6 + i * 7), 24 + i * 8, -4 + open * (6 + i * 7) - 7, 28 + i * 8, -4 + open * (6 + i * 7)], "#fff3d0"); }
  if (open > 0.4) circle(c, 36, -4, 6, "#ffcc4a");
  eyes(c, 6, -20, 4.5, 16, { glow: "#ffcc4a" });
  poly(c, [-14, -30, -30, -50, -4, -34], "#3a120e"); poly(c, [2, -34, -4, -56, 12, -34], "#3a120e");
  c.restore();
}

// Körpersegmente des Lavawurms an Weltkoordinaten (trail[0] = gleich hinter dem Kopf)
export function drawWormBody(c, trail, r, t) {
  for (let i = trail.length - 1; i >= 1; i--) {
    const pt = trail[i];
    const rr = r * (0.8 - i * 0.045);
    c.save(); c.translate(pt.x, pt.y);
    ell(c, 0, rr * 0.75, rr, rr * 0.3, "rgba(0,0,0,0.25)");
    twoTone(c, (c) => c.arc(0, -rr * 0.6, rr, 0, TAU), i % 2 ? "#6a2a1e" : "#7a3222", "#4e1e16", -rr * 0.3);
    circle(c, 0, -rr * 0.6, rr * 0.35, `rgba(255,${120 + Math.round(Math.sin(t * 4 + i) * 40)},40,0.55)`);
    c.restore();
  }
}

// Erdhügel für abgetauchte Gegner (Sandwurm, Lavawurm)
export function drawMound(c, x, y, r, t, lava) {
  const wob = Math.sin(t * 10) * 2;
  c.save(); c.translate(x, y);
  ell(c, 0, 4, r * 1.1, r * 0.4, "rgba(0,0,0,0.2)");
  twoTone(c, (c) => c.ellipse(0, 0, r * 0.9 + wob, r * 0.45, 0, Math.PI, 0), lava ? "#5e352d" : "#b08b55", lava ? "#4a2a24" : "#9b7a48", -r * 0.1);
  for (let i = 0; i < 4; i++) circle(c, Math.cos(t * 6 + i * 1.7) * r * 0.7, -r * 0.2 - Math.abs(Math.sin(t * 8 + i)) * r * 0.4, 3, lava ? "#ff7a2e" : "#c8a46a");
  c.restore();
}

export const CREATURES = {
  slime, goblin, skeleton, skeletonwarrior, orc, troll, minotaur, nekromant, shaman, firewizard, spider, mummy, scorpion,
  golem, snowman, penguin, yeti, icespirit, firespirit, firespewer, dragon, egg,
  zombie, shieldbearer, bat, sandworm, bear, kobold, fallenknight, pharaoh, lavaworm,
};

// Bosse: welche Figur, welche Farben (p.pal) — Größe kommt vom Renderer (BOSSES[id].r)
export const BOSS_LOOK = {
  necromancer: { fig: "nekromant", pal: { robe: "#3e2470", dark: "#2a1650", hood: "#33205c", trim: "#c49aff", orb: "#c49aff", eye: "#c49aff" } },
  slimeKing: { fig: "slime", pal: { body: "#4fc7a6", dark: "#2f9a80" } },
  spiderQueen: { fig: "spider", pal: { body: "#5a2236", dark: "#3d1526", mark: "#f5cf4a", eye: "#f5cf4a" } },
  sandColossus: { fig: "golem", pal: { body: "#b0643a", dark: "#8a4a2a", rune: "#ffd84a" } },
  yetiAncient: { fig: "yeti", pal: { face: "#5a8ad6" } },
  minotaurLord: { fig: "minotaur", pal: { skin: "#7a3a2a", dark: "#5a2a1e" } },
  thunderwing: { fig: "dragon", pal: {} },
  fallenKnight: { fig: "fallenknight", pal: {} },
  pharaoh: { fig: "pharaoh", pal: {} },
  lavaWurm: { fig: "lavaworm", pal: {} },
};
