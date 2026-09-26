// Die Chunks aus dem Feedback vom 21.09.2026 haben einen GEDACHTEN Weg: Der Solver beweist nur, dass es
// irgendeinen gibt (oft einen anderen, schnelleren). Hier spielt je ein einfacher Bot den gedachten Weg
// nach — so, wie ein Mensch ihn spielen würde: mit Reaktionszeit, ohne perfektes Timing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_BY_ID, generateSingle, createLevelWorld } from '../index.js';
import { stepWorld } from '../../sim/world.js';
import { INPUT } from '../../sim/inputBits.js';
import { TILE, PLAYER_W } from '../../sim/config.js';

const single = (id, speedClass = 'normal', seed = 'route') =>
  generateSingle(CHUNK_BY_ID[id], { seed, length: 'short', speedClass, biome: 'meadow' });
// x-Koordinate (px) der linken Kante des Chunks im Mini-Level
const chunkX = (level) => level.placements.find((p) => p.kind === 'chunk').x0 * TILE;

function play(level, bot, maxTicks = 4000) {
  const w = createLevelWorld(level);
  for (let t = 0; t < maxTicks && !w.finished && w.deaths === 0; t++) stepWorld(w, bot(w, t));
  return w;
}

test('falling-bridge: Block am Rand auslösen, abwarten, hinaufspringen und über die Lücke laufen', () => {
  const level = single('falling-bridge');
  const left = chunkX(level) + 8 * TILE;            // linke Kante des Blocks
  const right = left + 12 * TILE;
  let phase = 'approach';
  let hold = 0;   // Sprungtaste gehalten (ein Mensch lässt sie nicht sofort wieder los)
  const w = play(level, (world) => {
    const p = world.player;
    const block = world.elements.find((e) => e.type === 'fallingBlock');
    if (phase === 'approach') {
      if (block.st === 0) return INPUT.RIGHT;
      phase = 'wait';
    }
    if (phase === 'wait') {
      if (block.st !== 3) return 0;
      phase = 'cross';
    }
    if (hold > 0) { hold--; return INPUT.RIGHT | INPUT.JUMP; }
    const start = p.onGround && ((p.x < left && p.x > left - 30) || p.x > right - 14);   // auf den Block, dann von der Kante ab
    if (start) { hold = 40; return INPUT.RIGHT | INPUT.JUMP; }
    return INPUT.RIGHT;
  });
  assert.equal(w.deaths, 0, `gestorben: ${w.deathReason}`);
  assert.ok(w.finished, 'im Ziel');
});

test('falling-bridge: Durchrennen unter dem Block endet in der Grube', () => {
  const w = play(single('falling-bridge'), () => INPUT.RIGHT);
  assert.ok(w.deaths > 0 || !w.finished);
});

test('falling-lid: Deckel abwarten, dann bündig über die Spike-Grube', () => {
  const level = single('falling-lid');
  let phase = 'approach';
  const w = play(level, (world) => {
    const block = world.elements.find((e) => e.type === 'fallingBlock');
    if (phase === 'approach') {
      if (block.st === 0) return INPUT.RIGHT;
      phase = 'wait';
    }
    if (phase === 'wait') {
      if (block.st !== 3) return 0;
      phase = 'cross';
    }
    return INPUT.RIGHT;
  });
  assert.equal(w.deaths, 0, `gestorben: ${w.deathReason}`);
  assert.ok(w.finished, 'im Ziel');
});

