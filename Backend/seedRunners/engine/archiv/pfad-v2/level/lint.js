// Warnungen zu einem (gültigen) Level: Dinge, die legal sind, aber meist ein Versehen. Sie blockieren
// nichts — der Editor zeigt sie an, der Server liefert sie mit der Prüfung zurück.
//
// Ob ein Level schaffbar ist, sagt das NICHT: Das beweist erst der Verifizierungslauf des Erstellers.

import { TILE_GLYPHS, isSolidKind } from '../sim/glyphs.js';
import { CHANNELS } from '../sim/elements/schema.js';

const HAZARDS = new Set(['spike', 'saw', 'laser', 'fallingBlock']);
// So nah an Start oder Checkpoint darf nichts Tödliches sitzen, ohne dass es auffällt (wie im Generator)
const SPAWN_SAFE_TILES = 4;
// Ab dieser Breite erwartet man Checkpoints
const CHECKPOINT_WIDTH = 200;

/**
 * @param {object} doc  kanonisches Dokument
 * @returns {{ code: string, message: string, tx?: number, ty?: number }[]}
 */
export function lintDoc(doc) {
  const out = [];
  const warn = (code, message, tx, ty) => out.push(tx === undefined ? { code, message } : { code, message, tx, ty });
  const { width, height, tiles, elements } = doc;

  const at = (x, y) => (x >= 0 && x < width && y >= 0 && y < height ? tiles[y][x] : '.');
  const groundBelow = (x, y) => {
    const ch = at(x, y + 1);
    return ch === '=' || isSolidKind(TILE_GLYPHS[ch]);
  };

  const spawns = [];
  let checkpoints = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = tiles[y][x];
      if (ch !== 'S' && ch !== 'C') continue;
      spawns.push({ tx: x, ty: y });
      if (ch === 'C') checkpoints++;
      if (!groundBelow(x, y)) {
        warn(ch === 'S' ? 'startFloating' : 'checkpointFloating',
          ch === 'S' ? 'Der Startpunkt hat keinen Boden — die Figur fällt sofort.' : 'Ein Checkpoint hat keinen Boden — man fällt nach dem Respawn.', x, y);
      }
    }
  }

  for (const e of elements) {
    if (HAZARDS.has(e.type)) {
      const near = spawns.some((s) => Math.abs(e.tx - s.tx) <= SPAWN_SAFE_TILES && Math.abs(e.ty - s.ty) <= SPAWN_SAFE_TILES);
      if (near) warn('hazardNearSpawn', 'Eine Gefahr sitzt dicht an Start oder Checkpoint — beim Respawn droht ein Sofort-Tod.', e.tx, e.ty);
    }
    if (e.path) {
      const outside = e.path.some(([dx, dy]) => {
        const x = e.tx + dx;
        const y = e.ty + dy;
        return x < 0 || y < 0 || x >= width || y >= height;
      });
      if (outside) warn('pathOutside', 'Der Pfad verlässt das Level.', e.tx, e.ty);
    }
  }

  // Schalter und Farbblöcke je Kanal
  for (let c = 0; c < CHANNELS; c++) {
    const switches = elements.filter((e) => e.type === 'switch' && e.channel === c);
    const blocks = elements.filter((e) => e.type === 'colorBlock' && e.channel === c);
    if (blocks.length && !switches.length) warn('blocksWithoutSwitch', `Farbblöcke auf Kanal ${c + 1}, aber kein Schalter dafür.`, blocks[0].tx, blocks[0].ty);
    if (switches.length && !blocks.length) warn('switchWithoutBlocks', `Ein Schalter auf Kanal ${c + 1} schaltet nichts.`, switches[0].tx, switches[0].ty);
  }

  // Türen (zusammenhängende Blöcke sind EINE Tür) gegen Schlüssel
  const doors = elements.filter((e) => e.type === 'door');
  const keys = elements.filter((e) => e.type === 'key').length;
  if (doors.length) {
    const seen = new Set();
    let groups = 0;
    for (const d of doors) {
      if (seen.has(d)) continue;
      groups++;
      const stack = [d];
      seen.add(d);
      while (stack.length) {
        const cur = stack.pop();
        for (const o of doors) {
          if (!seen.has(o) && Math.abs(o.tx - cur.tx) + Math.abs(o.ty - cur.ty) === 1) {
            seen.add(o);
            stack.push(o);
          }
        }
      }
    }
    if (groups > keys) warn('doorsWithoutKeys', `${groups} Türen, aber nur ${keys} Schlüssel — nicht jede lässt sich öffnen.`, doors[0].tx, doors[0].ty);
  }
  if (keys && !doors.length) warn('keysWithoutDoors', 'Es gibt Schlüssel, aber keine Tür.');

  if (width >= CHECKPOINT_WIDTH && checkpoints === 0) warn('noCheckpoints', 'Ein so langes Level ohne Checkpoint ist sehr hart.');

  return out;
}
