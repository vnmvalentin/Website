// Tile-Karte der Sim: Parsen aus ASCII-Zeilen und die Abfragen, die Kollision und Grapple
// brauchen. Das ASCII-Format ist auch das Format der Chunk-Templates — ein Tippfehler im
// Raster darf deshalb nie still zu "leerer Luft" werden, sondern wirft beim Parsen.
//
// Zeichen: siehe glyphs.js. Kurz:
//   .  Luft            #  Block          I  Eis           W  klebrige Wand
//   >  Förderband →    <  Förderband ←   =  Einweg-Plattform
//   S  Start   C  Checkpoint   G  Grapple-Anker   E  Ziel   1-9  Warp-Marken (Dev)
//   ^ ~ F P O D T R B K Y  Elemente mit Standardwerten
//   a-z  Marker für Elemente mit Parametern (siehe `markers` unten)

import { TILE, PLAYER_W, PLAYER_H } from './config.js';
import { KIND, TILE_GLYPHS, ELEMENT_GLYPHS, ELEMENT_TILE, isSolidKind } from './glyphs.js';

// Position, an der der Spieler auf einer Kachel spawnt: mittig, Füße auf der Kachelunterkante.
function spawnAt(tx, ty) {
  return { x: tx * TILE + (TILE - PLAYER_W) / 2, y: (ty + 1) * TILE - PLAYER_H };
}

/**
 * @param {string[]} rows
 * @param {{ markers?: Object<string, object>, entities?: object[], checkpointOrder?: object[] }} [opts]
 *   markers          Beschreibung der Kleinbuchstaben im Raster: { a: { type, ...Parameter } }
 *   entities         zusätzliche Elemente mit absoluten Kachelkoordinaten { type, tx, ty, ... } —
 *                    so liefert der Generator Elemente mit aufgelösten Zufallswerten
 *   checkpointOrder  explizite Reihenfolge { tx, ty, order }[]; nur wirksam, wenn sie genau alle
 *                    Checkpoints des Rasters abdeckt (siehe unten) — sonst zählt die Position
 */
export function parseMap(rows, opts = {}) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Karte braucht mindestens eine Zeile');
  const markers = opts.markers || {};
  const h = rows.length;
  const w = rows[0].length;
  const kind = new Uint8Array(w * h);
  const solid = new Uint8Array(w * h);
  const checkpoints = [];
  const anchors = [];
  const finish = [];
  const warps = {};
  const entities = [];
  let start = null;

  const setKind = (tx, ty, k) => {
    kind[ty * w + tx] = k;
    solid[ty * w + tx] = isSolidKind(k) ? 1 : 0;
  };

  for (let ty = 0; ty < h; ty++) {
    const row = rows[ty];
    if (row.length !== w) {
      throw new Error(`Zeile ${ty} hat ${row.length} statt ${w} Zeichen`);
    }
    for (let tx = 0; tx < w; tx++) {
      const ch = row[tx];
      if (ch === '.') continue;
      if (ch in TILE_GLYPHS) { setKind(tx, ty, TILE_GLYPHS[ch]); continue; }
      if (ch in ELEMENT_GLYPHS) {
        const def = ELEMENT_GLYPHS[ch];
        entities.push({ type: def.type, tx, ty, ...(def.params || {}) });
        continue;
      }
      if (ch >= 'a' && ch <= 'z') {
        const def = markers[ch];
        if (!def) throw new Error(`Marker "${ch}" in Zeile ${ty}, Spalte ${tx} ist nicht beschrieben`);
        entities.push({ ...def, tx, ty });
        continue;
      }
      switch (ch) {
        case 'S':
          if (start) throw new Error(`Zweiter Startpunkt in Zeile ${ty}, Spalte ${tx}`);
          start = { ...spawnAt(tx, ty), tx, ty };
          break;
        case 'C': checkpoints.push({ ...spawnAt(tx, ty), tx, ty }); break;
        case 'G': anchors.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, tx, ty }); break;
        case 'E': finish.push({ tx, ty }); break;
        default:
          if (ch >= '1' && ch <= '9') warps[ch] = spawnAt(tx, ty);
          else throw new Error(`Unbekanntes Zeichen "${ch}" in Zeile ${ty}, Spalte ${tx}`);
      }
    }
  }
  if (!start) throw new Error('Karte hat keinen Startpunkt (S)');

  for (const spec of opts.entities || []) {
    if (spec.tx < 0 || spec.tx >= w || spec.ty < 0 || spec.ty >= h) {
      throw new Error(`Element ${spec.type} liegt außerhalb der Karte (${spec.tx}, ${spec.ty})`);
    }
    entities.push({ ...spec });
  }

  // Manche Elemente sitzen in einer festen Kachel (Laser-Block)
  for (const spec of entities) {
    if (ELEMENT_TILE[spec.type] !== undefined) setKind(spec.tx, spec.ty, ELEMENT_TILE[spec.type]);
  }

  // Fortschritt läuft normalerweise von links nach rechts — bei einem SENKRECHTEN Level (Turm) ist das
  // aber die falsche Achse: ein tieferes Stockwerk kann zufällig weiter rechts liegen als eines darüber
  // und bekäme so fälschlich den höheren Index (der Spieler respawnt dann am unteren statt am zuletzt
  // erreichten oberen Checkpoint). `opts.checkpointOrder` (vom Editor oder Generator) gibt die Reihenfolge
  // deshalb explizit vor, wenn sie vollständig und eindeutig ist; sonst bleibt die Positions-Sortierung
  // der Fallback (unverändertes Verhalten für jedes Level ohne explizite Angabe).
  const orderByKey = new Map();
  if (opts.checkpointOrder?.length === checkpoints.length) {
    for (const o of opts.checkpointOrder) orderByKey.set(`${o.tx},${o.ty}`, o.order);
  }
  const explicitComplete = orderByKey.size === checkpoints.length
    && checkpoints.every((cp) => orderByKey.has(`${cp.tx},${cp.ty}`));
  if (explicitComplete) checkpoints.sort((a, b) => orderByKey.get(`${a.tx},${a.ty}`) - orderByKey.get(`${b.tx},${b.ty}`));
  else checkpoints.sort((a, b) => a.tx - b.tx || a.ty - b.ty);

  return { w, h, kind, solid, start, checkpoints, anchors, finish, warps, entities };
}

