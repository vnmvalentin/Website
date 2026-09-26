// Zeitgesteuerter Laser: ein Block strahlt in eine Richtung, bis der Strahl auf einen festen Block
// trifft. Der Zyklus (Periode, Leuchtdauer, Vorwarnung) hängt nur an der Tick-Zahl. Die Vorwarnung
// ist ein dünner Strahl kurz vor dem Einschalten — ohne sie wäre jeder Laser ein Glücksspiel.
//
// Mit `spin` (Umdrehungen pro Sekunde) DREHT sich der Strahl stattdessen: Der Winkel ist eine reine
// Funktion der Tick-Zahl (Tabelle aus trig.js, damit es überall bitgleich bleibt), die Länge wird
// jeden Tick neu abgetastet und endet am ersten festen Block. Ein drehender Laser ist kein Timing-
// Rätsel mehr, sondern eine wandernde Wand: Man muss ihm ausweichen oder hinter ihm herlaufen.
import { TILE, TICK_HZ, PLAYER_W, PLAYER_H } from '../config.js';
import { isSolid } from '../tilemap.js';
import { cosTurns, sinTurns } from '../trig.js';
import { ticks, param, now, playerHits, overlapRect } from './util.js';

const DIRS = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
const MAX_BEAM_TILES = 90;
// Abtastschritt des drehenden Strahls (px). Kleiner als eine Kachel, damit keine Ecke durchrutscht;
// bei höchstens 20 Kacheln Länge sind das gut 80 Schritte pro Tick und Laser.
const RAY_STEP = 4;
// Winkel, den ein Richtungsname hat (in Umdrehungen; 0 = nach rechts, im Uhrzeigersinn, y zeigt nach unten)
const DIR_TURNS = { right: 0, down: 0.25, left: 0.5, up: 0.75 };

function setPhase(el, t) {
  const phase = (t + el.offset) % el.period;
  el.on = phase < el.onTicks;
  el.warn = !el.on && phase >= el.period - el.warnTicks;
}

/** Strahl eines drehenden Lasers für diesen Tick: Winkel aus der Zeit, Länge bis zum ersten Block */
function aim(el, world, t) {
  const turns = el.baseTurns + (el.spin * t) / TICK_HZ;
  el.ax = cosTurns(turns);
  el.ay = sinTurns(turns);
  const max = el.reach * TILE;
  let d = RAY_STEP;
  while (d < max) {
    const x = el.ox + el.ax * d;
    const y = el.oy + el.ay * d;
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    // Die eigene Kachel überspringen: Der Emitter STECKT in einem festen Block (ELEMENT_TILE),
    // sonst wäre der Strahl schon nach einem Schritt zu Ende.
    if (!(cx === el.tx && cy === el.ty) && isSolid(world.map, cx, cy)) break;
    d += RAY_STEP;
  }
  el.len = d;
}

export default {
  type: 'laser',

  create(spec, world) {
    const { tx, ty } = spec;
    const dirName = spec.dir || 'right';
    const [dx, dy] = DIRS[dirName];
    const th = param(spec, 'laser', 'thickness');
    const spin = Number(spec.spin) || 0;

    let len = 0;
    let cx = tx + dx;
    let cy = ty + dy;
    while (len < MAX_BEAM_TILES && !isSolid(world.map, cx, cy)) {
      len++;
      cx += dx;
      cy += dy;
    }

    const beam = {
      right: { x: (tx + 1) * TILE, y: (ty + 0.5) * TILE - th / 2, w: len * TILE, h: th },
      left: { x: (tx - len) * TILE, y: (ty + 0.5) * TILE - th / 2, w: len * TILE, h: th },
      up: { x: (tx + 0.5) * TILE - th / 2, y: (ty - len) * TILE, w: th, h: len * TILE },
      down: { x: (tx + 0.5) * TILE - th / 2, y: (ty + 1) * TILE, w: th, h: len * TILE },
    }[dirName];

    const period = Math.max(2, ticks(param(spec, 'laser', 'period')));
    const el = {
      type: 'laser', tx, ty, dir: dirName, bx: beam.x, by: beam.y, bw: beam.w, bh: beam.h,
      period,
      onTicks: Math.min(period - 1, ticks(param(spec, 'laser', 'on'))),
      warnTicks: ticks(param(spec, 'laser', 'warn')),
      offset: ticks(param(spec, 'laser', 'offset')) + Math.round((spec.phase || 0) * period),
      on: false, warn: false,
      // Drehteil: 0 = klassischer, achsenparalleler Strahl
      spin,
      th,
      baseTurns: DIR_TURNS[dirName] ?? 0,
      reach: spin ? (spec.reach || param(spec, 'laser', 'reach')) : 0,
      ox: (tx + 0.5) * TILE,
      oy: (ty + 0.5) * TILE,
      ax: 1, ay: 0, len: 0,
    };
    setPhase(el, 0);
    if (spin) aim(el, world, 0);
    return el;
  },

  pre(el, world) {
    const wasOn = el.on;
    const wasWarn = el.warn;
    setPhase(el, now(world));
    if (el.spin) aim(el, world, now(world));
    // Nur Ausgabe für Ton und Funken: Die Sim liest nichts davon zurück
    if (el.on && !wasOn) world.emit('laserOn', { x: (el.tx + 0.5) * TILE, y: (el.ty + 0.5) * TILE, dir: el.dir });
    else if (el.warn && !wasWarn) world.emit('laserWarn', { x: (el.tx + 0.5) * TILE, y: (el.ty + 0.5) * TILE });
  },

  resync(el, world) {
    setPhase(el, world.tick);
    if (el.spin) aim(el, world, world.tick);
  },

  post(el, world) {
    if (!el.on) return;
    if (!el.spin) {
      if (playerHits(world, el.bx, el.by, el.bw, el.bh)) world.kill('laser');
      return;
    }
    // Drehender Strahl: die Strecke in Schritten gegen die (leicht geschrumpfte) Spielerbox prüfen
    const p = world.player;
    const px = p.x + 1;
    const py = p.y + 1;
    const pw = PLAYER_W - 2;
    const ph = PLAYER_H - 2;
    for (let d = 0; d <= el.len; d += RAY_STEP) {
      const x = el.ox + el.ax * d;
      const y = el.oy + el.ay * d;
      if (overlapRect(x - el.th / 2, y - el.th / 2, el.th, el.th, px, py, pw, ph)) {
        world.kill('laser');
        return;
      }
    }
  },
};
