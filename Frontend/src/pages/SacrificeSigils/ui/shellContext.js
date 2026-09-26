// ui/shellContext.js — geteilte Hüllen-Funktionen: Tooltip, Spannung (Waage bei 4), Tisch-Shake.
import { createContext, useContext } from "react";

export const ShellContext = createContext({
  /** @param {{ x: number, y: number, content: any } | null} _tip */
  showTip: (_tip) => {},
  /** @param {number} _level 0–5 */
  setTension: (_level) => {},
  shake: () => {},
});

export const useShell = () => useContext(ShellContext);

/**
 * Handler für Hover-, Fokus- und Long-Press-Tooltips.
 * @param {() => any} content
 */
export function useTipHandlers(content) {
  const { showTip } = useShell();
  const at = (el) => {
    const r = el.getBoundingClientRect();
    showTip({ x: r.left + r.width / 2, y: r.top, content: content() });
  };
  return {
    onMouseEnter: (e) => at(e.currentTarget),
    onMouseLeave: () => showTip(null),
    onFocus: (e) => at(e.currentTarget),
    onBlur: () => showTip(null),
  };
}
