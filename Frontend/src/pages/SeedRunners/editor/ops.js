// Operationen auf dem Arbeits-Dokument des Editors. Alle sind REINE Funktionen: Sie bekommen ein Dokument und
// liefern ein neues (oder dasselbe, wenn sich nichts ändert) — nie wird ein Dokument verändert. Das macht
// Undo/Redo billig (die Verläufe teilen Zeilen und Elemente) und die Logik ohne Browser testbar.
//
// Das Arbeits-Dokument hat die Form des Level-Dokuments (level/format.js), muss aber nicht gültig sein: Mitten
// im Bauen fehlt vielleicht noch das Ziel, oder ein Portal wartet auf seinen Partner. Geprüft wird erst mit
// validateDoc() (Testspiel, Verifizierung, Veröffentlichung).
//
// Regeln, die hier gelten, damit das Dokument möglichst gültig BLEIBT:
//   · Ein Element sitzt auf seiner Ankerkachel; ein fester Block darauf entfernt es (außer Zonen und Laser)
//   · Pro Ankerkachel höchstens ein Element
//   · Es gibt genau einen Start (S). Einen neuen setzen versetzt ihn; überschreiben, radieren oder verschieben geht nicht
//   · Portale gibt es nur als Paar; ein Portal löschen löscht beide

import { ELEMENT_SCHEMA, normalizeParams, footprintOf, PATH_LIMITS } from '../sim/elements/schema.js';
import { LIMITS, TILE_CHARS } from '../level/limits.js';
import { compareElements } from '../level/format.js';
import { normRect, rectContains } from './geometry.js';
import { cosTurns, sinTurns } from '../sim/trig.js';

/** Kacheln, gegen die man voll läuft (wie isSolidKind in sim/glyphs.js) */
const SOLID_CHARS = '#IW><';
export const isSolidChar = (ch) => SOLID_CHARS.includes(ch);
/** Sonderzeichen, die keine Kachelart sind */
export const MARKER_CHARS = 'SCGE';

