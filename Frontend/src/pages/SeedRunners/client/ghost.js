// Geister: Ein Geist ist ein zweiter Läufer, der ein gespeichertes Input-Log abspielt — in einer EIGENEN Welt, unabhängig vom
// Spieler (eigene Elemente, eigener Stand). Weil die Sim deterministisch ist, läuft er dabei exakt die Strecke von damals, samt
// Toden und Neustarts, ohne dass der Server etwas übertragen müsste außer dem Log.
//
// Geister sind reine Darstellung und beeinflussen den Lauf des Spielers nie: Sie berühren seine Welt nicht.
import { createLevelWorld } from '../sim/levelWorld.js';
import { stepWorld } from '../sim/world.js';
import { createReplay } from '../sim/replay.js';

/**
 * @param {object} level  das Level, auf dem das Log gelaufen ist (Engine-Level, z. B. aus docToLevel)
 * @param {number[]} log  Input-Log [tick, maske, …]
 * @param {{ name?: string, color?: string, ticks?: number }} [meta]  ticks: Zielzeit des Laufs; der Geist steht nach dem Ziel still
 */
export function createGhost(level, log, meta = {}) {
  return {
    world: createLevelWorld(level),
    maskAt: createReplay(log),
    name: meta.name || '',
    color: meta.color || '#fbbf24',
    maxTicks: Number.isFinite(meta.ticks) ? meta.ticks + 1 : Infinity,
    finished: false,
  };
}

/** Ein Tick weiter — im Gleichschritt mit der Welt des Spielers */
export function stepGhost(g) {
  if (g.finished) return;
  stepWorld(g.world, g.maskAt(g.world.tick));
  if (g.world.finished || g.world.tick >= g.maxTicks) g.finished = true;
}
