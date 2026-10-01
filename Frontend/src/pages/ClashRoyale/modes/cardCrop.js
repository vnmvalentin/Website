// Zuschnitt des Kartenartworks.
//
// Die Bilder von Supercells eigenem Asset-CDN (api-assets.clashroyale.com, siehe
// cardImageUrl() in data/cards.js — früher cdn.royaleapi.com, dieselbe Prüfung dort ergab
// dasselbe Bild) bringen den Seltenheitsrahmen MIT — orange bei Rare, grau bei Common, violett
// bei Epic und so weiter. Eine rahmenlose Variante liefert die API nicht.
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

/** Die Kartenbilder von api-assets.clashroyale.com sind 285×420 px, tragen aber viel
 *  TRANSPARENTEN Rand — wie viel, hängt vom Rahmen ab (per sharp().trim() an Stichproben
 *  aller Seltenheiten nachgemessen, 01.10.2026). Sichtbarer Bereich je Rahmen in Bildpixeln: */
export const CARD_IMAGE_SIZE = { w: 285, h: 420 };
export const CARD_FRAME_BOX = {
  Common:    { x: 14, y: 66, w: 257, h: 322 },
  Rare:      { x: 14, y: 66, w: 257, h: 322 },
  Epic:      { x: 14, y: 66, w: 257, h: 322 },
  Legendary: { x: 11, y: 47, w: 261, h: 356 }, // höherer Rahmen mit Verzierung oben
  Champion:  { x: 14, y: 24, w: 257, h: 378 }, // Krone ragt noch weiter hinauf
};

/** Format der Kartenkacheln: das der normalen Karte (257×322 ≈ 4:5). Höhere Rahmen
 *  (Legendär, Champion) passen komplett hinein und werden nur etwas schmaler — siehe
 *  ui/CardFace.jsx. Vorher 285/420 mit object-contain: nichts abgeschnitten, aber oben und
 *  unten sichtbar leerer Rand. */
export const CARD_RATIO = 4 / 5;

/** Fertiges Style-Objekt für <img>-Elemente in den Kartenkacheln. */
export const CARD_CROP = CARD_CROP_SCALE === 1
  ? undefined
  : { transform: `scale(${CARD_CROP_SCALE})` };

/**
 * Canvas-Gegenstück zu ui/CardFace.jsx: zeichnet nur den sichtbaren Kartenrahmen (ohne
 * transparenten Rand) unverzerrt und mittig in das Zielrechteck. Vorher wurde das ganze
 * 285×420-Bild in ein anderes Seitenverhältnis gepresst (Dark Maze 5:6, Angel ~5:6) und
 * dadurch sichtbar in die Breite gezogen.
 */
export function drawCardFrame(ctx, img, rarity, dx, dy, dw, dh) {
  if (!img || !img.complete || !img.naturalWidth) return;
  const box = CARD_FRAME_BOX[rarity] || CARD_FRAME_BOX.Common;
  const k = img.naturalWidth / CARD_IMAGE_SIZE.w; // falls das CDN einmal größer ausliefert
  const scale = Math.min(dw / box.w, dh / box.h);
  const w = box.w * scale, h = box.h * scale;
  ctx.drawImage(img, box.x * k, box.y * k, box.w * k, box.h * k, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
}
