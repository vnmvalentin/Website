// ui/dev/runFixtures.js — nur im Dev-Build: feste Run-Stände für Screenshots der Moorwanderung.
// Aufruf: /sacrifice-and-sigils/moorwanderung?fixture=<name>[&players=n][&zirkel=gezeiten]. Platz 0 bist du.
import { createRun, applyRunAction, awaitingRun } from "../../engine/modes/moorwanderung/run.js";
import { runAiAction } from "../../engine/modes/moorwanderung/ai.js";

export const RUN_FIXTURES = ["starter", "path", "camp", "duel", "board", "fight", "reward", "boss", "bossStart", "over"];

/**
 * @param {string} name @param {{ players?: number, zirkel?: string }} [o]
 */
export function buildRunFixture(name, o = {}) {
  const n = o.players || 4;
  const names = ["Zeichnerin", "Die Schilfhexe", "Der Laternenmann", "Mutter Asche", "Der Aalstecher", "Die Knochenwitwe"].slice(0, n);
  let s = createRun({ seed: "RUNSHOTS", names, salt: "fixture", settings: { zirkel: o.zirkel || "moor", players: n } });
  const rng = { rng: 11 };
  /** @param {(x: any) => boolean} done @param {boolean} [meToo] auch Platz 0 per KI */
  const run = (done, meToo = true) => {
    for (let guard = 0; !done(s) && s.phase !== "over" && guard < 20000; guard++) {
      const who = awaitingRun(s).filter((p) => meToo || p !== 0);
      if (!who.length) break;
      const p = who[guard % who.length];
      let r = applyRunAction(s, runAiAction(s, p, "normal", rng));
      if (r.error) r = applyRunAction(s, { type: "timeout", player: p });
      s = r.state;
    }
  };
  switch (name) {
    case "starter": run((x) => x.players.slice(1).every((P) => P.starter), false); break;
    case "path": run((x) => x.phase === "path" && x.path.players[0].level >= 2 && !x.path.players[0].scene); break;
    case "camp": run((x) => x.phase === "path" && x.path.players[0].done && x.path.players.some((pp, q) => q && !pp.done)); break;
    case "fight": run((x) => x.phase === "path" && !!x.path.players[0].fight && x.path.players[0].fight.battle.turn >= 4); break;
    case "reward": run((x) => x.phase === "path" && x.path.players[0].scene?.kind === "reward"); break;
    case "boss": run((x) => x.phase === "path" && x.path.players[0].fight?.kind === "boss" && x.path.players[0].fight.battle.turn >= 3 && x.path.players[0].fight.battle.active === 0); break;
    case "bossStart": run((x) => x.phase === "path" && x.path.players[0].fight?.kind === "boss" && x.path.players[0].fight.battle.turn === 1 && x.path.players[0].fight.battle.active === 0); break;
    case "duel": run((x) => x.phase === "duels" && x.duels.pairs.some((d) => !d.done && d.seats.includes(0) && d.battle.turn >= 5 && d.battle.active === d.seats.indexOf(0))); break;
    case "board": run((x) => x.phase === "duels" && x.duels.pairs.some((d) => d.done && d.seats.includes(0)) && x.duels.pairs.some((d) => !d.done)); break;
    case "over": run(() => false); break;
    default: break;
  }
  return s;
}
