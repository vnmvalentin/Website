// Tests der Höhlen-Räume (motive/hoehlenraeume.js) und ihrer Einbettung in typen/hoehlen.js.
//
// Die Lösbarkeit selbst wird NICHT hier bewiesen (das braucht den echten Solver — siehe das
// Fenster-Prüfwerkzeug im Scratch-Ordner, Zahlen in PLANUNG_WELTTYPEN.md). Diese Tests sichern die
// Struktur ab: Jeder Raum baut ohne Ausnahme, eine Grube lässt nie lange durchfallen (Höhlens
// Grundstoff ist Fels — anders als bei Parcours/Himmelsreich reicht eine offene Bodenzeile sonst bis
// zur nächsten zufällig tiefen Stelle des Levels, gemessen bis zu 125 Kacheln), Gefahren respektieren
// die Kernidee, und kein Schacht-/Raum-Hindernis landet zu nah am Start.

import test from 'node:test';
import assert from 'node:assert/strict';
import { RAEUME, SCHACHT_IDEEN, naechsterRaum, schachtEntities } from '../motive/hoehlenraeume.js';
import { createRng } from '../../../sim/rng.js';
import { reachForClass } from '../../../sim/reach.js';
import { SAFETY } from '../../generator.js';
import { generateWorld } from '../generate.js';
import { pruefeStart } from '../gemeinsam/plattform.js';

function limitsFuer(cls, d) {
  const reach = reachForClass(cls);
  const safety = SAFETY[d];
  return { maxGap: Math.floor(reach.gap.jump * safety), maxGapUp: Math.floor(reach.gap.double * safety), maxUp: Math.floor(reach.height.double * safety), maxDown: 30 };
}

test('Jeder Raum baut für jede Schwierigkeit und Tempo-Klasse, ohne Ausnahme', () => {
  const fails = [];
  for (const m of RAEUME) {
    for (let d = m.ab; d <= 5; d++) {
      for (const cls of ['normal', 'fast', 'super']) {
        const limits = limitsFuer(cls, d);
        for (let i = 0; i < 4; i++) {
          const ctx = { rng: createRng(`s-${m.id}-${d}-${cls}-${i}`, 'x'), limits, d, wandle: (spec) => spec, erlaubt: () => true };
          try { m.baue(ctx); } catch (e) { fails.push(`${m.id} d${d} ${cls} #${i}: ${e.message}`); }
        }
      }
    }
  }
  assert.deepEqual(fails, []);
});

// Der eigentliche Fund vom 24.09.2026: eine Grube "bis zum Rasterrand" (wie bei Parcours) ist in einer
// FELS-Welt kein kurzer Abgrund, sondern ein Sturz bis zur nächsten zufällig tief liegenden Bodenzeile
// eines völlig anderen Levelabschnitts. Jeder Raum mit Grube bekommt seitdem einen festen, mit Spitzen
// ausgelegten Boden PIT_TIEFE Zeilen unter dem Hauptboden.
test('Eine Grube lässt nie lange durchfallen (fester Boden innerhalb der Instanz, nicht am Rand)', () => {
  const limits = limitsFuer('normal', 3);
  for (const m of RAEUME) {
    for (let i = 0; i < 8; i++) {
      const inst = m.baue({ rng: createRng(`pit-${m.id}-${i}`, 'x'), limits, d: Math.max(m.ab, 3), wandle: (spec) => spec, erlaubt: () => true });
      for (let x = 0; x < inst.w; x++) {
        if (inst.rows[inst.entry][x] !== '.') continue;      // keine Grube in dieser Spalte
        assert.equal(inst.rows[inst.h - 1][x], '#', `${m.id}: Spalte ${x} hat auch in der letzten Zeile keinen Boden`);
      }
    }
  }
});

test('Optionale Gefahren respektieren erlaubt() — verboten heißt wirklich keine', () => {
  const limits = limitsFuer('normal', 5);
  for (const m of RAEUME) {
    if (m.gefahren(5).length === 0) continue;
    let sahGefahr = false;
    for (let i = 0; i < 10; i++) {
      const inst = m.baue({ rng: createRng(`verbot-${m.id}-${i}`, 'x'), limits, d: 5, wandle: (spec) => spec, erlaubt: () => false });
      if (inst.entities.some((e) => ['spike', 'saw', 'laser', 'fallingBlock'].includes(e.type))) sahGefahr = true;
    }
    assert.equal(sahGefahr, false, `${m.id}: Gefahr trotz erlaubt() === false`);
  }
});

