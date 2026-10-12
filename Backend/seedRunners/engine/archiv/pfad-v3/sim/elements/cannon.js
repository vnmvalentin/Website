// Kanone: sitzt in einem festen Block (wie der Laser) und feuert im Takt Kugeln in eine Richtung. Jede Kugel fliegt
// geradeaus, bis sie an den ersten festen Block stößt — dort verschwindet sie. Die Länge der Bahn wird beim Bauen
// einmal abgetastet (nur Kacheln, wie beim festen Laser).
//
// Wie Sägen und bewegte Plattformen ist die Lage aller Kugeln eine reine Funktion der Tick-Zahl: Kugel j ist
// (t + offset) mod period + j·period Ticks alt. Ein Respawn ändert also nichts am Beschuss, alle Spieler sehen dieselben
// Kugeln, und ein Checkpoint braucht keinen Zustand. Beim Start fliegen schon Kugeln (ein laufender Strom, kein
// „erster Schuss“ bei Tick 0).
//
// `shotAge` (Ticks seit dem letzten Schuss) ist die Uhr, nach der man den Beschuss abpasst — wie das Abschalten
// eines Lasers.
import { TILE, TICK_HZ, PLAYER_W, PLAYER_H } from '../config.js';
import { isSolid } from '../tilemap.js';
import { ticks, param, now, circleHitsRect } from './util.js';

const DIRS = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
const MAX_LANE_TILES = 90;

function place(el, t) {
  const age0 = (t + el.offset) % el.period;
  el.shotAge = age0;
  for (let j = 0; j < el.bodies.length; j++) {
    const d = ((age0 + j * el.period) * el.speed) / TICK_HZ;
    const b = el.bodies[j];
    // Im Rohr (d < 0) gibt es nicht; hinter dem Ende der Bahn ist die Kugel am Block zerplatzt
    b.on = d <= el.laneLen;
    b.x = el.mx + el.dx * d;
    b.y = el.my + el.dy * d;
  }
}

export default {
  type: 'cannon',

  create(spec, world) {
    const { tx, ty } = spec;
    const dirName = spec.dir || 'right';
    const [dx, dy] = DIRS[dirName];
    let len = 0;
    let cx = tx + dx;
    let cy = ty + dy;
    while (len < MAX_LANE_TILES && !isSolid(world.map, cx, cy)) {
      len++;
      cx += dx;
      cy += dy;
    }
    const r = param(spec, 'cannon', 'radius');
    const period = Math.max(2, ticks(param(spec, 'cannon', 'period')));
    const speed = param(spec, 'cannon', 'speed');
    // Mündung: Mitte der Blockkante in Schussrichtung
    const mx = (tx + 0.5 + dx * 0.5) * TILE;
    const my = (ty + 0.5 + dy * 0.5) * TILE;
    // Die Kugel verschwindet, sobald ihr Rand den Block am Ende der Bahn berührt
    const laneLen = Math.max(0, len * TILE - r);
    const flugTicks = speed > 0 ? Math.ceil((laneLen * TICK_HZ) / speed) : 0;
    const el = {
      type: 'cannon', tx, ty, dir: dirName, dx, dy, mx, my, r, speed, period, laneLen, lane: len,
      // Ausdehnung der Bahn in x (fürs Aussortieren beim Zeichnen, wie beim Laser)
      bx: Math.min(tx, tx + dx * len) * TILE, bw: (Math.abs(dx) * len + 1) * TILE,
      offset: Math.round((spec.phase || 0) * period),
      shotAge: 0,
      bodies: Array.from({ length: Math.floor(flugTicks / period) + 1 }, () => ({ x: mx, y: my, on: false })),
    };
    place(el, 0);
    return el;
  },

  pre(el, world) {
    place(el, now(world));
    // Nur Ausgabe für Ton und Mündungsblitz
    if (el.shotAge === 0) world.emit('cannonShot', { x: el.mx, y: el.my, dir: el.dir });
  },

  resync(el, world) {
    place(el, world.tick);
  },

  post(el, world) {
    const p = world.player;
    // Etwas kleiner als die gezeichnete Kugel, aus demselben Grund wie bei Sägen und Spikes
    for (const b of el.bodies) {
      if (b.on && circleHitsRect(b.x, b.y, el.r * 0.85, p.x + 1, p.y + 1, PLAYER_W - 2, PLAYER_H - 2)) {
        world.kill('cannon');
        return;
      }
    }
  },
};
