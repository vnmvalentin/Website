// Boost-Ring: wer hindurchfliegt, bekommt Tempo in Richtung des Rings (`dir`, 8 Richtungen),
// dazu den Luftsprung zurück. Danach ist der Ring kurz verbraucht. KEIN Dash mehr (seit 23.09.2026
// nur noch über Dash-Kristalle, siehe crystal.js).
import { TILE, DIAG } from '../config.js';
import { ticks, param, now, playerCenter } from './util.js';

const DIRS = {
  right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1],
  upRight: [DIAG, -DIAG], upLeft: [-DIAG, -DIAG], downRight: [DIAG, DIAG], downLeft: [-DIAG, DIAG],
};

export default {
  type: 'ring',
  save: ['cd'],

  create(spec) {
    return {
      type: 'ring', tx: spec.tx, ty: spec.ty,
      x: (spec.tx + 0.5) * TILE, y: (spec.ty + 0.5) * TILE,
      r: param(spec, 'ring', 'radius'),
      dir: DIRS[spec.dir] ? spec.dir : 'right',
      cd: 0,
      cooldownTicks: ticks(param(spec, 'ring', 'cooldown')),
    };
  },

  pre(el) {
    if (el.cd > 0) el.cd--;
  },

  post(el, world) {
    if (el.cd > 0) return;
    const c = playerCenter(world);
    const dx = c.x - el.x;
    const dy = c.y - el.y;
    // Etwas großzügiger als der gezeichnete Ring: Er soll beim Durchfliegen nicht knapp verfehlt werden
    const reach = el.r + 4;
    if (dx * dx + dy * dy > reach * reach) return;

    const p = world.player;
    const { cfg } = world;
    const [ux, uy] = DIRS[el.dir];
    p.vx = ux * cfg.ringSpeed;
    p.vy = uy * cfg.ringSpeed;
    p.dashTimer = 0;
    p.grapple = null;
    p.jumping = false;
    p.airJumps = cfg.airJumps;
    el.cd = el.cooldownTicks;
    world.emit('ring', { x: el.x, y: el.y, dir: el.dir, tick: now(world) });
  },
};
