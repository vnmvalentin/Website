// Bausteine der Level-Tests: kleine Dokumente zum Zurechtbiegen.
//
// emptyDoc() ist 60 × 30: Boden ab Zeile 26, Start bei (2|25), Ziel bei (57|25). Luft für Elemente: Zeilen 0–24.

import { emptyDoc } from '../format.js';
import { validateDoc } from '../validate.js';

export const AIR = 20;   // eine freie Zeile mitten in der Luft

export function setTile(doc, x, y, ch) {
  doc.tiles[y] = doc.tiles[y].slice(0, x) + ch + doc.tiles[y].slice(x + 1);
  return doc;
}

/** Frisches Dokument, von `mutate` verändert */
export function docWith(mutate, opts) {
  const doc = emptyDoc(opts);
  mutate?.(doc);
  return doc;
}

/** Prüft ein Dokument, das abgelehnt werden MUSS, und liefert die Fehlertexte */
export function errorsOf(input, opts) {
  const res = validateDoc(input, opts);
  if (res.ok) throw new Error('Das Dokument hätte abgelehnt werden müssen');
  return res.errors;
}

/** Prüft ein Dokument, das angenommen werden MUSS */
export function accept(input, opts) {
  const res = validateDoc(input, opts);
  if (!res.ok) throw new Error(`Das Dokument hätte angenommen werden müssen: ${res.errors.join(' | ')}`);
  return res;
}
