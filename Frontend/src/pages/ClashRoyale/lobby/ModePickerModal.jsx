// Modus-Wähler der Lobby: ein Raster aller Modi statt einer Dropdown-Liste.
//
// WARUM: Die Dropdown-Liste (vorher direkt in LobbyControls.jsx) wuchs mit jedem neuen
// Modus um eine weitere Zeile — bei acht, neun Modi war sie schon ein langes Scrollfeld.
// Das Raster hier ist dasselbe Muster wie die Modus-Übersicht im Hauptmenü (hub/HubScreen.jsx):
// alle Modi auf einen Blick, ein Klick wählt statt zu scrollen. Anders als dort öffnet ein
// Klick hier aber keine Anleitung, sondern setzt direkt den Lobby-Modus — deshalb dieselbe
// ModeCard-Kachel mit `hideHint` (keine irreführende "Anleitung"-Beschriftung) und `selected`
// (violetter Rahmen + Abzeichen für den aktuell gewählten Modus).

import React from 'react';
import { Sword, User, Users, Check } from 'lucide-react';
import Modal from '../ui/Modal';
import ModeCard from '../hub/ModeCard';
import { MODES, modeNameFor, modeDescFor } from '../modesConfig';

/**
 * Große, eindeutige Solo/Duo-Kachel statt eines kleinen Text-Pills — das ist die
 * folgenreichste Entscheidung in diesem Dialog (sie filtert das ganze Raster darunter neu),
 * soll also nicht wie eine Nebeneinstellung aussehen. Icon + Titel + Kurzbeschreibung,
 * aktiver Zustand über Fläche + Rahmenfarbe (kein Rahmen-Glow, kein Scale-Hover).
 */
function PartyModeButton({ active, icon: Icon, label, desc, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`flex-1 flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-colors ${
        active
          ? 'bg-violet-500/15 border-violet-400'
          : 'bg-black/30 border-white/10 hover:border-white/25'
      }`}>
      <span className={`shrink-0 w-11 h-11 rounded-lg flex items-center justify-center ${
        active ? 'bg-violet-500 text-white' : 'bg-white/5 text-white/35'
      }`}>
        <Icon size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-1.5 font-bold text-base leading-tight ${active ? 'text-white' : 'text-white/60'}`}>
          {label}
          {active && <Check size={15} className="text-violet-300 shrink-0" />}
        </span>
        <span className={`block text-xs leading-snug mt-0.5 ${active ? 'text-white/60' : 'text-white/30'}`}>{desc}</span>
      </span>
    </button>
  );
}

export default function ModePickerModal({
  mode, lang, t, onSelect, onClose,
  partyMode = 'solo', onSetPartyMode,
}) {
  return (
    <Modal title={t.selectMode} icon={<Sword size={16} />} onClose={onClose} size="lg">
      {/* Solo/Duo schaltet um, welche Modi unten überhaupt zur Wahl stehen — Duo-Modi
          (2v2) brauchen ein Team-Konzept, das die übrigen Modi nicht kennen. Dieses Modal
          öffnet ohnehin nur der Host/Admin (siehe ModeStartBand.jsx), also keine
          zusätzliche Berechtigungsprüfung hier nötig. */}
      <div className="flex gap-2.5 mb-5">
        <PartyModeButton active={partyMode === 'solo'} icon={User}
          label={t.partyModeSolo} desc={t.partyModeSoloDesc}
          onClick={() => onSetPartyMode('solo')} />
        <PartyModeButton active={partyMode === 'duo'} icon={Users}
          label={t.partyModeDuo} desc={t.partyModeDuoDesc}
          onClick={() => onSetPartyMode('duo')} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {MODES.filter(m => m.available && (m.partyModes || ['solo']).includes(partyMode)).map(m => (
          <ModeCard
            key={m.id}
            mode={m}
            name={modeNameFor(m.id, lang)}
            description={modeDescFor(m.id, lang)}
            openLabel={t.selectModeLabel(modeNameFor(m.id, lang))}
            selected={m.id === mode}
            selectedLabel={t.activeMode}
            newLabel={t.newMode}
            hideHint
            onOpen={() => onSelect(m.id)}
          />
        ))}
      </div>
    </Modal>
  );
}
