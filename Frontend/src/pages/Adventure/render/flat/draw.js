// render/flat/draw.js — Bausteine für den flachen Zeichenstil ("flach & rund", Oktober 2026): alle Figuren und
// Gegenstände sind Vektorformen in zwei Farbtönen, ohne Konturen und ohne Bilddateien.
//
// Konvention für Figuren: der Ursprung liegt zwischen den Füßen, die Figur schaut nach rechts und ist etwa 100 Einheiten
// hoch (−100 … 0 auf der y-Achse). Der Renderer verschiebt, skaliert und spiegelt vorher (siehe drawFigure).

export const TAU = Math.PI * 2;

export function circle(c, x, y, r, col) {
  c.fillStyle = col;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}

export function ell(c, x, y, rx, ry, col, rot = 0) {
  c.fillStyle = col;
  c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); c.fill();
}

export function rrect(c, x, y, w, h, r, col) {
  c.fillStyle = col;
  c.beginPath(); c.roundRect(x, y, w, h, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)); c.fill();
}

export function poly(c, pts, col) {
  c.fillStyle = col;
  c.beginPath();
  for (let i = 0; i < pts.length; i += 2) (i ? c.lineTo : c.moveTo).call(c, pts[i], pts[i + 1]);
  c.closePath(); c.fill();
}

export function line(c, x1, y1, x2, y2, w, col) {
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = "round";
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}

export function curve(c, x1, y1, cx, cy, x2, y2, w, col) {
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = "round";
  c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(cx, cy, x2, y2); c.stroke();
}

// Fläche in zwei Tönen: oben hell, ab splitY dunkel (ersetzt Schattierung, bleibt flach)
export function twoTone(c, path, light, dark, splitY) {
  c.save();
  c.beginPath(); path(c);
  c.fillStyle = light; c.fill();
  c.clip();
  c.fillStyle = dark; c.fillRect(-500, splitY, 1000, 1000);
  c.restore();
}

// Zwei Augen; look = wie weit die Pupillen nach vorn (rechts) wandern
export function eyes(c, x, y, r, gap, opts = {}) {
  const { look = 0.35, white = "#ffffff", pupil = "#1a1622", glow = null, pr = 0.55 } = opts;
  for (const s of [-1, 1]) {
    const ex = x + s * gap / 2;
    if (glow) { circle(c, ex, y, r, glow); continue; }
    circle(c, ex, y, r, white);
    circle(c, ex + r * look, y + r * 0.08, r * pr, pupil);
  }
}

// Wippen beim Laufen / leichtes Atmen im Stand
export const bob = (p, amp = 5, speed = 11) => (p.move ? -Math.abs(Math.sin(p.t * speed)) * amp : Math.sin(p.t * 2.4) * 1.2);
// Schrittwinkel −1 … 1 (Beine/Arme schwingen gegenläufig)
export const step = (p, speed = 11) => (p.move ? Math.sin(p.t * speed) : 0);
// Angriff: 0 → 1 → 0 in der Mitte am stärksten
export const strike = (p) => (p.atk >= 0 && p.atk <= 1 ? Math.sin(p.atk * Math.PI) : 0);

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f))));
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Krone für Bosse (auf Kopfhöhe y, Breite w)
export function crown(c, x, y, w, col = "#f5cf4a") {
  const h = w * 0.55;
  poly(c, [x - w / 2, y, x - w / 2, y - h * 0.6, x - w / 4, y - h * 0.25, x, y - h, x + w / 4, y - h * 0.25, x + w / 2, y - h * 0.6, x + w / 2, y], col);
  circle(c, x, y - h * 0.15, w * 0.08, "#d9473a");
}
