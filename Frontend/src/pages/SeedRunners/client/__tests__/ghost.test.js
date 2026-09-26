// Geister: ein aufgezeichneter Lauf läuft in einer eigenen Welt exakt nach — Tick für Tick dieselbe Strecke wie der Spieler damals,
// und er berührt die Welt des Spielers nie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevelWorld } from '../../sim/levelWorld.js';
import { stepWorld } from '../../sim/world.js';
import { INPUT } from '../../sim/inputBits.js';
import { emptyDoc } from '../../level/index.js';
import { validateDoc } from '../../level/validate.js';
import { createInputLog } from '../../room/inputLog.js';
import { createGhost, stepGhost } from '../ghost.js';

function makeLevel() {
  const doc = emptyDoc({ width: 90, height: 30 });
  doc.elements.push({ type: 'spike', tx: 40, ty: 25 });
  const res = validateDoc(doc, { smoke: false });
  assert.ok(res.ok, res.errors?.join(' | '));
  return res.level;
}

/** Ein Lauf mit wechselnden Eingaben (laufen, springen, ein Rückwärtsschritt), samt Log und Bahn Tick für Tick */
function record(level, maxTicks = 3000) {
  const world = createLevelWorld(level);
  const log = createInputLog();
  const track = [];
  const maskAt = (t) => (t % 90 < 60 ? INPUT.RIGHT : t % 90 < 75 ? INPUT.RIGHT | INPUT.JUMP : INPUT.LEFT);
  while (!world.finished && world.tick < maxTicks) {
    const m = maskAt(world.tick);
    log.record(world.tick, m);
    stepWorld(world, m);
    track.push([world.player.x, world.player.y, world.deaths]);
  }
  return { log: log.toArray(), track, ticks: world.tick, deaths: world.deaths, finished: world.finished };
}

test('Geist: läuft mit demselben Log exakt dieselbe Bahn, samt Toden', () => {
  const level = makeLevel();
  const run = record(level, 900);
  assert.ok(run.track.length >= 900 || run.finished);
  assert.ok(run.deaths >= 1, 'die Bahn enthält mindestens einen Tod (Spikes), sonst prüft der Test wenig');

  const ghost = createGhost(level, run.log, { name: 'Alt', color: '#fff' });
  for (let t = 0; t < run.track.length; t++) {
    stepGhost(ghost);
    const [x, y, deaths] = run.track[t];
    assert.equal(ghost.world.player.x, x, `x bei Tick ${t}`);
    assert.equal(ghost.world.player.y, y, `y bei Tick ${t}`);
    assert.equal(ghost.world.deaths, deaths, `Tode bei Tick ${t}`);
  }
});

test('Geist: eigene Welt — der Lauf des Spielers wird von ihm nicht berührt', () => {
  const level = makeLevel();
  const run = record(level, 600);
  const ghost = createGhost(level, run.log);

  // Der Spieler steht still, während der Geist rennt
  const player = createLevelWorld(level);
  const startX = player.player.x;
  for (let t = 0; t < 300; t++) {
    stepGhost(ghost);
    stepWorld(player, 0);
  }
  assert.notEqual(ghost.world, player);
  assert.notEqual(ghost.world.player.x, startX, 'der Geist ist gelaufen');
  assert.equal(player.player.x, startX, 'der Spieler steht noch');
  assert.notEqual(ghost.world.map, player.map, 'auch die Elemente sind getrennt');
});

test('Geist: nach der Zielzeit bleibt er stehen und meldet "fertig"', () => {
  const level = makeLevel();
  // Kurzer Lauf, der nicht ins Ziel führt; die Zielzeit begrenzt den Geist trotzdem
  const log = [0, INPUT.RIGHT];
  const ghost = createGhost(level, log, { ticks: 120 });
  for (let i = 0; i < 400; i++) stepGhost(ghost);
  assert.equal(ghost.finished, true);
  const x = ghost.world.player.x;
  const tick = ghost.world.tick;
  stepGhost(ghost);
  assert.equal(ghost.world.player.x, x, 'steht still');
  assert.equal(ghost.world.tick, tick, 'keine weiteren Ticks');
  assert.ok(tick <= 122, `hörte kurz nach Tick 120 auf (Tick ${tick})`);
});

test('Geist: ohne Zielzeit läuft er bis ins Ziel und hört dann auf', () => {
  // Ebenes Level ohne Hindernisse: dauerhaft nach rechts führt ins Ziel
  const res = validateDoc(emptyDoc({ width: 60, height: 30 }), { smoke: false });
  assert.ok(res.ok, res.errors?.join(' | '));
  const world = createLevelWorld(res.level);
  const log = createInputLog();
  while (!world.finished && world.tick < 3000) {
    log.record(world.tick, INPUT.RIGHT);
    stepWorld(world, INPUT.RIGHT);
  }
  assert.ok(world.finished, 'der Lauf kommt ins Ziel');

  const ghost = createGhost(res.level, log.toArray());
  for (let i = 0; i < 3000 && !ghost.finished; i++) stepGhost(ghost);
  assert.equal(ghost.finished, true);
  assert.equal(ghost.world.finished, true);
  assert.equal(ghost.world.finishTick, world.finishTick, 'dieselbe Zielzeit wie der Lauf damals');
});