export const inBounds = (doc, x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < doc.width && y < doc.height;
export const tileAt = (doc, x, y) => (inBounds(doc, x, y) ? doc.tiles[y][x] : null);

// ── Elemente finden ─────────────────────────────────────────────────────────

export const elementIndexAt = (doc, tx, ty) => doc.elements.findIndex((e) => e.tx === tx && e.ty === ty);
export const elementAt = (doc, tx, ty) => doc.elements[elementIndexAt(doc, tx, ty)] || null;

/** Parameter mit Standardwerten aufgefüllt — auch für Elemente, die (noch) nicht ganz gültig sind */
export function paramsOf(el) {
  const res = normalizeParams(el.type, el);
  if (res.ok) return res.clean;
  const out = {};
  for (const [key, p] of Object.entries(ELEMENT_SCHEMA[el.type].params)) {
    if (el[key] !== undefined) out[key] = el[key];
    else if (p.default !== undefined && !p.optional) out[key] = p.default;
  }
  return out;
}

/** Die Fläche, die ein Element ab seinem Anker einnimmt: { x0, y0, x1, y1 } in Kacheln */
export function footprintRect(el) {
  const { w, h } = footprintOf(el.type, paramsOf(el));
  return { x0: el.tx, y0: el.ty, x1: el.tx + w - 1, y1: el.ty + h - 1 };
}

// Elemente mit einer Fläche über ihren Anker hinaus
const AREA_TYPES = new Set(['fallingBlock', 'mover', 'wind', 'gravityZone']);

/**
 * Kachel, auf der eine Säge auf Kreisbahn tatsächlich GEZEICHNET wird: Die Vorschau (previewWorld.js) baut eine
 * frische Sim-Welt bei Tick 0, `sim/elements/saw.js` setzt die Säge dort auf `cx + orbit·cosTurns(phase)`,
 * `cy + orbit·sinTurns(phase)` — bei jedem Radius ≥ 1 (das Schema erzwingt das) NIE die Ankerkachel selbst. Ein
 * Klick auf die sichtbare Säge traf deshalb nie `elementAt()`, das nur die Ankerkachel kennt — die Kreisbahn-
 * Säge ließ sich nicht mehr auswählen. Dieselbe Formel hier macht die sichtbare Stelle mit-klickbar.
 */
function orbitRestTile(el) {
  if (el.type !== 'saw' || el.orbit === undefined || el.path) return null;
  const turns = el.phase || 0;
  return { tx: el.tx + Math.round(el.orbit * cosTurns(turns)), ty: el.ty + Math.round(el.orbit * sinTurns(turns)) };
}

/** Das Element unter dem Zeiger: erst ein Anker genau hier, dann eine Fläche (Zonen, breite Blöcke, Plattformen) */
export function hitElement(doc, x, y) {
  const exact = elementAt(doc, x, y);
  if (exact) return exact;
  for (let i = doc.elements.length - 1; i >= 0; i--) {
    const el = doc.elements[i];
    if (AREA_TYPES.has(el.type) && rectContains(footprintRect(el), x, y)) return el;
    const orbitTile = orbitRestTile(el);
    if (orbitTile && orbitTile.tx === x && orbitTile.ty === y) return el;
  }
  return null;
}

export const elementsInRect = (doc, r) => doc.elements.filter((e) => rectContains(r, e.tx, e.ty));

// ── Kacheln ─────────────────────────────────────────────────────────────────

function findChar(doc, ch) {
  for (let y = 0; y < doc.height; y++) {
    const x = doc.tiles[y].indexOf(ch);
    if (x >= 0) return [x, y];
  }
  return null;
}

/** Portal-Elemente und ihr Partner: alle, deren Kennung in `ids` steckt oder deren Partner darin steckt */
function withPartners(doc, removed) {
  const ids = new Set(removed.filter((e) => e.type === 'portal').flatMap((e) => [e.id, e.pair]));
  return ids.size ? doc.elements.filter((e) => e.type === 'portal' && ids.has(e.id)) : [];
}

/**
 * Setzt Kacheln. `changes` ist eine Map "y * Breite + x" → Zeichen. Wendet die Regeln des Kopfes an: ein neuer
 * Start versetzt den alten, ein fester Block entfernt Elemente, die Luft brauchen.
 */
function applyTileChanges(doc, changes) {
  const w = doc.width;
  const effective = new Map();
  for (const [key, ch] of changes) {
    const x = key % w;
    const y = Math.floor(key / w);
    if (y < 0 || y >= doc.height || doc.tiles[y][x] === ch || !TILE_CHARS.includes(ch)) continue;
    // Der Start lässt sich nur versetzen (einen neuen setzen), nie überschreiben oder löschen: sonst ginge er
    // beim Malen aus Versehen verloren
    if (doc.tiles[y][x] === 'S') continue;
    effective.set(key, ch);
  }
  if (effective.size === 0) return doc;

  // Nur ein Start: der neue ersetzt den alten
  for (const [, ch] of effective) {
    if (ch !== 'S') continue;
    const old = findChar(doc, 'S');
    if (old) {
      const oldKey = old[1] * w + old[0];
      if (!effective.has(oldKey)) effective.set(oldKey, '.');
    }
    break;
  }

  const rowsToChange = new Map();
  for (const [key, ch] of effective) {
    const y = Math.floor(key / w);
    if (!rowsToChange.has(y)) rowsToChange.set(y, doc.tiles[y].split(''));
    rowsToChange.get(y)[key % w] = ch;
  }
  const tiles = doc.tiles.slice();
  for (const [y, chars] of rowsToChange) tiles[y] = chars.join('');

  // Elemente, die auf ihrer Ankerkachel nicht mehr sitzen dürfen
  let removed = doc.elements.filter((e) => {
    const ch = effective.get(e.ty * w + e.tx);
    if (ch === undefined || ch === '.') return false;
    const { anchor } = ELEMENT_SCHEMA[e.type];
    if (anchor === 'any') return false;
    if (anchor === 'airOrSolid') return ch !== '#';
    return true;
  });
  removed = [...removed, ...withPartners(doc, removed).filter((p) => !removed.includes(p))];
  const elements = removed.length ? doc.elements.filter((e) => !removed.includes(e)) : doc.elements;

  // Eine Checkpoint-Nummer gehört zu ihrer Kachel: hört die auf, ein Checkpoint zu sein, verfällt die Nummer
  const oldOrder = doc.checkpointOrder || [];
  const checkpointOrder = oldOrder.filter((o) => {
    const ch = effective.get(o.ty * w + o.tx);
    return ch === undefined || ch === 'C';
  });
  return { ...doc, tiles, elements, ...(checkpointOrder.length !== oldOrder.length ? { checkpointOrder } : null) };
}

const keyOf = (doc, x, y) => y * doc.width + x;

/** Eine Kachel setzen ('.' = Luft). Außerhalb des Levels passiert nichts. */
export function setTile(doc, x, y, ch) {
  if (!inBounds(doc, x, y)) return doc;
  return applyTileChanges(doc, new Map([[keyOf(doc, x, y), ch]]));
}

/** Viele Kacheln [[x, y], …] auf einmal (Pinselstrich) */
export function paintCells(doc, cells, ch) {
  const changes = new Map();
  for (const [x, y] of cells) if (inBounds(doc, x, y)) changes.set(keyOf(doc, x, y), ch);
  return applyTileChanges(doc, changes);
}

/** Rechteck füllen. Der Start ist immer nur eine Kachel: Er landet in der oberen linken Ecke. */
export function fillRect(doc, rect, ch) {
  const r = clampRect(doc, rect);
  if (!r) return doc;
  if (ch === 'S') return setTile(doc, r.x0, r.y0, 'S');
  const changes = new Map();
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) changes.set(keyOf(doc, x, y), ch);
  return applyTileChanges(doc, changes);
}

