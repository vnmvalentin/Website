// Tests der Element-Module: jedes Element in einer kleinen Arena, mit dem Verhalten, das es
// verspricht. Die Arena (helpers.js) hat den Boden ab Zeile 26; gestanden wird also in Zeile 25.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INPUT, TILE, PLAYER_W, PLAYER_H, stepWorld, warpPlayer, run, arena, placeAt, mitDash,
} from './helpers.js';
import { TICK_HZ } from '../config.js';
import { resetRun, createWorld } from '../world.js';
import { parseMap } from '../tilemap.js';
import { KIND } from '../glyphs.js';

const STAND = 25;   // Zeile, in der man in der Arena steht

// ── Gefahren ────────────────────────────────────────────────────────────────

test('Spikes töten bei Berührung; darüber springen geht; Ausrichtung folgt dem Block', () => {
  const b = arena().put(10, STAND, '^');
  const w = b.world();
  assert.equal(w.elements[0].dir, 'up');
  placeAt(w, 8, STAND);
  run(w, 90, INPUT.RIGHT);
  assert.equal(w.deaths, 1, 'in die Spikes gelaufen');
  assert.equal(w.deathReason, 'spike');

  const w2 = b.world();
  placeAt(w2, 8, STAND);
  let jumped = false;
  run(w2, 140, () => {
    const p = w2.player;
    // Absprung ein gutes Stück vor den Spikes (x = Kachel 10 → 160 px), Sprung gehalten
    if (!jumped && p.x > 8.6 * TILE && p.onGround) jumped = true;
    return INPUT.RIGHT | (jumped ? INPUT.JUMP : 0);
  });
  assert.equal(w2.deaths, 0, 'drüber gesprungen');
  assert.ok(w2.player.x > 11 * TILE);

  const ceiling = arena().rect(20, 20, 5, 1).put(22, 21, '^').world();
  assert.equal(ceiling.elements[0].dir, 'down', 'hängt an der Decke');
  const side = arena().rect(20, 20, 1, 6).put(21, 24, '^').world();
  assert.equal(side.elements[0].dir, 'right', 'sitzt an der linken Wand, zeigt nach rechts');
});

test('Sägen: stehend, auf einem Pfad und im Kreis (Radius bleibt konstant, ohne Math.sin)', () => {
  const still = arena().put(10, STAND, 'a').world(undefined, { markers: { a: { type: 'saw' } } });
  placeAt(still, 8, STAND);
  run(still, 60, INPUT.RIGHT);
  assert.equal(still.deaths, 1, 'stehende Säge tötet');

  const path = arena().put(10, 20, 'a').world(undefined, { markers: { a: { type: 'saw', path: [[0, 0], [10, 0]], speed: 80 } } });
  const saw = path.elements[0];
  const x0 = saw.x;
  run(path, 120, 0);            // 1 s bei 80 px/s
  assert.ok(Math.abs(saw.x - (x0 + 80)) < 0.5, `nach 1 s ${saw.x - x0} px`);
  run(path, 120 * 20, 0);       // lange laufen: bleibt im Pfad
  assert.ok(saw.x >= x0 - 0.5 && saw.x <= x0 + 10 * TILE + 0.5, 'bleibt auf dem Pfad');

  const orbit = arena().put(20, 15, 'a').world(undefined, { markers: { a: { type: 'saw', orbit: 3 } } });
  const o = orbit.elements[0];
  let minD = Infinity;
  let maxD = -Infinity;
  for (let t = 0; t < 1200; t++) {
    stepWorld(orbit, 0);
    const d = Math.hypot(o.x - o.cx, o.y - o.cy);
    minD = Math.min(minD, d);
    maxD = Math.max(maxD, d);
  }
  assert.ok(maxD - minD < 0.5, `Radius schwankt um ${maxD - minD}`);
  assert.ok(Math.abs(maxD - 3 * TILE) < 0.5);
});

test('Laser: Strahl endet am Block, Zyklus aus Tick-Zahl, Vorwarnung, tötet nur wenn an', () => {
  const b = arena().put(5, STAND, 'a').put(30, STAND, '#');
  const parse = { markers: { a: { type: 'laser', dir: 'right', period: 2, on: 0.5, warn: 0.3 } } };
  const w = b.world(undefined, parse);
  const laser = w.elements[0];
  assert.equal(laser.bw, 24 * TILE, 'Strahl reicht bis zum Block bei Kachel 30');

  // Zyklus über eine Periode einsammeln
  const seen = { on: 0, warn: 0, off: 0 };
  const period = 2 * TICK_HZ;
  for (let t = 0; t < period; t++) {
    stepWorld(w, 0);
    if (laser.on) seen.on++; else if (laser.warn) seen.warn++; else seen.off++;
  }
  assert.ok(Math.abs(seen.on - 0.5 * TICK_HZ) <= 1, `an: ${seen.on}`);
  assert.ok(Math.abs(seen.warn - 0.3 * TICK_HZ) <= 1, `Warnung: ${seen.warn}`);

  // In den Strahl stellen: stirbt nur, wenn er an ist
  const inBeam = b.world(undefined, parse);
  placeAt(inBeam, 12, STAND);
  let died = -1;
  for (let t = 0; t < period; t++) {
    stepWorld(inBeam, 0);
    if (inBeam.deaths > 0) { died = t; break; }
  }
  assert.ok(died >= 0, 'im Strahl gestorben');
  assert.equal(inBeam.deathReason, 'laser');
});

