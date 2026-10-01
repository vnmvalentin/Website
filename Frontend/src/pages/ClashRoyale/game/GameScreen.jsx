// Rahmen der Spielphase: Kopfleiste, Admin-Steuerung und der geladene Spielmodus.
//
// Die acht Modi werden einzeln nachgeladen. Gespielt wird immer genau einer; als
// statische Importe hingen alle acht (zusammen rund 4.400 Zeilen) am Seiten-Chunk und
// wurden schon beim Betreten der Lobby geparst. useClashSocket lädt den passenden
// Chunk vor, sobald in der Lobby feststeht, welcher Modus dran ist — der Suspense-
// Fallback wird deshalb in aller Regel gar nicht sichtbar.

import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LogOut, Maximize2, Minimize2 } from 'lucide-react';
import { CrCancel, CrShield, CrSettings } from '../ui/CrIcons';
import { useCrPrefs } from '../ui/crPrefs';
import EmoteLayer from '../ui/EmoteLayer';
import SEO from '../../../components/SEO';
import LanguageSelect from '../components/LanguageSelect';
import ChunkyButton from '../ui/ChunkyButton';
import AdminControlPanel from './AdminControlPanel';
import GameOverScreen from './GameOverScreen';
import { modeInfo, modeNameFor } from '../modesConfig';

const SnakeRoyale = lazy(() => import('../modes/SnakeRoyale'));
const ElixirAuction = lazy(() => import('../modes/ElixirAuction'));
const BingoRoyale = lazy(() => import('../modes/BingoRoyale'));
const ShadowCarousel = lazy(() => import('../modes/ShadowCarousel'));
const ElixirRush = lazy(() => import('../modes/ElixirRush'));
const CardEvolution = lazy(() => import('../modes/CardEvolution'));
const AngelRoyale = lazy(() => import('../modes/AngelRoyale'));
const DarkMaze = lazy(() => import('../modes/DarkMaze'));
const TrapSetter = lazy(() => import('../modes/TrapSetter'));
const PyramidDraft = lazy(() => import('../modes/PyramidDraft'));
const ElixirAuction2v2 = lazy(() => import('../modes/ElixirAuction2v2'));
const ElixirRush2v2 = lazy(() => import('../modes/ElixirRush2v2'));

/**
 * Welche Komponente spielt welchen Modus, und woher kommen ihre Daten.
 *
 * Vorher war das eine verschachtelte Kette aus acht Ternären mitten im JSX — beim
 * Nachrüsten eines Modus wurde sie regelmäßig an einer von mehreren Stellen vergessen.
 * Ein neuer Modus braucht jetzt genau einen Eintrag hier.
 */