/** Die explizite Nummer einer Checkpoint-Kachel, falls gesetzt (sonst undefined: Position entscheidet) */
export const getCheckpointOrder = (doc, x, y) => (doc.checkpointOrder || []).find((o) => o.tx === x && o.ty === y)?.order;

/**
 * Checkpoint-Nummer setzen oder löschen (order = undefined/null). Wirkt nur auf einer Checkpoint-Kachel;
 * eine fehlende oder unvollständige Angabe im ganzen Level lässt die Sim auf die Positions-Sortierung
 * zurückfallen (sim/tilemap.js) — hier wird nicht erzwungen, dass sofort alle nummeriert sind.
 */
export function setCheckpointOrder(doc, x, y, order) {
  if (tileAt(doc, x, y) !== 'C') return doc;
  const rest = (doc.checkpointOrder || []).filter((o) => !(o.tx === x && o.ty === y));
  if (order === undefined || order === null) {
    return rest.length === (doc.checkpointOrder || []).length ? doc : { ...doc, checkpointOrder: rest };
  }
  return { ...doc, checkpointOrder: [...rest, { tx: x, ty: y, order }] };
}

export function clampRect(doc, r) {
  const x0 = Math.max(0, r.x0);
  const y0 = Math.max(0, r.y0);
  const x1 = Math.min(doc.width - 1, r.x1);
  const y1 = Math.min(doc.height - 1, r.y1);
  return x0 > x1 || y0 > y1 ? null : { x0, y0, x1, y1 };
}

/**
 * Radierer an einer Kachel: entfernt ein Element mit Anker hier (ein Portal samt Partner), sonst die Kachel.
 * Der Start bleibt stehen.
 */
export function eraseAt(doc, x, y) {
  if (!inBounds(doc, x, y)) return doc;
  const el = elementAt(doc, x, y);
  if (el) return removeElement(doc, x, y);
  if (doc.tiles[y][x] === 'S') return doc;
  return setTile(doc, x, y, '.');
}

/** Radieren über viele Kacheln (Strich) */
export function eraseCells(doc, cells) {
  let out = doc;
  for (const [x, y] of cells) out = eraseAt(out, x, y);
  return out;
}

// ── Elemente setzen, ändern, entfernen ─────────────────────────────────────

/** Richtung, in die Spikes zeigen, wenn nichts anderes gewählt ist: weg von dem Block, an dem sie sitzen (wie spike.js) */
export function facingFor(doc, x, y) {
  const solid = (tx, ty) => {
    if (tx < 0 || tx >= doc.width) return true;
    if (ty < 0 || ty >= doc.height) return false;
    return isSolidChar(doc.tiles[ty][tx]);
  };
  if (solid(x, y + 1)) return 'up';
  if (solid(x, y - 1)) return 'down';
  if (solid(x - 1, y)) return 'right';
  if (solid(x + 1, y)) return 'left';
  return 'up';
}

/** Freie Kennung für ein neues Portalpaar: gibt { id, pair } für das ERSTE Portal zurück (das zweite tauscht sie) */
export function nextPortalIds(doc) {
  const used = new Set(doc.elements.filter((e) => e.type === 'portal').flatMap((e) => [e.id, e.pair]));
  for (let n = 1; n < 1000; n++) {
    if (!used.has(`p${n}`) && !used.has(`p${n}b`)) return { id: `p${n}`, pair: `p${n}b` };
  }
  return { id: `p${Date.now()}`, pair: `p${Date.now()}b` };
}

