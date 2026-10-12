// Nachspielen eines Laufs aus seinem Input-Log — für den Anti-Cheat des Servers und für Tests.
//
// Ein Log ist die flache Liste aller Eingabe-WECHSEL [tick, maske, tick, maske, …] (siehe
// room/inputLog.js). Weil die Sim deterministisch ist, ergibt dasselbe Level mit demselben Log
// bit-genau denselben Lauf: dieselbe Zielzeit, dieselben Checkpoints. Der Server spielt den Lauf
// des Siegers (und die Einträge der Tagesrangliste) so nach und glaubt der Zeit nur, wenn sie
// übereinstimmt.
//
// Diese Datei gehört zur Sim und wird ins Backend gespiegelt (Backend/seedRunners/engine).

import { stepWorld } from './world.js';

/**
 * Eine Funktion (tick) → Maske, die das Log abspielt. Die Ticks müssen aufsteigend abgefragt werden
 * (so läuft die Sim ohnehin); dann kostet jede Abfrage O(1). Vor dem ersten Eintrag gilt Maske 0.
 */
export function createReplay(log) {
  let i = 0;
  let mask = 0;
  return (tick) => {
    while (i < log.length && log[i] <= tick) {
      mask = log[i + 1];
      i += 2;
    }
    return mask;
  };
}

/**
 * Spielt `log` in `world` ab, bis das Ziel erreicht ist oder `maxTicks` Ticks gerechnet wurden.
 * @returns {{ finished: boolean, ticks: number | null, deaths: number, tick: number }}
 */
export function runReplay(world, log, maxTicks) {
  const maskAt = createReplay(log);
  for (let i = 0; i < maxTicks && !world.finished; i++) stepWorld(world, maskAt(world.tick));
  return {
    finished: world.finished,
    ticks: world.finished ? world.finishTick : null,
    deaths: world.deaths,
    tick: world.tick,
  };
}
