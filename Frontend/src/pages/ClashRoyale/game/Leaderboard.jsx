// Leaderboard des API-Trackings auf dem Endscreen.
//
// Die Punktestände kommen NICHT aus dem gameOver-Ereignis, sondern aus dem laufenden
// Lobby-Zustand. Zwei Gründe: Die acht Spielmodi bauen ihr gameOver jeweils selbst
// zusammen — die Stände müssten in acht Dateien nachgetragen werden. Und so bleibt die
// Tabelle live: Wer während des Endscreens noch eine Partie beendet, rutscht hier hoch.

import React from 'react';
import { Activity, Medal } from 'lucide-react';
import PlayerAvatar from '../components/PlayerAvatar';
import CrScoreBadge from '../lobby/CrScoreBadge';

/** Gold, Silber, Bronze für die ersten drei; danach nur die Platzziffer. */
const RANK_COLOR = ['text-amber-400', 'text-white/60', 'text-orange-400'];

export default function Leaderboard({ lobbyPlayers = [], trackingEnabled, t }) {
  if (!trackingEnabled) return null;

  const ranked = lobbyPlayers
    .filter(p => !p.isAdmin && p.crScore)
    // Mehr Siege zuerst; bei Gleichstand entscheidet, wer weniger verloren hat
    .sort((a, b) => (b.crScore.wins - a.crScore.wins) || (a.crScore.losses - b.crScore.losses));

  if (ranked.length === 0) return null;

  const anyPlayed = ranked.some(p => p.crScore.wins > 0 || p.crScore.losses > 0);

  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={15} className="text-green-400" />
        <h3 className="text-white font-semibold text-sm">{t.leaderboard}</h3>
      </div>

      {anyPlayed ? (
        <ol className="space-y-1.5">
          {ranked.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-lg bg-black/25 px-3 py-2">
              <span className={`w-5 text-center font-bold tabular-nums text-sm shrink-0 ${RANK_COLOR[i] || 'text-white/30'}`}>
                {i < 3 ? <Medal size={15} className="mx-auto" /> : i + 1}
              </span>
              <PlayerAvatar avatarId={p.avatar} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold text-sm truncate">{p.name}</p>
                {p.crName && <p className="text-white/30 text-[11px] truncate">{p.crName}</p>}
              </div>
              {p.crScore.lastMode && (
                <span className="hidden sm:inline text-white/25 text-[11px] truncate max-w-[10rem]">
                  {p.crScore.lastMode}
                </span>
              )}
              <CrScoreBadge score={p.crScore} t={t} size="lg" />
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-white/40 text-sm text-center py-4">{t.leaderboardEmpty}</p>
      )}
    </div>
  );
}