/** Ein neues Element mit Standardwerten. `given` überschreibt einzelne Parameter (Portal-Kennungen, Richtung …). */
export function defaultElement(doc, type, x, y, given = {}) {
  const schema = ELEMENT_SCHEMA[type];
  const base = { type, tx: x, ty: y };
  if (type === 'spike') base.dir = facingFor(doc, x, y);
  if (type === 'mover') base.path = [[0, 0], [6, 0]];
  if (type === 'portal') Object.assign(base, nextPortalIds(doc));
  const el = { ...base, ...given };
  const res = normalizeParams(type, el);
  // Sollte nie passieren (Standardwerte sind gültig); zur Sicherheit lieber ohne Ausfüllen als gar nicht
  return res.ok ? { type, tx: x, ty: y, ...res.clean, ...optionalKeys(schema, el) } : el;
}

// Angaben, die das Schema als optional führt (und normalizeParams deshalb nicht ausfüllt), bleiben erhalten
function optionalKeys(schema, el) {
  const out = {};
  for (const [key, p] of Object.entries(schema.params)) if (p.optional && el[key] !== undefined) out[key] = el[key];
  return out;
}

/**
 * Element auf Kachel (x, y) setzen; ein Element mit demselben Anker wird ersetzt.
 * @returns {{ doc: object, element?: object, error?: string }}
 */
export function placeElement(doc, type, x, y, given = {}) {
  const schema = ELEMENT_SCHEMA[type];
  if (!schema) return { doc, error: `Unbekanntes Element „${type}“.` };
  if (!inBounds(doc, x, y)) return { doc, error: 'Außerhalb des Levels.' };
  if (doc.elements.length >= LIMITS.maxElements && !elementAt(doc, x, y)) {
    return { doc, error: `Höchstens ${LIMITS.maxElements} Elemente.` };
  }
  const ch = doc.tiles[y][x];
  if (schema.anchor === 'air' && ch !== '.') return { doc, error: 'Hier ist die Kachel nicht frei.' };
  if (schema.anchor === 'airOrSolid' && ch !== '.' && ch !== '#') return { doc, error: 'Ein Laser sitzt auf freier Luft oder in einem Block.' };

  const element = defaultElement(doc, type, x, y, given);
  const without = elementIndexAt(doc, x, y) >= 0 ? removeElement(doc, x, y) : doc;
  return { doc: { ...without, elements: [...without.elements, element].sort(compareElements) }, element };
}

/** Entfernt das Element mit Anker (x, y); ein Portal nimmt seinen Partner mit */
export function removeElement(doc, x, y) {
  const el = elementAt(doc, x, y);
  if (!el) return doc;
  const gone = new Set([el, ...withPartners(doc, [el])]);
  return { ...doc, elements: doc.elements.filter((e) => !gone.has(e)) };
}

/**
 * Parameter eines Elements ändern. `patch` enthält neue Werte; `undefined` entfernt eine Angabe.
 * Die Säge kennt drei Bewegungsarten, die sich ausschließen — wer einen Pfad setzt, verliert die Kreisbahn und umgekehrt.
 */
export function updateElement(doc, x, y, patch) {
  const i = elementIndexAt(doc, x, y);
  if (i < 0) return doc;
  const next = { ...doc.elements[i] };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  if (next.type === 'saw') {
    if (patch.path !== undefined && patch.orbit === undefined) delete next.orbit;
    if (patch.orbit !== undefined && patch.path === undefined) delete next.path;
  }
  if (next.type === 'mover') next.path = normalizePath(next.path, next.mode);
  const elements = doc.elements.slice();
  elements[i] = next;
  return { ...doc, elements };
}

