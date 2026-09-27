// ui/path/NodeIcon.jsx — kleine Symbole der Knotentypen, Tusche auf Pergament.
import React from "react";

const P = {
  cardChoice: "M6 5h8v12H6zM10 3h8v12",
  fuse: "M5 17L17 5M7 5l2 2M11 9l2 2M15 13l2 2M4 12c2 2 4 2 6 0",
  transfer: "M5 12h14M15 8l4 4-4 4M8 6a3 3 0 110 6",
  campfire: "M6 19l12-3M6 16l12 3M12 15c-3 0-4-3-2-6 0 2 1 2 2 1 0-3 1-5 3-6-1 3 2 4 2 7 0 2-2 4-5 4z",
  remove: "M6 6l12 12M18 6L6 18M8 4h8",
  merchant: "M5 9h14l-1 10H6zM8 9V7a4 4 0 018 0v2M10 13h4",
  shrine: "M12 3l6 4v2H6V7zM8 9v9M16 9v9M6 20h12M10 12h4",
  copyist: "M5 5h9v11H5zM10 9h9v11h-9",
  event: "M12 4l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z",
  // Moorwanderung
  npc: "M5 19L17 7M14 4l6 6M4 14l6 6M7 17l-3 3",
  elite: "M5 19L17 7M14 4l6 6M4 14l6 6M7 17l-3 3M17 17l3-3M19 19l-2-2",
  boss: "M4 18h16M5 18l-1-9 5 4 3-7 3 7 5-4-1 9M9 15h.1M15 15h.1",
  scout: "M9 21l2-15h2l2 15M8 21h8M10 6l2-3 2 3M7 10h10M4 8l3 2M20 8l-3 2",
};

/** @param {{ type: string, size?: number, color?: string }} props */
export default function NodeIcon({ type, size = 28, color = "#1a1612" }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path d={P[type] || P.event} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
