// ui/table/TableHost.jsx — ein Bildschirm nimmt am Tisch Platz (Rebuild „Am Tisch“, Phasen 4 und 5).
//
// Die Szene (scene/tableRoom.js) gehört seit Phase 5 der Hülle (TableKeeper.jsx): sie bleibt vom Hauptmenü über die
// Lobby bis ins Match und durch das ganze Match stehen — Draft, Totem-Wahl, Pfad, Kampf, Rast, Ergebnis, Revanche.
// TableHost meldet den Bildschirm dort an und regelt, was für jede Phase gleich ist — Zirkel des Tischs, Bewegung
// reduzieren, Maske und Anwesenheit des Gegenübers, keine Website-Leiste. Was gespielt wird, bestimmen die Kinder
// (TableMenu, TableLobby, TableDraft, TableExtras, TableMap, TableScene, TableBattle, TableInterlude, TableResult):
// Sie bekommen die fertige Szene, setzen ihre eigenen Rückrufe (room.setHandlers) und ihren Stand (room.sync /
// room.setUi). Ihre Bedienelemente landen im Wurzelelement des Tischs.
import React, { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useShell } from "../shellContext.js";
import { usePrefs } from "../prefs.js";
import { useTableKeeper } from "./tableKeeperContext.js";
import TableMirror from "./TableMirror.jsx";
// Erst mit dem Tisch laden (nach theme.css der Hülle): sonst gewinnt dort .ss-paper { position: relative } über die
// Meldungen und Blätter am Tisch
import "./table.css";

/**
 * @param {{ zirkel: string, oppMask?: string, oppAway?: boolean, oppCrown?: boolean, oppCracked?: boolean, seated?: boolean, quiet?: boolean, mirror?: boolean,
 *   onFallback?: () => void, children: (room: any) => React.ReactNode }} props
 *   onFallback: der Browser kann den Tisch nicht darstellen — am bisherigen Tisch weiterspielen
 *   seated: sitzt jemand gegenüber? (Hauptmenü, Lobby ohne Gast: nein — der Platz bleibt leer)
 *   quiet: keine Lade- oder Fehlermeldung (das Hauptmenü steht schon, bevor der Tisch fertig ist)
 *   mirror: Bedien-Spiegelung für Tastatur und Screenreader (TableMirror) — aus, wo die Seite selbst DOM ist (Menü, Buch)
 */
export default function TableHost({ zirkel, oppMask, oppAway, oppCrown = false, oppCracked = false, seated = true, quiet = false, mirror = true, onFallback, children }) {
  const { showTip } = useShell();
  const prefs = usePrefs();
  const keeper = useTableKeeper();
  if (!keeper) throw new Error("TableHost braucht den Tisch der Hülle (TableKeeper)");
  const { room, state, root, claim } = keeper;
  const first = useRef({ zirkel: zirkel || "moor", seated });
  const fallback = useRef(onFallback);
  fallback.current = onFallback;

  // Am Tisch Platz nehmen; beim Verlassen bleibt die Szene kurz stehen, falls der nächste Bildschirm gleich folgt
  useLayoutEffect(() => {
    const release = claim(first.current);
    return () => { showTip(null); release(); };
  }, [claim, showTip]);
  // Am Tisch gibt es keine Website-Leiste (table.css)
  useEffect(() => {
    const game = document.querySelector(".ss-game");
    game?.setAttribute("data-tisch", "neu");
    return () => game?.removeAttribute("data-tisch");
  }, []);
  // Kein WebGL oder Ladefehler: von selbst am bisherigen Tisch weiter
  useEffect(() => { if (state === "kein-webgl" || state === "fehler") fallback.current?.(); }, [state]);
  useEffect(() => { room?.setZirkel(zirkel || "moor"); }, [zirkel, room]);
  useEffect(() => { room?.setReduced(prefs.reduceMotion); }, [prefs.reduceMotion, room]);
  useEffect(() => { if (oppMask) room?.setMask(oppMask); }, [oppMask, room]);
  // Moorwanderung: Bosse tragen eine Dornenkrone, in Phase 2 mit Sprung in der Maske (sonst kein Schmuck)
  useEffect(() => { room?.setDecor({ crown: oppCrown, cracked: oppCracked }); }, [oppCrown, oppCracked, room]);
  useEffect(() => { room?.setPresence({ away: !!oppAway, seated }); }, [oppAway, seated, room]);

  if (!root) return null;
  const ready = !!room && state === "bereit";
  return createPortal(
    <>
      {!ready && !quiet && (
        <p className="st-wait">{state === "kein-webgl" ? "Dieser Browser kann den Tisch im Kerzenlicht nicht darstellen – es geht am bisherigen Tisch weiter." : state === "fehler" ? "Der Tisch konnte nicht geladen werden – es geht am bisherigen Tisch weiter." : "Der Tisch wird gedeckt …"}</p>
      )}
      {ready && children(room)}
      {ready && mirror && <TableMirror room={room} />}
    </>,
    root,
  );
}
