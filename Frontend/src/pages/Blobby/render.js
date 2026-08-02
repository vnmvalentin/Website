// Zeichnen des Spielfelds. Getrennt von BlobbyRoom.jsx, weil das reine Canvas-Arbeit ist
// und mit der React-Logik nichts zu tun hat.
//
// Der Strand ist statisch und wird einmal pro Feldbreite in ein Offscreen-Canvas gemalt —
// Palmen, Wellen und Wolken jeden Frame neu zu zeichnen wäre pure Verschwendung.
import {
  WORLD_H, GROUND_Y, BALL_RADIUS, NET_RADIUS,
  BLOBBY_UPPER_SPHERE, BLOBBY_UPPER_RADIUS, BLOBBY_LOWER_SPHERE, BLOBBY_LOWER_RADIUS,
  POWERUP_RADIUS, POWERUP_TYPES,
} from "./physics";

const TAU = Math.PI * 2;

// Team 1 spielt links (Plätze 1/3), Team 2 rechts (Plätze 2/4)
export const SLOT_COLOR = {
  1: { hex: "#ef4444", label: "Rot" },
  2: { hex: "#8b5cf6", label: "Violett" },
  3: { hex: "#f59e0b", label: "Orange" },
  4: { hex: "#38bdf8", label: "Blau" },
};
export const TEAM_COLOR = { 1: "#ef4444", 2: "#8b5cf6" };

export const POWERUP_COLOR = {
  speed: "#38bdf8",
  grow: "#22c55e",
  shrink: "#f97316",
  netHigh: "#a78bfa",
  netLow: "#eab308",
};

// Der Horizont liegt hoch genug, dass hinter den Blobs noch ein Streifen Strand bleibt —
// sonst sieht es aus, als würden sie im Wasser stehen.
const HORIZON = 268;
const SHORE = 424;

// ── Hintergrund ─────────────────────────────────────────────────────────────

function drawCloud(g, x, y, s) {
  g.fillStyle = "rgba(255, 255, 255, 0.72)";
  g.beginPath();
  g.ellipse(x, y, 52 * s, 17 * s, 0, 0, TAU);
  g.ellipse(x - 34 * s, y + 5 * s, 30 * s, 12 * s, 0, 0, TAU);
  g.ellipse(x + 32 * s, y + 6 * s, 26 * s, 10 * s, 0, 0, TAU);
  g.ellipse(x + 6 * s, y - 12 * s, 30 * s, 14 * s, 0, 0, TAU);
  g.fill();
}

function drawPalm(g, x, baseY, h, lean) {
  const topX = x + lean * h * 0.26;
  const topY = baseY - h;
  const ctrlX = x + lean * h * 0.04;
  const ctrlY = baseY - h * 0.55;
  const w = h * 0.045;

  // Stamm
  g.beginPath();
  g.moveTo(x - w, baseY);
  g.quadraticCurveTo(ctrlX - w * 0.8, ctrlY, topX - w * 0.42, topY);
  g.lineTo(topX + w * 0.42, topY);
  g.quadraticCurveTo(ctrlX + w * 0.9, ctrlY, x + w * 1.05, baseY);
  g.closePath();
  g.fillStyle = "#6d4a2f";
  g.fill();

  // Ringe am Stamm
  g.strokeStyle = "rgba(38, 24, 14, 0.35)";
  g.lineWidth = h * 0.012;
  for (let i = 1; i < 9; i++) {
    const t = i / 9;
    const rx = x + (topX - x) * t * t;
    const ry = baseY - h * t;
    g.beginPath();
    g.moveTo(rx - w * (1 - t * 0.55), ry);
    g.lineTo(rx + w * (1 - t * 0.5), ry);
    g.stroke();
  }

  // Wedel: erst die dunkle hintere Lage, dann die helle vordere
  const fronds = (len, color, spread) => {
    g.fillStyle = color;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI - 0.35 + (i / 6) * (Math.PI + 0.7);
      const ex = topX + Math.cos(a) * len;
      const ey = topY + Math.sin(a) * len + len * 0.42;
      const mx = topX + Math.cos(a) * len * 0.55;
      const my = topY + Math.sin(a) * len * 0.55;
      g.beginPath();
      g.moveTo(topX, topY);
      g.quadraticCurveTo(mx, my - spread, ex, ey);
      g.quadraticCurveTo(mx, my + spread, topX, topY);
      g.fill();
    }
  };
  fronds(h * 0.46, "#1f6b41", h * 0.055);
  fronds(h * 0.4, "#2f9155", h * 0.04);

  // Kokosnüsse
  g.fillStyle = "#5b3d24";
  for (const [dx, dy] of [[-6, 6], [5, 9], [-1, 13]]) {
    g.beginPath();
    g.arc(topX + dx * (h / 200), topY + dy * (h / 200) + h * 0.02, h * 0.028, 0, TAU);
    g.fill();
  }
}

