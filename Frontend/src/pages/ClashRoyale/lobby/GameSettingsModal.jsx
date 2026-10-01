// Fenster mit den Modusreglern (HostSettings.jsx) — geöffnet über GameSettingsCard.jsx.
// War in Phase 5 kurz dauerhaft in die linke Spalte eingebettet; bei Modi mit vielen
// Einstellungen zwang das zu langem Scrollen bis zum Kartenpool darunter, deshalb wieder
// ein eigenes Fenster (derselbe Modal-Rahmen wie Kartenpool/Verlauf/Account, jetzt
// blickdicht statt halbtransparent — siehe .cr-arcade-panel in index.css).
import React from 'react';
import { CrSettings } from '../ui/CrIcons';
import Modal from '../ui/Modal';
import HostSettings from './HostSettings';
import { modeNameFor, modeInfo } from '../modesConfig';

export default function GameSettingsModal({
  onClose,
  lobbyData, actions, t, lang,
  isClashAdmin, effectiveIsHost,
  poolSize, activeCount, carouselMaxPlayers, carouselTooMany,
}) {
  const mode = lobbyData?.mode || 'snake';
  const ModeIcon = modeInfo(mode).icon;

  return (
    <Modal
      onClose={onClose}
      title={t.hostPanelTitle}
      icon={<CrSettings size={24} />}
      size="md">
      {/* Eine Fläche, darin Abschnitte: oben für welchen Modus, darunter Presets und je
          Einstellung ein eigener Abschnitt (HostSettings.jsx / ui/SettingRow.jsx). */}
      <div>
        <div className="cr-section flex items-center gap-3 !py-3.5 bg-[rgba(6,16,32,0.35)]">
          <span className="cr-tile-icon w-11 h-11"><ModeIcon size={30} /></span>
          <span className="min-w-0">
            <span className="cr-eyebrow block">{t.gameMode}</span>
            <span className="block font-cr text-white text-lg leading-tight truncate">{modeNameFor(mode, lang)}</span>
          </span>
        </div>
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
