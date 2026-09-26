// Öffentliche Schnittstelle des Level-Generators.

export {
  generateLevel, generateSingle, normalizeParams, dailyParams, hashLevel, LENGTHS, CHECKPOINT_EVERY, SAFETY, LEVEL_VERSION,
  GEN_PFAD, PFAD_TAGESRENNEN_AB,
} from './generator.js';
import { generateLevel, normalizeParams, GEN_PFAD } from './generator.js';
import { generateWorld } from './world/generate.js';

/**
 * Parameter für generateWorld() zu Runden-Parametern mit `gen: 'pfad'` (sonst null): lang, „super“, Stufe 3, nur Pfad.
 * Browser (Worker) und Server-Prüfung erzeugen damit dasselbe Level.
 */
export function weltParams(raw) {
  const p = normalizeParams(raw);
  if (p.gen !== GEN_PFAD) return null;
  return { seed: p.seed, length: 'long', speedClass: 'super', biome: p.biome, difficulty: 3, worldType: 'pfad' };
}

/** Das Level zu Runden-Parametern — Pfad (gen: 'pfad') oder Chunk-Generator v1. Einziger Einstieg für Live-Runden. */
export function levelFuerParams(raw) {
  const w = weltParams(raw);
  return w ? generateWorld(w) : generateLevel(normalizeParams(raw));
}
export { validateLevel } from './validator.js';
export { BIOMES, BIOME_IDS } from './biomes.js';
export { CHUNKS, CHUNK_BY_ID } from './chunks/index.js';

// Die Welt zu einem Level: gleiche Funktion für prozedurale und Editor-Level, liegt in sim/ (siehe dort).
export { createLevelWorld } from '../sim/levelWorld.js';
