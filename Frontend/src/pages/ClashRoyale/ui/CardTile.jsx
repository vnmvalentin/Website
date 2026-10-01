// Die eine Kartenkachel der Clash-Royale-Minigames.
//
// Vorher lag diese Kachel in acht Modus-Dateien plus Endscreen, Verlauf und zwei
// Modals jeweils neu ausgeschrieben — mit unterschiedlichen Radien, Seitenverhältnissen
// und jeweils einem Rahmen (RARITY_BORDER, border-white/10, hover:border-violet-400).
// Genau diese Rahmen sollen weg: sie umranden das Artwork, das selbst schon einen
// Rahmen hat, und lassen jedes Raster wie ein Formular aussehen.
//
// Auswahl und Fokus werden stattdessen mit einem INNEREN Ring markiert (siehe .cr-card
// in index.css). Der liegt über dem Bild statt daneben — dadurch verspringt das Raster
// beim Auswählen nicht um 2px, was bei einem border unvermeidlich wäre.

import React from 'react';
import CardFace from './CardFace';

/**
 * @param {object}   card         Kartenobjekt mit { id, name }; null = leerer Platz
 * @param {string}   ratio        'square' (Deck-/Bingo-Raster) | 'card' (5:6, Draft-Ansichten)
 * @param {boolean}  selectable   Zeigt einen Ring beim Überfahren
 * @param {boolean}  active       Zeigt den Ring dauerhaft (ausgewählt)
 * @param {boolean}  disabled     Ausgegraut UND nicht klickbar
 * @param {boolean}  dimmed       Nur ausgegraut, bleibt klickbar — für Zustände, die
 *                                man durch Anklicken wieder aufhebt (gesperrte Karte
 *                                im Kartenpool). Mit `disabled` wäre genau das nicht
 *                                mehr möglich.
 * @param {Function} onClick      Macht die Kachel zum Button
 * @param {string}   title        Tooltip; ohne Angabe der Kartenname
 * @param {React.ReactNode} overlay  Zusätzlicher Inhalt über dem Bild (Sperr-Symbol, Preis …)
 * @param {string}   className    Zusätzliche Klassen für Größe/Layout
 */
export default function CardTile({
  card,
  ratio = 'square',
  selectable = false,
  active = false,
  disabled = false,
  dimmed = false,
  onClick,
  title,
  overlay,
  className = '',
}) {
  const aspect = ratio === 'card' ? 'aspect-[4/5]' : 'aspect-square';
  const classes = [
    'cr-card',
    aspect,
    selectable && !disabled ? 'cr-card--selectable' : '',
    active ? 'cr-card--active' : '',
    disabled || dimmed ? 'cr-card--disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  const content = (
    <>
      {card && (
        // Nur der sichtbare Kartenrahmen, ohne transparenten Rand (ui/CardFace.jsx). Fehlt das
        // Bild, wird es ausgeblendet — die dunkle Fläche der Kachel bleibt als Platzhalter.
        <CardFace id={card.id} alt={card.name || ''} rarity={card.rarity} />
      )}
      {overlay}
    </>
  );

  if (!onClick) {
    return <div className={classes} title={title ?? card?.name}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? card?.name}
      className={`${classes} disabled:cursor-not-allowed`}>
      {content}
    </button>
  );
}