test('Fallender Block: löst aus, wackelt, stürzt, bleibt liegen und kehrt zurück', () => {
  const b = arena().put(10, 18, 'F');
  const w = b.world();
  const block = w.elements[0];
  assert.equal(block.st, 0);
  placeAt(w, 20, STAND);                      // weit weg: nichts passiert
  run(w, 30, 0);
  assert.equal(block.st, 0);

  placeAt(w, 10, STAND, 3);                   // direkt darunter, weit unten → erschlagen
  let states = new Set();
  for (let t = 0; t < 400 && w.deaths === 0; t++) { stepWorld(w, 0); states.add(block.st); }
  assert.ok(states.has(1), 'wackelte');
  assert.ok(states.has(2), 'fiel');
  assert.equal(w.deaths, 1, 'erschlagen');
  assert.equal(w.deathReason, 'falling');

  // Ohne Spieler darunter: landet, liegt, kehrt zurück
  const w2 = b.world();
  const b2 = w2.elements[0];
  placeAt(w2, 11, STAND, 4);                  // im Einzugsbereich, aber knapp daneben → Block fällt neben ihn
  let landed = false;
  let back = false;
  for (let t = 0; t < 900; t++) {
    stepWorld(w2, 0);
    if (b2.st === 3) landed = true;
    if (landed && b2.st === 0) { back = true; break; }
  }
  assert.ok(landed, 'landete');
  assert.ok(back, 'kehrte zurück');
  assert.equal(b2.y, b2.y0);
});

// ── Plattformen ─────────────────────────────────────────────────────────────

test('Bewegte Plattform: nimmt Mitfahrer mit, Absprung erbt ihr Tempo', () => {
  const b = arena().put(10, 24, 'a');
  const parse = { markers: { a: { type: 'mover', path: [[0, 0], [12, 0]], speed: 60, width: 3 } } };
  const w = b.world(undefined, parse);
  const plat = w.elements[0];
  // Auf die Plattform setzen (Oberkante y = 24·16)
  warpPlayer(w, plat.x + 16, plat.y - PLAYER_H);
  run(w, 4, 0);
  assert.ok(w.player.onGround, 'steht auf der Plattform');
  const x0 = w.player.x;
  const px0 = plat.x;
  run(w, 120, 0);
  assert.ok(Math.abs((w.player.x - x0) - (plat.x - px0)) < 0.5, `Mitfahrer wanderte ${w.player.x - x0}, Plattform ${plat.x - px0}`);
  // Absprung: Tempo der Plattform kommt dazu
  stepWorld(w, INPUT.JUMP);
  assert.ok(w.player.vx > 40, `vx beim Absprung: ${w.player.vx}`);
});

test('Bewegte Plattform: trägt auch auf SCHRÄGEN Bahnen seitlich mit (Mitnahme erst senkrecht, dann waagerecht)', () => {
  // Früher wurde erst waagerecht mitgenommen: Steigt die Plattform, ragt ihre Oberkante dabei in die Füße, der Schritt
  // galt als Wandkollision, und man fuhr nur senkrecht mit und rutschte hinten hinunter. Fast alle Himmelsreich-Brücken
  // laufen schräg — dort fühlte sich jede Plattform an wie Eis.
  const bahnen = { 'rechts hoch': [[0, 0], [14, -8]], 'rechts runter': [[0, 0], [14, 8]], 'links hoch': [[0, 0], [-14, -8]], 'links runter': [[0, 0], [-14, 8]], flach: [[0, 0], [14, 2]] };
  for (const [name, path] of Object.entries(bahnen)) {
    const b = arena({ w: 80, h: 60, floor: 55 }).put(40, 30, 'a');
    const parse = { markers: { a: { type: 'mover', path, speed: 60, width: 3 } } };
    const w = b.world(undefined, parse);
    const plat = w.elements[0];
    warpPlayer(w, plat.x + 16, plat.y - PLAYER_H - 1);   // knapp darüber: als Mitfahrer landen, nicht in einer steigenden Plattform stecken
    run(w, 12, 0);
    const versatz0 = w.player.x - plat.x;
    let maxAbweichung = 0;
    let verloren = -1;
    for (let t = 0; t < 400; t++) {
      stepWorld(w, 0);
      maxAbweichung = Math.max(maxAbweichung, Math.abs(w.player.x - plat.x - versatz0));
      if (verloren < 0 && (!w.player.onGround || w.player.supOwner !== plat.i)) verloren = t;
    }
    assert.ok(maxAbweichung < 1 && verloren < 0, `${name}: Abweichung ${maxAbweichung.toFixed(1)} px, Plattform verloren bei Tick ${verloren}`);
  }
});

test('Senkrechte Plattform trägt nach oben; Einklemmen an der Decke tötet', () => {
  const b = arena().put(10, 25, 'a').rect(8, 14, 8, 1);   // Decke über dem Fahrweg
  const parse = { markers: { a: { type: 'mover', path: [[0, 0], [0, -10]], speed: 50, width: 3 } } };
  const w = b.world(undefined, parse);
  const plat = w.elements[0];
  warpPlayer(w, plat.x + 16, plat.y - PLAYER_H);
  run(w, 4, 0);
  const y0 = w.player.y;
  run(w, 100, 0);
  assert.ok(y0 - w.player.y > 30, `wurde ${y0 - w.player.y} px angehoben`);
  // weiter fahren, bis die Decke erreicht ist: irgendwann zerquetscht (die Plattform stoppt nicht)
  let crushed = false;
  for (let t = 0; t < 900 && !crushed; t++) {
    stepWorld(w, 0);
    if (w.deaths > 0 && w.deathReason === 'crush') crushed = true;
  }
  assert.ok(crushed, 'zwischen Plattform und Decke zerquetscht');
});

