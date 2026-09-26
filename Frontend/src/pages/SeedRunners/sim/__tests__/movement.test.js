// Tests der Spielerbewegung mit den Standardwerten aus config.js.
//
// Die Erwartungen sind Bereiche, keine Punktwerte: Sie sollen anschlagen, wenn eine Änderung
// das Spielgefühl spürbar verschiebt (Sprunghöhe, Reichweite …), nicht bei jeder Nachjustierung
// im Dev-Panel. Wer die Standardwerte absichtlich ändert, passt die Bereiche hier an — und die
// Testkarte (sim/testMap.js), deren Lücken auf diesen Reichweiten beruhen.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INPUT, TILE, PLAYER_W, PLAYER_H, stepWorld, warpPlayer, run,
  flatWorld, worldFrom, flatRows, FLAT_GROUND_Y, testMapWorld, TEST_MAP_GROUND, mitDash,
} from './helpers.js';
import { TICK_HZ } from '../config.js';
import { parseMap } from '../tilemap.js';
import { createWorld, resetRun } from '../world.js';

const tiles = (px) => px / TILE;

// ── Laufen ──────────────────────────────────────────────────────────────────

test('Vollgas am Boden in unter 0,15 s, Stillstand in unter 0,15 s', () => {
  const w = flatWorld();
  let ticksUp = 0;
  while (w.player.vx < w.cfg.runMaxSpeed - 0.01 && ticksUp < 200) { stepWorld(w, INPUT.RIGHT); ticksUp++; }
  assert.ok(ticksUp / TICK_HZ < 0.15, `Anlauf ${ticksUp / TICK_HZ}s`);
  let ticksDown = 0;
  while (Math.abs(w.player.vx) > 0.01 && ticksDown < 200) { stepWorld(w, 0); ticksDown++; }
  assert.ok(ticksDown / TICK_HZ < 0.15, `Auslauf ${ticksDown / TICK_HZ}s`);
});

test('Beschleunigung in der Luft ist schwächer als am Boden', () => {
  const ground = flatWorld();
  run(ground, 6, INPUT.RIGHT);
  const air = flatWorld();
  warpPlayer(air, air.player.x, FLAT_GROUND_Y - 200);
  run(air, 6, INPUT.RIGHT);
  assert.ok(air.player.vx < ground.player.vx, `Luft ${air.player.vx} vs. Boden ${ground.player.vx}`);
});

// ── Sprung ──────────────────────────────────────────────────────────────────

function jumpHeight(holdTicks, tuning) {
  const w = flatWorld(tuning);
  const y0 = w.player.y;
  let apex = y0;
  for (let t = 0; t < 250; t++) {
    stepWorld(w, t < holdTicks ? INPUT.JUMP : 0);
    apex = Math.min(apex, w.player.y);
  }
  return tiles(y0 - apex);
}

test('voller Sprung ist 4–4,5 Tiles hoch', () => {
  const h = jumpHeight(250);
  assert.ok(h > 4 && h < 4.5, `Höhe ${h}`);
});

test('variable Sprunghöhe: Antippen ergibt einen Hüpfer, längeres Halten steigt monoton', () => {
  const tap = jumpHeight(1);
  assert.ok(tap > 1.3 && tap < 2, `Tipp ${tap}`);
  let prev = 0;
  for (const hold of [1, 12, 20, 30, 250]) {
    const h = jumpHeight(hold);
    assert.ok(h >= prev, `Halten ${hold} Ticks: ${h} < ${prev}`);
    prev = h;
  }
});

test('Sprungweite im Lauf: 6–8 Tiles bei vollem Sprung', () => {
  const w = flatWorld();
  run(w, 60, INPUT.RIGHT);
  const x0 = w.player.x;
  let landedX = null;
  for (let t = 0; t < 300 && landedX === null; t++) {
    stepWorld(w, INPUT.RIGHT | INPUT.JUMP);
    if (t > 3 && w.player.onGround) landedX = w.player.x;
  }
  const d = tiles(landedX - x0);
  assert.ok(d > 6 && d < 8, `Weite ${d}`);
});

