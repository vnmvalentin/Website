// Schlüssel: wird beim Berühren aufgenommen und öffnet später eine Tür (siehe door.js).
// Ein Checkpoint sichert, ob man ihn schon hat — stirbt man davor, liegt er wieder da.
import { TILE, PLAYER_W, PLAYER_H } from '../config.js';
import { circleHitsRect } from './util.js';

export default {
  type: 'key',
  save: ['taken'],

  create(spec) {
    return {
      type: 'key', tx: spec.tx, ty: spec.ty,
      x: (spec.tx + 0.5) * TILE, y: (spec.ty + 0.5) * TILE, r: 7,
      taken: false,
    };
  },

  post(el, world) {
    if (el.taken) return;
    const p = world.player;
    if (!circleHitsRect(el.x, el.y, el.r, p.x, p.y, PLAYER_W, PLAYER_H)) return;
    el.taken = true;
    world.flags.keys++;
    world.emit('key', { x: el.x, y: el.y });
  },
};
