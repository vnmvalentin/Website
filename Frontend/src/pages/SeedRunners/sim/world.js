// Die Welt einer Spielerinstanz: Karte, Spieler, Elemente, Checkpoints, Ziel. Ein Tick = stepWorld().
//
// Reihenfolge pro Tick (sie ist Teil des Verhaltens):
//   1. Neustart-Taste
//   2. pre    — Elemente bewegen sich / zählen Timer / wirken als Zone auf den Spieler
//   3. solids — bewegliche feste Blöcke sammeln, dann carry: Mitfahrer bewegen bzw. wegschieben
//   4. Spielerschritt (player.js)
//   5. post   — Berührungen: Gefahren, Aufsammeln, Federn, Portale, Schalter
//   6. Tod, Checkpoint, Ziel
//
// `emit` ist ein reiner Ausgang für Sound, Partikel und Screen Shake: Die Sim ruft ihn auf,
// liest aber nie etwas daraus zurück. Ohne Rendering (Tests, Server-Replay) bleibt er ein No-Op.
//
// Checkpoint-Schnappschuss: Beim Erreichen eines Checkpoints wird der veränderliche Zustand aller
// Elemente (Schlüssel, Türen, bröckelnde Blöcke, Schalter …) gesichert; ein Respawn stellt ihn
// wieder her. Bewegungen, die nur von der Tick-Zahl abhängen (Sägen, Laser, Plattformen), sind
// nicht Teil davon — sie laufen einfach weiter.

import { TILE, PLAYER_W, PLAYER_H, createTuning } from './config.js';
import { INPUT } from './inputBits.js';
import { createPlayer, stepPlayer } from './player.js';
import { parseMap } from './tilemap.js';
import { ELEMENT_TYPES } from './elements/index.js';

const noop = () => {};

// Unterhalb der Karte gilt man als abgestürzt. Großzügig, damit ein langer Fall nicht sofort tötet.
const KILL_MARGIN = 4 * TILE;

/**
 * @param {string[] | object} mapDef  ASCII-Zeilen oder eine bereits geparste Karte
 * @param {{ tuning?: object, emit?: (type: string, data: object) => void, parse?: object }} [opts]
 *   parse  Optionen für parseMap (Marker, zusätzliche Elemente), falls `mapDef` Zeilen sind
 */
export function createWorld(mapDef, opts = {}) {
  const map = Array.isArray(mapDef) ? parseMap(mapDef, opts.parse) : mapDef;
  const cfg = createTuning(opts.tuning);
  const world = {
    map,
    cfg,
    tick: 0,
    // 0 = Start, i = i-ter Checkpoint (1-basiert, von links nach rechts)
    checkpointIndex: 0,
    deaths: 0,
    finished: false,
    finishTick: -1,
    spawns: [map.start, ...map.checkpoints],
    player: null,
    elements: [],
    mods: [],
    solids: [],
    // sw: Schalterstellung als Bitmaske (Bit c = Kanal c), keys: eingesammelte Schlüssel
    flags: { sw: 0, keys: 0 },
    dead: false,
    deathReason: null,
    prevGd: 1,
    snapshot: null,
    startSnapshot: null,
    emit: null,
    // Als Methode statt Schließung: Der Solver kopiert Welten, und die Kopie muss ihren EIGENEN
    // Tod melden, nicht den der Vorlage.
    kill(reason) {
      this.dead = true;
      this.deathReason = reason;
    },
  };
  world.emit = (type, data) => (opts.emit || noop)(type, { tick: world.tick, ...data });
  world.player = createPlayer(map.start, cfg);

  for (const spec of map.entities) {
    const mod = ELEMENT_TYPES[spec.type];
    if (!mod) throw new Error(`Unbekannter Element-Typ "${spec.type}"`);
    const el = mod.create(spec, world);
    el.i = world.elements.length;
    world.elements.push(el);
    world.mods.push(mod);
  }
  world.mods.forEach((mod, i) => mod.link?.(world.elements[i], world));

  world.startSnapshot = saveState(world);
  world.snapshot = world.startSnapshot;
  return world;
}

// ── Schnappschüsse ──────────────────────────────────────────────────────────

function saveState(world) {
  return {
    flags: { ...world.flags },
    els: world.elements.map((el, i) => {
      const keys = world.mods[i].save;
      if (!keys) return null;
      const out = {};
      for (const k of keys) out[k] = el[k];
      return out;
    }),
  };
}

function restoreState(world, snap) {
  world.flags = { ...snap.flags };
  world.elements.forEach((el, i) => {
    if (snap.els[i]) Object.assign(el, snap.els[i]);
    world.mods[i].resync?.(el, world);
  });
}

