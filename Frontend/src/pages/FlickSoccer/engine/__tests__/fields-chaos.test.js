// Felder und Chaos-Modus:  npm run test:flick
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIECE, BALL, FIELDS, FIELD_IDS, FORMATION_IDS, POWERUP_IDS, POWERUP_FX, PHYS,
  formationSpots, kickoffState, createMatch, playShot, passTurn, currentPowerup, upcomingPowerup, powerupAt,
  createSim, stepSim, simulateShot, normalizeSettings,
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

test('Chaos ist fair: jedes Team bekommt je 6 Züge jedes Power-up genau einmal, die Folgen der Teams sind verschieden', () => {
  for (const seed of [1, 99, 123456789]) {
    for (const team of [0, 1]) {
      for (let bag = 0; bag < 3; bag++) {
        const six = Array.from({ length: 6 }, (_, i) => powerupAt(seed, bag * 6 + i, team));
        assert.deepEqual([...six].sort(), [...POWERUP_IDS].sort());
      }
    }
  }
  let m = createMatch({ settings: { chaos: true, goalsToWin: 5, turnSeconds: 0 }, seed: 42 });
  const got = [[], []];
  for (let k = 0; k < 40 && m.winner === null; k++) {
    const p = currentPowerup(m);
    if (p) {
      got[m.turn].push(p);
      assert.equal(p, upcomingPowerup(m, m.turn));
    }
    m = passTurn(m);
  }
  assert.ok(got[0].length >= 12);
  assert.notDeepEqual(got[0], got[1].slice(0, got[0].length));
  assert.equal(currentPowerup(createMatch({ settings: {} })), null, 'ohne Chaos kein Power-up');
  assert.equal(normalizeSettings({}).chaos, false);
});

test('Chaos: im Wechsel der Teams kommt nie zweimal hintereinander dasselbe Power-up — egal wer anfängt', () => {
  for (let seed = 0; seed < 3000; seed++) {
    for (const first of [0, 1]) {
      let last = null;
      for (let k = 0; k < 48; k++) {
        const team = k % 2 === 0 ? first : 1 - first;
        const p = powerupAt(seed, Math.floor(k / 2), team);
        assert.notEqual(p, last, `Seed ${seed}, Anstoß Team ${first}, Zug ${k}`);
        last = p;
      }
    }
  }
  // dieselbe Folge bei jedem Aufruf, auch wenn zwischendurch ein anderer Seed gefragt wurde
  const a = Array.from({ length: 18 }, (_, i) => powerupAt(7, i, 1));
  powerupAt(8, 30, 0);
  assert.deepEqual(Array.from({ length: 18 }, (_, i) => powerupAt(7, i, 1)), a);
});

test('Doppelschuss: dasselbe Team schießt nochmal, aber ohne Power-up; danach geht es normal weiter', () => {
  // Seed suchen, bei dem der erste Zug „doppel" ist
  let seed = 0;
  while (powerupAt(seed, 0) !== 'doppel') seed++;
  let m = createMatch({ settings: { chaos: true, goalsToWin: 5 }, formations: ['4-0', '4-0'], seed });
  assert.equal(currentPowerup(m), 'doppel');
  const a = playShot(m, 0, { piece: 1, sx: 0, sy: -0.2 });
  assert.equal(a.power, 'doppel');
  m = a.match;
  assert.equal(m.turn, 0, 'Team 0 bleibt dran');
  assert.equal(currentPowerup(m), null, 'Bonus-Schuss ohne Power-up');
  m = playShot(m, 0, { piece: 2, sx: 0, sy: 0.2 }).match;
  assert.equal(m.turn, 1);
  assert.equal(currentPowerup(m), powerupAt(seed, 0, 1), 'Team 1 bekommt das erste Power-up seiner eigenen Folge');
  assert.notEqual(currentPowerup(m), 'doppel');
  assert.deepEqual(m.chaos.used, [1, 0]);
});

test('Power-ups wirken in der Physik', () => {
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
