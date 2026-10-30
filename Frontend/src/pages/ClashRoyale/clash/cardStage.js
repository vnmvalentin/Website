// cardStage.js — Zeichnen des verdeckten Kartenbilds für Zoom- und Pixel-Raten (Einzelspiel ImageGuess.jsx und das
// Chat-Quiz-Overlay ViewerGamesOverlay.jsx zeigen damit exakt dasselbe Bild je Stufe).
// Das CDN liefert keinen CORS-Header: das Canvas ist danach „tainted“ — für die Anzeige egal, es wird nichts ausgelesen.
import { useEffect, useState } from 'react';
import { cardImageUrl } from '../data/cards';

export const STAGES = 6;
// Artwork-Bereich im 285×420-Kartenbild (innerhalb des Rahmens, bei allen Seltenheiten im Bild)
export const ART = { x: 40, y: 94, w: 205, h: 256 };
// Zoom: Breite des Ausschnitts in Bildpixeln je Stufe (letzte Stufe = ganzes Artwork)
export const ZOOM_W = [22, 34, 52, 80, 124, ART.w];
// Pixel: Anzahl Blöcke über die Breite je Stufe
export const PIXELS = [4, 6, 9, 13, 19, 28];
export const VIEW_W = 400;
export const VIEW_H = 500;

/** Kartenbild laden (null, bis es da ist) */
export function useCardImage(cardId) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    setImg(null);
    const src = cardImageUrl(cardId);
    if (!src) return undefined;
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = src;
    return () => { i.onload = null; };
  }, [cardId]);
  return img;
}

/**
 * @param mode    'zoom' | 'pixel'
 * @param stage   0 … STAGES-1
 * @param fx, fy  Zoom-Mittelpunkt als Anteil 0..1 im Artwork
 * @param reveal  ganzes Artwork scharf zeigen (Auflösung)
 */
export function drawCardStage(canvas, img, { mode, stage, fx = 0.5, fy = 0.5, reveal = false }) {
  if (!canvas || !img) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const sx0 = img.naturalWidth / 285; // falls das CDN eine andere Auflösung liefert
  const sy0 = img.naturalHeight / 420;
  ctx.fillStyle = '#081426';
  ctx.fillRect(0, 0, W, H);
  if (mode === 'zoom' && !reveal) {
    const w = ZOOM_W[stage];
    const h = w * (H / W);
    const cx = ART.x + fx * ART.w;
    const cy = ART.y + fy * ART.h;
    const x = Math.min(ART.x + ART.w - w, Math.max(ART.x, cx - w / 2));
    const y = Math.min(ART.y + ART.h - h, Math.max(ART.y, cy - h / 2));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x * sx0, y * sy0, w * sx0, h * sy0, 0, 0, W, H);
  } else if (mode === 'pixel' && !reveal) {
    const n = PIXELS[stage];
    const m = Math.max(1, Math.round(n * (ART.h / ART.w)));
    const small = document.createElement('canvas');
    small.width = n; small.height = m;
    const sctx = small.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(img, ART.x * sx0, ART.y * sy0, ART.w * sx0, ART.h * sy0, 0, 0, n, m);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, n, m, 0, 0, W, H);
  } else {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, ART.x * sx0, ART.y * sy0, ART.w * sx0, ART.h * sy0, 0, 0, W, H);
  }
}
