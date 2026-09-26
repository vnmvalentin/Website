// Kleine Geometrie-Hilfen des Editors, ohne Abhängigkeiten.

/** Rechteck aus zwei beliebigen Ecken → x0 ≤ x1, y0 ≤ y1 (beide inklusive) */
export function normRect(a, b) {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

export const rectContains = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
export const rectSize = (r) => ({ w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1 });

/**
 * Alle Kacheln auf der Linie von (x0, y0) nach (x1, y1), beide inklusive (Bresenham). Damit hinterlässt ein
 * schnell gezogener Pinsel keine Lücken zwischen zwei Zeigerereignissen.
 */
export function lineCells(x0, y0, x1, y1) {
  const cells = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cells.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return cells;
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
