// Tests der Weltengenerierung v2.
//   Phase 1: Makro-Layout + Terrain + Bewegungsgraph
//   Phase 2: Verzweigungen, kostenbewusster Graph, lokale Reparatur
//
// Die wichtigste Zusage ist nicht "es sieht hübsch aus", sondern: Jede erzeugte Welt hängt zusammen
// — vom Start kommt man bis ins Ziel, und keine Zone ist abgeschnitten. Das wird über viele Seeds,
// Längen, Tempo-Klassen UND Schwierigkeitsgrade geprüft; die Beschränkung auf die Voreinstellung
// hatte in Phase 1 einen Fehler in 78 von 270 Welten verdeckt.
//
// Seit dem Welttyp-Umbau (gen/PLANUNG_WELTTYPEN.md) testet diese Datei GEZIELT die v2-Maschinerie
// (Layout, Terrain, Schächte, Abkürzungen) — nicht "was auch immer die Registry gerade würfelt".
// Jeder generateWorld()-Aufruf hier MUSS deshalb `worldType: 'hoehlen'` setzen: `.layout.profile`,
// `.layout.shortcuts` und die Schacht-Vorsprünge existieren nur bei diesem Welttyp. Ohne die
// Angabe hätte ein anderer Welttyp (Himmelsreich: Mover/Grapple statt Fels) diese Tests zufällig
// treffen können, und ein Test, der nur "hoehlen" kennt, hätte ihn fälschlich für kaputt gehalten.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, heightCurve, ZONE_COUNT, ROUTE_TOP, ROUTE_BOTTOM, WORLD_H } from '../layout.js';
import { buildTerrain, createGrid, floorLine, wave } from '../terrain.js';
import { floodReachable, isStanding } from '../reachability.js';
// Fähigkeitsbewusst (nicht direkt aus reachability.js): Höhlen meldet seit den Bausteinen die Fähigkeit
// 'baustein' an — die rohe Prüfung kennt deren Brücke nicht und hielte jede Welt mit eingesetztem Chunk
// für zerrissen. Dieselbe Umstellung wie bei welt.test.js (Mover, Grapple).
import { checkLevel, baueZusatz } from '../../world/reichweite/graph.js';
import { repairWorld } from '../repair.js';
import { generateWorld, WORLD_VERSION } from '../../world/generate.js';
import { createRng } from '../../../sim/rng.js';
import { createLevelWorld } from '../../../sim/levelWorld.js';
import { LIMITS } from '../../../level/limits.js';

// ── Stufe 1: Makro-Layout ───────────────────────────────────────────────────

test('Layout: gleicher Seed ergibt dasselbe Layout, ein anderer ein anderes', () => {
  const a = buildLayout({ seed: 'gleich', length: 'short' });
  const b = buildLayout({ seed: 'gleich', length: 'short' });
  const c = buildLayout({ seed: 'anders', length: 'short' });
  assert.deepEqual(a.zones, b.zones);
  assert.notDeepEqual(a.zones.map((z) => z.kind), c.zones.map((z) => z.kind));
});

test('Layout: Zonen liegen lückenlos hintereinander und die Höhen passen an den Nähten', () => {
  const { zones, width, profile } = buildLayout({ seed: 'naht', length: 'medium' });
  let x = 0;
  for (const z of zones) {
    assert.equal(z.x0, x, `${z.id} beginnt nicht, wo die vorige endet`);
    x += z.w;
  }
  assert.equal(x, width);
  for (let i = 1; i < zones.length; i++) {
    assert.equal(zones[i].entryRow, zones[i - 1].exitRow, `Naht ${zones[i - 1].id}→${zones[i].id}`);
  }
  assert.equal(profile.length, width);
  for (const row of profile) {
    assert.ok(row > ROUTE_TOP && row < ROUTE_BOTTOM, `Profilhöhe ${row} verlässt das Band`);
  }
});

test('Höhenkurve: holt wirklich aus, statt im Band zu bleiben', () => {
  const stops = heightCurve(createRng('kurve', 'x'), 5);
  assert.equal(stops.length, 5);
  const span = Math.max(...stops) - Math.min(...stops);
  assert.ok(span >= 22, `Spanne nur ${span} Zeilen`);
  for (const s of stops) assert.ok(s > ROUTE_TOP && s < ROUTE_BOTTOM);
});

