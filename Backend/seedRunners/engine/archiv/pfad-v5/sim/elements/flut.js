// Flut: eine tödliche Front, die ein Rechteck füllt — steigende Lava (`dir: 'up'`) oder eine jagende Wand
// (`dir: 'right' | 'left'`, auch 'down'). Sie schläft, bis die Spielermitte ihr Rechteck betritt; dann läuft sie nach
// `delay` Sekunden mit `speed` px/s los, von der Kante gegenüber von `dir` bis das Rechteck voll ist. Wer die gefüllte
// Fläche berührt, stirbt.
//
// Warum so (Rückmeldung 14.11.2026: „mehr Härte … neue Hindernisse“, und früher: „mehr eigener Input statt warten“):
// Die Flut hängt nicht an einer Uhr, auf deren Takt man warten müsste, sondern am Spieler — sie macht Druck, sobald man
// den Abschnitt betritt, und wer zögert oder abstürzt, wird eingeholt.
//
// Zustand: nur `start` (Tick des Auslösens, -1 = schläft). Die Lage der Front ist eine reine Funktion von Tick und
// `start` — ein Checkpoint sichert `start`, nach einem Tod schläft die Flut also wieder (sofern der Checkpoint davor lag).
import { TILE, TICK_HZ } from '../config.js';
import { ticks, param, now, playerCenter, playerHits } from './util.js';

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** Gefülltes Rechteck { x, y, w, h } in Pixeln zum Füllstand `voll` (px) */
function flaeche(el, voll) {
  if (el.dir === 'up') return { x: el.x, y: el.y + el.h - voll, w: el.w, h: voll };
  if (el.dir === 'down') return { x: el.x, y: el.y, w: el.w, h: voll };
  if (el.dir === 'right') return { x: el.x, y: el.y, w: voll, h: el.h };
  return { x: el.x + el.w - voll, y: el.y, w: voll, h: el.h };
}

function setFuell(el, t) {
  const laenge = el.dir === 'up' || el.dir === 'down' ? el.h : el.w;
  const seit = el.start < 0 ? -1 : t - el.start - el.delayTicks;
  el.aktiv = el.start >= 0;
  el.voll = seit <= 0 ? 0 : Math.min(laenge, (seit * el.speed) / TICK_HZ);
}

export default {
  type: 'flut',
  save: ['start'],

  create(spec) {
    return {
      type: 'flut', tx: spec.tx, ty: spec.ty,
      x: spec.tx * TILE, y: spec.ty * TILE,
      w: (spec.w || 4) * TILE, h: (spec.h || 6) * TILE,
      dir: DIRS[spec.dir] ? spec.dir : 'up',
      speed: param(spec, 'flut', 'speed'),
      delayTicks: ticks(param(spec, 'flut', 'delay')),
      start: -1,
      aktiv: false,
      voll: 0,
    };
  },

  resync(el, world) {
    setFuell(el, world.tick);
  },

  pre(el, world) {
    setFuell(el, now(world));
  },

  post(el, world) {
    if (el.start < 0) {
      const c = playerCenter(world);
      if (c.x >= el.x && c.x < el.x + el.w && c.y >= el.y && c.y < el.y + el.h) {
        el.start = now(world);
        el.aktiv = true;
        world.emit('flut', { x: c.x, y: c.y, dir: el.dir });
      }
      return;
    }
    if (el.voll <= 0) return;
    const f = flaeche(el, el.voll);
    // (2 px Nachsicht: Die Front ist eine bewegte Kante — ein Streifschuss soll nicht töten)
    if (playerHits(world, f.x, f.y, f.w, f.h, 2)) world.kill('flut');
  },
};

export { flaeche as flutFlaeche };