test('naechsterRaum(): nie zweimal dieselbe Art hintereinander', () => {
  const limits = limitsFuer('normal', 3);
  const ctx = { rng: createRng('folge', 'x'), limits, d: 3, wandle: (spec) => spec, erlaubt: () => true };
  let letzter = null;
  for (let i = 0; i < 12; i++) {
    const r = naechsterRaum(ctx, letzter);
    assert.ok(r, `Durchlauf ${i}: kein Raum gefunden`);
    assert.notEqual(r.tpl.id, letzter);
    letzter = r.tpl.id;
  }
});

test('naechsterRaum(): erlaubt keine Gefahrenart aus, liefert entweder null oder nur gefahrenfreie Räume', () => {
  const limits = limitsFuer('normal', 5);
  const ctx = { rng: createRng('ohne-gefahr', 'x'), limits, d: 5, wandle: (spec) => spec, erlaubt: () => false };
  for (let i = 0; i < 12; i++) {
    const r = naechsterRaum(ctx, null);
    if (r) assert.deepEqual(r.entities.filter((e) => ['spike', 'saw', 'laser', 'fallingBlock'].includes(e.type)), []);
  }
});

test('Schacht-Ideen: Gefahren sitzen zwischen den Vorsprüngen, nie auf einem selbst', () => {
  const ledges = [{ x: 10, y: 60, w: 2 }, { x: 13, y: 57, w: 2 }, { x: 10, y: 54, w: 2 }, { x: 13, y: 51, w: 2 }, { x: 10, y: 48, w: 2 }];
  const shape = { shaftLeft: 10, shaftW: 5, top: 45, bottom: 63, ledges };
  for (let i = 0; i < 20; i++) {
    const ctx = { rng: createRng(`sd-${i}`, 'x'), d: 5, wandle: (spec) => spec, erlaubt: () => true };
    const es = schachtEntities(ctx, shape);
    for (const e of es) {
      for (const l of ledges) {
        const aufDerSprosse = e.tx >= l.x && e.tx < l.x + l.w && e.ty === l.y;
        assert.equal(aufDerSprosse, false, `Gefahr auf einer Sprosse: ${JSON.stringify(e)} / ${JSON.stringify(l)}`);
      }
    }
  }
});

test('Weniger als zwei Vorsprünge: keine Schacht-Idee versucht trotzdem, Gefahren zu setzen', () => {
  const shape = { shaftLeft: 5, shaftW: 5, top: 10, bottom: 20, ledges: [{ x: 5, y: 15, w: 2 }] };
  const ctx = { rng: createRng('kurz', 'x'), d: 5, wandle: (spec) => spec, erlaubt: () => true };
  assert.deepEqual(schachtEntities(ctx, shape), []);
});

test('SCHACHT_IDEEN enthält die erwarteten Arten (leiter bleibt möglich, keine Zwangsgefahr)', () => {
  assert.ok(SCHACHT_IDEEN.some((s) => s.id === 'leiter' && s.gefahren(5).length === 0));
});

// Regressionsschutz für den zweiten Fund vom 24.09.2026: Der allererste Schacht (direkt hinter der
// Startzone) bekam anfangs OHNE Ausnahme eine Idee — ein Laser-/Sägentor dort konnte näher als
// GEFAHRENFREI am Start landen. Volle generateWorld()-Läufe, nicht nur die Raum-/Schacht-Bausteine
// isoliert, weil genau das Zusammenspiel mit der gemeinsamen Startplattform den Fehler zeigte.
test('Höhlen: kein Element (auch nicht aus einem Schacht direkt hinter dem Start) steht zu nah am Start', () => {
  const fails = [];
  for (let i = 0; i < 24; i++) {
    for (const laenge of ['short', 'medium']) {
      const lv = generateWorld({ seed: `sicher-${i}`, length: laenge, difficulty: 3, worldType: 'hoehlen', kernidee: null });
      const fehler = pruefeStart(lv.rows, lv.entities, lv.meta.start);
      if (fehler.length) fails.push(`${laenge}/sicher-${i}: ${fehler.join('; ')}`);
    }
  }
  assert.deepEqual(fails, []);
});
