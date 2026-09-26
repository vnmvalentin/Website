// Testspiel ab einer beliebigen Stelle (Level-Editor): Die Figur beginnt auf der gewählten Kachel, und auch
// nach einem Tod geht es dort weiter — nicht am Levelstart, sonst wäre ein Abschnitt mitten im Level
// nicht übbar. Verändert die Sim nicht: Sie kennt Spawn-Punkte ohnehin als Liste (world.spawns), der
// erste Eintrag ist der Start.
import { TILE, PLAYER_W, PLAYER_H } from '../sim/config.js';
import { respawnPlayer } from '../sim/world.js';

/**
 * Setzt den Start der Welt auf Kachel (tx, ty) — Figur mittig, Füße auf der Kachelunterkante, wie beim
 * normalen Start — und stellt die Figur dorthin.
 */
export function moveStartTo(world, tx, ty) {
  world.spawns[0] = {
    x: tx * TILE + (TILE - PLAYER_W) / 2,
    y: (ty + 1) * TILE - PLAYER_H,
    tx,
    ty,
  };
  respawnPlayer(world, 0);
}
