// render.js — zeichnet das Spielfeld auf ein Canvas: Rasen im Flutlicht, Torkästen mit Netz, Hindernisse,
// Spielerscheiben, Ball mit Spur, Ziel-Pfeil und die Effekte (Torjubel, aufblitzendes Netz, Staubringe, Wackeln).
// Alles in Feld-Einheiten; `view` bildet sie auf Canvas-Pixel ab. Das Feld kommt aus fields.js (scene.field), Rasen
// und Ball aus den persönlichen Einstellungen (scene.look, Kataloge in progress.js).

import { FIELD, PIECE, BALL, TEAM_SIZE, AIM, getField } from './engine/index.js';

const FRAME = 30; // dunkler Rand um Feld und Tore (dort liegen die Banden)

/** Zeichenbereich eines Feldes in Feld-Einheiten (Feld + Torkästen + Rand). */
export function worldOf(field) {
  return {
    x0: -field.GOAL_D - FRAME,
    y0: -FRAME,
    w: field.W + 2 * (field.GOAL_D + FRAME),
    h: field.H + 2 * FRAME,
  };
}

// Das Stadion bestimmt das Seitenverhältnis der Spielfläche im Layout; andere Felder werden darin eingepasst.
export const WORLD = Object.freeze(worldOf(FIELD));

export const TEAM_COLORS = [
  { main: '#ef4136', dark: '#b9281f', light: '#ff8a7f' },
  { main: '#2f7cf6', dark: '#1b55b3', light: '#86b4ff' },
];
const LIME = '#c8f03c';
const INK = '#0b110e';
const FONT = 'Archivo, "Inter", sans-serif';

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

