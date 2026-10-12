// Engine-Tests für Flick Soccer:  npm run test:flick
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD, PIECE, BALL, FORMATION_IDS, formationSpots, createMatch, playShot, passTurn, sanitizeShot, simulateShot,
  createSim, stepSim, kickoffState,
} from '../index.js';

const inside = (b, r) =>
  b.y >= r - 1e-6 && b.y <= FIELD.H - r + 1e-6 && b.x >= -FIELD.GOAL_D + r - 1e-6 && b.x <= FIELD.W + FIELD.GOAL_D - r + 1e-6;

test('jede Aufstellung: fünf Scheiben in der eigenen Hälfte, ohne Überlappung, außerhalb des Mittelkreises', () => {
  for (const id of FORMATION_IDS) {
    for (const team of [0, 1]) {
      const spots = formationSpots(id, team);
      assert.equal(spots.length, 5);
      for (const s of spots) {
        assert.ok(team === 0 ? s.x + PIECE.R < FIELD.W / 2 : s.x - PIECE.R > FIELD.W / 2, `${id} Team ${team} Hälfte`);
        assert.ok(Math.hypot(s.x - FIELD.W / 2, s.y - FIELD.H / 2) > FIELD.CENTER_R + PIECE.R, `${id} Mittelkreis`);
        assert.ok(inside(s, PIECE.R), `${id} im Feld`);
      }
      for (let i = 0; i < 5; i++)
        for (let j = i + 1; j < 5; j++)
          assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y) > 2 * PIECE.R + 4, `${id} Abstand`);
    }
  }
});

test('Simulation ist deterministisch und endet', () => {
  const state = kickoffState(['2-2', '1-3']);
  const shot = { piece: 4, sx: 0.83, sy: -0.31 };
  const a = simulateShot(state, shot);
  const b = simulateShot(JSON.parse(JSON.stringify(state)), JSON.parse(JSON.stringify(shot)));
  assert.deepEqual(a, b);
  assert.ok(a.steps > 10);
});

test('Schuss direkt aufs leere Tor ist ein Tor für den Schützen', () => {
  const state = {
    pieces: [{ x: 700, y: 320, team: 0 }, ...Array.from({ length: 9 }, (_, i) => ({ x: 100 + i * 10, y: 40 + i * 70, team: i < 4 ? 0 : 1 }))],
    ball: { x: 760, y: 320 },
  };
  // Scheibe 0 ist hier Team 0 → schießt nach rechts
  const r = simulateShot(state, { piece: 0, sx: 1, sy: 0 });
  assert.equal(r.goal, 0);
});

test('Ball bleibt in jedem Fall im Feld oder im Torkasten (100 Zufallsschüsse)', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let match = createMatch({ formations: ['2-2', '3-1'] });
  for (let k = 0; k < 100; k++) {
    const base = match.turn * 5;
    const piece = base + Math.floor(rnd() * 5);
    const ang = rnd() * Math.PI * 2;
    const p = 0.3 + rnd() * 0.7;
    const sim = createSim(match.state, { piece, sx: Math.cos(ang) * p, sy: Math.sin(ang) * p });
    while (!stepSim(sim)) {
      for (const b of sim.bodies) assert.ok(inside(b, b.r), `Körper verlässt das Feld bei Schuss ${k}`);
      sim.events.length = 0;
    }
    const res = playShot(match, match.turn, { piece, sx: Math.cos(ang) * p, sy: Math.sin(ang) * p });
    assert.ok(res);
    match = res.match;
    if (match.winner !== null) match = createMatch({ formations: ['2-2', '3-1'] });
  }
});

test('Regeln: Zugwechsel, fremde Scheibe verboten, Tor → Anstoß für den Kassierenden, Sieg', () => {
  let m = createMatch({ settings: { goalsToWin: 1 } });
  assert.equal(m.turn, 0);
  assert.equal(sanitizeShot(m, 0, { piece: 7, sx: 1, sy: 0 }), null);
  assert.equal(sanitizeShot(m, 1, { piece: 7, sx: 1, sy: 0 }), null);
  const s = sanitizeShot(m, 0, { piece: 1, sx: 3, sy: 4 });
  assert.ok(Math.abs(Math.hypot(s.sx, s.sy) - 1) < 1e-12);
  m = passTurn(m);
  assert.equal(m.turn, 1);
  // Team 1 schießt seinen Stürmer gerade auf den Ball → Ball läuft ins linke Tor? Nicht garantiert — Regeln direkt prüfen:
  const goal = { ...m, state: { ...m.state, ball: { x: -BALL.R - 5, y: 320 } } };
  const after = playShot(goal, 1, { piece: 9, sx: 0.01, sy: 0 });
  assert.equal(after.result.goal, 1);
  assert.equal(after.match.winner, 1);
  assert.deepEqual(after.match.score, [0, 1]);
});

test('Tor ohne Sieg: neu aufgestellt, Gegner hat Anstoß', () => {
  const m = createMatch({ settings: { goalsToWin: 3 } });
  const g = { ...m, state: { ...m.state, ball: { x: FIELD.W + BALL.R + 5, y: 320 } } };
  const after = playShot(g, 0, { piece: 0, sx: 0.01, sy: 0 });
  assert.equal(after.result.goal, 0);
  assert.deepEqual(after.match.score, [1, 0]);
  assert.equal(after.match.turn, 1);
  assert.equal(after.match.state.ball.x, FIELD.W / 2);
});

