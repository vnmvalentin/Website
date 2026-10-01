// Zugang zu den Modusreglern (GameSettingsModal.jsx) — ein eigenes Fenster statt dauerhaft
// eingeblendeter Regler: bei Modi mit vielen Einstellungen (Presets + mehrere Slider) schob
// das dauerhafte Einblenden die Spalte so weit runter, dass man bis zum Kartenpool scrollen
// musste. Seit Sept. 2026 kein eigener Kasten mehr, sondern eine Kachel im Abschnitt
// "Einstellungen" der gemeinsamen Lobby-Fläche — gleiches Muster wie CardPoolCard.jsx.
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { CrSettings } from '../ui/CrIcons';
import { modeNameFor } from '../modesConfig';

export default function GameSettingsCard({ lobbyData, lang, t, onOpen }) {
  return (
    <button type="button" onClick={onOpen} className="cr-tile-btn px-3.5 py-3">
      <span className="cr-tile-icon w-12 h-12"><CrSettings size={30} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-cr text-white text-base leading-tight">{t.hostPanelTitle}</span>
        <span className="block text-white/55 text-xs truncate mt-0.5">
          {modeNameFor(lobbyData?.mode || 'snake', lang)} · {t.hostPanelHint}
        </span>
      </span>
      <ChevronRight size={18} className="text-white/60 shrink-0" />
    </button>
  );
}
