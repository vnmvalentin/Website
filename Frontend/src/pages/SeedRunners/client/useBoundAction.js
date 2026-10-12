// useBoundAction.js — React-Hülle um onBoundAction (client/input.js): eine umbelegbare Taste, die die Seite selbst behandelt
// (z. B. „Neu starten“). Der Handler darf sich bei jedem Rendern ändern, angemeldet wird nur einmal.
import { useEffect, useRef } from 'react';
import { onBoundAction } from './input.js';

export function useBoundAction(actionId, handler, active = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return undefined;
    return onBoundAction(actionId, (e) => ref.current(e));
  }, [actionId, active]);
}
