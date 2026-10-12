// shellContext.js — was Seiten von der Flick-Soccer-Hülle (Shell.jsx) brauchen: Regel- und Profil-Fenster und die
// gemerkten Einstellungen (prefs.js) als gemeinsamer Zustand, damit Menü, Profil und Online-Raum dasselbe sehen.
import { createContext, useContext } from "react";
import { DEFAULT_PREFS } from "../prefs.js";

export const ShellContext = createContext({
  openRules: () => {},
  openProfile: () => {},
  prefs: DEFAULT_PREFS,
  updatePrefs: () => {},
  muted: false,
  toggleMute: () => {},
});
export const useFlickShell = () => useContext(ShellContext);
