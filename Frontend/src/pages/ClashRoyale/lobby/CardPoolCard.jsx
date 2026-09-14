// Kartenpool-Karte der linken Spalte: Kurzfassung + Zugang zum vollen Kartenraster
// (CardExclusionModal.jsx) — das Raster selbst bleibt ein Modal, ~120 Karten würden die
// Einstellungsspalte sonst sprengen. Gäste sehen dieselbe Kurzfassung, nur ohne Knopf.
import React from 'react';
import { Ban } from 'lucide-react';
import { ALL_CARDS } from '../data/cards';

export default function CardPoolCard({ excludedCount, poolSize, canControlLobby, onOpen, t }) {
  const summary = excludedCount === 0
    ? t.allCardsInDraft(ALL_CARDS.length)
    : t.excludedInDraft(excludedCount, poolSize);

  return (
    <div className="cr-arcade-panel p-5">
      <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
        <Ban size={13} className="text-white/40" />
        {t.cardPool}
      </p>
      {canControlLobby ? (
        <button onClick={onOpen}
          className="w-full flex items-center justify-between gap-2 bg-black/30 border border-white/10 hover:border-white/25 rounded-lg px-3.5 py-3 transition-colors text-left">
          <span className={`text-sm font-semibold ${excludedCount ? 'text-white' : 'text-white/50'}`}>{summary}</span>
          <span className="text-violet-400 text-xs font-semibold shrink-0">{t.edit}</span>
        </button>
      ) : (
        <p className="text-white/50 text-sm">{summary}</p>
      )}
    </div>
  );
}
