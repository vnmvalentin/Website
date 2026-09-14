// Fenster mit den Modusreglern (HostSettings.jsx) — geöffnet über GameSettingsCard.jsx.
// War in Phase 5 kurz dauerhaft in die linke Spalte eingebettet; bei Modi mit vielen
// Einstellungen zwang das zu langem Scrollen bis zum Kartenpool darunter, deshalb wieder
// ein eigenes Fenster (derselbe Modal-Rahmen wie Kartenpool/Verlauf/Account, jetzt
// blickdicht statt halbtransparent — siehe .cr-arcade-panel in index.css).
import React from 'react';
import { Sliders } from 'lucide-react';
import Modal from '../ui/Modal';
import HostSettings from './HostSettings';
import { modeNameFor } from '../modesConfig';

export default function GameSettingsModal({
  onClose,
  lobbyData, actions, t, lang,
  isClashAdmin, effectiveIsHost,
  poolSize, activeCount, carouselMaxPlayers, carouselTooMany,
}) {
  const mode = lobbyData?.mode || 'snake';

  return (
    <Modal
      onClose={onClose}
      title={t.hostPanelTitle}
      icon={<Sliders size={15} className="text-violet-400 shrink-0" />}
      size="md">
      <div className="px-5 py-5 space-y-5">
        <p className="text-white/40 text-xs uppercase tracking-wider">{modeNameFor(mode, lang)}</p>
        <HostSettings
          lobbyData={lobbyData}
          actions={actions}
          t={t}
          lang={lang}
          isClashAdmin={isClashAdmin}
          effectiveIsHost={effectiveIsHost}
          poolSize={poolSize}
          activeCount={activeCount}
          carouselMaxPlayers={carouselMaxPlayers}
          carouselTooMany={carouselTooMany}
        />
      </div>
    </Modal>
  );
}
