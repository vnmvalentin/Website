// Eingabe der Sim: pro Tick EINE Bitmaske. Tastatur und Gamepad werden im Client dazu
// zusammengeführt (client/input.js); dasselbe Format ist später das Input-Log für den
// Anti-Cheat-Replay — ein Lauf ist damit nur eine Liste von (Tick, Maske)-Wechseln.
//
// Flanken (gerade gedrückt) leitet die Sim selbst aus dem Vergleich mit der Maske des
// Vortick ab. So hängt nichts davon ab, wann der Browser ein Event zustellt.

export const INPUT = Object.freeze({
  LEFT: 1,
  RIGHT: 2,
  UP: 4,
  DOWN: 8,
  JUMP: 16,
  DASH: 32,
  GRAPPLE: 64,
  RESTART: 128,
});
