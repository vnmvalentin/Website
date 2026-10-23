// og/ogImage.js — das Vorschaubild eines geteilten Links (1200 × 630, das Format, das Discord, X und WhatsApp groß zeigen).
//
// Bewusst schlicht: eine deckende dunkle Fläche, eine Akzentlinie in der Farbe des Bereichs, Rubrik, Titel, zwei Zeilen
// Text und die Adresse. Bei einem Seed-Runners-Level kommt die Level-Vorschau dazu (dasselbe Raster wie im Browser,
// seedRunners/levelPreview.js), beim Tagesrennen die Top 3.
//
// Die Schrift liegt bei (discord/assets/fonts) — auf dem Server ist nicht gesagt, dass überhaupt eine installiert ist.
'use strict';

const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const FONT_DIR = path.join(__dirname, '../discord/assets/fonts');
for (const [file, family] of [
  ['Inter-latin-800.ttf', 'OgBold'], ['Inter-latin-ext-800.ttf', 'OgBoldExt'],
  ['Inter-latin-600.ttf', 'OgText'], ['Inter-latin-ext-600.ttf', 'OgTextExt'],
]) {
  try {
    GlobalFonts.registerFromPath(path.join(FONT_DIR, file), family);
  } catch (e) {
    console.warn('[og] Schrift fehlt:', file, e.message);
  }
}
const BOLD = 'OgBold, OgBoldExt, sans-serif';
const TEXT = 'OgText, OgTextExt, sans-serif';

const W = 1200;
const H = 630;
const PAD = 72;
const BG = '#0d0f14';
const INK = '#f3f4f6';
const DIM = '#9ca3af';
const LINE = 'rgba(255,255,255,0.10)';

// Spiegel der Biom-Farben aus Frontend/src/pages/SeedRunners/gen/biomes.js (nur die für die Vorschau nötigen)
const BIOME_PALETTE = {
  meadow: { bg: '#0d1620', tile: '#2c3a2f', tileTop: '#5f8f58', accent: '#8fd17a' },
  ice: { bg: '#0b1420', tile: '#243a4e', tileTop: '#8ccbe8', accent: '#bfe8f7' },
  factory: { bg: '#121118', tile: '#33303a', tileTop: '#d19a3b', accent: '#f0b94a' },
  cave: { bg: '#0a0a10', tile: '#2a2431', tileTop: '#7a5d9c', accent: '#b592e0' },
  sky: { bg: '#0d1226', tile: '#2a3357', tileTop: '#7f9be8', accent: '#a9c0ff' },
};
const MARK = { S: '#4ade80', E: '#facc15', C: '#38bdf8', h: '#f87171' };
const SURFACE = { I: '#7cc4e0', W: '#b0824a' };
const SOLID = new Set(['#', 'I', 'W', '>', '<']);

/** Kürzt einen Text mit "…", bis er in die Breite passt */
function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Bricht einen Text auf höchstens maxLines Zeilen um; die letzte wird bei Bedarf gekürzt */
function wrap(ctx, text, maxWidth, maxLines) {
  // Nur an normalen Leerzeichen umbrechen: "25 %" mit geschütztem Leerzeichen bleibt zusammen
  const words = String(text || '').split(/[ \t\n]+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (ctx.measureText(next).width <= maxWidth || !cur) {
      cur = next;
      continue;
    }
    // Letzte erlaubte Zeile: Rest anhängen, fit() unten kürzt mit "…"
    if (lines.length === maxLines - 1) {
      cur = [cur, ...words.slice(i)].join(' ');
      break;
    }
    lines.push(cur);
    cur = words[i];
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines).map((l, i, all) => (i === all.length - 1 ? fit(ctx, l, maxWidth) : l));
}

/** Level-Vorschau in ein Rechteck, Seitenverhältnis bleibt, Pixel bleiben scharf */
function drawLevelPreview(ctx, preview, biome, x, y, w, h) {
  const pal = BIOME_PALETTE[biome] || BIOME_PALETTE.meadow;
  ctx.fillStyle = pal.bg;
  ctx.fillRect(x, y, w, h);
  if (!preview?.rows || !preview.w || !preview.h) return;
  const cell = Math.max(1, Math.floor(Math.min(w / preview.w, h / preview.h)));
  const ox = x + Math.floor((w - preview.w * cell) / 2);
  const oy = y + Math.floor((h - preview.h * cell) / 2);
  const rows = preview.rows;
  const top = Math.max(1, Math.round(cell / 4));
  for (let py = 0; py < preview.h; py++) {
    for (let px = 0; px < preview.w; px++) {
      const ch = rows[py]?.[px] || '.';
      if (ch === '.') continue;
      const cx = ox + px * cell;
      const cy = oy + py * cell;
      if (MARK[ch]) {
        ctx.fillStyle = MARK[ch];
        ctx.fillRect(cx, cy, cell, cell);
      } else if (ch === '=') {
        ctx.fillStyle = pal.tileTop;
        ctx.fillRect(cx, cy, cell, top);
      } else if (SOLID.has(ch)) {
        ctx.fillStyle = SURFACE[ch] || pal.tile;
        ctx.fillRect(cx, cy, cell, cell);
        if (!SOLID.has(rows[py - 1]?.[px])) {
          ctx.fillStyle = ch === '>' || ch === '<' ? pal.accent : pal.tileTop;
          ctx.fillRect(cx, cy, cell, top);
        }
      }
    }
  }
}

