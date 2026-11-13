// components/SkinPicker.jsx — Scheiben-Designs in zwei Gruppen: Motive (die Scheibe ist etwas ganz anderes) und Muster
// (Teamfarbe mit Nummer). Freigeschaltete zum Auswählen, gesperrte mit Bedingung und Fortschritt.
import React from "react";
import { Lock } from "lucide-react";
import { SKINS, SKIN_IDS, isUnlocked, skinProgress } from "../engine/index.js";
import DiscPreview from "./DiscPreview.jsx";

const GROUPS = [
  ["Motive", SKIN_IDS.filter((id) => SKINS[id].motif)],
  ["Muster", SKIN_IDS.filter((id) => !SKINS[id].motif)],
];

export default function SkinPicker({ value, onChange, team = 0, stats }) {
  return (
    <div className="grid gap-4">
      {GROUPS.map(([label, ids]) => (
        <div key={label}>
          <p className="fk-label text-[11px] mb-2">{label}</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" role="group" aria-label={`Scheiben-Design: ${label}`}>
            {ids.map((id) => {
              const open = isUnlocked(id, stats);
              const prog = skinProgress(id, stats);
              return (
                <button
                  key={id}
                  type="button"
                  className="fk-skin"
                  aria-pressed={value === id}
                  disabled={!open}
                  onClick={() => onChange(id)}
                  title={open ? SKINS[id].name : SKINS[id].need.label}
                >
                  <span className="fk-skin-disc">
                    <DiscPreview skin={id} team={team} size={52} />
                    {!open && <span className="fk-skin-lock"><Lock size={15} /></span>}
                  </span>
                  <span className="block font-semibold text-[13px] leading-tight truncate w-full">{SKINS[id].name}</span>
                  <span className="block fk-faint text-[11px] leading-tight w-full">
                    {open ? "frei" : `${prog.have}/${prog.need} · ${SKINS[id].need.label}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
