// Farbblock: gehört zu einem KANAL (0–3) und ist fest, solange der Schalter dieses Kanals auf `solidWhen`
// (0 oder 1) steht. Kanal 0 ist das alte Rot/Blau: rot = solidWhen 0, blau = solidWhen 1 (Glyphen R und B).
// Wird ein Block fest, während der Spieler darin steht, wartet er, bis dieser frei ist — man
// wird nie in einen Block eingemauert.
import { TILE, PLAYER_W, PLAYER_H } from '../config.js';
import { overlapRect } from './util.js';

export default {
  type: 'colorBlock',
  save: ['on'],

  create(spec, world) {
    const channel = spec.channel ? spec.channel | 0 : 0;
    const solidWhen = (spec.solidWhen !== undefined ? spec.solidWhen : spec.color) ? 1 : 0;
    return {
      type: 'colorBlock', tx: spec.tx, ty: spec.ty, channel, solidWhen,
      x: spec.tx * TILE, y: spec.ty * TILE, w: TILE, h: TILE,
      on: ((world.flags.sw >> channel) & 1) === solidWhen,
    };
  },

  pre(el, world) {
    const want = ((world.flags.sw >> el.channel) & 1) === el.solidWhen;
    if (!want) {
      el.on = false;
    } else if (!el.on) {
      const p = world.player;
      if (!overlapRect(p.x, p.y, PLAYER_W, PLAYER_H, el.x, el.y, el.w, el.h)) el.on = true;
    }
  },

  solids(el, out) {
    if (el.on) out.push({ x: el.x, y: el.y, w: el.w, h: el.h, owner: el.i });
  },
};
