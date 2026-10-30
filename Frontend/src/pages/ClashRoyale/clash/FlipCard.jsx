// FlipCard.jsx — Karte zum Umklappen wie beim Klappbrett-Spiel: vorne Kartenbild + Name, umgeklappt die
// Rückseite (CR-Kartenrücken). Genutzt von Kartenraten und Wer bin ich?. Aussehen: .crf-* in index.css.
import React from 'react';
import CardFace from '../ui/CardFace';

/**
 * @param flipped  umgeklappt (ausgeschlossen)
 * @param state    '' | 'picked' (gewählt) | 'secret' (die gesuchte/eigene Karte) | 'wrong'
 */
export default function FlipCard({ card, flipped = false, state = '', onClick, disabled = false, title }) {
  return (
    <button type="button" className={`crf${flipped ? ' is-flipped' : ''}${state ? ` is-${state}` : ''}`}
      onClick={onClick} disabled={disabled} title={title || card.name} aria-pressed={flipped}>
      <span className="crf-inner">
        <span className="crf-front">
          <span className="crf-art"><CardFace id={card.id} rarity={card.rarity} /></span>
          <span className="crf-name">{card.name}</span>
        </span>
        <span className="crf-back" aria-hidden="true"><span /></span>
      </span>
    </button>
  );
}