test('Layout: Abkürzungen überspringen genau eine Zone und nie zwei nebeneinander', () => {
  for (let i = 0; i < 20; i++) {
    const { zones, edges } = buildLayout({ seed: `ab${i}`, length: 'long' });
    const shortcuts = edges.filter((e) => e.type === 'abkuerzung');
    for (const e of shortcuts) {
      const over = zones.findIndex((z) => z.id === e.over);
      assert.ok(over > 0 && over < zones.length - 1, 'nie über Start oder Ziel');
      assert.equal(zones[over - 1].id, e.from);
      assert.equal(zones[over + 1].id, e.to);
      assert.equal(zones[over].climb, false, 'Kletterzonen bekommen keine Abkürzung');
    }
    const marked = zones.map((z, idx) => (z.shortcut ? idx : -1)).filter((idx) => idx >= 0);
    for (let k = 1; k < marked.length; k++) {
      assert.ok(marked[k] - marked[k - 1] > 1, 'zwei Abkürzungen direkt nebeneinander');
    }
  }
});

// ── Stufe 2: Terrain ────────────────────────────────────────────────────────

test('Terrain: Welle ist stetig und bleibt in ihren Grenzen', () => {
  const w = wave(createRng('welle', 'a'), 40, 3);
  assert.equal(w.length, 40);
  for (const v of w) assert.ok(Math.abs(v) <= 3.01, `Ausschlag ${v}`);
  for (let i = 1; i < w.length; i++) assert.ok(Math.abs(w[i] - w[i - 1]) < 1.5, 'Sprung in der Welle');
});

test('Terrain: die Bodenlinie einer Zone trifft an den Rändern exakt das Profil', () => {
  const layout = buildLayout({ seed: 'boden', length: 'short' });
  const zone = layout.zones.find((z) => !z.climb && z.kind !== 'inseln');
  const line = floorLine(zone, layout.profile, createRng('boden', 'z'));
  assert.equal(line[0], layout.profile[zone.x0]);
  assert.equal(line[line.length - 1], layout.profile[zone.x0 + zone.w - 1]);
});

const LIMITS_3 = { maxGap: 4, maxGapUp: 8, maxUp: 5, maxDown: 30 };

test('Terrain: Schächte bekommen Vorsprünge, deren Abstand die Sprunghöhe nicht übersteigt', () => {
  const layout = buildLayout({ seed: 'schacht', length: 'long' });
  const { shapes } = buildTerrain(layout, { seed: 'schacht' }, LIMITS_3);
  const shafts = shapes.filter((s) => s.ledges);
  assert.ok(shafts.length > 0, 'kein einziger Schacht im langen Level');
  for (const s of shafts) {
    const ys = s.ledges.map((l) => l.y).sort((a, b) => a - b);
    const marks = [s.top, ...ys, s.bottom];
    for (let i = 1; i < marks.length; i++) {
      assert.ok(marks[i] - marks[i - 1] <= LIMITS_3.maxUp, `Stufe von ${marks[i - 1]} nach ${marks[i]} ist zu hoch`);
    }
  }
});

test('Terrain: zwei Vorsprünge teilen sich nie eine Spalte, wenn sie eng übereinander liegen', () => {
  // Der Fehler, der Phase 1 durchgerutscht ist: Überlappen sich zwei Vorsprünge in einer Spalte und
  // liegen sie weniger als HEAD_ROOM + 1 Zeilen auseinander, nimmt der obere dem unteren die
  // Kopffreiheit. Dort kann man dann nicht mehr stehen — der Aufstieg reißt ab, lautlos.
  // Sichtbar wurde das erst bei Schwierigkeit 1–2; deshalb prüft der Test alle Grenzen, nicht eine.
  for (const limits of [{ maxGap: 3, maxGapUp: 6, maxUp: 4, maxDown: 30 }, LIMITS_3, { maxGap: 6, maxGapUp: 10, maxUp: 6, maxDown: 30 }]) {
    for (let i = 0; i < 8; i++) {
      const layout = buildLayout({ seed: `ueberlapp${i}`, length: 'long' });
      const { shapes } = buildTerrain(layout, { seed: `ueberlapp${i}` }, limits);
      for (const s of shapes.filter((q) => q.ledges)) {
        for (const a of s.ledges) {
          for (const b of s.ledges) {
            if (a === b || Math.abs(a.y - b.y) > 3) continue;
            const ueberlappt = a.x < b.x + b.w && b.x < a.x + a.w;
            assert.equal(ueberlappt, false, `Vorsprünge bei y=${a.y} und y=${b.y} teilen sich eine Spalte`);
          }
        }
      }
    }
  }
});

