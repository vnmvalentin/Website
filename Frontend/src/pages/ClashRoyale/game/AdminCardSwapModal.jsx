// Admin: eine Deck-Karte im Endscreen gegen eine beliebige andere tauschen.
//
// Zwei Regeln sperren Karten vorab, damit man nicht erst nach dem Klick eine
// Fehlermeldung bekommt — das Backend prüft beide noch einmal:
//   • keine Duplikate im Deck
//   • höchstens 2 Champions pro Deck

import React, { useState } from 'react';
import { Shield, Search } from 'lucide-react';
import Modal from '../ui/Modal';
import CardGrid from '../modals/CardGrid';
import CardTile from '../ui/CardTile';

export default function AdminCardSwapModal({ player, deckIndex, onPick, onClose, lang = 'de', t }) {
  const [query, setQuery] = useState('');

  const oldCard = player.deck[deckIndex];
  const deckIds = new Set(player.deck.map(c => c.id));
  // Die zu ersetzende Karte zählt nicht mit — sonst blockiert ein Champion sich selbst
  const champCount = player.deck.filter((c, i) => c.isChampion && i !== deckIndex).length;

  return (
    <Modal
      title={t.swapCardTitle(player.name)}
      icon={<Shield size={15} className="text-violet-400 shrink-0" />}
      onClose={onClose}
      bodyScroll={false}>

      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0 flex-wrap">
        {oldCard && (
          <div className="flex items-center gap-2 shrink-0">
            <CardTile card={oldCard} ratio="card" className="w-9" />
            <span className="text-white/40 text-xs">{t.replaceWith(oldCard.name)}</span>
          </div>
        )}
        <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 flex-1 min-w-[180px] focus-within:border-violet-500 transition-colors">
          <Search size={13} className="text-white/30 shrink-0" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t.searchCardPlaceholder} autoFocus
            className="bg-transparent text-white text-sm placeholder-gray-600 outline-none w-full" />
        </div>
      </div>

      <div className="overflow-y-auto custom-scrollbar p-5">
        <CardGrid
          query={query}
          lang={lang}
          emptyText={t.noCardFound}
          renderCard={(card) => {
            const inDeck = deckIds.has(card.id);
            const champBlocked = !inDeck && card.isChampion && champCount >= 2;
            const disabled = inDeck || champBlocked;
            return {
              onClick: () => onPick(card.id),
              selectable: true,
              disabled,
              title: inDeck
                ? t.alreadyInDeck(card.name)
                : champBlocked ? t.championLimitTitle(card.name) : card.name,
            };
          }}
        />
      </div>
    </Modal>
  );
}
