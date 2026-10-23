// cinemaScreen.js — alles, was auf der Kinoleinwand läuft. Die Leinwand ist ein
// 1920×1080-Canvas (als Textur auf die 3D-Leinwand gelegt): Abspann, Startcountdown
// im Stil eines alten Filmvorspanns, Rahmen um die Clips und die Endkarte.
//
// Die Credit-Daten kommen unverändert aus Streamer.bot (siehe StreamCredits.jsx):
// jede Rubrik ist ein flaches string[].
import { FONT, fitText, spacing, clamp01 } from './sceneKit';

export const SCREEN_W = 1920;
export const SCREEN_H = 1080;
/** Abspann-Tempo in Leinwand-Pixeln pro Sekunde. */
export const ROLL_SPEED = 80;
/** Bereich, den der Clip-Player einnimmt (Anteile der Leinwand) — Rest ist Beschriftung. */
export const CLIP_INSET = { x: 0.1, y: 0.115, w: 0.8, h: 0.77 };

const ACCENT = '#22d3ee';
const SHAME = '#ef4444';
const CX = SCREEN_W / 2;

const STARRING = [
  ['Starring', 'Valentin als vnmvalentin'],
  ['Director', 'vnmvalentin'],
  ['Kamera & Ton', 'vnmvalentin'],
  ['Catering', 'Valentins Kühlschrank'],
];

const SECTIONS = [
  ['Top Chatter', 'chatters'],
  ['Neue Follows', 'follows'],
  ['Subs & Gift Subs', 'subs'],
  ['Bits', 'bits'],
  ['Kanalpunkte-Belohnungen', 'rewards'],
  ['Raids', 'raids'],
];

const list = (v) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);

/**
 * Abspann einmal setzen: Liste von Blöcken mit fester y-Position.
 * Block: { y, draw(ctx, screenY) } — screenY ist die Oberkante auf der Leinwand.
 */
