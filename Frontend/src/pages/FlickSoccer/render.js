// render.js — zeichnet die Szene auf ein Canvas: vorgezeichnetes Feld (fieldArt.js), Spielerscheiben (discArt.js),
// Ball mit Spur, Ziel-Pfeil und die Effekte (Torjubel, aufblitzendes Netz, Staubringe, Explosion, Wackeln).
// Alles in Feld-Einheiten; `view` bildet sie auf Canvas-Pixel ab. Das Feld kommt aus fields.js (scene.field), der
// Ball aus den persönlichen Einstellungen (scene.look, Katalog in progress.js).

import { FIELD, PIECE, BALL, TEAM_SIZE, AIM, getField } from './engine/index.js';
import { TEAM_COLORS, drawDiscBody, setFont, star } from './discArt.js';
import { drawBackground, drawFieldLive, pitchPath, playAreaPath, worldOf } from './fieldArt.js';

export { TEAM_COLORS, worldOf };

// Das Stadion bestimmt das Seitenverhältnis der Spielfläche im Layout; andere Felder werden darin eingepasst.
export const WORLD = Object.freeze(worldOf(FIELD));

const LIME = '#c8f03c';
const INK = '#0b110e';

/** Abbildung Feld → Canvas für eine Zeichenfläche von cssW × cssH Pixeln (Feld mittig eingepasst). */
export function makeView(cssW, cssH, fieldId) {
  const world = worldOf(getField(fieldId));
  const scale = Math.min(cssW / world.w, cssH / world.h);
  return {
    scale,
    ox: (cssW - world.w * scale) / 2 - world.x0 * scale,
    oy: (cssH - world.h * scale) / 2 - world.y0 * scale,
  };
}

export function toWorld(view, px, py) {
  return { x: (px - view.ox) / view.scale, y: (py - view.oy) / view.scale };
}

// Hintergrund ändert sich nie → pro Größe, Feld und Rasen einmal vorzeichnen
const bgCache = new Map();

function ensureBackground(view, cssW, cssH, dpr, field, turf) {
  // der eigene Rasen zählt nur auf Rasenfeldern
  const key = `${cssW}x${cssH}@${dpr}/${field.id}/${field.theme === 'rasen' ? turf : '-'}`;
  const hit = bgCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(cssW * dpr));
  c.height = Math.max(1, Math.round(cssH * dpr));
  const g = c.getContext('2d');
  g.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, view.ox * dpr, view.oy * dpr);
  drawBackground(g, field, turf);
  // Mehrere Spielfelder sind gleichzeitig sichtbar (Menü-Vorschau, Größenwechsel) — ein paar behalten, alte verwerfen
  if (bgCache.size >= 8) bgCache.delete(bgCache.keys().next().value);
  bgCache.set(key, c);
  return c;
}

/**
 * Scheibe mit Schatten und Auswahlring. scale: Größenfaktor (Karten Riese, Schrumpfstrahl), frozen: eingefroren
 * (Eiszeit), ghost: durchscheinend (Geisterscheibe), look: Einheitsvektor zum Ball (Motive, die hinschauen).
 */
function drawDisc(ctx, x, y, team, number, { ring, faded, time, skin, scale = 1, frozen = false, ghost = false, look = null }) {
  const r = PIECE.R * scale;
  // Schatten (ein Geist wirft keinen)
  if (!ghost) {
    ctx.fillStyle = 'rgb(0 0 0 / 0.34)';
    ctx.beginPath();
    ctx.ellipse(x + 1.5, y + 5, r, r * 0.97, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = ghost ? 0.5 : faded ? 0.8 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawDiscBody(ctx, 0, 0, team, number, skin, look);
  ctx.restore();
  ctx.globalAlpha = 1;
  if (ghost) {
    ctx.strokeStyle = 'rgb(255 255 255 / 0.8)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (frozen) {
    // Eisschicht: heller Schleier, eisblauer Rand, ein paar Risse
    ctx.fillStyle = 'rgb(190 228 255 / 0.5)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#dff3ff';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI + 0.4;
      ctx.moveTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75);
      ctx.lineTo(x - Math.cos(a) * r * 0.75, y - Math.sin(a) * r * 0.75);
    }
    ctx.stroke();
  }

  if (ring === 'aim') {
    ctx.strokeStyle = LIME;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, r + 7, 0, Math.PI * 2);
    ctx.stroke();
  } else if (ring === 'cancel') {
    // gewählt, aber zurück auf die Scheibe gezogen: Loslassen bricht ab
    ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    setFont(ctx, 800, 15, { stretch: 'semi-condensed' });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = 'LOSLASSEN = ABBRECHEN';
    const tw = ctx.measureText(label).width + 14;
    const ly = y + r + 24;
    ctx.fillStyle = INK;
    ctx.fillRect(x - tw / 2, ly - 11, tw, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, ly + 1);
  } else if (ring === 'hover') {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
  } else if (ring === 'can') {
    // drehender Strichring: zeigt, welche Scheiben gerade schießen dürfen
    ctx.strokeStyle = 'rgb(255 255 255 / 0.85)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 9]);
    ctx.lineDashOffset = -time / 40;
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }
}

