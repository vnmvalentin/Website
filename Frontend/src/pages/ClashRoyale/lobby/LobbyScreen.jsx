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
import Section from '../ui/Section';
import { CrBattle, CrSettings, CrLock, CrSocial, CrTourneyTrophy } from '../ui/CrIcons';
import { useCrPrefs } from '../ui/crPrefs';
import EmoteLayer from '../ui/EmoteLayer';
import SEO from '../../../components/SEO';
import LanguageSelect from '../components/LanguageSelect';
import LobbyCodeCard from './LobbyCodeCard';
import GameSettingsCard from './GameSettingsCard';
import LobbyTournamentCard from './LobbyTournamentCard';
import LobbyTournamentPanel from './LobbyTournamentPanel';
import ViewTabs from './ViewTabs';
import { ltDict, tournamentRunning } from './ltourI18n';
import GameSettingsModal from './GameSettingsModal';
import CardPoolCard from './CardPoolCard';
import PlayerList from './PlayerList';
import TrackingCard from './TrackingCard';
import ModeStartBand from './ModeStartBand';
import { TournamentLobbyBanner } from '../tournament/TournamentLobbyBits';
import HistoryModal from './HistoryModal';
import RandomModeShow from './RandomModeShow';
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
  emotes = [],
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Für welchen Spieler ist der Account-Dialog offen (null = zu)
  const [crTarget, setCrTarget] = useState(null);
  // Läuft ein Lobby-Turnier, gibt es die Reiter Lobby | Turnier. Beim Start (und nach jedem
  // Begegnungs-Draft, wenn man in die Lobby zurückkommt) steht man direkt im Turnier.
  const tourRunning = tournamentRunning(lobbyData);
  const [tab, setTab] = useState(tourRunning ? 'tournament' : 'lobby');
  const tourPhase = lobbyData?.ltour?.phase || null;
  useEffect(() => {
    if (tourPhase === 'drawn' || tourPhase === 'running' || tourPhase === 'draft') setTab('tournament');
    if (!tourPhase || tourPhase === 'setup') setTab('lobby');
  }, [tourPhase]);
  const lt = ltDict(lang);
  const { openSettings } = useCrPrefs();

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

      {/* Zufallsmodus: Walze + Modus-Einblendung bis zum Spielstart (key = eine Auslosung) */}
      {lobbyData?.randomSpin && (
        <RandomModeShow key={lobbyData.randomSpin.id} spin={lobbyData.randomSpin} lang={lang} t={t} />
      )}

      <EmoteLayer emotes={emotes} players={lobbyData?.players || []} onSend={actions.sendEmote} lang={lang} />

      <div className="cr-anim-rise max-w-6xl mx-auto px-3 md:px-6 py-4 md:py-6 space-y-4">

        <div className="flex items-center justify-between gap-3">
          <h1 className="cr-arcade-title text-xl sm:text-3xl flex items-center gap-2 sm:gap-3 min-w-0">
            <CrBattle size={32} className="shrink-0" />
            {t.waitingForPlayers}
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSelect lang={lang} onChange={changeLang} />
            <button onClick={openSettings} aria-label={t.settingsSection} title={t.settingsSection}
              className="cr-arcade-icon-btn w-11 h-11">
              <CrSettings size={24} />
            </button>
            <button onClick={onLeave} aria-label={t.leaveLobbyBtn} title={t.leaveLobbyBtn}
              className="cr-arcade-icon-btn cr-arcade-icon-btn--red w-11 h-11">
              <LogOut size={17} />
            </button>
          </div>
        </div>

        {/* EINE gemeinsame Fläche statt sechs einzelner Kästen: oben quer der Modus mit
            Start/Verlauf, darunter zwei Spalten — links alles zum EINSTELLEN, rechts alles zu
            den MITSPIELERN. Abschnitte trennt eine eingeprägte Fuge (ui/Section.jsx). */}
        {lobbyData?.tournament && <TournamentLobbyBanner tournament={lobbyData.tournament} players={lobbyData.players} lang={lang} />}

        {tourRunning && (
          <ViewTabs active={tab} onSelect={setTab} tabs={[
            { id: 'lobby', icon: CrBattle, label: lt.tabLobby },
            { id: 'tournament', icon: CrTourneyTrophy, label: lt.tabTournament },
          ]} />
        )}

        {tourRunning && tab === 'tournament' ? (
          <LobbyTournamentPanel lobbyData={lobbyData} myId={myId} canControl={canControlLobby} actions={actions} lang={lang} />
        ) : (
        <div className="cr-arcade-panel overflow-hidden">
          <ModeStartBand
            lobbyData={lobbyData}
            actions={actions}
            t={t} lang={lang}
            canControlLobby={canControlLobby}
            isClashAdmin={isClashAdmin}
            effectiveIsHost={effectiveIsHost}
            onStart={actions.startGame}
            onShowHistory={openHistory}
            onShowTournament={() => setTab('tournament')}
            poolSize={poolSize}
            {...readiness}
          />

          <div className="cr-section--rule grid grid-cols-1 lg:grid-cols-2">
            <div>
              <Section icon={CrSettings} title={t.settingsSection}>
                <div className="flex flex-col gap-3">
                  {canControlLobby && (
                    <GameSettingsCard lobbyData={lobbyData} lang={lang} t={t} onOpen={() => setSettingsOpen(true)} />
                  )}
                  {canControlLobby && !lobbyData?.tournament && (
                    <LobbyTournamentCard lobbyData={lobbyData} actions={actions} lang={lang} />
                  )}
                  <CardPoolCard
                    excludedCount={excludedCards.length}
                    poolSize={poolSize}
                    canControlLobby={canControlLobby}
                    onOpen={() => setExcludeOpen(true)}
                    t={t}
                  />
                </div>
              </Section>
              <Section icon={CrLock} title={t.lobbySection}>
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
              </Section>
            </div>

            {/* Senkrechte Fuge zwischen den Spalten ab lg, auf dem Handy eine waagerechte */}
            <div className="cr-section--rule lg:!shadow-none lg:!border-t-0 lg:border-l lg:border-l-[rgba(2,8,20,0.55)]">
              <Section icon={CrSocial}
                title={t.playersOfMax(activePlayers.length, lobbyData?.maxPlayers || 8)}
                aside={realPlayers.length - activePlayers.length > 0
                  ? t.spectatorCount(realPlayers.length - activePlayers.length) : null}>
                <PlayerList
                  lobbyData={lobbyData}
                  myId={myId}
                  canControlLobby={canControlLobby}
                  t={t}
                  onToggleOwnSpectator={actions.toggleSpectator}
                  onSetPlayerSpectator={actions.setPlayerSpectator}
                  onTransferHost={onTransferHost}
                  onKick={actions.kickPlayer}
                  onOpenCrAccount={(p) => setCrTarget(p.id)}
                  onSwitchTeam={actions.switchTeam}
                  onAddBot={actions.addBot}
                  onSetTeamCount={actions.setTeamCount}
                  onRandomizeTeams={actions.randomizeTeams}
                />
              </Section>
              {canControlLobby && (
                <Section>
                  <TrackingCard lobbyData={lobbyData} actions={actions} t={t} />
                </Section>
              )}
            </div>
          </div>
        </div>
        )}

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      </div>
    </div>
  );
}
