// Kartenpool in der Lobby: Kurzfassung + Zugang zum vollen Kartenraster
// (CardExclusionModal.jsx) — das Raster selbst bleibt ein Modal, ~120 Karten würden die
// Einstellungsspalte sonst sprengen. Gäste sehen dieselbe Kachel, nur nicht anklickbar.
// Seit Sept. 2026 eine Kachel im Abschnitt "Einstellungen" statt eines eigenen Kastens.
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { CrCards } from '../ui/CrIcons';
import { ALL_CARDS } from '../data/cards';

export default function CardPoolCard({ excludedCount, poolSize, canControlLobby, onOpen, t }) {
  const summary = excludedCount === 0
    ? t.allCardsInDraft(ALL_CARDS.length)
    : t.excludedInDraft(excludedCount, poolSize);

  const content = (
    <>
      <span className="cr-tile-icon w-12 h-12"><CrCards size={30} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-cr text-white text-base leading-tight">{t.cardPool}</span>
        <span className="block text-white/55 text-xs truncate mt-0.5">{summary}</span>
      </span>
      {canControlLobby && <ChevronRight size={18} className="text-white/60 shrink-0" />}
    </>
  );

  return canControlLobby ? (
    <button type="button" onClick={onOpen} className="cr-tile-btn px-3.5 py-3">{content}</button>
  ) : (
    <div className="cr-tile-btn cr-tile-btn--static px-3.5 py-3">{content}</div>
  );
}
