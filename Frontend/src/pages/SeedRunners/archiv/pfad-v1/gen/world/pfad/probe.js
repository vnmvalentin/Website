// Bewegungen in der ECHTEN Sim nachspielen — auf einem Ausschnitt des entstehenden Rasters.
//
// Der Pfad-Generator (planer.js) plant keinen Sprung nach einer Formel, er führt ihn aus: Die Sim spielt die Eingaben
// eines Zugs (zuege.js) auf dem Raster, wie es bis hierhin gebaut ist, und liefert die Flugbahn Tick für Tick. So kann
// nichts „auf dem Papier" lösbar sein, was in Wirklichkeit nicht trägt — es ist dieselbe Sim, die später gespielt wird.
//
// Ausschnitt statt ganze Karte: Jeder Zug wird in mehreren Varianten gespielt (Ungenauigkeit eines Menschen), und eine
// 900 Kacheln breite Karte je Variante neu einzulesen wäre zu langsam. Ein Zug reicht nie weiter als ~20 Kacheln.

import { createWorld, stepWorld } from '../../../sim/world.js';
import { parseMap } from '../../../sim/tilemap.js';
import { classTuning } from '../../../sim/classes.js';
import { TILE, PLAYER_W, PLAYER_H } from '../../../sim/config.js';

export const FENSTER_W = 80;
export const FENSTER_H = 60;

const klemme = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Welt auf einem Ausschnitt um `mitte`, Spieler auf der Standkachel `start` (Luft über Fels).
 * @returns {{ welt: object, x0: number, y0: number }}  x0/y0: Rasterkoordinate der linken oberen Ecke des Ausschnitts
 */
export function ausschnittWelt(grid, entities, start, cls, mitte = start) {
  const W = grid[0].length;
  const H = grid.length;
  const fw = Math.min(FENSTER_W, W);
  const fh = Math.min(FENSTER_H, H);
  const x0 = klemme(Math.round(mitte.x - fw / 2), 0, W - fw);
  const y0 = klemme(Math.round(mitte.y - fh / 2), 0, H - fh);
  const rows = [];
  for (let y = y0; y < y0 + fh; y++) {
    let z = grid[y].slice(x0, x0 + fw).join('');
    // Start/Ziel/Checkpoints des großen Rasters gehören nicht in den Ausschnitt (nur ein S erlaubt)
    if (/[SEC]/.test(z)) z = z.replace(/[SEC]/g, '.');
    if (y === start.y && start.x >= x0 && start.x < x0 + fw) z = z.slice(0, start.x - x0) + 'S' + z.slice(start.x - x0 + 1);
    rows.push(z);
  }
  const drin = (e) => e.tx >= x0 && e.tx < x0 + fw && e.ty >= y0 && e.ty < y0 + fh;
  const ids = new Set(entities.filter((e) => e.type === 'portal' && drin(e)).map((e) => e.id));
  const ents = entities
    .filter((e) => drin(e) && (e.type !== 'portal' || ids.has(e.pair)))
    .map((e) => ({ ...e, tx: e.tx - x0, ty: e.ty - y0 }));
  const welt = createWorld(parseMap(rows, { entities: ents }), { tuning: classTuning(cls) });
  return { welt, x0, y0 };
}

/**
 * Einen Zug spielen. `eingabe(welt, t, zustand)` liefert je Tick die Tastenmaske, `fertig(welt, t, zustand)` beendet.
 * @returns {{ spur: {x,y,vx,vy,boden}[], tot: boolean, grund?: string, welt }}  x/y in RASTER-Pixeln (nicht Ausschnitt)
 */
export function spieleZug(ausschnitt, eingabe, fertig, maxT = 600) {
  const { welt, x0, y0 } = ausschnitt;
  const z = {};
  const spur = [];
  for (let t = 0; t < maxT; t++) {
    stepWorld(welt, eingabe(welt, t, z));
    const p = welt.player;
    spur.push({
      x: p.x + x0 * TILE, y: p.y + y0 * TILE, vx: p.vx, vy: p.vy, boden: p.onGround,
      // Am Seil: Ankerpunkt merken — die Seillinie muss später frei von Fels bleiben (Sichtlinie, sonst reißt das Seil)
      seil: p.grapple ? { x: p.grapple.ax + x0 * TILE, y: p.grapple.ay + y0 * TILE } : null,
    });
    // Beim Tod setzt die Sim den Spieler im selben Tick an den Start zurück — die letzte Spur-Position wäre der Start,
    // nicht die Todesstelle. Deshalb diesen Eintrag verwerfen.
    if (welt.deaths) { spur.pop(); return { spur, tot: true, grund: welt.deathReason, welt }; }
    if (fertig(welt, t, z)) break;
  }
  return { spur, tot: false, welt };
}

/** Rasterkacheln, die der Spielerkörper entlang einer Spur berührt (als "x,y"-Schlüssel) */
export function beruehrteKacheln(spur, set = new Set()) {
  for (const s of spur) {
    if (s.seil) {
      const cx = s.x + PLAYER_W / 2;
      const cy = s.y + PLAYER_H / 2;
      const schritte = Math.ceil(Math.sqrt((s.seil.x - cx) * (s.seil.x - cx) + (s.seil.y - cy) * (s.seil.y - cy)) / 6);
      for (let i = 0; i <= schritte; i++) {
        const f = i / Math.max(1, schritte);
        set.add(`${Math.floor((cx + (s.seil.x - cx) * f) / TILE)},${Math.floor((cy + (s.seil.y - cy) * f) / TILE)}`);
      }
    }
    const tx0 = Math.floor(s.x / TILE);
    const tx1 = Math.floor((s.x + PLAYER_W - 0.01) / TILE);
    const ty0 = Math.floor(s.y / TILE);
    const ty1 = Math.floor((s.y + PLAYER_H - 0.01) / TILE);
    for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) set.add(`${x},${y}`);
  }
  return set;
}

/** Standkachel (Luft über Fels) des Spielers aus einer Pixelposition */
export const standKachel = (s) => ({ x: Math.floor((s.x + PLAYER_W / 2) / TILE), y: Math.floor((s.y + PLAYER_H - 1) / TILE) });
