// components/MatchOptions.jsx — Regeln einer Partie, gleich im Menü und in der Online-Lobby: Tore, Zugzeit, Feld,
// Torwiederholung, Chaos. value = Einstellungen (engine normalizeSettings), onChange(patch); disabled = nur ansehen.
import React from "react";
import { FIELDS, FIELD_IDS, RULES } from "../engine/index.js";

export function Seg({ value, options, onChange, label, disabled = false }) {
  return (
    <div className="fk-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={value === o.value} disabled={disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Ein-/Aus-Schalter als ein Knopf: Beschriftung links, Zustand rechts
function Toggle({ label, title, on, onChange, disabled }) {
  return (
    <button type="button" className="fk-toggle" aria-pressed={on} disabled={disabled} title={title} onClick={() => onChange(!on)}>
      <span className="fk-label">{label}</span>
      <span className="fk-toggle-state">{on ? "An" : "Aus"}</span>
    </button>
  );
}

export default function MatchOptions({ value, onChange, disabled = false }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="fk-label">Tore zum Sieg</span>
        <Seg
          label="Tore zum Sieg"
          disabled={disabled}
          value={value.goalsToWin}
          onChange={(goalsToWin) => onChange({ goalsToWin })}
          options={RULES.GOALS_TO_WIN.map((g) => ({ value: g, label: String(g) }))}
        />
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="fk-label">Zugzeit</span>
        <Seg
          label="Zugzeit"
          disabled={disabled}
          value={value.turnSeconds}
          onChange={(turnSeconds) => onChange({ turnSeconds })}
          options={RULES.TURN_SECONDS.map((s) => ({ value: s, label: s ? `${s} s` : "Aus" }))}
        />
      </div>
      <label className="flex items-center justify-between gap-3">
        <span className="fk-label" title={FIELDS[value.field]?.hint}>Feld</span>
        <select
          className="fk-input fk-select"
          value={value.field}
          disabled={disabled}
          onChange={(e) => onChange({ field: e.target.value })}
          aria-label="Feld"
        >
          {FIELD_IDS.map((id) => <option key={id} value={id}>{FIELDS[id].name}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Toggle
          label="Wiederholung"
          title="Nach jedem Tor die letzten Sekunden in Zeitlupe"
          on={value.replay}
          disabled={disabled}
          onChange={(replay) => onChange({ replay })}
        />
        <Toggle
          label="Chaos"
          title="Jeder Zug bringt ein zufälliges Power-up — in sechs Zügen bekommt jedes Team jedes einmal"
          on={value.chaos}
          disabled={disabled}
          onChange={(chaos) => onChange({ chaos })}
        />
      </div>
    </div>
  );
}
