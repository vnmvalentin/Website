// Verlauf für Rückgängig/Wiederholen. Reine Funktionen auf einem unveränderlichen Zustand
// { present, past, future }: Weil die Operationen (ops.js) Zeilen und Elemente teilen, kostet jeder Eintrag
// kaum Speicher — 100 Schritte auf einem großen Level sind unbedenklich.
//
// Ein Pinselstrich besteht aus vielen kleinen Änderungen, soll aber EIN Schritt sein: beginStroke merkt den
// Stand davor, `replace` ändert den aktuellen Stand ohne Eintrag, endStroke schreibt einen Eintrag, wenn sich
// etwas geändert hat.

export const HISTORY_LIMIT = 100;

export const createHistory = (doc) => ({ present: doc, past: [], future: [], base: null });

export const canUndo = (h) => h.past.length > 0;
export const canRedo = (h) => h.future.length > 0;

const trim = (past) => (past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past);

/** Ein abgeschlossener Schritt: der bisherige Stand wandert in die Vergangenheit */
export function commit(h, doc) {
  if (doc === h.present) return h;
  return { present: doc, past: trim([...h.past, h.present]), future: [], base: null };
}

/** Änderung ohne Eintrag (mitten im Strich) */
export function replace(h, doc) {
  return doc === h.present ? h : { ...h, present: doc };
}

export const beginStroke = (h) => (h.base ? h : { ...h, base: h.present });

export function endStroke(h) {
  if (!h.base) return h;
  if (h.base === h.present) return { ...h, base: null };
  return { present: h.present, past: trim([...h.past, h.base]), future: [], base: null };
}

export function undo(h) {
  if (!h.past.length) return h;
  const past = h.past.slice(0, -1);
  return { present: h.past[h.past.length - 1], past, future: [h.present, ...h.future], base: null };
}

export function redo(h) {
  if (!h.future.length) return h;
  const [next, ...future] = h.future;
  return { present: next, past: trim([...h.past, h.present]), future, base: null };
}

/** Ganz neuer Ausgangspunkt (anderer Entwurf geladen): kein Verlauf */
export const reset = (doc) => createHistory(doc);
