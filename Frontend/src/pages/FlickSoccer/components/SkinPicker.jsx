// components/SkinPicker.jsx — Scheiben-Designs in Gruppen: Motive (die Scheibe ist etwas ganz anderes), Muster
// (Teamfarbe mit Nummer) und Designs aus dem Laden. Freigeschaltete zum Auswählen, gesperrte mit Bedingung und
// Fortschritt. Laden-Designs: gekaufte zum Auswählen; nicht gekaufte führen in den Laden — aber nur, solange der Laden
// für Besucher sichtbar ist (sonst fehlt die Gruppe ganz).
import React from "react";
import { Link } from "react-router-dom";
import { Lock, ShoppingBag } from "lucide-react";
import { SKINS, SKIN_IDS, isUnlocked, skinProgress } from "../engine/index.js";
import DiscPreview from "./DiscPreview.jsx";
import { ladenSichtbar } from "../../../utils/ladenBesitz.js";

const GROUPS = [
  ["Motive", SKIN_IDS.filter((id) => SKINS[id].motif && !SKINS[id].laden)],
  ["Muster", SKIN_IDS.filter((id) => !SKINS[id].motif && !SKINS[id].laden)],
];
const LADEN_IDS = SKIN_IDS.filter((id) => SKINS[id].laden);

export default function SkinPicker({ value, onChange, team = 0, stats, besitz = null }) {
  const laden = LADEN_IDS.filter((id) => isUnlocked(id, stats, besitz) || ladenSichtbar());
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
      {laden.length > 0 && (
        <div>
          <p className="fk-label text-[11px] mb-2">Aus dem Laden</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" role="group" aria-label="Scheiben-Design: aus dem Laden">
            {laden.map((id) => {
              const open = isUnlocked(id, stats, besitz);
              const inhalt = (
                <>
                  <span className="fk-skin-disc">
                    <DiscPreview skin={id} team={team} size={52} />
                    {!open && <span className="fk-skin-lock"><ShoppingBag size={15} /></span>}
                  </span>
                  <span className="block font-semibold text-[13px] leading-tight truncate w-full">{SKINS[id].name}</span>
                  <span className="block fk-faint text-[11px] leading-tight w-full">{open ? "gekauft" : "im Laden"}</span>
                </>
              );
              return open ? (
                <button key={id} type="button" className="fk-skin" aria-pressed={value === id} onClick={() => onChange(id)} title={SKINS[id].name}>
                  {inhalt}
                </button>
              ) : (
                <Link key={id} to="/laden" className="fk-skin" title={`${SKINS[id].name}: im Laden ansehen`}>
                  {inhalt}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
