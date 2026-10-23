// Sprache und Texte der Hülle (ui/WcShell.jsx) für die Seiten darunter.
// Eigene Datei, weil Fast Refresh nur greift, wenn eine Komponentendatei nichts anderes exportiert.
import { useOutletContext } from "react-router-dom";

/** @returns {{ lang: "de"|"en", t: object, changeLang: (next: string) => void, langExplicit: boolean }} */
export const useWcShell = () => useOutletContext();
