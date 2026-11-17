// Das leere Raster — je nach Grundstoff des Welttyps.
//
// Bis Phase 2 begann jede Welt als massiver Fels, aus dem gegraben wurde. Für Höhlen, Türme und
// Fabriken ist das richtig. Für das Himmelsreich ist es falsch herum: Dort ist der Abgrund der
// Normalfall, und ein Generator, der erst alles zumauert und dann 95 % wieder wegräumt, beschreibt
// die Welt nicht, sondern kämpft gegen sie.

import { ROCK, AIR } from '../../v2/terrain.js';

/**
 * @param {number} width
 * @param {number} height
 * @param {'fels'|'luft'} grundstoff
 * @returns {string[][]}
 */
export function neuesRaster(width, height, grundstoff) {
  const fuellung = grundstoff === 'luft' ? AIR : ROCK;
  return Array.from({ length: height }, () => new Array(width).fill(fuellung));
}
