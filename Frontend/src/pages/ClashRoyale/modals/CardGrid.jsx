// Nach Seltenheit gruppiertes Kartenraster.
//
// Kartenpool-Modal und Admin-Kartentausch zeigten beide 122 Karten in exakt derselben
// Gruppierung — inklusive derselben content-visibility-Optimierung, die einmal nachträglich
// eingebaut und in die zweite Kopie nie übernommen wurde.

import React from 'react';
import CardTile from '../ui/CardTile';
import { RARITY_ORDER, RARITY_LABEL, RARITY_LABEL_ES } from '../constants';
import { RARITY_COLOR, ALL_CARDS } from '../data/cards';

/**
 * @param {string}   query      Suchbegriff; leer = alle Karten
 * @param {Function} renderCard (card) => Props für CardTile (onClick, disabled, overlay …)
 * @param {string}   emptyText  Text, wenn die Suche nichts findet
 */
export default function CardGrid({ query = '', renderCard, emptyText, lang = 'de' }) {
  const q = query.trim().toLowerCase();
  const filtered = q ? ALL_CARDS.filter(c => c.name.toLowerCase().includes(q)) : ALL_CARDS;

  if (filtered.length === 0) {
    return <p className="text-white/40 text-sm text-center py-8">{emptyText}</p>;
  }

  return (
    <div className="space-y-5">
      {RARITY_ORDER.map(rarity => {
        const cards = filtered.filter(c => c.rarity === rarity);
        if (!cards.length) return null;
        return (
          // content-visibility: auto — der Browser überspringt Rendern/Painting von
          // Abschnitten außerhalb des sichtbaren Bereichs. Das macht das Scrollen über
          // 122 Karten flüssig, gerade auf dem Handy.
          <div key={rarity} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 480px' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: RARITY_COLOR[rarity] }}>
              {lang === 'de' ? (RARITY_LABEL[rarity] || rarity) : lang === 'es' ? (RARITY_LABEL_ES[rarity] || rarity) : rarity}
            </p>
            <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-1.5">
              {cards.map(card => (
                <CardTile key={card.id} card={card} ratio="card" {...renderCard(card)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