function paintBeach(g, width) {
  // Himmel
  const sky = g.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, "#123f6d");
  sky.addColorStop(0.45, "#2d78ab");
  sky.addColorStop(0.85, "#79b6d1");
  sky.addColorStop(1, "#aed7e2");
  g.fillStyle = sky;
  g.fillRect(0, 0, width, HORIZON);

  // Sonne mit weichem Hof
  const sunX = width * 0.17;
  const sunY = 100;
  const halo = g.createRadialGradient(sunX, sunY, 8, sunX, sunY, 130);
  halo.addColorStop(0, "rgba(255, 237, 184, 0.5)");
  halo.addColorStop(1, "rgba(255, 237, 184, 0)");
  g.fillStyle = halo;
  g.beginPath();
  g.arc(sunX, sunY, 130, 0, TAU);
  g.fill();
  g.fillStyle = "#ffefc6";
  g.beginPath();
  g.arc(sunX, sunY, 29, 0, TAU);
  g.fill();

  drawCloud(g, width * 0.52, 74, 1);
  drawCloud(g, width * 0.85, 128, 0.72);
  drawCloud(g, width * 0.33, 158, 0.48);

  // Meer
  const sea = g.createLinearGradient(0, HORIZON, 0, SHORE);
  sea.addColorStop(0, "#0a4770");
  sea.addColorStop(0.35, "#0f6e9b");
  sea.addColorStop(0.75, "#1d9dba");
  sea.addColorStop(1, "#4cc0c9");
  g.fillStyle = sea;
  g.fillRect(0, HORIZON, width, SHORE - HORIZON);

  // Sonnenstraße — weich, damit keine harten Kanten wie bei einem Scheinwerferkegel entstehen
  const glint = g.createRadialGradient(sunX, HORIZON, 10, sunX, HORIZON, (SHORE - HORIZON) * 1.5);
  glint.addColorStop(0, "rgba(255, 242, 205, 0.3)");
  glint.addColorStop(0.5, "rgba(255, 242, 205, 0.1)");
  glint.addColorStop(1, "rgba(255, 242, 205, 0)");
  g.fillStyle = glint;
  g.fillRect(0, HORIZON, width, SHORE - HORIZON);

  // Wellenkämme — nach vorn hin länger, heller und weiter auseinander
  g.lineCap = "round";
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const y = HORIZON + 5 + t * t * (SHORE - HORIZON - 14);
    const len = 12 + t * 62;
    g.strokeStyle = `rgba(234, 250, 255, ${0.1 + t * 0.32})`;
    g.lineWidth = 1 + t * 2;
    const gap = len * 2.4;
    const shift = (i * 37) % gap;
    for (let x = -gap + shift; x < width + gap; x += gap) {
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len / 2, y - 2 - t * 3.5, x + len, y);
      g.stroke();
    }
  }

  // Schaumkante am Ufer
  g.fillStyle = "rgba(236, 252, 255, 0.85)";
  g.beginPath();
  g.moveTo(0, SHORE - 4);
  for (let x = 0; x <= width; x += 26) {
    g.quadraticCurveTo(x + 13, SHORE - 4 + (x % 52 === 0 ? -6 : 6), x + 26, SHORE - 4);
  }
  g.lineTo(width, SHORE + 8);
  g.lineTo(0, SHORE + 8);
  g.closePath();
  g.fill();

  // Nasser Sand zwischen Wasser und Spielfeld
  const wet = g.createLinearGradient(0, SHORE, 0, GROUND_Y);
  wet.addColorStop(0, "#a98a5b");
  wet.addColorStop(1, "#c7a370");
  g.fillStyle = wet;
  g.fillRect(0, SHORE + 6, width, GROUND_Y - SHORE - 6);

  // Palmen: außen zwei große am Feldrand, dahinter zwei kleinere am Ufer als Tiefe
  drawPalm(g, 168, SHORE + 22, 132, 1);
  drawPalm(g, width - 178, SHORE + 18, 122, -1);
  drawPalm(g, 44, GROUND_Y - 2, 246, -1);
  drawPalm(g, width - 44, GROUND_Y - 2, 262, 1);

  // Spielfeldsand
  const sand = g.createLinearGradient(0, GROUND_Y, 0, WORLD_H);
  sand.addColorStop(0, "#e0b87d");
  sand.addColorStop(1, "#b78d55");
  g.fillStyle = sand;
  g.fillRect(0, GROUND_Y, width, WORLD_H - GROUND_Y);
  g.fillStyle = "#f0cf9a";
  g.fillRect(0, GROUND_Y, width, 4);

  // Sandkörnung
  g.fillStyle = "rgba(90, 62, 30, 0.13)";
  for (let i = 0; i < 260; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const y = (Math.sin(i * 78.233) * 12345.6789) % 1;
    g.fillRect(
      Math.abs(x) * width,
      GROUND_Y + 6 + Math.abs(y) * (WORLD_H - GROUND_Y - 8),
      2,
      2
    );
  }
}

