// Seed Runners — Vorschau-Raster eines Levels für den Browser. Der Server rechnet es beim Veröffentlichen aus dem Dokument
// (kein Bild-Upload, nichts, was ein Nutzer hochladen und missbrauchen könnte); der Browser malt es mit den Farben des Bioms.
//
// Das Level wird auf höchstens 96 × 32 Zellen verkleinert (jede Zelle ein Block von scale × scale Kacheln) und als Text-
// zeilen abgelegt (rund 3 KB). Zeichen je Zelle:
//   S Start   E Ziel   C Checkpoint   h Gefahr (Spikes, Säge, Laser, fallender Block)
//   # Block   I Eis    W klebrige Wand   > < Förderband   = Einweg-Plattform   . Luft
// Vorrang: Start, Ziel, Checkpoint, dann feste Kacheln (mindestens die Hälfte der Zelle), dann Gefahr, dann Einweg, sonst Luft.
'use strict';

const MAX_W = 96;
const MAX_H = 32;
const SOLID = '#IW><';
const HAZARDS = new Set(['spike', 'saw', 'laser', 'fallingBlock']);

/**
 * @param {{ width: number, height: number, tiles: string[], elements: { type: string, tx: number, ty: number }[] }} doc  kanonisches Dokument
 * @returns {{ w: number, h: number, scale: number, rows: string[] }}
 */
function buildPreview(doc) {
  const { width, height, tiles, elements } = doc;
  const scale = Math.max(1, Math.ceil(width / MAX_W), Math.ceil(height / MAX_H));
  const w = Math.ceil(width / scale);
  const h = Math.ceil(height / scale);

  const hazards = new Set();
  for (const e of elements) if (HAZARDS.has(e.type)) hazards.add(Math.floor(e.ty / scale) * w + Math.floor(e.tx / scale));

  const rows = [];
  for (let py = 0; py < h; py++) {
    let row = '';
    for (let px = 0; px < w; px++) {
      const counts = {};
      let cells = 0;
      for (let y = py * scale; y < Math.min(height, (py + 1) * scale); y++) {
        for (let x = px * scale; x < Math.min(width, (px + 1) * scale); x++) {
          const ch = tiles[y][x];
          counts[ch] = (counts[ch] || 0) + 1;
          cells++;
        }
      }
      let out = '.';
      if (counts.S) out = 'S';
      else if (counts.E) out = 'E';
      else if (counts.C) out = 'C';
      else {
        let solid = 0;
        let best = null;
        for (const ch of SOLID) {
          const n = counts[ch] || 0;
          solid += n;
          if (n > 0 && (best === null || n > counts[best])) best = ch;
        }
        if (solid * 2 >= cells && best) out = best;
        else if (hazards.has(py * w + px)) out = 'h';
        else if (counts['=']) out = '=';
      }
      row += out;
    }
    rows.push(row);
  }
  return { w, h, scale, rows };
}

module.exports = { buildPreview, MAX_W, MAX_H };