// Außerhalb der Karte: links/rechts massiv (unsichtbare Wand), oben und unten offen. Oben offen,
// damit ein Sprung an der Kartenoberkante nicht einfach abgeschnitten wird; unten offen, damit
// Abgründe wirklich einer sind (die Kill-Grenze sitzt unterhalb der Karte, siehe world.js).
export function isSolid(map, tx, ty) {
  if (tx < 0 || tx >= map.w) return true;
  if (ty < 0 || ty >= map.h) return false;
  return map.solid[ty * map.w + tx] === 1;
}

/** Kachelart an (tx, ty); außerhalb der Karte wie isSolid(): Seitenränder fest, sonst Luft. */
export function kindAt(map, tx, ty) {
  if (tx < 0 || tx >= map.w) return KIND.SOLID;
  if (ty < 0 || ty >= map.h) return KIND.AIR;
  return map.kind[ty * map.w + tx];
}

// Berührt das Rechteck einen Block? Kanten, die exakt auf einer Kachelgrenze liegen, zählen
// NICHT als Überlappung — sonst würde der Spieler, der exakt am Boden steht, in ihm stecken.
// (Die Kollision rastet Positionen immer auf ganzzahlige Kachelgrenzen ein, dort ist die
// Rechnung exakt.)
export function rectHitsSolid(map, x, y, w, h) {
  const tx0 = Math.floor(x / TILE);
  const tx1 = Math.ceil((x + w) / TILE) - 1;
  const ty0 = Math.floor(y / TILE);
  const ty1 = Math.ceil((y + h) / TILE) - 1;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isSolid(map, tx, ty)) return true;
    }
  }
  return false;
}

// Freie Sichtlinie zwischen zwei Punkten, in 4-px-Schritten abgetastet. Das ist deutlich
// kleiner als eine Kachel, also schlüpft kein Block durch. Für das Seil: ein Anker hinter
// einer Wand ist nicht greifbar, und ein Seil, das über eine Kante gezogen wird, reißt.
const LOS_STEP = 4;
export function lineOfSight(map, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / LOS_STEP));
  for (let i = 0; i <= n; i++) {
    const px = x0 + (dx * i) / n;
    const py = y0 + (dy * i) / n;
    if (isSolid(map, Math.floor(px / TILE), Math.floor(py / TILE))) return false;
  }
  return true;
}
