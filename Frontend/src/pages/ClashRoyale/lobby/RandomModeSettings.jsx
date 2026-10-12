// Einstellungen des Zufallsmodus — statt der Regler eines einzelnen Modus (HostSettings.jsx),
// denn welcher Modus gespielt wird, steht erst nach der Auslosung fest. Gespielt wird dann mit
// dessen Preset "Vorgeschlagen" (siehe Backend/clashRoyale/core/randomMode.js).
//
// Der Pool auf dem Server enthält Solo- UND Duo-Modi; gezeigt und umgeschaltet werden nur die
// des aktuellen Party-Modus. Die übrigen bleiben beim Speichern unangetastet, damit ein
// Wechsel zwischen Solo und Duo die Auswahl der anderen Seite nicht löscht.
import React from 'react';
import { CrBattle, CrCheck, CrShield, CrRandom } from '../ui/CrIcons';
import Toggle from '../ui/Toggle';
import SettingRow from '../ui/SettingRow';
import { MODES, modeNameFor } from '../modesConfig';

export default function RandomModeSettings({ lobbyData, actions, t, lang, isClashAdmin, effectiveIsHost }) {
  const party = lobbyData?.partyMode || 'solo';
  const selected = lobbyData?.randomModes || [];
  const visible = MODES.filter(m => m.available && (m.partyModes || ['solo']).includes(party));
  const visibleIds = new Set(visible.map(m => m.id));
  const others = selected.filter(id => !visibleIds.has(id));

  const save = (ids) => actions.setRandomModes([...others, ...ids]);
  const toggle = (id) => save(
    visible.map(m => m.id).filter(x => (x === id ? !selected.includes(x) : selected.includes(x)))
  );

  return (
    <div>
      {isClashAdmin && !effectiveIsHost && (
        <p className="cr-section text-violet-300 text-xs flex items-center gap-1.5">
          <CrShield size={16} /> {t.adminAccessNote}
        </p>
      )}

      <SettingRow icon={CrBattle} label={t.randomPoolTitle} note={t.randomPoolNote}>
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => save(visible.map(m => m.id))}
            className="cr-tile-btn !w-auto px-3 py-1.5 font-cr text-sm text-white">{t.randomAll}</button>
          <button type="button" onClick={() => save([])}
            className="cr-tile-btn !w-auto px-3 py-1.5 font-cr text-sm text-white">{t.randomNone}</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visible.map(m => {
            const on = selected.includes(m.id);
            const Icon = m.icon;
            return (
              <button key={m.id} type="button" onClick={() => toggle(m.id)} aria-pressed={on}
                className="cr-tile-btn px-3 py-2">
                <span className="cr-tile-icon w-9 h-9"><Icon size={24} /></span>
                <span className="min-w-0 flex-1 font-cr text-white text-sm leading-tight truncate">
                  {modeNameFor(m.id, lang)}
                </span>
                {on && <CrCheck size={18} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      </SettingRow>

      <SettingRow icon={CrRandom} label={t.randomNoRepeat} note={t.randomNoRepeatNote} inline>
        <Toggle
          checked={lobbyData?.randomNoRepeat !== false}
          onChange={actions.setRandomNoRepeat}
          aria-label={t.randomNoRepeat}
        />
      </SettingRow>
    </div>
  );
}
