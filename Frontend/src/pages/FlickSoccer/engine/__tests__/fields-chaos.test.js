// Felder und Chaos-Modus:  npm run test:flick
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIECE, BALL, FIELDS, FIELD_IDS, FORMATION_IDS, POWERUP_IDS, POWERUP_FX, PHYS, HAND_SIZE,
  formationSpots, formationInfo, kickoffState, createMatch, playShot, passTurn, chaosHand, canPlayCard, usablePower, cardAt, dealHand,
  createSim, stepSim, simulateShot, normalizeSettings, encodeCustom, parseCustom, customProblem, isFormation,
} from '../index.js';

const distToSegment = (px, py, [ax, ay, bx, by]) => {
  const ex = bx - ax;
  const ey = by - ay;
  let t = ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + ex * t), py - (ay + ey * t));
};

test('jede Aufstellung passt auf jedes Feld: eigene Hälfte, frei von Banden, Hindernissen, Mittelkreis und einander', () => {
  for (const fid of FIELD_IDS) {
    const f = FIELDS[fid];
    for (const id of FORMATION_IDS) {
      for (const team of [0, 1]) {
        const spots = formationSpots(id, team, f);
        for (const s of spots) {
          const where = `${fid} / ${id} / Team ${team}`;
          assert.ok(team === 0 ? s.x + PIECE.R < f.W / 2 : s.x - PIECE.R > f.W / 2, `${where}: eigene Hälfte`);
          assert.ok(Math.hypot(s.x - f.W / 2, s.y - f.H / 2) > f.CENTER_R + PIECE.R, `${where}: Mittelkreis`);
          for (const w of f.walls) assert.ok(distToSegment(s.x, s.y, w) >= PIECE.R - 1e-6, `${where}: Bande`);
          for (const b of f.bumpers) assert.ok(Math.hypot(s.x - b.x, s.y - b.y) > b.r + PIECE.R + 4, `${where}: Hindernis`);
        }
        for (let i = 0; i < 5; i++)
          for (let j = i + 1; j < 5; j++)
            assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y) > 2 * PIECE.R + 1, `${fid} / ${id}: Abstand`);
      }
    }
    // der Ball liegt beim Anstoß frei
    const k = kickoffState(['2-2', '2-2'], fid);
    assert.equal(k.field, fid);
    for (const b of f.bumpers) assert.ok(Math.hypot(k.ball.x - b.x, k.ball.y - b.y) > b.r + BALL.R + 20);
  }
});

test('auf jedem Feld bleibt alles im Feld oder im Torkasten, und die Rechnung ist deterministisch (60 Zufallsschüsse je Feld)', () => {
  for (const fid of FIELD_IDS) {
    const f = FIELDS[fid];
    let seed = 4711;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    let m = createMatch({ settings: { field: fid }, formations: ['2-2', '1-3'] });
    for (let k = 0; k < 60; k++) {
      const piece = m.turn * 5 + Math.floor(rnd() * 5);
      const ang = rnd() * Math.PI * 2;
      const p = 0.3 + rnd() * 0.7;
      const shot = { piece, sx: Math.cos(ang) * p, sy: Math.sin(ang) * p };
      const sim = createSim(m.state, shot);
      while (!stepSim(sim)) {
        for (const b of sim.bodies) {
          assert.ok(b.y >= b.r - 1e-6 && b.y <= f.H - b.r + 1e-6, `${fid}: y außerhalb (Schuss ${k})`);
          assert.ok(b.x >= -f.GOAL_D + b.r - 1e-6 && b.x <= f.W + f.GOAL_D - b.r + 1e-6, `${fid}: x außerhalb (Schuss ${k})`);
          for (const bu of f.bumpers) assert.ok(Math.hypot(b.x - bu.x, b.y - bu.y) >= b.r + bu.r - 1e-6, `${fid}: im Hindernis`);
        }
        sim.events.length = 0;
      }
      const a = playShot(m, m.turn, shot);
      const b = playShot(JSON.parse(JSON.stringify(m)), m.turn, shot);
      assert.deepEqual(a.result, b.result);
      m = a.match.winner !== null ? createMatch({ settings: { field: fid }, formations: ['2-2', '1-3'] }) : a.match;
    }
  }
});

