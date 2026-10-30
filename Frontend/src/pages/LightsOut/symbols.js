// symbols.js — Zeichen für das Zahlenschloss im Wald (ohne three.js: Spielwelt UND HUD nutzen sie).
// Jedes Zeichen ist ein SVG-Pfad im Feld 0..100. Im Spiel als Schnitzerei in der Rinde (Canvas, Path2D),
// im HUD als <svg>. Bewusst einfache Formen — man soll sie nach einem Blick im Lichtkegel wiedererkennen.

/** Archimedische Spirale (drei Windungen) als Linienzug */
const SPIRAL = (() => {
  let d = '';
  for (let i = 0; i <= 90; i++) {
    const a = (i / 90) * Math.PI * 6;
    const r = 3 + (i / 90) * 41;
    d += `${i ? ' L' : 'M'}${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}`;
  }
  return d;
})();

export const SYMBOLS = {
  auge: 'M8 50 Q50 8 92 50 Q50 92 8 50 Z M50 36 A14 14 0 1 0 50.01 36 Z',
  mond: 'M62 10 A40 40 0 1 0 62 90 A30 30 0 1 1 62 10 Z',
  dreieck: 'M50 8 L92 88 L8 88 Z',
  kreuz: 'M20 14 L50 44 L80 14 L86 20 L56 50 L86 80 L80 86 L50 56 L20 86 L14 80 L44 50 L14 20 Z',
  hand: 'M30 92 L30 46 L22 30 L28 26 L38 40 L38 10 L46 10 L46 40 L52 6 L60 6 L56 40 L66 12 L74 14 L64 44 L80 30 L86 36 L66 62 L66 92 Z',
  spirale: SPIRAL,
};
/** Spirale wird nur nachgezogen (Linie), alle anderen gefüllt. */
export const STROKE_ONLY = new Set(['spirale']);
export const SYMBOL_IDS = Object.keys(SYMBOLS);

export const SYMBOL_NAMES = {
  auge: 'Auge', mond: 'Mond', dreieck: 'Dreieck', kreuz: 'Kreuz', hand: 'Hand', spirale: 'Spirale',
};

/**
 * Zeichnet ein Zeichen in einen Canvas-Kontext (Mittelpunkt cx/cy, Kantenlänge size).
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawSymbol(ctx, id, cx, cy, size, { fill = '#000', line = 6 } = {}) {
  const d = SYMBOLS[id];
  if (!d) return;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 100, size / 100);
  const p = new Path2D(d);
  if (STROKE_ONLY.has(id)) {
    ctx.strokeStyle = fill;
    ctx.lineWidth = line * 1.6;
    ctx.lineCap = 'round';
    ctx.stroke(p);
  } else {
    ctx.fillStyle = fill;
    ctx.fill(p, 'evenodd');
  }
  ctx.restore();
}
