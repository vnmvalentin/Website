// Endscreen: alle fertigen Decks nebeneinander, mit Deck-Link und QR-Code.
// Admins können hier einzelne Karten nachträglich austauschen.
// Team-Modi (2v2): die Decks stehen nach Teams gruppiert in je einem Team-Kasten.

import React, { useState } from 'react';
import { LayoutGrid, Rows, LogOut, Copy } from 'lucide-react';
import { CrCheck, CrReplay, CrSwap, CrTv, CrCards, CrTourneyTrophy } from '../ui/CrIcons';
import CardTile from '../ui/CardTile';
import ChunkyButton from '../ui/ChunkyButton';
import PlayerAvatar from '../components/PlayerAvatar';
import AdminCardSwapModal from './AdminCardSwapModal';
import DeckQrModal, { DeckQrButton } from './DeckQrModal';
import Leaderboard from './Leaderboard';
import { BackToTournamentButton } from '../tournament/TournamentLobbyBits';
import { SIZE_COLS } from '../constants';
import trophyIcon from '../../../assets/clashRoyale/ui/trophy.png';
import { TEAM_IDS, teamStyle, teamChipClass } from '../lobby/teamStyle';
import ViewTabs from '../lobby/ViewTabs';
import LobbyTournamentPanel from '../lobby/LobbyTournamentPanel';
import { ltDict } from '../lobby/ltourI18n';
import DeckOverlayRotationControls from '../streamer/DeckOverlayRotationControls';
import { buildDeckOverlayUrl, loadStoredRotation, storeRotation } from '../streamer/deckOverlayOptions';

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
          <CrSwap size={21} className="text-violet-300" />
        </span>
      ) : null}
    />
  );
}