test('Käfig: ein Ball in Richtung Ecke prallt an der Schräge ab statt dort liegen zu bleiben', () => {
  const f = FIELDS.kaefig;
  const state = { field: 'kaefig', pieces: kickoffState(['2-2', '2-2'], 'kaefig').pieces, ball: { x: 200, y: 200 } };
  state.pieces[0] = { x: 260, y: 260, team: 0 };
  const r = simulateShot(state, { piece: 0, sx: -0.6, sy: -0.6 });
  assert.ok(r.state.ball.x + r.state.ball.y > f.cut, 'Ball liegt nicht hinter der Schräge');
});

test('Chaos ist fair: je zwölf gezogene Karten sieht jedes Team jede Karte genau einmal, die Stapel sind verschieden', () => {
  for (const seed of [1, 99, 123456789]) {
    for (const team of [0, 1]) {
      for (let round = 0; round < 3; round++) {
        const twelve = Array.from({ length: POWERUP_IDS.length }, (_, i) => cardAt(seed, team, round * POWERUP_IDS.length + i));
        assert.deepEqual([...twelve].sort(), [...POWERUP_IDS].sort());
      }
    }
    const a = Array.from({ length: 24 }, (_, i) => cardAt(seed, 0, i));
    const b = Array.from({ length: 24 }, (_, i) => cardAt(seed, 1, i));
    assert.notDeepEqual(a, b);
  }
  // dieselbe Folge bei jedem Aufruf, auch wenn zwischendurch ein anderer Seed gefragt wurde
  const a = Array.from({ length: 30 }, (_, i) => cardAt(7, 1, i));
  cardAt(8, 0, 30);
  assert.deepEqual(Array.from({ length: 30 }, (_, i) => cardAt(7, 1, i)), a);
  assert.equal(createMatch({ settings: {} }).chaos, null, 'ohne Chaos keine Karten');
  assert.equal(normalizeSettings({}).chaos, false);
});

test('Chaos: drei verschiedene Karten auf der Hand; eine gespielte wird ersetzt, die anderen bleiben liegen', () => {
  for (let seed = 0; seed < 300; seed++) {
    let m = createMatch({ settings: { chaos: true, goalsToWin: 5, turnSeconds: 0 }, formations: ['4-0', '4-0'], seed });
    for (let k = 0; k < 30 && m.winner === null; k++) {
      const team = m.turn;
      const hand = chaosHand(m, team);
      assert.equal(hand.length, HAND_SIZE);
      assert.equal(new Set(hand).size, HAND_SIZE, `Seed ${seed}: keine doppelte Karte`);
      if (m.chaos.bonus) {
        assert.equal(canPlayCard(m, team), false);
        m = playShot(m, team, { piece: team * 5 + 1, sx: 0, sy: 0.1, power: hand[0] }).match;
        assert.deepEqual(chaosHand(m, team), hand, 'Bonus-Schuss verbraucht keine Karte');
        continue;
      }
      const slot = k % 3;
      const card = hand[slot];
      const other = chaosHand(m, 1 - team);
      const r = playShot(m, team, { piece: team * 5 + 1, sx: 0, sy: k % 2 ? 0.1 : -0.1, power: card });
      assert.equal(r.power, card);
      if (r.match.winner !== null || r.result.goal !== null) break;
      const after = chaosHand(r.match, team);
      assert.notEqual(after[slot], card, 'die gespielte Karte ist weg');
      for (let i = 0; i < 3; i++) if (i !== slot) assert.equal(after[i], hand[i], 'die anderen Karten bleiben');
      assert.deepEqual(chaosHand(r.match, 1 - team), other, 'die Hand des Gegners ändert sich nicht');
      m = r.match;
    }
  }
});

test('Chaos: fremde Karten und Karten ohne Chaos werden ignoriert; ohne Karte bleibt die Hand', () => {
  let m = createMatch({ settings: { chaos: true }, formations: ['4-0', '4-0'], seed: 5 });
  const hand = chaosHand(m, 0);
  const notMine = POWERUP_IDS.find((id) => !hand.includes(id));
  const r = playShot(m, 0, { piece: 1, sx: 0, sy: -0.1, power: notMine });
  assert.equal(r.power, null);
  assert.deepEqual(chaosHand(r.match, 0), hand);
  assert.equal(usablePower(m, 1, chaosHand(m, 1)[0]), null, 'nicht am Zug');
  m = passTurn(m);
  assert.deepEqual(chaosHand(m, 0), hand, 'abgelaufene Zugzeit kostet keine Karte');
  const plain = createMatch({ settings: {} });
  assert.equal(playShot(plain, 0, { piece: 1, sx: 0, sy: -0.1, power: 'turbo' }).power, null);
});