/** Pfad in die Form bringen, die das Schema verlangt: beginnt bei [0, 0], höchstens 16 Punkte, Kreisbahn geschlossen */
export function normalizePath(path, mode) {
  let pts = (path || [[0, 0], [6, 0]]).map(([dx, dy]) => [dx, dy]);
  pts[0] = [0, 0];
  if (mode === 'loop') {
    // letzter Punkt = erster; der Rest darf sich frei bewegen
    while (pts.length > PATH_LIMITS.maxPoints - 1) pts.splice(pts.length - 2, 1);
    const last = pts[pts.length - 1];
    if (pts.length < 3 || last[0] !== 0 || last[1] !== 0) pts.push([0, 0]);
  } else {
    pts = pts.slice(0, PATH_LIMITS.maxPoints);
    // aus einer geschlossenen Bahn wird beim Wechsel zu hin-und-her wieder eine offene: der Schlusspunkt fällt weg
    if (pts.length > 2) {
      const last = pts[pts.length - 1];
      if (last[0] === 0 && last[1] === 0) pts.pop();
    }
  }
  return pts;
}

/** Pfad eines Elements neu setzen (Pfad-Editor) */
export function setPath(doc, x, y, points) {
  const el = elementAt(doc, x, y);
  if (!el || !('path' in ELEMENT_SCHEMA[el.type].params)) return doc;
  return updateElement(doc, x, y, { path: normalizePath(points, el.type === 'mover' ? el.mode : undefined) });
}

// Pfadpunkte sind Versätze in Kacheln vom Anker des Elements. Der Griff eines Punktes sitzt auf der Kachel
// (Anker + Versatz); ein Klick auf die Kachel (cx, cy) ergibt also den Versatz (cx − tx, cy − ty).
const isClosedLoop = (el) => el.type === 'mover' && el.mode === 'loop';
const withinReach = (off) => Math.abs(off[0]) <= PATH_LIMITS.maxOffset && Math.abs(off[1]) <= PATH_LIMITS.maxOffset;

/** Hängt einen Punkt an den Pfad an (bei einer Kreisbahn vor den Schlusspunkt). Zu viele Punkte: unverändert. */
export function addPathPoint(doc, x, y, cx, cy) {
  const el = elementAt(doc, x, y);
  if (!el || !el.path) return doc;
  const off = [cx - el.tx, cy - el.ty];
  const base = isClosedLoop(el) ? el.path.slice(0, -1) : el.path;
  if (!withinReach(off) || base.length >= PATH_LIMITS.maxPoints - (isClosedLoop(el) ? 1 : 0)) return doc;
  return setPath(doc, x, y, [...base, off]);
}

/** Verschiebt Punkt `index` auf die Kachel (cx, cy). Der erste Punkt (das Element selbst) und der Schlusspunkt einer Kreisbahn bleiben. */
export function movePathPoint(doc, x, y, index, cx, cy) {
  const el = elementAt(doc, x, y);
  if (!el || !el.path || index <= 0 || index >= el.path.length) return doc;
  if (isClosedLoop(el) && index === el.path.length - 1) return doc;
  const off = [cx - el.tx, cy - el.ty];
  if (!withinReach(off) || (el.path[index][0] === off[0] && el.path[index][1] === off[1])) return doc;
  const pts = el.path.map((p) => [...p]);
  pts[index] = off;
  return setPath(doc, x, y, pts);
}

/** Entfernt Punkt `index` (nie den ersten, nie den Schlusspunkt; ein Pfad behält mindestens zwei Punkte) */
export function removePathPoint(doc, x, y, index) {
  const el = elementAt(doc, x, y);
  if (!el || !el.path || index <= 0 || index >= el.path.length) return doc;
  if (isClosedLoop(el) && index === el.path.length - 1) return doc;
  const remaining = el.path.length - 1;
  if (remaining < (isClosedLoop(el) ? 3 : 2)) return doc;
  return setPath(doc, x, y, el.path.filter((_, i) => i !== index));
}

// ── Bereiche: kopieren, verschieben, spiegeln ──────────────────────────────

/**
 * Was ein Bereich enthält: Kacheln (ohne Start) und Elemente mit Anker darin, relativ zur oberen linken Ecke.
 * Portale gehören nur als komplettes Paar dazu.
 */
/**
 * @param {object} doc
 * @param {object} rect
 * @param {{keepLonePortals?: boolean}} [opts]  keepLonePortals: ein Portal bleibt im Ausschnitt, auch wenn sein
 *   Partner außerhalb des Bereichs liegt. Für echtes Kopieren/Einfügen falsch (ein eingefügtes Portal ohne
 *   Partner wäre nutzlos) — aber genau das, was `moveRegion()` braucht: Wird nur EIN Ende eines Portalpaars
 *   verschoben, liegt der Partner per Definition außerhalb des verschobenen Bereichs, bleibt aber unangetastet
 *   im Dokument stehen. Ohne dieses Flag verschwand das Portal beim Ziehen spurlos (siehe moveRegion()).
 */
