// Alle Chunk-Templates. Ein neuer Chunk gehört in eine der Dateien hier (Thema wählen) — er wird
// automatisch mitgezogen. Die Reihenfolge ist egal, aber die IDs müssen eindeutig sein.
import { SPECIAL } from './special.js';
import { BASIC } from './basic.js';
import { MECHANICS } from './mechanics.js';
import { HAZARDS } from './hazards.js';
import { COMBOS } from './combos.js';

export const SPECIAL_CHUNKS = Object.fromEntries(SPECIAL.map((c) => [c.special, c]));

/** Alle würfelbaren Chunks (ohne Start/Checkpoint/Ziel) */
export const CHUNKS = [...BASIC, ...MECHANICS, ...HAZARDS, ...COMBOS];

export const CHUNK_BY_ID = Object.fromEntries([...SPECIAL, ...CHUNKS].map((c) => [c.id, c]));