export default function GameOverScreen({
  gameOver, myId, isHost, isAdmin, onSwapCard, onLeave, onRestart, lang = 'de', t, tournament = null, restartLabel = null,
  lobbyPlayers, trackingEnabled, overlayKey,
  // Laufendes Lobby-Turnier: { lobbyData, myId, canControl, actions } — dann Reiter Decks | Turnier
  tournamentView = null,
}) {
  const [tab, setTab] = useState('decks');
  const lt = ltDict(lang);
  const [size, setSize] = useState('m');
  const [layout, setLayout] = useState('grid'); // 'grid' | 'list'
  const [swapTarget, setSwapTarget] = useState(null); // { player, deckIndex }
  const [qrTarget, setQrTarget] = useState(null);     // { player, deckLink }
  const [overlayCopied, setOverlayCopied] = useState(false);
  const [rotation, setRotation] = useState(loadStoredRotation);
  const changeRotation = (next) => { setRotation(next); storeRotation(next); };

  const activePlayers = (gameOver.players || []).filter(p => !p.isSpectator);
  // Team-Modus: sobald der Server Teams mitschickt, nach Teams gruppieren (Reihenfolge A, B, C, D)
  const teamGroups = TEAM_IDS
    .map(letter => ({ letter, members: activePlayers.filter(p => p.teamId === letter) }))
    .filter(g => g.members.length > 0);
  const withoutTeam = activePlayers.filter(p => !p.teamId);

  // Lobbyeigenes Deck-Overlay (siehe streamer/LobbyDeckOverlayPage.jsx): derselbe Link für
  // die komplette Sitzung, jeder Spieler kann ihn als OBS-Browserquelle einfügen — genau wie
  // das persönliche Streamer-Setup, nur ohne Twitch-Login und an diese eine Lobby gebunden.
  const overlayUrl = overlayKey
    ? buildDeckOverlayUrl(`${window.location.origin}/clash-royale/overlay/lobby-decks/${overlayKey}`, rotation)
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
    <div key={p.id || i} className="cr-game-card cr-deal-card p-4 space-y-3" style={{ animationDelay: `${(0.15 + i * 0.12).toFixed(2)}s` }}>
      <div className="flex items-center gap-2.5">
        <PlayerAvatar avatarId={p.avatar} size={layout === 'grid' ? 36 : 32} />
        <span className="text-white font-bold text-sm truncate flex-1">{p.name}</span>
        <DeckQrButton player={p} t={t} onOpen={(player, deckLink) => setQrTarget({ player, deckLink })} />
        {p.id === myId && <span className="text-[10px] text-violet-400 font-semibold shrink-0">{t.youLabel}</span>}
        {layout === 'list' && <span className="text-white/30 text-xs shrink-0">{p.deck.length}/8</span>}
      </div>
      <div className={`grid ${deckCols} gap-1.5`}>
        {p.deck.map((card, ci) => (
          <div key={ci} className="cr-deal-card" style={{ animationDelay: `${(0.3 + i * 0.12 + ci * 0.045).toFixed(3)}s` }}>
            <DeckCardTile card={card} canSwap={isAdmin} t={t}
              onSwap={() => setSwapTarget({ player: p, deckIndex: ci })} />
          </div>
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
            <img src={trophyIcon} alt="" width={30} height={30} className="shrink-0 cr-trophy-hop" />
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
              {tournament ? (
                // Turnier-Spiel: kein "Erneut spielen" — weiter geht es im Match-Raum (Freundschaftskampf)
                <BackToTournamentButton tournament={tournament} lang={lang} onLeave={onLeave} />
              ) : isHost ? (
                <>
                  {/* "Erneut spielen" ist die Hauptaktion — es führt zurück in die Lobby.
                      Das Verlassen daneben ist bewusst zurückhaltend und fragt nach. */}
                  <ChunkyButton variant="green" size="sm" icon={CrReplay} onClick={onRestart}>
                    {restartLabel || t.playAgain}
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

        {tournamentView && (
          <ViewTabs active={tab} onSelect={setTab} tabs={[
            { id: 'decks', icon: CrCards, label: lt.tabDecks },
            { id: 'tournament', icon: CrTourneyTrophy, label: lt.tabTournament },
          ]} />
        )}

        {tournamentView && tab === 'tournament' ? (
          // Sieger eintragen geht hier schon; Draft starten erst zurück in der Lobby
          <LobbyTournamentPanel {...tournamentView} lang={lang} inGame />
        ) : (<>
        {teamGroups.length > 0 ? (
          <div className={`grid gap-4 ${layout === 'grid' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
            {teamGroups.map(({ letter, members }) => (
              <section key={letter} className={`rounded-2xl border-2 p-3 space-y-3 ${teamStyle(letter).panel}`}>
                <div className="flex items-center gap-2 px-1">
                  <span className={`${teamChipClass(letter)} w-7 h-7 text-base`}>{letter}</span>
                  <span className={`font-cr text-lg ${teamStyle(letter).text}`}>{t.teamLabel(letter)}</span>
                </div>
                <div className={`grid gap-3 ${layout === 'grid' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                  {members.map((p, i) => playerCard(p, i, layout === 'grid' ? 'grid-cols-4' : 'grid-cols-4 sm:grid-cols-8'))}
                </div>
              </section>
            ))}
            {withoutTeam.map((p, i) => playerCard(p, i, 'grid-cols-4'))}
          </div>
        ) : layout === 'grid' ? (
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
          <div className="cr-arcade-panel px-4 sm:px-5 py-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <CrTv size={32} className="text-white/60 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-arcade text-sm font-bold text-white">{t.deckOverlayTitle}</h3>
                  <p className="text-white/40 text-xs">{t.deckOverlayHint}</p>
                </div>
              </div>
              <ChunkyButton variant="blue" size="sm" icon={overlayCopied ? CrCheck : Copy} onClick={copyOverlayUrl}>
                {overlayCopied ? t.deckOverlayCopied : t.deckOverlayBtn}
              </ChunkyButton>
            </div>
            <div className="border-t border-white/10 pt-4">
              <DeckOverlayRotationControls value={rotation} onChange={changeRotation} lang={lang} variant="arcade" />
            </div>
          </div>
        )}

        {/* Unter dem Deck-Overlay-Panel statt darüber — bei sehr vielen Spielern würde die
            Tabelle sonst die Decks so weit nach unten schieben, dass man sie kaum noch sieht. */}
        <Leaderboard lobbyPlayers={lobbyPlayers} trackingEnabled={trackingEnabled} t={t} />
        </>)}
      </div>
    </div>
  );
}