// ── Ball ──────────────────────────────────────────────────────────────────────────────────

const BALL_LOOK = {
  klassik: { body: '#fbfbf8', mark: '#161b18', edge: '#161b18' },
  neon: { body: '#c8f03c', mark: '#0b110e', edge: '#0b110e' },
  gold: { body: '#e9c24a', mark: '#7a5a08', edge: '#5a4206' },
};

/** Ball ohne Schatten und Spur. rot: Drehwinkel des Musters. */
function drawBallBody(ctx, x, y, r, skin, rot) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  let edge = '#161b18';
  if (skin === 'strand') {
    // Strandball: sechs farbige Keile
    const cols = ['#ef4136', '#fbfbf8', '#2f7cf6', '#fbfbf8', '#ffc93c', '#fbfbf8'];
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = cols[i];
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r + 1, rot + (i / 6) * Math.PI * 2, rot + ((i + 1) / 6) * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#fbfbf8';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else if (skin === 'stern') {
    ctx.fillStyle = '#fbfbf8';
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.fillStyle = '#e9b425';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    star(ctx, 0, 0, r * 0.82, r * 0.36);
    ctx.fill();
    ctx.restore();
  } else if (skin === 'acht') {
    ctx.fillStyle = '#14181a';
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    const cx = x + Math.cos(rot) * r * 0.22;
    const cy = y + Math.sin(rot) * r * 0.22;
    ctx.fillStyle = '#fbfbf8';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14181a';
    setFont(ctx, 900, Math.round(r * 0.74));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('8', cx, cy + r * 0.04);
    edge = '#000';
  } else if (skin === 'tennis') {
    ctx.fillStyle = '#d6e84a';
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.strokeStyle = '#fbfbf8';
    ctx.lineWidth = r * 0.14;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + Math.cos(rot) * r * 1.15 * s, y + Math.sin(rot) * r * 1.15 * s, r * 0.9, 0, Math.PI * 2);
      ctx.stroke();
    }
    edge = '#8a9a1c';
  } else if (skin === 'basket') {
    ctx.fillStyle = '#e07a2c';
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.strokeStyle = '#2a1608';
    ctx.lineWidth = r * 0.1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * r * 1.25, 0, r * 0.85, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    edge = '#2a1608';
  } else if (skin === 'bowling') {
    ctx.fillStyle = '#243078';
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.fillStyle = '#3d4fb0';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0c1030';
    for (const [a, d] of [[rot, 0.42], [rot + 0.85, 0.42], [rot + 0.42, 0.05]]) {
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * d, y + Math.sin(a) * r * d, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    edge = '#0c1030';
  } else if (skin === 'melone') {
    ctx.fillStyle = '#4c9e45';
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = '#256a2c';
    ctx.lineWidth = r * 0.2;
    for (const k of [-0.7, -0.24, 0.24, 0.7]) {
      ctx.beginPath();
      ctx.moveTo(k * r, -r);
      ctx.quadraticCurveTo(k * r * 1.5, 0, k * r, r);
      ctx.stroke();
    }
    ctx.restore();
    edge = '#1c4d21';
  } else if (skin === 'disco') {
    const tones = ['#e3eaee', '#aab6c0', '#f9fcfd', '#c4ced6'];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot * 0.5);
    const s = r * 0.42;
    for (let i = -3; i < 3; i++) {
      for (let j = -3; j < 3; j++) {
        ctx.fillStyle = tones[(((i * 3 + j * 5) % 4) + 4) % 4];
        ctx.fillRect(i * s, j * s, s - 0.8, s - 0.8);
      }
    }
    ctx.restore();
    edge = '#5f6b75';
  } else if (skin === 'erde') {
    ctx.fillStyle = '#2f7cd6';
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.fillStyle = '#46ad55';
    for (const [a, d, rr] of [[rot, 0.45, 0.42], [rot + 2.2, 0.5, 0.36], [rot + 4.1, 0.55, 0.3], [rot + 3.1, 0.05, 0.2]]) {
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r * d, y + Math.sin(a) * r * d, r * rr, r * rr * 0.7, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgb(255 255 255 / 0.75)';
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(rot + 1.1) * r * 0.5, y + Math.sin(rot + 1.1) * r * 0.5, r * 0.3, r * 0.1, rot, 0, Math.PI * 2);
    ctx.fill();
    edge = '#143d73';
  } else if (skin === 'smiley') {
    ctx.fillStyle = '#ffd23c';
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = '#2a1e00';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * r * 0.33, -r * 0.22, r * 0.11, r * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#2a1e00';
    ctx.lineWidth = r * 0.13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, r * 0.05, r * 0.5, 0.25, Math.PI - 0.25);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.restore();
    edge = '#8a6a00';
  } else if (skin === 'feuer') {
    ctx.fillStyle = '#ff5a3c';
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.fillStyle = '#ffb02e';
    star(ctx, x, y, r * 0.95, r * 0.5, 7);
    ctx.fill();
    ctx.fillStyle = '#fff1a8';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    edge = '#b3261a';
  } else {
    // Fußball-Muster in drei Farbvarianten
    const look = BALL_LOOK[skin] || BALL_LOOK.klassik;
    edge = look.edge;
    ctx.fillStyle = look.body;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.fillStyle = look.mark;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = rot + (i / 5) * Math.PI * 2;
      const px = x + Math.cos(a) * r * 0.36;
      const py = y + Math.sin(a) * r * 0.36;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const a = rot + ((i + 0.5) / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 1.02, y + Math.sin(a) * r * 1.02, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

// Bälle mit farbiger Spur (sonst weiß)
const TRAIL_COLOR = { feuer: '255 130 40', neon: '200 240 60', gold: '233 194 74', tennis: '214 232 74', disco: '200 225 255' };

function drawBall(ctx, x, y, trail, skin, scale = 1) {
  const r = BALL.R * scale;
  // Spur: die letzten Positionen, zum Ende hin kleiner und blasser
  if (trail && trail.length > 1) {
    for (let i = 0; i < trail.length - 1; i++) {
      const k = (i + 1) / trail.length;
      ctx.fillStyle = `rgb(${TRAIL_COLOR[skin] || '255 255 255'} / ${(TRAIL_COLOR[skin] ? 0.4 : 0.22) * k})`;
      ctx.beginPath();
      ctx.arc(trail[i].x, trail[i].y, r * (0.35 + 0.55 * k), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgb(0 0 0 / 0.34)';
  ctx.beginPath();
  ctx.arc(x + 1.5, y + 4, r, 0, Math.PI * 2);
  ctx.fill();
  // Muster dreht sich mit dem Weg, den der Ball rollt (grob: Summe der Koordinaten)
  drawBallBody(ctx, x, y, r, skin, ((x + y) / r) * 0.5);
}

// ── Ziel-Pfeil ────────────────────────────────────────────────────────────────────────────

export function powerColor(p) {
  if (p < 0.45) return LIME;
  if (p < 0.78) return '#ffc93c';
  return '#ff5a3c';
}

/**
 * Ziel-Pfeil: zeigt vom Stein weg in Schussrichtung, Länge und Farbe = Kraft. drag = Zeigerposition (Feld).
 * main: false → nur der Pfeil, ohne Zuglinie und Zahl (die Mitläufer bei „Alle Mann").
 */
function drawAim(ctx, piece, aim, main = true) {
  const p = Math.hypot(aim.sx, aim.sy);
  if (p <= 0) return;
  const dx = aim.sx / p;
  const dy = aim.sy / p;
  if (aim.drag && main) {
    const back = Math.min(Math.hypot(aim.drag.x - piece.x, aim.drag.y - piece.y), AIM.DEAD_ZONE + AIM.MAX_DRAG);
    ctx.strokeStyle = 'rgb(255 255 255 / 0.65)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.moveTo(piece.x, piece.y);
    ctx.lineTo(piece.x - dx * back, piece.y - dy * back);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(piece.x - dx * back, piece.y - dy * back, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  const start = PIECE.R + 10;
  const len = 34 + p * 240;
  const head = 28;
  const sx = piece.x + dx * start;
  const sy = piece.y + dy * start;
  const ex = piece.x + dx * (start + len);
  const ey = piece.y + dy * (start + len);
  const bx = ex - dx * head;
  const by = ey - dy * head;
  const nx = -dy;
  const ny = dx;
  const w0 = 2.5; // schmal am Stein, breit zur Spitze
  const w1 = 5 + p * 4;
  ctx.beginPath();
  ctx.moveTo(sx + nx * w0, sy + ny * w0);
  ctx.lineTo(bx + nx * w1, by + ny * w1);
  ctx.lineTo(bx + nx * (w1 + 10), by + ny * (w1 + 10));
  ctx.lineTo(ex, ey);
  ctx.lineTo(bx - nx * (w1 + 10), by - ny * (w1 + 10));
  ctx.lineTo(bx - nx * w1, by - ny * w1);
  ctx.lineTo(sx - nx * w0, sy - ny * w0);
  ctx.closePath();
  ctx.fillStyle = powerColor(p);
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (!main) return;

  const label = `${Math.round(p * 100)}`;
  const lx = ex + dx * 30;
  const ly = ey + dy * 30;
  setFont(ctx, 900, 24, { italic: true, stretch: 'expanded' });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width + 16;
  ctx.fillStyle = INK;
  ctx.fillRect(lx - tw / 2, ly - 15, tw, 30);
  ctx.fillStyle = powerColor(p);
  ctx.fillText(label, lx, ly + 1);
}

// ── Effekte ───────────────────────────────────────────────────────────────────────────────

/** Netz-Aufblitzen beim Tor (unter den Figuren). */
function drawNetFlash(ctx, f, flash, time) {
  if (!flash) return;
  const age = time - flash.start;
  if (age >= 1100) return;
  const x = flash.side === 0 ? -f.GOAL_D : f.W;
  ctx.fillStyle = TEAM_COLORS[flash.team].main;
  ctx.globalAlpha = 0.75 * (1 - age / 1100);
  ctx.fillRect(x, f.G0, f.GOAL_D, f.GOAL_W);
  // Netz beult sich: helle Querlinie wandert nach hinten
  const depth = Math.min(1, age / 300) * f.GOAL_D;
  ctx.fillStyle = '#fff';
  ctx.fillRect(flash.side === 0 ? -depth - 3 : f.W + depth, f.G0, 3, f.GOAL_W);
  ctx.globalAlpha = 1;
}

/** Ringe (Staub beim harten Aufprall, Druckwelle beim Jubel) und Teilchen, über allem. */
function drawParticles(ctx, fx, time) {
  for (const r of fx.rings) {
    const k = (time - r.start) / r.dur;
    if (k < 0 || k >= 1) continue;
    ctx.globalAlpha = (1 - k) * (r.alpha || 0.8);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = (r.width || 4) * (1 - k * 0.6);
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)), 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const p of fx.particles) {
    if (p.delay > 0) continue; // startet später (Feuerwerk)
    const k = p.life / p.max;
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.fillStyle = p.color;
    if (p.shape === 'dot') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'star') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      star(ctx, 0, 0, p.w, p.w * 0.45);
      ctx.fill();
      ctx.restore();
    } else if (p.shape === 'heart') {
      const s = p.w;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + s * 0.9);
      ctx.bezierCurveTo(p.x - s * 1.5, p.y - s * 0.1, p.x - s * 0.7, p.y - s * 1.1, p.x, p.y - s * 0.35);
      ctx.bezierCurveTo(p.x + s * 0.7, p.y - s * 1.1, p.x + s * 1.5, p.y - s * 0.1, p.x, p.y + s * 0.9);
      ctx.fill();
    } else if (p.shape === 'coin') {
      // Münze, die sich im Flug dreht: mal breit, mal schmal
      const wx = p.w * (0.25 + 0.75 * Math.abs(Math.cos(p.rot)));
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, wx, p.w, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a67c18';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (p.shape === 'square') {
      ctx.fillRect(p.x - p.w / 2, p.y - p.w / 2, p.w, p.w);
    } else {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 1.7)) + 1);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

/** Gummibande: die Banden leuchten als laufende Strichlinie. */
function drawRubberWalls(ctx, f, time) {
  ctx.strokeStyle = LIME;
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 12]);
  ctx.lineDashOffset = -time / 25;
  // Umriss der Spielfläche (mit schrägen oder runden Ecken), an den Tormündern offen, dazu die drei Seiten der Torkästen
  const { W, H, G0, G1, GOAL_D: D } = f;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-D - 40, -40, W + 2 * D + 80, H + 80);
  ctx.rect(-8, G0 + 3, 16, G1 - G0 - 6);
  ctx.rect(W - 8, G0 + 3, 16, G1 - G0 - 6);
  ctx.clip('evenodd');
  pitchPath(ctx, f, 0);
  ctx.stroke();
  ctx.restore();
  for (const [mouth, back] of [[0, -D], [W, W + D]]) {
    ctx.beginPath();
    ctx.moveTo(mouth, G0);
    ctx.lineTo(back, G0);
    ctx.lineTo(back, G1);
    ctx.lineTo(mouth, G1);
    ctx.stroke();
  }
  for (const w of f.inner) {
    ctx.beginPath();
    ctx.moveTo(w[0], w[1]);
    ctx.lineTo(w[2], w[3]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

/** Glatteis: eine dünne Eisschicht über der ganzen Spielfläche, mit ein paar hellen Schlieren. */
function drawIceSheet(ctx, f) {
  ctx.save();
  playAreaPath(ctx, f);
  ctx.clip();
  ctx.fillStyle = 'rgb(196 230 255 / 0.3)';
  ctx.fillRect(-f.GOAL_D, 0, f.W + 2 * f.GOAL_D, f.H);
  ctx.strokeStyle = 'rgb(255 255 255 / 0.5)';
  ctx.lineWidth = 7;
  for (let k = -f.H; k < f.W; k += 190) {
    ctx.beginPath();
    ctx.moveTo(k, f.H);
    ctx.lineTo(k + f.H * 0.7, 0);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Ganze Szene zeichnen.
 * scene: {
 *   field: Feld-ID, look: { turf, ball }, skins: [Design Team 0, Design Team 1],
 *   pieces: [{ x, y, team, scale?, frozen? }], ball: { x, y }, trail: [{ x, y }],
 *   selectable: Set<index> | null   Scheiben, die gerade geschossen werden dürfen
 *   hover: index | null, aim: { piece, sx, sy, drag? } | null,
 *   rubber: Banden hervorheben (Power-up Gummibande),
 *   fx: { particles, rings, netFlash, shake: { x, y } } | null, time: ms
 * }
 */
export function drawScene(ctx, view, cssW, cssH, dpr, scene) {
  const f = getField(scene.field);
  const turf = scene.look?.turf || 'streifen';
  const shake = scene.fx?.shake || { x: 0, y: 0 };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d1612';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(ensureBackground(view, cssW, cssH, dpr, f, turf), shake.x * view.scale * dpr, shake.y * view.scale * dpr);
  ctx.setTransform(
    view.scale * dpr, 0, 0, view.scale * dpr,
    (view.ox + shake.x * view.scale) * dpr, (view.oy + shake.y * view.scale) * dpr,
  );

  const { pieces, ball, selectable, hover, aim, time = 0 } = scene;
  if (scene.ice) drawIceSheet(ctx, f);
  drawFieldLive(ctx, f, time, scene.fx?.bumperHits);
  if (scene.fx) drawNetFlash(ctx, f, scene.fx.netFlash, time);
  if (scene.rubber) drawRubberWalls(ctx, f, time);
  const aimPower = aim ? Math.hypot(aim.sx, aim.sy) : 0;
  pieces.forEach((p, i) => {
    let ring = null;
    if (aim && aim.piece === i) ring = aimPower > 0 ? 'aim' : 'cancel';
    else if (!aim && hover === i && selectable?.has(i)) ring = 'hover';
    else if (!aim && selectable?.has(i)) ring = 'can';
    const faded = !!selectable && selectable.size > 0 && !selectable.has(i);
    // Blick zum Ball (Auge, Grinser, Kompass)
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const d = Math.hypot(dx, dy);
    drawDisc(ctx, p.x, p.y, p.team, (i % TEAM_SIZE) + 1, {
      ring, faded, time, skin: scene.skins?.[p.team], scale: p.scale || 1, frozen: !!p.frozen, ghost: !!p.ghost,
      look: d > 1 ? { x: dx / d, y: dy / d } : null,
    });
  });
  drawBall(ctx, ball.x, ball.y, scene.dark ? null : scene.trail, scene.look?.ball || 'klassik', ball.scale || 1);
  if (scene.dark) drawDarkness(ctx, pieces, ball);
  if (aim) {
    // „Alle Mann": jede Scheibe des Teams bekommt denselben Pfeil
    if (scene.aimAll && aimPower > 0) {
      ctx.globalAlpha = 0.6;
      pieces.forEach((p, i) => {
        if (i !== aim.piece && p.team === pieces[aim.piece].team) drawAim(ctx, p, aim, false);
      });
      ctx.globalAlpha = 1;
    }
    drawAim(ctx, pieces[aim.piece], aim);
  }
  if (scene.fx) drawParticles(ctx, scene.fx, time);
}

/** Explosion des Sprengsatzes: Druckwellen und Funken. Liefert { particles, rings }. */
export function bombEffects(x, y, time) {
  const rings = [
    { x, y, start: time, dur: 420, r0: 12, r1: 260, color: '#ffffff', width: 12, alpha: 0.9 },
    { x, y, start: time + 60, dur: 520, r0: 8, r1: 200, color: '#ffb02e', width: 9, alpha: 0.85 },
    { x, y, start: time + 120, dur: 600, r0: 4, r1: 130, color: '#ff5a3c', width: 7, alpha: 0.8 },
  ];
  const colors = ['#ffb02e', '#ff5a3c', '#ffffff', '#ffe08a'];
  const particles = [];
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 300 + Math.random() * 900;
    const max = 0.35 + Math.random() * 0.55;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: 0, vr: 0, w: 5 + Math.random() * 7, h: 0,
      color: colors[i % colors.length], life: max, max, shape: 'dot',
    });
  }
  return { particles, rings };
}

/** Portal-Sprung: je ein Ring am Eingang (zieht sich zusammen wirkt wie Sog) und am Ausgang. */
export function portalRings(ev, time) {
  return [
    { x: ev.x, y: ev.y, start: time, dur: 300, r0: 44, r1: 8, color: '#a06bff', width: 5, alpha: 0.9 },
    { x: ev.x2, y: ev.y2, start: time, dur: 380, r0: 8, r1: 60, color: '#35d6c3', width: 5, alpha: 0.9 },
  ];
}

/** Staubring an einer Aufprallstelle; stärker = größer. speed: Aufprallgeschwindigkeit. */
export function impactRing(x, y, speed, time) {
  const k = Math.min(1, speed / 2400);
  return { x, y, start: time, dur: 320 + k * 180, r0: 6, r1: 26 + k * 46, color: '#ffffff', width: 3 + k * 3, alpha: 0.35 + k * 0.4 };
}

function confetti(team, x, y, dir, n, spread, extra = {}) {
  const colors = [TEAM_COLORS[team].main, TEAM_COLORS[team].light, '#ffffff', LIME];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.random() - 0.5) * spread;
    const sp = 250 + Math.random() * 900;
    const max = 0.9 + Math.random() * 1.1;
    out.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 120,
      vx: Math.cos(a) * sp * dir,
      vy: Math.sin(a) * sp,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 14,
      w: 6 + Math.random() * 8,
      h: 10 + Math.random() * 10,
      color: colors[i % colors.length],
      life: max,
      max,
      ...extra,
    });
  }
  return out;
}

