// ui/path/mapDecor.jsx — gezeichnete Landschaftselemente der Pfadkarte (Tusche, 1 Einheit ≈ 1 px bei Maßstab 1).
// Jede Zeichnung liegt um (0, 0) mit dem Fußpunkt unten; die Karte setzt sie per transform an Seed-Positionen.
import React from "react";
import { DRAWINGS } from "./mapDrawings.js";

const INK = "#1a1612";

/** @param {{ kind: string, x: number, y: number, scale?: number, flip?: boolean }} props */
export default function Decor({ kind, x, y, scale = 1, flip = false }) {
  const d = DRAWINGS[kind];
  if (!d) return null;
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      <path d={d} fill="none" stroke={INK} strokeWidth={1.1 / scale} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

