// components/LookPicker.jsx — Auswahl für Ball, Rasen und Torjubel (Kataloge in progress.js): freigeschaltete zum
// Auswählen, gesperrte mit Bedingung und Fortschritt. Gleiches Aussehen wie die Scheiben-Auswahl (SkinPicker).
import React, { useEffect, useRef } from "react";
import { Lock, Sparkles } from "lucide-react";
import { CATALOGS, itemProgress, itemUnlocked } from "../progress.js";
import { drawBallPreview, drawTurfPreview } from "../render.js";

export function LookPreview({ kind, id, size = 44 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    let alive = true;
    const draw = () => {
      if (!alive) return;
      if (kind === "ball") drawBallPreview(canvas, id);
      else if (kind === "turf") drawTurfPreview(canvas, id);
    };
    draw();
    document.fonts?.ready.then(draw).catch(() => {}); // der Achter-Ball hat eine Ziffer
    return () => {
      alive = false;
    };
  }, [kind, id, size]);
  if (kind === "celebration") {
    return <span className="fk-look-icon" style={{ width: size, height: size }}><Sparkles size={Math.round(size * 0.5)} /></span>;
  }
  return <canvas ref={ref} className={kind === "turf" ? "fk-look-turf" : ""} style={{ width: size, height: size, display: "block" }} aria-hidden="true" />;
}

export default function LookPicker({ kind, value, onChange, stats }) {
  const catalog = CATALOGS[kind];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" role="group">
      {Object.keys(catalog).map((id) => {
        const item = catalog[id];
        const open = itemUnlocked(catalog, id, stats);
        const prog = itemProgress(catalog, id, stats);
        return (
          <button
            key={id}
            type="button"
            className="fk-skin"
            aria-pressed={value === id}
            disabled={!open}
            onClick={() => onChange(id)}
            title={open ? item.name : item.need.label}
          >
            <span className="fk-skin-disc">
              <LookPreview kind={kind} id={id} />
              {!open && <span className="fk-skin-lock"><Lock size={15} /></span>}
            </span>
            <span className="block font-semibold text-[13px] leading-tight truncate w-full">{item.name}</span>
            <span className="block fk-faint text-[11px] leading-tight w-full">
              {open ? "frei" : `${prog.have}/${prog.need} · ${item.need.label}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
