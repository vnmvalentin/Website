// matchInfo.js — eine Zeile zu den Regeln der laufenden Partie (steht im Zahnrad-Menü des Spielbildschirms).
import { getField } from "./engine/index.js";

export function matchInfo(settings) {
  const parts = [settings.goalsToWin === 1 ? "1 Tor gewinnt" : `${settings.goalsToWin} Tore gewinnen`, getField(settings.field).name];
  if (settings.chaos) parts.push("Chaos");
  return parts.join(" · ");
}