test('Bröckelnder Block: hält kurz, verschwindet, kommt zurück; Checkpoint-Zustand wird wiederhergestellt', () => {
  const b = arena().put(10, 20, '~');
  const w = b.world();
  const c = w.elements[0];
  warpPlayer(w, 10 * TILE + 3, 20 * TILE - PLAYER_H);
  run(w, 3, 0);
  assert.ok(w.player.onGround, 'steht auf dem Block');
  assert.equal(c.st, 1, 'beginnt zu bröckeln');
  const y = w.player.y;
  run(w, Math.round(0.2 * TICK_HZ), 0);
  assert.equal(w.player.y, y, 'hält noch');
  run(w, Math.round(0.2 * TICK_HZ), 0);
  assert.equal(c.st, 2, 'weg');
  assert.ok(w.player.y > y, 'Spieler fällt');
  // Nach der Rückkehrzeit wieder da (Spieler ist inzwischen gefallen/gestorben und respawnt)
  run(w, 4 * TICK_HZ, 0);
  assert.equal(c.st, 0, 'zurück');
});

test('Einweg-Plattform: von unten hindurch, von oben tragend, mit Runter+Sprung durchfallen', () => {
  const b = arena().rect(10, 23, 6, 1, '=');
  const w = b.world();
  // Von unten hochspringen: geht hindurch und landet oben
  placeAt(w, 12, STAND);
  run(w, 60, INPUT.JUMP);
  run(w, 60, 0);
  assert.ok(Math.abs(w.player.y + PLAYER_H - 23 * TILE) < 0.01, `steht oben (y=${w.player.y})`);
  // Runter + Sprung: fällt durch
  stepWorld(w, INPUT.DOWN | INPUT.JUMP);
  run(w, 30, 0);
  assert.ok(w.player.y > 23 * TILE, 'durchgefallen');
});

test('Förderband schiebt einen Stehenden mit dem eingestellten Tempo', () => {
  const b = arena().rect(10, 26, 10, 1, '>');
  const w = b.world();
  placeAt(w, 12, STAND);
  run(w, 5, 0);
  const x0 = w.player.x;
  run(w, TICK_HZ, 0);
  assert.ok(Math.abs((w.player.x - x0) - w.cfg.conveyorSpeed) < 2, `1 s → ${w.player.x - x0} px`);
});

test('Eis: langsamer anlaufen und deutlich länger rutschen', () => {
  const onFloor = (floorChar) => {
    const w = arena().rect(5, 26, 50, 1, floorChar).world();
    placeAt(w, 8, STAND);
    return w;
  };
  // Anlauf: nach 20 Ticks hat der normale Boden schon Höchsttempo, das Eis erst einen Bruchteil
  const early = (c) => { const w = onFloor(c); run(w, 20, INPUT.RIGHT); return w.player.vx; };
  assert.ok(early('I') < early('#') * 0.6, `Eis: langsamer beschleunigt (${early('I')} vs. ${early('#')})`);
  // Auslauf: beide starten mit Höchsttempo (60 Ticks), das Eis rutscht viel weiter
  const coast = (c) => {
    const w = onFloor(c);
    run(w, 60, INPUT.RIGHT);
    const x0 = w.player.x;
    run(w, 200, 0);
    return w.player.x - x0;
  };
  assert.ok(coast('I') > coast('#') * 5, `Rutschweg Eis ${coast('I')} vs. ${coast('#')}`);
});

test('Klebrige Wand: kein Rutschen, Klettern mit Hoch/Runter; Wandsprung geht trotzdem', () => {
  const b = arena().rect(20, 8, 1, 18, 'W');
  const w = b.world();
  warpPlayer(w, 20 * TILE - PLAYER_W - 1, 14 * TILE);
  run(w, 30, INPUT.RIGHT);
  const y0 = w.player.y;
  run(w, 60, INPUT.RIGHT);
  assert.ok(Math.abs(w.player.y - y0) < 1, `hängt fest (Δy ${w.player.y - y0})`);
  assert.ok(w.player.clinging);
  assert.equal(w.player.wallKind, KIND.STICKY);
  run(w, 60, INPUT.RIGHT | INPUT.UP);
  assert.ok(y0 - w.player.y > 20, 'klettert nach oben');
  stepWorld(w, INPUT.RIGHT | INPUT.JUMP);
  assert.ok(w.player.vx < 0, 'Wandsprung stößt ab');
});

// ── Bewegung ────────────────────────────────────────────────────────────────

test('Sprungpad: großer Abstoß, Luftsprung aufgefüllt, Dash NICHT (nur Kristalle füllen Dash)', () => {
  const b = arena().put(10, STAND, 'P');
  const w = b.world();
  placeAt(w, 8, STAND);
  w.player.dashCharges = 0;
  w.player.airJumps = 0;
  let peak = 0;
  for (let t = 0; t < 100; t++) {
    stepWorld(w, INPUT.RIGHT);
    peak = Math.min(peak, w.player.vy);
    if (w.player.vy < -w.cfg.springSpeed + 30) break;
  }
  assert.ok(peak <= -w.cfg.springSpeed + 30, `vy ${peak}`);
  assert.equal(w.player.dashCharges, 0);
  assert.equal(w.player.airJumps, w.cfg.airJumps);
});

