// components/FormationPicker.jsx — Aufstellungen als kleine Spielfeld-Hälften zum Antippen.
import React from "react";
import { FIELD, FORMATIONS, FORMATION_IDS, PIECE } from "../engine/index.js";
import { TEAM_COLORS } from "../render.js";

const HALF_W = FIELD.W / 2 + 20;
const PAD = 30;

function HalfPitch({ id, team }) {
  const spots = FORMATIONS[id].spots;
  const g0 = (FIELD.H - FIELD.GOAL_W) / 2;
  return (
    <svg viewBox={`${-PAD} 0 ${HALF_W + PAD} ${FIELD.H}`} aria-hidden="true">
      <rect x={-PAD} y="0" width={HALF_W + PAD} height={FIELD.H} fill="#2c8545" />
      <rect x={-PAD} y={g0} width={PAD} height={FIELD.GOAL_W} fill="#10221a" />
      <g fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth="6">
        <rect x="3" y="3" width={HALF_W} height={FIELD.H - 6} />
        <line x1={FIELD.W / 2} y1="0" x2={FIELD.W / 2} y2={FIELD.H} />
        <circle cx={FIELD.W / 2} cy={FIELD.H / 2} r={FIELD.CENTER_R} />
        <rect x="3" y={FIELD.H * 0.2} width={FIELD.W * 0.16} height={FIELD.H * 0.6} />
      </g>
      {spots.map(([fx, fy], i) => (
        <circle key={i} cx={fx * FIELD.W} cy={fy * FIELD.H} r={PIECE.R * 1.2} fill={TEAM_COLORS[team].main} stroke="#f4f6f4" strokeWidth="9" />
      ))}
    </svg>
  );
}

export default function FormationPicker({ value, onChange, team = 0, disabled = false, className = "grid-cols-3 sm:grid-cols-5" }) {
  return (
    <div className={`grid gap-2 ${className}`} role="group" aria-label="Aufstellung">
      {FORMATION_IDS.map((id) => (
        <button
          key={id}
          type="button"
          className="fk-formation"
          aria-pressed={value === id}
          disabled={disabled}
          onClick={() => onChange(id)}
          title={`${FORMATIONS[id].name}: ${FORMATIONS[id].hint}`}
        >
          <HalfPitch id={id} team={team} />
          <span className="block px-0.5 min-w-0">
            <span className="block font-semibold text-[13px] leading-tight truncate">{FORMATIONS[id].name}</span>
            <span className="block fk-label text-[11px] leading-tight mt-0.5">{FORMATIONS[id].code}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
