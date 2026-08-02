// Rahmen der Spielphase: Kopfleiste, Admin-Steuerung und der geladene Spielmodus.
//
// Die acht Modi werden einzeln nachgeladen. Gespielt wird immer genau einer; als
// statische Importe hingen alle acht (zusammen rund 4.400 Zeilen) am Seiten-Chunk und
// wurden schon beim Betreten der Lobby geparst. useClashSocket lädt den passenden
// Chunk vor, sobald in der Lobby feststeht, welcher Modus dran ist — der Suspense-
// Fallback wird deshalb in aller Regel gar nicht sichtbar.

import React, { lazy, Suspense } from 'react';
import { XCircle, LogOut, Shield } from 'lucide-react';
import SEO from '../../../components/SEO';
import LanguageSelect from '../components/LanguageSelect';
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
    props: (s, a) => ({
      fishState: s.fishState,
      onCatch: a.fishCatch,
      denied: s.fishDenied,
      autoCatch: s.fishAutoCatch,
    }),
  },
  'dark-maze': {
    Component: DarkMaze,
    props: (s, a) => ({
      mazeState: s.mazeState,
      onMove: a.mazeMove,
      onPickup: a.mazePickup,
      onDraftPick: a.mazeDraftPick,
      onJokerPick: a.mazeJokerPick,
      onCloseDraft: a.mazeCloseDraft,
    }),
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
  const ModeComponent = view.Component;
  const modeReady = view.ready ? view.ready(socket) : true;

  const loading = (
    <div className="h-full flex items-center justify-center">
      <p className="text-white/40 text-sm animate-pulse">{t.loadingGame}</p>
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#0a0a0d]">
      <SEO title={gameModeName} description={t.gameSeoDesc} path="/clash-royale" lang={lang} noindex />

      <div className="shrink-0 h-12 bg-black/25 border-b border-white/10 flex items-center px-3 sm:px-4 gap-2 sm:gap-3">
        <ModeIcon size={15} className="text-violet-400 shrink-0" />
        {/* Auf schmalen Geräten weicht der Modusname dem Platz für die Aktionen rechts */}
        <span className="text-white font-semibold text-sm truncate hidden xs:inline sm:inline">{gameModeName}</span>
        <div className="flex-1" />
        {error && <span className="text-red-400 text-xs animate-pulse truncate max-w-[40%]">{error}</span>}
        <LanguageSelect lang={lang} onChange={changeLang} />
        {isClashAdmin && (
          <button onClick={() => setShowAdminPanel(v => !v)} title={t.adminControlTitle}
            aria-label={t.adminControlTitle}
            className={`p-1.5 rounded-lg border transition-colors ${
              showAdminPanel
                ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                : 'border-white/10 text-white/40 hover:text-violet-300 hover:border-violet-500/30'
            }`}>
            <Shield size={14} />
          </button>
        )}
        {canControlLobby && !gameOver && (
          <button onClick={onCancelGame} title={t.cancelGameTitle}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors text-xs font-semibold">
            <XCircle size={13} />
            <span className="hidden sm:inline">{t.cancelGameBtn}</span>
          </button>
        )}
        <button onClick={onLeave} aria-label={t.leaveLobbyBtn} title={t.leaveLobbyBtn}
          className="text-white/30 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5">
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

      <div className="flex-1 overflow-hidden">
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
            />
          ) : modeReady ? (
            <ModeComponent myPlayerId={myId} lang={lang} {...view.props(socket, actions)} />
          ) : loading}
        </Suspense>
      </div>
    </div>
  );
}
