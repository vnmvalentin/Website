// Reichweiten des Spielers, GEMESSEN mit der echten Sim.
//
// Der Generator legt Lücken nach diesen Zahlen an, der Validator prüft sie. Sie kommen nicht aus
// Formeln, sondern aus kurzen Probeläufen auf ebenem Boden — so stimmen sie automatisch, wenn
// sich Tuning-Werte oder die Physik ändern, und jede Tempo-Klasse hat ihre eigenen Zahlen.
//
// Alle Weiten sind LÜCKENBREITEN in Tiles, die man von der Kante aus gerade noch überwindet
// (Absprung von der letzten Bodenkachel, Landung auf gleicher Höhe): zurückgelegte Strecke
// plus Spielerbreite, minus 2 px Spielraum. Höhen sind die Scheitelhöhe in Tiles.
//
// Fähigkeits-Stufen (aufsteigend):
//   jump        laufen + voller Sprung
//   double      + Doppelsprung
//   dash        Sprung + Dash (spät im Fallen, das trägt am weitesten), ohne Doppelsprung
//   dashDouble  Sprung + Doppelsprung + Dash
//   dashJump    Dash und Sprung zugleich am Rand (Tempo bleibt erhalten)
//   dashJumpDouble  Dash-Jump + Doppelsprung
// Die Suche probiert für die Zeitpunkte von Doppelsprung und Dash viele Werte durch und nimmt den
// besten — die Zahlen sind also das, was ein GUTER Spieler schafft. Der Generator nutzt deshalb
// nur einen Bruchteil davon (siehe gen/validator.js, SAFETY).

import { INPUT } from './inputBits.js';
import { TILE, PLAYER_W, PLAYER_H, createTuning } from './config.js';
import { classTuning } from './classes.js';
import { createWorld, stepWorld } from './world.js';
import { parseMap } from './tilemap.js';

const cache = new Map();

const FLAT_W = 120;
const FLAT_H = 40;

function flatWorld(tuning) {
  const rows = [];
  for (let y = 0; y < FLAT_H; y++) {
    let r = '';
    for (let x = 0; x < FLAT_W; x++) r += y >= FLAT_H - 3 ? '#' : (x === 2 && y === FLAT_H - 4 ? 'S' : '.');
    rows.push(r);
  }
  const world = createWorld(parseMap(rows), { tuning });
  // Gemessen wird, was ein Spieler MIT Dash-Ladung schafft: Man beginnt ohne Ladung (sie kommt nur aus Kristallen),
  // die Reichweite "dash" beschreibt aber die Fähigkeit, nachdem man eine hat.
  world.player.dashCharges = world.cfg.dashCharges;
  for (let i = 0; i < 30; i++) stepWorld(world, 0);
  // auf Höchsttempo kommen
  for (let i = 0; i < 90; i++) stepWorld(world, INPUT.RIGHT);
  return world;
}

/**
 * Ein Sprung von der Kante. `opts`: doubleAt (Tick nach dem Absprung, 0 = kein Doppelsprung),
 * dashAt (dito), dashJump (Dash zugleich mit dem Absprung). Gibt die zurückgelegte Strecke bis zur
 * Landung in Pixeln zurück und die Scheitelhöhe.
 */
function jumpOnce(tuning, { doubleAt = 0, dashAt = 0, dashJump = false }) {
  const w = flatWorld(tuning);
  const x0 = w.player.x;
  const y0 = w.player.y;
  let apex = y0;
  let landedX = null;
  for (let t = 0; t < 420 && landedX === null; t++) {
    let mask = INPUT.RIGHT;
    // Den ersten Sprung so lange halten, wie es aufwärts geht — für volle Höhe. Vor dem
    // Doppelsprung eine Taste lang loslassen, damit der Druck als neuer Druck zählt.
    const holdUntil = doubleAt ? doubleAt - 1 : 80;
    if (t === 0) mask |= INPUT.JUMP | (dashJump ? INPUT.DASH : 0);
    else if (w.player.vy < 0 && t < holdUntil) mask |= INPUT.JUMP;
    if (doubleAt && t === doubleAt - 1) mask &= ~INPUT.JUMP;
    if (doubleAt && t >= doubleAt && t < doubleAt + 40) mask |= INPUT.JUMP;
    if (dashAt && t === dashAt) mask |= INPUT.DASH;
    stepWorld(w, mask);
    apex = Math.min(apex, w.player.y);
    if (t > 3 && w.player.onGround) landedX = w.player.x;
  }
  return { dx: landedX === null ? 0 : landedX - x0, rise: y0 - apex };
}

const gapTiles = (dx) => Math.max(0, (dx + PLAYER_W - 2) / TILE);

function best(tuning, combos) {
  let top = { dx: 0, rise: 0 };
  for (const c of combos) {
    const r = jumpOnce(tuning, c);
    if (r.dx > top.dx) top = r;
  }
  return top;
}

const range = (from, to, step) => {
  const out = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
};

/** Reichweiten für eine Tuning-Belegung (siehe Kopfkommentar). Ergebnisse werden gemerkt. */
export function computeReach(tuning) {
  const key = JSON.stringify(Object.entries(tuning).sort());
  if (cache.has(key)) return cache.get(key);

  const doubles = range(20, 70, 5);
  const dashes = range(30, 110, 5);

  const plain = jumpOnce(tuning, {});
  const dbl = best(tuning, doubles.map((doubleAt) => ({ doubleAt })));
  const dsh = best(tuning, dashes.map((dashAt) => ({ dashAt })));
  const dshDbl = best(tuning, doubles.flatMap((doubleAt) => dashes.filter((d) => d > doubleAt + 5).map((dashAt) => ({ doubleAt, dashAt }))));
  const dashJump = jumpOnce(tuning, { dashJump: true });
  const dashJumpDbl = best(tuning, doubles.map((doubleAt) => ({ dashJump: true, doubleAt })));

  // Scheitelhöhen: voller Sprung und Sprung + bester Doppelsprung
  const jumpRise = plain.rise;
  const doubleRise = Math.max(...doubles.map((doubleAt) => jumpOnce(tuning, { doubleAt }).rise));

  const reach = {
    gap: {
      jump: gapTiles(plain.dx),
      double: gapTiles(dbl.dx),
      dash: gapTiles(dsh.dx),
      dashDouble: gapTiles(dshDbl.dx),
      dashJump: gapTiles(dashJump.dx),
      dashJumpDouble: gapTiles(dashJumpDbl.dx),
    },
    height: { jump: jumpRise / TILE, double: doubleRise / TILE },
    // Wie weit ein Sprung hinüberkommt, wenn das Ziel HÖHER liegt: Faustregel der Generatoren
    // (Lückenbreite schrumpft mit der Stufenhöhe); genauer wird sie nicht gebraucht.
    runSpeed: tuning.runMaxSpeed,
  };
  cache.set(key, reach);
  return reach;
}

/** Reichweiten einer Tempo-Klasse (mit den Standardwerten als Basis). */
export function reachForClass(classId) {
  return computeReach(createTuning(classTuning(classId)));
}

export const PLAYER_SIZE = { w: PLAYER_W, h: PLAYER_H };
