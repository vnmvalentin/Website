// Verbindung zwischen der Tool-Hülle und den Seiten darunter. Eigene Datei, weil Fast Refresh
// nur greift, wenn eine Komponentendatei nichts anderes exportiert.
import { createContext, useContext } from "react";

/** headerSlot: das Element in der Kopfleiste, in das <ToolHeader> seine Knöpfe hängt (null außerhalb der Hülle). */
export const ToolShellContext = createContext({ headerSlot: null });
export const useToolShell = () => useContext(ToolShellContext);