/**
 * @param card {
 *   kicker, accent, title, lines: string[],
 *   level?: { preview, biome },              // Seed-Runners-Level: Vorschau unten
 *   table?: [{ rank, name, value }],          // Tagesrennen: Top 3
 *   stat?: { value, label },                  // große Zahl (z. B. "12/16 Spieler"), rechts oben oder unter dem Text
 * }
 * @returns {Buffer} PNG
 */
function renderCard(card) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = card.accent || INK;
  ctx.fillRect(0, 0, W, 8);
  ctx.textBaseline = 'alphabetic';

  const footY = H - PAD + 10;
  const contentBottom = footY - 58;
  // Hohe Level (Turm, Schacht) bekommen rechts eine Spalte über die volle Höhe; flache einen Streifen unten
  const pv = card.level?.preview;
  const side = !!(pv?.w && pv?.h && pv.w / pv.h < 2.2);
  const sideW = side ? 400 : 0;
  const hasBand = !!(card.table?.length || (card.level && !side));
  const statW = card.stat && !side ? 320 : 0;
  const textW = W - PAD * 2 - statW - (side ? sideW + PAD : 0);

  // Rubrik
  ctx.font = `600 26px ${TEXT}`;
  ctx.fillStyle = card.accent || DIM;
  ctx.fillText(fit(ctx, String(card.kicker || '').toUpperCase(), textW), PAD, PAD + 26);

  // Titel: groß, bis zu zwei Zeilen (mit Streifen darunter nur eine)
  const titleSize = hasBand ? 60 : 72;
  ctx.font = `800 ${titleSize}px ${BOLD}`;
  ctx.fillStyle = INK;
  const titleLines = wrap(ctx, card.title, textW, hasBand ? 1 : 2);
  let y = PAD + 26 + 28 + titleSize;
  for (const line of titleLines) {
    ctx.fillText(line, PAD, y);
    y += titleSize * 1.12;
  }

  // Textzeilen
  ctx.font = `600 30px ${TEXT}`;
  ctx.fillStyle = DIM;
  y += 6;
  for (const line of (card.lines || []).filter(Boolean).slice(0, hasBand ? 1 : 3)) {
    for (const l of wrap(ctx, line, textW, hasBand ? 1 : 2)) {
      ctx.fillText(l, PAD, y);
      y += 42;
    }
  }

  // Große Zahl: rechts oben, oder neben einer Level-Spalte unten links
  if (card.stat) {
    const maxW = side ? textW : statW - 20;
    let size = 72;
    ctx.font = `800 ${size}px ${BOLD}`;
    while (size > 36 && ctx.measureText(String(card.stat.value)).width > maxW) {
      size -= 4;
      ctx.font = `800 ${size}px ${BOLD}`;
    }
    ctx.fillStyle = INK;
    if (side) {
      const sy = contentBottom - 40;
      ctx.fillText(String(card.stat.value), PAD, sy);
      ctx.font = `600 26px ${TEXT}`;
      ctx.fillStyle = DIM;
      ctx.fillText(fit(ctx, String(card.stat.label || ''), textW), PAD, sy + 40);
    } else {
      const sx = W - PAD;
      const sy = PAD + 26 + 28 + 72;
      ctx.textAlign = 'right';
      ctx.fillText(String(card.stat.value), sx, sy);
      ctx.font = `600 26px ${TEXT}`;
      ctx.fillStyle = DIM;
      ctx.fillText(fit(ctx, String(card.stat.label || ''), maxW), sx, sy + 40);
      ctx.textAlign = 'left';
    }
  }

  if (card.level && side) {
    drawLevelPreview(ctx, pv, card.level.biome, W - PAD - sideW, PAD, sideW, contentBottom + 20 - PAD);
  } else if (card.level) {
    const top = Math.max(y + 8, 300);
    drawLevelPreview(ctx, pv, card.level.biome, PAD, top, W - PAD * 2, contentBottom + 20 - top);
  } else if (card.table?.length) {
    let ty = Math.max(y + 20, 330);
    for (const row of card.table.slice(0, 3)) {
      ctx.fillStyle = LINE;
      ctx.fillRect(PAD, ty - 40, W - PAD * 2, 1);
      ctx.font = `800 34px ${BOLD}`;
      ctx.fillStyle = row.rank === 1 ? (card.accent || INK) : DIM;
      ctx.fillText(String(row.rank), PAD, ty);
      ctx.fillStyle = INK;
      ctx.font = `600 34px ${TEXT}`;
      ctx.fillText(fit(ctx, row.name, W - PAD * 2 - 340), PAD + 70, ty);
      ctx.textAlign = 'right';
      ctx.font = `800 34px ${BOLD}`;
      ctx.fillText(String(row.value), W - PAD, ty);
      ctx.textAlign = 'left';
      ty += 62;
    }
  }

  // Fuß: Adresse links, Haarlinie darüber
  ctx.fillStyle = LINE;
  ctx.fillRect(PAD, footY - 38, W - PAD * 2, 1);
  ctx.font = `600 26px ${TEXT}`;
  ctx.fillStyle = DIM;
  ctx.fillText('vnmvalentin.de', PAD, footY);

  return canvas.toBuffer('image/png');
}

// fit und die Schriftnamen nutzt auch das Saisonrückblick-Bild (clashRoyale/lib/recapImage.js)
module.exports = { renderCard, W, H, fit, BOLD, TEXT };
