// components/FieldPicker.jsx — Feld-Auswahl: ein Knopf mit Vorschaubild und Name des aktuellen Felds; ein Klick
// öffnet alle Felder als Bilder zum Antippen. Die Vorschau malt dieselbe Routine wie das Spielfeld (fieldArt.js).
import React, { useEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { FIELDS, FIELD_IDS } from "../engine/index.js";
import { WORLD, drawFieldPreview } from "../render.js";

export function FieldThumb({ id, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const draw = () => drawFieldPreview(canvas, id);
    draw();
    // Größe steht erst nach dem Layout fest (Raster im Fenster) — beim Ändern neu malen
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [id]);
  return <canvas ref={ref} className={`fk-field-thumb ${className}`} style={{ aspectRatio: `${WORLD.w} / ${WORLD.h}` }} aria-hidden="true" />;
}

// Was ein Feld besonders macht, als kurzes Etikett
function fieldTag(f) {
  if (f.friction < 1) return "rutschig";
  if (f.friction > 1) return "zäh";
  if (f.portals.length) return "Portale";
  if (f.bumpers.some((b) => b.kick > 0)) return "Bumper";
  if (f.bumpers.length) return "Hindernisse";
  if (f.inner.length) return "Mauern";
  if (f.round) return "runde Ecken";
  if (f.cut) return "schräge Ecken";
  if (f.W < 1000) return "klein";
  if (f.GOAL_W > 200) return "große Tore";
  return "klassisch";
}

export default function FieldPicker({ value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const f = FIELDS[value] || FIELDS.standard;

  return (
    <>
      <button type="button" className="fk-field-btn" onClick={() => setOpen(true)} disabled={disabled} title={f.hint} aria-haspopup="dialog">
        <FieldThumb id={f.id} />
        <span className="min-w-0 flex-1 text-left">
          <span className="fk-label block text-[11px]">Feld</span>
          <span className="block font-bold leading-tight truncate">{f.name}</span>
          <span className="block fk-faint text-[12.5px] leading-snug truncate">{f.hint}</span>
        </span>
        {!disabled && <ChevronRight size={17} className="fk-faint shrink-0" />}
      </button>
      {open && (
        <div className="fk-dialog-backdrop" onClick={() => setOpen(false)}>
          <div className="fk-card fk-dialog fk-dialog-fields" role="dialog" aria-modal="true" aria-labelledby="fk-field-title" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <div>
                <h2 id="fk-field-title" className="fk-display text-2xl">Feld wählen</h2>
                <p className="fk-faint text-[13px] mt-1">{FIELD_IDS.length} Felder — jedes spielt sich anders.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="fk-icon-btn" aria-label="Schließen"><X size={17} /></button>
            </div>
            <div className="fk-field-grid px-5 pb-5" role="group" aria-label="Feld">
              {FIELD_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="fk-field-tile"
                  aria-pressed={value === id}
                  onClick={() => {
                    onChange(id);
                    setOpen(false);
                  }}
                >
                  <FieldThumb id={id} />
                  <span className="flex items-baseline justify-between gap-2 mt-2">
                    <span className="font-bold text-[15px] leading-tight">{FIELDS[id].name}</span>
                    <span className="fk-label text-[10.5px]">{fieldTag(FIELDS[id])}</span>
                  </span>
                  <span className="block fk-faint text-[12.5px] leading-snug mt-0.5">{FIELDS[id].hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