/**
 * Torjubel im Canvas für ein Tor von `team` im Tor auf Seite `side` (0 = links). style: Katalog CELEBRATIONS.
 * Liefert { particles, rings } zum Anhängen an die laufenden Effekte.
 */
export function goalEffects(style, team, side, ball, fieldId, time) {
  const f = getField(fieldId);
  const gx = side === 0 ? 0 : f.W;
  const gy = Math.min(f.G1 - 10, Math.max(f.G0 + 10, ball.y));
  const dir = side === 0 ? 1 : -1; // ins Feld hinein
  const col = TEAM_COLORS[team];
  if (style === 'welle') {
    const rings = [0, 180, 360].map((delay, i) => ({
      x: gx, y: gy, start: time + delay, dur: 900, r0: 10, r1: 260 + i * 70, color: i === 1 ? '#ffffff' : col.main, width: 9, alpha: 0.9,
    }));
    return { particles: confetti(team, gx, gy, dir, 40, Math.PI * 0.95), rings };
  }
  if (style === 'feuerwerk') {
    // vier Raketen in der Hälfte vor dem Tor, nacheinander
    const particles = [];
    const rings = [];
    for (let k = 0; k < 4; k++) {
      const bx = gx + dir * (120 + Math.random() * (f.W * 0.4));
      const by = 70 + Math.random() * (f.H - 140);
      const color = [col.main, LIME, '#ffffff', col.light][k];
      rings.push({ x: bx, y: by, start: time + k * 220, dur: 500, r0: 4, r1: 90, color, width: 4, alpha: 0.7 });
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const sp = 260 + Math.random() * 240;
        const max = 0.7 + Math.random() * 0.6 + k * 0.22;
        particles.push({
          x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: 0, vr: 0, w: 7 + Math.random() * 4, h: 0,
          color, life: max, max, shape: 'dot', delay: k * 0.22,
        });
      }
    }
    return { particles, rings };
  }
  if (style === 'sterne') {
    const gold = ['#e9c24a', '#ffe08a', '#ffffff'];
    const particles = confetti(team, gx, gy, dir, 70, Math.PI * 0.95, { shape: 'star' });
    particles.forEach((p, i) => {
      p.color = gold[i % gold.length];
      p.w = 7 + Math.random() * 8;
    });
    return { particles, rings: [] };
  }
  if (style === 'explosion') {
    // Torexplosion: Druckwellen in Teamfarbe, Funken in alle Richtungen, kräftiges Wackeln
    const rings = [
      { x: gx, y: gy, start: time, dur: 520, r0: 14, r1: 380, color: '#ffffff', width: 14, alpha: 0.95 },
      { x: gx, y: gy, start: time + 70, dur: 640, r0: 10, r1: 300, color: col.main, width: 12, alpha: 0.9 },
      { x: gx, y: gy, start: time + 150, dur: 760, r0: 6, r1: 210, color: '#ffb02e', width: 9, alpha: 0.85 },
    ];
    const cols = [col.main, col.light, '#ffb02e', '#ffffff'];
    const particles = [];
    for (let i = 0; i < 90; i++) {
      const a = (Math.random() - 0.5) * Math.PI * 1.1;
      const sp = 400 + Math.random() * 1300;
      const max = 0.5 + Math.random() * 0.8;
      particles.push({
        x: gx, y: gy, vx: Math.cos(a) * sp * dir, vy: Math.sin(a) * sp, rot: 0, vr: 0, w: 6 + Math.random() * 9, h: 0,
        color: cols[i % cols.length], life: max, max, shape: 'dot',
      });
    }
    return { particles, rings, shake: 16 };
  }
  if (style === 'vulkan') {
    // Fontäne aus dem Tor, die im Bogen aufs Feld regnet
    const cols = ['#ff5a3c', '#ffb02e', '#ffe08a', col.main];
    const particles = [];
    for (let i = 0; i < 120; i++) {
      const max = 1.1 + Math.random() * 1.1;
      particles.push({
        x: gx, y: gy + (Math.random() - 0.5) * 60, vx: dir * (260 + Math.random() * 720), vy: -380 - Math.random() * 520,
        rot: 0, vr: 0, w: 5 + Math.random() * 8, h: 0, color: cols[i % cols.length], life: max, max, shape: 'dot',
        g: 1500, drag: 0.5, delay: Math.random() * 0.5,
      });
    }
    return { particles, rings: [{ x: gx, y: gy, start: time, dur: 500, r0: 8, r1: 150, color: '#ffb02e', width: 8, alpha: 0.8 }] };
  }
  if (style === 'schnee') {
    // Schnee über dem ganzen Feld
    const particles = [];
    for (let i = 0; i < 150; i++) {
      const max = 1.6 + Math.random() * 1.6;
      particles.push({
        x: Math.random() * f.W, y: -30 - Math.random() * f.H * 0.5, vx: (Math.random() - 0.5) * 60, vy: 240 + Math.random() * 260,
        rot: 0, vr: 0, w: 4 + Math.random() * 7, h: 0, color: i % 5 ? '#ffffff' : '#cfe8ff', life: max, max, shape: 'dot',
        drag: 0, delay: Math.random() * 0.9,
      });
    }
    return { particles, rings: [] };
  }
  if (style === 'muenzen') {
    // Goldmünzen sprudeln aus dem Tor
    const particles = [];
    for (let i = 0; i < 64; i++) {
      const max = 1 + Math.random() * 1.2;
      particles.push({
        x: gx, y: gy + (Math.random() - 0.5) * 90, vx: dir * (180 + Math.random() * 620), vy: -260 - Math.random() * 480,
        rot: Math.random() * 6, vr: 6 + Math.random() * 10, w: 7 + Math.random() * 5, h: 0,
        color: i % 3 ? '#e9c24a' : '#ffe08a', life: max, max, shape: 'coin', g: 1300, drag: 0.4, delay: Math.random() * 0.35,
      });
    }
    return { particles, rings: [] };
  }
  if (style === 'herzen') {
    // Herzen steigen vom Tor auf
    const cols = [col.light, '#ff7aa8', '#ffffff', col.main];
    const particles = [];
    for (let i = 0; i < 46; i++) {
      const max = 1.2 + Math.random() * 1.2;
      particles.push({
        x: gx + dir * Math.random() * 260, y: gy + (Math.random() - 0.5) * 220, vx: dir * (20 + Math.random() * 160), vy: -90 - Math.random() * 190,
        rot: 0, vr: 0, w: 8 + Math.random() * 9, h: 0, color: cols[i % cols.length], life: max, max, shape: 'heart',
        drag: 0.3, delay: Math.random() * 0.6,
      });
    }
    return { particles, rings: [] };
  }
  if (style === 'pixel') {
    // Klötzchen in Teamfarbe platzen aus dem Tor
    const particles = confetti(team, gx, gy, dir, 80, Math.PI * 0.95, { shape: 'square', vr: 0 });
    particles.forEach((p) => {
      p.w = 8 + Math.floor(Math.random() * 3) * 5;
    });
    return { particles, rings: [] };
  }
  return { particles: confetti(team, gx, gy, dir, 110, Math.PI * 0.95), rings: [] };
}

