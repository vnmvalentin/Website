// Oberster Abschnitt der Lobby-Fläche: Spielmodus (Klick öffnet den Modus-Umschalter), der
// große Start-Knopf und — genauso auffällig daneben — der Spielverlauf. Bewusst über der
// ganzen Breite und ÜBER den beiden Spalten (Einstellungen links, Spieler rechts): das ist
// die eine Aktion, für die man nicht erst scrollen soll.
//
// Sept. 2026: Statt des Coverbilds mit kleinem "Bearbeiten"-Etikett ist der Modus jetzt ein
// großer Kachel-Knopf mit Modus-Symbol und einem deutlichen "Modus ändern" — auf dem Bild
// war nicht zu erkennen, dass man dort klicken muss, um den Modus zu wechseln.
import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import ChunkyButton from '../ui/ChunkyButton';
import ModePickerModal from './ModePickerModal';
import { CrBattle, CrTrophy, CrShield, CrRandom } from '../ui/CrIcons';
import { modeNameFor, modeDescFor, modeInfo } from '../modesConfig';
import { randomPoolFor } from './poolRequirements';
import { ltDict } from './ltourI18n';

export default function ModeStartBand({
  lobbyData, actions, t, lang,
  canControlLobby, isClashAdmin, effectiveIsHost,
  onStart, onShowHistory, onShowTournament,
  canStart, poolSize, requiredPool, poolTooSmall, carouselMaxPlayers, carouselTooMany, teamsNotReady, randomPoolEmpty,
}) {
  const [modePickerOpen, setModePickerOpen] = useState(false);

  const mode = lobbyData?.mode || 'snake';
  // Zufallsmodus: Kachel zeigt den Zufall statt des (zuletzt gespielten) internen Modus
  const random = !!lobbyData?.randomEnabled;
  const CurrentIcon = random ? CrRandom : modeInfo(mode).icon;
  const historyCount = lobbyData?.historyCount || 0;
  // Lobby-Turnier: vor dem Start heißt der Knopf "Turnier starten"; läuft es, wird über den
  // Turnierbaum gestartet (LobbyTournamentPanel.jsx) und der Knopf springt nur dorthin
  const ltour = lobbyData?.ltour || null;
  const lt = ltDict(lang);
  const tourRunning = !!ltour && ltour.phase !== 'setup';

  const blockedReason = randomPoolEmpty
    ? t.startBlockedRandom
    : carouselTooMany
    ? t.startBlockedCarousel(carouselMaxPlayers, lobbyData?.carouselCardsPerTable || 8)
    : poolTooSmall
      ? t.startBlockedPool(poolSize, requiredPool)
      : teamsNotReady
        ? t.startBlockedTeams
        : t.startBlockedPlayers;

  const tileContent = (
    <>
      <span className="cr-tile-icon w-16 h-16 sm:w-[76px] sm:h-[76px]">
        <CurrentIcon size={50} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="cr-eyebrow block">{t.gameMode}</span>
        <span className="block font-cr text-2xl sm:text-[28px] text-white leading-tight truncate"
          style={{ textShadow: '0 2px 0 rgba(2,8,20,0.6)' }}>
          {random ? t.randomMode : modeNameFor(mode, lang)}
        </span>
      </span>
      {/* Deutlich als Aktion erkennbar: goldenes Etikett mit Pfeil, auf dem Handy nur der Pfeil */}
      {canControlLobby && (
        <span className="shrink-0 flex items-center gap-1 rounded-lg bg-[var(--cr-arcade-gold)] text-[#4a2e00] font-cr text-[15px] pl-3 pr-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_3px_0_#b07a08]">
          <span className="hidden sm:inline">{t.changeMode}</span>
          <ChevronRight size={18} strokeWidth={3} />
        </span>
      )}
    </>
  );

  return (
    <div className="cr-section">
      {isClashAdmin && !effectiveIsHost && (
        <p className="text-violet-300 text-xs flex items-center gap-1.5 mb-3">
          <CrShield size={16} /> {t.adminAccessNote}
        </p>
      )}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
          {canControlLobby ? (
            <button type="button" onClick={() => setModePickerOpen(true)} aria-label={t.changeMode}
              className="cr-tile-btn p-3 sm:p-4">
              {tileContent}
            </button>
          ) : (
            <div className="cr-tile-btn cr-tile-btn--static p-3 sm:p-4">{tileContent}</div>
          )}
          <p className="text-white/55 text-xs leading-relaxed px-1">
            {random ? t.randomModeDesc(randomPoolFor(lobbyData).length) : modeDescFor(mode, lang)}
          </p>
        </div>

        <div className="flex md:flex-col gap-3 md:w-64 shrink-0">
          {tourRunning ? (
            <ChunkyButton variant="gold" size="lg" block icon={CrTrophy} iconSize={30} className="md:flex-1"
              onClick={onShowTournament}>
              {lt.toBracket}
            </ChunkyButton>
          ) : canControlLobby ? (
            <ChunkyButton variant="green" size="lg" block icon={CrBattle} iconSize={30} onClick={onStart} disabled={!canStart}
              // Startklar: Glanzstreifen zieht über den Knopf
              className={`md:flex-1 ${canStart ? 'cr-shine' : ''}`}>
              {!canStart ? blockedReason : ltour ? lt.startTournament : t.startGame}
            </ChunkyButton>
          ) : lobbyData?.tournament ? null : (
            <p className="flex-1 self-center text-white/45 text-sm text-center">{t.waitingForHost}</p>
          )}
          {historyCount > 0 && (
            <ChunkyButton variant="gold" size="md" icon={CrTrophy} iconSize={24} block onClick={onShowHistory}>
              {t.history}
            </ChunkyButton>
          )}
        </div>
      </div>

      {modePickerOpen && (
        <ModePickerModal
          mode={mode}
          random={random}
          lang={lang}
          t={t}
          partyMode={lobbyData?.partyMode || 'solo'}
          onSetPartyMode={actions.setPartyMode}
          onSelectRandom={() => {
            setModePickerOpen(false);
            if (!random) actions.setRandomMode(true);
          }}
          onClose={() => setModePickerOpen(false)}
          onSelect={(id) => {
            setModePickerOpen(false);
            // Auch derselbe Modus muss gesendet werden, wenn gerade der Zufall aktiv ist — der
            // Server schaltet ihn mit clash:setMode ab
            if (id !== mode || random) actions.setMode(id);
          }}
        />
      )}
    </div>
  );
}
