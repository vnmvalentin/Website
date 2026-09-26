// Dash-Kristall: füllt die Dash-Ladung auf und ist danach eine Weile weg. Er wird nur
// eingesammelt, wenn der Dash wirklich fehlt — sonst fliegt man durch und er bleibt für später.
import { TILE, PLAYER_W, PLAYER_H } from '../config.js';
import { ticks, param, circleHitsRect } from './util.js';

export default {
  type: 'crystal',
  save: ['taken', 't'],

  create(spec) {
    return {
      type: 'crystal', tx: spec.tx, ty: spec.ty,
      x: (spec.tx + 0.5) * TILE, y: (spec.ty + 0.5) * TILE,
      r: param(spec, 'crystal', 'radius'),
      taken: false, t: 0,
      respawnTicks: ticks(param(spec, 'crystal', 'respawn')),
    };
  },

  pre(el) {
    if (el.taken && --el.t <= 0) el.taken = false;
  },

  post(el, world) {
    const p = world.player;
    if (el.taken || p.dashCharges >= world.cfg.dashCharges) return;
    if (!circleHitsRect(el.x, el.y, el.r, p.x, p.y, PLAYER_W, PLAYER_H)) return;
    p.dashCharges = world.cfg.dashCharges;
    el.taken = true;
    el.t = el.respawnTicks;
    world.emit('crystal', { x: el.x, y: el.y });
  },
};