test('Boost-Ring: setzt Tempo in Ringrichtung und füllt den Luftsprung auf (Dash NICHT); danach kurz verbraucht', () => {
  const b = arena().put(15, 18, 'a');
  const w = b.world(undefined, { markers: { a: { type: 'ring', dir: 'upRight' } } });
  warpPlayer(w, 15 * TILE + 3, 18 * TILE + 1);
  w.player.dashCharges = 0;
  stepWorld(w, 0);
  const speed = Math.hypot(w.player.vx, w.player.vy);
  assert.ok(Math.abs(speed - w.cfg.ringSpeed) < 25, `Tempo ${speed}`);
  assert.ok(w.player.vx > 0 && w.player.vy < 0);
  assert.equal(w.player.dashCharges, 0);
  assert.ok(w.elements[0].cd > 0);
});

test('Dash-Kristall: nur eingesammelt, wenn der Dash fehlt; kommt später zurück', () => {
  const b = arena().put(15, 18, 'D');
  const w = b.world();
  const crystal = w.elements[0];
  warpPlayer(w, 15 * TILE + 3, 18 * TILE + 1);
  w.player.dashCharges = w.cfg.dashCharges;
  stepWorld(w, 0);
  assert.equal(crystal.taken, false, 'Dash voll: bleibt liegen');
  w.player.dashCharges = 0;
  warpPlayer(w, 15 * TILE + 3, 18 * TILE + 1);
  w.player.dashCharges = 0;
  stepWorld(w, 0);
  assert.equal(crystal.taken, true);
  assert.equal(w.player.dashCharges, w.cfg.dashCharges);
  run(w, 3 * TICK_HZ, 0);
  assert.equal(crystal.taken, false, 'wieder da');
});

test('Windzone: Aufwind hebt an, Seitenwind schiebt', () => {
  const b = arena().put(20, 10, 'a');
  const w = b.world(undefined, { markers: { a: { type: 'wind', w: 4, h: 16, ay: -1800 } } });
  placeAt(w, 21, STAND);
  const y0 = w.player.y;
  run(w, 60, 0);
  assert.ok(y0 - w.player.y > 40, `Aufwind hob um ${y0 - w.player.y} px`);

  const side = arena().put(20, 20, 'a').world(undefined, { markers: { a: { type: 'wind', w: 10, h: 6, ax: 800, ay: 0 } } });
  placeAt(side, 21, STAND);
  side.player.x = 21 * TILE;
  side.player.y = 21 * TILE;
  const vx0 = side.player.vx;
  run(side, 20, 0);
  assert.ok(side.player.vx > vx0 + 40, `Seitenwind: vx ${side.player.vx}`);
});

test('Gravitationszone: Schwerkraft kehrt sich um, Decke trägt, Sprung geht nach unten, Verlassen normalisiert', () => {
  const b = arena().rect(10, 5, 10, 1).put(10, 6, 'a');
  const w = b.world(undefined, { markers: { a: { type: 'gravityZone', w: 10, h: 21 } } });
  placeAt(w, 14, STAND);
  run(w, 240, 0);
  assert.equal(w.player.gd, -1);
  assert.ok(w.player.onGround, 'steht an der Decke');
  assert.ok(Math.abs(w.player.y - 6 * TILE) < 0.01, `y=${w.player.y}`);

  // Sprung geht "nach unten" (weg von der Decke)
  stepWorld(w, INPUT.JUMP);
  assert.ok(w.player.vy > 0, `Sprung nach unten (vy=${w.player.vy})`);
  run(w, 30, INPUT.JUMP);
  assert.ok(w.player.y > 6 * TILE + 20);

  // Herauslaufen: normale Schwerkraft, fällt zum Boden
  warpPlayer(w, 21 * TILE, 10 * TILE);
  run(w, 200, 0);
  assert.equal(w.player.gd, 1);
  assert.ok(w.player.onGround);
});

test('Portal: gleiches Tempo, kein sofortiges Zurückspringen', () => {
  const b = arena().put(10, STAND, 'a').put(40, 12, 'b');
  const parse = { markers: {
    a: { type: 'portal', id: 'A', pair: 'B' },
    b: { type: 'portal', id: 'B', pair: 'A' },
  } };
  const w = b.world(undefined, parse);
  placeAt(w, 8, STAND);
  let teleported = false;
  for (let t = 0; t < 120; t++) {
    stepWorld(w, INPUT.RIGHT);
    if (w.player.x > 35 * TILE) { teleported = true; break; }
  }
  assert.ok(teleported, 'kam beim Ausgangsportal heraus');
  assert.ok(w.player.vx >= 100, `Tempo blieb erhalten (${w.player.vx})`);
  assert.ok(w.player.y < 20 * TILE, 'kommt im Ausgangsportal (in der Luft) heraus');
  // Ein paar Ticks weiter: nicht zurückgesprungen
  run(w, 10, 0);
  assert.ok(w.player.x > 35 * TILE);
});

// ── Logik ───────────────────────────────────────────────────────────────────