test('Terrain: eine gemeldete Abkürzung ist auch wirklich gebaut', () => {
  // In Phase 1 stand die Abkürzung nur im Layout und wurde in der Werkbank gezählt — Kacheln gab es
  // keine. Die Kennzahl war damit schlicht falsch. Gemeldet wird jetzt nur noch, was Steine hat.
  for (let i = 0; i < 12; i++) {
    const lv = generateWorld({ seed: `abk${i}`, length: 'long', worldType: 'hoehlen' });
    for (const s of lv.layout.shortcuts) {
      assert.ok(s.platforms.length > 0, `${s.zone} ohne Trittsteine`);
      for (const p of s.platforms) {
        assert.equal(lv.rows[p.y][p.x], '#', `Trittstein von ${s.zone} bei (${p.x}|${p.y}) ist Luft`);
      }
    }
  }
});

test('Terrain: ein frisches Raster ist massiver Fels', () => {
  const grid = createGrid(5, 4);
  assert.equal(grid.length, 4);
  assert.ok(grid.every((row) => row.every((c) => c === '#')));
});

// ── Bewegungsgraph ──────────────────────────────────────────────────────────

test('Bewegungsgraph: Standfläche braucht Boden unter sich und Luft über sich', () => {
  const rows = ['....', '....', '....', '##.#'];
  assert.equal(isStanding(rows, 0, 2), true);
  assert.equal(isStanding(rows, 2, 2), false, 'kein Boden darunter');
  assert.equal(isStanding(rows, 3, 2), true);
});

test('Bewegungsgraph: eine zu breite Lücke trennt, eine schmale nicht', () => {
  const limits = { maxGap: 4, maxGapUp: 8, maxUp: 5, maxDown: 20 };
  const floorWithGap = (gap) => {
    const w = 20;
    const rows = [];
    for (let y = 0; y < 6; y++) {
      let line = '';
      for (let x = 0; x < w; x++) {
        const inGap = x >= 8 && x < 8 + gap;
        line += y === 5 && !inGap ? '#' : '.';
      }
      rows.push(line);
    }
    return rows;
  };
  const near = floodReachable(floorWithGap(3), { x: 1, y: 4 }, limits);
  assert.ok(near.reached(15, 4), 'drei Kacheln Lücke sind zu schaffen');
  const far = floodReachable(floorWithGap(9), { x: 1, y: 4 }, limits);
  assert.equal(far.reached(15, 4), false, 'neun Kacheln dürfen nicht gehen');
});

test('Bewegungsgraph: eine eine Kachel dicke Decke ist auch diagonal nicht zu durchspringen', () => {
  // Boden, darüber (5 Zeilen = genau maxUp) eine durchgehende Platte. Früher meldete der Graph den Sprung
  // von unter der Platte auf sie hinauf als frei, weil bei einer Verschiebung um eine Spalte keine Spalte
  // "dazwischen" liegt, die er hätte prüfen können.
  const limits = { maxGap: 4, maxGapUp: 8, maxUp: 5, maxDown: 20 };
  const welt = (loch) => {
    const rows = [];
    for (let y = 0; y < 14; y++) {
      let line = '';
      for (let x = 0; x < 20; x++) {
        if (y === 13) line += '#';
        else if (y === 8) line += loch && x >= 17 && x < 19 ? '.' : '#';
        else line += '.';
      }
      rows.push(line);
    }
    return rows;
  };
  const zu = floodReachable(welt(false), { x: 2, y: 12 }, limits);
  assert.ok(zu.reached(10, 12), 'unter der Platte ist alles begehbar');
  for (const x of [1, 2, 3, 10, 16, 17, 18]) assert.equal(zu.reached(x, 7), false, `Spalte ${x}: von unten nicht auf die Platte`);

  const offen = floodReachable(welt(true), { x: 2, y: 12 }, limits);
  assert.ok(offen.reached(16, 7) || offen.reached(19, 7), 'durchs Loch kommt man hinauf');
});

