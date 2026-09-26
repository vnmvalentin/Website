// Tests der Turm-Stockwerke (motive/stockwerke.js) und ihrer Einbettung in typen/turm.js.
//
// Die Lösbarkeit selbst wird NICHT hier bewiesen (das braucht den echten Solver, siehe
// gen/__tests__/solver.test.js „Solver löst ganze Türme" und das Fenster-Prüfwerkzeug im
// Scratch-Ordner — PLANUNG_WELTTYPEN.md hält die gemessenen Zahlen fest). Diese Tests sichern die
// Struktur ab, die der Solver-Beweis voraussetzt: Jedes Stockwerk baut ohne Ausnahme, seine Luke ist
// wirklich offen, Gefahren respektieren die Kernidee, und der Turm als Ganzes meldet die Fähigkeit,
// auf der all das beruht.

import test from 'node:test';
import assert from 'node:assert/strict';
import { STOCKWERKE, neuerRaum, stempleStockwerk, luecke, LUKE_BREITE, DECKE } from '../motive/stockwerke.js';
import { createRng } from '../../../sim/rng.js';
import { reachForClass } from '../../../sim/reach.js';
import { SAFETY } from '../../generator.js';
import { generateWorld } from '../generate.js';
import { checkLevel } from '../reichweite/graph.js';

function limitsFuer(cls, d) {
  const reach = reachForClass(cls);
  const safety = SAFETY[d];
  return { maxGap: Math.floor(reach.gap.jump * safety), maxGapUp: Math.floor(reach.gap.double * safety), maxUp: Math.floor(reach.height.double * safety), maxDown: 30 };
}

test('luecke(): mehr Höhengewinn lässt weniger waagerechten Spielraum, nie negativ', () => {
  const limits = { maxGap: 5, maxGapUp: 8, maxUp: 5, maxDown: 30 };
  assert.equal(luecke(limits, 0), limits.maxGap - 1);
  assert.ok(luecke(limits, 5) < luecke(limits, 2));
  assert.ok(luecke(limits, 5) >= 0);
});

// Jedes Stockwerk baut über eine Spanne aus Breiten/Höhen/Einstiegen/Seitenvorgaben, ohne die Ausnahme aus
// `mitSeite()` (keine passende Luke gefunden) auszulösen — das war der Fehler, der den allerersten Turm-Bau
// zum Absturz brachte (die Kantenbedingung für das oberste Stockwerk war zu streng).
test('Jedes Stockwerk baut für jede Schwierigkeit, Breite, Höhe und Seitenvorgabe', () => {
  const fails = [];
  for (const m of STOCKWERKE) {
    for (let d = m.ab; d <= 5; d++) {
      const limits = limitsFuer('normal', d);
      for (const W of [20, 22, 24]) {
        for (const H of [m.hoehe[0], m.hoehe[1]]) {
          for (const seite of ['frei', 'links', 'rechts']) {
            if (seite !== 'frei' && m.seiteFaehig === false) continue;
            const einX = 3 + Math.floor(W / 2);
            const r = neuerRaum(W, H);
            try {
              m.baue({ r, rng: createRng(`s-${m.id}-${d}-${W}-${H}-${seite}`, 'x'), limits, d, einX, seite, erste: false, wandle: (spec) => spec, erlaubt: () => true });
            } catch (e) {
              fails.push(`${m.id} d${d} W${W} H${H} ${seite}: ${e.message}`);
            }
          }
        }
      }
    }
  }
  assert.deepEqual(fails, []);
});

// Die Luke ist eine ECHTE Öffnung: `stempleStockwerk()` (dieselbe Funktion, die turm.js benutzt) muss sie in
// beiden Deckenzeilen freilassen — `r.rows` selbst trägt die Decke nur als durchgehenden Fels, geöffnet wird
// erst beim Einsetzen ins Weltraster (genau wie beim ECHTEN Turm, wo die Luke die des NÄCHSTEN Stockwerks ist).
test('Die eingesetzte Luke ist über ihre volle Breite und Dicke offen', () => {
  const WAND = 2;
  for (const m of STOCKWERKE) {
    const limits = limitsFuer('normal', Math.max(m.ab, 3));
    const r = neuerRaum(22, m.hoehe[1]);
    m.baue({ r, rng: createRng(`luke-${m.id}`, 'x'), limits, d: Math.max(m.ab, 3), einX: 8, seite: 'frei', erste: false, wandle: (spec) => spec, erlaubt: () => true });
    const grid = Array.from({ length: r.H + DECKE }, () => Array(r.W + 2 * WAND).fill('#'));
    stempleStockwerk(grid, [], r, 0, WAND, (g, x, y, ch) => { g[y][x] = ch; });
    for (let ly = 0; ly < DECKE; ly++) for (let i = 0; i < LUKE_BREITE; i++) assert.equal(grid[ly][WAND + r.luke + i], '.', `${m.id}: Luke bei ${r.luke}+${i}, Zeile ${ly}`);
  }
});

// `erlaubt()` kommt aus der Kernidee (turm.js reicht sie durch) — ein Stockwerk, dem eine Gefahrenart
// verboten wird, darf sie nicht setzen. Ohne diesen Test hätte ein Stockwerk, das `ctx.erlaubt` ignoriert,
// eine Kernidee wie „Ein Element, alle Rollen" unterlaufen können, ohne dass es auffällt.
test('Optionale Gefahren respektieren erlaubt() — verboten heißt wirklich keine', () => {
  for (const m of STOCKWERKE) {
    if (m.gefahren(5).length === 0) continue;
    const limits = limitsFuer('normal', 5);
    let sahGefahr = false;
    for (let i = 0; i < 12; i++) {
      const r = neuerRaum(22, m.hoehe[1]);
      m.baue({ r, rng: createRng(`verbot-${m.id}-${i}`, 'x'), limits, d: 5, einX: 8, seite: 'frei', erste: false, wandle: (spec) => spec, erlaubt: () => false });
      if (r.entities.some((e) => ['spike', 'saw', 'laser'].includes(e.type))) sahGefahr = true;
    }
    assert.equal(sahGefahr, false, `${m.id}: Gefahr trotz erlaubt() === false`);
  }
});

test('Turm meldet die Fähigkeit "stockwerk" und jedes Level trägt Stockwerk-Brücken in meta', () => {
  const lv = generateWorld({ seed: 'sw-meta', length: 'short', difficulty: 3, worldType: 'turm', kernidee: null });
  assert.ok(lv.meta.faehigkeiten.includes('stockwerk'));
  assert.ok(lv.meta.stockwerke.length > 0);
  for (const s of lv.meta.stockwerke) {
    assert.ok(s.von.length > 0 && s.nach.length > 0);
    assert.ok(s.kosten > 0);
  }
});

// Regressionsschutz für den eigentlichen Fund vom 24.09.2026 (siehe PLANUNG_WELTTYPEN.md): Ohne die
// Fähigkeit „stockwerk" wäre jede Zone bis auf die Bodenplatte für den Graph tot — checkLevel muss das
// klar als Fehlschlag melden, sonst fiele ein kaputter Turm nicht mehr auf.
test('Ohne die Fähigkeit "stockwerk" gilt der Turm dem Graph als gerissen', () => {
  const lv = generateWorld({ seed: 'sw-meta', length: 'short', difficulty: 3, worldType: 'turm', kernidee: null });
  const ohne = { ...lv, meta: { ...lv.meta, faehigkeiten: ['boden'] } };
  const res = checkLevel(ohne, lv.meta.limits);
  assert.equal(res.ok, false);
  assert.ok(res.deadZones.length + res.brokenZones.length > 0);
});