const bgCache = new Map();

export function getBackground(width, dpr) {
  const key = `${width}:${dpr}`;
  const cached = bgCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(WORLD_H * dpr));
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintBeach(g, width);
  if (bgCache.size > 6) bgCache.delete(bgCache.keys().next().value);
  bgCache.set(key, canvas);
  return canvas;
}

// ── Spielobjekte ────────────────────────────────────────────────────────────

function drawPillar(ctx, netX, netTop) {
  const x = netX - NET_RADIUS;
  const w = NET_RADIUS * 2;

  ctx.fillStyle = "rgba(60, 38, 12, 0.28)";
  ctx.beginPath();
  ctx.ellipse(netX, GROUND_Y + 7, NET_RADIUS * 2.2, 7, 0, 0, TAU);
  ctx.fill();

  const body = ctx.createLinearGradient(x, 0, x + w, 0);
  body.addColorStop(0, "#fdfdff");
  body.addColorStop(0.35, "#e8e8f1");
  body.addColorStop(1, "#9d9db2");
  ctx.fillStyle = body;
  ctx.fillRect(x, netTop, w, GROUND_Y - netTop);

  // Maschen
  ctx.fillStyle = "rgba(30, 30, 44, 0.3)";
  for (let y = netTop + 13; y < GROUND_Y - 3; y += 13) ctx.fillRect(x, y, w, 3);

  ctx.strokeStyle = "rgba(40, 40, 56, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 0.75, GROUND_Y);
  ctx.lineTo(x + 0.75, netTop);
  ctx.moveTo(x + w - 0.75, GROUND_Y);
  ctx.lineTo(x + w - 0.75, netTop);
  ctx.stroke();

  // Kappe — genau die Kugel, an der der Ball abprallt, und die Fläche, auf der ein Blob
  // landen kann. Dunkel abgesetzt, damit man sie beim Anspringen sieht.
  const cap = ctx.createLinearGradient(x, netTop - NET_RADIUS, x + w, netTop);
  cap.addColorStop(0, "#7c879b");
  cap.addColorStop(1, "#404a5e");
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.arc(netX, netTop, NET_RADIUS, Math.PI, TAU);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(netX, netTop, NET_RADIUS - 0.75, Math.PI * 1.08, Math.PI * 1.75);
  ctx.stroke();
}

// Winkel der gemeinsamen Tangente an beide Kugeln. Hängt nur vom Verhältnis der Radien
// zum Achsabstand ab, ist also unabhängig vom Maßstab.
const HULL_ALPHA = Math.asin(
  (BLOBBY_LOWER_RADIUS - BLOBBY_UPPER_RADIUS) / (BLOBBY_LOWER_SPHERE + BLOBBY_UPPER_SPHERE)
);

// Umriss = konvexe Hülle beider Kugeln: Kopfbogen, Tangente, Bauchbogen, Tangente zurück.
// Exakt die Form, gegen die auch der Ball prallt (physics.js: blobDistance).
function blobHullPath(ctx, x, upperY, upperR, lowerY, lowerR) {
  ctx.beginPath();
  ctx.arc(x, upperY, upperR, Math.PI + HULL_ALPHA, TAU - HULL_ALPHA);
  ctx.arc(x, lowerY, lowerR, TAU - HULL_ALPHA, Math.PI + HULL_ALPHA);
  ctx.closePath();
}

