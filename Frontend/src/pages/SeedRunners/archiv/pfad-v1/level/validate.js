// Prüfung eines Level-Dokuments — die EINZIGE Stelle, die entscheidet, ob ein Level zulässig ist. Der Editor
// ruft sie beim Bauen, der Server bei jedem Upload; er glaubt nie dem, was der Client vorher geprüft hat.
//
// Ergebnis: entweder Fehlerliste (Deutsch, für Menschen) oder das KANONISCHE Dokument samt Hash,
// Warnungen und Engine-Level. Prüfungen in dieser Reihenfolge:
//   1. Größe und Feldnamen, Formatversion, Tempo-Klasse
//   2. Raster (Maße, Zeichen, genau ein Start, mindestens ein Ziel)
//   3. Elemente (bekannter Typ, Parameter im Schema, Lage, keine zwei auf einer Kachel, Portale paarig)
//   4. Metadaten
//   5. Rauchtest der Engine (nur wenn bis hierhin alles gut ist)

import { isSpeedClass } from '../sim/classes.js';
import { BIOME_IDS } from '../gen/biomes.js';
import { ELEMENT_SCHEMA, normalizeParams } from '../sim/elements/schema.js';
import { DOC_VERSION, LIMITS, TILE_CHARS } from './limits.js';
import { compareElements, docToLevel } from './format.js';
import { lintDoc } from './lint.js';
import { smokeTest } from './smoke.js';

const TOP_KEYS = new Set(['version', 'meta', 'speedClass', 'width', 'height', 'tiles', 'elements', 'checkpointOrder']);
const META_KEYS = new Set(['name', 'description', 'tags', 'difficulty', 'biome']);
const DEFAULT_BIOME = 'meadow';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Steuerzeichen (außer Zeilenumbruch, wenn erlaubt) haben in Namen und Texten nichts zu suchen */
function hasControlChars(text, allowNewline) {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if ((c < 32 && !(allowNewline && c === 10)) || c === 127) return true;
  }
  return false;
}

const tidy = (text) => text.replace(/[ \t]+/g, ' ').trim();

function cleanMeta(meta, requireName, add) {
  if (meta !== undefined && !isObject(meta)) {
    add('„meta“ muss ein Objekt sein.');
    return null;
  }
  const m = meta || {};
  for (const key of Object.keys(m)) if (!META_KEYS.has(key)) add(`Unbekannte Angabe „${key}“ in den Metadaten.`);
  const out = { name: '', description: '', tags: [], difficulty: null, biome: DEFAULT_BIOME };

  if (m.name !== undefined) {
    if (typeof m.name !== 'string' || hasControlChars(m.name, false)) add('Der Levelname enthält ungültige Zeichen.');
    else out.name = tidy(m.name);
  }
  if (out.name.length > LIMITS.nameMax) add(`Der Levelname darf höchstens ${LIMITS.nameMax} Zeichen haben.`);
  if (requireName && out.name.length < LIMITS.nameMin) add(`Der Levelname braucht mindestens ${LIMITS.nameMin} Zeichen.`);

  if (m.description !== undefined) {
    if (typeof m.description !== 'string' || hasControlChars(m.description, true)) add('Die Beschreibung enthält ungültige Zeichen.');
    else out.description = m.description.trim();
  }
  if (out.description.length > LIMITS.descriptionMax) add(`Die Beschreibung darf höchstens ${LIMITS.descriptionMax} Zeichen haben.`);

  if (m.tags !== undefined) {
    if (!Array.isArray(m.tags) || m.tags.length > LIMITS.maxTags) add(`Höchstens ${LIMITS.maxTags} Tags.`);
    else {
      const seen = new Set();
      for (const raw of m.tags) {
        const tag = typeof raw === 'string' ? tidy(raw).toLowerCase() : '';
        if (tag.length < LIMITS.tagMin || tag.length > LIMITS.tagMax || hasControlChars(tag, false)) {
          add(`Ein Tag braucht ${LIMITS.tagMin}–${LIMITS.tagMax} Zeichen.`);
          break;
        }
        if (!seen.has(tag)) {
          seen.add(tag);
          out.tags.push(tag);
        }
      }
    }
  }

  if (m.difficulty !== undefined && m.difficulty !== null) {
    if (!Number.isInteger(m.difficulty) || m.difficulty < 1 || m.difficulty > 5) add('Die Schwierigkeit ist eine Zahl von 1 bis 5.');
    else out.difficulty = m.difficulty;
  }

  if (m.biome !== undefined) {
    if (!BIOME_IDS.includes(m.biome)) add(`Unbekanntes Biom „${String(m.biome)}“.`);
    else out.biome = m.biome;
  }
  return out;
}