const MODE_VIEWS = {
  auction: {
    Component: ElixirAuction,
    props: (s, a) => ({
      auctionState: s.auctionState,
      revealState: s.auctionReveal,
      myBid: s.myBid,
      onBid: a.auctionBid,
      showElixirProp: s.lobbyData?.showElixir,
      motherWitchVisit: s.motherWitchVisit,
      onMotherWitchRespond: a.motherWitchRespond,
    }),
  },
  bingo: {
    Component: BingoRoyale,
    props: (s, a) => ({
      bingoState: s.bingoState,
      onPick: a.bingoPick,
      onPowerup: a.bingoPowerup,
      onTokenAction: a.bingoTokenAction,
      players: s.lobbyData?.players || [],
    }),
  },
  'shadow-carousel': {
    Component: ShadowCarousel,
    props: (s, a) => ({
      carouselState: s.carouselState,
      onFlip: a.carouselFlip,
      onPick: a.carouselPick,
    }),
  },
  'elixir-rush': {
    Component: ElixirRush,
    props: (s, a) => ({ rushState: s.rushState, onBuy: a.rushBuy, denied: s.rushDenied }),
  },
  'card-evolution': {
    Component: CardEvolution,
    props: (s, a) => ({
      evoState: s.evoState,
      onAction: a.evoAction,
      onResolvePending: a.evoResolvePending,
      onLock: a.evoLock,
      onSabotage: a.evoSabotage,
    }),
  },
  'angel-royale': {
    Component: AngelRoyale,
    // Rein horizontale Fischbewegung — im Hochformat frisst die Deck-Leiste zusätzlich
    // Höhe, deshalb der Modus mit dem stärksten Querformat-Vorteil (siehe Fullscreen-Knopf
    // unten: bestmögliche Sperre, wo der Browser das erlaubt).
    preferredOrientation: 'landscape',
    props: (s, a) => ({
      fishState: s.fishState,
      onCatch: a.fishCatch,
      denied: s.fishDenied,
      autoCatch: s.fishAutoCatch,
    }),
  },
  'dark-maze': {
    Component: DarkMaze,
    preferredOrientation: 'landscape',
    props: (s, a) => ({
      mazeState: s.mazeState,
      onMove: a.mazeMove,
      onPickup: a.mazePickup,
      onDraftPick: a.mazeDraftPick,
      onJokerPick: a.mazeJokerPick,
      onCloseDraft: a.mazeCloseDraft,
    }),
  },
  'trap-setter': {
    Component: TrapSetter,
    props: (s, a) => ({
      trapState: s.trapState,
      onChooseBadCard: a.trapChooseBadCard,
      onChooseTarget: a.trapChooseTarget,
      onCellClick: a.trapClick,
    }),
  },
  'pyramid-draft': {
    Component: PyramidDraft,
    props: (s, a) => ({
      pyramidState: s.pyramidState,
      onPick: a.pyramidPick,
    }),
  },
  'elixir-auction-2v2': {
    Component: ElixirAuction2v2,
    props: (s, a) => ({
      auctionState: s.auction2v2State,
      revealState: s.auction2v2Reveal,
      onSendHint: a.auction2v2SendHint,
      onBid: a.auction2v2Bid,
    }),
  },
  'elixir-rush-2v2': {
    Component: ElixirRush2v2,
    props: (s, a) => ({ rushState: s.rush2v2State, onBuy: a.rush2v2Buy, denied: s.rush2v2Denied }),
  },
  snake: {
    Component: SnakeRoyale,
    // Snake rendert erst, wenn ein Spielstand da ist — sonst greift der Ladeplatzhalter
    ready: (s) => !!s.gameState,
    props: (s, a) => ({
      gameState: s.gameState,
      players: s.lobbyData?.players || [],
      onPickCard: a.pickCard,
    }),
  },
};

