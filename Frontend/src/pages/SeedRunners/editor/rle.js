// Lauflängen-Kodierung für das Raster eines Entwurfs. Der Browser-Speicher (localStorage) fasst nur rund
// 5 MB; ein Level von 1200 × 160 Kacheln wären als Text 192 KB, und die meisten Zeilen bestehen aus langen
// Läufen gleicher Zeichen. Kodiert wird je Zeile als Zahl + Zeichen: "40.5#3." = 40 × Luft, 5 × Block, 3 × Luft.
// Die Zeichen des Rasters sind keine Ziffern, also ist das eindeutig.

import { TILE_CHARS } from '../level/limits.js';

export function encodeRow(row) {
  let out = '';
  let i = 0;
  while (i < row.length) {
    let j = i + 1;
    while (j < row.length && row[j] === row[i]) j++;
    out += `${j - i}${row[i]}`;
    i = j;
  }
  return out;
}

/** @returns {string | null}  die Zeile, oder null bei ungültigem Text oder falscher Länge */
export function decodeRow(text, width) {
  if (typeof text !== 'string') return null;
  const re = /(\d+)(.)/gy;
  let out = '';
  let pos = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const n = Number(m[1]);
    if (!TILE_CHARS.includes(m[2]) || n < 1 || out.length + n > width) return null;
    out += m[2].repeat(n);
    pos = re.lastIndex;
  }
  return pos === text.length && out.length === width ? out : null;
}

export const encodeTiles = (tiles) => tiles.map(encodeRow);

/** @returns {string[] | null}  die Zeilen, oder null wenn irgendeine nicht passt */
export function decodeTiles(encoded, width, height) {
  if (!Array.isArray(encoded) || encoded.length !== height) return null;
  const rows = [];
  for (const text of encoded) {
    const row = decodeRow(text, width);
    if (row === null) return null;
    rows.push(row);
  }
  return rows;
}