// ── Ganze Welt ──────────────────────────────────────────────────────────────

test('Welt: gleicher Seed, gleiche Welt — und die Fassung steht drin', () => {
  const a = generateWorld({ seed: 'wiederholbar', length: 'short', worldType: 'hoehlen' });
  const b = generateWorld({ seed: 'wiederholbar', length: 'short', worldType: 'hoehlen' });
  assert.equal(a.hash, b.hash);
  assert.deepEqual(a.rows, b.rows);
  assert.equal(a.version, WORLD_VERSION);
});

test('Welt: Start, Ziel und Checkpoints stehen auf begehbarem Boden', () => {
  const lv = generateWorld({ seed: 'marken', length: 'medium', worldType: 'hoehlen' });
  assert.ok(lv.meta.start, 'kein Startpunkt');
  assert.ok(lv.meta.finish.length > 0, 'kein Ziel');
  assert.ok(lv.meta.checkpoints.length > 0, 'keine Checkpoints');
  for (const p of [lv.meta.start, ...lv.meta.finish, ...lv.meta.checkpoints]) {
    assert.equal(lv.rows[p.y + 1][p.x], '#', `bei (${p.x}|${p.y}) fehlt der Boden`);
  }
});

test('Welt: bleibt in den Grenzen für eigene Level (damit sie im Editor aufgeht)', () => {
  for (const length of ['short', 'medium', 'long']) {
    const lv = generateWorld({ seed: `grenzen-${length}`, length, worldType: 'hoehlen' });
    assert.ok(lv.width >= LIMITS.minWidth && lv.width <= LIMITS.maxWidth, `Breite ${lv.width}`);
    assert.ok(lv.height >= LIMITS.minHeight && lv.height <= LIMITS.maxHeight, `Höhe ${lv.height}`);
    assert.ok(lv.entities.length <= LIMITS.maxElements);
    assert.equal(lv.height, WORLD_H);
  }
});

test('Welt: die Sim kann sie bauen und findet Start, Checkpoints und Ziel', () => {
  const lv = generateWorld({ seed: 'simbau', length: 'short', worldType: 'hoehlen' });
  const world = createLevelWorld(lv);
  assert.ok(world.player, 'kein Spieler');
  assert.equal(world.map.checkpoints.length, lv.meta.checkpoints.length);
  assert.ok(world.map.finish.length > 0);
});

test('Welt: jede erzeugte Welt hängt zusammen — Start erreicht Ziel, keine tote Zone', () => {
  const fails = [];
  for (const length of ['short', 'medium', 'long']) {
    for (const speedClass of ['normal', 'fast', 'super']) {
      for (let i = 0; i < 8; i++) {
        const lv = generateWorld({ seed: `zusammenhang-${length}-${speedClass}-${i}`, length, speedClass, biome: 'random', worldType: 'hoehlen' });
        const res = checkLevel(lv, lv.meta.limits);
        if (!res.ok) fails.push(`${length}/${speedClass}/${i}: Ziel=${res.reachedFinish} tot=[${res.deadZones}]`);
      }
    }
  }
  assert.deepEqual(fails, [], `${fails.length} von 72 Welten hängen nicht zusammen`);
});

test('Welt: hängt bei JEDER Schwierigkeit zusammen, nicht nur bei der Voreinstellung', () => {
  // Phase 1 hat nur mit Schwierigkeit 3 geprüft. Bei 1 und 2 sind die Grenzen enger (maxUp 4 statt
  // 5), und dort rissen 78 von 270 Welten — unbemerkt. Ein Test, der nur die Voreinstellung kennt,
  // beweist nur etwas über die Voreinstellung.
  const fails = [];
  for (const difficulty of [1, 2, 3, 4, 5]) {
    for (const length of ['short', 'medium', 'long']) {
      for (let i = 0; i < 3; i++) {
        const lv = generateWorld({ seed: `stufen-${i}`, length, difficulty, worldType: 'hoehlen' });
        const res = checkLevel(lv, lv.meta.limits);
        if (!res.ok) fails.push(`S${difficulty}/${length}/${i}: Ziel=${res.reachedFinish} tot=[${res.deadZones}] gerissen=[${res.brokenZones}]`);
      }
    }
  }
  assert.deepEqual(fails, [], `${fails.length} von 45 Welten hängen nicht zusammen`);
});

