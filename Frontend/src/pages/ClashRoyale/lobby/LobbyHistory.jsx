// Die letzten Spiele dieser Sitzung — direkt in der Lobby statt nur im Modal.
//
// Reihenfolge: neuestes Spiel oben. Der Server hängt jedes beendete Spiel hinten an
// lobby.history an (gameNum aufsteigend), hier wird die Liste also umgedreht.
//
// Gezeigt wird NUR das zuletzt beendete Spiel; alles Weitere steckt hinter „Alle ansehen"
// im Modal. Nach acht Spielen wäre die Lobby sonst wieder eine Endlosseite — genau das,
// was der Umbau loswerden sollte.
//
// Die acht Deckkarten stehen als 2×4-Block (vier je Reihe) statt als Achterstreifen:
// So bleiben sie auch neben dem Spielernamen groß genug, um die Karte zu erkennen.

import React from 'react';
import { Trophy, ChevronRight } from 'lucide-react';
import CardTile from '../ui/CardTile';
import PlayerAvatar from '../components/PlayerAvatar';
import { modeNameFor } from '../modesConfig';

const VISIBLE_GAMES = 1;

export default function LobbyHistory({ historyData, t, lang, onShowAll }) {
  // Nicht in-place umdrehen: historyData ist der State aus dem Socket-Hook
  const games = [...(historyData || [])].reverse();
  if (games.length === 0) return null;

  const shown = games.slice(0, VISIBLE_GAMES);

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <span className="text-white font-semibold text-sm flex items-center gap-2">
          <Trophy size={14} className="text-amber-400" />
          {t.recentGames}
        </span>
        {games.length > VISIBLE_GAMES && (
          <button onClick={onShowAll}
            className="flex items-center gap-0.5 text-violet-400 hover:text-violet-300 text-xs font-semibold transition-colors">
            {t.showAllGames}
            <ChevronRight size={13} />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {shown.map((game, gi) => {
          const players = game.players.filter(p => !p.isSpectator);
          return (
            <div key={game.gameNum ?? gi} className="rounded-lg bg-black/25 p-3">
              <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider mb-2">
                {t.historyGame(game.gameNum)} · {modeNameFor(game.mode, lang)}
              </p>
              {/* Ab zwei Spielern nebeneinander — durch die 2×4-Decks wird jeder Eintrag
                  deutlich höher, untereinander wäre die Lobby sonst wieder endlos lang. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                {players.map((p, pi) => (
                  <div key={p.id ?? pi} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar avatarId={p.avatar} size={22} />
                      <span className="text-white/70 text-xs truncate flex-1">{p.name}</span>
                      <span className="text-white/25 text-[10px] tabular-nums shrink-0">
                        {p.deck.length}/8
                      </span>
                    </div>
                    {/* 2×4 statt eines Achterstreifens — so sind die Karten doppelt so groß */}
                    <div className="grid grid-cols-4 gap-1">
                      {p.deck.map((card, ci) => (
                        <CardTile key={ci} card={card} className="rounded-md" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
