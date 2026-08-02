// Der Start-Knopf — samt Begründung, warum er gerade nicht geht.
//
// Er steht an zwei Stellen (Lobby-Übersicht und Fuß des Host-Panels), damit man nach dem
// Schrauben an den Reglern nicht erst das Panel schließen muss. Deshalb eine eigene
// Komponente: die Sperrgründe sollen nicht zweimal formuliert werden.

import React from 'react';
import { Play } from 'lucide-react';

export default function StartGameButton({
  onStart, canStart, t,
  carouselTooMany, carouselMaxPlayers, cardsPerTable,
  poolTooSmall, poolSize, requiredPool,
}) {
  // Reihenfolge = Dringlichkeit: Was der Host zuerst beheben muss, steht zuerst.
  const blockedReason = carouselTooMany
    ? t.startBlockedCarousel(carouselMaxPlayers, cardsPerTable)
    : poolTooSmall
      ? t.startBlockedPool(poolSize, requiredPool)
      : t.startBlockedPlayers;

  return (
    <button onClick={onStart} disabled={!canStart}
      className="w-full bg-violet-600 disabled:bg-white/5 disabled:text-white/30 hover:bg-violet-500 text-white font-bold py-3.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed">
      <Play size={15} />
      {canStart ? t.startGame : blockedReason}
    </button>
  );
}
