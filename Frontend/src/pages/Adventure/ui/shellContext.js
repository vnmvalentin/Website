// shellContext.js — was AdventureGame von der Hülle (Shell.jsx) braucht: die Leiste oben während eines Laufs ausblenden.
import { createContext, useContext } from "react";

export const ShellContext = createContext({ setImmersive: () => {} });
export const useAdventureShell = () => useContext(ShellContext);
