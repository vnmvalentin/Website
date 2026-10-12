// Gemeinsame Hilfen der Element-Module.
//
// Ein Element ist ein schlichtes Objekt (nur Zahlen, Wahrheitswerte, Text und unveränderliche
// Listen), damit sich sein Zustand kopieren, in einem Checkpoint-Schnappschuss ablegen und
// hashen lässt. Verhalten steht im Modul des Typs, nicht im Objekt.
//
// Ein Modul darf folgende Funktionen haben (alle optional außer `type` und `create`):
//   create(spec, world)      Element aus der Beschreibung bauen
//   link(el, world)          nach dem Bauen ALLER Elemente: Verweise auflösen (Portale, Türen)
//   pre(el, world)           vor dem Spielerschritt: Bewegung, Timer, Zonen-Wirkung
//   solids(el, out, world)   bewegliche feste Blöcke in `out` eintragen (siehe collide.js)
//   carry(el, world)         nach dem Sammeln der Blöcke: Mitfahrer bewegen / wegschieben
//   post(el, world)          nach dem Spielerschritt: Berührungen, Gefahren, Aufsammeln
//   save                     Namen der Zustandsfelder, die ein Checkpoint sichert
//   resync(el, world)        nach dem Wiederherstellen: aus world.tick neu berechnen
//
// ZEIT: Alles Zeitabhängige rechnet aus `world.tick`, nie aus einer Uhr. Im Schritt von Tick n
// nach n+1 stehen die Elemente schon auf ihrer Position zur Zeit n+1 (`now(world)`), genau wie
// der Spieler nach seinem Schritt — so sehen Kollision und Mitfahren denselben Zeitpunkt.

import { TICK_HZ, PLAYER_W, PLAYER_H, ELEMENT_PARAMS } from '../config.js';
import { rectHitsSolid } from '../tilemap.js';

export const ticks = (seconds) => Math.max(0, Math.round(seconds * TICK_HZ));

/** Die Zeit, auf die sich die Elemente in diesem Schritt bewegen. */
export const now = (world) => world.tick + 1;

/** Parameter: erst aus der Beschreibung, dann aus den Standardwerten des Typs. */
export function param(spec, type, key) {
  return spec[key] !== undefined ? spec[key] : ELEMENT_PARAMS[type][key];
}

export const overlapRect = (ax, ay, aw, ah, bx, by, bw, bh) =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

/**
 * Trifft der Spieler dieses Rechteck? Die Hitbox wird für Gefahren um 1 px verkleinert:
 * Ein Treffer, der nur die äußersten Pixel streift, wäre vom Bildschirm aus nicht als Treffer
 * zu erkennen und fühlt sich wie Pech an.
 */
export function playerHits(world, x, y, w, h, shrink = 1) {
  const p = world.player;
  return overlapRect(p.x + shrink, p.y + shrink, PLAYER_W - 2 * shrink, PLAYER_H - 2 * shrink, x, y, w, h);
}

/** Kreis gegen Rechteck (Mittelpunkt, Radius) */
export function circleHitsRect(cx, cy, r, x, y, w, h) {
  const nx = Math.max(x, Math.min(cx, x + w));
  const ny = Math.max(y, Math.min(cy, y + h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

export const playerCenter = (world) => ({
  x: world.player.x + PLAYER_W / 2,
  y: world.player.y + PLAYER_H / 2,
});

/**
 * Ist die Stelle für den Spieler frei — ohne die eigene Plattform (`ignore` = Elementindex)?
 * Damit lässt sich prüfen, ob man ihn von einer Plattform wegschieben kann oder er zerquetscht wird.
 */
export function freeForPlayer(world, x, y, ignore) {
  if (rectHitsSolid(world.map, x, y, PLAYER_W, PLAYER_H)) return false;
  const list = world.solids;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.oneWay || s.owner === ignore) continue;
    if (overlapRect(x, y, PLAYER_W, PLAYER_H, s.x, s.y, s.w, s.h)) return false;
  }
  return true;
}

// ── Pfade (bewegte Plattformen, Sägen) ─────────────────────────────────────

/** Punkte in Pixeln → { pts, cum, total } mit kumulierten Längen */
export function buildPath(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return { pts, cum, total: cum[cum.length - 1] };
}

/** Punkt in Entfernung `d` (0..total) entlang des Pfads */
export function pathPoint(path, d) {
  const { pts, cum, total } = path;
  if (total <= 0) return { x: pts[0][0], y: pts[0][1] };
  const dist = Math.max(0, Math.min(total, d));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < dist) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const u = (dist - cum[i - 1]) / seg;
  return {
    x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u,
    y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u,
  };
}

/**
 * Position zur Zeit `t` (Ticks): hin und zurück (`pingpong`) oder im Kreis (`loop`, der letzte
 * Punkt verbindet sich mit dem ersten). Rein eine Funktion der Zeit — kein gespeicherter Zustand,
 * deshalb ändert ein Respawn nichts an den Bewegungen.
 */
export function pathAt(path, speed, phase, t, mode) {
  const total = mode === 'loop' ? path.total : path.total;
  if (total <= 0) return pathPoint(path, 0);
  const travelled = (speed * t) / TICK_HZ;
  if (mode === 'loop') {
    const d = (travelled + phase * total) % total;
    return pathPoint(path, d);
  }
  const span = total * 2;
  const u = (travelled + phase * span) % span;
  return pathPoint(path, u < total ? u : span - u);
}
