// ui/VolumeControl.jsx — Ton an/aus und Lautstärke, sichtbar in der Kopfleiste (Menüs) und im Spiel oben rechts unter der
// Uhr. Schreibt in ui/settings.js (volume); „Ton aus“ merkt sich die Lautstärke davor in volumeBefore, „Ton an“ holt sie
// zurück. Das Pausenmenü zeigt denselben Wert (alle lesen über subscribeSettings).
import React, { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getSettings, updateSettings, subscribeSettings } from "./settings.js";
import { playSound } from "./sound.js";

// Lautstärke für „Ton an“, wenn vorher nichts gemerkt wurde
const FALLBACK_VOLUME = 0.35;

// buttonOnly: nur der Knopf Ton an/aus (Handy-Leiste im Spiel; der Regler steht dort im Pausenmenü)
export default function VolumeControl({ compact = false, rangeOnSmall = true, buttonOnly = false, className = "" }) {
  const [s, setS] = useState(getSettings);
  useEffect(() => subscribeSettings(setS), []);
  const pct = Math.round((s.volume || 0) * 100);
  const silent = pct === 0;

  const toggle = () => {
    if (silent) updateSettings({ volume: s.volumeBefore > 0 ? s.volumeBefore : FALLBACK_VOLUME });
    else updateSettings({ volume: 0, volumeBefore: s.volume });
  };
  // Nach dem Klicken den Fokus abgeben: Solange ein Regler ihn hat, kommen WASD nicht beim Spiel an (render/runner.js
  // überspringt Tasten in Eingabefeldern), und Leertaste würde den Knopf erneut auslösen.
  const release = (e) => e.currentTarget.blur();
  // Beim Loslassen einmal anspielen, damit man die neue Lautstärke hört
  const releaseRange = (e) => { release(e); playSound("pick"); };

  const icon = compact ? 15 : 17;
  return (
    <div className={`av-volume${compact ? " av-volume-compact" : ""} ${className}`}>
      <button type="button" className="av-volume-btn" onClick={toggle} onPointerUp={release}
        title={silent ? "Ton an" : "Ton aus"} aria-label={silent ? "Ton an" : "Ton aus"}>
        {silent ? <VolumeX size={icon} /> : <Volume2 size={icon} />}
      </button>
      {!buttonOnly && <input type="range" min="0" max="100" step="5" value={pct}
        className={`av-volume-range${rangeOnSmall ? "" : " hidden sm:block"}`}
        onChange={(e) => updateSettings({ volume: Number(e.target.value) / 100 })} onPointerUp={releaseRange}
        aria-label="Lautstärke" title={`Lautstärke ${pct} %`} />}
    </div>
  );
}
