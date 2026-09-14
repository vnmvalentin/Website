// Lobby: Warteraum vor dem Spiel.
//
// Neu gegliedert (Ausbaustufe "Einstellungsmenü umbauen"): oben quer über die volle Breite
// das Band mit Spielmodus + Start + Spielverlauf — die eine Stelle, die man ohne Scrollen
// erreichen soll. Darunter zwei Spalten: links alles zum EINSTELLEN (Lobby-Code/Sperre,
// Spieleinstellungen, Kartenpool), rechts alles zu den MITSPIELERN (Liste, Tracking).
// Spieleinstellungen sind wieder ein eigenes Fenster (GameSettingsModal.jsx) statt dauerhaft
// eingeblendeter Regler — bei Modi mit vielen Einstellungen zwang das dauerhafte Einblenden
// zu langem Scrollen bis zum Kartenpool darunter. GameSettingsCard zeigt nur noch die
// Zusammenfassung + den Öffnen-Knopf, exakt wie CardPoolCard das für den Kartenpool tut.
import React, { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import SEO from '../../../components/SEO';
import LanguageSelect from '../components/LanguageSelect';
import LobbyCodeCard from './LobbyCodeCard';
import GameSettingsCard from './GameSettingsCard';
import GameSettingsModal from './GameSettingsModal';
import CardPoolCard from './CardPoolCard';
import PlayerList from './PlayerList';
import TrackingCard from './TrackingCard';
import ModeStartBand from './ModeStartBand';
import HistoryModal from './HistoryModal';
import CrAccountModal from './CrAccountModal';
import CardExclusionModal from '../modals/CardExclusionModal';
import { lobbyReadiness } from './poolRequirements';
import { ALL_CARDS } from '../data/cards';

export default function LobbyScreen({
  lobbyData, historyData, myId, actions,
  canControlLobby, effectiveIsHost, isClashAdmin,
  t, lang, changeLang, error,
  onLeave, onRequestHistory, onTransferHost,
  profile, switchActiveCr,
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Für welchen Spieler ist der Account-Dialog offen (null = zu)
  const [crTarget, setCrTarget] = useState(null);

  // Admin-Beobachter zählen nicht als Spieler
  const realPlayers = (lobbyData?.players || []).filter(p => !p.isAdmin);
  const activePlayers = realPlayers.filter(p => !p.isSpectator);
  const excludedCards = lobbyData?.excludedCards || [];
  const poolSize = ALL_CARDS.length - excludedCards.length;

  const readiness = lobbyReadiness(lobbyData, activePlayers.length, poolSize, canControlLobby);

  const lobbyLink = lobbyData
    ? `${window.location.origin}/clash-royale?code=${lobbyData.code}`
    : '';

  const openHistory = () => { onRequestHistory(); setHistoryOpen(true); };

  // Der Verlauf steht jetzt direkt in der Lobby, muss also ohne Klick da sein. Der Server
  // schickt in lobbyUpdate nur die ANZAHL mit (historyCount) — die Decks kommen erst auf
  // Anfrage, weil sie bei acht Runden × acht Spielern spürbar Daten sind. Deshalb hier
  // nachladen, sobald sich die Anzahl ändert (also nach jedem beendeten Spiel).
  const historyCount = lobbyData?.historyCount || 0;
  useEffect(() => {
    if (historyCount > 0) onRequestHistory();
  }, [historyCount, onRequestHistory]);

  const setExcluded = (cardIds) => actions.setExcludedCards(cardIds);
  const toggleExcluded = (cardId) => setExcluded(
    excludedCards.includes(cardId)
      ? excludedCards.filter(id => id !== cardId)
      : [...excludedCards, cardId]
  );

  return (
    <div className="cr-arcade-bg h-full overflow-y-auto custom-scrollbar">
      {/* Lobby-/Spielansicht liegt auf derselben URL wie der Hub, hat aber keinen
          eigenständigen Inhalt für die Suche — noindex, damit Google die Hubseite indexiert */}
      <SEO title="Lobby · Clash Royale" description={t.lobbySeoDesc} path="/clash-royale" lang={lang} noindex />

      {excludeOpen && (
        <CardExclusionModal
          excluded={excludedCards}
          canEdit={canControlLobby}
          onToggle={toggleExcluded}
          onReset={() => setExcluded([])}
          onSetExcluded={setExcluded}
          onTrimToUnlocked={actions.trimPoolToUnlocked}
          onClose={() => setExcludeOpen(false)}
          lang={lang}
        />
      )}

      {historyOpen && (
        <HistoryModal historyData={historyData} onClose={() => setHistoryOpen(false)} t={t} lang={lang} />
      )}

      {settingsOpen && (
        <GameSettingsModal
          onClose={() => setSettingsOpen(false)}
          lobbyData={lobbyData}
          actions={actions}
          t={t} lang={lang}
          isClashAdmin={isClashAdmin}
          effectiveIsHost={effectiveIsHost}
          poolSize={poolSize}
          activeCount={activePlayers.length}
          carouselMaxPlayers={readiness.carouselMaxPlayers}
          carouselTooMany={readiness.carouselTooMany}
        />
      )}

      {crTarget && (
        <CrAccountModal
          // Immer den frischen Spieler aus lobbyData nehmen: der Dialog bleibt offen,
          // während der Server den Zustand aktualisiert (z.B. nach dem Verknüpfen).
          player={(lobbyData?.players || []).find(p => p.id === crTarget) || { id: crTarget, name: '?' }}
          isSelf={crTarget === myId}
          onLink={(tag) => actions.linkCrAccount(crTarget, tag)}
          onUnlink={() => actions.unlinkCrAccount(crTarget)}
          onClose={() => setCrTarget(null)}
          t={t}
          // Gespeicherte Accounts zum Auswählen gibt's nur für den eigenen Spieler — beim
          // Verknüpfen für jemand anderen (Host/Admin) bleibt es bei der manuellen Eingabe.
          savedAccounts={crTarget === myId ? (profile?.crAccounts || []) : []}
          onPickSaved={(tag) => switchActiveCr?.(tag)}
        />
      )}

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-5">

        <div className="flex items-start justify-between gap-3">
          <h1 className="font-arcade text-white text-xl sm:text-2xl">{t.waitingForPlayers}</h1>
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSelect lang={lang} onChange={changeLang} />
            <button onClick={onLeave} aria-label={t.leaveLobbyBtn} title={t.leaveLobbyBtn}
              className="cr-arcade-icon-btn cr-arcade-icon-btn--red w-11 h-11">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* ── Band: Modus + Start + Verlauf — volle Breite, über den Spalten ────────── */}
        <ModeStartBand
          lobbyData={lobbyData}
          actions={actions}
          t={t} lang={lang}
          canControlLobby={canControlLobby}
          isClashAdmin={isClashAdmin}
          effectiveIsHost={effectiveIsHost}
          onStart={actions.startGame}
          onShowHistory={openHistory}
          poolSize={poolSize}
          {...readiness}
        />

        {/* ── Zwei Spalten: links Einstellungen, rechts Mitspieler ─────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-6">
            <LobbyCodeCard
              code={lobbyData?.code}
              link={lobbyLink}
              t={t}
              locked={lobbyData?.locked}
              canControlLobby={canControlLobby}
              onToggleLock={actions.setLobbyLocked}
              isPublic={lobbyData?.isPublic}
              onTogglePublic={actions.setLobbyPublic}
            />
            {canControlLobby && (
              <GameSettingsCard
                lobbyData={lobbyData}
                lang={lang} t={t}
                onOpen={() => setSettingsOpen(true)}
              />
            )}
            <CardPoolCard
              excludedCount={excludedCards.length}
              poolSize={poolSize}
              canControlLobby={canControlLobby}
              onOpen={() => setExcludeOpen(true)}
              t={t}
            />
          </div>

          <div className="space-y-6">
            <PlayerList
              lobbyData={lobbyData}
              myId={myId}
              canControlLobby={canControlLobby}
              t={t}
              activeCount={activePlayers.length}
              spectatorCount={realPlayers.length - activePlayers.length}
              onToggleOwnSpectator={actions.toggleSpectator}
              onSetPlayerSpectator={actions.setPlayerSpectator}
              onTransferHost={onTransferHost}
              onKick={actions.kickPlayer}
              onOpenCrAccount={(p) => setCrTarget(p.id)}
              onSwitchTeam={actions.switchTeam}
              onAddBot={actions.addBot}
            />
            {canControlLobby && <TrackingCard lobbyData={lobbyData} actions={actions} t={t} />}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      </div>
    </div>
  );
}