// Stromausfall: Dunkelheit mit Lichtkegeln um Scheiben und Ball, auf einer eigenen Fläche gestanzt
let darkCanvas = null;
function drawDarkness(ctx, pieces, ball) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (!darkCanvas) darkCanvas = document.createElement('canvas');
  if (darkCanvas.width !== w || darkCanvas.height !== h) {
    darkCanvas.width = w;
    darkCanvas.height = h;
  }
  const g = darkCanvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgb(2 4 7 / 0.93)';
  g.fillRect(0, 0, w, h);
  g.setTransform(ctx.getTransform());
  g.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r) => {
    g.fillStyle = 'rgb(0 0 0 / 0.55)';
    g.beginPath();
    g.arc(x, y, r * 1.35, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  for (const p of pieces) hole(p.x, p.y, PIECE.R * (p.scale || 1) + 30);
  hole(ball.x, ball.y, BALL.R * (ball.scale || 1) + 46);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(darkCanvas, 0, 0);
  ctx.restore();
}

// ── Vorschauen (Profil, Menü) ─────────────────────────────────────────────────────────────

function previewCtx(canvas, css) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(css * dpr);
  canvas.height = Math.round(css * dpr);
  return { ctx: canvas.getContext('2d'), px: css * dpr };
}

/** Einzelne Scheibe auf ein eigenes Canvas (Design-Auswahl). */
export function drawDiscPreview(canvas, skin, team, number = 7) {
  const { ctx, px } = previewCtx(canvas, canvas.clientWidth || 64);
  const scale = px / (PIECE.R * 2 + 6);
  ctx.setTransform(scale, 0, 0, scale, px / 2, px / 2);
  ctx.clearRect(-PIECE.R * 2, -PIECE.R * 2, PIECE.R * 4, PIECE.R * 4);
  drawDiscBody(ctx, 0, 0, team, number, skin);
}

