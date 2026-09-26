// Zustand des Arbeits-Dokuments samt Verlauf als Reducer (rein, testbar). Alles andere im Editor (Werkzeug,
// Auswahl, Ansicht) ist gewöhnlicher React-Zustand — nur das Dokument braucht Undo/Redo.
import * as H from './history.js';

export const initEditorState = (doc) => ({ hist: H.createHistory(doc) });

export function editorReducer(state, action) {
  switch (action.type) {
    case 'commit': return { hist: H.commit(state.hist, action.doc) };
    case 'stroke-begin': return { hist: H.beginStroke(state.hist) };
    case 'stroke-update': return { hist: H.replace(state.hist, action.doc) };
    case 'stroke-end': return { hist: H.endStroke(state.hist) };
    case 'undo': return { hist: H.undo(state.hist) };
    case 'redo': return { hist: H.redo(state.hist) };
    case 'load': return initEditorState(action.doc);
    default: return state;
  }
}