test('Doppelschuss: dasselbe Team schießt nochmal, aber ohne Karte; danach geht es normal weiter', () => {
  let seed = 0;
  while (!dealHand(seed, 0).hand.includes('doppel')) seed++;
  let m = createMatch({ settings: { chaos: true, goalsToWin: 5 }, formations: ['4-0', '4-0'], seed });
  const a = playShot(m, 0, { piece: 1, sx: 0, sy: -0.2, power: 'doppel' });
  assert.equal(a.power, 'doppel');
  m = a.match;
  assert.equal(m.turn, 0, 'Team 0 bleibt dran');
  assert.equal(m.chaos.bonus, true);
  assert.ok(!chaosHand(m, 0).includes('doppel'));
  const b = playShot(m, 0, { piece: 2, sx: 0, sy: 0.2, power: chaosHand(m, 0)[0] });
  assert.equal(b.power, null, 'Bonus-Schuss ohne Karte');
  m = b.match;
  assert.equal(m.turn, 1);
  assert.equal(m.chaos.bonus, false);
});

test('Karten wirken in der Physik', () => {
  const base = kickoffState(['2-2', '2-2']);
  // freie Bahn: Scheibe 4 (Team 0) nach oben rechts ins Leere
  const shot = { piece: 3, sx: 0.5, sy: 0 };
  const plain = createSim(base, shot);
  const turbo = createSim(base, shot, { power: 'turbo', team: 0 });
  assert.ok(Math.abs(turbo.bodies[3].vx - plain.bodies[3].vx * POWERUP_FX.TURBO_SPEED) < 1e-9);
  assert.equal(createSim(base, shot, { power: 'schwer', team: 0 }).bodies[3].m, PIECE.M * POWERUP_FX.SCHWER_MASS);
  assert.equal(createSim(base, shot, { power: 'riese', team: 0 }).bodies[3].r, PIECE.R * POWERUP_FX.RIESE_RADIUS);

  // Eiszeit: die gegnerischen Scheiben rühren sich nicht, egal was sie trifft
  const iceState = { ...base, pieces: base.pieces.map((p) => ({ ...p })) };
  iceState.pieces[4] = { x: 700, y: 320, team: 0 };
  iceState.pieces[9] = { x: 800, y: 320, team: 1 };
  const frozen = simulateShot(iceState, { piece: 4, sx: 1, sy: 0 }, { power: 'eis', team: 0 });
  for (let i = 5; i < 10; i++) assert.deepEqual(frozen.state.pieces[i], iceState.pieces[i], 'eingefroren bleibt liegen');
  const normal = simulateShot(iceState, { piece: 4, sx: 1, sy: 0 });
  assert.notDeepEqual(normal.state.pieces[9], iceState.pieces[9], 'ohne Eis wird die Scheibe weggestoßen');

  // Geisterscheibe: gleitet durch die gegnerische Scheibe hindurch, die bleibt liegen
  const ghost = simulateShot(iceState, { piece: 4, sx: 0.32, sy: 0 }, { power: 'geist', team: 0 });
  assert.ok(ghost.state.pieces[4].x > 870, 'Geist kommt hinter der Scheibe an');
  assert.ok(Math.hypot(ghost.state.pieces[9].x - 800, ghost.state.pieces[9].y - 320) < 80, 'Gegner wird höchstens am Ende weggeschoben');

  // Sprengsatz: beim ersten Treffer fliegt alles in der Nähe weg, auch was gar nicht berührt wurde
  const bombState = { ...base, pieces: base.pieces.map((p) => ({ ...p })), ball: { x: 500, y: 60 } };
  bombState.pieces[4] = { x: 600, y: 320, team: 0 };
  bombState.pieces[9] = { x: 760, y: 320, team: 1 };
  bombState.pieces[8] = { x: 690, y: 480, team: 1 };
  const bomb = simulateShot(bombState, { piece: 4, sx: 0.3, sy: 0 }, { power: 'bombe', team: 0 });
  const calm = simulateShot(bombState, { piece: 4, sx: 0.3, sy: 0 });
  assert.deepEqual(calm.state.pieces[8], bombState.pieces[8], 'ohne Sprengsatz bleibt die Nachbarscheibe liegen');
  assert.ok(Math.hypot(bomb.state.pieces[8].x - 690, bomb.state.pieces[8].y - 480) > 30, 'die Druckwelle erfasst die Nachbarscheibe');

  // Schrumpfstrahl und Wasserball: Größen gelten nur während des Zugs, danach steckt nichts ineinander
  const small = createSim(base, shot, { power: 'zwerge', team: 0 });
  for (let i = 5; i < 10; i++) assert.equal(small.bodies[i].r, PIECE.R * POWERUP_FX.ZWERG_RADIUS);
  for (let i = 0; i < 5; i++) assert.equal(small.bodies[i].r, PIECE.R);
  assert.equal(createSim(base, shot, { power: 'wasserball', team: 0 }).bodies[10].r, BALL.R * POWERUP_FX.BALL_RADIUS);
  let seed = 99;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const power of ['zwerge', 'wasserball', 'geist', 'riese', 'schwarm', 'bombe', 'glatteis']) {
    let state = kickoffState(['2-2', '1-3']);
    for (let k = 0; k < 25; k++) {
      const team = k % 2;
      const ang = rnd() * Math.PI * 2;
      const r = simulateShot(state, { piece: team * 5 + Math.floor(rnd() * 5), sx: Math.cos(ang), sy: Math.sin(ang) }, { power, team });
      if (r.goal !== null) {
        state = kickoffState(['2-2', '1-3']);
        continue;
      }
      state = r.state;
      const all = [...state.pieces.map((p) => ({ ...p, r: PIECE.R })), { ...state.ball, r: BALL.R }];
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++)
          assert.ok(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) >= all[i].r + all[j].r - 0.5, `${power}: nach dem Zug überlappt nichts (Schuss ${k})`);
    }
  }

  // Alle Mann: jede eigene Scheibe bewegt sich, keine gegnerische bekommt einen Anfangsstoß
  const swarm = createSim(base, shot, { power: 'schwarm', team: 0 });
  for (let i = 0; i < 5; i++) assert.ok(swarm.bodies[i].vx > 0);
  for (let i = 5; i < 10; i++) assert.equal(swarm.bodies[i].vx, 0);

  // Glatteis: dieselbe Scheibe rollt deutlich weiter
  const free = { ...base, pieces: base.pieces.map((p) => ({ ...p })) };
  free.pieces[3] = { x: 120, y: 40, team: 0 };
  const dry = simulateShot(free, { piece: 3, sx: 0.3, sy: 0 });
  const ice = simulateShot(free, { piece: 3, sx: 0.3, sy: 0 }, { power: 'glatteis', team: 0 });
  assert.ok(ice.state.pieces[3].x - 120 > (dry.state.pieces[3].x - 120) * 1.6);

  // Gummibande: an der Bande geht keine Geschwindigkeit verloren
  const wallState = { ...base, pieces: base.pieces.map((p) => ({ ...p })) };
  wallState.pieces[3] = { x: 360, y: 60, team: 0 };
  const speedAfterBounce = (mods) => {
    const sim = createSim(wallState, { piece: 3, sx: 0, sy: -0.5 }, mods);
    let before = 0;
    while (!stepSim(sim)) {
      if (sim.events.some((e) => e.type === 'wall')) return [before, Math.abs(sim.bodies[3].vy)];
      before = Math.abs(sim.bodies[3].vy);
      sim.events.length = 0;
    }
    return [before, 0];
  };
  const [b1, a1] = speedAfterBounce(null);
  const [b2, a2] = speedAfterBounce({ power: 'gummi', team: 0 });
  assert.ok(a1 < b1 * (PHYS.E_WALL_PIECE + 0.02), 'normale Bande bremst');
  assert.ok(a2 > b2 * 0.97, 'Gummibande bremst nicht');
});

