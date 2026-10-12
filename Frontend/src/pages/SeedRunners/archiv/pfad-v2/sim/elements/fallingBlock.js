// Fallender Block: hängt, bis jemand darunter durchläuft, wackelt kurz (Vorwarnung), stürzt ab,
// tötet, was er beim Fallen trifft, bleibt eine Weile liegen (dann ein normaler fester Block)
// und kehrt an seinen Platz zurück.
//
// Größe: `width` × `height` in Tiles (Standard 1 × 1). Ein breiter Block lässt sich nicht
// unterlaufen: Zwischen Auslösen und Aufprall vergehen Wackeln plus Fall, und in dieser Zeit
// schafft man nur wenige Tiles. Man löst ihn deshalb am Rand aus und weicht aus — der liegende
// Block ist dann Brücke, Stufe oder Mauer (`reset` bestimmt, wie lange er liegen bleibt).
// `margin` (px, Standard 6): wie weit neben dem Block das Auslösen schon greift. Große Werte geben
// Zeit zum Anhalten, bevor der Block fällt.
import { TILE, TICK_DT, PLAYER_W, PLAYER_H } from '../config.js';
import { rectHitsSolid, lineOfSight } from '../tilemap.js';
import { ticks, param, overlapRect, playerCenter } from './util.js';

const IDLE = 0;
const SHAKING = 1;
const FALLING = 2;
const LANDED = 3;

const hitsPlayer = (el, p) => overlapRect(el.x, el.y, el.bw, el.bh, p.x + 1, p.y + 1, PLAYER_W - 2, PLAYER_H - 2);

export default {
  type: 'fallingBlock',
  save: ['st', 't', 'y', 'vy'],

  create(spec) {
    return {
      type: 'fallingBlock', tx: spec.tx, ty: spec.ty,
      x: spec.tx * TILE, y: spec.ty * TILE, y0: spec.ty * TILE,
      bw: param(spec, 'fallingBlock', 'width') * TILE,
      bh: param(spec, 'fallingBlock', 'height') * TILE,
      margin: param(spec, 'fallingBlock', 'margin'),
      st: IDLE, t: 0, vy: 0,
      range: param(spec, 'fallingBlock', 'range') * TILE,
      shakeTicks: ticks(param(spec, 'fallingBlock', 'shake')),
      gravity: param(spec, 'fallingBlock', 'gravity'),
      maxSpeed: param(spec, 'fallingBlock', 'maxSpeed'),
      resetTicks: ticks(param(spec, 'fallingBlock', 'reset')),
    };
  },

  pre(el, world) {
    const p = world.player;

    if (el.st === IDLE) {
      const c = playerCenter(world);
      const below = p.y > el.y + el.bh - 2;
      const inColumn = p.x + PLAYER_W > el.x - el.margin && p.x < el.x + el.bw + el.margin;
      if (below && inColumn && p.y - (el.y + el.bh) <= el.range
        && lineOfSight(world.map, el.x + el.bw / 2, el.y + el.bh + 1, c.x, c.y)) {
        el.st = SHAKING;
        el.t = el.shakeTicks;
        world.emit('blockShake', { x: el.x, y: el.y, w: el.bw });
      }
    } else if (el.st === SHAKING) {
      if (--el.t <= 0) {
        el.st = FALLING;
        el.vy = 0;
      }
    } else if (el.st === FALLING) {
      el.vy = Math.min(el.vy + el.gravity * TICK_DT, el.maxSpeed);
      let dy = el.vy * TICK_DT;
      while (dy > 0) {
        const step = Math.min(dy, 6);
        dy -= step;
        if (rectHitsSolid(world.map, el.x, el.y + step, el.bw, el.bh)) {
          el.y = Math.floor((el.y + step + el.bh) / TILE) * TILE - el.bh;
          el.st = LANDED;
          el.t = el.resetTicks;
          el.vy = 0;
          world.emit('blockLand', { x: el.x, y: el.y, w: el.bw, h: el.bh });
          break;
        }
        el.y += step;
      }
      // Wer beim Sturz unter dem Block ist, wird erschlagen — auch beim Aufprall selbst
      if (hitsPlayer(el, p)) world.kill('falling');
    } else if (el.st === LANDED) {
      // Zurück an den Platz, sobald dort niemand steht
      if (--el.t <= 0 && !overlapRect(el.x, el.y0, el.bw, el.bh, p.x, p.y, PLAYER_W, PLAYER_H)) {
        el.y = el.y0;
        el.st = IDLE;
      }
    }
  },

  solids(el, out) {
    // Wackelnd bleibt er an seinem Platz; die Erschütterung ist nur Darstellung
    out.push({ x: el.x, y: el.y, w: el.bw, h: el.bh, owner: el.i });
  },
};
