// Die Testkarte: ist sie gültig, und ist jeder Abschnitt mit den Standardwerten schaffbar?
// Die Bots (helpers.js) spielen bewusst simpel. Ein Scheitern heißt also nicht "unmöglich",
// aber ein Erfolg beweist, dass der Abschnitt lösbar ist — und dass er den Trick wirklich
// erzwingt, zeigen die Negativtests (ohne Dash kommt man nicht über die breiten Lücken).

import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT, TILE, PLAYER_W, PLAYER_H, stepWorld, warpPlayer, testMapWorld, crossGap, climbShaft, TEST_MAP_GROUND, tileX, mitDash } from './helpers.js';
import { createTestMap, TEST_MAP_ROWS } from '../testMap.js';
import { findGrappleTarget } from '../player.js';
import { parseMap } from '../tilemap.js';
import { createWorld } from '../world.js';

const G = TEST_MAP_GROUND;

test('Testkarte ist gültig: ein Start, Checkpoints links→rechts, Anker, Ziel, Warp 1–6', () => {
  const map = createTestMap();
  assert.equal(map.w, TEST_MAP_ROWS[0].length);
  assert.ok(map.checkpoints.length >= 5);
  for (let i = 1; i < map.checkpoints.length; i++) assert.ok(map.checkpoints[i].tx >= map.checkpoints[i - 1].tx);
  assert.equal(map.anchors.length, 4);
  assert.ok(map.finish.length > 0);
  for (const d of '123456') assert.ok(map.warps[d], `Warp ${d}`);
});

test('Parser lehnt kaputte Raster ab statt sie still zu verschlucken', () => {
  assert.throws(() => parseMap(['S.', '.']), /Zeile 1/);
  assert.throws(() => parseMap(['S?']), /Unbekanntes Zeichen/);
  assert.throws(() => parseMap(['..', '..']), /Startpunkt/);
  assert.throws(() => parseMap(['SS']), /Zweiter Startpunkt/);
});

test('parseMap: checkpointOrder kann die Positions-Sortierung überschreiben (Turm-Fall: ein tieferes Stockwerk kann zufällig weiter rechts liegen)', () => {
  const rows = ['S.C.C.'];
  // Ohne Angabe: Fallback bleibt Position (links nach rechts)
  assert.deepEqual(parseMap(rows).checkpoints.map((c) => c.tx), [2, 4]);

  // Vollständig und eindeutig: die explizite Nummer entscheidet, auch entgegen der Position
  const explicit = parseMap(rows, { checkpointOrder: [{ tx: 4, ty: 0, order: 1 }, { tx: 2, ty: 0, order: 2 }] });
  assert.deepEqual(explicit.checkpoints.map((c) => c.tx), [4, 2]);

  // Unvollständig (nur einer nummeriert): kein Fehler, aber die Angabe wird ignoriert — Fallback bleibt Position
  const incomplete = parseMap(rows, { checkpointOrder: [{ tx: 4, ty: 0, order: 1 }] });
  assert.deepEqual(incomplete.checkpoints.map((c) => c.tx), [2, 4]);

  // Zeigt auf eine Kachel, die gar kein Checkpoint ist: ebenfalls ignoriert statt abzustürzen
  const stale = parseMap(rows, { checkpointOrder: [{ tx: 0, ty: 0, order: 1 }, { tx: 2, ty: 0, order: 2 }] });
  assert.deepEqual(stale.checkpoints.map((c) => c.tx), [2, 4]);
});

test('Lücken von 3, 4, 5 und 6 Tiles sind mit einem Sprung zu schaffen', () => {
  for (const [from, to] of [[29, 34], [34, 43], [44, 53], [54, 64]]) {
    const w = testMapWorld(from);
    const r = crossGap(w, { targetTx: to });
    assert.ok(r.ok, `Lücke ab ${from}: ${JSON.stringify(r)}`);
  }
});

