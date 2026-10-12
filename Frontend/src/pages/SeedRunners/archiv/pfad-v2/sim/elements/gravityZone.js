// Gravitations-Umkehr-Zone: Solange die Mitte des Spielers im Rechteck ist, zeigt die Schwerkraft
// nach oben (`p.gd = -1`). Die Decke wird zum Boden, Sprung, Wandrutschen und Landen spiegeln
// sich mit. Beim Verlassen der Zone gilt sofort wieder die normale Schwerkraft; das Tempo bleibt.
import { TILE } from '../config.js';
import { playerCenter } from './util.js';

export default {
  type: 'gravityZone',

  create(spec) {
    return {
      type: 'gravityZone', tx: spec.tx, ty: spec.ty,
      x: spec.tx * TILE, y: spec.ty * TILE,
      w: (spec.w || 4) * TILE, h: (spec.h || 6) * TILE,
    };
  },

  pre(el, world) {
    const c = playerCenter(world);
    if (c.x >= el.x && c.x < el.x + el.w && c.y >= el.y && c.y < el.y + el.h) world.player.gd = -1;
  },
};
