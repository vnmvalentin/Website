// Chaos-Ereignisse und Sonderregeln der Tour-Bosse:  npm run test:flick
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIECE, BALL, EVENT_IDS, EVENT_FX, RULE_FX, EVENT_CALM, EVENT_ACTIVE,
  eventAt, eventForTurn, upcomingEvent, createMatch, currentEvent, nextEvent, shotMods, playShot, passTurn,
  createSim, simulateShot, kickoffState,
} from '../index.js';

test('Ereignisse: zwei ruhige Züge, zwei mit Ereignis; jedes kommt einmal, bevor sich eines wiederholt', () => {
  for (const seed of [0, 7, 987654321]) {
    const seen = [];
    for (let block = 0; block < EVENT_IDS.length * 3; block++) seen.push(eventAt(seed, block));
    for (let k = 0; k < 3; k++) {
      assert.deepEqual([...seen.slice(k * EVENT_IDS.length, (k + 1) * EVENT_IDS.length)].sort(), [...EVENT_IDS].sort());
    }
    for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1], `Seed ${seed}: nie zweimal hintereinander`);
    const cycle = EVENT_CALM + EVENT_ACTIVE;
    for (let turn = 0; turn < 40; turn++) {
      const ev = eventForTurn(seed, turn);
      if (turn % cycle < EVENT_CALM) assert.equal(ev, null);
      else assert.equal(ev, eventAt(seed, Math.floor(turn / cycle)));
      assert.ok(EVENT_IDS.includes(eventForTurn(seed, turn, true)), 'Dauerchaos: jeder Zug hat ein Ereignis');
    }
    assert.deepEqual(upcomingEvent(seed, 0), { id: eventAt(seed, 0), inTurns: 2 });
    assert.deepEqual(upcomingEvent(seed, 1), { id: eventAt(seed, 0), inTurns: 1 });
    assert.deepEqual(upcomingEvent(seed, 2), { id: eventAt(seed, 1), inTurns: 4 });
  }
});

test('Ereignisse im Spiel: Zugzähler läuft bei Schuss und abgelaufener Zugzeit; ohne Chaos gibt es keine', () => {
  let m = createMatch({ settings: { chaos: true, goalsToWin: 5 }, formations: ['4-0', '4-0'], seed: 3 });
  assert.equal(currentEvent(m), null);
  assert.equal(nextEvent(m).inTurns, 2);
  assert.equal(shotMods(m, 0, null), null, 'ruhiger Zug ohne Karte: nichts Besonderes');
  m = playShot(m, 0, { piece: 1, sx: 0, sy: -0.1 }).match;
  m = passTurn(m);
  assert.equal(m.chaos.turns, 2);
  const ev = currentEvent(m);
  assert.ok(EVENT_IDS.includes(ev));
  const r = playShot(m, m.turn, { piece: m.turn * 5 + 1, sx: 0, sy: 0.1 });
  assert.equal(r.mods.event, ev);
  assert.equal(r.mods.salt, 2);
  assert.equal(currentEvent(createMatch({ settings: {} })), null);
  assert.equal(nextEvent(createMatch({ settings: {} })), null);
  const always = createMatch({ settings: { chaos: true }, seed: 3, rule: 'dauerchaos' });
  assert.ok(EVENT_IDS.includes(currentEvent(always)));
});

test('Ereignisse wirken in der Physik und hinterlassen einen sauberen Ruhezustand', () => {
  const base = kickoffState(['2-2', '2-2']);
  const shot = { piece: 3, sx: 0.5, sy: 0 };
  const sim = (event) => createSim(base, shot, { power: null, team: 0, event, salt: 5, rule: null });
  assert.ok(Math.abs(sim('vollgas').bodies[3].vx - sim(null).bodies[3].vx * EVENT_FX.VOLLGAS) < 1e-9);
  assert.equal(sim('murmel').bodies[10].r, BALL.R * EVENT_FX.MURMEL_RADIUS);
  assert.equal(sim('bleikugel').bodies[10].m, BALL.M * EVENT_FX.BLEI_MASS);
  for (let i = 0; i < 10; i++) assert.equal(sim('winzlinge').bodies[i].r, PIECE.R * EVENT_FX.WINZLING_RADIUS);
  assert.ok(sim('blitzeis').friction < sim(null).friction);
  // Erdbeben: alle bewegen sich, bei gleicher Zugnummer immer gleich, bei anderer anders
  const q1 = sim('erdbeben').bodies.map((b) => [b.vx, b.vy]);
  assert.deepEqual(sim('erdbeben').bodies.map((b) => [b.vx, b.vy]), q1);
  assert.ok(q1.filter(([vx, vy]) => vx !== 0 || vy !== 0).length >= 9);
  const other = createSim(base, shot, { power: null, team: 0, event: 'erdbeben', salt: 6, rule: null }).bodies.map((b) => [b.vx, b.vy]);
  assert.notDeepEqual(other, q1);

  let seed = 31;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const event of EVENT_IDS) {
    let state = kickoffState(['2-2', '1-3']);
    for (let k = 0; k < 20; k++) {
      const team = k % 2;
      const ang = rnd() * Math.PI * 2;
      const mods = { power: k % 3 === 0 ? 'zwerge' : null, team, event, salt: k, rule: null };
      const a = simulateShot(state, { piece: team * 5 + Math.floor(rnd() * 5), sx: Math.cos(ang), sy: Math.sin(ang) }, mods);
      if (a.goal !== null) {
        state = kickoffState(['2-2', '1-3']);
        continue;
      }
      state = a.state;
      const all = [...state.pieces.map((p) => ({ ...p, r: PIECE.R })), { ...state.ball, r: BALL.R }];
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++)
          assert.ok(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) >= all[i].r + all[j].r - 0.5, `${event}: nach dem Zug überlappt nichts`);
    }
  }
});

test('Sonderregeln: Vorsprung, schwere Scheiben, schnellere Schüsse — nur für Team 1', () => {
  const m = createMatch({ settings: { goalsToWin: 3 }, handicap: 1, rule: 'schwer' });
  assert.deepEqual(m.score, [0, 1]);
  assert.equal(m.handicap, 1);
  assert.equal(createMatch({ settings: { goalsToWin: 1 }, handicap: 2 }).score[1], 0, 'nie schon gewonnen');
  assert.equal(createMatch({ rule: 'erfunden' }).rule, null);
  const mods = shotMods(m, 0, null);
  assert.equal(mods.rule, 'schwer');
  const sim = createSim(m.state, { piece: 1, sx: 0.5, sy: 0 }, mods);
  for (let i = 0; i < 5; i++) assert.equal(sim.bodies[i].m, PIECE.M);
  for (let i = 5; i < 10; i++) assert.equal(sim.bodies[i].m, PIECE.M * RULE_FX.SCHWER);
  const base = kickoffState(['2-2', '2-2']);
  const fast = createSim(base, { piece: 6, sx: -0.5, sy: 0 }, { power: null, team: 1, event: null, salt: 0, rule: 'tempo' });
  const mine = createSim(base, { piece: 1, sx: 0.5, sy: 0 }, { power: null, team: 0, event: null, salt: 0, rule: 'tempo' });
  assert.ok(Math.abs(-fast.bodies[6].vx - mine.bodies[1].vx * RULE_FX.TEMPO) < 1e-9);
});
