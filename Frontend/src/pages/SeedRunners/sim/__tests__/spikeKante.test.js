// Spikes auf einem Block mit offener Kante: Früher konnte man auf den äußersten 1–3 px des Blocks stehen, ohne zu sterben
// (Trefferfläche 2 px schmaler als die Kachel, Spieler-Hitbox für Gefahren 1 px kleiner). Auf durchgehendem Boden neben
// Spikes bleibt die Toleranz dagegen erhalten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, warpPlayer } from '../world.js';
import { PLAYER_W, PLAYER_H } from '../config.js';

const ROWS = [
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '.............^^.....',
  '......^......##.....',
  '.S....#......##.....',
  '####################',
];

/** Alle x-Positionen, an denen der Spieler auf Zeile `standRow` (Oberkante) stehen bleibt, ohne zu sterben */
function stehplaetze(fromPx, toPx, standRow) {
  const out = [];
  for (let x = fromPx; x <= toPx; x++) {
    const w = createWorld(ROWS);
    const y = standRow * 16 - PLAYER_H;
    warpPlayer(w, x, y);
    for (let i = 0; i < 20; i++) stepWorld(w, 0);
    if (w.deaths === 0 && w.player.onGround && Math.abs(w.player.y - y) < 0.01) out.push(x);
  }
  return out;
}

test('auf einem einzelnen Spike-Block gibt es keinen Stehplatz an den Kanten', () => {
  // Block bei Kachel 6 (x 96…112), Oberkante Zeile 7
  const block = stehplaetze(96 - PLAYER_W, 112, 7).filter((x) => x + PLAYER_W > 96 && x < 112);
  assert.deepEqual(block, []);
});

test('auf einer Reihe aus zwei Spike-Blöcken auch nicht', () => {
  // Blöcke bei Kachel 13–14 (x 208…240), Oberkante Zeile 6
  const block = stehplaetze(208 - PLAYER_W, 240, 6).filter((x) => x + PLAYER_W > 208 && x < 240);
  assert.deepEqual(block, []);
});

test('seitlich am Block vorbei (ohne ihn zu überlappen) tötet nicht', () => {
  // Direkt links neben dem Block bei Kachel 6, auf dem Boden (Zeile 8): Hitbox endet genau an der Blockkante
  const w = createWorld(ROWS);
  warpPlayer(w, 96 - PLAYER_W, 8 * 16 - PLAYER_H);
  for (let i = 0; i < 20; i++) stepWorld(w, 0);
  assert.equal(w.deaths, 0);
});
