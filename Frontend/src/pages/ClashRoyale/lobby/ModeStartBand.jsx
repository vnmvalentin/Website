// Mittleres Band der Lobby: Spielmodus mit Coverbild (Klick öffnet den Modus-Umschalter),
// der große Start-Knopf und — genauso auffällig daneben — der Spielverlauf. Bewusst über
// der ganzen Breite und ÜBER den beiden Spalten (Einstellungen links, Spielerliste rechts):
// das ist die eine Aktion, für die man nicht erst scrollen soll, egal wie weit man in den
// Einstellungen war.
import React, { useState } from 'react';
import { ChevronDown, Shield } from 'lucide-react';
import ChunkyButton from '../ui/ChunkyButton';
import ModePickerModal from './ModePickerModal';
import { modeNameFor, modeDescFor, modeInfo, modeCover } from '../modesConfig';
import battleIcon from '../../../assets/clashRoyale/ui/battle.png';
import trophyIcon from '../../../assets/clashRoyale/ui/trophy.png';

export default function ModeStartBand({
  lobbyData, actions, t, lang,
  canControlLobby, isClashAdmin, effectiveIsHost,
  onStart, onShowHistory,
  canStart, poolSize, requiredPool, poolTooSmall, carouselMaxPlayers, carouselTooMany, teamsNotReady,
}) {
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [hasImage, setHasImage] = useState(true);

  const mode = lobbyData?.mode || 'snake';
  const current = modeInfo(mode);
  const CurrentIcon = current.icon;
  const historyCount = lobbyData?.historyCount || 0;

  const blockedReason = carouselTooMany
    ? t.startBlockedCarousel(carouselMaxPlayers, lobbyData?.carouselCardsPerTable || 8)
    : poolTooSmall
      ? t.startBlockedPool(poolSize, requiredPool)
      : teamsNotReady
        ? t.startBlockedTeams
        : t.startBlockedPlayers;

  const cover = (
    <div className="relative w-full sm:w-48 aspect-[16/10] sm:aspect-square shrink-0 rounded-xl overflow-hidden bg-violet-500/10 border border-violet-400/20">
      {hasImage ? (
        <img src={modeCover(mode)} alt="" onError={() => setHasImage(false)}
          className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <CurrentIcon size={36} className="text-violet-300" />
        </div>
      )}
      {canControlLobby && (
        <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 bg-black/70 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md">
          {t.edit} <ChevronDown size={10} className="-rotate-90" />
        </span>
      )}
    </div>
  );

  return (
    <div className="cr-arcade-panel p-5 md:p-6">
      {isClashAdmin && !effectiveIsHost && (
        <p className="text-violet-400 text-xs flex items-center gap-1.5 mb-3">
          <Shield size={12} /> {t.adminAccessNote}
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-5">
        {canControlLobby ? (
          <button onClick={() => setModePickerOpen(true)} className="text-left shrink-0">{cover}</button>
        ) : cover}

        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          <p className="text-white/40 text-xs uppercase tracking-wider">{t.gameMode}</p>
          <p className="text-white font-bold text-lg flex items-center gap-2">{modeNameFor(mode, lang)}</p>
          <p className="text-white/40 text-xs leading-relaxed">{modeDescFor(mode, lang)}</p>
        </div>

        <div className="flex sm:flex-col gap-2.5 sm:w-56 shrink-0">
          {canControlLobby ? (
            <ChunkyButton variant="green" size="lg" block iconSrc={battleIcon} onClick={onStart} disabled={!canStart}>
              {canStart ? t.startGame : blockedReason}
            </ChunkyButton>
          ) : (
            <p className="flex-1 self-center text-white/30 text-sm text-center">{t.waitingForHost}</p>
          )}
          {historyCount > 0 && (
            <ChunkyButton variant="gold" size="md" iconSrc={trophyIcon} block onClick={onShowHistory}>
              {t.history}
            </ChunkyButton>
          )}
        </div>
      </div>

      {modePickerOpen && (
        <ModePickerModal
          mode={mode}
          lang={lang}
          t={t}
          partyMode={lobbyData?.partyMode || 'solo'}
          onSetPartyMode={actions.setPartyMode}
          onClose={() => setModePickerOpen(false)}
          onSelect={(id) => {
            setModePickerOpen(false);
            if (id !== mode) actions.setMode(id);
          }}
        />
      )}
    </div>
  );
}
