// components/FormationPicker.jsx — Aufstellungen als kleine Spielfeld-Hälften zum Antippen: die zehn fertigen, danach
// die selbst gebauten (gemerkt in den Einstellungen der Hülle) und eine Kachel „Eigene bauen", die den Editor öffnet
// (FormationEditor.jsx). Eine eigene Aufstellung ist für den Rest des Spiels nur eine Zeichenkette wie jede andere ID.
import React, { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { FIELD, FORMATIONS, FORMATION_IDS, PIECE, formationInfo, isCustomFormation } from "../engine/index.js";
import { TEAM_COLORS } from "../render.js";
import { useFlickShell } from "../ui/shellContext.js";
import { MAX_CUSTOM_FORMATIONS } from "../prefs.js";
import FormationEditor from "./FormationEditor.jsx";

const HALF_W = FIELD.W / 2 + 20;
const PAD = 30;

/** Linke Spielfeld-Hälfte mit fünf Scheiben. spots: [[fx, fy] × 5] */
export function HalfPitch({ spots, team }) {
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

/**
 * value / onChange: gewählte Aufstellung (ID oder eigene) · team: Farbe der Scheiben
 * editable: eigene Aufstellungen anlegen und ändern (aus, wo nur angesehen wird)
 */
export default function FormationPicker({ value, onChange, team = 0, disabled = false, editable = true, className = "grid-cols-3 sm:grid-cols-5" }) {
  const { prefs, updatePrefs } = useFlickShell();
  const [editing, setEditing] = useState(null); // null | { id: eigene Aufstellung oder null (neu) }
  const saved = prefs.customFormations || [];
  // Eine gewählte eigene Aufstellung, die nicht (mehr) in der Liste steht, bleibt trotzdem sichtbar
  const customs = isCustomFormation(value) && !saved.includes(value) ? [...saved, value] : saved;
  const canAdd = editable && !disabled && saved.length < MAX_CUSTOM_FORMATIONS;

  const save = (id) => {
    const old = editing?.id;
    const list = old && saved.includes(old) ? saved.map((c) => (c === old ? id : c)) : [...saved, id];
    updatePrefs({ customFormations: [...new Set(list)].slice(0, MAX_CUSTOM_FORMATIONS) });
    setEditing(null);
    onChange(id);
  };
  const remove = () => {
    const old = editing?.id;
    updatePrefs({ customFormations: saved.filter((c) => c !== old) });
    setEditing(null);
    if (value === old) onChange("2-2");
  };

  return (
    <>
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
            <HalfPitch spots={FORMATIONS[id].spots} team={team} />
            <span className="block px-0.5 min-w-0">
              <span className="block font-semibold text-[13px] leading-tight truncate">{FORMATIONS[id].name}</span>
              <span className="block fk-label text-[11px] leading-tight mt-0.5">{FORMATIONS[id].code}</span>
            </span>
          </button>
        ))}
        {customs.map((id, i) => (
          <div key={id} className="fk-formation-own">
            <button
              type="button"
              className="fk-formation"
              aria-pressed={value === id}
              disabled={disabled}
              onClick={() => onChange(id)}
              title="Deine eigene Aufstellung"
            >
              <HalfPitch spots={formationInfo(id).spots} team={team} />
              <span className="block px-0.5 min-w-0">
                <span className="block font-semibold text-[13px] leading-tight truncate">Eigene {i + 1}</span>
                <span className="block fk-label text-[11px] leading-tight mt-0.5 fk-lime">Eigenbau</span>
              </span>
            </button>
            {editable && !disabled && saved.includes(id) && (
              <button type="button" className="fk-formation-edit" onClick={() => setEditing({ id })} title="Bearbeiten" aria-label={`Eigene ${i + 1} bearbeiten`}>
                <Pencil size={13} />
              </button>
            )}
          </div>
        ))}
        {canAdd && (
          <button type="button" className="fk-formation fk-formation-new" onClick={() => setEditing({ id: null })} title="Eigene Aufstellung bauen">
            <span className="fk-formation-plus"><Plus size={22} /></span>
            <span className="block px-0.5 min-w-0">
              <span className="block font-semibold text-[13px] leading-tight truncate">Eigene bauen</span>
              <span className="block fk-label text-[11px] leading-tight mt-0.5">{saved.length}/{MAX_CUSTOM_FORMATIONS}</span>
            </span>
          </button>
        )}
      </div>
      {editing && (
        <FormationEditor
          start={editing.id || value}
          team={team}
          isNew={!editing.id}
          onSave={save}
          onDelete={editing.id ? remove : null}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
