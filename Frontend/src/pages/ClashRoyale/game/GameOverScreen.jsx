// Endscreen: alle fertigen Decks nebeneinander, mit Deck-Link und QR-Code.
// Admins können hier einzelne Karten nachträglich austauschen.

import React, { useState } from 'react';
import { LayoutGrid, Rows, Repeat, LogOut, ArrowLeftRight, Monitor, Copy, Check } from 'lucide-react';
import CardTile from '../ui/CardTile';
import ChunkyButton from '../ui/ChunkyButton';
import PlayerAvatar from '../components/PlayerAvatar';
import AdminCardSwapModal from './AdminCardSwapModal';
import DeckQrModal, { DeckQrButton } from './DeckQrModal';
import Leaderboard from './Leaderboard';
import { SIZE_COLS } from '../constants';
import trophyIcon from '../../../assets/clashRoyale/ui/trophy.png';

/** Deck-Karte im Endscreen — für Admins klickbar, um sie auszutauschen. */
function DeckCardTile({ card, canSwap, onSwap, t }) {
  return (
    <CardTile
      card={card}
      selectable={canSwap}
      onClick={canSwap ? onSwap : undefined}
      title={canSwap ? t.swapCardHint(card.name) : card.name}
      overlay={canSwap ? (
        <span className="absolute inset-0 hidden sm:flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity">
          <ArrowLeftRight size={14} className="text-violet-300" />
        </span>
      ) : null}
    />
  );
}

