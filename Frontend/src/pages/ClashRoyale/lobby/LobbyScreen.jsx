// Lobby: Warteraum vor dem Spiel.
//
// Seit die Regler im Host-Panel liegen (HostPanel.jsx), ist die Lobby selbst kurz: Code
// zum Teilen, Spielerliste, eine Karte mit dem, was gespielt wird — und für den Host der
// Zugang zu den Einstellungen plus Start. Vorher füllte die Einstellungsspalte zwei
// Bildschirme und schob die Spielerliste auf dem Handy nach ganz unten.

import React, { useEffect, useState } from 'react';
import { Trophy, LogOut } from 'lucide-react';
import SEO from '../../../components/SEO';
import LanguageSelect from '../components/LanguageSelect';
import LobbyCodeCard from './LobbyCodeCard';
import PlayerList from './PlayerList';
import LobbyControls from './LobbyControls';
import HostPanel from './HostPanel';
import LobbyHistory from './LobbyHistory';
import HistoryModal from './HistoryModal';
import CrAccountModal from './CrAccountModal';
import CardExclusionModal from '../modals/CardExclusionModal';
import { lobbyReadiness } from './poolRequirements';
import { modeNameFor } from '../modesConfig';
import { ALL_CARDS } from '../data/cards';

export default function LobbyScreen({
  lobbyData, historyData, myId, actions,
  canControlLobby, effectiveIsHost, isClashAdmin,
  t, lang, changeLang, error,
  onLeave, onRequestHistory, onTransferHost,
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
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
    <div className="h-full overflow-y-auto custom-scrollbar">
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
          onClose={() => setExcludeOpen(false)}
          lang={lang}
        />
      )}

      {historyOpen && (
        <HistoryModal historyData={historyData} onClose={() => setHistoryOpen(false)} t={t} lang={lang} />
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
        />
      )}

      {canControlLobby && (
        <HostPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          lobbyData={lobbyData}
          actions={actions}
          t={t}
          lang={lang}
          isClashAdmin={isClashAdmin}
          effectiveIsHost={effectiveIsHost}
          poolSize={poolSize}
          activeCount={activePlayers.length}
          carouselMaxPlayers={readiness.carouselMaxPlayers}
          carouselTooMany={readiness.carouselTooMany}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-1 truncate">
              {lobbyData?.mode ? modeNameFor(lobbyData.mode, lang) : 'Lobby'}
            </p>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-white">{t.waitingForPlayers}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSelect lang={lang} onChange={changeLang} />
            {lobbyData?.historyCount > 0 && (
              <button onClick={openHistory} title={t.history}
                className="p-2 border border-white/10 rounded-lg hover:border-amber-500/40 hover:text-amber-400 transition-colors text-white/40 flex items-center gap-1.5 text-xs font-semibold px-3">
                <Trophy size={13} />
                <span className="hidden sm:inline">{t.history}</span>
              </button>
            )}
            <button onClick={onLeave} aria-label={t.leaveLobbyBtn} title={t.leaveLobbyBtn}
              className="p-2 border border-white/10 rounded-lg hover:border-white/30 transition-colors text-white/40 hover:text-white">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Zwei gleich breite Spalten: links Teilen und Mitspieler, rechts was gespielt
            wird. Unter lg stapelt sich das — die Modus-Karte mit dem Start-Knopf steht
            dann direkt unter der Spielerliste, ohne Reglerwüste dazwischen. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-6">
            <LobbyCodeCard
              code={lobbyData?.code}
              link={lobbyLink}
              t={t}
              locked={lobbyData?.locked}
              canControlLobby={canControlLobby}
              onToggleLock={actions.setLobbyLocked}
            />
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
            />
          </div>

          <div className="space-y-6">
            <LobbyControls
              lobbyData={lobbyData}
              actions={actions}
              t={t}
              lang={lang}
              canControlLobby={canControlLobby}
              isClashAdmin={isClashAdmin}
              effectiveIsHost={effectiveIsHost}
              poolSize={poolSize}
              excludedCount={excludedCards.length}
              onOpenPanel={() => setPanelOpen(true)}
              onOpenCardPool={() => setExcludeOpen(true)}
              onStart={actions.startGame}
              {...readiness}
            />
            <LobbyHistory
              historyData={historyData}
              t={t}
              lang={lang}
              onShowAll={openHistory}
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      </div>
    </div>
  );
}
