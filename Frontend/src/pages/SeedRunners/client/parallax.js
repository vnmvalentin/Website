// Parallax-Hintergründe: je Biom drei bis fünf flache Schichten, die langsamer als die Kamera wandern.
//
// Nur Darstellung. Die Formen entstehen einmal je Biom aus dem seeded PRNG der Sim-Bibliothek (kein
// Math.random: derselbe Hintergrund bei jedem Besuch), gezeichnet wird in Gerätepixeln vor den Kacheln.
// Jede Schicht wiederholt sich nach `period` Weltpixeln, so dass der Hintergrund endlos wirkt.
//
// Farben kommen aus der Palette des Bioms (bg → far → accent), die weiter entfernten Schichten liegen
// näher am Hintergrund. Alles flach, keine Verläufe.

import { createRng } from '../sim/rng.js';
import { VIEW_W, VIEW_H } from './camera.js';

const TAU = Math.PI * 2;

// ── Farben ────────────────────────────────────────────────────────────────

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
function mix(a, b, t) {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  const h = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${h(r1, r2)}${h(g1, g2)}${h(b1, b2)}`;
}

// ── Schichten je Biom ─────────────────────────────────────────────────────
// factor: Anteil der Kamerabewegung (klein = weit weg), tint: 0 = Hintergrundfarbe, 1 = Akzentfarbe

// Die Figur steht meist auf Bildhöhe ≈ 145 (die Kamera hält sie in der Mitte): Dort liegt der "Horizont",
// die Bodenlinien (base) der Schichten sitzen knapp darunter, damit ihre Spitzen über den Boden ragen.
const LAYERS = {
  meadow: [
    { type: 'clouds', factor: 0.04, y: 30, count: 4, period: 900, tint: 0.3, drift: 0.05 },
    { type: 'ridge', factor: 0.1, base: 112, amp: 32, period: 960, tint: 0.24 },
    { type: 'ridge', factor: 0.22, base: 132, amp: 24, period: 720, tint: 0.36 },
    { type: 'trees', factor: 0.36, base: 150, count: 12, period: 720, tint: 0.5 },
  ],
  ice: [
    { type: 'stars', factor: 0.02, count: 26, period: 700, tint: 0.6 },
    { type: 'peaks', factor: 0.08, base: 152, h0: 90, h1: 150, count: 5, period: 1000, tint: 0.22, cap: true },
    { type: 'peaks', factor: 0.2, base: 158, h0: 50, h1: 96, count: 7, period: 800, tint: 0.34, cap: true },
    { type: 'crystals', factor: 0.32, count: 9, period: 640, tint: 0.8 },
  ],
  factory: [
    { type: 'skyline', factor: 0.07, base: 152, h0: 40, h1: 110, count: 12, period: 960, tint: 0.18, windows: true },
    { type: 'gears', factor: 0.16, count: 3, period: 900, tint: 0.26 },
    { type: 'skyline', factor: 0.3, base: 160, h0: 30, h1: 70, count: 9, period: 720, tint: 0.34 },
  ],
  cave: [
    { type: 'stalac', factor: 0.08, from: 'top', len0: 50, len1: 110, count: 12, period: 860, tint: 0.2 },
    { type: 'stalac', factor: 0.16, from: 'bottom', base: 156, len0: 40, len1: 90, count: 9, period: 760, tint: 0.26 },
    { type: 'crystals', factor: 0.26, count: 10, period: 700, tint: 0.9 },
    { type: 'stalac', factor: 0.3, from: 'top', len0: 24, len1: 56, count: 11, period: 620, tint: 0.34 },
  ],
  sky: [
    { type: 'stars', factor: 0.02, count: 34, period: 800, tint: 0.8 },
    { type: 'clouds', factor: 0.05, y: 44, count: 4, period: 960, tint: 0.3, drift: 0.08 },
    { type: 'islands', factor: 0.13, count: 3, period: 1000, tint: 0.34 },
    { type: 'clouds', factor: 0.28, y: 118, count: 5, period: 800, tint: 0.42, drift: 0.16 },
  ],
};

// ── Formen, einmal je Biom erzeugt ────────────────────────────────────────

const shapeCache = new Map();

function shapesFor(biome, layer, index) {
  const key = `${biome}:${index}`;
  if (shapeCache.has(key)) return shapeCache.get(key);
  const rng = createRng(`parallax:${biome}`, `layer:${index}`);
  const n = layer.count || 0;
  let data;
  switch (layer.type) {
    case 'ridge': {
      // Summe dreier Sinuswellen mit ganzzahliger Periodenzahl → nahtlos wiederholbar
      data = [1, 2, 3].map((k) => ({ k: k + rng.intRange(0, 1) * 2, ph: rng.range(0, TAU), a: [0.55, 0.3, 0.15][k - 1] }));
      break;
    }
    case 'trees':
    case 'crystals':
    case 'stars':
      data = Array.from({ length: n }, () => ({ x: rng.range(0, layer.period), s: rng.range(0.6, 1.4), y: rng.range(0, 1), ph: rng.range(0, TAU) }));
      break;
    case 'peaks':
    case 'skyline':
    case 'stalac':
      data = Array.from({ length: n }, (_, i) => ({
        x: (i + rng.range(0.1, 0.9)) * (layer.period / n), w: rng.range(0.6, 1.5), h: rng.range(layer.h0 ?? layer.len0, layer.h1 ?? layer.len1), ph: rng.range(0, 1),
      }));
      break;
    case 'clouds':
      data = Array.from({ length: n }, (_, i) => ({ x: (i + rng.range(0, 1)) * (layer.period / n), y: layer.y + rng.range(-16, 16), w: rng.range(50, 110), s: rng.range(0.7, 1.3) }));
      break;
    case 'islands':
      data = Array.from({ length: n }, (_, i) => ({ x: (i + rng.range(0.2, 0.8)) * (layer.period / n), y: rng.range(30, 110), w: rng.range(70, 130) }));
      break;
    case 'gears':
      data = Array.from({ length: n }, (_, i) => ({ x: (i + rng.range(0.3, 0.7)) * (layer.period / n), y: rng.range(50, 130), r: rng.range(34, 64), dir: i % 2 ? 1 : -1 }));
      break;
    default:
      data = [];
  }
  shapeCache.set(key, data);
  return data;
}

// ── Zeichnen ──────────────────────────────────────────────────────────────

/**
 * @param ctx      2D-Kontext (Bildschirmkoordinaten in Gerätepixeln, ohne Transformation)
 * @param biome    Biom-ID
 * @param palette  Palette des Bioms
 * @param scale    Geräte-Pixel pro Weltpixel
 * @param camX,camY  Kamera (Weltpixel)
 * @param tick     Sim-Tick (für Bewegung und Funkeln)
 */
export function drawParallax(ctx, biome, palette, scale, camX, camY, tick) {
  const layers = LAYERS[biome] || LAYERS.meadow;
  layers.forEach((layer, index) => {
    const data = shapesFor(biome, layer, index);
    const color = mix(palette.bg, layer.type === 'crystals' || layer.type === 'stars' ? palette.accent : mix(palette.far, palette.tileTop, 0.5), layer.tint);
    const offX = camX * layer.factor;
    const offY = camY * layer.factor * 0.45;
    const P = layer.period;
    // Alle Wiederholungen, die im Bild liegen
    const k0 = Math.floor(offX / P) - 0;
    const k1 = Math.ceil((offX + VIEW_W) / P);
    const X = (x, k) => (x + k * P - offX) * scale;
    const Y = (y) => (y - offY) * scale;
    ctx.fillStyle = color;
    ctx.globalAlpha = 1;

    for (let k = k0; k <= k1; k++) {
      switch (layer.type) {
        case 'ridge': {
          ctx.beginPath();
          ctx.moveTo(X(0, k), VIEW_H * scale + 200);
          for (let x = 0; x <= P; x += 12) {
            let h = 0;
            for (const w of data) h += w.a * Math.sin((x / P) * TAU * w.k + w.ph);
            ctx.lineTo(X(x, k), Y(layer.base - h * layer.amp));
          }
          ctx.lineTo(X(P, k), VIEW_H * scale + 200);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'peaks':
          for (const s of data) {
            const w = 90 * s.w;
            ctx.beginPath();
            ctx.moveTo(X(s.x - w, k), Y(layer.base));
            ctx.lineTo(X(s.x, k), Y(layer.base - s.h));
            ctx.lineTo(X(s.x + w, k), Y(layer.base));
            ctx.closePath();
            ctx.fill();
            if (layer.cap) {
              ctx.fillStyle = mix(color, palette.accent, 0.35);
              ctx.beginPath();
              ctx.moveTo(X(s.x - w * 0.28, k), Y(layer.base - s.h * 0.72));
              ctx.lineTo(X(s.x, k), Y(layer.base - s.h));
              ctx.lineTo(X(s.x + w * 0.28, k), Y(layer.base - s.h * 0.72));
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = color;
            }
          }
          break;
        case 'skyline':
          for (const s of data) {
            const w = 26 * s.w;
            ctx.fillRect(X(s.x, k), Y(layer.base - s.h), w * scale, s.h * scale + 60 * scale);
            if (s.ph > 0.6) ctx.fillRect(X(s.x + w * 0.4, k), Y(layer.base - s.h - 22), 5 * scale, 22 * scale);   // Schornstein
            if (layer.windows) {
              ctx.fillStyle = mix(color, palette.accent, 0.3);
              for (let wy = 8; wy < s.h - 4; wy += 14) {
                if (((wy * 7 + s.x) | 0) % 3 === 0) ctx.fillRect(X(s.x + 5, k), Y(layer.base - s.h + wy), 3 * scale, 4 * scale);
              }
              ctx.fillStyle = color;
            }
          }
          break;
        case 'stalac':
          for (const s of data) {
            const w = 14 * s.w;
            ctx.beginPath();
            if (layer.from === 'top') {
              ctx.moveTo(X(s.x - w, k), Y(-40));
              ctx.lineTo(X(s.x, k), Y(-40 + s.h + 40));
              ctx.lineTo(X(s.x + w, k), Y(-40));
            } else {
              const floor = layer.base ?? 156;   // Stalagmiten wachsen vom Horizont nach oben
              ctx.moveTo(X(s.x - w, k), Y(floor + 40));
              ctx.lineTo(X(s.x, k), Y(floor - s.h));
              ctx.lineTo(X(s.x + w, k), Y(floor + 40));
            }
            ctx.closePath();
            ctx.fill();
          }
          break;
        case 'gears':
          for (const s of data) {
            const cx = X(s.x, k);
            const cy = Y(s.y);
            const r = s.r * scale;
            const rot = (tick / 120) * 0.35 * s.dir;
            ctx.beginPath();
            for (let i = 0; i < 24; i++) {
              const a = rot + (i / 24) * TAU;
              const rr = i % 2 ? r * 0.86 : r;
              ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            }
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = palette.bg;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.28, 0, TAU);
            ctx.fill();
            ctx.fillStyle = color;
          }
          break;
        case 'clouds':
          for (const s of data) {
            const x = s.x + (tick / 120) * layer.drift * 60;
            const wx = ((x % P) + P) % P;
            const cy = Y(s.y);
            const cx = X(wx, k);
            const w = s.w * scale;
            ctx.fillRect(cx, cy, w, 9 * scale * s.s);
            ctx.fillRect(cx + w * 0.15, cy - 7 * scale * s.s, w * 0.5, 9 * scale * s.s);
            ctx.fillRect(cx + w * 0.5, cy - 4 * scale * s.s, w * 0.35, 6 * scale * s.s);
          }
          break;
        case 'islands':
          for (const s of data) {
            const bob = Math.sin(tick / 120 * 0.6 + s.x) * 3;
            const cx = X(s.x, k);
            const cy = Y(s.y + bob);
            const w = s.w * scale;
            ctx.fillStyle = mix(color, palette.tileTop, 0.4);
            ctx.fillRect(cx, cy, w, 6 * scale);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(cx, cy + 6 * scale);
            ctx.lineTo(cx + w, cy + 6 * scale);
            ctx.lineTo(cx + w * 0.5, cy + 6 * scale + w * 0.34);
            ctx.closePath();
            ctx.fill();
          }
          break;
        case 'trees':
          for (const s of data) {
            const cx = X(s.x, k);
            const by = Y(layer.base);
            const h = 40 * s.s * scale;
            ctx.beginPath();
            ctx.moveTo(cx - 11 * s.s * scale, by);
            ctx.lineTo(cx, by - h);
            ctx.lineTo(cx + 11 * s.s * scale, by);
            ctx.closePath();
            ctx.fill();
          }
          break;
        case 'crystals':
        case 'stars':
          for (const s of data) {
            const tw = 0.5 + 0.5 * Math.sin(tick / 120 * 2 + s.ph * 6);
            ctx.globalAlpha = layer.type === 'stars' ? 0.35 + 0.5 * tw : 0.25 + 0.4 * tw;
            const cx = X(s.x, k);
            const cy = Y(s.y * (layer.type === 'stars' ? 145 : 125) + 8);
            if (layer.type === 'stars') {
              ctx.fillRect(cx, cy, 1.5 * scale * s.s, 1.5 * scale * s.s);
            } else {
              const r = 5 * s.s * scale;
              ctx.beginPath();
              ctx.moveTo(cx, cy - r * 1.6);
              ctx.lineTo(cx + r, cy);
              ctx.lineTo(cx, cy + r * 1.6);
              ctx.lineTo(cx - r, cy);
              ctx.closePath();
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }
          break;
        default:
      }
    }
  });
}

/** Kleine Zufallsteilchen der Luft je Biom: [Farbe, vx, vy, Größe, Rate pro Sekunde] */
export const AMBIENT = {
  meadow: { color: '#e8f5c8', vx: [4, 14], vy: [-6, 4], size: [1, 1.6], rate: 2.2, sway: 8 },
  ice: { color: '#eaf7ff', vx: [-8, 6], vy: [14, 30], size: [1, 2], rate: 7, sway: 10 },
  factory: { color: '#f0b94a', vx: [-6, 6], vy: [-40, -14], size: [1, 1.8], rate: 3.2, sway: 4 },
  cave: { color: '#b592e0', vx: [-5, 5], vy: [-8, 6], size: [1, 1.8], rate: 2.6, sway: 6 },
  sky: { color: '#dfe8ff', vx: [-90, -50], vy: [-4, 4], size: [1, 1.4], rate: 3.5, sway: 0, streak: true },
};
