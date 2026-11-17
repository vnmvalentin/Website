// Portalpaar: Wer in eines eintritt, kommt aus dem anderen heraus — mit unverändertem Tempo.
// Die Beschreibung nennt die `id` des Partners in `pair`; beide Portale zeigen aufeinander.
//
// Damit man nicht sofort zurückspringt, sind beide nach einer Teleportation entschärft und
// scharf, sobald der Spieler den Radius des jeweiligen Portals verlassen hat.
import { TILE, PLAYER_W, PLAYER_H } from '../config.js';
import { param, playerCenter } from './util.js';

export default {
  type: 'portal',
  save: ['armed'],

  create(spec) {
    return {
      type: 'portal', tx: spec.tx, ty: spec.ty, id: spec.id, pair: spec.pair,
      x: (spec.tx + 0.5) * TILE, y: (spec.ty + 0.5) * TILE,
      r: param(spec, 'portal', 'radius'),
      armed: true, mate: -1,
    };
  },

  link(el, world) {
    const mate = world.elements.findIndex((e) => e.type === 'portal' && e.id === el.pair);
    if (mate < 0) throw new Error(`Portal ${el.id}: Partner "${el.pair}" fehlt`);
    el.mate = mate;
  },

  post(el, world) {
    const c = playerCenter(world);
    const dx = c.x - el.x;
    const dy = c.y - el.y;
    const inside = dx * dx + dy * dy <= el.r * el.r;

    if (!el.armed) {
      if (!inside) el.armed = true;
      return;
    }
    if (!inside) return;

    const mate = world.elements[el.mate];
    const p = world.player;
    p.x = mate.x - PLAYER_W / 2;
    p.y = mate.y - PLAYER_H / 2;
    p.prevX = p.x;
    p.prevY = p.y;
    p.grapple = null;
    el.armed = false;
    mate.armed = false;
    world.emit('portal', { from: { x: el.x, y: el.y }, to: { x: mate.x, y: mate.y } });
  },
};
