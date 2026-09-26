// Fixed-Timestep-Schrittgeber: entkoppelt die Sim (immer 120 Hz) vom Bildschirmtakt.
//
// Pro Bild kommt der Zeitstempel von requestAnimationFrame hinein, heraus kommt die Zahl der
// Sim-Ticks, die jetzt zu rechnen sind — auf einem 60-Hz-Monitor meist 2, auf 144 Hz mal 0,
// mal 1. Die Sim selbst sieht nie eine Zeit, nur Ticks; deshalb fühlt sich das Spiel auf
// jedem Monitor gleich an, und Zeiten (Ticks / 120) sind vergleichbar.
//
// `alpha` (0..1) ist der Bruchteil bis zum nächsten Tick: der Renderer mischt damit zwischen
// dem vorigen und dem aktuellen Sim-Stand, damit die Bewegung auf 144 Hz nicht in 120-Hz-
// Stufen ruckelt.
//
// Kein DOM-Zugriff, damit die Tests es direkt in Node laufen lassen können.

import { TICK_HZ } from '../sim/config.js';

// Mehr als so viele Ticks am Stück holt das Spiel nicht nach. Hängt ein Tab (Hintergrund,
// Debugger, überlasteter Rechner), würde sonst ein Berg aus Ticks auf einmal laufen und den
// Rechner nach der Pause erst recht blockieren. Der Rest der Zeit verfällt — die Sim läuft
// dann langsamer als die Wanduhr, und weil die Rennzeit in Ticks gemessen wird, kostet das
// den betroffenen Spieler Zeit statt allen anderen.
const DEFAULT_MAX_TICKS_PER_FRAME = 12;

export class FixedStepper {
  constructor({ tickHz = TICK_HZ, maxTicksPerFrame = DEFAULT_MAX_TICKS_PER_FRAME } = {}) {
    this.tickMs = 1000 / tickHz;
    this.maxTicks = maxTicksPerFrame;
    this.acc = 0;
    this.last = null;
  }

  /** @param {number} now  Zeitstempel in ms (monoton, z.B. der rAF-Parameter) */
  advance(now) {
    if (this.last === null) {
      this.last = now;
      return 0;
    }
    const delta = Math.max(0, now - this.last);
    this.last = now;
    this.acc += delta;

    let n = Math.floor(this.acc / this.tickMs);
    if (n > this.maxTicks) {
      n = this.maxTicks;
      this.acc = 0;
    } else {
      this.acc -= n * this.tickMs;
    }
    return n;
  }

  get alpha() {
    return this.acc / this.tickMs;
  }

  reset() {
    this.acc = 0;
    this.last = null;
  }
}