// Sprung → Doppelsprung nach 45 Ticks → Dash nach 70 Ticks (spät im Fallen, das trägt am weitesten)
const jumpDoubleDash = (since, mask) => {
  if (since === 44) return mask & ~INPUT.JUMP;              // Taste kurz loslassen, damit der Druck neu zählt
  if (since === 45) return mask | INPUT.JUMP;               // Doppelsprung
  if (since === 70) return mask | INPUT.DASH;
  return mask;
};

test('Abschnitt 3: die 10er-Lücke geht mit Sprung + Doppelsprung + Dash, nicht mit Sprung allein', () => {
  const ok = crossGap(testMapWorld(66), { targetTx: 84, extras: jumpDoubleDash });
  assert.ok(ok.ok, JSON.stringify(ok));
  const plain = crossGap(testMapWorld(66), { targetTx: 84 });
  assert.equal(plain.ok, false, 'ein einfacher Sprung darf nicht reichen');
});

test('Abschnitt 3: die 5 Tiles hohe Kante ist per Doppelsprung erreichbar', () => {
  // Kante: Kacheln 90–95, Oberfläche auf Zeile G-5. Gesucht wird irgendeine Kombination aus
  // Absprungstelle und Zeitpunkt des Doppelsprungs, die oben landet — die Kante soll erreichbar
  // sein, nicht an genau einem Timing hängen.
  const reaches = (jumpAtTile, doubleAt) => {
    const w = testMapWorld(84, G - 1);
    let sinceJump = -1;
    for (let t = 0; t < 500; t++) {
      const p = w.player;
      let mask = INPUT.RIGHT;
      if (sinceJump < 0 && p.onGround && p.x > jumpAtTile * TILE) {
        mask |= INPUT.JUMP;
        sinceJump = 0;
      } else if (sinceJump >= 0) {
        sinceJump++;
        if (sinceJump === doubleAt - 1) mask &= ~INPUT.JUMP;
        else if (sinceJump >= doubleAt && sinceJump < doubleAt + 40) mask |= INPUT.JUMP;
        else if (sinceJump < doubleAt && p.vy < 0) mask |= INPUT.JUMP;
      }
      stepWorld(w, mask);
      if (w.deaths > 0) return false;
      const onLedge = p.onGround && Math.abs(p.y + PLAYER_H - (G - 5) * TILE) < 0.01 && p.x + PLAYER_W > 90 * TILE && p.x < 96 * TILE;
      if (onLedge) return true;
    }
    return false;
  };
  let found = false;
  for (const jumpAt of [86, 87, 88, 89]) {
    for (const doubleAt of [20, 30, 40, 50]) {
      if (reaches(jumpAt, doubleAt)) found = true;
    }
  }
  assert.ok(found, 'keine Kombination aus Absprung und Doppelsprung erreicht die Kante');
});

test('Abschnitt 4: der Wandschacht lässt sich bis oben hochklettern', () => {
  const w = testMapWorld(113, G - 1);   // Schachtmitte (Innenraum: Kacheln 112–115)
  // Etwas über der Austrittskante (Zeile 12) gilt als geschafft
  const r = climbShaft(w, { untilY: 12 * TILE - PLAYER_H - 2 });
  assert.ok(r.ok, JSON.stringify(r));
});

// Dash-Jump am Rand, Doppelsprung im Scheitel, Dash im Fallen
const dashJumpDouble = (since, mask) => {
  if (since === 44) return mask & ~INPUT.JUMP;
  if (since === 45) return mask | INPUT.JUMP;
  return mask;
};

test('Abschnitt 5: die 12er-Lücke geht mit Dash-Jump + Doppelsprung, nicht ohne Dash', () => {
  const ok = crossGap(mitDash(testMapWorld(140)), { targetTx: 164, dashJump: true, extras: dashJumpDouble });
  assert.ok(ok.ok, JSON.stringify(ok));
  const noDash = crossGap(mitDash(testMapWorld(140)), { targetTx: 164, extras: dashJumpDouble });
  assert.equal(noDash.ok, false, 'Sprung + Doppelsprung ohne Dash darf nicht reichen');
});

