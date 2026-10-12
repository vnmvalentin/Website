// Bröckelnder Block: fest, solange niemand darauf steht. Wer draufsteht, löst einen Countdown aus,
// danach verschwindet der Block und kommt nach einer Weile zurück — sofern dort niemand steht.
import { TILE, PLAYER_W, PLAYER_H } from '../config.js';
import { ticks, param, overlapRect } from './util.js';

const INTACT = 0;
const CRUMBLING = 1;
const GONE = 2;

export default {
  type: 'crumble',
  save: ['st', 't'],

  create(spec) {
    return {
      type: 'crumble', tx: spec.tx, ty: spec.ty,
      x: spec.tx * TILE, y: spec.ty * TILE, w: TILE, h: TILE,
      st: INTACT, t: 0,
      delayTicks: ticks(param(spec, 'crumble', 'delay')),
      respawnTicks: ticks(param(spec, 'crumble', 'respawn')),
    };
  },

  pre(el, world) {
    const p = world.player;
    if (el.st === INTACT) {
      if (p.onGround && p.supOwner === el.i) {
        el.st = CRUMBLING;
        el.t = el.delayTicks;
        world.emit('crumbleStart', { x: el.x, y: el.y });
      }
    } else if (el.st === CRUMBLING) {
      if (--el.t <= 0) {
        el.st = GONE;
        el.t = el.respawnTicks;
        world.emit('crumbleGone', { x: el.x, y: el.y });
      }
    } else if (--el.t <= 0 && !overlapRect(el.x, el.y, el.w, el.h, p.x, p.y, PLAYER_W, PLAYER_H)) {
      el.st = INTACT;
    }
  },

  solids(el, out) {
    if (el.st !== GONE) out.push({ x: el.x, y: el.y, w: el.w, h: el.h, owner: el.i });
  },
};