function drawBlob(ctx, b, color, ball, name, scale, mirror) {
  const upperY = b.y - BLOBBY_UPPER_SPHERE * scale;
  const upperR = BLOBBY_UPPER_RADIUS * scale;
  const lowerY = b.y + BLOBBY_LOWER_SPHERE * scale;
  const lowerR = BLOBBY_LOWER_RADIUS * scale;
  const air = Math.max(0, (GROUND_Y - 44.5 * scale) - b.y);

  // Schatten schrumpft mit der Sprunghöhe
  const shrink = Math.max(0.35, 1 - air / 420);
  ctx.fillStyle = `rgba(58, 36, 12, ${0.34 * shrink})`;
  ctx.beginPath();
  ctx.ellipse(b.x, GROUND_Y + 6, lowerR * shrink, 7 * shrink, 0, 0, TAU);
  ctx.fill();

  // Körper
  const shade = ctx.createLinearGradient(0, upperY - upperR, 0, lowerY + lowerR);
  shade.addColorStop(0, color);
  shade.addColorStop(1, "rgba(0, 0, 0, 0.35)");
  blobHullPath(ctx, b.x, upperY, upperR, lowerY, lowerR);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Auge schaut zum Ball
  const eyeCy = upperY - 3 * scale;
  let dx = ball.x - b.x, dy = ball.y - eyeCy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(b.x + dx * 7 * scale, eyeCy + dy * 5 * scale, 7.5 * scale, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#15151c";
  ctx.beginPath();
  ctx.arc(b.x + dx * 10 * scale, eyeCy + dy * 7 * scale, 3.6 * scale, 0, TAU);
  ctx.fill();

  if (name) {
    // Im gespiegelten Feld muss die Schrift zurückgedreht werden, sonst steht sie verkehrt
    ctx.save();
    ctx.translate(b.x, upperY - upperR - 12);
    if (mirror) ctx.scale(-1, 1);
    ctx.font = "bold 17px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
    ctx.strokeText(name, 0, 0);
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fillText(name, 0, 0);
    ctx.restore();
  }
}

// Klassischer Volleyball: weißes Leder, drei geschwungene Panelbahnen, Nähte
function drawBall(ctx, ball, rot) {
  ctx.fillStyle = "rgba(58, 36, 12, 0.24)";
  ctx.beginPath();
  ctx.ellipse(ball.x, GROUND_Y + 6, BALL_RADIUS * 0.78, 6, 0, 0, TAU);
  ctx.fill();

  const r = BALL_RADIUS;
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(rot);

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.clip();

  ctx.fillStyle = "#f7f7f1";
  ctx.fillRect(-r, -r, r * 2, r * 2);

  const panels = ["#f7f7f1", "#1f62bd", "#f2c22e"];
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate((i * TAU) / 3);
    ctx.fillStyle = panels[i];
    ctx.beginPath();
    ctx.moveTo(-r * 1.5, -r * 1.5);
    ctx.quadraticCurveTo(r * 0.2, 0, -r * 1.5, r * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Nähte
  ctx.strokeStyle = "rgba(40, 40, 48, 0.55)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate((i * TAU) / 3);
    ctx.beginPath();
    ctx.moveTo(-r * 1.5, -r * 1.5);
    ctx.quadraticCurveTo(r * 0.2, 0, -r * 1.5, r * 1.5);
    ctx.stroke();
    ctx.restore();
  }

  // Lichtkante oben links
  const gloss = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.15);
  gloss.addColorStop(0, "rgba(255, 255, 255, 0.42)");
  gloss.addColorStop(0.55, "rgba(255, 255, 255, 0)");
  gloss.addColorStop(1, "rgba(0, 0, 0, 0.24)");
  ctx.fillStyle = gloss;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();

  ctx.strokeStyle = "rgba(35, 35, 45, 0.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r - 1, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// Der Ball kann über den oberen Rand hinausfliegen — dann zeigt eine Marke am Rand, wo er
// gerade steht, damit man nicht blind auf sein Wiederauftauchen wartet.
function drawBallMarker(ctx, ball, width) {
  const x = Math.max(34, Math.min(width - 34, ball.x));

  ctx.save();
  ctx.translate(x, 36);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = 3.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-9, -13);
  ctx.lineTo(0, -23);
  ctx.lineTo(9, -13);
  ctx.stroke();

  ctx.fillStyle = "rgba(10, 22, 38, 0.55)";
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, TAU);
  ctx.fill();

  // Mini-Volleyball
  ctx.fillStyle = "#f7f7f1";
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#1f62bd";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0.55, 2.35);
  ctx.stroke();
  ctx.strokeStyle = "#e0ae1f";
  ctx.beginPath();
  ctx.arc(0, 0, 11, 3.7, 5.5);
  ctx.stroke();
  ctx.strokeStyle = "rgba(30, 30, 45, 0.65)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawGlyph(ctx, type, r) {
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const u = r * 0.42;

  const arrow = (dir, offY) => {
    ctx.beginPath();
    ctx.moveTo(0, offY + dir * u * 1.1);
    ctx.lineTo(0, offY + dir * u * 0.1);
    ctx.moveTo(-u * 0.55, offY + dir * u * 0.6);
    ctx.lineTo(0, offY + dir * u * 1.15);
    ctx.lineTo(u * 0.55, offY + dir * u * 0.6);
    ctx.stroke();
  };

  if (type === "speed") {
    for (const dx of [-u * 0.55, u * 0.35]) {
      ctx.beginPath();
      ctx.moveTo(dx - u * 0.25, -u * 0.8);
      ctx.lineTo(dx + u * 0.5, 0);
      ctx.lineTo(dx - u * 0.25, u * 0.8);
      ctx.stroke();
    }
  } else if (type === "grow") {
    arrow(-1, 0);
    arrow(1, 0);
  } else if (type === "shrink") {
    ctx.beginPath();
    ctx.moveTo(0, -u * 1.15);
    ctx.lineTo(0, -u * 0.15);
    ctx.moveTo(-u * 0.55, -u * 0.7);
    ctx.lineTo(0, -u * 0.15);
    ctx.lineTo(u * 0.55, -u * 0.7);
    ctx.moveTo(0, u * 1.15);
    ctx.lineTo(0, u * 0.15);
    ctx.moveTo(-u * 0.55, u * 0.7);
    ctx.lineTo(0, u * 0.15);
    ctx.lineTo(u * 0.55, u * 0.7);
    ctx.stroke();
  } else if (type === "netHigh" || type === "netLow") {
    const up = type === "netHigh";
    ctx.beginPath();
    ctx.moveTo(-u * 0.95, up ? u * 0.85 : -u * 0.85);
    ctx.lineTo(u * 0.95, up ? u * 0.85 : -u * 0.85);
    ctx.stroke();
    arrow(up ? -1 : 1, up ? u * 0.2 : -u * 0.2);
  }
}

