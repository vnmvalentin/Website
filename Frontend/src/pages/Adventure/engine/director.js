// engine/director.js — der Spawn-Director: sammelt Punkte (mehr bei höherer Schwierigkeit und während der Teleporter
// lädt) und kauft davon Gegnergruppen, die außerhalb des Bildschirms auftauchen. Teure Gruppen können als Elite kommen.

import { ENEMIES } from "../data/enemies.js";
import { enemyPoolFor } from "../data/biomes.js";
import { spawnEnemy, findSpawnPoint, pickElite } from "./enemies.js";
import { ascEliteChance } from "./ascension.js";

export function updateDirector(g, dt) {
  const tele = g.teleporter;
  if (g.biome.final || g.over || tele.state === "ready") return;
  const charging = tele.state === "charging";
  const dir = g.director;
  dir.credits += dt * 3.2 * (1 + 0.75 * g.coeff) * (charging ? 2.3 : 1) * (g.curse ? 1.3 : 1) * (g.horde?.blood > 0 ? 2.5 : 1);
  dir.credits = Math.min(dir.credits, 500 * g.coeff);
  dir.t -= dt;
  if (dir.t > 0) return;
  dir.t = g.rng.range(2, 4) * (charging ? 0.6 : 1) * (g.horde?.blood > 0 ? 0.5 : 1);

  const alive = g.enemies.filter((e) => e.aggro && !e.isBoss).length;
  const cap = Math.min(70, 24 + 6 * g.stagesCleared + Math.floor(g.stageTime / 30)) + (g.horde?.blood > 0 ? 25 : 0);
  if (alive >= cap) return;

  const pool = enemyPoolFor(g.biome, g.loop).filter(([id]) => ENEMIES[id].cost <= dir.credits);
  if (!pool.length) return;
  const id = g.rng.weighted(pool);
  const cost = ENEMIES[id].cost;

  const eliteOk = g.coeff >= 1.5 && dir.credits >= cost * 6 && g.rng.chance(Math.min(0.7, (0.15 + 0.05 * g.stagesCleared + 0.1 * g.loop) * ascEliteChance(g)));
  const unit = eliteOk ? cost * 6 : cost;
  const wanted = eliteOk ? g.rng.int(1, 2) : Math.max(ENEMIES[id].group || 0, g.rng.int(2, 4 + Math.floor(g.coeff * 1.5)));
  const count = Math.max(1, Math.min(Math.floor(dir.credits / unit), wanted, cap - alive + (ENEMIES[id].group ? 4 : 0)));

  const p = g.player;
  const anchor = findSpawnPoint(g, p.x, p.y, 720, 980, 40);
  if (!anchor) return;
  const elite = eliteOk ? pickElite(g) : null;
  for (let i = 0; i < count; i++) {
    const q = findSpawnPoint(g, anchor.x, anchor.y, 0, 90, ENEMIES[id].r) || anchor;
    spawnEnemy(g, id, q.x, q.y, { elite });
  }
  dir.credits -= unit * count;
}
