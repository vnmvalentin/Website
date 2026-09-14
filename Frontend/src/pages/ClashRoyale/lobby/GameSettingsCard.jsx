// Zusammenfassung + Zugang zu den Modusreglern (GameSettingsModal.jsx) — wieder ein
// eigenes Fenster statt dauerhaft eingeblendeter Regler: bei Modi mit vielen Einstellungen
// (Presets + mehrere Slider) schob das dauerhafte Einblenden die Spalte so weit runter,
// dass man bis zum Kartenpool darunter scrollen musste. Gleiches Kachel-Muster wie
// CardPoolCard.jsx nebenan.
import React from 'react';
import { Sliders } from 'lucide-react';
import { modeNameFor } from '../modesConfig';

export default function GameSettingsCard({ lobbyData, lang, t, onOpen }) {
  return (
    <div className="cr-arcade-panel p-5">
      <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
        <Sliders size={13} className="text-white/40" />
        {t.hostPanelTitle}
      </p>
      <button onClick={onOpen}
        className="w-full flex items-center justify-between gap-2 bg-black/30 border border-white/10 hover:border-white/25 rounded-lg px-3.5 py-3 transition-colors text-left">
        <span className="text-sm font-semibold text-white">{modeNameFor(lobbyData?.mode || 'snake', lang)}</span>
        <span className="text-violet-400 text-xs font-semibold shrink-0">{t.edit}</span>
      </button>
      <p className="text-white/30 text-xs mt-2">{t.hostPanelHint}</p>
    </div>
  );
}
