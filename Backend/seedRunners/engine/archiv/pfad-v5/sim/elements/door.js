// Tür: ein fester Block, bis man mit einem Schlüssel dagegenläuft. Aneinandergrenzende Türblöcke
// bilden EINE Tür und öffnen gemeinsam; sie kostet einen Schlüssel.
import { TILE, PLAYER_W, PLAYER_H } from '../config.js';
import { overlapRect } from './util.js';

export default {
  type: 'door',
  save: ['open'],

  create(spec) {
    return {
      type: 'door', tx: spec.tx, ty: spec.ty, group: -1,
      x: spec.tx * TILE, y: spec.ty * TILE, w: TILE, h: TILE,
      open: false,
    };
  },

  // Zusammenhängende Türblöcke (Nachbarn oben/unten/links/rechts) zu einer Gruppe verbinden.
  // Die Gruppennummer ist der kleinste Elementindex — stabil, weil die Elementreihenfolge es ist.
  link(el, world) {
    if (el.group >= 0) return;
    const doors = world.elements.map((e, i) => [e, i]).filter(([e]) => e.type === 'door');
    const stack = [el];
    const members = new Set([el]);
    while (stack.length) {
      const cur = stack.pop();
      for (const [other] of doors) {
        if (members.has(other)) continue;
        if (Math.abs(other.tx - cur.tx) + Math.abs(other.ty - cur.ty) === 1) {
          members.add(other);
          stack.push(other);
        }
      }
    }
    const group = Math.min(...[...members].map((m) => world.elements.indexOf(m)));
    for (const m of members) m.group = group;
  },

  solids(el, out) {
    if (!el.open) out.push({ x: el.x, y: el.y, w: el.w, h: el.h, owner: el.i });
  },

  post(el, world) {
    if (el.open || world.flags.keys <= 0) return;
    const p = world.player;
    // 2 px Spielraum seitlich: Man steht ja DAVOR, nicht darin
    if (!overlapRect(p.x - 2, p.y, PLAYER_W + 4, PLAYER_H, el.x, el.y, el.w, el.h)) return;
    world.flags.keys--;
    for (const other of world.elements) {
      if (other.type === 'door' && other.group === el.group) other.open = true;
    }
    world.emit('doorOpen', { x: el.x, y: el.y });
  },
};