test('Schalter und Farbblöcke: rot fest bei 0, blau bei 1; man wird nicht eingemauert', () => {
  const b = arena().put(10, STAND, 'R').put(12, STAND, 'B').put(20, STAND, 'T');
  const w = b.world();
  const [red, blue] = w.elements;
  assert.equal(red.on, true);
  assert.equal(blue.on, false);
  // Vom roten Block gestoppt
  placeAt(w, 7, STAND);
  run(w, 60, INPUT.RIGHT);
  assert.ok(w.player.x < 10 * TILE, 'rot blockiert');

  // Schalter drücken
  placeAt(w, 20, STAND);
  run(w, 2, 0);
  assert.equal(w.flags.sw, 1);
  stepWorld(w, 0);
  assert.equal(red.on, false);
  assert.equal(blue.on, true);

  // In den (jetzt nicht festen) roten Block stellen, zurückschalten: er wartet
  warpPlayer(w, 10 * TILE + 3, STAND * TILE);
  w.flags.sw = 0;
  run(w, 5, 0);
  assert.equal(red.on, false, 'wartet, weil der Spieler darin steht');
  warpPlayer(w, 30 * TILE, STAND * TILE);
  run(w, 3, 0);
  assert.equal(red.on, true, 'wird fest, sobald frei');
});

test('Schalter-Kanäle: jeder Schalter schaltet nur die Blöcke seines Kanals; Kanal 0 bleibt das alte Rot/Blau', () => {
  const events = [];
  const b = arena().put(10, STAND, 'R').put(20, STAND, 'T');
  const entities = [
    { type: 'colorBlock', tx: 12, ty: STAND, channel: 1, solidWhen: 0 },
    { type: 'colorBlock', tx: 14, ty: STAND, channel: 1, solidWhen: 1 },
    { type: 'colorBlock', tx: 16, ty: STAND, channel: 3, solidWhen: 0 },
    { type: 'switch', tx: 24, ty: STAND, channel: 1 },
  ];
  const w = createWorld(parseMap(b.rows(), { entities }), { emit: (type, data) => events.push([type, data]) });
  const byPos = (tx) => w.elements.find((e) => e.tx === tx);
  const [ch0, a1, b1, c3] = [10, 12, 14, 16].map(byPos);
  assert.deepEqual([ch0.on, a1.on, b1.on, c3.on], [true, true, false, true]);

  // Kanal-1-Schalter: nur Bit 1 kippt
  placeAt(w, 24, STAND);
  run(w, 2, 0);
  assert.equal(w.flags.sw, 0b10);
  stepWorld(w, 0);
  assert.deepEqual([ch0.on, a1.on, b1.on, c3.on], [true, false, true, true], 'Kanal 0 und 3 bleiben, Kanal 1 kippt');
  assert.deepEqual(events.find(([type]) => type === 'switch')[1].channel, 1);

  // Der alte Schalter (Kanal 0) lässt Kanal 1 in Ruhe und kippt nur Bit 0
  placeAt(w, 20, STAND);
  run(w, 2, 0);
  assert.equal(w.flags.sw, 0b11);
  stepWorld(w, 0);
  assert.deepEqual([ch0.on, a1.on, b1.on, c3.on], [false, false, true, true]);
});

test('Schlüssel und Tür: Tür bleibt zu, bis man mit Schlüssel dagegenläuft; zusammenhängende Blöcke öffnen gemeinsam', () => {
  const b = arena().put(8, STAND, 'K').rect(20, 21, 1, 5, 'Y');
  const w = b.world();
  const doors = w.elements.filter((e) => e.type === 'door');
  assert.equal(doors.length, 5);
  assert.equal(new Set(doors.map((d) => d.group)).size, 1, 'eine Gruppe');

  placeAt(w, 15, STAND);
  run(w, 90, INPUT.RIGHT);
  assert.ok(w.player.x < 20 * TILE, 'ohne Schlüssel bleibt die Tür zu');

  placeAt(w, 8, STAND);
  run(w, 2, 0);
  assert.equal(w.flags.keys, 1);
  run(w, 240, INPUT.RIGHT);
  assert.ok(doors.every((d) => d.open), 'alle Blöcke offen');
  assert.equal(w.flags.keys, 0, 'Schlüssel verbraucht');
  assert.ok(w.player.x > 21 * TILE, 'hindurchgelaufen');
});

test('Checkpoint sichert den Zustand: Schlüssel davor liegt nach dem Tod wieder da, danach nicht', () => {
  // Schlüssel bei 5, Checkpoint bei 15, Abgrund bei 25
  const b = arena().put(5, STAND, 'K').put(15, STAND, 'C').rect(25, 26, 5, 4, '.');
  const w = b.world();

  // Schlüssel holen, dann sterben (vor dem Checkpoint): Schlüssel wieder da
  placeAt(w, 5, STAND);
  run(w, 2, 0);
  assert.equal(w.flags.keys, 1);
  warpPlayer(w, 26 * TILE, 28 * TILE);
  run(w, 200, 0);
  assert.equal(w.deaths, 1);
  assert.equal(w.flags.keys, 0);
  assert.equal(w.elements[0].taken, false, 'Schlüssel wieder da');

  // Schlüssel holen, Checkpoint passieren, sterben: Schlüssel bleibt genommen
  placeAt(w, 5, STAND);
  run(w, 2, 0);
  placeAt(w, 15, STAND);
  run(w, 3, 0);
  assert.equal(w.checkpointIndex, 1);
  warpPlayer(w, 26 * TILE, 28 * TILE);
  run(w, 200, 0);
  assert.equal(w.deaths, 2);
  assert.equal(w.flags.keys, 1, 'Schlüssel bleibt in der Tasche');
});

// ── Ganzes ──────────────────────────────────────────────────────────────────

// ── Erweiterungen aus dem Feedback: breite Blöcke, Pad-Richtungen, Böen ────────

