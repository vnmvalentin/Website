// TuningPanel.jsx — Slider für alle Werte aus sim/config.js, live wirksam. Nur für die
// Testseite gedacht: Im Rennen gibt es keine Möglichkeit, Werte zu verstellen.
import React, { useMemo } from "react";
import { TUNING, TUNING_SPEC } from "../sim/config.js";

function formatValue(value, spec) {
  const shown = Number.isInteger(spec.step) ? String(Math.round(value)) : String(Number(value.toFixed(3)));
  return spec.unit ? `${shown} ${spec.unit}` : shown;
}

export default function TuningPanel({ values, onChange }) {
  // Gruppen in der Reihenfolge, in der sie in der Config zum ersten Mal vorkommen
  const groups = useMemo(() => {
    const out = [];
    for (const [key, spec] of Object.entries(TUNING_SPEC)) {
      let group = out.find((g) => g.name === spec.group);
      if (!group) {
        group = { name: spec.group, items: [] };
        out.push(group);
      }
      group.items.push([key, spec]);
    }
    return out;
  }, []);

  return (
    <div className="divide-y divide-white/10">
      {groups.map((group, index) => (
        <details key={group.name} open={index === 0} className="group">
          <summary className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-white cursor-pointer select-none hover:bg-white/[0.03]">
            {group.name}
            <span className="text-white/30 text-xs font-normal tabular-nums">{group.items.length}</span>
          </summary>
          <div className="px-4 pb-4 grid gap-3">
            {group.items.map(([key, spec]) => {
              const value = values[key];
              const changed = value !== TUNING[key];
              return (
                <div key={key} className="border border-white/10 bg-white/[0.03] rounded-md p-3">
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <span className="text-xs text-white/70">{spec.label}</span>
                    <button
                      type="button"
                      onClick={() => onChange(key, TUNING[key])}
                      title={changed ? `Auf Standard zurücksetzen (${formatValue(TUNING[key], spec)})` : "Entspricht dem Standard"}
                      className={`text-xs tabular-nums shrink-0 ${changed ? "text-violet-300 hover:text-violet-200" : "text-white/40 cursor-default"}`}
                    >
                      {formatValue(value, spec)}
                    </button>
                  </div>
                  <input
                    type="range"
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    value={value}
                    onChange={(e) => onChange(key, Number(e.target.value))}
                    // Sonst behält der Slider den Fokus und schluckt danach die Pfeiltasten
                    // (die Steuerung ignoriert Eingaben, solange ein Formularfeld fokussiert ist).
                    onPointerUp={(e) => e.currentTarget.blur()}
                    className="w-full accent-violet-500"
                  />
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
