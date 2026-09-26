// Spikes: feste Stacheln an einer Fläche. Die Ausrichtung folgt dem Block, an dem sie sitzen
// (unten, oben, links, rechts — in dieser Reihenfolge), sofern die Beschreibung keine `dir` nennt.
//
// Mit `period` FAHREN sie ein und aus, statt dauerhaft zu stehen: Der Zyklus hängt wie beim Laser nur
// an der Tick-Zahl (kein gespeicherter Zustand, ein Respawn ändert also nichts am Takt). Getötet wird
// nur, was die ausgefahrenen Spitzen berührt — eingefahren ist die Kachel harmlos und begehbar.
// `warn` blendet sie kurz vorher ein Stück heraus; ohne diese Vorwarnung wäre jeder Übergang unfair.
// Ohne `period` bleibt alles wie bisher (auch im Inhalts-Hash: die Felder sind optional).
import { TILE } from '../config.js';
import { isSolid } from '../tilemap.js';
import { ticks, param, now, playerHits } from './util.js';

function facing(map, tx, ty) {
  if (isSolid(map, tx, ty + 1)) return 'up';
  if (isSolid(map, tx, ty - 1)) return 'down';
  if (isSolid(map, tx - 1, ty)) return 'right';
  if (isSolid(map, tx + 1, ty)) return 'left';
  return 'up';
}

// `out` = wie weit die Spitzen herausstehen (0 … 1). Fahren mit fester Dauer aus und ein, damit man
// die Bewegung sieht, statt dass sie springt.
const MOVE_TICKS = 8;

function setPhase(el, t) {
  if (!el.period) return;
  const phase = ((t + el.offset) % el.period + el.period) % el.period;
  if (phase < el.onTicks) {
    // Ausgefahren: die ersten Ticks zum Herausfahren, die letzten zum Einfahren
    const inRamp = Math.min(1, phase / MOVE_TICKS);
    const outRamp = Math.min(1, (el.onTicks - phase) / MOVE_TICKS);
    el.out = Math.min(inRamp, outRamp);
  } else {
    // Eingefahren; kurz vor dem nächsten Ausfahren lugen die Spitzen als Vorwarnung hervor
    const untilOn = el.period - phase;
    el.out = untilOn <= el.warnTicks ? 0.25 : 0;
  }
  el.deadly = el.out > 0.75;
}

export default {
  type: 'spike',

  create(spec, world) {
    const th = param(spec, 'spike', 'thickness');
    const { tx, ty } = spec;
    const dir = spec.dir || facing(world.map, tx, ty);
    // Die Trefferfläche ist etwas schmaler als die Kachel: Ein Streifschuss an der Ecke tötet nicht.
    const rect = {
      up: { x: tx * TILE + 2, y: (ty + 1) * TILE - th, w: TILE - 4, h: th },
      down: { x: tx * TILE + 2, y: ty * TILE, w: TILE - 4, h: th },
      right: { x: tx * TILE, y: ty * TILE + 2, w: th, h: TILE - 4 },
      left: { x: (tx + 1) * TILE - th, y: ty * TILE + 2, w: th, h: TILE - 4 },
    }[dir];

    const period = spec.period === undefined ? 0 : Math.max(2, ticks(spec.period));
    const el = {
      type: 'spike', tx, ty, dir, ...rect,
      period,
      onTicks: period ? Math.min(period - 1, ticks(spec.on === undefined ? spec.period / 2 : spec.on)) : 0,
      warnTicks: period ? ticks(spec.warn === undefined ? param(spec, 'spike', 'warn') : spec.warn) : 0,
      offset: period ? Math.round((spec.phase || 0) * period) : 0,
      out: 1,
      deadly: true,
    };
    setPhase(el, 0);
    return el;
  },

  pre(el, world) {
    const wasDeadly = el.deadly;
    setPhase(el, now(world));
    if (el.period && el.deadly && !wasDeadly) {
      world.emit('spikeOut', { x: (el.tx + 0.5) * TILE, y: (el.ty + 0.5) * TILE });
    }
  },

  resync(el, world) {
    setPhase(el, world.tick);
  },

  post(el, world) {
    if (!el.deadly) return;
    if (playerHits(world, el.x, el.y, el.w, el.h)) world.kill('spike');
  },
};