export function copyRegion(doc, rect, { keepLonePortals = false } = {}) {
  const r = clampRect(doc, normRectLike(rect));
  if (!r) return null;
  const tiles = [];
  for (let y = r.y0; y <= r.y1; y++) tiles.push(doc.tiles[y].slice(r.x0, r.x1 + 1).replace(/S/g, '.'));
  let elements = elementsInRect(doc, r);
  if (!keepLonePortals) {
    const ids = new Set(elements.filter((e) => e.type === 'portal').map((e) => e.id));
    elements = elements.filter((e) => e.type !== 'portal' || ids.has(e.pair));
  }
  const checkpointOrder = (doc.checkpointOrder || [])
    .filter((o) => rectContains(r, o.tx, o.ty))
    .map((o) => ({ ...o, tx: o.tx - r.x0, ty: o.ty - r.y0 }));
  return {
    w: r.x1 - r.x0 + 1,
    h: r.y1 - r.y0 + 1,
    tiles,
    elements: elements.map((e) => ({ ...e, tx: e.tx - r.x0, ty: e.ty - r.y0 })),
    checkpointOrder,
  };
}

function normRectLike(rect) {
  return rect.x0 !== undefined ? rect : normRect(rect.a, rect.b);
}

/**
 * Löscht die Kacheln und Elemente eines Bereichs (der Start bleibt).
 * @param {{keepPartners?: boolean}} [opts]  keepPartners: Der Partner eines gelöschten Portals bleibt stehen,
 *   auch wenn er außerhalb des Bereichs liegt. Für echtes Löschen falsch (ein übrig gebliebenes Portal ohne
 *   Partner ist nutzlos, das Aufräumen ist gewollt) — aber wie bei copyRegion() genau das, was moveRegion()
 *   braucht, wenn nur ein Ende eines Paars verschoben wird.
 */
export function clearRegion(doc, rect, { keepPartners = false } = {}) {
  const r = clampRect(doc, normRectLike(rect));
  if (!r) return doc;
  let out = doc;
  const changes = new Map();
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) if (doc.tiles[y][x] !== 'S') changes.set(keyOf(doc, x, y), '.');
  }
  out = applyTileChanges(out, changes);
  // Elemente (auch die auf schon freien Kacheln, etwa Zonen) im Bereich entfernen
  const removed = elementsInRect(out, r);
  const gone = new Set(keepPartners ? removed : [...removed, ...withPartners(out, removed)]);
  return gone.size ? { ...out, elements: out.elements.filter((e) => !gone.has(e)) } : out;
}

/**
 * Fügt einen Bereich (copyRegion) mit der oberen linken Ecke bei (x, y) ein. Was außerhalb des Levels läge, fällt weg.
 * Portale bekommen neue Kennungen, damit ein eingefügtes Paar nicht mit dem Original kollidiert — außer beim
 * Verschieben (`keepIds`), wo das Original schon weg ist.
 */
