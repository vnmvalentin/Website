// Öffentliche Schnittstelle des Level-Generators.

export {
  generateLevel, generateSingle, normalizeParams, dailyParams, hashLevel, LENGTHS, CHECKPOINT_EVERY, SAFETY, LEVEL_VERSION,
  GEN_PFAD, PFAD_TAGESRENNEN_AB, GEN_VERSION,
} from './generator.js';
import { generateLevel, normalizeParams, GEN_PFAD, GEN_VERSION } from './generator.js';
import { generateWorld } from './world/generate.js';

/**
 * Parameter für generateWorld() zu Runden-Parametern mit `gen: 'pfad'` (sonst null): lang, „super“, Stufe 3, nur Pfad.
 * Browser (Worker) und Server-Prüfung erzeugen damit dasselbe Level. `gv` sagt, WELCHE Generator-Version bauen muss
 * (client/generatorArchiv.js, Backend replay.js) — generateWorld selbst bekommt es nicht (ohneGv).
 */
export function weltParams(raw) {
  const p = normalizeParams(raw);
  if (p.gen !== GEN_PFAD) return null;
  return { seed: p.seed, length: 'long', speedClass: 'super', biome: p.biome, difficulty: 3, worldType: 'pfad', gv: p.gv };
}

/** weltParams ohne die Versionsangabe — so, wie generateWorld sie bekommt */
export function ohneGv(w) {
  const { gv: _gv, ...rest } = w;
  return rest;
}

/**
 * Das Level zu Runden-Parametern — Pfad (gen: 'pfad') oder Chunk-Generator v1. Baut nur mit der LAUFENDEN Generator-Version;
 * ältere Versionen kommen aus dem Archiv (asynchron: client/generatorArchiv.js, Backend replay.js) — hier eine alte Version
 * still mit dem neuen Generator zu bauen, ergäbe ein anderes Level.
 */
export function levelFuerParams(raw) {
  const w = weltParams(raw);
  if (!w) return generateLevel(normalizeParams(raw));
  if (w.gv !== GEN_VERSION) throw new Error(`Generator-Version ${w.gv} liegt im Archiv — levelFuerParams baut nur Version ${GEN_VERSION}`);
  return generateWorld(ohneGv(w));
}
export { validateLevel } from './validator.js';
export { BIOMES, BIOME_IDS } from './biomes.js';
export { CHUNKS, CHUNK_BY_ID } from './chunks/index.js';

// Die Welt zu einem Level: gleiche Funktion für prozedurale und Editor-Level, liegt in sim/ (siehe dort).
export { createLevelWorld } from '../sim/levelWorld.js';
