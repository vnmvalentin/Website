// Das Level-Dokument: das versionierte JSON-Format, in dem der Editor Level speichert und der Server sie
// annimmt. Es ist bewusst KEIN zweites System neben den prozeduralen Leveln: Aus einem Dokument wird mit
// docToLevel() dieselbe Form (rows + entities + params), die der Generator liefert, und createLevelWorld()
// (sim/levelWorld.js) baut daraus die Welt — für Editor, Testspiel, Server-Replay und Multiplayer.
//
// Aufbau
//   version    Formatversion (limits.js)
//   meta       Angaben zum Level, die das Spiel nicht verändern: name, description, tags, difficulty, biome.
//              Sie gehören NICHT zum Inhalts-Hash — Namen und Hintergrund lassen sich ändern, ohne dass die
//              Verifizierung verfällt.
//   speedClass Tempo-Klasse (normal/fast/super); ändert die Physik, gehört also zum Inhalt
//   width, height, tiles
//              Raster: Kacheln und Sonderzeichen (S Start, C Checkpoint, G Anker, E Ziel), nichts sonst
//   elements   Alle Elemente als { type, tx, ty, …Parameter } (auch Spikes, Schalter, Türen — Zeichen für
//              Elemente gibt es im Dokument nicht, siehe sim/glyphs.js)
//   checkpointOrder  Optional: explizite Reihenfolge der Checkpoints als { tx, ty, order }[]. Ohne sie (der
//              Normalfall) zählt die Position (links nach rechts) — bei einem senkrechten Level (Turm) kann
//              das die falsche Reihenfolge ergeben, siehe sim/tilemap.js. Entweder leer oder vollständig.
//              Gehört bewusst NICHT zum Inhalts-Hash, siehe contentOf().
//
// Kanonisch heißt: geprüft (validate.js), Parameter vollständig ausgefüllt und gerundet, Elemente nach
// (Zeile, Spalte, Typ) sortiert, Metadaten bereinigt. Nur ein kanonisches Dokument hat einen Hash.

import { ELEMENT_GLYPHS } from '../sim/glyphs.js';
import { parseMap } from '../sim/tilemap.js';
import { TYPE_ORDER } from '../sim/elements/schema.js';
import { sha256Hex } from './sha256.js';
import { DOC_VERSION } from './limits.js';

/** Text mit sortierten Schlüsseln, sonst nichts Zufälliges — Grundlage des Hashs */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Reihenfolge der Elemente im kanonischen Dokument: Zeile, Spalte, Typ */
export const compareElements = (a, b) => a.ty - b.ty || a.tx - b.tx || TYPE_ORDER[a.type] - TYPE_ORDER[b.type];

/**
 * Der Teil des Dokuments, der das Spiel bestimmt (ohne meta).
 * `checkpointOrder` gehört ABSICHTLICH nicht dazu: DOC_VERSION steht seit Projektbeginn unverändert auf 1
 * und es gibt keine Migration — jedes zusätzliche Hash-Feld würde den Hash JEDES bestehenden Levels ändern
 * und damit alle vorhandenen Verifizierungen entwerten, auch für Level ohne eine einzige Checkpoint-Nummer.
 * Die Kehrseite: checkpointOrder ließe sich nach einer Verifizierung ändern, ohne den Hash zu ändern — das
 * kann aber nur die Reihenfolge bereits vorhandener Checkpoints verschieben, nie einen Level leichter oder
 * ein Ziel unerreichbar machen, also kein Werkzeug, um eine Prüfung zu umgehen.
 */
export function contentOf(doc) {
  return {
    v: DOC_VERSION,
    speedClass: doc.speedClass,
    width: doc.width,
    height: doc.height,
    tiles: doc.tiles,
    elements: doc.elements,
  };
}

/**
 * Inhalts-Hash: SHA-256 über den kanonischen Spielinhalt. Der Server berechnet ihn selbst aus dem
 * geprüften Dokument, ein vom Client mitgeschickter Wert wird nie übernommen.
 * Erwartet ein kanonisches Dokument (Ergebnis von validateDoc).
 */
export function contentHash(doc) {
  return sha256Hex(canonicalJson(contentOf(doc)));
}

/** Das Dokument in der Form, die die Engine kennt (dieselbe wie ein generiertes Level) */
export function docToLevel(doc) {
  return {
    version: doc.version,
    params: { speedClass: doc.speedClass },
    biome: doc.meta.biome,
    width: doc.width,
    height: doc.height,
    rows: doc.tiles,
    entities: doc.elements.map((e) => ({ ...e })),
    checkpointOrder: (doc.checkpointOrder || []).map((o) => ({ ...o })),
    placements: [],
    custom: true,
    hash: contentHash(doc),
  };
}

const GLYPH_CHARS = new Set(Object.keys(ELEMENT_GLYPHS));

/**
 * Ein Engine-Level (etwa ein generiertes) als Dokument: Zeichen für Elemente werden zu echten Elementen,
 * die Elementliste behält die Reihenfolge der Welt. Das Ergebnis ist NICHT kanonisch — durch validateDoc()
 * schicken. Dient dem Editor ("Level aus Seed als Vorlage") und den Tests.
 */
export function levelToDoc(level, meta = {}) {
  const map = parseMap(level.rows, { entities: level.entities });
  return {
    version: DOC_VERSION,
    meta: { biome: level.biome, ...meta },
    speedClass: level.params.speedClass,
    width: map.w,
    height: map.h,
    tiles: level.rows.map((row) => [...row].map((ch) => (GLYPH_CHARS.has(ch) ? '.' : ch)).join('')),
    elements: map.entities.map((e) => ({ ...e })),
    checkpointOrder: (level.checkpointOrder || []).map((o) => ({ ...o })),
  };
}

/**
 * Leeres Startdokument für den Editor: ebener Boden, links der Start, rechts das Ziel.
 * Ist bereits kanonisch und besteht die Prüfung.
 */
export function emptyDoc({ width = 60, height = 30, speedClass = 'normal', biome = 'meadow', name = '' } = {}) {
  const floor = height - 4;
  const tiles = Array.from({ length: height }, (_, y) => (y >= floor ? '#'.repeat(width) : '.'.repeat(width)));
  const put = (x, y, ch) => { tiles[y] = tiles[y].slice(0, x) + ch + tiles[y].slice(x + 1); };
  put(2, floor - 1, 'S');
  put(width - 3, floor - 1, 'E');
  return {
    version: DOC_VERSION,
    meta: { name, description: '', tags: [], difficulty: null, biome },
    speedClass,
    width,
    height,
    tiles,
    elements: [],
    checkpointOrder: [],
  };
}
