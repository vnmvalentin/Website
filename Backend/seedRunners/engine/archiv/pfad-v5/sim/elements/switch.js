// Schalter: schaltet bei Berührung alle Farbblöcke SEINES KANALS (0–3) um. Der Zustand aller Kanäle steht als
// Bitmaske in `world.flags.sw` (Bit c = Kanal c) und wandert mit den Checkpoints. Kanal 0 verhält sich
// wie der frühere einzige Rot/Blau-Schalter: `sw` ist dann 0 oder 1.
import { TILE, PLAYER_W, PLAYER_H } from '../config.js';
import { ticks, param, overlapRect } from './util.js';

export default {
  type: 'switch',
  save: ['cd'],

  create(spec) {
    return {
      type: 'switch', tx: spec.tx, ty: spec.ty,
      x: spec.tx * TILE + 2, y: spec.ty * TILE + 2, w: TILE - 4, h: TILE - 4,
      channel: spec.channel ? spec.channel | 0 : 0,
      cd: 0,
      cooldownTicks: ticks(param(spec, 'switch', 'cooldown')),
    };
  },

  pre(el) {
    if (el.cd > 0) el.cd--;
  },

  post(el, world) {
    const p = world.player;
    if (el.cd > 0 || !overlapRect(p.x, p.y, PLAYER_W, PLAYER_H, el.x, el.y, el.w, el.h)) return;
    world.flags.sw ^= 1 << el.channel;
    el.cd = el.cooldownTicks;
    world.emit('switch', { channel: el.channel, state: (world.flags.sw >> el.channel) & 1 });
  },
};
