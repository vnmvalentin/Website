// LevelPreview.jsx — die Vorschau eines Levels. Der Server liefert kein Bild, sondern ein kleines Raster aus Zeichen
// (Backend/seedRunners/levelPreview.js); hier wird es mit den Farben des Bioms gemalt. Nichts, was jemand hochladen könnte.
//
//   S Start   E Ziel   C Checkpoint   h Gefahr   # Block   I Eis   W klebrige Wand   > < Förderband   = Einweg-Plattform   . Luft
import React, { useEffect, useRef } from "react";
import { BIOMES } from "../gen/biomes.js";

const CELL = 4;
const SOLID = new Set(["#", "I", "W", ">", "<"]);

const MARK = { S: "#4ade80", E: "#facc15", C: "#38bdf8", h: "#f87171" };
const SURFACE = { I: "#7cc4e0", W: "#b0824a" };

function drawPreview(ctx, preview, biome) {
  const palette = (BIOMES[biome] || BIOMES.meadow).palette;
  const { w, h, rows } = preview;
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, w * CELL, h * CELL);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y]?.[x] || ".";
      if (ch === ".") continue;
      const px = x * CELL;
      const py = y * CELL;
      if (MARK[ch]) {
        ctx.fillStyle = MARK[ch];
        ctx.fillRect(px, py, CELL, CELL);
      } else if (ch === "=") {
        ctx.fillStyle = palette.tileTop;
        ctx.fillRect(px, py, CELL, 1);
      } else if (SOLID.has(ch)) {
        ctx.fillStyle = SURFACE[ch] || palette.tile;
        ctx.fillRect(px, py, CELL, CELL);
        // Die Oberkante heller: Ohne sie ist die Landschaft nur ein Klotz
        if (!SOLID.has(rows[y - 1]?.[x])) {
          ctx.fillStyle = ch === ">" || ch === "<" ? palette.accent : palette.tileTop;
          ctx.fillRect(px, py, CELL, 1);
        }
      }
    }
  }
}

/** @param preview { w, h, scale, rows }  aus dem Server; fehlt es (altes Level), bleibt die Fläche in der Farbe des Bioms */
export default function LevelPreview({ preview, biome, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !preview?.rows) return;
    const ctx = canvas.getContext("2d");
    if (ctx) drawPreview(ctx, preview, biome);
  }, [preview, biome]);

  const bg = (BIOMES[biome] || BIOMES.meadow).palette.bg;
  return (
    <div className={`overflow-hidden ${className}`} style={{ background: bg }}>
      {preview?.rows && (
        <canvas
          ref={ref}
          width={preview.w * CELL}
          height={preview.h * CELL}
          className="block w-full h-full object-contain"
          style={{ imageRendering: "pixelated" }}
          role="img"
          aria-label="Vorschau des Levels"
        />
      )}
    </div>
  );
}
