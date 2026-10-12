// components/RematchSetup.jsx — Aufstellung für die Revanche, im Abpfiff-Bildschirm. Pro Team eine Zeile mit der
// aktuellen Aufstellung; „ändern" klappt die Auswahl auf. entries: [{ team, label, value, onChange }]
import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FORMATIONS } from "../engine/index.js";
import FormationPicker from "./FormationPicker.jsx";

export default function RematchSetup({ entries }) {
  const [open, setOpen] = useState(null); // Team, dessen Auswahl offen ist
  if (!entries.length) return null;
  const current = entries.find((e) => e.team === open);
  return (
    <div className="fk-rematch-setup">
      <p className="fk-label mb-2">Aufstellung für die Revanche</p>
      <div className="flex flex-wrap justify-center gap-2">
        {entries.map((e) => (
          <button
            key={e.team}
            type="button"
            className="fk-rematch-chip"
            aria-expanded={open === e.team}
            onClick={() => setOpen(open === e.team ? null : e.team)}
          >
            <span className={`fk-cap fk-cap-${e.team}`} aria-hidden="true" />
            {e.label && <span className="fk-faint">{e.label}</span>}
            <span className="font-bold">{FORMATIONS[e.value]?.name}</span>
            <span className="fk-faint text-[12px]">ändern</span>
            {open === e.team ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        ))}
      </div>
      {current && (
        <div className="mt-3 text-left">
          <FormationPicker
            value={current.value}
            team={current.team}
            className="grid-cols-5 @xl:grid-cols-10"
            onChange={(id) => {
              current.onChange(id);
              setOpen(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