/**
 * @param {unknown} input  das Dokument, wie es vom Editor oder Client kommt
 * @param {{ requireName?: boolean, smoke?: boolean, limits?: object }} [opts]
 *   requireName  für die Veröffentlichung: Levelname Pflicht (im Entwurf darf er fehlen)
 *   smoke        Rauchtest der Engine (Standard: ja; der Editor lässt ihn beim Tippen weg)
 *   limits       überschreibt Teile von LIMITS — nur für Tests (generierte Level sind breiter als erlaubt)
 * @returns {{ ok: false, errors: string[] } | { ok: true, doc: object, level: object, hash: string, warnings: object[] }}
 */
export function validateDoc(input, { requireName = false, smoke = true, limits } = {}) {
  const L = limits ? { ...LIMITS, ...limits } : LIMITS;
  if (!isObject(input)) return { ok: false, errors: ['Das Level ist kein gültiges Dokument.'] };

  let bytes;
  try {
    bytes = new TextEncoder().encode(JSON.stringify(input)).length;
  } catch {
    return { ok: false, errors: ['Das Level ist kein gültiges Dokument.'] };
  }
  if (bytes > L.maxBytes) {
    return { ok: false, errors: [`Das Level ist zu groß (${Math.round(bytes / 1000)} KB, erlaubt sind ${L.maxBytes / 1000} KB).`] };
  }

  const errors = [];
  const add = (msg) => { if (errors.length < L.maxErrors) errors.push(msg); };

  for (const key of Object.keys(input)) if (!TOP_KEYS.has(key)) add(`Unbekanntes Feld „${key}“.`);
  if (input.version !== DOC_VERSION) add(`Es wird Formatversion ${DOC_VERSION} erwartet.`);
  if (typeof input.speedClass !== 'string' || !isSpeedClass(input.speedClass)) add('Die Tempo-Klasse fehlt oder ist unbekannt.');

  // ── Raster ──
  const { width, height } = input;
  const dimsOk = Number.isInteger(width) && Number.isInteger(height)
    && width >= L.minWidth && width <= L.maxWidth
    && height >= L.minHeight && height <= L.maxHeight;
  if (!dimsOk) {
    add(`Das Level muss ${L.minWidth}–${L.maxWidth} Kacheln breit und ${L.minHeight}–${L.maxHeight} Kacheln hoch sein.`);
  }

  let tiles = null;
  const counts = { S: 0, C: 0, G: 0, E: 0 };
  if (dimsOk) {
    if (!Array.isArray(input.tiles) || input.tiles.length !== height) {
      add(`Das Raster braucht genau ${height} Zeilen.`);
    } else {
      let ok = true;
      for (let y = 0; y < height && ok; y++) {
        const row = input.tiles[y];
        if (typeof row !== 'string' || row.length !== width) {
          add(`Rasterzeile ${y + 1} braucht genau ${width} Zeichen.`);
          ok = false;
          break;
        }
        for (let x = 0; x < width; x++) {
          const ch = row[x];
          if (!TILE_CHARS.includes(ch)) {
            add(`Unbekanntes Zeichen im Raster (Spalte ${x + 1}, Zeile ${y + 1}).`);
            ok = false;
            break;
          }
          if (ch === 'S' || ch === 'C' || ch === 'G' || ch === 'E') counts[ch]++;
        }
      }
      if (ok) tiles = input.tiles;
    }
  }
  if (tiles) {
    if (counts.S === 0) add('Das Level braucht einen Startpunkt.');
    else if (counts.S > 1) add('Das Level darf nur einen Startpunkt haben.');
    if (counts.E === 0) add('Das Level braucht mindestens ein Ziel.');
    if (counts.E > L.maxFinish) add(`Höchstens ${L.maxFinish} Zielkacheln.`);
    if (counts.C > L.maxCheckpoints) add(`Höchstens ${L.maxCheckpoints} Checkpoints.`);
    if (counts.G > L.maxAnchors) add(`Höchstens ${L.maxAnchors} Greifanker.`);
  }

  // ── Checkpoint-Reihenfolge ──
  // Optional: normalerweise zählt die Position (links nach rechts). Bei einem senkrechten Level (Turm) kann
  // das die falsche Reihenfolge ergeben (ein tieferes Stockwerk liegt zufällig weiter rechts) — dann kann
  // jeder Checkpoint eine eigene Nummer bekommen. Entweder ALLE oder KEINER: eine Mischung wäre nicht
  // eindeutig, welche Regel für die unnummerierten gilt.
  const checkpointOrder = [];
  if (input.checkpointOrder !== undefined && !Array.isArray(input.checkpointOrder)) {
    add('„checkpointOrder“ muss eine Liste sein.');
  } else if (tiles && input.checkpointOrder?.length) {
    const cpPositions = new Set();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (tiles[y][x] === 'C') cpPositions.add(`${x},${y}`);
    const seenPos = new Set();
    const seenOrder = new Set();
    let bad = false;
    input.checkpointOrder.forEach((raw, i) => {
      if (bad || !isObject(raw) || !Number.isInteger(raw.tx) || !Number.isInteger(raw.ty) || !Number.isInteger(raw.order)) {
        add(`Eintrag ${i + 1} der Checkpoint-Reihenfolge ist ungültig.`); bad = true; return;
      }
      const key = `${raw.tx},${raw.ty}`;
      if (!cpPositions.has(key)) { add(`Die Nummer für (${raw.tx}|${raw.ty}) zeigt auf keinen Checkpoint.`); bad = true; return; }
      if (seenPos.has(key)) { add(`Der Checkpoint bei (${raw.tx}|${raw.ty}) hat zwei Nummern.`); bad = true; return; }
      if (raw.order < 1 || raw.order > 999) { add(`Die Checkpoint-Nummer bei (${raw.tx}|${raw.ty}) muss zwischen 1 und 999 liegen.`); bad = true; return; }
      if (seenOrder.has(raw.order)) { add(`Die Nummer ${raw.order} kommt bei zwei Checkpoints vor.`); bad = true; return; }
      seenPos.add(key);
      seenOrder.add(raw.order);
      checkpointOrder.push({ tx: raw.tx, ty: raw.ty, order: raw.order });
    });
    if (!bad && seenPos.size !== cpPositions.size) {
      add(`${cpPositions.size - seenPos.size} Checkpoint(s) ohne Nummer, obwohl andere schon nummeriert sind — entweder alle nummerieren oder keinen.`);
    }
  }

  // ── Elemente ──
  const elements = [];
  if (!Array.isArray(input.elements)) {
    add('Die Elementliste fehlt.');
  } else if (input.elements.length > L.maxElements) {
    add(`Höchstens ${L.maxElements} Elemente (hier ${input.elements.length}).`);
  } else if (tiles) {
    const taken = new Set();
    input.elements.forEach((raw, i) => {
      if (!isObject(raw)) { add(`Element ${i + 1} ist kein Objekt.`); return; }
      const schema = typeof raw.type === 'string' && Object.hasOwn(ELEMENT_SCHEMA, raw.type) ? ELEMENT_SCHEMA[raw.type] : null;
      if (!schema) { add(`Element ${i + 1}: Unbekannter Typ „${String(raw.type)}“.`); return; }
      const { tx, ty } = raw;
      if (!Number.isInteger(tx) || !Number.isInteger(ty) || tx < 0 || ty < 0 || tx >= width || ty >= height) {
        add(`${schema.label} (Element ${i + 1}) liegt außerhalb des Levels.`);
        return;
      }
      const where = `${schema.label} bei (${tx}|${ty})`;
      const res = normalizeParams(raw.type, raw);
      if (!res.ok) { res.errors.forEach((m) => add(`${where}: ${m}`)); return; }

      const ch = tiles[ty][tx];
      if (schema.anchor === 'air' && ch !== '.') add(`${where} muss auf einer freien Kachel sitzen.`);
      else if (schema.anchor === 'airOrSolid' && ch !== '.' && ch !== '#') add(`${where} muss auf einer freien oder festen Kachel sitzen.`);
      const key = ty * width + tx;
      if (taken.has(key)) add(`Bei (${tx}|${ty}) liegen zwei Elemente übereinander.`);
      taken.add(key);
      elements.push({ type: raw.type, tx, ty, ...res.clean });
    });

    // Portale: Kennungen eindeutig, jedes zeigt auf einen Partner, der zurückzeigt
    const portals = elements.filter((e) => e.type === 'portal');
    const byId = new Map();
    for (const p of portals) {
      if (byId.has(p.id)) add(`Die Portal-Kennung „${p.id}“ kommt doppelt vor.`);
      byId.set(p.id, p);
    }
    for (const p of portals) {
      const mate = byId.get(p.pair);
      if (!mate) add(`Das Portal bei (${p.tx}|${p.ty}) hat keinen Partner.`);
      else if (mate.pair !== p.id) add(`Das Portal bei (${p.tx}|${p.ty}) und sein Partner zeigen nicht aufeinander.`);
    }
  }

  const meta = cleanMeta(input.meta, requireName, add);
  if (errors.length || !tiles || !meta) return { ok: false, errors };

  // ── Kanonisches Dokument ──
  elements.sort(compareElements);
  // Der Laser sitzt in einem festen Block; die Engine macht die Kachel ohnehin fest. Im Dokument steht dort Luft,
  // damit "Laser auf Luft" und "Laser auf Block" dasselbe Level sind.
  const canonTiles = tiles.slice();
  for (const e of elements) {
    if (e.type === 'laser' && canonTiles[e.ty][e.tx] === '#') {
      canonTiles[e.ty] = `${canonTiles[e.ty].slice(0, e.tx)}.${canonTiles[e.ty].slice(e.tx + 1)}`;
    }
  }
  checkpointOrder.sort((a, b) => a.ty - b.ty || a.tx - b.tx);
  const doc = { version: DOC_VERSION, meta, speedClass: input.speedClass, width, height, tiles: canonTiles, elements, checkpointOrder };
  const level = docToLevel(doc);

  if (smoke) {
    const res = smokeTest(level);
    if (!res.ok) return { ok: false, errors: [res.error] };
  }
  return { ok: true, doc, level, hash: level.hash, warnings: lintDoc(doc) };
}
