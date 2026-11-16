// ui/table/useAtTable.js — Läuft diese Seite am Tisch im Kerzenlicht oder auf dem bisherigen, flachen Weg?
// Gleiche Regel für Hauptmenü, Lobby und Buch: Standard ist der Tisch, außer der bisherige ist gewählt („Bisheriger
// Tisch“), der Browser rendert ohne Grafikkarte (Sparmodus), das Fenster steht hochkant (Plan, Phase 7) oder der Tisch
// ließ sich nicht darstellen (kein WebGL — dann ruft TableHost onFallback).
import { useState } from "react";
import { useNewTable } from "../prefs.js";

/** @returns {[boolean, () => void]} [am Tisch?, Ausweichen (für onFallback)] */
export function useAtTable() {
  const newTable = useNewTable();
  const [failed, setFailed] = useState(false);
  const wideEnough = typeof window === "undefined" || window.innerWidth >= window.innerHeight * 1.2;
  return [newTable && wideEnough && !failed, () => setFailed(true)];
}
