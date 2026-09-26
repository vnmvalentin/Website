// Die Welt hinter der Editor-Ansicht: aus dem Arbeits-Dokument wird — ohne je abzustürzen — eine Sim-Welt, die
// der Editor mit denselben Zeichenfunktionen malt wie das Spiel (client/render.js, client/drawElements.js).
//
// Das Arbeits-Dokument darf unfertig sein (Portal ohne Partner, Element mit unmöglichem Wert, kein Start).
// Für die Vorschau wird es deshalb zurechtgestutzt: Was die Engine nicht aufnehmen kann, fehlt in der Welt und
// steht stattdessen in `issues` (der Editor markiert die Stelle). Die STRENGE Prüfung bleibt validateDoc.

import { normalizeParams, ELEMENT_SCHEMA } from '../sim/elements/schema.js';
import { createLevelWorld } from '../sim/levelWorld.js';
import { parseMap } from '../sim/tilemap.js';

/** Die erste freie Kachel [x, y] (Zeilen von oben, dann von links) oder null */
function firstAir(rows) {
  for (let y = 0; y < rows.length; y++) {
    const x = rows[y].indexOf('.');
    if (x >= 0) return [x, y];
  }
  return null;
}

/**
 * @param {object} doc  Arbeits-Dokument
 * @returns {{ world: object | null, map: object, issues: { tx: number, ty: number, message: string }[], startFixed: boolean, error?: string }}
 *   map    immer vorhanden (für die Kacheln); world nur, wenn die Engine die Elemente aufnimmt
 */
export function buildPreview(doc) {
  const issues = [];
  const issue = (tx, ty, message) => issues.push({ tx, ty, message });

  // Raster: genau ein Start (für die Vorschau; fehlt einer, wird an der ersten freien Kachel einer angenommen)
  const rows = doc.tiles.slice();
  let startFixed = false;
  let seen = false;
  for (let y = 0; y < rows.length; y++) {
    if (!rows[y].includes('S')) continue;
    if (seen) rows[y] = rows[y].replace(/S/g, '.');
    else {
      const first = rows[y].indexOf('S');
      rows[y] = rows[y].replace(/S/g, (_, i) => (i === first ? 'S' : '.'));
      seen = true;
    }
  }
  if (!seen) {
    startFixed = true;
    const at = firstAir(rows);
    if (at) rows[at[1]] = `${rows[at[1]].slice(0, at[0])}S${rows[at[1]].slice(at[0] + 1)}`;
  }

  // Elemente: nur, was die Engine aufnimmt
  const seenAnchors = new Set();
  const candidates = [];
  for (const e of doc.elements) {
    const res = normalizeParams(e.type, e);
    if (!res.ok) { issue(e.tx, e.ty, res.errors[0]); continue; }
    const key = `${e.tx},${e.ty}`;
    if (seenAnchors.has(key)) { issue(e.tx, e.ty, 'Zwei Elemente auf einer Kachel.'); continue; }
    seenAnchors.add(key);
    const ch = doc.tiles[e.ty]?.[e.tx];
    const { anchor } = ELEMENT_SCHEMA[e.type];
    if ((anchor === 'air' && ch !== '.') || (anchor === 'airOrSolid' && ch !== '.' && ch !== '#')) {
      issue(e.tx, e.ty, 'Das Element sitzt nicht auf einer freien Kachel.');
      continue;
    }
    candidates.push({ type: e.type, tx: e.tx, ty: e.ty, ...res.clean });
  }
  // Portale brauchen einen Partner, der zurückzeigt
  const portals = new Map(candidates.filter((e) => e.type === 'portal').map((e) => [e.id, e]));
  const entities = candidates.filter((e) => {
    if (e.type !== 'portal') return true;
    const mate = portals.get(e.pair);
    if (!mate || mate.pair !== e.id) { issue(e.tx, e.ty, 'Portal ohne Partner.'); return false; }
    return true;
  });

  const level = { params: { speedClass: doc.speedClass }, rows, entities, checkpointOrder: doc.checkpointOrder };
  try {
    const world = createLevelWorld(level);
    return { world, map: world.map, issues, startFixed };
  } catch (e) {
    // Die Engine hat trotzdem etwas abgelehnt: wenigstens die Kacheln zeigen
    let map;
    try {
      map = parseMap(rows, { entities: [] });
    } catch {
      map = parseMap(rows.map((r) => r.replace(/[^.#IW><=SCGE]/g, '.')), { entities: [] });
    }
    return { world: null, map, issues, startFixed, error: e.message };
  }
}
