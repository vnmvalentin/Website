// Rotierende Säge. Drei Bewegungsarten:
//   still   sitzt auf ihrer Kachel und dreht sich
//   Pfad    fährt `path` (Kachel-Offsets, von der Kachelmitte aus) hin und zurück
//   Kreis   umkreist ihre Kachel mit Radius `orbit` (Tiles)
// Die Position ist eine reine Funktion der Tick-Zahl. `phase` (0..1) verschiebt den Start, damit
// mehrere Sägen nicht im Gleichschritt laufen. Der Kreis nutzt die Tabelle aus trig.js.
//
// `count` (nur bei Pfad oder Kreis) setzt MEHRERE Sägen auf dieselbe Bahn, gleichmäßig über den
// Zyklus verteilt (Phase + i/count): eine Kette, die einem entgegenkommt, statt einer einzelnen Säge.
// Sie sind ein Element: eine Bahn, ein Tempo, eine Lücke zum Durchlaufen — und ein Eintrag im Editor.
import { TILE, TICK_HZ, PLAYER_W, PLAYER_H } from '../config.js';
import { cosTurns, sinTurns } from '../trig.js';
import { buildPath, pathAt, param, now, circleHitsRect } from './util.js';

function bodyAt(el, t, i) {
  const phase = el.phase + i / el.bodies.length;
  if (el.mode === 'orbit') {
    const turns = (el.turnsPerSecond * t) / TICK_HZ + phase;
    return { x: el.cx + el.orbit * TILE * cosTurns(turns), y: el.cy + el.orbit * TILE * sinTurns(turns) };
  }
  if (el.mode === 'path') return pathAt(el.pathData, el.speed, phase, t, 'pingpong');
  return { x: el.cx, y: el.cy };
}

function place(el, t) {
  for (let i = 0; i < el.bodies.length; i++) {
    const pos = bodyAt(el, t, i);
    el.bodies[i].x = pos.x;
    el.bodies[i].y = pos.y;
  }
  // x/y bleiben die erste Säge: Renderer, Minimap und Zustands-Hash kennen sie seit jeher
  el.x = el.bodies[0].x;
  el.y = el.bodies[0].y;
}

export default {
  type: 'saw',

  create(spec) {
    const cx = (spec.tx + 0.5) * TILE;
    const cy = (spec.ty + 0.5) * TILE;
    const mode = spec.path ? 'path' : spec.orbit ? 'orbit' : 'still';
    // Nur eine bewegte Säge kann Gesellschaft bekommen — stehende lägen alle auf demselben Punkt
    const count = mode === 'still' ? 1 : Math.max(1, Math.min(8, Math.round(spec.count || 1)));
    const el = {
      type: 'saw', tx: spec.tx, ty: spec.ty, mode, cx, cy, x: cx, y: cy,
      r: param(spec, 'saw', 'radius'),
      speed: param(spec, 'saw', 'speed'),
      phase: spec.phase || 0,
      orbit: spec.orbit ? (spec.orbit === true ? param(spec, 'saw', 'orbitRadius') : spec.orbit) : 0,
      turnsPerSecond: param(spec, 'saw', 'turnsPerSecond'),
      bodies: Array.from({ length: count }, () => ({ x: cx, y: cy })),
      pathData: mode === 'path'
        ? buildPath(spec.path.map(([dx, dy]) => [cx + dx * TILE, cy + dy * TILE]))
        : null,
    };
    place(el, 0);
    return el;
  },

  pre(el, world) {
    place(el, now(world));
  },

  resync(el, world) {
    place(el, world.tick);
  },

  post(el, world) {
    const p = world.player;
    // Etwas kleiner als die gezeichnete Säge, aus demselben Grund wie bei den Spikes
    for (const b of el.bodies) {
      if (circleHitsRect(b.x, b.y, el.r * 0.85, p.x + 1, p.y + 1, PLAYER_W - 2, PLAYER_H - 2)) {
        world.kill('saw');
        return;
      }
    }
  },
};
