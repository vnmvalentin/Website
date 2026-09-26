// FxPanel.jsx — Einstellungen für Ton und Effekte, eine flache Leiste unter dem Spielfeld.
// Der Zustand liegt in fxSettings.js und wird im Browser gespeichert.
import React, { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getFx, setFx, subscribeFx } from "./fxSettings.js";

const Toggle = ({ id, label, checked, onChange }) => (
  <label htmlFor={id} className="flex items-center gap-2 text-sm text-white/70 cursor-pointer select-none">
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-violet-500 w-4 h-4"
    />
    {label}
  </label>
);

export default function FxPanel() {
  const fx = useSyncExternalStore(subscribeFx, getFx, getFx);
  return (
    <div className="bg-[#0d0d14] border border-white/10 rounded-md px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2">
      <span className="text-[11px] uppercase tracking-wider text-white/35">Effekte</span>
      <Toggle id="fx-sound" label="Ton" checked={fx.sound} onChange={(v) => setFx({ sound: v })} />
      <label htmlFor="fx-volume" className={`flex items-center gap-2 text-sm ${fx.sound ? "text-white/70" : "text-white/30"}`}>
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
          className="accent-violet-500 w-28"
        />
      </label>
      <Toggle id="fx-shake" label="Bildschütteln" checked={fx.shake} onChange={(v) => setFx({ shake: v })} />
      <Toggle id="fx-particles" label="Partikel" checked={fx.particles} onChange={(v) => setFx({ particles: v })} />
    </div>
  );
}
