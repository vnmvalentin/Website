// render/flat/heroes.js — die sieben Kits als Figuren im flachen Stil (Konvention wie creatures.js). Gemeinsamer Körper,
// jedes Kit hat Kopfbedeckung, Kleidung und Waffe für sich. p.pal = { main, mainDark } ersetzt die Kleidungsfarbe —
// so funktionieren die Farbvarianten (data/skins.js).

import { circle, rrect, poly, line, curve, twoTone, eyes, bob, step, strike } from "./draw.js";

const SKIN = "#f2c49b", SKIN_D = "#d9a57a";

function body(c, p, look) {
  const b = bob(p, 5, 12), s = step(p, 12);
  const pal = { main: look.main, mainDark: look.mainDark, ...p.pal };
  // Beine
  if (!look.robe) {
    rrect(c, -12 + s * 5, -26, 10, 26, 5, look.pants);
    rrect(c, 2 - s * 5, -26, 10, 26, 5, look.pants);
    rrect(c, -14 + s * 5, -6, 13, 6, 3, look.shoes || "#3d2a1a");
    rrect(c, 1 - s * 5, -6, 13, 6, 3, look.shoes || "#3d2a1a");
  }
  c.save(); c.translate(0, b);
  // hinterer Arm
  line(c, -10, -44, -18 - s * 4, -28, 8, pal.mainDark);
  if (look.robe) twoTone(c, (c) => { c.moveTo(-17, -52); c.lineTo(-24, -2 - b); c.lineTo(24, -2 - b); c.lineTo(17, -52); c.closePath(); }, pal.main, pal.mainDark, -24);
  else twoTone(c, (c) => c.roundRect(-17, -54, 34, 32, 11), pal.main, pal.mainDark, -32);
  if (look.vest) twoTone(c, (c) => { c.moveTo(-17, -50); c.lineTo(-8, -50); c.lineTo(-6, -24); c.lineTo(-17, -24); c.closePath(); c.moveTo(17, -50); c.lineTo(8, -50); c.lineTo(6, -24); c.lineTo(17, -24); c.closePath(); }, look.vest, look.vestDark, -34);
  if (look.belt) rrect(c, -17, -30, 34, 5, 2, look.belt);
  // Kopf
  twoTone(c, (c) => c.arc(2, -72, 19, 0, Math.PI * 2), look.face || SKIN, look.faceDark || SKIN_D, -64);
  return { b, s, pal };
}

function frontArm(c, color, x2, y2) {
  line(c, 8, -44, x2, y2, 8, color);
}

