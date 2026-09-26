// Input-Log eines Laufs: alle Eingabe-WECHSEL als flache Liste [tick, maske, tick, maske, …].
//
// Weil die Sim deterministisch ist, reicht dieses Log, um einen Lauf exakt nachzuspielen — auch
// ohne Bildschirm. Genau das nutzt der Anti-Cheat: Der Server rechnet den Lauf mit demselben Level nach und
// vergleicht die Zeit (Backend/seedRunners/replay.js).
//
// Nur Wechsel zu speichern hält es klein: Gehaltene Tasten kosten nichts, ein Fünf-Minuten-Lauf
// sind einige Tausend Zahlen.
//
// Regel: Vor dem ersten Eintrag gilt Maske 0. `record(tick, mask)` wird für JEDEN Tick gerufen
// (der vor dem Sim-Schritt abgetastet wurde) und merkt sich nur die Änderungen.

export function createInputLog() {
  const changes = [];
  let last = 0;

  return {
    record(tick, mask) {
      if (mask === last) return;
      changes.push(tick, mask);
      last = mask;
    },
    /** Kopie als flache Liste, bereit zum Senden */
    toArray() {
      return changes.slice();
    },
    get length() {
      return changes.length / 2;
    },
  };
}

// Nachspielen (createReplay, runReplay) liegt in sim/replay.js: Der Server braucht es ebenfalls und
// bekommt es über den Sim-Spiegel. Hier weitergereicht, damit bestehende Importe gültig bleiben.
export { createReplay } from '../sim/replay.js';
