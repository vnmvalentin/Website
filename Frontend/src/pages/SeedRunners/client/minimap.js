// Minimap: Übersicht über das Level neben dem eigentlichen Bild — Boden, Checkpoints, Ziel, Punkte für die eigene Figur und
// die Geister.
//
// Pfad-Level sind sehr lang (oft 20:1). Als ganzes Level in eine kleine Box gepresst, blieb davon ein Strich weniger Pixel
// Höhe — man erkannte nichts (Rückmeldung 26.09.2026). Deshalb zwei Ansichten, einstellbar (client/fxSettings.js):
//   umgebung  ein fester Ausschnitt um die Figur herum (gut 3 Bildschirmbreiten), wandert mit — Standard
//   ganz      das ganze Level, so groß, wie es in die Box passt
// Dazu Größe und Ecke. Gezeichnet wird aus einem Bild mit EINEM Pixel je Kachel, das einmal pro Level entsteht
// (renderMinimapTiles) und dann nur noch vergrößert ausgeschnitten wird — pro Bild ein drawImage plus ein paar Punkte.
import { TILE } from '../sim/config.js';

/** Größe der Minimap-Box in CSS-Pixeln (das Spielfeld ist 960 × 540) */
export const MINIMAP_BOX = Object.freeze({
  klein: { w: 200, h: 70 },
  mittel: { w: 290, h: 100 },
  gross: { w: 400, h: 138 },
});
/** Breite des Ausschnitts „Umgebung“ in Kacheln (das Spielbild zeigt 30) */
export const UMGEBUNG_KACHELN = 104;

const CODE = { luft: 0, fest: 1, checkpoint: 2, ziel: 3, oberflaeche: 4 };
const hexRgb = (hex, fallback) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};
const aufhellen = ([r, g, b, a], f) => [Math.min(255, r + (255 - r) * f), Math.min(255, g + (255 - g) * f), Math.min(255, b + (255 - b) * f), a].map(Math.round);

/**
 * Eine Kennzahl je Kachel: Luft, fest, Oberfläche (fest mit Luft darüber — dort läuft man), Checkpoint, Ziel. Reine Funktion
 * (kein Canvas) — testbar ohne Browser.
 * @param {{ w, h, solid: Uint8Array, checkpoints: {tx,ty}[], finish: {tx,ty}[] }} map  world.map
 */
export function minimapTiles(map) {
  const codes = new Uint8Array(map.w * map.h);
  for (let i = 0; i < codes.length; i++) {
    if (!map.solid[i]) continue;
    codes[i] = i >= map.w && !map.solid[i - map.w] ? CODE.oberflaeche : CODE.fest;
  }
  const setze = (tx, ty, code) => { if (tx >= 0 && ty >= 0 && tx < map.w && ty < map.h) codes[ty * map.w + tx] = code; };
  // Checkpoints als kleine Säule (1 Kachel ist vergrößert kaum zu sehen), das Ziel wie es ist
  for (const cp of map.checkpoints) for (let d = 0; d < 3; d++) setze(cp.tx, cp.ty - d, CODE.checkpoint);
  for (const f of map.finish) setze(f.tx, f.ty, CODE.ziel);
  return { w: map.w, h: map.h, codes };
}

/**
 * Das Kachelbild (1 Pixel je Kachel) einmal pro Level — in den Farben des Bioms wie das Spielbild: Fels in der Kachelfarbe
 * (aufgehellt, damit er sich vom Hintergrund abhebt), begehbare Oberflächen in der Grasnarben-Farbe.
 */
export function renderMinimapTiles(tiles, palette = {}) {
  const FARBE = {
    [CODE.fest]: aufhellen(hexRgb(palette.tile, [60, 60, 78, 255]), 0.12),
    [CODE.oberflaeche]: aufhellen(hexRgb(palette.tileTop, [150, 150, 172, 255]), 0.15),
    [CODE.checkpoint]: [167, 139, 250, 255],
    [CODE.ziel]: [74, 222, 128, 255],
  };
  const canvas = document.createElement('canvas');
  canvas.width = tiles.w;
  canvas.height = tiles.h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(tiles.w, tiles.h);
  for (let i = 0; i < tiles.codes.length; i++) {
    const c = FARBE[tiles.codes[i]];
    if (c) img.data.set(c, i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const klemme = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Welcher Teil des Levels (in Kacheln) wird wie groß (CSS-Pixel) gezeigt? Reine Funktion.
 * @param {'umgebung'|'ganz'} ansicht
 * @param px,py  Mitte der Figur in Weltpixeln
 * @returns {{ sx, sy, sw, sh, dw, dh }}  Quelle in Kacheln, Anzeigegröße in CSS-Pixeln (passt in die Box)
 */
export function minimapAusschnitt(mapW, mapH, ansicht, box, px, py) {
  if (ansicht === 'ganz') {
    const f = Math.min(box.w / mapW, box.h / mapH);
    return { sx: 0, sy: 0, sw: mapW, sh: mapH, dw: Math.max(1, Math.round(mapW * f)), dh: Math.max(1, Math.round(mapH * f)) };
  }
  const sw = Math.min(mapW, UMGEBUNG_KACHELN);
  const sh = Math.min(mapH, Math.round(sw * box.h / box.w));
  // Die Figur etwas links der Mitte: Nach vorn (rechts) sieht man mehr
  const sx = klemme(Math.round(px / TILE - sw * 0.4), 0, mapW - sw);
  const sy = klemme(Math.round(py / TILE - sh / 2), 0, mapH - sh);
  const f = Math.min(box.w / sw, box.h / sh);
  return { sx, sy, sw, sh, dw: Math.max(1, Math.round(sw * f)), dh: Math.max(1, Math.round(sh * f)) };
}

/**
 * Ein Bild der Minimap. Das Canvas hat die Größe dw × dh in Geräte-Pixeln (× dpr), der Aufrufer stellt sie ein.
 * @param players  [{ x, y (Mitte, Weltpixel), color, you? }] — `you` größer, mit Rand, zuletzt (liegt oben)
 */
export function drawMinimap(ctx, tilesCanvas, aus, players) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(6,6,14,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tilesCanvas, aus.sx, aus.sy, aus.sw, aus.sh, 0, 0, W, H);
  const k = W / aus.sw;                               // Geräte-Pixel je Kachel
  const sorted = [...players].sort((a, b) => (a.you ? 1 : 0) - (b.you ? 1 : 0));
  for (const p of sorted) {
    const x = (p.x / TILE - aus.sx) * k;
    const y = (p.y / TILE - aus.sy) * k;
    if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
    const r = Math.max(p.you ? 3.2 : 2.2, k * (p.you ? 0.9 : 0.6));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    if (p.you) {
      ctx.lineWidth = Math.max(1.2, r * 0.4);
      ctx.strokeStyle = '#0b0b14';
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}
