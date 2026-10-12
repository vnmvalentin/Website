// shellContext.js — was Seiten von der Blobby-Hülle (Shell.jsx) brauchen: das Fenster „Steuerung & Regeln".
import { createContext, useContext } from "react";

export const ShellContext = createContext({ openHelp: () => {} });
export const useBlobbyShell = () => useContext(ShellContext);
