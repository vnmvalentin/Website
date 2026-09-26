// Bewegte Plattform. Läuft einen Pfad (Kachel-Offsets von ihrer Startposition aus) hin und zurück
// (`pingpong`) oder im Kreis (`loop`). Die Position ist eine reine Funktion der Tick-Zahl, nicht
// gespeicherter Zustand: Ein Respawn ändert nichts an den Bewegungen, und alle Spieler sehen
// dieselbe Plattform an derselben Stelle.
//
// Mitfahren: Wer auf der Plattform steht, wird um ihre Verschiebung mitgenommen — mit normaler
// Kollision, damit man an einer Wand nicht hindurchgetragen wird. Wer von der Seite oder von
// oben/unten in die Plattform hineingeschoben würde, wird weggeschoben; passt er nirgends hin,
// wird er zerquetscht. Beim Absprung nimmt man das Tempo der Plattform mit (siehe player.js).
import { TILE, TICK_HZ, PLAYER_W, PLAYER_H } from '../config.js';
import { movePlayerX, movePlayerY } from '../player.js';
import { buildPath, pathAt, param, now, overlapRect, freeForPlayer } from './util.js';

function place(el, t) {
  const pos = pathAt(el.pathData, el.speed, el.phase, t, el.loop ? 'loop' : 'pingpong');
  el.x = pos.x;
  el.y = pos.y;
}

export default {
  type: 'mover',

  create(spec) {
    const path = spec.path || [[0, 0], [6, 0]];
    const ox = spec.tx * TILE;
    const oy = spec.ty * TILE;
    const el = {
      type: 'mover', tx: spec.tx, ty: spec.ty,
      w: param(spec, 'mover', 'width') * TILE,
      h: param(spec, 'mover', 'thickness'),
      speed: param(spec, 'mover', 'speed'),
      phase: param(spec, 'mover', 'phase'),
      loop: spec.mode === 'loop',
      oneWay: !!spec.oneWay,
      pathData: buildPath(path.map(([dx, dy]) => [ox + dx * TILE, oy + dy * TILE])),
      x: ox, y: oy, px: ox, py: oy, vx: 0, vy: 0, rider: false,
    };
    place(el, 0);
    el.px = el.x;
    el.py = el.y;
    return el;
  },

  pre(el, world) {
    const p = world.player;
    // Steht der Spieler gerade auf dieser Plattform? (Kontakt vom Ende des letzten Ticks)
    el.rider = p.onGround && p.supOwner === el.i;
    el.px = el.x;
    el.py = el.y;
    place(el, now(world));
    el.vx = (el.x - el.px) * TICK_HZ;
    el.vy = (el.y - el.py) * TICK_HZ;
  },

  resync(el, world) {
    place(el, world.tick);
    el.px = el.x;
    el.py = el.y;
    el.vx = 0;
    el.vy = 0;
    el.rider = false;
  },

  solids(el, out) {
    out.push({ x: el.x, y: el.y, w: el.w, h: el.h, owner: el.i, vx: el.vx, oneWay: el.oneWay });
  },

  carry(el, world) {
    const dx = el.x - el.px;
    const dy = el.y - el.py;
    if (dx === 0 && dy === 0) return;
    const p = world.player;

    if (el.rider) {
      // Erst senkrecht, dann waagerecht: Steigt die Plattform, ragt ihre Oberkante nach dem Verschieben in die Füße;
      // ein waagerechter Schritt zuerst würde als Wandkollision blockiert, und auf schrägen Pfaden fuhr man nur
      // senkrecht mit und glitt hinten herunter.
      movePlayerY(world, dy);
      movePlayerX(world, dx);
      return;
    }
    if (el.oneWay) return;   // von unten und der Seite geht man hindurch

    // Nicht mitfahrend, aber in die Plattform hineingeraten: wegschieben oder zerquetschen
    if (!overlapRect(p.x, p.y, PLAYER_W, PLAYER_H, el.x, el.y, el.w, el.h)) return;
    let nx = p.x;
    let ny = p.y;
    if (Math.abs(dx) >= Math.abs(dy)) nx = dx > 0 ? el.x + el.w : el.x - PLAYER_W;
    else ny = dy > 0 ? el.y + el.h : el.y - PLAYER_H;
    if (freeForPlayer(world, nx, ny, el.i)) {
      p.x = nx;
      p.y = ny;
    } else {
      world.kill('crush');
    }
  },
};
