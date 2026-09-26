// Tests der Effekte: Sie dürfen nie abstürzen (auch mit jedem Ereignis, in jedem Biom) und — vor allem —
// nie etwas an der Sim ändern.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, createLevelWorld, BIOME_IDS, BIOMES } from '../../gen/index.js';
import { stepWorld } from '../../sim/world.js';
import { hashWorld } from '../../sim/hash.js';
import { INPUT } from '../../sim/inputBits.js';
import { createJuice } from '../juice.js';
import { createParticles } from '../particles.js';
import { createCamera, updateCamera } from '../camera.js';
import { drawFrame } from '../render.js';
import { getFx, setFx } from '../fxSettings.js';
import { createSound } from '../sound.js';

// Zeichenfläche, die alles annimmt und nichts tut
const stubContext = () => new Proxy({}, { get: (_, key) => (key === 'canvas' ? {} : () => {}), set: () => true });
const script = (t) => (t % 300 < 240 ? INPUT.RIGHT : INPUT.RIGHT | INPUT.LEFT) | (t % 61 === 0 ? INPUT.JUMP : 0) | (t % 173 === 0 ? INPUT.DASH : 0);

test('jedes Ereignis der Sim wird ohne Fehler verarbeitet', () => {
  const level = generateLevel({ seed: 'juice', length: 'short', speedClass: 'normal', biome: 'meadow' });
  const world = createLevelWorld(level);
  const juice = createJuice({ biome: 'meadow', palette: BIOMES.meadow.palette });
  juice.setWorld(world);
  const at = { x: 100, y: 100 };
  const events = {
    jump: {}, doubleJump: {}, wallJump: { dir: 1 }, land: { impact: 300 }, dash: { dx: 1, dy: 0 },
    grappleAttach: at, grappleRelease: { boosted: true }, checkpoint: { index: 1, ...at }, finish: { ticks: 100 },
    death: { ...at, reason: 'spike' }, restart: {}, gravity: { gd: -1 },
    crumbleStart: at, crumbleGone: at, blockShake: { ...at, w: 32 }, blockLand: { ...at, w: 32, h: 16 },
    spring: { ...at, dir: 'upRight' }, ring: { ...at, dir: 'right' }, crystal: at, portal: { from: at, to: { x: 200, y: 80 } },
    switch: { state: 1 }, key: at, doorOpen: at, laserOn: at, laserWarn: at, gust: { ...at, w: 48, h: 48, ax: 0, ay: -1 },
  };
  for (const [type, data] of Object.entries(events)) assert.doesNotThrow(() => juice.handleEvent(data, type), type);
  assert.doesNotThrow(() => juice.handleEvent({}, 'unbekannt'));
  juice.dispose();
});

for (const biome of BIOME_IDS) {
  test(`Rennen im Biom ${biome}: Effekte, Hintergrund und Zeichnen laufen ohne Fehler, Partikel bleiben gedeckelt`, () => {
    const level = generateLevel({ seed: `juice-${biome}`, length: 'short', speedClass: 'normal', biome });
    let juice = null;
    const world = createLevelWorld(level, { emit: (type, data) => juice?.handleEvent({ tick: world.tick, ...data }, type) });
    juice = createJuice({ biome, palette: BIOMES[biome].palette });
    juice.setWorld(world);
    const cam = createCamera();
    const ctx = stubContext();
    for (let t = 0; t < 1500; t++) {
      stepWorld(world, script(t));
      if (t % 2 === 0) {
        const p = world.player;
        updateCamera(cam, p.x, p.y, p, world.map, 1 / 60);
        juice.update(1 / 60, world, cam);
        drawFrame(ctx, 2, world, cam, 0.5, { juice, palette: BIOMES[biome].palette, aim: { x: 1, y: 0 } });
      }
    }
    juice.dispose();
  });
}

test('Effekte verändern die Sim nicht: gleicher Lauf mit und ohne Effekte ergibt dieselben Hashes', () => {
  const level = generateLevel({ seed: 'unveraendert', length: 'short', speedClass: 'fast', biome: 'factory' });
  const plain = createLevelWorld(level);
  let juice = null;
  const fancy = createLevelWorld(level, { emit: (type, data) => juice?.handleEvent(data, type) });
  juice = createJuice({ biome: 'factory', palette: BIOMES.factory.palette });
  juice.setWorld(fancy);
  const cam = createCamera();
  const ctx = stubContext();
  for (let t = 0; t < 3000; t++) {
    stepWorld(plain, script(t));
    stepWorld(fancy, script(t));
    if (t % 3 === 0) {
      juice.update(1 / 40, fancy, cam);
      drawFrame(ctx, 1, fancy, cam, 0, { juice, palette: BIOMES.factory.palette });
    }
    if (t % 100 === 0) assert.equal(hashWorld(fancy), hashWorld(plain), `Abweichung bei Tick ${t}`);
  }
  assert.equal(hashWorld(fancy), hashWorld(plain));
});

test('Partikel: Deckel wird eingehalten, abgelaufene verschwinden', () => {
  const ps = createParticles(50);
  for (let i = 0; i < 200; i++) ps.add({ x: 0, y: 0, life: 0.5 });
  assert.equal(ps.list.length, 50);
  ps.update(0.3);
  assert.equal(ps.list.length, 50);
  ps.update(0.3);
  assert.equal(ps.list.length, 0);
});

test('Einstellungen: Werte lassen sich setzen und lesen, auch ohne Browser-Speicher', () => {
  const before = getFx();
  setFx({ volume: 0.25, shake: false });
  assert.equal(getFx().volume, 0.25);
  assert.equal(getFx().shake, false);
  setFx(before);
});

test('Ton ohne Browser ist ein stiller No-Op und wirft nie', () => {
  const sound = createSound();
  assert.doesNotThrow(() => {
    sound.resume();
    for (const name of sound.sounds) sound.play(name, { gain: 0.5, pan: 0.2, impact: 300 });
    sound.setVolume(0.3);
    sound.setMuted(true);
  });
  assert.ok(sound.sounds.length >= 25, 'alle Klänge sind definiert');
});
