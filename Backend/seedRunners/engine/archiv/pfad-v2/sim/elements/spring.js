// Sprungpad: schleudert den Spieler, sobald er darauf landet oder darüber läuft.
// Füllt den Luftsprung auf. Dash NICHT (mehr) — Dash-Ladungen kommen ausschließlich von Dash-
// Kristallen (siehe crystal.js), seit der Rückmeldung vom 23.09.2026, dass ein überall frei
// nachladbarer Dash (Boden, Federn, Ringe) besonders im schnellen Tempo zu stark war.
//
// Richtung (`dir`):
//   up (Standard)       Bodenpad, Abstoß senkrecht nach oben
//   upLeft / upRight    Bodenpad, Abstoß schräg (45°) — trägt weit über Lücken
//   left / right        Wandpad an der Seite einer Wand, Abstoß seitlich mit etwas Auftrieb
//                       (`left` sitzt an der rechten Kachelkante und schiebt nach links)
import { TILE, DIAG } from '../config.js';
import { ticks, param, playerHits } from './util.js';

const PAD_HEIGHT = 6;
const DIRS = ['up', 'upLeft', 'upRight', 'left', 'right'];
// Seitliche Pads: so viel vom Abstoß geht nach oben
const SIDE_LIFT = 0.5;

function padRect(tx, ty, dir) {
  if (dir === 'left') return { x: (tx + 1) * TILE - PAD_HEIGHT, y: ty * TILE, w: PAD_HEIGHT, h: TILE };
  if (dir === 'right') return { x: tx * TILE, y: ty * TILE, w: PAD_HEIGHT, h: TILE };
  return { x: tx * TILE, y: (ty + 1) * TILE - PAD_HEIGHT, w: TILE, h: PAD_HEIGHT };
}

export default {
  type: 'spring',
  save: ['cd'],

  create(spec) {
    const dir = DIRS.includes(spec.dir) ? spec.dir : 'up';
    return {
      type: 'spring', tx: spec.tx, ty: spec.ty, dir,
      ...padRect(spec.tx, spec.ty, dir),
      cd: 0,
      cooldownTicks: ticks(param(spec, 'spring', 'cooldown')),
    };
  },

  pre(el) {
    if (el.cd > 0) el.cd--;
  },

  post(el, world) {
    if (el.cd > 0) return;
    const side = el.dir === 'left' || el.dir === 'right';
    if (!(side ? playerHits(world, el.x - 1, el.y, el.w + 2, el.h, 0) : playerHits(world, el.x, el.y - 1, el.w, el.h + 1, 0))) return;
    const p = world.player;
    const { cfg } = world;
    const s = cfg.springSpeed;
    if (el.dir === 'upLeft' || el.dir === 'upRight') {
      p.vx = (el.dir === 'upRight' ? 1 : -1) * s * DIAG;
      p.vy = -s * DIAG;
    } else if (side) {
      p.vx = (el.dir === 'right' ? 1 : -1) * s;
      p.vy = -s * SIDE_LIFT;
    } else {
      p.vy = -s;
    }
    p.gd = 1;
    p.jumping = false;
    p.coyote = 0;
    p.airJumps = cfg.airJumps;
    el.cd = el.cooldownTicks;
    world.emit('spring', { x: el.x, y: el.y, dir: el.dir });
  },
};
