// ui/path/NodeIcon.jsx — kleine Symbole der Knotentypen, Tusche auf Pergament.
import React from "react";
import { NODE_PATHS } from "./nodePaths.js";

/** @param {{ type: string, size?: number, color?: string }} props */
export default function NodeIcon({ type, size = 28, color = "#1a1612" }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path d={NODE_PATHS[type] || NODE_PATHS.event} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