test('Breiter fallender Block: lässt sich nicht unterlaufen, am Rand ausgelöst wird er zur Stufe', () => {
  // 6 × 2 Tiles, Unterkante 5 Tiles über dem Boden: Wackeln + Fall dauern länger, als man zum Durchlaufen braucht
  const parse = { markers: { a: { type: 'fallingBlock', width: 6, height: 2, reset: 6 } } };
  const b = arena().put(10, 19, 'a');
  const block = () => b.world(undefined, parse).elements[0];
  assert.equal(block().bw, 6 * TILE);
  assert.equal(block().bh, 2 * TILE);

  const sprint = b.world(undefined, parse);
  placeAt(sprint, 8, STAND, 3);
  run(sprint, 200, INPUT.RIGHT);
  assert.equal(sprint.deaths, 1, 'beim Durchlaufen erschlagen');
  assert.equal(sprint.deathReason, 'falling');

  // Knapp neben der Kante stehen (innerhalb der 6 px Toleranz) löst aus, ohne dass man getroffen wird
  const w = b.world(undefined, parse);
  const el = w.elements[0];
  placeAt(w, 9, STAND, 3);
  run(w, 300, 0);
  assert.equal(w.deaths, 0);
  assert.equal(el.st, 3, 'liegt');
  assert.equal(el.y, (STAND + 1) * TILE - 2 * TILE, 'auf dem Boden, 2 Tiles hoch');
  assert.ok(w.solids.some((s) => s.owner === el.i && s.w === 6 * TILE && s.h === 2 * TILE), 'ist ein fester Block');
  // Ab jetzt woanders stehen, sonst löst der zurückgekehrte Block sofort wieder aus.
  // `reset` hält ihn länger als die 2 s des Standards.
  placeAt(w, 3, STAND);
  run(w, 400, 0);
  assert.equal(el.st, 3, 'nach 3,3 s noch da');
  run(w, 400, 0);
  assert.equal(el.st, 0, 'danach zurück an seinem Platz');
});

test('Sprungpad-Richtungen: schräg trägt weit, seitliche Wandpads schieben mit Auftrieb', () => {
  for (const [dir, sign] of [['upRight', 1], ['upLeft', -1]]) {
    const w = arena().put(20, STAND, 'a').world(undefined, { markers: { a: { type: 'spring', dir } } });
    placeAt(w, 20, STAND);
    w.player.dashCharges = 0;
    stepWorld(w, 0);
    const v = w.cfg.springSpeed * 0.7071;
    assert.ok(Math.abs(w.player.vx - sign * v) < 30, `${dir}: vx ${w.player.vx}`);
    assert.ok(w.player.vy < -v + 60, `${dir}: vy ${w.player.vy}`);
    assert.equal(w.player.dashCharges, 0, 'Sprungpad füllt Dash nicht mehr auf');
  }

  // Wand links (Kachel 10), Pad an ihrer rechten Seite schiebt nach rechts; man läuft von rechts hinein
  const side = arena().rect(10, 20, 1, 6).put(11, STAND, 'a').world(undefined, { markers: { a: { type: 'spring', dir: 'right' } } });
  assert.equal(side.elements[0].dir, 'right');
  placeAt(side, 13, STAND, 3);
  let peakVx = 0;
  for (let t = 0; t < 40; t++) {
    stepWorld(side, INPUT.LEFT);
    peakVx = Math.max(peakVx, side.player.vx);
  }
  assert.ok(peakVx > side.cfg.springSpeed - 40, `Wandpad: vx ${peakVx}`);
});

test('Windböen: an, aus und Vorwarnung nach der Tick-Zahl; nur während "an" wirkt der Wind', () => {
  const parse = { markers: { a: { type: 'wind', w: 4, h: 16, ay: -1800, period: 2, on: 0.5, warn: 0.3 } } };
  const w = arena().put(20, 10, 'a').world(undefined, parse);
  const el = w.elements[0];
  const at = (tick) => { while (w.tick < tick) stepWorld(w, 0); };
  placeAt(w, 21, 20);
  w.player.y = 12 * TILE;
  at(w.tick + 1);
  // Der Zyklus zählt ab Tick 0 der Welt (settle hat schon einige Ticks verbraucht) — daher relativ prüfen
  const period = el.period;
  assert.equal(period, 240);
  const seen = { on: 0, off: 0, warn: 0 };
  for (let t = 0; t < period * 2; t++) {
    stepWorld(w, INPUT.LEFT | INPUT.RIGHT);
    if (el.on) seen.on++; else seen.off++;
    if (el.warn) seen.warn++;
  }
  assert.equal(seen.on, 2 * el.onTicks);
  assert.equal(seen.off, 2 * (period - el.onTicks));
  assert.equal(seen.warn, 2 * el.warnTicks);
  assert.ok(!(el.on && el.warn), 'Vorwarnung nur, solange der Wind aus ist');
});

