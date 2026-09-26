// Einen aufgezeichneten Lauf an eine beliebige Stelle spulen. Die Sim kennt kein Zurückspulen — dafür baut
// `seekTo` die Welt einfach neu auf und spielt das Log von vorn bis zum Zieltick ab. Das ist schnell genug, um bei
// jeder Schieberegler-Bewegung neu zu rechnen (replay.js: rund 25 µs je Tick, siehe Backend/seedRunners/replay.js);
// für die Wiedergabe danach wird stattdessen normal vorwärts Tick für Tick weitergerechnet (siehe ReplayScrubber.jsx).
import { createLevelWorld } from '../sim/levelWorld.js';
import { stepWorld } from '../sim/world.js';
import { createReplay } from '../sim/replay.js';

/**
 * @param level       Engine-Level
 * @param log         Input-Log [tick, maske, …]
 * @param targetTick  gewünschter Tick (wird an 0 und das Ende des Laufs geklemmt)
 * @returns {{ world: object, maskAt: (tick:number) => number }}  `maskAt` steht auf `world.tick` — für die
 *   Wiedergabe reicht es danach, `stepWorld(world, maskAt(world.tick))` aufzurufen
 */
export function seekTo(level, log, targetTick) {
  const world = createLevelWorld(level);
  const maskAt = createReplay(log);
  const cap = Math.max(0, targetTick);
  for (let t = 0; t < cap && !world.finished; t++) stepWorld(world, maskAt(t));
  return { world, maskAt };
}
