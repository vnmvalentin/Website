// FxSettingsButton.jsx — Ton- und Effekt-Einstellungen hinter einem Zahnrad, statt als Leiste unter
// dem Spielfeld. Sie gehören ins Menü und in die Lobby: Während des Laufs schaut niemand dorthin, und
// unter dem Bild haben sie nur Platz weggenommen (Rückmeldung vom 23.09.2026).
//
// Der Zustand selbst liegt weiterhin in fxSettings.js (Browser-Speicher) — hier steht nur die Hülle. Seit 26.09.2026 auch die
// Anzeige: Minimap (Größe, Ausschnitt, Ecke) und die Farbe der eigenen Figur.
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Settings, Volume2, VolumeX } from "lucide-react";
import { getFx, setFx, subscribeFx, FIGUR_FARBEN } from "./fxSettings.js";

const Row = ({ id, label, checked, onChange }) => (
  <label htmlFor={id} className="flex items-center justify-between gap-3 py-2 text-sm sr-dim cursor-pointer select-none">
    {label}
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="sr-check"
    />
  </label>
);

/** Eine Reihe gleichwertiger Knöpfe, von denen einer gewählt ist */
function Wahl({ label, value, options, onChange }) {
  return (
    <div className="py-2">
      <p className="text-sm sr-dim mb-1.5">{label}</p>
      <div className="flex gap-1" role="group" aria-label={label}>
        {options.map(([id, text]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
            className={`flex-1 sr-cond text-[13px] font-semibold px-1.5 py-1 rounded-[2px] transition-colors ${value === id ? "bg-[var(--sr-accent)] text-[var(--sr-on-accent)]" : "sr-dim hover:bg-white/[0.06] shadow-[inset_0_0_0_1px_var(--sr-line-strong)]"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Vier Ecken als kleines Spielfeld: ein Klick setzt die Ecke der Minimap */
function Ecke({ value, onChange }) {
  const ecken = [["ol", "oben links"], ["or", "oben rechts"], ["ul", "unten links"], ["ur", "unten rechts"]];
  return (
    <div className="py-2 flex items-center justify-between gap-3">
      <p className="text-sm sr-dim">Position</p>
      <div className="grid grid-cols-2 gap-1 p-1 w-20 h-12 sr-sunk" role="group" aria-label="Position der Minimap">
        {ecken.map(([id, text]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            aria-label={`Minimap ${text}`}
            title={text}
            onClick={() => onChange(id)}
            className={`rounded-[2px] transition-colors ${value === id ? "bg-[var(--sr-accent)]" : "bg-white/[0.08] hover:bg-white/[0.18]"}`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * @param align  "right" (Standard) oder "left": an welcher Kante des Knopfs das Feld aufklappt
 */
export default function FxSettingsButton({ align = "right" }) {
  const fx = useSyncExternalStore(subscribeFx, getFx, getFx);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // Klick daneben oder Escape schließt — sonst bleibt das Feld offen stehen, wenn man weiterspielt
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="sr-btn sr-btn-sm sr-btn-ghost"
      >
        <Settings size={14} />
        <span className="hidden md:inline">Einstellungen</span>
      </button>
      {open && (
        <div
          data-sr-popup
          className={`absolute z-50 mt-2 w-72 max-h-[calc(100dvh-80px)] overflow-y-auto sr-panel px-4 py-3 ${align === "left" ? "left-0" : "right-0"}`}
        >
          <p className="sr-label mb-1">Ton und Effekte</p>
          <div className="sr-rows">
            <Row id="fx-sound" label="Ton" checked={fx.sound} onChange={(v) => setFx({ sound: v })} />
            <label htmlFor="fx-volume" className={`flex items-center gap-2 py-2 text-sm ${fx.sound ? "sr-dim" : "sr-faint"}`}>
              {fx.sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
              <span className="sr-only">Lautstärke</span>
              <input
                id="fx-volume"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={fx.volume}
                disabled={!fx.sound}
                onChange={(e) => setFx({ volume: Number(e.target.value) })}
                className="flex-1 accent-[var(--sr-accent)]"
              />
            </label>
            <Row id="fx-shake" label="Bildschütteln" checked={fx.shake} onChange={(v) => setFx({ shake: v })} />
            <Row id="fx-particles" label="Partikel" checked={fx.particles} onChange={(v) => setFx({ particles: v })} />
          </div>

          <p className="sr-label mt-4 mb-1">Minimap</p>
          <div className="sr-rows">
            <Wahl
              label="Größe"
              value={fx.minimap}
              onChange={(v) => setFx({ minimap: v })}
              options={[["aus", "Aus"], ["klein", "Klein"], ["mittel", "Mittel"], ["gross", "Groß"]]}
            />
            {fx.minimap !== "aus" && (
              <>
                <Wahl
                  label="Ausschnitt"
                  value={fx.minimapAnsicht}
                  onChange={(v) => setFx({ minimapAnsicht: v })}
                  options={[["umgebung", "Umgebung"], ["ganz", "Ganzes Level"]]}
                />
                <Ecke value={fx.minimapEcke} onChange={(v) => setFx({ minimapEcke: v })} />
              </>
            )}
          </div>

          <p className="sr-label mt-4 mb-1">Deine Figur</p>
          <div className="flex flex-wrap gap-1.5 py-2" role="radiogroup" aria-label="Farbe deiner Figur">
            <button
              type="button"
              role="radio"
              aria-checked={!fx.farbe}
              onClick={() => setFx({ farbe: null })}
              title="Standard"
              className={`w-7 h-7 rounded-[2px] bg-[#a78bfa] ${!fx.farbe ? "outline outline-2 outline-offset-2 outline-[var(--sr-ink)]" : ""}`}
              aria-label="Standardfarbe"
            />
            {FIGUR_FARBEN.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={fx.farbe === c}
                onClick={() => setFx({ farbe: c })}
                className={`w-7 h-7 rounded-[2px] ${fx.farbe === c ? "outline outline-2 outline-offset-2 outline-[var(--sr-ink)]" : ""}`}
                style={{ background: c }}
                aria-label={`Farbe ${c}`}
              />
            ))}
          </div>
          <p className="text-xs sr-faint leading-relaxed pb-1">Im Mehrspieler bekommst du die Farbe, wenn sie in der Lobby noch frei ist.</p>
        </div>
      )}
    </div>
  );
}