// Abkürzungen sind seit 25.09.2026 abgeschaltet (sie übersprangen ganze Passagen, ohne selbst eine Aufgabe zu sein).
test('Welt: es werden keine Abkürzungen mehr gebaut', () => {
  for (const length of ['medium', 'long']) {
    for (let i = 0; i < 10; i++) {
      const lv = generateWorld({ seed: `abkpruef-${i}`, length, worldType: 'hoehlen' });
      assert.equal(lv.layout.shortcuts.length, 0, `${length}/${i}`);
      assert.deepEqual(checkLevel(lv, lv.meta.limits).badShortcuts, []);
    }
  }
});

test('Reparatur: eine aufgerissene Welt wird wieder durchlaufbar', () => {
  // Das Netz greift heute nirgends, weil die Welt von vornherein zusammenhängt. Ein Sicherheitsnetz,
  // das nie ausgelöst hat, ist aber kein geprüftes — also wird hier absichtlich Boden weggenommen.
  let geprueft = 0;
  for (const breite of [8, 16, 24]) {
    for (let i = 0, je = 0; i < 60 && je < 4; i++) {
      const lv = generateWorld({ seed: `kaputt-${i}`, length: 'long', worldType: 'hoehlen' });
      const grid = lv.rows.map((r) => r.split(''));
      // Ein Stück OHNE Baustein: Wer den Rasen eines Chunks wegnimmt, prüft die Reparatur nicht, sondern zerstört ein vom
      // Solver bewiesenes Stück, das sie ohnehin nicht flicken soll. Gesucht wird zonenunabhängig: Breite Laufzonen ohne
      // Baustein sind in Höhlen selten geworden, und ein Test über „die erste solche Zone" prüfte zeitweise gar nichts.
      // Abstand zum Ziel: ein Schnitt bis ins Ziel hinein kann niemand flicken.
      const belegt = (x) => lv.meta.bausteine.some((q) => x >= q.x0 - 2 && x < q.x0 + q.w + 2);
      const ende = lv.meta.finish[0].x - 30;
      let x0 = -1;
      for (let x = lv.meta.start.x + 24; x + breite < ende && x0 < 0; x++) {
        let frei = true;
        for (let k = 0; k < breite && frei; k++) if (belegt(x + k)) frei = false;
        if (frei) x0 = x;
      }
      if (x0 < 0) continue;
      je++;
      geprueft++;
      for (let x = x0; x < x0 + breite; x++) {
        for (let y = 0; y < grid.length; y++) grid[y][x] = '.';
      }
      // Dieselben Fähigkeiten wie generate.js sie der Reparatur mitgibt (Höhlen: 'baustein') — sonst hielte
      // sie jeden eingesetzten Chunk für eine Lücke und flickte darin herum.
      const zusatz = baueZusatz(lv);
      const vorher = floodReachable(grid.map((r) => r.join('')), lv.meta.start, lv.meta.limits, zusatz);
      const { reachedEnd } = repairWorld(grid, lv.meta.start, lv.meta.limits, { zusatz });
      const nachher = floodReachable(grid.map((r) => r.join('')), lv.meta.start, lv.meta.limits, zusatz);
      assert.equal(reachedEnd, true, `Breite ${breite}, Seed ${i}: nicht geflickt`);
      assert.ok(nachher.count > vorher.count, 'die Reparatur hat nichts hinzugefügt');
    }
  }
  // Ein Test, der mangels passender Zone jeden Fall überspringt, prüft nichts (so geschehen nach dem Abschalten der Abkürzungen)
  assert.ok(geprueft >= 9, `nur ${geprueft} Fälle geprüft`);
});

test('Welt: die Route nutzt die Höhe wirklich aus (nicht nur ein schmales Band)', () => {
  let sum = 0;
  const n = 12;
  for (let i = 0; i < n; i++) {
    const p = generateWorld({ seed: `hoehe${i}`, length: 'medium', worldType: 'hoehlen' }).layout.profile;
    sum += Math.max(...p) - Math.min(...p);
  }
  const avg = sum / n;
  // Der alte Generator blieb in einem Band von 28 Zeilen (BASE_ROW ± MAX_DRIFT) — das ist die Latte.
  assert.ok(avg > 40, `Höhenspanne im Schnitt nur ${avg.toFixed(0)} Zeilen`);
});