function setFont(ctx, weight, size, { italic = false, stretch = 'normal' } = {}) {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`;
  if ('fontStretch' in ctx) ctx.fontStretch = stretch;
}

// ── Rasen ─────────────────────────────────────────────────────────────────────────────────

const TURF_COLORS = {
  streifen: { a: '#2f8a48', b: '#2a8043', line: 'rgb(255 255 255 / 0.9)' },
  karo: { a: '#2f8a48', b: '#287c40', line: 'rgb(255 255 255 / 0.9)' },
  kreise: { a: '#2f8a48', b: '#2a8043', line: 'rgb(255 255 255 / 0.9)' },
  nacht: { a: '#1c5d55', b: '#19544d', line: 'rgb(214 240 255 / 0.9)' },
  sand: { a: '#d8b76a', b: '#d0ae5f', line: 'rgb(255 255 255 / 0.95)' },
};

/** Füllt das Rechteck (0,0)–(w,h) mit dem Rasenmuster. */
function paintTurf(ctx, turf, w, h) {
  const c = TURF_COLORS[turf] || TURF_COLORS.streifen;
  ctx.fillStyle = c.a;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = c.b;
  if (turf === 'karo') {
    const n = 14;
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j * s < h; j++) if ((i + j) % 2) ctx.fillRect(i * s, j * s, s + 0.5, s + 0.5);
  } else if (turf === 'kreise') {
    const step = 46;
    const max = Math.hypot(w, h) / 2;
    for (let r = Math.ceil(max / step) * step; r > 0; r -= step) {
      ctx.fillStyle = Math.round(r / step) % 2 ? c.b : c.a;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Längsstreifen + leichtes Karo (Standard, Nachtspiel, Strand)
    const stripes = 14;
    for (let i = 1; i < stripes; i += 2) ctx.fillRect((w / stripes) * i, 0, w / stripes + 0.5, h);
    ctx.fillStyle = 'rgb(0 0 0 / 0.045)';
    const rows = 8;
    for (let j = 1; j < rows; j += 2) ctx.fillRect(0, (h / rows) * j, w, h / rows);
  }
}

// Hintergrund ändert sich nie → pro Größe, Feld und Rasen einmal vorzeichnen
const bgCache = new Map();

function drawBackground(ctx, f, turf) {
  const { W, H, GOAL_D, GOAL_W, G0, G1, cut } = f;
  const world = worldOf(f);
  const lines = (TURF_COLORS[turf] || TURF_COLORS.streifen).line;
  // Umgebung
  ctx.fillStyle = '#0d1612';
  ctx.fillRect(world.x0, world.y0, world.w, world.h);
  // Bande: schmaler dunkler Rahmen direkt um Feld und Torkästen
  ctx.fillStyle = '#1d2b25';
  ctx.fillRect(-8, -8, W + 16, H + 16);
  ctx.fillRect(-GOAL_D - 8, G0 - 8, GOAL_D + 8, GOAL_W + 16);
  ctx.fillRect(W, G0 - 8, GOAL_D + 8, GOAL_W + 16);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  paintTurf(ctx, turf, W, H);
  ctx.restore();

  // Käfig: schräge Ecken — die Dreiecke dahinter gehören zur Bande
  if (cut > 0) {
    ctx.fillStyle = '#1d2b25';
    for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + sx * cut, cy);
      ctx.lineTo(cx, cy + sy * cut);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Torkästen mit Netz
  for (const side of [0, 1]) {
    const x = side === 0 ? -GOAL_D : W;
    ctx.fillStyle = '#10221a';
    ctx.fillRect(x, G0, GOAL_D, GOAL_W);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, G0, GOAL_D, GOAL_W);
    ctx.clip();
    ctx.strokeStyle = 'rgb(255 255 255 / 0.28)';
    ctx.lineWidth = 1.4;
    for (let k = 0; k <= GOAL_W; k += 11) {
      ctx.beginPath();
      ctx.moveTo(x, G0 + k);
      ctx.lineTo(x + GOAL_D, G0 + k);
      ctx.stroke();
    }
    for (let k = 0; k <= GOAL_D; k += 11) {
      ctx.beginPath();
      ctx.moveTo(x + k, G0);
      ctx.lineTo(x + k, G1);
      ctx.stroke();
    }
    ctx.restore();
    // Torrahmen
    ctx.strokeStyle = '#f4f6f4';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const back = side === 0 ? -GOAL_D : W + GOAL_D;
    const mouth = side === 0 ? 0 : W;
    ctx.moveTo(mouth, G0);
    ctx.lineTo(back, G0);
    ctx.lineTo(back, G1);
    ctx.lineTo(mouth, G1);
    ctx.stroke();
  }

  // Linien: Außenlinie folgt den schrägen Ecken
  ctx.strokeStyle = lines;
  ctx.fillStyle = lines;
  ctx.lineWidth = 3.2;
  const i = 1.6;
  ctx.beginPath();
  if (cut > 0) {
    ctx.moveTo(cut, i);
    ctx.lineTo(W - cut, i);
    ctx.lineTo(W - i, cut);
    ctx.lineTo(W - i, H - cut);
    ctx.lineTo(W - cut, H - i);
    ctx.lineTo(cut, H - i);
    ctx.lineTo(i, H - cut);
    ctx.lineTo(i, cut);
    ctx.closePath();
  } else {
    ctx.rect(i, i, W - 2 * i, H - 2 * i);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, f.CENTER_R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 5, 0, Math.PI * 2);
  ctx.fill();
  // Strafräume wachsen mit dem Tor mit
  const boxD = W * 0.16;
  const boxH = Math.min(H - 40, Math.max(H * 0.6, GOAL_W + 90));
  const smallD = W * 0.065;
  const smallH = Math.min(H - 80, Math.max(H * 0.42, GOAL_W + 50));
  const arcR = f.CENTER_R * 0.95;
  for (const side of [0, 1]) {
    const sx = side === 0 ? 0 : W;
    const dir = side === 0 ? 1 : -1;
    ctx.strokeRect(Math.min(sx, sx + dir * boxD), (H - boxH) / 2, boxD, boxH);
    ctx.strokeRect(Math.min(sx, sx + dir * smallD), (H - smallH) / 2, smallD, smallH);
    const spotX = sx + dir * W * 0.11;
    ctx.beginPath();
    ctx.arc(spotX, H / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    const a = Math.acos(Math.min(1, (boxD - W * 0.11) / arcR));
    if (side === 0) ctx.arc(spotX, H / 2, arcR, -a, a);
    else ctx.arc(spotX, H / 2, arcR, Math.PI - a, Math.PI + a);
    ctx.stroke();
    if (cut === 0) {
      for (const cy of [0, H]) {
        ctx.beginPath();
        const start = side === 0 ? (cy === 0 ? 0 : -Math.PI / 2) : cy === 0 ? Math.PI / 2 : Math.PI;
        ctx.arc(sx, cy, 16, start, start + Math.PI / 2);
        ctx.stroke();
      }
    }
  }

  // Pfosten
  for (const [px, py] of [[0, G0], [0, G1], [W, G0], [W, G1]]) {
    ctx.beginPath();
    ctx.arc(px, py, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = '#f4f6f4';
    ctx.fill();
  }

  // Feste Hindernisse
  for (const b of f.bumpers) {
    ctx.fillStyle = 'rgb(0 0 0 / 0.34)';
    ctx.beginPath();
    ctx.ellipse(b.x + 1.5, b.y + 5, b.r, b.r * 0.97, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4f6f4';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1d2b25';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = LIME;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
}

function ensureBackground(view, cssW, cssH, dpr, field, turf) {
  const key = `${cssW}x${cssH}@${dpr}/${field.id}/${turf}`;
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

// ── Scheiben ──────────────────────────────────────────────────────────────────────────────

function star(ctx, x, y, R, rIn, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 ? rIn : R;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** Muster eines Designs, geschnitten auf die Teamfläche (Radius rb). */
function drawPattern(ctx, x, y, r, rb, skin, col) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, rb, 0, Math.PI * 2);
  ctx.clip();
  if (skin === 'streifen') {
    ctx.strokeStyle = 'rgb(255 255 255 / 0.3)';
    ctx.lineWidth = 6;
    for (let k = -2 * r; k <= 2 * r; k += 14) {
      ctx.beginPath();
      ctx.moveTo(x + k - r, y + r);
      ctx.lineTo(x + k + r, y - r);
      ctx.stroke();
    }
  } else if (skin === 'ringe') {
    ctx.strokeStyle = 'rgb(255 255 255 / 0.55)';
    ctx.lineWidth = 3;
    for (const f of [0.76, 0.64]) {
      ctx.beginPath();
      ctx.arc(x, y, r * f, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (skin === 'halb') {
    ctx.fillStyle = col.dark;
    ctx.beginPath();
    ctx.moveTo(x - r, y + r);
    ctx.lineTo(x + r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.closePath();
    ctx.fill();
  } else if (skin === 'karo') {
    ctx.fillStyle = col.dark;
    const s = 11;
    for (let i = -4; i < 4; i++) {
      for (let j = -4; j < 4; j++) if ((i + j) % 2 === 0) ctx.fillRect(x + i * s, y + j * s, s, s);
    }
  }
  // schräger Glanzstreifen wie auf einem lackierten Puck (flach, kein Verlauf)
  ctx.fillStyle = 'rgb(255 255 255 / 0.12)';
  ctx.beginPath();
  ctx.moveTo(x - r, y - r * 0.2);
  ctx.lineTo(x - r * 0.2, y - r);
  ctx.lineTo(x + r * 0.15, y - r);
  ctx.lineTo(x - r, y + r * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Scheibe ohne Auswahlringe: Rand, Teamfläche, Muster, Innenkreis, Emblem, Nummer. */
function drawDiscBody(ctx, x, y, team, number, skin = 'klassik') {
  const col = TEAM_COLORS[team];
  const r = PIECE.R;
  // Rand
  const rim = skin === 'metall' ? '#c3cbc6' : skin === 'krone' ? '#e9c24a' : '#f4f6f4';
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (skin === 'metall' || skin === 'krone') {
    // geriffelter Rand
    ctx.strokeStyle = skin === 'metall' ? 'rgb(40 50 45 / 0.45)' : 'rgb(120 80 0 / 0.45)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86);
      ctx.lineTo(x + Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98);
      ctx.stroke();
    }
  }
  const rb = r * 0.84;
  ctx.fillStyle = col.main;
  ctx.beginPath();
  ctx.arc(x, y, rb, 0, Math.PI * 2);
  ctx.fill();
  drawPattern(ctx, x, y, r, rb, skin, col);

  // Innenkreis (Kontrast für die Nummer)
  // Bei „Halbzeit" bleibt er offen, sonst würde er die Teilung verdecken (die Nummer hat ohnehin eine Kontur)
  const ri = skin === 'ringe' ? r * 0.5 : r * 0.6;
  ctx.beginPath();
  ctx.arc(x, y, ri, 0, Math.PI * 2);
  if (skin === 'halb') {
    ctx.strokeStyle = 'rgb(255 255 255 / 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.fillStyle = col.dark;
    ctx.fill();
  }
  if (skin === 'metall') {
    ctx.strokeStyle = '#c3cbc6';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Embleme hinter der Nummer
  let numY = y + r * 0.03;
  let numSize = Math.round(r * 0.74);
  if (skin === 'stern') {
    ctx.fillStyle = 'rgb(255 255 255 / 0.26)';
    star(ctx, x, y + r * 0.04, ri * 0.98, ri * 0.42);
    ctx.fill();
    numSize = Math.round(r * 0.6);
  } else if (skin === 'blitz') {
    ctx.fillStyle = '#c8f03c';
    ctx.globalAlpha *= 0.55;
    ctx.beginPath();
    ctx.moveTo(x + ri * 0.2, y - ri * 0.95);
    ctx.lineTo(x - ri * 0.55, y + ri * 0.12);
    ctx.lineTo(x - ri * 0.02, y + ri * 0.12);
    ctx.lineTo(x - ri * 0.22, y + ri * 0.95);
    ctx.lineTo(x + ri * 0.55, y - ri * 0.18);
    ctx.lineTo(x + ri * 0.02, y - ri * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha /= 0.55;
    numSize = Math.round(r * 0.56);
  } else if (skin === 'krone') {
    const cw = ri * 1.1;
    const cy = y - ri * 0.42;
    ctx.fillStyle = '#e9c24a';
    ctx.beginPath();
    ctx.moveTo(x - cw / 2, cy + ri * 0.22);
    ctx.lineTo(x - cw / 2, cy - ri * 0.2);
    ctx.lineTo(x - cw / 4, cy);
    ctx.lineTo(x, cy - ri * 0.32);
    ctx.lineTo(x + cw / 4, cy);
    ctx.lineTo(x + cw / 2, cy - ri * 0.2);
    ctx.lineTo(x + cw / 2, cy + ri * 0.22);
    ctx.closePath();
    ctx.fill();
    numY = y + ri * 0.3;
    numSize = Math.round(r * 0.5);
  }

  setFont(ctx, 900, numSize, { italic: true, stretch: 'expanded' });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // dunkle Kontur, damit die Nummer auch über Emblemen lesbar bleibt
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = col.dark;
  ctx.strokeText(String(number), x, numY);
  ctx.fillStyle = '#fff';
  ctx.fillText(String(number), x, numY);
}

/**
 * Scheibe mit Schatten und Auswahlring. scale: Größenfaktor (Power-up Riese), frozen: eingefroren (Power-up Eiszeit).
 */
function drawDisc(ctx, x, y, team, number, { ring, faded, time, skin, scale = 1, frozen = false }) {
  const r = PIECE.R * scale;
  // Schatten
  ctx.fillStyle = 'rgb(0 0 0 / 0.34)';
  ctx.beginPath();
  ctx.ellipse(x + 1.5, y + 5, r, r * 0.97, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = faded ? 0.8 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawDiscBody(ctx, 0, 0, team, number, skin);
  ctx.restore();
  ctx.globalAlpha = 1;

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

function drawBall(ctx, x, y, trail, skin) {
  const r = BALL.R;
  // Spur: die letzten Positionen, zum Ende hin kleiner und blasser
  if (trail && trail.length > 1) {
    for (let i = 0; i < trail.length - 1; i++) {
      const k = (i + 1) / trail.length;
      ctx.fillStyle = `rgb(255 255 255 / ${0.22 * k})`;
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

/** Ziel-Pfeil: zeigt vom Stein weg in Schussrichtung, Länge und Farbe = Kraft. drag = Zeigerposition (Feld). */
function drawAim(ctx, piece, aim) {
  const p = Math.hypot(aim.sx, aim.sy);
  if (p <= 0) return;
  const dx = aim.sx / p;
  const dy = aim.sy / p;
  if (aim.drag) {
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
  // Umriss der bespielbaren Fläche (mit schrägen Ecken und Torkästen) — nicht die verdeckten Bandenstücke dahinter
  const { W, H, G0, G1, GOAL_D: D, cut: c } = f;
  const pts = [
    [c, 0], [W - c, 0], [W, c], [W, G0], [W + D, G0], [W + D, G1], [W, G1], [W, H - c],
    [W - c, H], [c, H], [0, H - c], [0, G1], [-D, G1], [-D, G0], [0, G0], [0, c],
  ];
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
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
  if (scene.fx) drawNetFlash(ctx, f, scene.fx.netFlash, time);
  if (scene.rubber) drawRubberWalls(ctx, f, time);
  pieces.forEach((p, i) => {
    let ring = null;
    if (aim && aim.piece === i) ring = Math.hypot(aim.sx, aim.sy) > 0 ? 'aim' : 'cancel';
    else if (!aim && hover === i && selectable?.has(i)) ring = 'hover';
    else if (!aim && selectable?.has(i)) ring = 'can';
    const faded = !!selectable && selectable.size > 0 && !selectable.has(i);
    drawDisc(ctx, p.x, p.y, p.team, (i % TEAM_SIZE) + 1, {
      ring, faded, time, skin: scene.skins?.[p.team], scale: p.scale || 1, frozen: !!p.frozen,
    });
  });
  drawBall(ctx, ball.x, ball.y, scene.trail, scene.look?.ball || 'klassik');
  if (aim) drawAim(ctx, pieces[aim.piece], aim);
  if (scene.fx) drawParticles(ctx, scene.fx, time);
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
  return { particles: confetti(team, gx, gy, dir, 110, Math.PI * 0.95), rings: [] };
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

/** Rasenmuster als kleines Feldstück mit Mittelkreis auf ein eigenes Canvas. */
export function drawTurfPreview(canvas, turf) {
  const { ctx, px } = previewCtx(canvas, canvas.clientWidth || 48);
  const scale = px / 300;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.save();
  ctx.translate(-350, -170); // Ausschnitt um den Mittelpunkt des Stadions
  paintTurf(ctx, turf, FIELD.W, FIELD.H);
  ctx.strokeStyle = (TURF_COLORS[turf] || TURF_COLORS.streifen).line;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(FIELD.W / 2, 0);
  ctx.lineTo(FIELD.W / 2, FIELD.H);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(FIELD.W / 2, FIELD.H / 2, FIELD.CENTER_R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
