// Trickschüsse und Tour-Daten:  npm run test:flick
import test from 'node:test';
import assert from 'node:assert/strict';
import { PIECE, BALL, FIELDS, MATCH_RULES, isField, isFormation, isPowerup, isSkin, simulateShot } from '../engine/index.js';
import { TRICKS, TRICK_COUNT } from '../trickData.js';
import { TOUR_STAGES, starsFor, tourConfig } from '../tour.js';

test('Trickschüsse: jede Aufgabe ist sauber aufgestellt und ihre gespeicherte Lösung trifft', () => {
  assert.equal(TRICK_COUNT, 24);
  assert.equal(new Set(TRICKS.map((t) => t.id)).size, TRICK_COUNT, 'IDs eindeutig');
  for (const t of TRICKS) {
    assert.ok(isField(t.field), `${t.id}: Feld`);
    assert.ok(t.power === null || isPowerup(t.power), `${t.id}: Karte`);
    assert.ok(t.tier >= 1 && t.tier <= 4);
    const f = FIELDS[t.field];
    const own = t.pieces.filter((p) => p.team === 0).length;
    assert.ok(own >= 1 && t.pieces.slice(0, own).every((p) => p.team === 0), `${t.id}: eigene Scheiben stehen vorne in der Liste`);
    const all = [...t.pieces.map((p) => ({ ...p, r: PIECE.R })), { ...t.ball, r: BALL.R }];
    for (let i = 0; i < all.length; i++) {
      assert.ok(all[i].x > all[i].r && all[i].x < f.W - all[i].r && all[i].y > all[i].r && all[i].y < f.H - all[i].r, `${t.id}: im Feld`);
      for (let j = i + 1; j < all.length; j++) {
        assert.ok(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) > all[i].r + all[j].r, `${t.id}: nichts überlappt`);
      }
    }
    const state = { field: t.field, pieces: t.pieces, ball: t.ball };
    const mods = t.power ? { power: t.power, team: 0 } : null;
    assert.equal(t.pieces[t.solution.piece].team, 0, `${t.id}: Lösung mit eigener Scheibe`);
    assert.equal(simulateShot(state, t.solution, mods).goal, 0, `${t.id}: Lösung trifft`);
  }
});

test('Tour: Gegner benutzen nur, was es gibt; Sonderregeln der Endgegner sind gültig', () => {
  assert.equal(TOUR_STAGES.length, 20);
  for (const s of TOUR_STAGES) {
    assert.ok(isField(s.field) && isFormation(s.formation) && isSkin(s.skin), s.id);
    assert.ok(s.goals >= 2, `${s.id}: mit einem Tor gäbe es immer drei Sterne`);
    if (s.rule) assert.ok(MATCH_RULES.includes(s.rule), `${s.id}: Regel`);
    if (s.rule === 'dauerchaos') assert.ok(s.chaos, `${s.id}: Dauerchaos braucht den Chaos-Modus`);
    if (s.handicap) assert.ok(s.handicap < s.goals);
    assert.equal(!!s.special, !!(s.rule || s.handicap || s.turn), `${s.id}: Sonderregel hat eine Erklärung`);
    const c = tourConfig(s, '2-2');
    assert.equal(c.tour, s.id);
    assert.equal(c.settings.field, s.field);
  }
  assert.equal(TOUR_STAGES.filter((s) => s.special).length, 4);
  assert.deepEqual([starsFor(false, 0), starsFor(true, 0), starsFor(true, 1), starsFor(true, 3)], [0, 3, 2, 1]);
});
