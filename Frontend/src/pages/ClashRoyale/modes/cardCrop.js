// Zuschnitt des Kartenartworks.
//
// Die Bilder von cdn.royaleapi.com bringen den Seltenheitsrahmen MIT — orange bei Rare,
// grau bei Common, violett bei Epic und so weiter. Eine rahmenlose Variante gibt es dort
// nicht (geprüft: /cards/, /cards-150/, /card-art/ — alle mit Rahmen bzw. nicht vorhanden).
//
// Wer die Karten rahmenlos will, hat deshalb nur eine Möglichkeit: leicht hineinzoomen,
// sodass der Rahmen aus dem sichtbaren Bereich fällt. Der Container muss dafür
// overflow-hidden sein — das sind alle Kartenkacheln in den Modi.
//
// Der Preis ist ehrlich zu nennen: Am Rand geht etwas Artwork verloren, und die
// Seltenheit ist am Bild dann nicht mehr ablesbar. Deshalb steht der Faktor hier zentral —
// auf 1 gesetzt, sind die Rahmen wieder da, ohne dass eine Datei angefasst werden muss.

/** 1 = unverändert (Rahmen sichtbar), 1.16 = Rahmen weggeschnitten. */
export const CARD_CROP_SCALE = 1;

/** Fertiges Style-Objekt für <img>-Elemente in den Kartenkacheln. */
export const CARD_CROP = CARD_CROP_SCALE === 1
  ? undefined
  : { transform: `scale(${CARD_CROP_SCALE})` };
