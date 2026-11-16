// ui/table/tableKeeperContext.js — Zugang zum Tisch der Hülle (TableKeeper.jsx), eigene Datei wegen Fast Refresh.
import { createContext, useContext } from "react";

/**
 * @typedef {{ room: any, state: "aus" | "laden" | "bereit" | "kein-webgl" | "fehler", root: HTMLElement | null,
 *   claim: (o: { zirkel: string, seated: boolean }) => () => void }} Keeper
 */
export const KeeperContext = createContext(/** @type {Keeper | null} */ (null));

/** Der Tisch der Hülle (null außerhalb von Sacrifice & Sigils). */
export const useTableKeeper = () => useContext(KeeperContext);
