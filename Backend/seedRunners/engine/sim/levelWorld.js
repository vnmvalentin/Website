// Baut die spielbare Welt zu einem Level — für prozedurale Level (gen/generator.js) und für Level aus dem Editor
// (level/format.js) gleichermaßen. Ein Level ist hier nur das, was die Engine liest:
//   { rows, entities, params: { speedClass } }
// Die Tempo-Klasse des Levels bestimmt die Bewegungswerte; `opts.tuning` (z.B. aus dem Dev-Panel) überschreibt einzelne davon.
// Liegt in sim/, weil der Server genau diese Funktion beim Nachspielen benutzt (Replay-Prüfung).
import { parseMap } from './tilemap.js';
import { createWorld } from './world.js';
import { classTuning } from './classes.js';

/**
 * @param {{ rows: string[], entities: object[], params: { speedClass: string } }} level
 * @param {{ tuning?: object, emit?: (type: string, data: object) => void }} [opts]
 */
export function createLevelWorld(level, opts = {}) {
  const tuning = { ...classTuning(level.params.speedClass), ...(opts.tuning || {}) };
  const map = parseMap(level.rows, { entities: level.entities, checkpointOrder: level.checkpointOrder });
  return createWorld(map, { tuning, emit: opts.emit });
}
