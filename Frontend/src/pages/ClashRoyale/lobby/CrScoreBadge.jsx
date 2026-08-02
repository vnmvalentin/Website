// Punktestand eines Spielers aus dem API-Tracking — "4–2" neben dem Namen.
//
// Bewusst zurückhaltend: Der Stand ist eine Nebeninformation in der Lobby, nicht die
// Hauptaussage der Zeile. Erst im Leaderboard am Ende bekommt er Gewicht.

import React from 'react';

export default function CrScoreBadge({ score, t, size = 'sm' }) {
  if (!score) return null;
  const { wins = 0, losses = 0, lastMode } = score;
  const empty = wins === 0 && losses === 0;

  const sizes = {
    sm: 'text-[11px] px-1.5 py-0.5 gap-1',
    lg: 'text-base px-2.5 py-1 gap-1.5',
  };

  return (
    <span
      title={t.scoreTitle(wins, losses, lastMode)}
      className={`inline-flex items-center rounded-md font-bold tabular-nums shrink-0 bg-black/40 ${sizes[size]}`}>
      {empty ? (
        <span className="text-white/25 font-semibold">{t.noGamesTracked}</span>
      ) : (
        <>
          <span className="text-green-400">{wins}</span>
          <span className="text-white/25">–</span>
          <span className="text-red-400">{losses}</span>
        </>
      )}
    </span>
  );
}
