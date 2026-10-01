// Kartenbild ohne transparenten Rand und ohne Abschneiden.
//
// Die offiziellen Kartenbilder (285×420) haben oben und unten viel durchsichtigen Rand, je
// nach Rahmen unterschiedlich viel (siehe CARD_FRAME_BOX in modes/cardCrop.js). Mit
// object-contain stand die Karte dadurch klein in ihrer Kachel, mit object-cover wurden bei
// Legendären und Champions Kopf/Krone abgeschnitten. Hier wird stattdessen genau der
// sichtbare Rahmen des jeweiligen Kartentyps gezeigt:
//
//   • ein Kasten im Seitenverhältnis dieses Rahmens, so hoch wie die Kachel, mittig
//   • darin das Bild so vergrößert und verschoben, dass nur der Rahmen zu sehen ist
//
// Alle Rahmen sind höchstens so breit wie 4:5 (CARD_RATIO) — in einer 4:5-Kachel passt die
// Höhe also immer, Legendäre/Champions werden nur etwas schmaler.
import React from 'react';
import { cardImageUrl, ALL_CARDS } from '../data/cards';
import { CARD_FRAME_BOX, CARD_IMAGE_SIZE } from '../modes/cardCrop';

const RARITY_BY_ID = Object.fromEntries(ALL_CARDS.map(c => [c.id, c.rarity]));

export default function CardFace({ id, alt = '', rarity, className = '', loading = 'lazy', onError }) {
  const box = CARD_FRAME_BOX[rarity || RARITY_BY_ID[id]] || CARD_FRAME_BOX.Common;
  const { w: W, h: H } = CARD_IMAGE_SIZE;
  const src = cardImageUrl(id);
  if (!src) return null;
  return (
    <span className={`relative block w-full h-full ${className}`}>
      <span className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 overflow-hidden"
        style={{ aspectRatio: `${box.w} / ${box.h}`, maxWidth: '100%' }}>
        <img
          src={src} alt={alt} loading={loading} decoding="async" draggable={false}
          className="absolute select-none"
          style={{
            width: `${(W / box.w) * 100}%`,
            height: `${(H / box.h) * 100}%`,
            left: `${(-box.x / box.w) * 100}%`,
            top: `${(-box.y / box.h) * 100}%`,
            maxWidth: 'none',
          }}
          onError={onError || (e => { e.currentTarget.style.visibility = 'hidden'; })}
        />
      </span>
    </span>
  );
}
