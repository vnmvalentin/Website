// Windzone: ein Rechteck (w × h Tiles ab der Marker-Kachel), das den Spieler beschleunigt, solange
// seine Mitte darin ist. `ax`/`ay` sind Beschleunigungen in px/s² (ay < 0 = Aufwind). Der Dash setzt
// sein Tempo selbst, ist also unbeeindruckt — das ist Absicht: Wer im Wind dasht, kommt durch.
//
// Böen: Mit `period` (Sekunden) weht der Wind nur im Takt — `on` Sekunden an, den Rest der Periode
// aus, `warn` Sekunden vor dem Einsetzen zeigt die Darstellung eine Vorwarnung. Wie beim Laser
// hängt der Takt nur an der Tick-Zahl, alle Spieler erleben dieselbe Bö zur selben Zeit.
import { TILE, TICK_DT } from '../config.js';
import { ticks, param, now, playerCenter } from './util.js';

function setPhase(el, t) {
  if (!el.period) {
    el.on = true;
    el.warn = false;
    return;
  }
  const phase = (t + el.offset) % el.period;
  el.on = phase < el.onTicks;
  el.warn = !el.on && phase >= el.period - el.warnTicks;
}

export default {
  type: 'wind',

  create(spec) {
    const period = spec.period ? Math.max(2, ticks(spec.period)) : 0;
    const el = {
      type: 'wind', tx: spec.tx, ty: spec.ty,
      x: spec.tx * TILE, y: spec.ty * TILE,
      w: (spec.w || 3) * TILE, h: (spec.h || 3) * TILE,
      ax: spec.ax || 0, ay: spec.ay !== undefined ? spec.ay : -1500,
      period,
      onTicks: period ? Math.min(period - 1, ticks(spec.on !== undefined ? spec.on : spec.period / 2)) : 0,
      warnTicks: period ? ticks(param(spec, 'wind', 'warn')) : 0,
      offset: period ? Math.round((spec.phase || 0) * period) : 0,
      on: true, warn: false,
    };
    setPhase(el, 0);
    return el;
  },

  pre(el, world) {
    const wasOn = el.on;
    setPhase(el, now(world));
    if (el.period && el.on && !wasOn) world.emit('gust', { x: el.x, y: el.y, w: el.w, h: el.h, ax: el.ax, ay: el.ay });
    if (!el.on) return;
    const c = playerCenter(world);
    if (c.x < el.x || c.x >= el.x + el.w || c.y < el.y || c.y >= el.y + el.h) return;
    const p = world.player;
    if (p.dashTimer > 0) return;
    p.vx += el.ax * TICK_DT;
    p.vy += el.ay * TICK_DT;
  },

  resync(el, world) {
    setPhase(el, world.tick);
  },
};
