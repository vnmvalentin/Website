// colorMath.js — Farbrechnung fürs Farb-Raten (ColorGuess.jsx): OKLab, Umfärben mit erhaltener Schattierung, Wertung.
// recolor() ist dieselbe Rechnung wie im Masken-Werkzeug Backend/clashRoyale/tools/cardFarbenBauen.cjs — beide
// Stellen gemeinsam ändern, sonst passt die Vorschau des Werkzeugs nicht mehr zum Spiel.

const LIN = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});
// linear 0..1 → sRGB-Byte als Tabelle (das Umfärben läuft bei jeder Reglerbewegung über zehntausende Pixel)
const GAMMA_N = 4095;
const GAMMA = Uint8Array.from({ length: GAMMA_N + 1 }, (_, i) => {
  const c = i / GAMMA_N;
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
});
const toByte = (c) => GAMMA[c <= 0 ? 0 : c >= 1 ? GAMMA_N : Math.round(c * GAMMA_N)];

/** sRGB (0..255) → OKLab [L, a, b] */
export function rgbToLab(r, g, b) {
  r = LIN[r]; g = LIN[g]; b = LIN[b];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → sRGB-Bytes, direkt nach out[o..o+2] geschrieben (kein Array je Pixel) */
function labToBytes(L, a, b, out, o) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  out[o] = toByte(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  out[o + 1] = toByte(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  out[o + 2] = toByte(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
}

/** HSL (h 0..360, s/l 0..100) → [r, g, b] 0..255 */
export function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)];
}

/** Farbe als OKLab mit Sättigung C und Farbton h (Bogenmaß) */
export function colorOf(rgb) {
  const [L, a, b] = rgbToLab(rgb[0], rgb[1], rgb[2]);
  return { L, a, b, C: Math.hypot(a, b), h: Math.atan2(b, a) };
}

/**
 * Farbfläche vorbereiten: aus den RGBA-Pixeln der Maske (Originalfarben, Alpha = Zugehörigkeit) die Liste der
 * betroffenen Pixel samt OKLab-Werten — einmal je Karte, damit das Umfärben danach nur noch rechnet.
 */
export function preparePatch(pixels) {
  let count = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count++;
  const index = new Uint32Array(count);
  const lab = new Float32Array(count * 3);
  let n = 0;
  for (let p = 0; p < pixels.length; p += 4) {
    if (pixels[p + 3] === 0) continue;
    const [L, a, b] = rgbToLab(pixels[p], pixels[p + 1], pixels[p + 2]);
    index[n] = p;
    lab[n * 3] = L; lab[n * 3 + 1] = a; lab[n * 3 + 2] = b;
    n++;
  }
  return { index, lab, count };
}

/**
 * Fläche von der Grundfarbe `target` auf `guess` umfärben; die Schattierung jedes Pixels bleibt erhalten:
 * Farbton wird gedreht, Sättigung skaliert, Helligkeit stückweise linear durch (0,0), (Ziel, Tipp), (1,1)
 * abgebildet. Ist guess = target, kommt exakt das Original heraus. Schreibt nur RGB nach out (Alpha bleibt).
 */
export function recolorPatch(patch, target, guess, out) {
  const { index, lab, count } = patch;
  const tl = Math.min(0.97, Math.max(0.03, target.L));
  const lo = guess.L / tl;
  const hi = (1 - guess.L) / (1 - tl);
  const k = guess.C / Math.max(target.C, 1e-4);
  const th = guess.h - target.h;
  const cs = k * Math.cos(th), sn = k * Math.sin(th);
  for (let n = 0; n < count; n++) {
    const L = lab[n * 3], a = lab[n * 3 + 1], b = lab[n * 3 + 2];
    labToBytes(L <= tl ? L * lo : 1 - (1 - L) * hi, a * cs - b * sn, a * sn + b * cs, out, index[n]);
  }
}

/** Fläche als Transparenz-Karo füllen (solange noch keine Farbe gewählt ist) */
export function checkerPatch(patch, width, out) {
  const { index, count } = patch;
  for (let n = 0; n < count; n++) {
    const px = index[n] >> 2;
    const v = (((px % width) >> 3) + (Math.floor(px / width) >> 3)) & 1 ? 214 : 158;
    out[index[n]] = v; out[index[n] + 1] = v; out[index[n] + 2] = v + 8;
  }
}

/** Farbabstand in OKLab (ΔE × 100): ~2 kaum sichtbar, ~10 klar andere Nuance, ab ~30 eine andere Farbe */
export function colorDistance(rgbA, rgbB) {
  const [l1, a1, b1] = rgbToLab(rgbA[0], rgbA[1], rgbA[2]);
  const [l2, a2, b2] = rgbToLab(rgbB[0], rgbB[1], rgbB[2]);
  return 100 * Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/**
 * Treffer in Prozent als Glockenkurve über den Farbabstand: nah dran lohnt sich, eine andere Farbe gibt fast
 * nichts (ΔE 3 → 98, 5 → 92, 8 → 78, 10 → 66, 15 → 37, 20 → 16, ab ~30 → 0). 1 ΔE Spielraum, weil die Regler
 * in ganzen Schritten laufen. Linear war zu gnädig: Blau statt Olivgrün gab noch 41 %.
 */
export function matchScore(rgbA, rgbB) {
  const d = Math.max(0, colorDistance(rgbA, rgbB) - 1);
  return Math.round(100 * Math.exp(-((d / 14) ** 2)));
}

export const rgbCss = (rgb) => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