function drawPowerup(ctx, p, bob, mirror) {
  const type = POWERUP_TYPES[p.t] || "speed";
  const color = POWERUP_COLOR[type] || "#38bdf8";
  const y = p.y + Math.sin(bob) * 6;
  const r = POWERUP_RADIUS;

  ctx.save();
  ctx.translate(p.x, y);
  if (mirror) ctx.scale(-1, 1);   // Sinnbild soll lesbar bleiben, nicht spiegelverkehrt

  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.arc(0, 3, r + 2, 0, TAU);
  ctx.fill();

  const fill = ctx.createLinearGradient(0, -r, 0, r);
  fill.addColorStop(0, color);
  fill.addColorStop(1, "rgba(0, 0, 0, 0.45)");
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r - 1, 0, TAU);
  ctx.stroke();

  drawGlyph(ctx, type, r);
  ctx.restore();
}

// ── Gesamtbild ──────────────────────────────────────────────────────────────

export function drawScene(ctx, w, opts) {
  const { names, slots, dpr, mirror } = opts;
  const bg = getBackground(w.width, dpr);
  ctx.drawImage(bg, 0, 0, w.width, WORLD_H);

  drawPillar(ctx, w.netX, w.netTop);

  // Hintere Reihe zuerst, damit der vordere Spieler im 2v2 oben liegt
  for (const slot of [...slots].sort((a, b) => b - a)) {
    const b = w.blobs[slot];
    if (!b) continue;
    drawBlob(ctx, b, SLOT_COLOR[slot].hex, w.ball, names[slot], b.scale || 1, mirror);
  }

  if (w.powerup) drawPowerup(ctx, w.powerup, w.bob, mirror);
  drawBall(ctx, w.ball, w.rot);
  if (w.ball.y < 0) drawBallMarker(ctx, w.ball, w.width);
}
