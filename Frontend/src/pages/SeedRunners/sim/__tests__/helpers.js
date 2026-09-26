// Gemeinsame Bausteine der Sim-Tests: kleine Testwelten und "Bots", die eine Eingabefolge
// aus dem Zustand berechnen. Die Bots sind bewusst einfach — sie sollen zeigen, dass ein
// Abschnitt mit den Standardwerten schaffbar IST, nicht wie ein guter Spieler spielen.

import { createWorld, stepWorld, warpPlayer } from '../world.js';
import { parseMap, isSolid } from '../tilemap.js';
import { INPUT } from '../inputBits.js';
import { TILE, PLAYER_W, PLAYER_H } from '../config.js';
import { createTestMap, TEST_MAP_GROUND } from '../testMap.js';

export { INPUT, TILE, PLAYER_W, PLAYER_H, stepWorld, warpPlayer, isSolid, TEST_MAP_GROUND };

/** Ebener Boden, Start links. Die untersten 3 Zeilen sind fest. */
export function flatRows(w = 80, h = 20) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) r += y >= h - 3 ? '#' : (x === 2 && y === h - 4 ? 'S' : '.');
    rows.push(r);
  }
  return rows;
}

export function settle(world, ticks = 30) {
  for (let i = 0; i < ticks; i++) stepWorld(world, 0);
  return world;
}

export function worldFrom(rows, tuning, parse) {
  return settle(createWorld(parseMap(rows, parse), { tuning, parse: undefined }));
}

/**
 * Kleine Arena zum Zusammenbauen: Luft mit festem Boden ab Zeile `floor` (Oberkante der Bodenzeile).
 * `b.rows()` liefert das ASCII-Raster, `b.world(tuning, parse)` die fertige Welt (Startpunkt bei x=2).
 */
export function arena({ w = 60, h = 30, floor = 26 } = {}) {
  const grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, () => (y >= floor ? '#' : '.')));
  const b = {
    w, h, floor,
    put(x, y, ch) { grid[y][x] = ch; return b; },
    rect(x, y, rw, rh, ch = '#') {
      for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) grid[yy][xx] = ch;
      return b;
    },
    rows() {
      const copy = grid.map((r) => r.slice());
      copy[floor - 1][2] = 'S';
      return copy.map((r) => r.join(''));
    },
    world(tuning, parse) { return worldFrom(b.rows(), tuning, parse); },
  };
  return b;
}

/** Figur auf Kachel (tx, ty) setzen — Füße auf der Unterkante dieser Kachel. */
export function placeAt(world, tx, ty, offsetX = 3) {
  warpPlayer(world, tx * TILE + offsetX, (ty + 1) * TILE - PLAYER_H);
  return world;
}

export const flatWorld = (tuning) => worldFrom(flatRows(), tuning);

/** Höhe der Bodenoberkante in flatRows() (Weltpixel) */
export const FLAT_GROUND_Y = (20 - 3) * TILE;

/** Testkarte, Figur auf Kachel (tx, Zeile über dem Boden `row`) gesetzt und zur Ruhe gekommen. */
export function testMapWorld(tx, row = TEST_MAP_GROUND - 1, tuning) {
  const world = createWorld(createTestMap(), { tuning });
  warpPlayer(world, tx * TILE + 3, (row + 1) * TILE - PLAYER_H);
  return settle(world, 20);
}

/** Eine Dash-Ladung geben: Man beginnt ohne (sie kommt nur aus Kristallen); Tests der Dash-Mechanik brauchen eine. */
export function mitDash(world) {
  world.player.dashCharges = world.cfg.dashCharges;
  return world;
}

export const tileX = (w) => Math.floor((w.player.x + PLAYER_W / 2) / TILE);
export const tileY = (w) => Math.floor((w.player.y + PLAYER_H / 2) / TILE);

/** Eine Maske für n Ticks; `mask` darf eine Funktion (tick, world) sein. */
export function run(world, ticks, mask) {
  for (let t = 0; t < ticks; t++) stepWorld(world, typeof mask === 'function' ? mask(t, world) : mask);
  return world;
}

// ── Bots ────────────────────────────────────────────────────────────────────

const solidAhead = (w) => {
  const p = w.player;
  return isSolid(w.map, Math.floor((p.x + PLAYER_W + 3) / TILE), Math.floor((p.y + PLAYER_H + 1) / TILE));
};

/**
 * Läuft nach rechts und springt an der Kante. `extras(ticksSinceJump, world)` darf zusätzliche
 * Bits liefern (Doppelsprung, Dash …). Erfolg = auf dem Boden bei Kachel `targetTx` (oder weiter),
 * ohne gestorben zu sein.
 */
export function crossGap(world, { targetTx, extras, dashJump = false, maxTicks = 900 }) {
  let sinceJump = -1;
  for (let t = 0; t < maxTicks; t++) {
    const p = world.player;
    let mask = INPUT.RIGHT;
    if (sinceJump < 0 && p.onGround && !solidAhead(world)) {
      mask |= INPUT.JUMP | (dashJump ? INPUT.DASH : 0);
      sinceJump = 0;
    } else if (sinceJump >= 0) {
      sinceJump++;
      if (!p.onGround && p.vy < 0) mask |= INPUT.JUMP;
      if (extras) mask = extras(sinceJump, mask, world);
    }
    stepWorld(world, mask);
    if (world.deaths > 0) return { ok: false, tick: t, tx: tileX(world) };
    if (sinceJump > 3 && p.onGround && tileX(world) >= targetTx) return { ok: true, tick: t, tx: tileX(world) };
  }
  return { ok: false, tick: maxTicks, tx: tileX(world) };
}

/** Wandsprung-Bot im Schacht: springt bei Wandkontakt, steuert zur gegenüberliegenden Wand. */
export function climbShaft(world, { untilY, maxTicks = 1500 }) {
  let prevJump = false;
  let since = 0;
  let dir = 1;
  for (let t = 0; t < maxTicks; t++) {
    const p = world.player;
    let mask = 0;
    const contact = p.wallDir !== 0 && !p.onGround;
    if (p.onGround) {
      dir = 1;
      mask |= INPUT.RIGHT;
      if (!prevJump) mask |= INPUT.JUMP;
    } else {
      if (contact) dir = -p.wallDir;
      mask |= dir > 0 ? INPUT.RIGHT : INPUT.LEFT;
      if (contact && !prevJump) {
        mask |= INPUT.JUMP;
        since = 0;
      } else if (prevJump && since < 40 && p.vy < 0) {
        mask |= INPUT.JUMP;
        since++;
      }
    }
    prevJump = (mask & INPUT.JUMP) !== 0;
    stepWorld(world, mask);
    if (world.deaths > 0) return { ok: false, tick: t };
    if (p.y < untilY) return { ok: true, tick: t };
  }
  return { ok: false, tick: maxTicks };
}
