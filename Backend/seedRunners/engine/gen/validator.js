// Prüfung eines fertigen Levels. Läuft nach jeder Generierung (in Tests über tausende Seeds) und
// kann auch zur Laufzeit als Sicherheitsnetz benutzt werden.
//
// Was geprüft wird — und was nicht:
//   · Aufbau: Raster lässt sich parsen, Start/Ziel sind da, Elemente verlinken (Portale, Türen)
//   · Übergänge: an jedem Chunk-Wechsel liegen Boden und Höhe exakt übereinander
//   · Lücken: jede Lücke ist breiter als nichts, aber nicht breiter, als die GEMESSENE Reichweite
//     der Tempo-Klasse für die Schwierigkeit des Chunks erlaubt (siehe SAFETY im Generator)
//   · Spawn-Sicherheit: keine Gefahr in der Nähe von Start und Checkpoints
//   · Plausibilität der Elemente
// NICHT geprüft wird, ob die Elemente im Inneren eines Chunks im Zusammenspiel schaffbar sind —
// das ist die Aufgabe des Suchlaufs (gen/solver.js), der jeden Chunk einmal durchspielt.

import { parseMap } from '../sim/tilemap.js';
import { createWorld } from '../sim/world.js';
import { TILE } from '../sim/config.js';
import { reachForClass } from '../sim/reach.js';
import { SAFETY } from './generator.js';

const HAZARDS = new Set(['spike', 'saw', 'laser', 'fallingBlock']);
const NEEDS_AIR = new Set(['spike', 'spring', 'ring', 'crystal', 'key', 'switch', 'portal', 'saw', 'crumble', 'fallingBlock']);
const SPAWN_SAFE_TILES = 4;

export function validateLevel(level) {
  const errors = [];
  const say = (msg) => errors.push(msg);

  let map;
  try {
    map = parseMap(level.rows, { entities: level.entities, checkpointOrder: level.checkpointOrder });
    createWorld(map);   // verlinkt Portale/Türen, wirft bei Unstimmigkeiten
  } catch (e) {
    return [`Level lässt sich nicht laden: ${e.message}`];
  }

  if (map.finish.length === 0) say('kein Ziel');
  const wantedCheckpoints = level.placements.filter((p) => p.kind === 'checkpoint').length;
  if (map.checkpoints.length !== wantedCheckpoints) say(`${map.checkpoints.length} Checkpoints im Raster, ${wantedCheckpoints} eingeplant`);

  // Übergänge
  const solidAt = (x, y) => y >= 0 && y < map.h && map.solid[y * map.w + x] === 1;
  level.placements.forEach((p, i) => {
    const entryRow = p.dy + p.entry;
    const exitRow = p.dy + p.exit;
    if (i > 0) {
      const prev = level.placements[i - 1];
      if (prev.dy + prev.exit !== entryRow) say(`Chunk ${i} (${p.id}): Eingangshöhe passt nicht zum Vorgänger`);
    }
    for (const [x, row] of [[p.x0, entryRow], [p.x0 + 1, entryRow], [p.x0 + p.w - 2, exitRow], [p.x0 + p.w - 1, exitRow]]) {
      if (!solidAt(x, row) || solidAt(x, row - 1)) say(`Chunk ${i} (${p.id}): Übergang bei Spalte ${x} ist kein ebener Boden`);
    }
  });

  // Lücken gegen die Reichweite der Klasse
  const reach = reachForClass(level.params.speedClass);
  for (const p of level.placements) {
    for (const g of p.gaps || []) {
      const limit = SAFETY[p.difficulty] * reach.gap[g.reach];
      if (g.width > limit + 1e-9) {
        say(`Chunk ${p.index} (${p.id}): Lücke ${g.width} > ${limit.toFixed(1)} (${g.reach}, Schwierigkeit ${p.difficulty}, ${level.params.speedClass})`);
      }
    }
  }

  // Spawn-Sicherheit: nichts Tödliches nahe Start und Checkpoints
  const spawns = [map.start, ...map.checkpoints];
  for (const e of map.entities) {
    if (!HAZARDS.has(e.type)) continue;
    for (const s of spawns) {
      if (Math.abs(e.tx - s.tx) <= SPAWN_SAFE_TILES && Math.abs(e.ty - s.ty) <= SPAWN_SAFE_TILES) {
        say(`${e.type} bei (${e.tx}, ${e.ty}) liegt zu nah am Spawn (${s.tx}, ${s.ty})`);
      }
    }
  }

  // Elemente in festen Blöcken, außerhalb der Karte
  for (const e of map.entities) {
    if (NEEDS_AIR.has(e.type) && solidAt(e.tx, e.ty)) say(`${e.type} bei (${e.tx}, ${e.ty}) steckt in einem festen Block`);
  }

  // Schalter je Chunk gerade
  for (const p of level.placements) {
    const inChunk = map.entities.filter((e) => e.type === 'switch' && e.tx >= p.x0 && e.tx < p.x0 + p.w).length;
    if (inChunk % 2 !== 0) say(`Chunk ${p.index} (${p.id}): ungerade Zahl Schalter`);
  }

  // Größe
  if (map.w * TILE > 60000) say('Level ist unvernünftig breit');
  return errors;
}