test('Dash-Puffer: ein zu früh gedrückter Dash startet, sobald die Abklingzeit endet — ein viel zu früher verfällt', () => {
  const start = () => {
    const w = mitDash(arena().world());
    w.player.x = 10 * TILE;
    w.player.y = 12 * TILE;
    stepWorld(w, INPUT.RIGHT | INPUT.DASH);     // erster Dash: die Abklingzeit läuft
    assert.ok(w.player.dashTimer > 0);
    return w;
  };
  // Ticks aus der Konfiguration ableiten statt fest zu verdrahten, damit der Test unabhängig vom
  // konkreten Zahlenwert von dashCooldownTime/dashBufferTime bleibt (siehe sim/config.js).
  const cooldownTicks = Math.round(TICK_HZ * start().cfg.dashCooldownTime);
  const bufferTicks = Math.round(TICK_HZ * start().cfg.dashBufferTime);

  // Kurz vor Ende der Abklingzeit gedrückt (Dash schon fertig, Ladung wieder da, Rest-Abklingzeit
  // deutlich kürzer als der Puffer): startet von selbst, sobald die Abklingzeit endet
  const early = start();
  const elapsedEarly = cooldownTicks - Math.max(1, Math.floor(bufferTicks / 2));
  run(early, elapsedEarly, INPUT.RIGHT);
  early.player.dashCharges = 1;
  stepWorld(early, INPUT.RIGHT | INPUT.DASH);
  assert.equal(early.player.dashTimer, 0, 'noch Abklingzeit');
  let started = -1;
  for (let t = 0; t < bufferTicks && started < 0; t++) {
    stepWorld(early, INPUT.RIGHT);
    if (early.player.dashTimer > 0) started = t;
  }
  assert.ok(started >= 0, 'gepufferter Dash startete');

  // Deutlich früher gedrückt: Die Abklingzeit endet erst lange nach dem Puffer, der Druck ist verfallen
  const tooEarly = start();
  const elapsedTooEarly = Math.max(1, cooldownTicks - bufferTicks - 4);
  run(tooEarly, elapsedTooEarly, INPUT.RIGHT);
  tooEarly.player.dashCharges = 1;
  stepWorld(tooEarly, INPUT.RIGHT | INPUT.DASH);
  run(tooEarly, cooldownTicks + 10, INPUT.RIGHT);
  assert.equal(tooEarly.player.dashTimer, 0, 'zu früh: verfallen');
});

test('Ein Level mit allen Elementen ist deterministisch (Hash je Tick) und läuft nach resetRun identisch', async () => {
  const { hashWorld } = await import('../hash.js');
  const { createWorld } = await import('../world.js');
  const { parseMap } = await import('../tilemap.js');

  const b = arena({ w: 90 }).put(10, STAND, '^').put(14, STAND, 'P').put(18, STAND, 'D').put(22, 20, 'O')
    .put(26, 22, '~').put(30, 12, 'F').put(34, STAND, 'T').put(36, STAND, 'R').put(38, STAND, 'B')
    .put(42, STAND, 'K').rect(46, 21, 1, 5, 'Y').put(50, STAND, 'C')
    .put(54, 20, 'a').put(58, 20, 'b').put(62, 22, 'c').put(66, 22, 'd').put(70, 8, 'e').put(74, 8, 'f')
    .put(78, 14, 'g').put(80, 8, 'h').put(84, STAND, 'i');
  const parse = { markers: {
    a: { type: 'saw', orbit: 2 }, b: { type: 'saw', path: [[0, 0], [4, 0]] },
    c: { type: 'mover', path: [[0, 0], [5, 0]] }, d: { type: 'laser', dir: 'up', period: 1.5 },
    e: { type: 'wind', w: 3, h: 6 }, f: { type: 'gravityZone', w: 3, h: 6 },
    g: { type: 'portal', id: 'A', pair: 'B' }, h: { type: 'portal', id: 'B', pair: 'A' },
    i: { type: 'spring' },
  } };
  const rows = b.rows();
  const script = (t) => (t % 240 < 120 ? INPUT.RIGHT : INPUT.RIGHT | INPUT.JUMP) | ((t % 97 === 0) ? INPUT.DASH : 0);
  const a = createWorld(parseMap(rows, parse));
  const c = createWorld(parseMap(rows, parse));
  for (let t = 0; t < 2500; t++) {
    stepWorld(a, script(t));
    stepWorld(c, script(t));
    assert.equal(hashWorld(a), hashWorld(c), `Abweichung bei Tick ${t}`);
  }
  const first = hashWorld(a);
  resetRun(a);
  for (let t = 0; t < 2500; t++) stepWorld(a, script(t));
  assert.equal(hashWorld(a), first, 'nach resetRun derselbe Verlauf');
});

// ── Nachgereichte Gefahren (Rückmeldung vom 23.09.2026) ─────────────────────

test('Säge: mehrere Sägen auf einer Bahn laufen versetzt und töten alle', () => {
  // Bahn auf Standhöhe, damit man sich zum Prüfen hineinstellen kann
  const parse = { markers: { a: { type: 'saw', path: [[0, 0], [12, 0]], speed: 80, count: 3 } } };
  const w = arena().put(10, STAND, 'a').world(undefined, parse);
  const saw = w.elements[0];
  assert.equal(saw.bodies.length, 3, 'drei Körper');

  // Sie stehen nie alle an derselben Stelle (sonst wäre die Kette sinnlos)
  let apart = 0;
  for (let t = 0; t < 200; t++) {
    stepWorld(w, 0);
    const xs = saw.bodies.map((b) => Math.round(b.x));
    if (new Set(xs).size === 3) apart++;
  }
  assert.ok(apart > 150, `verteilt in ${apart} von 200 Ticks`);

  // In die Bahn stellen und warten, bis eine der Sägen vorbeikommt
  const hit = arena().put(10, STAND, 'a').world(undefined, parse);
  placeAt(hit, 18, STAND);
  let died = false;
  for (let t = 0; t < 400 && !died; t++) {
    stepWorld(hit, 0);
    died = hit.deaths > 0;
  }
  assert.ok(died, 'von einer Säge der Kette erwischt');
  assert.equal(hit.deathReason, 'saw');
});