export default function GameScreen({
  socket, actions, t, lang, changeLang, error,
  canControlLobby, isClashAdmin,
  showAdminPanel, setShowAdminPanel,
  onLeave, onCancelGame, onTransferHost,
}) {
  const { lobbyData, gameOver, myId } = socket;
  const mode = lobbyData?.mode || 'snake';
  const gameModeName = modeNameFor(mode, lang);
  const ModeIcon = modeInfo(mode).icon;

  const view = MODE_VIEWS[mode] || MODE_VIEWS.snake;
  const { openSettings } = useCrPrefs();
  const ModeComponent = view.Component;
  const modeReady = view.ready ? view.ready(socket) : true;

  // Fullscreen: iOS Safari kennt die Fullscreen-API für normale Webseiten nicht
  // (document.fullscreenEnabled bleibt dort false) — der Knopf blendet sich über dieses
  // Feature-Flag von selbst aus, ohne Browser-Weiche.
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenSupported = typeof document !== 'undefined' && !!document.fullscreenEnabled;

  useEffect(() => {
    if (!fullscreenSupported) return;
    const onChange = () => {
      const active = document.fullscreenElement === containerRef.current;
      setIsFullscreen(active);
      // Verlässt der Nutzer Fullscreen anders als über unseren Knopf (Android-Zurück-Taste,
      // Geste, …), muss eine evtl. gesetzte Quer-Sperre trotzdem wieder aufgehoben werden.
      if (!active) { try { screen.orientation?.unlock?.(); } catch { /* nicht unterstützt */ } }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [fullscreenSupported]);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
        // Bestmöglich: funktioniert praktisch nur in Chrome/Android und nur im Fullscreen.
        // Überall sonst (v.a. iOS) schlägt der Aufruf fehl oder existiert gar nicht —
        // dann bleibt es beim echten Drehen des Geräts, das Layout passt sich ohnehin an.
        if (view.preferredOrientation && screen.orientation?.lock) {
          screen.orientation.lock(view.preferredOrientation).catch(() => {});
        }
      }
    } catch { /* z.B. vom Nutzer/Browser verweigert — Knopf bleibt einfach wirkungslos */ }
  };

  const loading = (
    <div className="h-full flex items-center justify-center">
      <p className="text-white/40 text-sm animate-pulse">{t.loadingGame}</p>
    </div>
  );

  return (
    <div ref={containerRef} className="h-full flex flex-col overflow-hidden bg-[#0b1a30]">
      <SEO title={gameModeName} description={t.gameSeoDesc} path="/clash-royale" lang={lang} noindex />
      {/* Innerhalb des Vollbild-Containers, damit Emotes auch im Vollbild sichtbar bleiben */}
      <EmoteLayer emotes={socket.emotes} players={lobbyData?.players || []} onSend={actions.sendEmote} lang={lang} />

      <div className="cr-modal-head shrink-0 h-14 flex items-center px-3 sm:px-4 gap-2 sm:gap-3">
        <ModeIcon size={30} className="shrink-0" />
        {/* Auf schmalen Geräten weicht der Modusname dem Platz für die Aktionen rechts */}
        <span className="font-cr text-white text-lg truncate hidden xs:inline sm:inline" style={{ textShadow: '0 2px 0 rgba(2,8,20,0.6)' }}>{gameModeName}</span>
        <div className="flex-1" />
        {error && <span className="text-red-400 text-xs animate-pulse truncate max-w-[40%]">{error}</span>}
        <LanguageSelect lang={lang} onChange={changeLang} />
        <button onClick={openSettings} aria-label={t.settingsSection} title={t.settingsSection}
          className="cr-arcade-icon-btn w-9 h-9">
          <CrSettings size={20} />
        </button>
        {isClashAdmin && (
          <button onClick={() => setShowAdminPanel(v => !v)} title={t.adminControlTitle}
            aria-label={t.adminControlTitle}
            className="cr-arcade-icon-btn w-9 h-9"
            style={showAdminPanel ? { '--cr-arcade-accent': '#8b5cf6', borderColor: '#8b5cf6', color: '#c4b5fd' } : undefined}>
            <CrShield size={21} />
          </button>
        )}
        {canControlLobby && !gameOver && (
          <ChunkyButton variant="red" size="sm" icon={CrCancel} onClick={onCancelGame} title={t.cancelGameTitle}>
            <span className="hidden sm:inline">{t.cancelGameBtn}</span>
          </ChunkyButton>
        )}
        {fullscreenSupported && (
          <button onClick={toggleFullscreen}
            aria-label={isFullscreen ? t.exitFullscreenBtn : t.fullscreenBtn}
            title={isFullscreen ? t.exitFullscreenBtn : t.fullscreenBtn}
            className="cr-arcade-icon-btn w-9 h-9">
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        )}
        <button onClick={onLeave} aria-label={t.leaveLobbyBtn} title={t.leaveLobbyBtn}
          className="cr-arcade-icon-btn cr-arcade-icon-btn--red w-9 h-9">
          <LogOut size={15} />
        </button>
      </div>

      {showAdminPanel && isClashAdmin && (
        <AdminControlPanel
          players={(lobbyData?.players || []).filter(p => !p.isAdmin)}
          hostId={lobbyData?.host}
          onTransferHost={onTransferHost}
          onSetSpectator={actions.setPlayerSpectator}
          onClose={() => setShowAdminPanel(false)}
          t={t}
        />
      )}

      <div className="cr-anim-rise flex-1 overflow-hidden">
        {/* Fallback bewusst derselbe Platzhalter wie unten für "Spiel lädt" — dann sieht
            der Übergang gleich aus, egal ob auf den Chunk oder auf den Server gewartet wird. */}
        <Suspense fallback={loading}>
          {gameOver ? (
            <GameOverScreen
              gameOver={gameOver}
              myId={myId}
              isHost={canControlLobby}
              isAdmin={isClashAdmin}
              onSwapCard={actions.adminSwapCard}
              onLeave={onLeave}
              onRestart={actions.restartLobby}
              lang={lang}
              t={t}
              // Punktestände kommen aus dem laufenden Lobby-Zustand, nicht aus gameOver —
              // dadurch bleibt das Leaderboard auch im Endscreen aktuell (siehe Leaderboard.jsx)
              lobbyPlayers={lobbyData?.players || []}
              trackingEnabled={!!lobbyData?.trackingEnabled}
              overlayKey={lobbyData?.overlayKey}
            />
          ) : modeReady ? (
            <ModeComponent myPlayerId={myId} lang={lang} {...view.props(socket, actions)} />
          ) : loading}
        </Suspense>
      </div>
    </div>
  );
}