export function layoutCredits(credits) {
  const blocks = [];
  let y = 0;
  const add = (h, draw) => { blocks.push({ y, h, draw }); y += h; };
  const gap = (h) => { y += h; };

  const text = (str, { size, weight = 700, color = '#fff', track = 0, align = 'center', x = CX, maxW = 1600 }) => (ctx, top, lineH) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    spacing(ctx, track);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(fitText(ctx, str, maxW), x, top + lineH / 2);
    spacing(ctx, 0);
  };

  const line = (str, opts, h) => { const d = text(str, opts); add(h, (ctx, top) => d(ctx, top, h)); };

  const section = (title, items, { color = ACCENT, empty = 'Niemand dieses Mal!', itemColor = '#fff' } = {}) => {
    line(title.toUpperCase(), { size: 50, weight: 900, color, track: 9 }, 70);
    add(36, (ctx, top) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(CX - 170, top + 14, 340, 3);
      ctx.globalAlpha = 1;
    });
    if (!items.length) {
      line(empty, { size: 38, weight: 600, color: 'rgba(255,255,255,0.45)' }, 58);
      return;
    }
    // Lange Listen in Spalten, damit der Abspann nicht ewig dauert
    const cols = items.length > 30 ? 3 : items.length > 12 ? 2 : 1;
    const colW = cols === 1 ? 1500 : cols === 2 ? 720 : 520;
    const rows = Math.ceil(items.length / cols);
    const rowH = 56;
    add(rows * rowH, (ctx, top) => {
      ctx.font = `700 ${cols === 3 ? 34 : 38}px ${FONT}`;
      ctx.fillStyle = itemColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < items.length; i++) {
        const c = Math.floor(i / rows);
        const r = i % rows;
        const cy = top + r * rowH + rowH / 2;
        if (cy < -rowH || cy > ctx.canvas.height + rowH) continue;
        const cx = CX + (c - (cols - 1) / 2) * colW;
        ctx.fillText(fitText(ctx, items[i], colW - 40), cx, cy);
      }
    });
  };

  gap(40);
  line('STREAM-CREDITS', { size: 92, weight: 900, color: ACCENT, track: 22 }, 120);
  line('PRESENTED BY VNMVALENTIN', { size: 32, weight: 700, color: 'rgba(255,255,255,0.7)', track: 8 }, 60);
  gap(110);

  // Klassische Abspann-Aufteilung: Rolle rechtsbündig links der Mitte, Name links rechts davon
  for (const [role, name] of STARRING) {
    add(62, (ctx, top) => {
      ctx.textBaseline = 'middle';
      ctx.font = `500 30px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'right';
      ctx.fillText(role, CX - 30, top + 31);
      ctx.font = `700 36px ${FONT}`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(name, CX + 30, top + 31);
    });
  }
  gap(150);

  section('Moderatoren', list(credits.mods));
  gap(170);

  line('VIELEN DANK', { size: 120, weight: 900, color: '#fff', track: 6 }, 150);
  line('FÜRS ZUSCHAUEN!', { size: 34, weight: 700, color: 'rgba(255,255,255,0.7)', track: 8 }, 60);
  gap(170);

  for (const [title, key] of SECTIONS) {
    section(title, list(credits[key]));
    gap(150);
  }

  section('Liste der Schande', list(credits.shame), { color: SHAME, empty: 'Niemand!', itemColor: 'rgba(255,255,255,0.75)' });
  gap(260);

  const finalTop = y;
  line('Wir sehen uns beim nächsten Mal!', { size: 44, weight: 600, color: 'rgba(255,255,255,0.6)' }, 70);
  const finalCenter = finalTop + 35;

  // Start: Inhalt beginnt unterhalb der Leinwand. Ende: letzte Zeile steht in der Mitte.
  const startOffset = -SCREEN_H;
  const endOffset = finalCenter - SCREEN_H / 2;
  return { blocks, startOffset, endOffset, duration: (endOffset - startOffset) / ROLL_SPEED };
}

/** Projektor-Look: leichte Vignette über allem, was auf der Leinwand läuft. */
function vignette(ctx) {
  const g = ctx.createRadialGradient(CX, SCREEN_H / 2, SCREEN_H * 0.35, CX, SCREEN_H / 2, SCREEN_H * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
}

function clear(ctx, color = '#050507') {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
}

// Abspann als Streifen: statt jedes Bild die ganze Leinwand neu zu malen und hochzuladen, wird der
// Abspann in überlappende Abschnitte (ROLL_CHUNK_H hoch, alle ROLL_STEP Pixel einer) gemalt. Jeder
// 1080 hohe Ausschnitt liegt vollständig in einem Abschnitt — gescrollt wird nur noch über die
// Texturkoordinaten. Das hält den Abspann auch in OBS ruckelfrei.
export const ROLL_CHUNK_H = 2048;
export const ROLL_STEP = 960;

/** Gescrollte Strecke (px ab Abspannbeginn) nach t Sekunden. */
export function rollPosition(layout, t) {
  return Math.min(Math.max(0, t) * ROLL_SPEED, layout.endOffset - layout.startOffset);
}

/** Blöcke, die in Abschnitt i liegen (Reihenfolge = Zeichenreihenfolge). */
export function chunkBlocks(layout, i) {
  const top = layout.startOffset + i * ROLL_STEP;
  return layout.blocks.filter((b) => b.y + b.h > top && b.y < top + ROLL_CHUNK_H);
}

/** Einen Block in Abschnitt i malen (Hintergrund vorher mit clearChunk). */
export function drawChunkBlock(ctx, layout, i, b) {
  b.draw(ctx, b.y - layout.startOffset - i * ROLL_STEP);
}

export function clearChunk(ctx) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/** Vignette als eigene, durchsichtige Ebene über dem gescrollten Abspann. */
export function drawVignette(ctx) {
  ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
  vignette(ctx);
}

/** Leinwand, solange noch keine Credits da sind. */
export function drawWaiting(ctx) {
  clear(ctx, '#07080c');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 30px ${FONT}`;
  spacing(ctx, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('IN KÜRZE', CX, 430);
  spacing(ctx, 14);
  ctx.font = `900 96px ${FONT}`;
  ctx.fillStyle = '#fff';
  ctx.fillText('STREAM-CREDITS', CX, 530);
  spacing(ctx, 0);
  ctx.font = `600 34px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('Bitte Platz nehmen', CX, 640);
  vignette(ctx);
}

/** Alter Filmvorspann: Zahl 3 … 1 mit umlaufendem Zeiger. `t` in Sekunden, Dauer LEADER_S. */
export const LEADER_S = 3.6;
export function drawLeader(ctx, t) {
  const n = Math.max(1, 3 - Math.floor(t / 1.2));
  const f = (t % 1.2) / 1.2;
  clear(ctx, '#2a2a2a');
  const cy = SCREEN_H / 2;
  // Fadenkreuz
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, cy); ctx.lineTo(SCREEN_W, cy);
  ctx.moveTo(CX, 0); ctx.lineTo(CX, SCREEN_H);
  ctx.stroke();
  // Umlaufender Sektor
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.moveTo(CX, cy);
  ctx.arc(CX, cy, 900, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  // Ringe
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 8;
  for (const r of [330, 400]) { ctx.beginPath(); ctx.arc(CX, cy, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#fff';
  ctx.font = `800 420px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), CX, cy + 20);
  // Kratzer
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  const s = Math.floor(t * 12);
  for (let i = 0; i < 3; i++) {
    const x = ((s * 7919 + i * 3571) % 1900) + 10;
    ctx.fillRect(x, 0, 2, SCREEN_H);
  }
  vignette(ctx);
}

/** Beschriftung um den Clip — der Player selbst liegt als iframe darüber (CLIP_INSET). */
export function drawClipFrame(ctx, clip, index, total) {
  clear(ctx, '#000');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const topY = SCREEN_H * CLIP_INSET.y / 2;
  ctx.font = `800 40px ${FONT}`;
  spacing(ctx, 6);
  ctx.fillStyle = '#c084fc';
  ctx.fillText(fitText(ctx, `HONORABLE MENTION BY ${String(clip.user || '').toUpperCase()}`, 1600), CX, topY + 6);
  spacing(ctx, 0);
  const botY = SCREEN_H * (CLIP_INSET.y + CLIP_INSET.h) + SCREEN_H * (1 - CLIP_INSET.y - CLIP_INSET.h) / 2;
  ctx.font = `700 38px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'left';
  const left = SCREEN_W * CLIP_INSET.x;
  ctx.fillText(fitText(ctx, `"${clip.title || ''}"`, SCREEN_W * CLIP_INSET.w - 160), left, botY);
  if (total > 1) {
    ctx.textAlign = 'right';
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(`${index + 1} / ${total}`, left + SCREEN_W * CLIP_INSET.w, botY);
  }
  // Fläche unter dem Player — sichtbar, bis der iframe geladen hat
  ctx.fillStyle = '#0b0b10';
  ctx.fillRect(left, SCREEN_H * CLIP_INSET.y, SCREEN_W * CLIP_INSET.w, SCREEN_H * CLIP_INSET.h);
}

export function drawEnd(ctx, t = 1) {
  clear(ctx, '#000');
  ctx.globalAlpha = clamp01(t);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = `900 104px ${FONT}`;
  ctx.fillText('Danke fürs Einschalten!', CX, 480);
  ctx.font = `700 52px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('Bis zum nächsten Mal', CX, 600);
  ctx.globalAlpha = 1;
  vignette(ctx);
}
