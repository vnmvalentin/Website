// components/SkinPicker.jsx — Scheiben-Designs: freigeschaltete zum Auswählen, gesperrte mit Bedingung und Fortschritt.
import React from "react";
import { Lock } from "lucide-react";
import { SKINS, SKIN_IDS, isUnlocked, skinProgress } from "../engine/index.js";
import DiscPreview from "./DiscPreview.jsx";

export default function SkinPicker({ value, onChange, team = 0, stats }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" role="group" aria-label="Scheiben-Design">
      {SKIN_IDS.map((id) => {
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
              <DiscPreview skin={id} team={team} size={48} />
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
  );
}