export default function GameOverScreen({
  gameOver, myId, isHost, isAdmin, onSwapCard, onLeave, onRestart, lang = 'de', t,
  lobbyPlayers, trackingEnabled, overlayKey,
}) {
  const [size, setSize] = useState('m');
  const [layout, setLayout] = useState('grid'); // 'grid' | 'list'
  const [swapTarget, setSwapTarget] = useState(null); // { player, deckIndex }
  const [qrTarget, setQrTarget] = useState(null);     // { player, deckLink }
  const [overlayCopied, setOverlayCopied] = useState(false);

  const activePlayers = (gameOver.players || []).filter(p => !p.isSpectator);

  // Lobbyeigenes Deck-Overlay (siehe streamer/LobbyDeckOverlayPage.jsx): derselbe Link für
  // die komplette Sitzung, jeder Spieler kann ihn als OBS-Browserquelle einfügen — genau wie
  // das persönliche Streamer-Setup, nur ohne Twitch-Login und an diese eine Lobby gebunden.
  const overlayUrl = overlayKey
    ? `${window.location.origin}/clash-royale/overlay/lobby-decks/${overlayKey}`
    : '';
  const copyOverlayUrl = () => {
    if (!overlayUrl) return;
    navigator.clipboard.writeText(overlayUrl).catch(() => {});
    setOverlayCopied(true);
    setTimeout(() => setOverlayCopied(false), 1500);
  };

  // Verlassen ist nicht rückholbar (zurück auf die Startseite, Wiedereintritt nur mit
  // Code) — deshalb einmal nachfragen. Der Hinweis auf "Erneut spielen" steht nur beim
  // Host, weil nur er eine neue Runde starten kann.
  const confirmLeave = () => {
    if (window.confirm(isHost ? t.leaveLobbyConfirm : t.leaveLobbyConfirmGuest)) onLeave();
  };

  const playerCard = (p, i, deckCols) => (
    <div key={p.id || i} className="cr-game-card p-4 space-y-3">
      <div className="flex items-center gap-2.5">
        <PlayerAvatar avatarId={p.avatar} size={layout === 'grid' ? 36 : 32} />
        <span className="text-white font-bold text-sm truncate flex-1">{p.name}</span>
        <DeckQrButton player={p} t={t} onOpen={(player, deckLink) => setQrTarget({ player, deckLink })} />
        {p.id === myId && <span className="text-[10px] text-violet-400 font-semibold shrink-0">{t.youLabel}</span>}
        {layout === 'list' && <span className="text-white/30 text-xs shrink-0">{p.deck.length}/8</span>}
      </div>
      <div className={`grid ${deckCols} gap-1.5`}>
        {p.deck.map((card, ci) => (
          <DeckCardTile key={ci} card={card} canSwap={isAdmin} t={t}
            onSwap={() => setSwapTarget({ player: p, deckIndex: ci })} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto custom-scrollbar cr-arcade-bg p-4 sm:p-6">
      {swapTarget && (
        <AdminCardSwapModal
          player={swapTarget.player}
          deckIndex={swapTarget.deckIndex}
          onPick={(newCardId) => {
            onSwapCard(swapTarget.player.id, swapTarget.deckIndex, newCardId);
            setSwapTarget(null);
          }}
          onClose={() => setSwapTarget(null)}
          lang={lang}
          t={t}
        />
      )}
      {qrTarget && (
        <DeckQrModal player={qrTarget.player} deckLink={qrTarget.deckLink} onClose={() => setQrTarget(null)} t={t} />
      )}

      <div className="max-w-6xl mx-auto space-y-5">
        <div className="cr-arcade-panel px-4 sm:px-5 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <img src={trophyIcon} alt="" width={30} height={30} className="shrink-0" />
            <div>
              <h2 className="font-arcade text-lg font-bold text-white">{t.draftDone}</h2>
              <p className="text-white/40 text-xs">{isAdmin ? t.adminSwapHint : t.allDecksReady}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Darstellung umschalten — auf dem Handy ist die Liste meist lesbarer,
                deshalb bleiben beide Optionen auch dort erreichbar. */}
            <div className="flex items-center gap-0.5 border border-white/10 rounded-lg p-0.5">
              <button onClick={() => setLayout('grid')} title={t.layoutGrid} aria-label={t.layoutGrid}
                className={`p-1.5 rounded-[2px] transition-colors ${layout === 'grid' ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/50'}`}>
                <LayoutGrid size={13} />
              </button>
              <button onClick={() => setLayout('list')} title={t.layoutList} aria-label={t.layoutList}
                className={`p-1.5 rounded-[2px] transition-colors ${layout === 'list' ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/50'}`}>
                <Rows size={13} />
              </button>
            </div>

            {/* Größenwahl ist nur im Raster sinnvoll — in der Liste ist die Breite fest */}
            {layout === 'grid' && (
              <div className="hidden sm:flex items-center gap-1 border border-white/10 rounded-lg p-0.5">
                {Object.keys(SIZE_COLS).map(k => (
                  <button key={k} onClick={() => setSize(k)}
                    className={`w-7 h-6 text-xs font-bold rounded-[2px] transition-colors ${
                      size === k ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/50'
                    }`}>
                    {k.toUpperCase()}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              {isHost ? (
                <>
                  {/* "Erneut spielen" ist die Hauptaktion — es führt zurück in die Lobby.
                      Das Verlassen daneben ist bewusst zurückhaltend und fragt nach. */}
                  <ChunkyButton variant="green" size="sm" icon={Repeat} onClick={onRestart}>
                    {t.playAgain}
                  </ChunkyButton>
                  <ChunkyButton variant="red" size="sm" icon={LogOut} onClick={confirmLeave}>
                    <span className="hidden sm:inline">{t.leaveLobbyBtn}</span>
                  </ChunkyButton>
                </>
              ) : (
                <>
                  <span className="text-white/40 text-sm">{t.waitingForHost}</span>
                  <ChunkyButton variant="red" size="sm" icon={LogOut} onClick={confirmLeave}>
                    <span className="hidden sm:inline">{t.leaveLobbyBtn}</span>
                  </ChunkyButton>
                </>
              )}
            </div>
          </div>
        </div>

        {layout === 'grid' ? (
          <div className={`grid ${SIZE_COLS[size]} gap-4`}>
            {activePlayers.map((p, i) => playerCard(p, i, 'grid-cols-4'))}
          </div>
        ) : (
          <div className="space-y-3">
            {activePlayers.map((p, i) => playerCard(p, i, 'grid-cols-4 sm:grid-cols-8'))}
          </div>
        )}

        {/* Für die komplette Sitzung gültig (siehe LobbyDeckOverlayPage) — jeder in der
            Lobby kann die Quelle kopieren, nicht nur der per Twitch verknüpfte Streamer. */}
        {overlayUrl && (
          <div className="cr-arcade-panel px-4 sm:px-5 py-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Monitor size={22} className="text-white/60 shrink-0" />
              <div className="min-w-0">
                <h3 className="font-arcade text-sm font-bold text-white">{t.deckOverlayTitle}</h3>
                <p className="text-white/40 text-xs">{t.deckOverlayHint}</p>
              </div>
            </div>
            <ChunkyButton variant="blue" size="sm" icon={overlayCopied ? Check : Copy} onClick={copyOverlayUrl}>
              {overlayCopied ? t.deckOverlayCopied : t.deckOverlayBtn}
            </ChunkyButton>
          </div>
        )}

        {/* Unter dem Deck-Overlay-Panel statt darüber — bei sehr vielen Spielern würde die
            Tabelle sonst die Decks so weit nach unten schieben, dass man sie kaum noch sieht. */}
        <Leaderboard lobbyPlayers={lobbyPlayers} trackingEnabled={trackingEnabled} t={t} />
      </div>
    </div>
  );
}
