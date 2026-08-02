// Spielverlauf dieser Lobby-Sitzung.
//
// Der Server hängt jedes beendete Spiel hinten an lobby.history an (gameNum aufsteigend).
// Angezeigt wird umgekehrt — das zuletzt gespielte Spiel interessiert am meisten und
// steht deshalb oben.

import React from 'react';
import { Trophy } from 'lucide-react';
import Modal from '../ui/Modal';
import CardTile from '../ui/CardTile';
import PlayerAvatar from '../components/PlayerAvatar';
import { modeNameFor } from '../modesConfig';

export default function HistoryModal({ historyData, onClose, t, lang }) {
  // Nicht in-place umdrehen: historyData ist der State aus dem Socket-Hook.
  const games = [...(historyData || [])].reverse();

  return (
    <Modal
      title={t.historyTitle}
      icon={<Trophy size={15} className="text-amber-400 shrink-0" />}
      onClose={onClose}>
      <div className="p-5 space-y-8">
        {games.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-8">{t.historyEmpty}</p>
        ) : games.map((game, gi) => {
          const players = game.players.filter(p => !p.isSpectator);
          return (
            <div key={game.gameNum ?? gi}>
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">
                {t.historyGame(game.gameNum)} · {modeNameFor(game.mode, lang)}
              </p>
              <div className={`grid gap-4 ${
                players.length <= 2 ? 'grid-cols-1 sm:grid-cols-2'
                  : players.length <= 3 ? 'grid-cols-1 sm:grid-cols-3'
                    : 'grid-cols-2 sm:grid-cols-4'
              }`}>
                {players.map((p, pi) => (
                  <div key={p.id ?? pi} className="panel p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar avatarId={p.avatar} size={28} />
                      <span className="text-white font-semibold text-xs truncate flex-1">{p.name}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {p.deck.map((card, ci) => (
                        <CardTile key={ci} card={card} />
                      ))}
                    </div>
                    <p className="text-white/30 text-[9px]">{p.deck.length}/8 {t.cardsUnit}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