test('Abschnitt 6: die vier Anker tragen über den 36 Tiles breiten Abgrund', () => {
  const w = testMapWorld(168);
  let jumped = false;
  let result = null;
  for (let t = 0; t < 1800 && !result; t++) {
    const p = w.player;
    const cx = p.x + PLAYER_W / 2;
    const cy = p.y + PLAYER_H / 2;
    let mask = INPUT.RIGHT;
    if (p.grapple) {
      mask |= INPUT.GRAPPLE;
      // rechts vom Anker und auf dem Weg nach oben: loslassen, der Schwung trägt zum nächsten
      if (cx > p.grapple.ax + 16 && p.vy < 0) mask &= ~INPUT.GRAPPLE;
    } else {
      if (p.onGround && cx > 172 * TILE - 8 && !jumped) { mask |= INPUT.JUMP; jumped = true; }
      else if (!p.onGround && p.vy < 0 && jumped) mask |= INPUT.JUMP;
      if (!p.onGround) {
        const target = findGrappleTarget(w, 1, -1);
        if (target && cy > target.y + 20 && p.vy > -60) mask |= INPUT.GRAPPLE | INPUT.UP;
      }
    }
    stepWorld(w, mask);
    if (w.deaths > 0) result = { ok: false, tick: t };
    else if (p.onGround && tileX(w) >= 209) result = { ok: true, tick: t };
  }
  assert.ok(result?.ok, JSON.stringify(result));
});

test('Checkpoints zählen nur vorwärts: ein früherer nach einem späteren ändert nichts', () => {
  const w = testMapWorld(68, G - 1);              // Checkpoint 2 (Kachel 68)
  stepWorld(w, 0);
  assert.equal(w.checkpointIndex, 2);
  warpPlayer(w, 35 * TILE + 3, G * TILE - PLAYER_H);   // zurück auf Checkpoint 1
  stepWorld(w, 0);
  assert.equal(w.checkpointIndex, 2);
});

test('Checkpoint-Reihenfolge in der echten Welt: ohne Angabe respawnt ein senkrechtes Level am falschen (unteren statt zuletzt erreichten oberen) Checkpoint, mit expliziter Nummer korrekt', () => {
  // Ein Mini-Turm: der obere Checkpoint liegt weiter LINKS (kleineres tx) als der untere — genau der Fall,
  // der bei einem echten Turm-Level zufällig auftreten kann und den die Positions-Sortierung falsch einordnet.
  const rows = [
    'C....',
    '.....',
    '....C',
    'S....',
  ];
  const spawnAt = (tx, ty) => ({ x: tx * TILE + (TILE - PLAYER_W) / 2, y: (ty + 1) * TILE - PLAYER_H });
  const touch = (w, tx, ty) => { const p = spawnAt(tx, ty); warpPlayer(w, p.x, p.y); stepWorld(w, 0); };

  const wOhne = createWorld(parseMap(rows));
  touch(wOhne, 4, 2); // unterer Checkpoint zuerst erreicht (größeres tx)
  touch(wOhne, 0, 0); // dann der obere (kleineres tx) — laut Positions-Sortierung "kein Fortschritt"
  const spawnOhne = wOhne.spawns[wOhne.checkpointIndex];
  assert.equal(spawnOhne.tx, 4);
  assert.equal(spawnOhne.ty, 2); // Bug: ein Sturz würde am UNTEREN Checkpoint respawnen

  const wMit = createWorld(parseMap(rows, { checkpointOrder: [{ tx: 4, ty: 2, order: 1 }, { tx: 0, ty: 0, order: 2 }] }));
  touch(wMit, 4, 2);
  touch(wMit, 0, 0);
  const spawnMit = wMit.spawns[wMit.checkpointIndex];
  assert.equal(spawnMit.tx, 0);
  assert.equal(spawnMit.ty, 0); // korrekt: der zuletzt erreichte (obere) Checkpoint zählt
});

test('Das Ziel stoppt die Uhr', () => {
  const w = testMapWorld(217, G - 1);
  for (let t = 0; t < 60 && !w.finished; t++) stepWorld(w, INPUT.RIGHT);
  assert.ok(w.finished);
  const tick = w.finishTick;
  for (let t = 0; t < 30; t++) stepWorld(w, 0);
  assert.equal(w.finishTick, tick);
});