test('Designs: Klassik immer frei, Freischaltung über Zähler, Fortschritt gedeckelt', async () => {
  const { SKIN_IDS, isUnlocked, skinProgress, unlockedSkins, isSkin } = await import('../index.js');
  assert.ok(isUnlocked('klassik', {}));
  assert.equal(isUnlocked('streifen', { played: 2 }), false);
  assert.ok(isUnlocked('streifen', { played: 3 }));
  assert.deepEqual(skinProgress('krone', { wins: 25 }), { have: 10, need: 10 });
  assert.equal(isSkin('gibtsnicht'), false);
  assert.equal(unlockedSkins({}).length, 1);
  const all = { played: 99, wins: 99, goals: 99, winsEasy: 1, winsMedium: 1, winsHard: 1, onlineWins: 1, cleanSheets: 1 };
  assert.equal(unlockedSkins(all).length, SKIN_IDS.length);
});

test('Wiederholung: Dauer wächst mit dem Schuss, ist aber gedeckelt', async () => {
  const { replayMs, REPLAY } = await import('../index.js');
  assert.ok(replayMs(100) < replayMs(500));
  assert.equal(replayMs(10_000), replayMs(REPLAY.TAIL_STEPS));
  assert.equal(normalizeSettingsReplay(), false);
});

function normalizeSettingsReplay() {
  return createMatch({ settings: {} }).settings.replay;
}

test('Torblockade: Scheibe zu mehr als der Hälfte im Tor wird herausgeschoben, knapp drin bleibt sie', async () => {
  const { GOAL_RULE } = await import('../index.js');
  const base = kickoffState(['2-2', '2-2']);
  // Rote Scheibe 2 tief im eigenen (linken) Tor, blaue Scheibe 7 halb im rechten Tor, rote Scheibe 3 nur knapp drin
  const pieces = base.pieces.map((p) => ({ ...p }));
  pieces[0] = { x: 200, y: 100, team: 0 }; // Torwart aus dem Weg, damit die Schubstrecke messbar ist
  pieces[1] = { x: -20, y: 270, team: 0 };
  pieces[5] = { x: 800, y: 100, team: 1 };
  pieces[6] = { x: FIELD.W + 5, y: 300, team: 1 };
  pieces[2] = { x: 20, y: 385, team: 0 }; // Mitte vor der Linie (nur ~20 % drin) → bleibt
  const state = { pieces, ball: base.ball };
  const r = simulateShot(state, { piece: 4, sx: 0.05, sy: 0 });
  // deutlich vor das Tor, nicht nur auf die Linie
  const [d0, d1] = GOAL_RULE.EJECT_DEPTHS;
  assert.ok(r.state.pieces[1].x >= d0 - 2 && r.state.pieces[1].x <= d1 + 2, `links raus: ${r.state.pieces[1].x}`);
  assert.ok(r.state.pieces[6].x <= FIELD.W - d0 + 2 && r.state.pieces[6].x >= FIELD.W - d1 - 2, `rechts raus: ${r.state.pieces[6].x}`);
  assert.equal(r.goal, null);
  assert.deepEqual(r.state.pieces[2], pieces[2], 'knapp drin bleibt liegen');
  // deterministisch
  assert.deepEqual(r, simulateShot(JSON.parse(JSON.stringify(state)), { piece: 4, sx: 0.05, sy: 0 }));
  // eine Scheibe, die sich langsam ins Tor schiebt, steht am Ende nie mit der Mitte hinter der Linie
  let m = createMatch({ formations: ['4-0', '4-0'] });
  for (let k = 0; k < 40; k++) {
    const piece = m.turn * 5;
    const res = playShot(m, m.turn, { piece, sx: m.turn === 0 ? -0.35 : 0.35, sy: 0 });
    for (const p of res.match.state.pieces) assert.ok(p.x >= 0 && p.x <= FIELD.W, `Scheibe bleibt im Tor stehen (${p.x})`);
    m = res.match;
    if (m.winner !== null) break;
  }
});

test('Torblockade: herausgeschoben wird dorthin, wo nichts im Weg steht', async () => {
  const { GOAL_RULE } = await import('../index.js');
  const base = kickoffState(['2-2', '2-2']);
  const pieces = base.pieces.map((p) => ({ ...p }));
  pieces[0] = { x: -20, y: 320, team: 0 }; // im eigenen Tor
  pieces[1] = { x: 110, y: 320, team: 0 }; // steht genau gerade davor
  pieces[2] = { x: 125, y: 400, team: 0 }; // und schräg darunter
  const state = { pieces, ball: base.ball };
  const r = simulateShot(state, { piece: 4, sx: 0.05, sy: 0 });
  const out = r.state.pieces[0];
  assert.ok(out.x >= GOAL_RULE.EJECT_DEPTHS[0] - 2, `weit genug raus: ${out.x}`);
  assert.deepEqual(r.state.pieces[1], pieces[1], 'Scheibe davor wurde nicht angestoßen');
  assert.deepEqual(r.state.pieces[2], pieces[2], 'Scheibe schräg davor wurde nicht angestoßen');
  for (const o of [pieces[1], pieces[2]]) assert.ok(Math.hypot(out.x - o.x, out.y - o.y) >= 2 * PIECE.R, 'kein Überlappen');
});