const KIT_LOOK = {
  default: {
    main: "#3f7fd6", mainDark: "#2b5aa8", pants: "#4a3a2e", belt: "#6b4a2b",
    head(c) { twoTone(c, (c) => c.arc(2, -78, 19, Math.PI * 1.02, -0.05), "#7a4a2a", "#5e3820", -80); rrect(c, -18, -82, 26, 6, 3, "#7a4a2a"); eyes(c, 8, -72, 2.6, 9, { pr: 0.8, look: 0.3 }); },
    weapon(c, a) { frontArm(c, "#2b5aa8", 20 + a * 4, -42); rrect(c, 16 + a * 4, -48, 18, 7, 2, "#5c5566"); rrect(c, 18 + a * 4, -44, 6, 9, 2, "#3b3542"); },
  },
  knight: {
    main: "#b8b8c8", mainDark: "#8a8a9a", pants: "#6b6574", shoes: "#4a4552",
    face: "#b8b8c8", faceDark: "#8a8a9a",
    head(c) { rrect(c, 2, -76, 18, 5, 2, "#2a2230"); poly(c, [-6, -90, -2, -110, 10, -112, 6, -90], "#d9473a"); rrect(c, -18, -62, 40, 5, 2, "#8a8a9a"); },
    weapon(c, a) { frontArm(c, "#8a8a9a", 22, -46); c.strokeStyle = "#8a5a3a"; c.lineWidth = 5; c.lineCap = "round"; c.beginPath(); c.arc(16, -46, 24, -1.15, 1.15); c.stroke(); line(c, 16 + Math.cos(-1.15) * 24, -46 + Math.sin(-1.15) * 24, 16 + Math.cos(1.15) * 24 - a * 10, -46 + Math.sin(1.15) * 24, 1.5, "#efe6d2"); },
  },
  ninja: {
    main: "#2e2e3e", mainDark: "#1e1e2a", pants: "#1e1e2a", shoes: "#14141c", belt: "#d9473a",
    face: "#2e2e3e", faceDark: "#1e1e2a",
    head(c, p) { rrect(c, -8, -78, 26, 9, 4, SKIN); eyes(c, 8, -74, 2.6, 9, { pr: 0.8, look: 0.4 }); rrect(c, -17, -86, 38, 5, 2, "#d9473a"); const w = Math.sin(p.t * 8) * 4; poly(c, [-16, -86, -34, -90 + w, -30, -80 + w, -16, -82], "#d9473a"); },
    weapon(c, a) { frontArm(c, "#1e1e2a", 22 + a * 6, -46 - a * 4); c.save(); c.translate(26 + a * 6, -48 - a * 4); c.rotate(a * 3); poly(c, [0, -9, 2.5, -2.5, 9, 0, 2.5, 2.5, 0, 9, -2.5, 2.5, -9, 0, -2.5, -2.5], "#c9c3d1"); circle(c, 0, 0, 2, "#2e2e3e"); c.restore(); },
  },
  wizard: {
    main: "#6a3fb0", mainDark: "#4e2c86", robe: true, belt: "#f5cf4a",
    head(c) { poly(c, [-6, -66, 16, -66, 8, -48], "#f4f0e6"); eyes(c, 8, -74, 2.6, 9, { pr: 0.8 }); poly(c, [-22, -84, 26, -84, 6, -124, -2, -116], "#4e2c86"); rrect(c, -22, -88, 48, 6, 3, "#f5cf4a"); },
    weapon(c, a) { frontArm(c, "#4e2c86", 22, -40); line(c, 24, -4, 26, -86, 5, "#6b4a2b"); circle(c, 26, -90 - a * 3, 8 + a * 3, "#ff9a3c"); circle(c, 24, -92 - a * 3, 3, "#ffe14d"); },
  },
  bestmod: {
    main: "#4f8a3a", mainDark: "#3a6a2a", pants: "#3d3328", belt: "#6b4a2b",
    head(c) { twoTone(c, (c) => c.arc(2, -74, 21, Math.PI * 0.85, Math.PI * 2.15), "#4f8a3a", "#3a6a2a", -70); rrect(c, -2, -76, 24, 14, 6, "#6b6574"); circle(c, 6, -71, 4.5, "#9be05a"); circle(c, 16, -71, 4.5, "#9be05a"); circle(c, 11, -62, 4, "#4a4552"); },
    weapon(c, a) { frontArm(c, "#3a6a2a", 22 + a * 6, -44 - a * 6); rrect(c, 22 + a * 6, -60 - a * 6, 6, 8, 2, "#efe6d2"); circle(c, 25 + a * 6, -46 - a * 6, 8, "#9be05a"); circle(c, 23 + a * 6, -48 - a * 6, 2.5, "#e8ffd0"); },
  },
  cyber: {
    main: "#2f3542", mainDark: "#1f232c", pants: "#1f232c", shoes: "#14161c", belt: "#5ee0ff",
    head(c) { twoTone(c, (c) => c.arc(2, -78, 19, Math.PI * 1.02, -0.05), "#1f232c", "#14161c", -80); rrect(c, -4, -78, 26, 8, 4, "#5ee0ff"); rrect(c, 6, -76, 12, 3, 1.5, "#d8fbff"); },
    weapon(c, a) { frontArm(c, "#1f232c", 20, -42); rrect(c, 14, -50, 26, 8, 3, "#4a5262"); rrect(c, 36, -48, 6, 4, 2, "#5ee0ff"); if (a > 0) circle(c, 44, -46, 4 * a + 2, "#5ee0ff"); },
  },
  gh0stqq: {
    main: "#8a8396", mainDark: "#6b6574", pants: "#3f5fb0", vest: "#f0882a", vestDark: "#c4661a", belt: "#4a4552",
    head(c) { eyes(c, 8, -72, 2.6, 9, { pr: 0.8 }); twoTone(c, (c) => c.arc(2, -80, 20, Math.PI, 0), "#f5cf4a", "#d8ac22", -84); rrect(c, -20, -82, 44, 5, 2.5, "#d8ac22"); },
    weapon(c, a) { c.save(); c.translate(14, -44); c.rotate(-0.6 + a * 1.4); line(c, 0, 0, 0, -30, 5, "#6b4a2b"); rrect(c, -10, -40, 20, 12, 3, "#8a8396"); c.restore(); frontArm(c, "#6b6574", 14, -44); },
  },
};

export function drawHero(c, kitId, p) {
  const look = KIT_LOOK[kitId] || KIT_LOOK.default;
  body(c, p, look);
  look.head(c, p);
  look.weapon(c, strike(p));
  c.restore();
}

export const HERO_IDS = Object.keys(KIT_LOOK);

// Hilfsform für Lockvögel (Strohpuppe) — auch eine Figur, aber ohne Kit
export function drawDecoy(c) {
  line(c, 0, 0, 0, -60, 6, "#6b4a2b");
  line(c, -24, -54, 24, -54, 6, "#6b4a2b");
  twoTone(c, (c) => c.roundRect(-14, -62, 28, 34, 8), "#d8b070", "#a8804a", -40);
  circle(c, 0, -74, 14, "#e8c890");
  poly(c, [-20, -80, 20, -80, 0, -100], "#8a5a3a");
  rrect(c, -6, -76, 4, 4, 1, "#3d2a1a"); rrect(c, 4, -76, 4, 4, 1, "#3d2a1a");
  curve(c, -6, -66, 0, -62, 6, -66, 2, "#3d2a1a");
}