// Kristallketten: nach jedem Einsammeln zögert der Bot eine Reaktionszeit, bevor er dasht. Er startet ohne Dash.
for (const [id, cls] of [['crystal-chain', 'normal'], ['crystal-chain-fast', 'fast'], ['crystal-chain-super', 'super']]) {
  test(`${id}: schaffbar mit Reaktionszeiten von 17 bis 150 ms`, () => {
    const level = single(id, cls);
    const edge = chunkX(level) + 10 * TILE;
    for (const delay of [2, 6, 12, 18]) {
      let dashed = false;
      let idle = 0;
      const w = play(level, (world) => {
        const p = world.player;
        let mask = INPUT.RIGHT;
        // Man beginnt OHNE Dash: Der Kristall auf dem Boden vor der Kante gibt die Ladung für den ersten Dash.
        if (!dashed && p.onGround && p.x + PLAYER_W >= edge - 2) { dashed = true; return mask | INPUT.DASH; }
        if (dashed && p.dashCharges > 0 && !p.onGround) {
          if (++idle > delay) { idle = 0; mask |= INPUT.DASH; }
        }
        return mask;
      });
      assert.equal(w.deaths, 0, `Verzögerung ${delay} Ticks: ${w.deathReason}`);
      assert.ok(w.finished, `Verzögerung ${delay} Ticks: nicht im Ziel`);
    }
  });
}

for (const cls of ['normal', 'fast', 'super']) {
  test(`ring-chain (${cls}): nur nach rechts halten genügt, auch mit zaghaftem Start`, () => {
    const level = single('ring-chain', cls);
    const w = play(level, () => INPUT.RIGHT);
    assert.equal(w.deaths, 0, `gestorben: ${w.deathReason}`);
    assert.ok(w.finished, 'im Ziel');
  });
}

test('spring-diagonal: rechts halten genügt, die Pads tragen über beide Lücken', () => {
  for (const cls of ['normal', 'fast', 'super']) {
    const w = play(single('spring-diagonal', cls), () => INPUT.RIGHT);
    assert.equal(w.deaths, 0, `${cls}: gestorben (${w.deathReason})`);
    assert.ok(w.finished, `${cls}: nicht im Ziel`);
  }
});

test('spring-ricochet: nach dem ersten Pad wirft der Schacht von Wand zu Wand hinauf', () => {
  const level = single('spring-ricochet');
  const base = chunkX(level);
  const seen = new Set();
  let peak = Infinity;
  const w = play(level, (world) => {
    const p = world.player;
    for (const e of world.elements) if (e.type === 'spring' && e.cd === e.cooldownTicks) seen.add(e.i);
    peak = Math.min(peak, p.y);
    // Bis in den Schacht laufen, dort hochspringen; oben (nach dem letzten Pad) hilft ein Doppelsprung
    const inShaft = p.x > base + 11 * TILE - 2 && p.x < base + 15 * TILE;
    // Im Schacht an die linke Wand gedrückt hochspringen (dort sitzt das erste Pad)
    if (seen.size === 0) return inShaft ? INPUT.LEFT | INPUT.JUMP : INPUT.RIGHT;
    return seen.size >= 14 ? INPUT.RIGHT | INPUT.JUMP : 0;
  }, 900);
  assert.ok(seen.size >= 11, `nur ${seen.size} von 15 Pads ausgelöst`);
  assert.equal(w.deaths, 0, `gestorben: ${w.deathReason}`);
});

test('portal-trap: das erste Portal tötet, drüberhüpfen und die Abkürzung nehmen führt ans Ziel', () => {
  const level = single('portal-trap');
  const trap = chunkX(level) + 10 * TILE;
  const dead = play(level, () => INPUT.RIGHT, 1500);
  assert.equal(dead.deaths, 1, 'geradeaus in die Falle');
  assert.equal(dead.deathReason, 'spike');

  const w = play(level, (world) => {
    const p = world.player;
    // ein Sprung kurz vor dem ersten Portal, danach nur laufen
    if (p.onGround && p.x > trap - 40 && p.x < trap - 26) return INPUT.RIGHT | INPUT.JUMP;
    return INPUT.RIGHT;
  }, 1500);
  assert.equal(w.deaths, 0, `gestorben: ${w.deathReason}`);
  assert.ok(w.finished, 'im Ziel');
});

// ── Menschen-Prüfung vom 25.09.2026 ─────────────────────────────────────────
// Zwei Chunks waren bei Tempo „normal" (dem Tempo des Tagesrennens) nur mit Präzision zu schaffen; der Solver hatte sie
// trotzdem gelöst (siehe gen/PLANUNG_WELTTYPEN.md, Abschnitt 14).