test('Coyote Time: Sprung kurz nach dem Verlassen der Kante geht, viel später nicht', () => {
  // Boden nur links; wir laufen über die Kante. Ohne Luftsprung (sonst würde der Sprung immer klappen).
  const rows = flatRows().map((r, y) => (y >= 17 ? '#'.repeat(20) + r.slice(20).replace(/#/g, '.') : r));
  const attempt = (airTicksBeforeJump) => {
    const w = worldFrom(rows, { airJumps: 0 });
    warpPlayer(w, 15 * TILE, FLAT_GROUND_Y - PLAYER_H);
    // "Kante verlassen" = Übergang Boden → Luft (nach einem Warp ist onGround erst mal false)
    let sawGround = false;
    let airTicks = -1;
    for (let t = 0; t < 200; t++) {
      const press = airTicks >= airTicksBeforeJump;
      stepWorld(w, INPUT.RIGHT | (press ? INPUT.JUMP : 0));
      if (press) return w.player.vy < 0;
      if (w.player.onGround) sawGround = true;
      if (airTicks >= 0) airTicks++;
      else if (sawGround && !w.player.onGround) airTicks = 0;
    }
    return false;
  };
  assert.equal(attempt(5), true, 'innerhalb der Coyote Time');
  assert.equal(attempt(25), false, 'nach der Coyote Time');
});

test('Jump Buffer: früh gedrückter Sprung wird bei der Landung ausgeführt', () => {
  const drop = (pressTicksBeforeLanding) => {
    const cfg = { airJumps: 0 };
    // Erst ohne Eingabe herausfinden, wann die Landung passiert
    const probe = flatWorld(cfg);
    warpPlayer(probe, probe.player.x, FLAT_GROUND_Y - PLAYER_H - 60);
    let landing = -1;
    for (let t = 0; t < 200 && landing < 0; t++) { stepWorld(probe, 0); if (probe.player.onGround) landing = t; }
    const w = flatWorld(cfg);
    warpPlayer(w, w.player.x, FLAT_GROUND_Y - PLAYER_H - 60);
    let rose = false;
    for (let t = 0; t < landing + 30; t++) {
      // Nur EINMAL drücken, dann halten — ein neuer Druck würde den Buffer neu füllen
      stepWorld(w, t >= landing - pressTicksBeforeLanding ? INPUT.JUMP : 0);
      if (t > landing && w.player.vy < -100) rose = true;
    }
    return rose;
  };
  assert.equal(drop(6), true, '6 Ticks vor der Landung');
  assert.equal(drop(30), false, '30 Ticks vor der Landung ist zu früh');
});

test('Doppelsprung: genau ein Luftsprung, an Boden und Wand wieder aufgefüllt', () => {
  const w = flatWorld();
  stepWorld(w, INPUT.JUMP);
  run(w, 20, INPUT.JUMP);
  stepWorld(w, 0);
  stepWorld(w, INPUT.JUMP);
  assert.ok(w.player.vy < -w.cfg.doubleJumpSpeed + 20, `zweiter Sprung, vy=${w.player.vy}`);
  assert.equal(w.player.airJumps, 0);
  const vyAfter = w.player.vy;
  stepWorld(w, 0);
  stepWorld(w, INPUT.JUMP);
  assert.ok(w.player.vy > vyAfter, 'dritter Sprung darf nichts bewirken');
  // Landen füllt auf
  run(w, 300, 0);
  assert.equal(w.player.airJumps, w.cfg.airJumps);
});

test('Ecken-Korrektur: Kopf an einer Kante wird vorbeigeschoben, ohne sie nicht', () => {
  const rows = flatRows();
  // Deckenblock über dem Boden, Reihen 12–13 (Unterkante y = 14·16 = 224)
  for (const y of [12, 13]) rows[y] = rows[y].slice(0, 10) + '###' + rows[y].slice(13);
  const highest = (corner) => {
    const w = worldFrom(rows, { cornerCorrection: corner });
    // Rechte Spielerkante ragt 3 px unter die linke Blockkante (x = 10·16 = 160)
    warpPlayer(w, 10 * TILE - PLAYER_W + 3, FLAT_GROUND_Y - PLAYER_H);
    let apex = w.player.y;
    for (let t = 0; t < 120; t++) { stepWorld(w, INPUT.JUMP); apex = Math.min(apex, w.player.y); }
    return apex;
  };
  const withCorrection = highest(4);
  const without = highest(0);
  assert.ok(withCorrection < 14 * TILE - 20, `mit Korrektur kommt der Kopf vorbei (${withCorrection})`);
  assert.ok(without > 14 * TILE - 2, `ohne Korrektur bleibt er unter dem Block (${without})`);
});

// ── Wand ────────────────────────────────────────────────────────────────────

// Schacht mit zwei Wänden, 4 Tiles Abstand; Boden am unteren Rand
function shaftWorld(tuning) {
  const rows = flatRows(40, 40).map((r, y) => {
    if (y >= 37) return r;
    const cells = r.split('');
    for (const x of [10, 11, 16, 17]) cells[x] = '#';
    return cells.join('');
  });
  const w = worldFrom(rows, tuning);
  return w;
}
const shaftGroundY = 37 * TILE;

test('Wandrutschen: Fallen an der Wand ist auf die Rutschgeschwindigkeit begrenzt', () => {
  const w = shaftWorld();
  warpPlayer(w, 12 * TILE, shaftGroundY - 300);
  // Gegen die linke Wand lehnen (Spieler klebt links an x = 12·16)
  run(w, 90, INPUT.LEFT);
  assert.ok(w.player.sliding || w.player.onGround, 'rutscht oder ist gelandet');
  let maxVy = 0;
  warpPlayer(w, 12 * TILE, shaftGroundY - 300);
  for (let t = 0; t < 60; t++) { stepWorld(w, INPUT.LEFT); if (w.player.sliding) maxVy = Math.max(maxVy, w.player.vy); }
  assert.ok(maxVy > 0 && maxVy <= w.cfg.wallSlideSpeed + 0.01, `Rutschtempo ${maxVy}`);
});

test('Wandsprung stößt von der Wand weg und sperrt kurz die Eingabe zur Wand', () => {
  const w = shaftWorld();
  warpPlayer(w, 12 * TILE, shaftGroundY - 200);
  run(w, 40, INPUT.LEFT);           // an die linke Wand
  assert.equal(w.player.wallDir, -1);
  stepWorld(w, INPUT.LEFT | INPUT.JUMP);
  assert.ok(w.player.vx > 0, `vx=${w.player.vx} zeigt von der Wand weg`);
  assert.ok(w.player.vy < -w.cfg.wallJumpSpeedY + 20, `vy=${w.player.vy}`);
  // Trotz gehaltener Richtung zur Wand bleibt vx positiv, solange die Sperre läuft
  const lockTicks = Math.round(w.cfg.wallJumpLockTime * TICK_HZ);
  for (let t = 0; t < lockTicks - 2; t++) {
    stepWorld(w, INPUT.LEFT | INPUT.JUMP);
    assert.ok(w.player.vx > 0, `Sperre bricht bei Tick ${t} (vx=${w.player.vx})`);
  }
});

test('Wandkontakt füllt den Luftsprung wieder auf', () => {
  const w = shaftWorld();
  warpPlayer(w, 12 * TILE + 20, shaftGroundY - 200);
  stepWorld(w, INPUT.JUMP);
  stepWorld(w, 0);
  stepWorld(w, INPUT.JUMP);
  assert.equal(w.player.airJumps, 0, 'Luftsprung verbraucht');
  run(w, 60, INPUT.LEFT);
  assert.equal(w.player.wallDir, -1);
  assert.equal(w.player.airJumps, w.cfg.airJumps, 'an der Wand wieder da');
});

// ── Dash ────────────────────────────────────────────────────────────────────

const DIRS = {
  rechts: INPUT.RIGHT, links: INPUT.LEFT, hoch: INPUT.UP, runter: INPUT.DOWN,
  'rechts-hoch': INPUT.RIGHT | INPUT.UP, 'rechts-runter': INPUT.RIGHT | INPUT.DOWN,
  'links-hoch': INPUT.LEFT | INPUT.UP, 'links-runter': INPUT.LEFT | INPUT.DOWN,
};

test('Dash in allen 8 Richtungen legt dieselbe Strecke zurück (auch diagonal)', () => {
  const expected = (w) => (w.cfg.dashSpeed * Math.max(1, Math.round(w.cfg.dashDuration * TICK_HZ))) / TICK_HZ;
  for (const [name, dir] of Object.entries(DIRS)) {
    const w = mitDash(flatWorld());
    warpPlayer(w, 30 * TILE, FLAT_GROUND_Y - 150);
    const x0 = w.player.x, y0 = w.player.y;
    stepWorld(w, dir | INPUT.DASH);
    while (w.player.dashTimer > 0) stepWorld(w, dir);
    const dist = Math.hypot(w.player.x - x0, w.player.y - y0);
    assert.ok(Math.abs(dist - expected(w)) < 1, `${name}: ${dist} statt ${expected(w)}`);
  }
});

test('Der Dash gehört nicht zur Grundausstattung: Start und Respawn ohne Ladung, ein Dash-Versuch tut nichts', () => {
  const w = flatWorld();
  assert.equal(w.player.dashCharges, 0, 'Start ohne Ladung');
  stepWorld(w, INPUT.RIGHT | INPUT.DASH);
  assert.equal(w.player.dashTimer, 0, 'ohne Ladung kein Dash');
  mitDash(w);
  stepWorld(w, INPUT.RIGHT | INPUT.DASH);
  assert.ok(w.player.dashTimer > 0, 'mit Ladung geht er');
  resetRun(w);
  assert.equal(w.player.dashCharges, 0, 'nach dem Neustart wieder ohne');
});

test('Dash: eine Ladung, Cooldown, Bodenkontakt füllt NICHT auf (nur Dash-Kristalle tun das)', () => {
  const w = mitDash(flatWorld());
  warpPlayer(w, 30 * TILE, FLAT_GROUND_Y - 150);
  stepWorld(w, INPUT.RIGHT | INPUT.DASH);
  assert.equal(w.player.dashCharges, 0);
  run(w, 40, INPUT.RIGHT);
  const x = w.player.x;
  stepWorld(w, INPUT.RIGHT | INPUT.DASH);   // zweiter Versuch ohne Ladung
  assert.equal(w.player.dashTimer, 0);
  assert.ok(w.player.x - x < 3, 'kein zweiter Dash');
  // Seit der Rückmeldung vom 23.09.2026 ("Dash zu op, besonders im schnellen Modus") füllt
  // Bodenkontakt die Ladung NICHT mehr auf — nur ein Dash-Kristall tut das (siehe elements.test.js).
  run(w, 200, 0);                           // landen, lange stehen bleiben
  assert.equal(w.player.dashCharges, 0);
});

test('Dash-Jump behält Tempo über dem Lauftempo und trägt weiter als ein normaler Sprung', () => {
  const distance = (withDash) => {
    const w = mitDash(flatWorld());
    run(w, 60, INPUT.RIGHT);
    const x0 = w.player.x;
    stepWorld(w, INPUT.RIGHT | INPUT.JUMP | (withDash ? INPUT.DASH : 0));
    const vxAtStart = w.player.vx;
    let landed = null;
    for (let t = 0; t < 400 && landed === null; t++) {
      stepWorld(w, INPUT.RIGHT | INPUT.JUMP);
      if (t > 3 && w.player.onGround) landed = w.player.x;
    }
    return { d: tiles(landed - x0), vxAtStart };
  };
  const plain = distance(false);
  const tech = distance(true);
  assert.ok(tech.vxAtStart > 140 * 1.5, `Tempo beim Absprung ${tech.vxAtStart}`);
  assert.ok(tech.d > plain.d + 2.5, `Dash-Jump ${tech.d} vs. Sprung ${plain.d}`);
});

test('Wandsprung direkt nach dem Dash ist schneller als ein normaler', () => {
  const w1 = shaftWorld();
  warpPlayer(w1, 12 * TILE, shaftGroundY - 200);
  run(w1, 40, INPUT.LEFT);
  stepWorld(w1, INPUT.LEFT | INPUT.JUMP);
  const plain = w1.player.vx;

  const w2 = mitDash(shaftWorld());
  warpPlayer(w2, 12 * TILE + 20, shaftGroundY - 200);
  // Dash zur Wand und im Dash springen
  stepWorld(w2, INPUT.LEFT | INPUT.DASH);
  let tech = null;
  for (let t = 0; t < 30 && tech === null; t++) {
    stepWorld(w2, INPUT.LEFT | INPUT.JUMP);
    if (w2.player.vx > 0) tech = w2.player.vx;
  }
  assert.ok(tech !== null, 'Wandsprung im Dash kam zustande');
  assert.ok(tech > plain + 30, `nach Dash ${tech} vs. normal ${plain}`);
});

// ── Grapple ─────────────────────────────────────────────────────────────────

// Boden, ein Anker 6 Tiles über und 3 rechts vom Start (Zeile 8, Spalte 14)
function grappleWorld({ wallBetween = false, tuning } = {}) {
  const rows = flatRows(40, 20).map((r) => r.replace('S', '.'));
  const put = (x, y, ch) => { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
  put(3, 16, 'S');
  put(14, 8, 'G');
  if (wallBetween) for (let y = 6; y <= 12; y++) put(9, y, '#');
  return worldFrom(rows, tuning);
}

test('Grapple greift einen Anker in Reichweite mit freier Sicht', () => {
  const w = grappleWorld();
  warpPlayer(w, 11 * TILE, FLAT_GROUND_Y - PLAYER_H);
  stepWorld(w, INPUT.GRAPPLE | INPUT.RIGHT | INPUT.UP);
  assert.ok(w.player.grapple, 'Seil hängt');
});

test('Grapple greift nicht außerhalb der Reichweite und nicht durch Wände', () => {
  const far = grappleWorld();
  stepWorld(far, INPUT.GRAPPLE | INPUT.RIGHT | INPUT.UP);   // Start bei x=3: weit weg
  assert.equal(far.player.grapple, null, 'zu weit');

  const blocked = grappleWorld({ wallBetween: true });
  warpPlayer(blocked, 6 * TILE, FLAT_GROUND_Y - PLAYER_H);
  stepWorld(blocked, INPUT.GRAPPLE | INPUT.RIGHT | INPUT.UP);
  assert.equal(blocked.player.grapple, null, 'Wand im Weg');
});

test('Seil: Abstand zum Anker überschreitet die Seillänge nie (Pendel)', () => {
  const w = grappleWorld();
  warpPlayer(w, 8 * TILE, FLAT_GROUND_Y - PLAYER_H - 30);
  stepWorld(w, INPUT.GRAPPLE | INPUT.RIGHT | INPUT.UP);
  assert.ok(w.player.grapple);
  const { ax, ay } = w.player.grapple;
  for (let t = 0; t < 300 && w.player.grapple; t++) {
    stepWorld(w, INPUT.GRAPPLE | (t % 90 < 45 ? INPUT.RIGHT : INPUT.LEFT));
    const p = w.player;
    if (!p.grapple) break;
    const d = Math.hypot(p.x + PLAYER_W / 2 - ax, p.y + PLAYER_H / 2 - ay);
    assert.ok(d <= p.grapple.len + 1, `Tick ${t}: Abstand ${d} > Seil ${p.grapple.len}`);
  }
});

test('Loslassen behält den Schwung; Boost nur nach echtem Schwingen', () => {
  // Zwei identische Läufe, einmal mit und einmal ohne Boost-Faktor: Der Unterschied im Tempo
  // nach dem Loslassen ist genau der Boost (die Schwerkraft des Loslass-Ticks kürzt sich raus).
  const speedAfterRelease = (holdTicks, boost) => {
    const w = grappleWorld({ tuning: { grappleReleaseBoost: boost } });
    warpPlayer(w, 8 * TILE, FLAT_GROUND_Y - PLAYER_H - 30);
    stepWorld(w, INPUT.GRAPPLE | INPUT.RIGHT | INPUT.UP);
    for (let t = 0; t < holdTicks; t++) stepWorld(w, INPUT.GRAPPLE);
    stepWorld(w, 0);   // loslassen
    return Math.hypot(w.player.vx, w.player.vy);
  };
  const quickPlain = speedAfterRelease(2, 1);
  const quickBoost = speedAfterRelease(2, 1.2);
  assert.ok(Math.abs(quickBoost - quickPlain) < 0.5, `kurz angeklebt: kein Boost (${quickPlain} vs. ${quickBoost})`);
  const longPlain = speedAfterRelease(60, 1);
  const longBoost = speedAfterRelease(60, 1.2);
  assert.ok(longBoost > longPlain * 1.1, `nach echtem Schwingen: Boost (${longPlain} → ${longBoost})`);
  assert.ok(longPlain > 20, 'Schwung bleibt beim Loslassen erhalten');
});

// ── Tod und Checkpoint ─────────────────────────────────────────────────────

test('Absturz zählt als Tod und setzt an den letzten Checkpoint zurück', () => {
  const w = testMapWorld(30, TEST_MAP_GROUND - 1);
  const rows = w.map;
  assert.ok(rows.checkpoints.length > 0);
  // Mitten in der ersten Lücke (Kacheln 30–32) fallen lassen
  warpPlayer(w, 31 * TILE + 3, (TEST_MAP_GROUND + 2) * TILE);
  run(w, 200, 0);
  assert.equal(w.deaths, 1);
  assert.equal(w.player.vy, 0, 'frisch gespawnt');
  assert.ok(w.player.y < TEST_MAP_GROUND * TILE, 'wieder auf dem Boden');
});

test('Checkpoints zählen nur vorwärts, Zeit läuft nach Neustart weiter, Tode nicht', () => {
  const w = testMapWorld(35, TEST_MAP_GROUND - 1);   // Checkpoint 1 steht auf Kachel 35
  run(w, 5, 0);
  assert.equal(w.checkpointIndex, 1);
  const tickBefore = w.tick;
  stepWorld(w, INPUT.RESTART);
  assert.ok(w.tick > tickBefore);
  assert.equal(w.deaths, 0);
  assert.equal(w.checkpointIndex, 1);
});

test('Nach dem Respawn löst eine noch gehaltene Sprungtaste keinen Sprung aus', () => {
  const w = flatWorld();
  stepWorld(w, INPUT.JUMP);            // springt
  run(w, 5, INPUT.JUMP);
  stepWorld(w, INPUT.JUMP | INPUT.RESTART);
  const vy = w.player.vy;
  run(w, 3, INPUT.JUMP);               // Taste bleibt unten
  assert.ok(w.player.vy >= vy, 'kein neuer Sprung durch die gehaltene Taste');
});

test('Weltgrenzen: an den seitlichen Rändern ist Schluss', () => {
  const w = flatWorld();
  run(w, 200, INPUT.LEFT);
  assert.ok(w.player.x >= 0, `x=${w.player.x}`);
  assert.equal(createWorld(parseMap(flatRows())).player.x >= 0, true);
});