/** Ball-Design auf ein eigenes Canvas. */
export function drawBallPreview(canvas, skin) {
  const { ctx, px } = previewCtx(canvas, canvas.clientWidth || 48);
  const scale = px / (BALL.R * 2 + 6);
  ctx.setTransform(scale, 0, 0, scale, px / 2, px / 2);
  ctx.clearRect(-BALL.R * 2, -BALL.R * 2, BALL.R * 4, BALL.R * 4);
  drawBallBody(ctx, 0, 0, BALL.R, skin, 0.5);
}

/** Ganzes Feld als Vorschaubild auf ein eigenes Canvas (Feld-Auswahl); das Canvas bestimmt per CSS seine Größe. */
export function drawFieldPreview(canvas, fieldId, turf = 'streifen') {
  const f = getField(fieldId);
  const world = worldOf(f);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssW = canvas.clientWidth || 200;
  const cssH = canvas.clientHeight || Math.round((cssW * WORLD.h) / WORLD.w);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  const scale = Math.min(cssW / world.w, cssH / world.h) * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d1612';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, (canvas.width - world.w * scale) / 2 - world.x0 * scale, (canvas.height - world.h * scale) / 2 - world.y0 * scale);
  drawBackground(ctx, f, turf);
  drawFieldLive(ctx, f, 0, null);
}