export function pasteRegion(doc, clip, x, y, { keepIds = false } = {}) {
  if (!clip) return doc;
  const changes = new Map();
  for (let ry = 0; ry < clip.h; ry++) {
    for (let rx = 0; rx < clip.w; rx++) {
      const tx = x + rx;
      const ty = y + ry;
      if (!inBounds(doc, tx, ty)) continue;
      // Der Start wird nie überschrieben: er bleibt, wo er ist
      if (doc.tiles[ty][tx] === 'S') continue;
      changes.set(keyOf(doc, tx, ty), clip.tiles[ry][rx]);
    }
  }
  let out = applyTileChanges(doc, changes);

  // Elemente im Zielbereich raus (sie werden ersetzt), dann die neuen hinein
  const target = { x0: x, y0: y, x1: x + clip.w - 1, y1: y + clip.h - 1 };
  const replaced = elementsInRect(out, target);
  const gone = new Set([...replaced, ...withPartners(out, replaced)]);
  const kept = gone.size ? out.elements.filter((e) => !gone.has(e)) : out.elements;

  // Neue Kennungen für eingefügte Portalpaare: alt → { id, pair } (beide Enden eines Paares hängen zusammen)
  const renamed = new Map();
  if (!keepIds) {
    const taken = new Set(kept.filter((e) => e.type === 'portal').flatMap((e) => [e.id, e.pair]));
    for (const e of clip.elements) {
      if (e.type !== 'portal' || renamed.has(e.id)) continue;
      let n = 1;
      while (taken.has(`p${n}`) || taken.has(`p${n}b`)) n++;
      const a = `p${n}`;
      const b = `p${n}b`;
      taken.add(a);
      taken.add(b);
      renamed.set(e.id, { id: a, pair: b });
      renamed.set(e.pair, { id: b, pair: a });
    }
  }

  const added = [];
  for (const e of clip.elements) {
    const el = { ...e, tx: e.tx + x, ty: e.ty + y };
    if (!inBounds(out, el.tx, el.ty)) continue;
    const ch = out.tiles[el.ty][el.tx];
    const { anchor } = ELEMENT_SCHEMA[el.type];
    if (anchor === 'air' && ch !== '.') continue;
    if (anchor === 'airOrSolid' && ch !== '.' && ch !== '#') continue;
    if (el.type === 'portal' && !keepIds) {
      const mapped = renamed.get(el.id);
      el.id = mapped.id;
      el.pair = mapped.pair;
    }
    added.push(el);
  }
  // Ein neu eingefügtes Portal, dessen Partner abgeschnitten wurde, hätte keinen — weglassen. Der Partner kann
  // aber auch schon (unverändert) im Dokument stehen — etwa beim Verschieben eines einzelnen Endes, `keepIds`,
  // siehe moveRegion() — deshalb wird gegen ALLE Portale geprüft, nicht nur gegen die gerade eingefügten.
  const ids = new Set([...kept, ...added].filter((e) => e.type === 'portal').map((e) => e.id));
  const complete = added.filter((e) => e.type !== 'portal' || ids.has(e.pair));
  const elements = [...kept, ...complete].sort(compareElements).slice(0, LIMITS.maxElements);

  // Checkpoint-Nummern im Zielbereich raus (ihre Kachel wird ersetzt), dann die aus dem Clip rein — nur für
  // Stellen, die hinterher wirklich ein Checkpoint sind (sonst passte die Kachel im Clip nicht zur Nummer)
  const oldOrder = (out.checkpointOrder || []).filter((o) => !rectContains(target, o.tx, o.ty));
  const newOrder = (clip.checkpointOrder || [])
    .map((o) => ({ ...o, tx: o.tx + x, ty: o.ty + y }))
    .filter((o) => inBounds(out, o.tx, o.ty) && out.tiles[o.ty][o.tx] === 'C');
  const checkpointOrder = [...oldOrder, ...newOrder];
  return { ...out, elements, checkpointOrder };
}

/**
 * Bereich verschieben: ausschneiden, an der neuen Stelle einfügen (Kennungen bleiben). Ein Portal, dessen
 * Partner außerhalb des verschobenen Bereichs steht, bleibt dabei ein gültiges Paar — `keepLonePortals`/
 * `keepPartners` verhindern, dass copyRegion()/clearRegion() es (fälschlich, wie für "richtiges" Ausschneiden)
 * als verwaist behandeln, obwohl der Partner nur unverschoben stehen bleibt.
 */
export function moveRegion(doc, rect, dx, dy) {
  const r = clampRect(doc, normRectLike(rect));
  if (!r || (dx === 0 && dy === 0)) return doc;
  const clip = copyRegion(doc, r, { keepLonePortals: true });
  const cleared = clearRegion(doc, r, { keepPartners: true });
  return pasteRegion(cleared, clip, r.x0 + dx, r.y0 + dy, { keepIds: true });
}

// ── Spiegeln ────────────────────────────────────────────────────────────────

const SWAP_H = { left: 'right', right: 'left', upLeft: 'upRight', upRight: 'upLeft', downLeft: 'downRight', downRight: 'downLeft' };
const SWAP_V = { up: 'down', down: 'up', upLeft: 'downLeft', downLeft: 'upLeft', upRight: 'downRight', downRight: 'upRight' };
const TILE_SWAP_H = { '<': '>', '>': '<' };