test('Laser: drehend — Winkel folgt der Tick-Zahl, Strahl endet am Block, tötet nur im Strahl', () => {
  const parse = { markers: { a: { type: 'laser', dir: 'right', period: 4, on: 3.5, spin: 0.25, reach: 12 } } };
  const w = arena({ w: 60, h: 40, floor: 36 }).put(20, 20, 'a').world(undefined, parse);
  const laser = w.elements[0];
  assert.ok(laser.spin > 0 && laser.len > 0, 'dreht und hat eine Länge');

  // Eine Vierteldrehung pro Sekunde: nach 1 s ist der Strahl um 90° weitergewandert. Gemessen wird
  // die ÄNDERUNG, nicht der absolute Winkel — die Welt hat beim Test schon ein paar Ticks hinter sich.
  const turnsOf = (el) => Math.atan2(el.ay, el.ax) / (Math.PI * 2);
  const before = turnsOf(laser);
  for (let t = 0; t < TICK_HZ; t++) stepWorld(w, 0);
  const delta = (turnsOf(laser) - before + 1) % 1;
  assert.ok(Math.abs(delta - 0.25) < 0.02, `nach 1 s eine Vierteldrehung weiter, war ${delta.toFixed(3)}`);

  // Der Strahl überstreicht den Spieler irgendwann und tötet ihn dabei (Emitter 5 Kacheln über ihm,
  // also klar innerhalb der eingestellten Länge)
  const sweep = arena({ w: 60, h: 40, floor: 36 }).put(20, 30, 'a').world(undefined, parse);
  placeAt(sweep, 20, 35);
  let died = false;
  for (let t = 0; t < 4 * TICK_HZ && !died; t++) {
    stepWorld(sweep, 0);
    died = sweep.deaths > 0;
  }
  assert.ok(died, 'vom drehenden Strahl erfasst');
  assert.equal(sweep.deathReason, 'laser');
});

test('Spikes: einfahrend — eingefahren harmlos, ausgefahren tödlich, Takt aus der Tick-Zahl', () => {
  // phase 0,5: Der Takt startet in der eingefahrenen Hälfte, man kann sich also erst draufstellen
  const parse = { markers: { a: { type: 'spike', dir: 'up', period: 2, on: 0.8, warn: 0.3, phase: 0.5 } } };
  const w = arena().put(10, STAND, 'a').world(undefined, parse);
  const spike = w.elements[0];

  const seen = { deadly: 0, safe: 0 };
  for (let t = 0; t < 2 * TICK_HZ; t++) {
    stepWorld(w, 0);
    if (spike.deadly) seen.deadly++; else seen.safe++;
  }
  assert.ok(seen.deadly > 0 && seen.safe > 0, `beides kommt vor: ${JSON.stringify(seen)}`);
  assert.ok(seen.safe > seen.deadly, 'die meiste Zeit eingefahren (on = 0,8 s von 2 s)');

  // Draufstehen: Man überlebt die eingefahrene Phase und stirbt erst, wenn sie ausfahren
  const stand = arena().put(10, STAND, 'a').world(undefined, parse);
  placeAt(stand, 10, STAND);
  let survived = 0;
  let died = -1;
  for (let t = 0; t < 2 * TICK_HZ; t++) {
    stepWorld(stand, 0);
    if (stand.deaths > 0) { died = t; break; }
    survived++;
  }
  assert.ok(survived > 10, `hat die eingefahrene Phase überlebt (${survived} Ticks)`);
  assert.ok(died > 0, 'stirbt, sobald sie ausfahren');
  assert.equal(stand.deathReason, 'spike');
});

test('Eiswand: kein Wandrutschen, kein Wandsprung, kein neuer Luftsprung', () => {
  // Zwei Wände: links normal, rechts Eis — dieselbe Figur, derselbe Anlauf
  const build = (ch) => {
    const b = arena({ w: 40, h: 40, floor: 36 }).rect(20, 10, 1, 24, ch);
    const w = b.world();
    placeAt(w, 19, 20);
    w.player.airJumps = 0;          // Luftsprung schon verbraucht: nur die Wand könnte ihn zurückgeben
    return w;
  };

  const normal = build('#');
  run(normal, 30, INPUT.RIGHT);
  assert.ok(normal.player.sliding, 'an der normalen Wand rutscht man');
  assert.equal(normal.player.airJumps, normal.cfg.airJumps, 'Wand füllt den Luftsprung auf');

  const ice = build('I');
  run(ice, 30, INPUT.RIGHT);
  assert.equal(ice.player.wallKind, KIND.ICE);
  assert.equal(ice.player.sliding, false, 'an Eis rutscht man ungebremst hinunter');
  assert.equal(ice.player.airJumps, 0, 'Eis gibt keinen Luftsprung zurück');
  assert.ok(ice.player.vy > normal.player.vy + 50, `fällt schneller (${ice.player.vy.toFixed(0)} statt ${normal.player.vy.toFixed(0)})`);

  // Wandsprung: an der normalen Wand trägt er weg, an Eis passiert nichts
  const jumpAway = (w) => {
    const x0 = w.player.x;
    run(w, 12, INPUT.RIGHT | INPUT.JUMP);
    return w.player.x - x0;
  };
  assert.ok(jumpAway(normal) < -5, 'Wandsprung stößt von der Wand weg');
  assert.ok(jumpAway(ice) > -1, 'an Eis gibt es keinen Wandsprung');
});
