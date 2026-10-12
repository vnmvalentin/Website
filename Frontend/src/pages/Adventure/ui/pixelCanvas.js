// ui/pixelCanvas.js — Pixelsymbole (ui/pixelIcons.js) auf ein Canvas zeichnen, z. B. Ausrüstung am Boden. Jedes Symbol wird
// einmal als 12 × 12-Bild vorbereitet und dann ohne Glättung hochskaliert.

import { PIXEL_ICONS, PALETTE } from "./pixelIcons.js";

const cache = new Map();

function iconCanvas(id) {
  if (cache.has(id)) return cache.get(id);
  const rows = PIXEL_ICONS[id];
  if (!rows) return null;
  const cv = document.createElement("canvas");
  cv.width = 12; cv.height = 12;
  const c = cv.getContext("2d");
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === ".") continue;
      c.fillStyle = PALETTE[row[x]];
      c.fillRect(x, y, 1, 1);
    }
  });
  cache.set(id, cv);
  return cv;
}

export function drawPixelIcon(ctx, id, x, y, size) {
  const cv = iconCanvas(id);
  if (!cv) return;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, x, y, size, size);
  ctx.imageSmoothingEnabled = smooth;
}
