// Kachel "Lobby-Turnier" im Abschnitt Einstellungen (wie GameSettingsCard/CardPoolCard) und das
// Fenster mit Schalter + Turnier-Einstellungen. Nur für den Host — wer nicht steuert, sieht das
// laufende Turnier im LobbyTournamentPanel.jsx.
//
// Die Optionslisten sind Kopien der Whitelists in Backend/clashRoyale/core/lobbyTournament.js.
import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import Modal from '../ui/Modal';
import Toggle from '../ui/Toggle';
import SettingRow, { SegmentedControl } from '../ui/SettingRow';
import { CrTourneyTrophy, CrBattle, CrSwap, CrCards, CrSocial } from '../ui/CrIcons';
import { ACCENT } from './hostSettingsSchema';
import { ltDict, formatLabel } from './ltourI18n';

const BEST_OF = [1, 3, 5];

function TournamentSettings({ lobbyData, actions, lt }) {
  const ltour = lobbyData?.ltour;
  const solo = (lobbyData?.partyMode || 'solo') === 'solo';
  const s = ltour?.settings || null;
  const editable = !!ltour && ltour.phase === 'setup';
  const accent = ACCENT.amber;
  const set = (patch) => actions.ltourSetSettings({ ...s, ...patch });

  return (
    <div>
      <SettingRow icon={CrTourneyTrophy} label={lt.toggle} note={solo ? lt.toggleNote : lt.soloOnly} inline>
        <Toggle
          checked={!!ltour}
          onChange={(next) => {
            if (!next && ltour && ltour.phase !== 'setup' && !window.confirm(lt.abortConfirm)) return;
            actions.ltourSetEnabled(next);
          }}
          disabled={!solo && !ltour}
          accent={accent.toggle}
          aria-label={lt.toggle}
        />
      </SettingRow>

      {ltour && !editable && <p className="cr-section text-amber-300 text-xs">{lt.lockedRunning}</p>}

      {s && (
        <>
          <SettingRow icon={CrBattle} iconClass={accent.icon} label={lt.format} note={lt.formatNote[s.format]}>
            <SegmentedControl
              disabled={!editable}
              options={[
                { id: 'single', label: lt.formatSingle },
                { id: 'double', label: lt.formatDouble },
                { id: 'roundrobin', label: lt.formatRoundRobin },
              ]}
              value={s.format}
              onChange={(format) => set({ format })}
            />
          </SettingRow>

          {s.format === 'roundrobin' && (
            <SettingRow icon={CrSwap} iconClass={accent.icon} label={lt.rounds}>
              <SegmentedControl
                disabled={!editable}
                options={[{ id: 1, label: lt.roundsOnce }, { id: 2, label: lt.roundsTwice }]}
                value={s.rounds}
                onChange={(rounds) => set({ rounds })}
              />
            </SettingRow>
          )}

          <SettingRow icon={CrCards} iconClass={accent.icon} label={lt.bestOf} note={lt.bestOfNote}>
            <SegmentedControl
              disabled={!editable}
              options={BEST_OF.map(n => ({ id: n, label: `Bo${n}` }))}
              value={s.bestOf}
              onChange={(bestOf) => set({ bestOf })}
            />
          </SettingRow>

          {s.format !== 'roundrobin' && (
            <SettingRow icon={CrTourneyTrophy} iconClass={accent.icon} label={lt.finalsBestOf}>
              <SegmentedControl
                disabled={!editable}
                options={BEST_OF.map(n => ({ id: n, label: `Bo${n}` }))}
                value={s.finalsBestOf}
                onChange={(finalsBestOf) => set({ finalsBestOf })}
              />
            </SettingRow>
          )}

          <SettingRow icon={CrSocial} iconClass={accent.icon} label={lt.draft} note={lt.draftNote[s.draft]}>
            <SegmentedControl
              disabled={!editable}
              options={[
                { id: 'perMatch', label: lt.draftPerMatch },
                { id: 'shared', label: lt.draftShared },
              ]}
              value={s.draft}
              onChange={(draft) => set({ draft })}
            />
          </SettingRow>
        </>
      )}
    </div>
  );
}

export default function LobbyTournamentCard({ lobbyData, actions, lang }) {
  const [open, setOpen] = useState(false);
  const lt = ltDict(lang);
  const ltour = lobbyData?.ltour;
  const summary = ltour ? lt.summary(formatLabel(lt, ltour.settings.format), ltour.settings.bestOf) : lt.off;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="cr-tile-btn px-3.5 py-3">
        <span className="cr-tile-icon w-12 h-12"><CrTourneyTrophy size={30} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-cr text-white text-base leading-tight">{lt.title}</span>
          <span className={`block text-xs truncate mt-0.5 ${ltour ? 'text-[var(--cr-arcade-gold)]' : 'text-white/55'}`}>{summary}</span>
        </span>
        <ChevronRight size={18} className="text-white/60 shrink-0" />
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} title={lt.title} icon={<CrTourneyTrophy size={24} />} size="md">
          <TournamentSettings lobbyData={lobbyData} actions={actions} lt={lt} />
        </Modal>
      )}
    </>
  );
}
