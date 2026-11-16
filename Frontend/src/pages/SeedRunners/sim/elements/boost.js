// Boost-Streifen: liegt auf dem Boden; wer darüberläuft, bekommt Tempo in seine Richtung (`dir`: 'right' | 'left') —
// ein Vielfaches des Lauftempos der Tempo-Klasse. Das Übertempo baut sich danach von selbst ab (overSpeedDrag), ein
// Sprung vom Streifen trägt deshalb deutlich weiter als ein gewöhnlicher. Mehrere Streifen nebeneinander halten das Tempo.
//
// Kein Dash, kein Luftsprung zurück: Der Streifen ändert nur das Tempo am Boden.
import { TILE, PLAYER_W, PLAYER_H } from '../config.js';
import { ticks, param, now, overlapRect } from './util.js';

export default {
  type: 'boost',
  save: ['cd'],

  create(spec) {
    return {
      type: 'boost', tx: spec.tx, ty: spec.ty,
      x: spec.tx * TILE, y: spec.ty * TILE,
      dir: spec.dir === 'left' ? 'left' : 'right',
      factor: param(spec, 'boost', 'factor'),
      // nur für die Meldung an Ton und Effekte: nicht bei jedem Tick auf dem Streifen erneut
      cd: 0,
    };
  },

  pre(el) {
    if (el.cd > 0) el.cd--;
  },

  post(el, world) {
    const p = world.player;
    if (!p.onGround || p.gd < 0) return;
    // Füße auf dem unteren Viertel der Kachel
    if (!overlapRect(p.x, p.y + PLAYER_H - 2, PLAYER_W, 3, el.x, el.y + TILE - 4, TILE, 5)) return;
    const s = el.dir === 'left' ? -1 : 1;
    const ziel = world.cfg.runMaxSpeed * el.factor;
    if (p.vx * s < ziel) p.vx = s * ziel;
    if (el.cd === 0) world.emit('boost', { x: el.x + TILE / 2, y: el.y + TILE, dir: el.dir, tick: now(world) });
    el.cd = ticks(0.3);
  },
};
