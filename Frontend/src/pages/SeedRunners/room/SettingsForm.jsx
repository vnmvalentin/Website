// SettingsForm.jsx — Seed-Art eines einzelnen Zufallsrennens: Zufall, Tages-Seed oder eigener Seed. Länge, Tempo und Biom
// stellt niemand mehr ein (Pfad-Generator: immer lang und „super schnell“, das Biom würfelt der Seed aus). `disabled` zeigt
// alles schreibgeschützt für alle außer dem Host.
import React from "react";
import { SEED_MODE_LABELS, SEED_MODE_HINTS } from "./labels.js";
import { Tabs } from "../ui/kit.jsx";

export default function SettingsForm({ settings, onChange, disabled = false }) {
  return (
    <div>
      <span className="sr-label block mb-1">Seed</span>
      <Tabs
        label="Seed"
        value={settings.seedMode}
        onChange={(id) => { if (!disabled) onChange({ seedMode: id }); }}
        tabs={Object.entries(SEED_MODE_LABELS).map(([id, label]) => ({ id, label }))}
      />
      <p className="text-xs sr-faint mt-2 leading-relaxed">{SEED_MODE_HINTS[settings.seedMode]}</p>
      {settings.seedMode === "custom" && (
        <input
          type="text"
          disabled={disabled}
          value={settings.seed}
          onChange={(e) => onChange({ seed: e.target.value })}
          maxLength={40}
          placeholder="Seed eingeben"
          className="sr-input mt-2"
        />
      )}
    </div>
  );
}
