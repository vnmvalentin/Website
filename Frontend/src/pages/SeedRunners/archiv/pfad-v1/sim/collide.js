// Kollisionsabfragen der Sim: feste Kacheln PLUS bewegliche Blöcke (Plattformen, bröckelnde
// Blöcke, Türen …), die die Elemente pro Tick in `world.solids` eintragen.
//
// Ein Eintrag in world.solids:
//   { x, y, w, h, owner, vx, oneWay, kind }
//   owner   das Element (damit z.B. eine bröckelnde Plattform merkt, dass jemand darauf steht)
//   vx      eigene Geschwindigkeit in px/s (Plattform) — wird beim Absprung mitgegeben
//   oneWay  nur von oben betretbar
//   kind    Oberflächenart (KIND.*), Standard SOLID
//
// Die Erdanziehung kann durch Gravitationszonen umgedreht sein (`gd` = +1 normal, -1 kopfüber).
// "Boden" ist dann die Decke; Einweg-Plattformen gelten nur bei normaler Schwerkraft.

import { TILE } from './config.js';
import { KIND, isSolidKind } from './glyphs.js';
import { isSolid, kindAt, rectHitsSolid } from './tilemap.js';

const overlap = (ax, ay, aw, ah, b) =>
  ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y;

/** Blockiert etwas (Kachel oder beweglicher Block, aber keine Einweg-Plattform) das Rechteck? */
export function hitsSolid(world, x, y, w, h) {
  if (rectHitsSolid(world.map, x, y, w, h)) return true;
  const list = world.solids;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s.oneWay && overlap(x, y, w, h, s)) return true;
  }
  return false;
}

/**
 * Landet ein fallender Körper beim Schritt von `oldBottom` nach `newBottom` auf einer Einweg-
 * Plattform? Gibt die Oberkante der Plattform zurück, sonst null. Nur wer VON OBEN kommt
 * (Unterkante vorher auf oder über der Oberkante) wird gestoppt — von unten und von der Seite
 * geht man hindurch.
 */
export function oneWayLanding(world, x, w, oldBottom, newBottom) {
  const { map } = world;
  let best = null;

  // Kachel-Plattformen: Oberkante der Kachelzeile
  const tx0 = Math.floor(x / TILE);
  const tx1 = Math.ceil((x + w) / TILE) - 1;
  const ty0 = Math.floor(oldBottom / TILE);
  const ty1 = Math.floor(newBottom / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    const top = ty * TILE;
    if (top < oldBottom - 0.001 || top >= newBottom) continue;
    for (let tx = tx0; tx <= tx1; tx++) {
      if (kindAt(map, tx, ty) === KIND.ONEWAY && (best === null || top < best)) best = top;
    }
  }

  // Bewegliche Einweg-Plattformen
  const list = world.solids;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s.oneWay || x >= s.x + s.w || x + w <= s.x) continue;
    if (s.y >= oldBottom - 0.001 && s.y < newBottom && (best === null || s.y < best)) best = s.y;
  }
  return best;
}

// Art des tragenden Bodens unter der Fußmitte; fehlt dort einer, der erste feste Block im Streifen
function stripKind(map, x, y, w, h) {
  const cx = x + w / 2;
  const ctx = Math.floor(cx / TILE);
  const tx0 = Math.floor(x / TILE);
  const tx1 = Math.ceil((x + w) / TILE) - 1;
  const ty0 = Math.floor(y / TILE);
  const ty1 = Math.ceil((y + h) / TILE) - 1;
  let found = KIND.AIR;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const k = kindAt(map, tx, ty);
      if (!isSolidKind(k)) continue;
      if (tx === ctx) return k;
      if (found === KIND.AIR) found = k;
    }
  }
  return found;
}

/**
 * Was trägt den Spieler? Schreibt das Ergebnis in die `sup*`-Felder des Spielers und gibt zurück,
 * ob er Kontakt hat. Bei umgekehrter Schwerkraft ist "tragend" die Decke.
 *   supKind    Oberflächenart (KIND.*), 0 = nichts
 *   supVx      Eigengeschwindigkeit des Untergrunds in px/s (Plattform / Förderband)
 *   supOwner   das Element, das trägt (oder null)
 *   supOneWay  steht auf einer Einweg-Plattform
 */
export function findSupport(world, p, w, h, gd) {
  const map = world.map;
  p.supKind = KIND.AIR;
  p.supVx = 0;
  p.supOwner = null;
  p.supOneWay = false;

  const sy = gd > 0 ? p.y + h : p.y - 1;

  // Bewegliche Blöcke zuerst: Sie liegen über den Kacheln, wenn beides zutrifft
  const list = world.solids;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.oneWay && gd < 0) continue;
    if (s.oneWay) {
      // Steht der Fuß auf der Oberkante (innerhalb von 1 px)?
      const gap = s.y - (p.y + h);
      if (gap < -0.001 || gap > 1 || p.x >= s.x + s.w || p.x + w <= s.x) continue;
      if (p.dropTimer > 0) continue;
      p.supKind = s.kind || KIND.SOLID;
      p.supVx = s.vx || 0;
      p.supOwner = s.owner !== undefined ? s.owner : null;
      p.supOneWay = true;
      return true;
    }
    if (overlap(p.x, sy, w, 1, s)) {
      p.supKind = s.kind || KIND.SOLID;
      p.supVx = s.vx || 0;
      p.supOwner = s.owner !== undefined ? s.owner : null;
      return true;
    }
  }

  const k = stripKind(map, p.x, sy, w, 1);
  if (k !== KIND.AIR) {
    p.supKind = k;
    if (k === KIND.CONVEYOR_R) p.supVx = world.cfg.conveyorSpeed;
    else if (k === KIND.CONVEYOR_L) p.supVx = -world.cfg.conveyorSpeed;
    return true;
  }

  // Einweg-Kachel unter den Füßen (nur bei normaler Schwerkraft, nicht beim Herunterspringen)
  if (gd > 0 && !(p.dropTimer > 0)) {
    const bottom = p.y + h;
    const ty = Math.floor((bottom + 1) / TILE);
    const top = ty * TILE;
    if (top - bottom >= -0.001 && top - bottom <= 1) {
      const tx0 = Math.floor(p.x / TILE);
      const tx1 = Math.ceil((p.x + w) / TILE) - 1;
      for (let tx = tx0; tx <= tx1; tx++) {
        if (kindAt(map, tx, ty) === KIND.ONEWAY) {
          p.supKind = KIND.SOLID;
          p.supOneWay = true;
          return true;
        }
      }
    }
  }
  return false;
}

/** Art der Wand neben dem Spieler (KIND.*) oder AIR. `dir` = -1 links, +1 rechts. */
export function wallKind(world, p, w, h, dir) {
  const x = dir < 0 ? p.x - 1 : p.x + w;
  const y = p.y + 1;
  const sh = h - 2;
  const list = world.solids;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s.oneWay && overlap(x, y, 1, sh, s)) return KIND.SOLID;
  }
  const tx = Math.floor(x / TILE);
  const ty0 = Math.floor(y / TILE);
  const ty1 = Math.ceil((y + sh) / TILE) - 1;
  let found = KIND.AIR;
  for (let ty = ty0; ty <= ty1; ty++) {
    if (!isSolid(world.map, tx, ty)) continue;
    const k = kindAt(world.map, tx, ty);
    if (k === KIND.STICKY) return k;
    found = k;
  }
  return found;
}
