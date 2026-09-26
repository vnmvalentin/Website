// seekTo: an eine beliebige Stelle eines aufgezeichneten Laufs spulen, indem die Welt neu von vorn abgespielt wird.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seekTo } from '../replayScrub.js';
import { createLevelWorld } from '../../sim/levelWorld.js';
import { stepWorld } from '../../sim/world.js';
import { INPUT } from '../../sim/inputBits.js';
import { emptyDoc, validateDoc } from '../../level/index.js';
import { createInputLog } from '../../room/inputLog.js';

function levelOf(doc) {
  const res = validateDoc(doc, { smoke: false });
  assert.ok(res.ok, res.errors?.join(' | '));
  return res.level;
}

/** Ein Lauf: rechts halten, alle 90 Ticks kurz springen. `track[t]` ist der Spielerstand bei world.tick === t. */
function record(level, maxTicks) {
  const world = createLevelWorld(level);
  const log = createInputLog();
  const track = [{ x: world.player.x, y: world.player.y, deaths: world.deaths }];
  while (!world.finished && world.tick < maxTicks) {
    const m = world.tick % 90 < 70 ? INPUT.RIGHT : INPUT.RIGHT | INPUT.JUMP;
    log.record(world.tick, m);
    stepWorld(world, m);
    track.push({ x: world.player.x, y: world.player.y, deaths: world.deaths });
  }
  return { log: log.toArray(), track };
}

test('seekTo: die Welt an Tick T stimmt exakt mit dem vorwärts gerechneten Lauf an Tick T überein', () => {
  const level = levelOf(emptyDoc({ width: 90, height: 30 }));
  const { log, track } = record(level, 600);
  assert.ok(track.length >= 400, 'genug Ticks für den Test');

  for (const t of [0, 1, 50, 237, track.length - 1]) {
    const { world } = seekTo(level, log, t);
    assert.equal(world.tick, t, `Tick ${t}`);
    assert.equal(world.player.x, track[t].x, `x bei Tick ${t}`);
    assert.equal(world.player.y, track[t].y, `y bei Tick ${t}`);
    assert.equal(world.deaths, track[t].deaths, `Tode bei Tick ${t}`);
  }
});

test('seekTo: Tick 0 ist der unveränderte Levelstart', () => {
  const level = levelOf(emptyDoc({ width: 60, height: 20 }));
  const fresh = createLevelWorld(level);
  const { world } = seekTo(level, [0, INPUT.RIGHT], 0);
  assert.equal(world.tick, 0);
  assert.equal(world.player.x, fresh.player.x);
  assert.equal(world.player.y, fresh.player.y);
});

test('seekTo: über das Ziel hinaus angefragt bleibt bei der Zielzeit stehen (world.finished)', () => {
  const level = levelOf(emptyDoc({ width: 60, height: 20 }));
  const world0 = createLevelWorld(level);
  const log = createInputLog();
  while (!world0.finished && world0.tick < 1000) { log.record(world0.tick, INPUT.RIGHT); stepWorld(world0, INPUT.RIGHT); }
  assert.ok(world0.finished, 'kommt im Test wirklich an');
  const finishTick = world0.tick;

  const { world } = seekTo(level, log.toArray(), finishTick + 500);
  assert.equal(world.finished, true);
  assert.equal(world.tick, finishTick, 'läuft nach dem Ziel nicht weiter');
});

test('seekTo: negative oder nicht angegebene Ziele klemmen auf 0, statt zu werfen', () => {
  const level = levelOf(emptyDoc({ width: 40, height: 12 }));
  const { world } = seekTo(level, [0, INPUT.RIGHT], -50);
  assert.equal(world.tick, 0);
});

test('seekTo: maskAt steht nach dem Sprung auf world.tick — Weiterrechnen setzt exakt dort fort', () => {
  const level = levelOf(emptyDoc({ width: 90, height: 30 }));
  const { log, track } = record(level, 400);
  const { world, maskAt } = seekTo(level, log, 150);
  stepWorld(world, maskAt(world.tick));
  assert.equal(world.tick, 151);
  assert.equal(world.player.x, track[151].x);
  assert.equal(world.player.y, track[151].y);
});
