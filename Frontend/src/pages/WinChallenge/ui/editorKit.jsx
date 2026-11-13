// ui/editorKit.jsx — Bedienelemente des Win-Challenge-Editors: Schalter, Regler und
// Umschalter als eigene eckige Elemente statt der Browser-Standardformen. Genutzt vom
// Editor, der Moderator-Ansicht und dem Timer-Feld.
import React from "react";

/** Eine Einstellung: Name links, Bedienelement rechts. */
export const SettingRow = ({ label, children }) => (
  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 py-2">
    <span className="text-sm text-white/70">{label}</span>
    {children}
  </div>
);

/** Ein/Aus-Schalter mit Beschriftung. Eckig wie die übrigen Elemente, keine Pille. */
export const Switch = ({ label, hint, checked, onChange }) => (
  <label className="flex items-center justify-between gap-4 py-2 cursor-pointer select-none">
    <span className="min-w-0">
      <span className="block text-sm text-white/80">{label}</span>
      {hint && <span className="block text-xs text-white/40 mt-0.5">{hint}</span>}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 shrink-0 rounded-sm transition-colors ${checked ? "bg-violet-600" : "bg-white/15"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-[2px] bg-white transition-transform ${checked ? "translate-x-4" : ""}`} />
    </button>
  </label>
);

// Der Griff des Reglers muss je Browser-Engine einzeln gestaltet werden
const RANGE_THUMB =
  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-[3px] [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-[3px] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white";

/** Regler mit gefüllter Spur bis zum Griff und dem Wert dahinter. */
export const RangeSlider = ({ label, value, min, max, step, onChange, unit = "" }) => {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <SettingRow label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          aria-label={label}
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          // Harte Kante statt Verlauf: links vom Griff Akzent, rechts die leere Spur
          style={{ background: `linear-gradient(to right, #8b5cf6 ${pct}%, rgba(255,255,255,0.12) ${pct}%)` }}
          className={`flex-1 min-w-0 h-1 rounded-sm appearance-none cursor-pointer ${RANGE_THUMB}`}
        />
        <span className="w-14 text-right text-sm text-white tabular-nums">{value}{unit}</span>
      </div>
    </SettingRow>
  );
};

/** Auswahl aus wenigen festen Werten (Unterreiter, Zähler-Anzeige, Ausrichtung, …). */
export const Segmented = ({ label, options, value, onChange }) => (
  <div className="flex bg-white/[0.06] rounded-sm p-0.5" role="group" aria-label={label}>
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        aria-pressed={value === o.value}
        className={`flex-1 px-2 py-1.5 rounded-[3px] text-xs font-bold whitespace-nowrap transition-colors ${value === o.value ? "bg-violet-500/30 text-white" : "text-white/45 hover:text-white"}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);