const overlaps = (p, tx, ty) =>
  p.x < (tx + 1) * TILE && p.x + PLAYER_W > tx * TILE &&
  p.y < (ty + 1) * TILE && p.y + PLAYER_H > ty * TILE;

// Setzt den Spieler an den letzten Checkpoint. `input` ist die aktuelle Eingabe: Als "vorherige
// Eingabe" übernommen, gilt eine gerade gehaltene Taste nicht als neu gedrückt — sonst springt
// man nach dem Respawn allein deshalb los, weil man die Sprungtaste noch unten hat.
export function respawnPlayer(world, input = 0) {
  const spawn = world.spawns[world.checkpointIndex];
  world.player = createPlayer(spawn, world.cfg);
  world.player.prevInput = input;
  world.prevGd = 1;
  restoreState(world, world.snapshot);
}

/**
 * Testwerkzeug: Spieler an eine beliebige Stelle setzen, ohne Wirkung auf Checkpoints.
 * Alle Kontakt- und Eingabe-Timer werden geleert: Sonst wirkt der Bodenkontakt von der ALTEN
 * Stelle nach (Coyote Time), und die Figur könnte mitten in der Luft noch "vom Boden" springen.
 * Dash- und Luftsprung-Ladungen bleiben, wie sie sind.
 */
export function warpPlayer(world, x, y) {
  const p = world.player;
  p.x = x;
  p.y = y;
  p.prevX = x;
  p.prevY = y;
  p.vx = 0;
  p.vy = 0;
  p.onGround = false;
  p.coyote = 0;
  p.wallCoyote = 0;
  p.jumpBuffer = 0;
  p.wallLock = 0;
  p.jumping = false;
  p.dashTimer = 0;
  p.dashGrace = 0;
  p.dashBuffer = 0;
  p.grapple = null;
  p.supOwner = null;
  p.lastGroundVx = 0;
}

/** Kompletter Neustart des Laufs (Uhr, Tode, Checkpoints, Elemente) — nicht zu verwechseln mit dem Respawn. */
export function resetRun(world) {
  world.tick = 0;
  world.checkpointIndex = 0;
  world.deaths = 0;
  world.finished = false;
  world.finishTick = -1;
  world.snapshot = world.startSnapshot;
  respawnPlayer(world, 0);
}

function die(world, input) {
  world.deaths++;
  world.emit('death', { x: world.player.x, y: world.player.y, reason: world.deathReason });
  respawnPlayer(world, input);
}

export function stepWorld(world, input) {
  const map = world.map;
  const { elements, mods } = world;
  world.dead = false;

  // Neustart zum letzten Checkpoint: die Uhr läuft weiter, Tode zählen nicht mit.
  if ((input & INPUT.RESTART) !== 0 && (world.player.prevInput & INPUT.RESTART) === 0) {
    respawnPlayer(world, input);
    world.emit('restart', {});
  }

  world.player.gd = 1;
  world.solids.length = 0;
  for (let i = 0; i < elements.length; i++) mods[i].pre?.(elements[i], world);
  if (!world.dead) {
    for (let i = 0; i < elements.length; i++) mods[i].solids?.(elements[i], world.solids, world);
    for (let i = 0; i < elements.length; i++) mods[i].carry?.(elements[i], world);
  }
  if (world.dead) {
    world.tick++;
    die(world, input);
    return;
  }

  if (world.player.gd !== world.prevGd) {
    world.prevGd = world.player.gd;
    world.emit('gravity', { gd: world.prevGd });
  }

  stepPlayer(world, input);
  world.tick++;

  for (let i = 0; i < elements.length; i++) mods[i].post?.(elements[i], world);
  if (world.dead) {
    die(world, input);
    return;
  }

  const p = world.player;

  if (p.y > map.h * TILE + KILL_MARGIN || p.y < -KILL_MARGIN * 4) {
    world.deathReason = 'pit';
    die(world, input);
    return;
  }

  // Checkpoints nur vorwärts: ein früherer verliert nicht den Fortschritt.
  for (let i = 0; i < map.checkpoints.length; i++) {
    const cp = map.checkpoints[i];
    const index = i + 1;
    if (index > world.checkpointIndex && overlaps(p, cp.tx, cp.ty)) {
      world.checkpointIndex = index;
      world.snapshot = saveState(world);
      world.emit('checkpoint', { index, x: cp.x, y: cp.y });
    }
  }

  if (!world.finished) {
    for (const f of map.finish) {
      if (overlaps(p, f.tx, f.ty)) {
        world.finished = true;
        world.finishTick = world.tick;
        world.emit('finish', { ticks: world.tick });
        break;
      }
    }
  }
}