test('Feld-Eigenheiten: Eis rutscht, Sand bremst, Bumper stoßen zurück, Portale befördern, Mauern halten', () => {
  const roll = (field) => {
    const state = kickoffState(['4-0', '4-0'], field);
    state.pieces[1] = { x: 200, y: 60, team: 0 };
    return simulateShot(state, { piece: 1, sx: 0.3, sy: 0 }).state.pieces[1].x - 200;
  };
  assert.ok(roll('eisbahn') > roll('standard') * 1.5, 'Eis');
  assert.ok(roll('strand') < roll('standard') * 0.75, 'Sand');

  // Bumper: die Scheibe kommt schneller zurück, als sie ohne Rückstoß könnte
  const bu = FIELDS.flipper.bumpers[0];
  const fl = kickoffState(['4-0', '4-0'], 'flipper');
  fl.pieces[1] = { x: bu.x - 150, y: bu.y, team: 0 };
  const sim = createSim(fl, { piece: 1, sx: 0.25, sy: 0 });
  let hit = null;
  while (!stepSim(sim) && !hit) {
    hit = sim.events.find((e) => e.type === 'bumper') || null;
    sim.events.length = 0;
  }
  assert.ok(hit, 'Bumper getroffen');
  assert.ok(-sim.bodies[1].vx > hit.speed - bu.kick + 1, 'Rückstoß macht die Scheibe schneller als ein normaler Abprall');

  // Portal: der Ball rollt oben hinein und kommt unten heraus, weiter nach oben
  const [p, q] = FIELDS.wurmloch.portals;
  const wl = kickoffState(['4-0', '4-0'], 'wurmloch');
  wl.ball = { x: p.x, y: p.y + 120 };
  wl.pieces[1] = { x: p.x, y: p.y + 190, team: 0 };
  const ps = createSim(wl, { piece: 1, sx: 0, sy: -0.5 });
  let ported = false;
  while (!stepSim(ps)) {
    if (ps.events.some((e) => e.type === 'portal' && e.ball)) {
      ported = true;
      assert.ok(Math.hypot(ps.bodies[10].x - q.x, ps.bodies[10].y - q.y) < q.r + 1, 'Ball liegt im anderen Portal');
      assert.ok(ps.bodies[10].vy < 0, 'Richtung bleibt');
      break;
    }
    ps.events.length = 0;
  }
  assert.ok(ported, 'Ball wurde befördert');
  // wer im Portal startet, bleibt liegen
  const rest = kickoffState(['4-0', '4-0'], 'wurmloch');
  rest.ball = { x: p.x + 5, y: p.y };
  assert.deepEqual(simulateShot(rest, { piece: 1, sx: 0, sy: 0.05 }).state.ball, rest.ball);

  // Mauer im Burghof: ein Ball direkt auf die Mauer kommt nicht auf die andere Seite
  const bh = kickoffState(['4-0', '4-0'], 'burghof');
  bh.ball = { x: 420, y: 80 };
  bh.pieces[1] = { x: 340, y: 80, team: 0 };
  assert.ok(simulateShot(bh, { piece: 1, sx: 0.7, sy: 0 }).state.ball.x < 500 - BALL.R + 1e-6);
});