test('ring-launch (normal): in den Ring springen, danach Doppelsprung — mit Absprung irgendwo auf den letzten 2 Kacheln', () => {
  const level = single('ring-launch');
  const kante = chunkX(level) + 10 * TILE;
  for (const frueh of [0, 8, 16, 24, 32]) {
    let an = null;
    let ring = null;
    const w = play(level, (world, t) => {
      if (an === null && world.player.x + PLAYER_W >= kante - frueh) an = t;
      if (ring === null && world.elements.some((e) => e.type === 'ring' && e.cd > 0)) ring = t;
      let m = INPUT.RIGHT;
      if (an !== null && t - an < 16) m |= INPUT.JUMP;
      if (ring !== null && t - ring >= 40 && t - ring < 100) m |= INPUT.JUMP;
      return m;
    });
    assert.equal(w.deaths, 0, `${frueh} px früh: gestorben (${w.deathReason})`);
    assert.ok(w.finished, `${frueh} px früh: nicht im Ziel`);
  }
});

test('combo-shaft-dash (normal): nach dem Schacht trägt Sprung + Doppelsprung + Dash über die Lücke, Dash 50–150 ms nach dem Doppelsprung', () => {
  const level = single('combo-shaft-dash');
  for (const dashNach of [6, 12, 18]) {
    let dir = INPUT.RIGHT;
    let wandSeit = -1;
    let letzte = 0;
    let oben = false;
    let sprung = null;
    const w = play(level, (world, t) => {
      const p = world.player;
      if (!oben) {
        // Schacht im Zickzack hinauf (Reaktionszeit 6 Ticks an jeder Wand), bis man oben wieder auf Boden steht
        let m = dir;
        if (p.onGround && p.y < (level.placements.find((q) => q.kind === 'chunk').dy + 22) * TILE && t > 200) { oben = true; return INPUT.RIGHT; }
        if (p.onGround && Math.abs(p.vx) < 1 && !(letzte & INPUT.JUMP)) m = dir | INPUT.JUMP;
        else if (!p.onGround && p.wallDir !== 0) {
          if (wandSeit < 0) wandSeit = t;
          if (t - wandSeit >= 6) {
            if (letzte & INPUT.JUMP) m = p.wallDir > 0 ? INPUT.RIGHT : INPUT.LEFT;
            else { dir = p.wallDir > 0 ? INPUT.LEFT : INPUT.RIGHT; m = dir | INPUT.JUMP; wandSeit = -1; }
          } else m = p.wallDir > 0 ? INPUT.RIGHT : INPUT.LEFT;
        } else if (!p.onGround && p.vy < 0) m = dir | INPUT.JUMP;
        letzte = m;
        return m;
      }
      const kante = !world.map.solid[(Math.floor((p.y + 13) / TILE) + 1) * world.map.w + Math.floor((p.x + PLAYER_W + 2) / TILE)];
      if (sprung === null && p.onGround && kante) sprung = t;
      if (sprung === null) return INPUT.RIGHT;
      const s = t - sprung;
      if (s < 30) return INPUT.RIGHT | INPUT.JUMP;
      if (s < 52) return INPUT.RIGHT;                        // loslassen, Doppelsprung nach 22 Ticks
      if (s === 52 + dashNach) return INPUT.RIGHT | INPUT.DASH;
      if (s < 82) return INPUT.RIGHT | INPUT.JUMP;
      return INPUT.RIGHT;
    }, 6000);
    assert.equal(w.deaths, 0, `Dash ${dashNach} Ticks nach dem Doppelsprung: gestorben (${w.deathReason})`);
    assert.ok(w.finished, `Dash ${dashNach} Ticks nach dem Doppelsprung: nicht im Ziel`);
  }
});

test('laser-shaft und spike-wall-shaft gibt es nur bei Tempo „normal"', () => {
  for (const id of ['laser-shaft', 'spike-wall-shaft']) {
    assert.ok(single(id, 'normal'), `${id}: bei normal nicht verfügbar`);
    assert.equal(single(id, 'fast'), null, `${id}: bei schnell verfügbar`);
    assert.equal(single(id, 'super'), null, `${id}: bei super verfügbar`);
  }
});
