// Balance-Sonde für adVentures: lässt den Bot (engine/bot.js) pro Kit zwei Läufe spielen und meldet, wann/wo er stirbt.
// Kein Test (läuft nicht mit npm run test:adventure), sondern ein Messwerkzeug für Änderungen an Werten.
//
//   node src/pages/Adventure/engine/__tests__/balance.mjs [Sekunden=1500] [evade|noevade] [kit1,kit2,…]
//   DIFF=easy|normal|hard  wählt die Schwierigkeit
//
// Einordnung (Oktober 2026, nach Waffen-Umbau): "evade" (perfektes Zielen, weicht Gegnern/Geschossen/Telegraphen aus)
// gewinnt etwa jeden zweiten Lauf und stirbt sonst an Thunderwing (~20 min). "noevade" (bleibt in Angriffen stehen)
// stirbt meist am ersten Boss. Ein Mensch liegt dazwischen. Wird es für "evade" wieder leicht → Werte nachziehen.

import { createGame, stepGame, TICK } from "../game.js";
import { botInput, botChoose } from "../bot.js";
import { tierInfo } from "../difficulty.js";
import { KIT_ORDER } from "../../data/kits.js";

const MAX = Number(process.argv[2] || 1500);
const evade = process.argv[3] !== "noevade";
const kits = process.argv[4] ? process.argv[4].split(",") : KIT_ORDER;
const difficulty = process.env.DIFF || "normal";

for (const kitId of kits) {
  for (const seed of [11, 22]) {
    const g = createGame({ kitId, seed, difficulty });
    let lowHp = 1;
    for (let i = 0; i < MAX / TICK && !g.over; i++) {
      botChoose(g);
      stepGame(g, TICK, botInput(g, { evade }));
      g.events.length = 0;
      if (g.player.alive) lowHp = Math.min(lowHp, g.player.hp / g.player.stats.maxHp);
    }
    const p = g.player;
    const items = Object.values(p.items).reduce((a, b) => a + b, 0);
    console.log([
      kitId.padEnd(8), `s${seed}`, g.won ? "SIEG" : g.over ? "TOT " : "lebt",
      `t=${Math.round(g.time)}s`, `stufe=${p.level}`, `welten=${g.stagesCleared}`, `kills=${g.stats.kills}`,
      `tier=${tierInfo(g.coeff).label}`, `minLeben=${Math.round(lowHp * 100)}%`, `items=${items}`,
      `boss=${g.boss ? `${Math.round((g.boss.hp / g.boss.maxHp) * 100)}%` : "-"}`, `waffen=${JSON.stringify(p.weapons)}`,
    ].join(" "));
  }
}
