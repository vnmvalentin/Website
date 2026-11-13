// shellContext.js — was Seiten von der Worldflip-Hülle (Shell.jsx) brauchen: das Regel-Fenster und die gemerkten
// Einstellungen (prefs.js) als gemeinsamer Zustand, damit Menü, Spiel und Online-Raum dasselbe sehen.
import { createContext, useContext } from "react";
import { DEFAULT_PREFS } from "../prefs.js";

export const ShellContext = createContext({
  openRules: () => {},
  prefs: DEFAULT_PREFS,
  updatePrefs: () => {},
});
export const useWfShell = () => useContext(ShellContext);