test('eigene Aufstellungen: Format, Prüfung auf allen Feldern, Verwendung im Spiel', () => {
  // jede fertige Aufstellung ist auch als eigene gültig und ergibt dieselben Plätze
  for (const id of FORMATION_IDS) {
    const custom = encodeCustom(formationInfo(id).spots);
    assert.match(custom, /^c:\d{30}$/);
    assert.equal(customProblem(parseCustom(custom)), null, `${id} als eigene Aufstellung`);
    assert.ok(isFormation(custom));
    for (const fid of FIELD_IDS) {
      const a = formationSpots(id, 1, FIELDS[fid]);
      const b = formationSpots(custom, 1, FIELDS[fid]);
      for (let i = 0; i < 5; i++) assert.ok(Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y) < 1.5);
    }
  }
  const ok = [[0.06, 0.5], [0.19, 0.3], [0.19, 0.7], [0.36, 0.22], [0.36, 0.78]];
  const bad = (spots) => customProblem(spots);
  assert.equal(bad(ok), null);
  assert.equal(bad([[0.6, 0.5], ...ok.slice(1)]).index, 0, 'gegnerische Hälfte');
  assert.equal(bad([[0.45, 0.5], ...ok.slice(1)]).index, 0, 'Mittelkreis');
  assert.equal(bad([[0.01, 0.5], ...ok.slice(1)]).index, 0, 'im Tor');
  assert.equal(bad([ok[0], [0.08, 0.52], ...ok.slice(2)]).index, 1, 'Überlappung');
  assert.equal(bad([ok[0], [0.02, 0.03], ...ok.slice(2)]).index, 1, 'Ecke');
  assert.ok(bad(ok.slice(1)));
  assert.equal(isFormation('c:123'), false);
  assert.equal(isFormation(encodeCustom([[0.6, 0.5], ...ok.slice(1)])), false);
  assert.equal(parseCustom('2-2'), null);
  assert.equal(formationInfo(encodeCustom(ok)).name, 'Eigene');
  assert.equal(formationInfo('gibtsnicht').name, 'Klassisch');

  const mine = encodeCustom([[0.05, 0.5], [0.2, 0.2], [0.2, 0.8], [0.3, 0.5], [0.36, 0.2]]);
  const m = createMatch({ formations: [mine, 'kaputt'] });
  assert.deepEqual(m.formations, [mine, '2-2']);
  assert.ok(Math.abs(m.state.pieces[4].x - 360) < 1e-9);
});
