// ui/path/mapDecor.jsx — gezeichnete Landschaftselemente der Pfadkarte (Tusche, 1 Einheit ≈ 1 px bei Maßstab 1).
// Jede Zeichnung liegt um (0, 0) mit dem Fußpunkt unten; die Karte setzt sie per transform an Seed-Positionen.
import React from "react";

const INK = "#1a1612";

/** Pfade je Element (einfach gehalten: wenige Striche, wie mit der Feder hingeworfen). */
const DRAWINGS = {
  schilf: "M-10 0q2-18 -2-30M-4 0q1-22 4-34M2 0q-1-16 6-26M8 0q2-14 -1-22M-3 -30l-2-6 3 4M4 -34l1-6 1 6",
  irrlicht: "M0 -18a4 4 0 110 .1M-6 -30a2.5 2.5 0 110 .1M7 -26a2 2 0 110 .1M0 -14q-3 6 0 14",
  tuempel: "M-24 0q24-8 48 0q-24 8-48 0M-14 -1q6-2 10 0M4 1q6-2 10 0",
  birke: "M-3 0l1-44M3 0l-1-44M-2 -30l-10-10M2 -36l9-8M-2 -20h3M0 -12h2M-1 -38h3",
  kraehe: "M-8 -4q8-10 16 0M0 -8l6-3M-6 -2l-4 2M4 -4l2 4",
  grab: "M-8 0v-14q8-10 16 0v14M-3 -9h6M0 -13v8M-16 0h32",
  ruine: "M-20 0v-24l6-4v28M-8 0v-36h8v36M6 0v-18l6 2v16M-24 0h40M-6 -30h4",
  kerze: "M-3 0v-14h6v14M0 -14v-3M0 -22q-3 3 0 5q3-2 0-5",
  glocke: "M-10 -4q0-20 10-22q10 2 10 22zM-12 -4h24M0 0a2 2 0 110 .1M0 -26v-6",
  pilz: "M-2 0l1-12M2 0l-1-12M-12 -12q12-16 24 0zM-5 -16h.1M4 -17h.1",
  tropfstein: "M-10 -40l4 22 4-22M4 -40l3 14 3-14M-16 -40h32",
  sporen: "M-8 -10h.1M4 -18h.1M10 -8h.1M-2 -26h.1M-12 -22h.1",
  knochen: "M-12 -2l24-6M-14 -4a2 2 0 110 3M10 -10a2 2 0 110 3",
  schaedel: "M-7 -6q0-12 7-12t7 12v4h-14zM-3 -10h.1M3 -10h.1M-2 -2v2M2 -2v2",
  pfahl: "M0 0v-30M-3 -30h6M-2 -18l-6-4M2 -24l6-3",
  boot: "M-20 -6q20 12 40 0zM-20 -6h40M0 -6v-18l10 12h-10",
  priel: "M-30 0q10-6 20 0t20 0t20 0M-20 6q8-4 16 0",
  muschel: "M-8 0q0-12 8-12t8 12zM0 -12v12M-4 -10l2 10M4 -10l-2 10",
  gras: "M-8 0l-2-10M-4 0l1-14M0 0l-1-9M4 0l2-12M8 0l1-8",
  moewe: "M-10 -2q5-8 10 0q5-8 10 0",
  deich: "M-40 0q40-16 80 0M-30 -4h60",
  turm: "M-8 0v-40l8-8 8 8v40M-3 -30h6M0 -48v-6",
  welle: "M-24 0q6-8 12 0t12 0t12 0t12 0M-18 -8q4-4 8 0",
  koralle: "M0 0v-12l-8-8M0 -12l7-10M-8 -20l-2-8M7 -22l4-6",
  fisch: "M-10 0q10-8 18 0q-8 8-18 0zM8 0l6-5v10zM-5 -1h.1",
  anemone: "M-6 0v-8h12v8M-6 -8q-4-8-2-12M-2 -8q0-10 2-12M2 -8q2-9 4-11M6 -8q4-6 6-9",
  wrack: "M-26 0l6-14h40l6 14zM-8 -14v-22l14 10h-14M10 -14l6-12",
  anker: "M0 0v-24M-6 -20h12M-10 -6q10 10 20 0M0 -24a3 3 0 110 -.1",
  mast: "M0 0v-40M-10 -32h20M-6 -22h12",
  leuchtturm: "M-7 0l3-40h8l3 40zM-6 -40h12v-6h-12zM0 -46v-4M-14 -44l6 2M14 -44l-6 2",
  fels: "M-18 0l6-12 8 4 6-10 10 10 6 8z",
  blaetter: "M-6 -10q4-4 8 0q-4 4-8 0M6 -20q4-4 8 0q-4 4-8 0",
};

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