function mirrorElement(e, clip, axis) {
  const out = { ...e };
  const { w: fw, h: fh } = footprintOf(e.type, paramsOf(e));
  const schemaDir = ELEMENT_SCHEMA[e.type].params.dir;
  if (axis === 'h') {
    out.tx = clip.w - 1 - (e.tx + fw - 1);
    if (out.dir && SWAP_H[out.dir]) out.dir = SWAP_H[out.dir];
    if (out.path) out.path = out.path.map(([dx, dy]) => [-dx || 0, dy]);
    if (typeof out.ax === 'number') out.ax = -out.ax || 0;
  } else {
    out.ty = clip.h - 1 - (e.ty + fh - 1);
    // Ein Sprungpad kennt keine Richtung "nach unten": Es bleibt, wie es ist
    if (out.dir && SWAP_V[out.dir] && (!schemaDir || schemaDir.options.includes(SWAP_V[out.dir]))) out.dir = SWAP_V[out.dir];
    if (out.path) out.path = out.path.map(([dx, dy]) => [dx, -dy || 0]);
    if (typeof out.ay === 'number') out.ay = -out.ay || 0;
  }
  return out;
}

/** Ein kopierter Bereich, gespiegelt: 'h' links↔rechts, 'v' oben↔unten */
export function mirrorClip(clip, axis) {
  const tiles = axis === 'h'
    ? clip.tiles.map((row) => [...row].reverse().map((c) => TILE_SWAP_H[c] || c).join(''))
    : [...clip.tiles].reverse();
  const checkpointOrder = (clip.checkpointOrder || []).map((o) => (axis === 'h'
    ? { ...o, tx: clip.w - 1 - o.tx }
    : { ...o, ty: clip.h - 1 - o.ty }));
  return { ...clip, tiles, elements: clip.elements.map((e) => mirrorElement(e, clip, axis)), checkpointOrder };
}

/** Bereich an Ort und Stelle spiegeln */
export function mirrorRegion(doc, rect, axis) {
  const r = clampRect(doc, normRectLike(rect));
  if (!r) return doc;
  const clip = mirrorClip(copyRegion(doc, r), axis);
  return pasteRegion(clearRegion(doc, r), clip, r.x0, r.y0, { keepIds: true });
}

// ── Größe und Angaben ──────────────────────────────────────────────────────

/**
 * Level-Größe ändern. `alignX` 'left': der bisherige Inhalt bleibt links, Rest wird rechts angefügt/abgeschnitten;
 * 'right' umgekehrt. `alignY` 'bottom': Inhalt bleibt unten (neue Luft entsteht oben — meist das, was man will).
 */
export function resizeDoc(doc, width, height, { alignX = 'left', alignY = 'bottom' } = {}) {
  const w = Math.max(LIMITS.minWidth, Math.min(LIMITS.maxWidth, Math.round(width)));
  const h = Math.max(LIMITS.minHeight, Math.min(LIMITS.maxHeight, Math.round(height)));
  if (w === doc.width && h === doc.height) return doc;
  const shiftX = alignX === 'right' ? w - doc.width : 0;
  const shiftY = alignY === 'bottom' ? h - doc.height : 0;

  const tiles = [];
  for (let y = 0; y < h; y++) {
    const sy = y - shiftY;
    let row = '';
    for (let x = 0; x < w; x++) {
      const sx = x - shiftX;
      row += sx >= 0 && sx < doc.width && sy >= 0 && sy < doc.height ? doc.tiles[sy][sx] : '.';
    }
    tiles.push(row);
  }
  const elements = doc.elements
    .map((e) => ({ ...e, tx: e.tx + shiftX, ty: e.ty + shiftY }))
    .filter((e) => e.tx >= 0 && e.ty >= 0 && e.tx < w && e.ty < h);
  const ids = new Set(elements.filter((e) => e.type === 'portal').map((e) => e.id));
  const checkpointOrder = (doc.checkpointOrder || [])
    .map((o) => ({ ...o, tx: o.tx + shiftX, ty: o.ty + shiftY }))
    .filter((o) => o.tx >= 0 && o.ty >= 0 && o.tx < w && o.ty < h);
  return {
    ...doc,
    width: w,
    height: h,
    tiles,
    elements: elements.filter((e) => e.type !== 'portal' || ids.has(e.pair)).sort(compareElements),
    checkpointOrder,
  };
}

export const setSpeedClass = (doc, speedClass) => (doc.speedClass === speedClass ? doc : { ...doc, speedClass });
export const setMeta = (doc, patch) => ({ ...doc, meta: { ...doc.meta, ...patch } });
