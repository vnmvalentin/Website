// useCodeSichtbar.js — ob der Lobby-Code offen angezeigt wird (siehe raumCode.js). Alle Stellen einer Seite (Kopfzeile,
// Einladungslink) teilen denselben Schalter: Aufdecken an einer Stelle deckt überall auf.
import { useSyncExternalStore } from 'react';
import { codeSichtbar, setzeCodeSichtbar } from './raumCode.js';

const hoerer = new Set();
const abonnieren = (fn) => { hoerer.add(fn); return () => hoerer.delete(fn); };

export function useCodeSichtbar() {
  const offen = useSyncExternalStore(abonnieren, codeSichtbar, () => false);
  const setOffen = (on) => {
    setzeCodeSichtbar(on);
    for (const fn of hoerer) fn();
  };
  return [offen, setOffen];
}
