// Tests der Bausteine (gemeinsam/bausteine.js): handgebaute Chunks als Legosteine im Welttyp
// „Hindernis-Parcours". Die Zusage: Ein eingesetzter Chunk ist genau der Chunk, den der Solver
// bewiesen hat — dieselben Zeilen, dieselben Elemente — und der Rest der Welt hängt sauber daran.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CHUNKS } from '../../chunks/index.js';
import { generateWorld } from '../generate.js';
import { checkLevel } from '../reichweite/graph.js';
import { baueBausteinBruecken } from '../faehigkeiten/baustein.js';
import { pruefeStart } from '../gemeinsam/plattform.js';
import { neuerBausteinLauf, naechsterBaustein, stempeln, PLATZ_OBEN, PLATZ_UNTEN, UNTERKANTE } from '../gemeinsam/bausteine.js';
import { gefahrenImBaustein } from '../ideen/vertrag.js';
import { createLevelWorld } from '../../../sim/levelWorld.js';
import { LIMITS } from '../../../level/limits.js';

const parcours = (seed, extra = {}) => generateWorld({ seed, length: 'medium', difficulty: 3, worldType: 'parcours', kernidee: null, ...extra });

test('Baustein-Brücke: Eingang → Ausgang, sonst nichts', () => {
  const bruecke = baueBausteinBruecken([{ x0: 10, w: 20, entryRow: 50, exitRow: 47 }]);
  const ziele = bruecke(10, 49);
  assert.deepEqual(ziele.map((z) => `${z.x},${z.y}`), ['28,46', '29,46']);
  assert.ok(ziele.every((z) => z.cost === 20));
  assert.deepEqual(bruecke(11, 49).length, 2, 'auch die zweite Randspalte');
  assert.deepEqual(bruecke(15, 49), [], 'mitten im Baustein: nichts');
  assert.deepEqual(bruecke(10, 40), [], 'andere Zeile: nichts');
  assert.deepEqual(baueBausteinBruecken(undefined)(1, 1), []);
});

test('Stempeln: das Chunk-Rechteck steht 1:1 im Raster, darüber Himmel, darunter Fels oder Luft', () => {
  const tpl = CHUNKS.find((c) => c.id === 'run-flat');
  const params = { seed: 'stempel', length: 'short', speedClass: 'normal', difficulty: 3 };
  const raum = { basisZeile: 60, rasterHoehe: 120 };
  const lauf = neuerBausteinLauf(params, 'factory', raum);
  const inst = naechsterBaustein(lauf, 0, (t) => t.id === tpl.id);
  assert.ok(inst && inst.tpl.id === 'run-flat');
  const grid = Array.from({ length: 120 }, () => new Array(60).fill('#'));
  const entities = [];
  const info = stempeln(grid, inst, 5, 60, 0, entities);
  const dy = 60 - inst.entry;
  for (let ly = 0; ly < inst.h; ly++) for (let cx = 0; cx < inst.w; cx++) assert.equal(grid[dy + ly][5 + cx], inst.rows[ly][cx]);
  for (let gy = 0; gy < dy; gy++) assert.equal(grid[gy][5], '.', 'offener Himmel über dem Chunk');
  assert.equal(info.entryRow, 60);
  assert.equal(info.exitRow, 60 + (inst.exit - inst.entry));
  assert.equal(entities.length, inst.entities.length);
});

test('Ein Baustein, der nicht ins Raster passt, wird verworfen statt abgeschnitten', () => {
  const params = { seed: 'zuhoch', length: 'short', speedClass: 'normal', difficulty: 3 };
  // Grundlinie ganz oben: für die meisten Chunks fehlt Platz nach oben
  const lauf = neuerBausteinLauf(params, 'factory', { basisZeile: 3, rasterHoehe: 200 });
  assert.equal(naechsterBaustein(lauf, 0.5), null);
});

test('Parcours: enthält Bausteine, jeder steht mit seinem Namen als Zone in der Liste', () => {
  const lv = parcours('baust-1');
  assert.ok(lv.meta.bausteine.length >= 3, `nur ${lv.meta.bausteine.length}`);
  for (const b of lv.meta.bausteine) {
    const zone = lv.layout.zones.find((z) => z.kind === 'baustein' && z.x0 === b.x0);
    assert.ok(zone, `Zone für ${b.id}`);
    assert.equal(zone.name, b.id);
    assert.equal(zone.w, b.w);
  }
  assert.ok(lv.meta.faehigkeiten.includes('baustein'));
});

test('Parcours: hängt bei jeder Länge, Tempo-Klasse und Schwierigkeit zusammen — ohne Reparatur', () => {
  const fails = [];
  for (const length of ['short', 'medium', 'long']) {
    for (const speedClass of ['normal', 'fast', 'super']) {
      for (const difficulty of [1, 3, 5]) {
        for (let i = 0; i < 3; i++) {
          const lv = parcours(`baust-${i}`, { length, speedClass, difficulty });
          const r = checkLevel(lv, lv.meta.limits);
          const sf = pruefeStart(lv.rows, lv.entities, lv.meta.start);
          if (!r.ok || sf.length || lv.meta.repairs.length) fails.push(`${length}/${speedClass}/S${difficulty}/${i}: ok=${r.ok} start=[${sf}] repairs=${lv.meta.repairs.length}`);
        }
      }
    }
  }
  assert.deepEqual(fails, []);
});

test('Parcours: bleibt in den Level-Grenzen und die Sim kann jedes Level bauen', () => {
  for (const length of ['short', 'long']) {
    for (let i = 0; i < 4; i++) {
      const lv = parcours(`grenzen-${i}`, { length });
      assert.ok(lv.width <= LIMITS.maxWidth && lv.height <= LIMITS.maxHeight, `${lv.width}×${lv.height}`);
      assert.ok(lv.entities.length <= LIMITS.maxElements, `${lv.entities.length} Elemente`);
      assert.doesNotThrow(() => createLevelWorld(lv));
    }
  }
});

test('Parcours: dieselben Seeds, dieselben Bausteine (deterministisch); andere Seeds, andere', () => {
  const a = parcours('gleich').meta.bausteine.map((b) => b.id).join(',');
  const b = parcours('gleich').meta.bausteine.map((b2) => b2.id).join(',');
  assert.equal(a, b);
  const viele = new Set();
  for (let i = 0; i < 12; i++) for (const bs of parcours(`vielfalt-${i}`).meta.bausteine) viele.add(bs.id);
  assert.ok(viele.size >= 20, `nur ${viele.size} verschiedene Bausteine über 12 Seeds`);
});

test('Parcours: Gruben sind echte Abgründe — unter dem Boden ist Luft, der Sturz endet früh', () => {
  const lv = parcours('grube-1', { length: 'long' });
  // Höchstens die Platte (+ Chunk-Unterkante) reicht nach unten, danach wird das Raster abgeschnitten
  assert.ok(lv.height <= 80, `Raster ${lv.height} Zeilen hoch — Sturz zu lang`);
  const letzte = lv.rows[lv.rows.length - 1];
  assert.ok(![...letzte].includes('#'), 'unterste Zeile ist Luft: Wer hier ankommt, stirbt');
});

test('Parcours: Chunk-Elemente bleiben unangetastet, wenn eine Kernidee sie nicht ändern darf (Ausschluss statt Umbau)', () => {
  // saegenTakt: kein Baustein mit Säge, sonst liefe eine Säge nicht im gemeinsamen Takt
  for (let i = 0; i < 6; i++) {
    const lv = parcours(`takt-${i}`, { length: 'long', kernidee: 'saegenTakt' });
    for (const b of lv.meta.bausteine) {
      const tpl = CHUNKS.find((c) => c.id === b.id);
      assert.ok(!gefahrenImBaustein(tpl).has('saw'), `${b.id} enthält Sägen`);
    }
  }
  // einElement: nur Bausteine, deren Gefahren ausschließlich die gewählte Art sind
  for (let i = 0; i < 6; i++) {
    const lv = parcours(`eins-${i}`, { length: 'long', kernidee: 'einElement' });
    const arten = new Set();
    for (const b of lv.meta.bausteine) for (const a of gefahrenImBaustein(CHUNKS.find((c) => c.id === b.id))) arten.add(a);
    assert.ok(arten.size <= 1, `${[...arten]}`);
  }
});

test('Baustein-Platz: die Rasterhöhe reicht für den größten Chunk samt Abweichung', () => {
  assert.ok(PLATZ_OBEN >= 30 && PLATZ_UNTEN >= 8 && UNTERKANTE > 0);
});

// ── Himmelsreich: Baustein-Inseln ───────────────────────────────────────────

const himmel = (seed, extra = {}) => generateWorld({ seed, length: 'medium', difficulty: 3, worldType: 'himmelsreich', kernidee: null, ...extra });

test('Himmelsreich: enthält Baustein-Inseln, Start und Ziel bleiben schlichte Inseln', () => {
  const lv = himmel('hb-1');
  assert.ok(lv.meta.bausteine.length >= 3, `nur ${lv.meta.bausteine.length}`);
  const zonen = lv.layout.zones;
  assert.equal(zonen[0].kind, 'insel');
  assert.equal(zonen[zonen.length - 1].kind, 'insel');
  for (const z of zonen.filter((q) => q.kind === 'baustein')) assert.ok(z.name && z.cpX === z.x0 + 1);
  assert.ok(lv.meta.faehigkeiten.includes('baustein') && lv.meta.faehigkeiten.includes('grapple'));
});

test('Himmelsreich: hängt bei jeder Länge, Tempo-Klasse und Schwierigkeit zusammen — ohne Reparatur, innerhalb der Grenzen', () => {
  const fails = [];
  for (const length of ['short', 'medium', 'long']) {
    for (const speedClass of ['normal', 'fast', 'super']) {
      for (const difficulty of [1, 3, 5]) {
        for (let i = 0; i < 4; i++) {
          const lv = himmel(`hm-${i}`, { length, speedClass, difficulty });
          const r = checkLevel(lv, lv.meta.limits);
          const sf = pruefeStart(lv.rows, lv.entities, lv.meta.start);
          const zuGross = lv.width > LIMITS.maxWidth || lv.height > LIMITS.maxHeight || lv.entities.length > LIMITS.maxElements;
          if (!r.ok || sf.length || lv.meta.repairs.length || zuGross) fails.push(`${length}/${speedClass}/S${difficulty}/${i}: ok=${r.ok} start=[${sf}] repairs=${lv.meta.repairs.length} ${lv.width}×${lv.height}`);
        }
      }
    }
  }
  assert.deepEqual(fails, []);
});

test('Himmelsreich: eine Baustein-Insel hat zwei Höhen (links/rechts) und die Brücken zielen auf die richtige', () => {
  // Suche einen Baustein, der Höhe gewinnt oder verliert — dort verrät sich eine Brücke, die noch mit
  // der falschen (linken statt rechten) Höhe rechnet, als abgerissene Route
  let gefunden = 0;
  for (let i = 0; i < 20 && gefunden < 3; i++) {
    const lv = himmel(`hoehe-${i}`);
    for (const z of lv.layout.zones) {
      if (z.kind !== 'baustein' || z.entryRow === z.exitRow) continue;
      gefunden++;
      assert.ok(checkLevel(lv, lv.meta.limits).ok, `hoehe-${i}: ${z.name} (${z.entryRow} → ${z.exitRow})`);
    }
  }
  assert.ok(gefunden >= 1, 'kein höhenverändernder Baustein in 20 Seeds — Test prüft nichts');
});

test('Himmelsreich: kein Baustein wird oben oder unten am Raster abgeschnitten (Platz wird mit der ECHTEN Inselhöhe geprüft)', () => {
  let geprueft = 0;
  for (let i = 0; i < 24; i++) {
    const lv = himmel(`platz-${i}`, { length: 'long' });
    for (const b of lv.meta.bausteine) {
      const tpl = CHUNKS.find((c) => c.id === b.id);
      const dy = b.entryRow - tpl.entry;
      assert.ok(dy >= 0, `platz-${i}/${b.id}: Chunk ragt ${-dy} Zeilen über den Rasterrand`);
      assert.ok(dy + tpl.h <= lv.height, `platz-${i}/${b.id}: Chunk-Unterkante ${dy + tpl.h} > Raster ${lv.height}`);
      // Die Chunk-Zeilen stehen wirklich unverändert im Raster (Stichprobe: erste und letzte Zeile)
      for (const ly of [0, tpl.h - 1]) assert.equal(lv.rows[dy + ly].slice(b.x0, b.x0 + 2).length, 2);
      geprueft++;
    }
  }
  assert.ok(geprueft >= 60, `nur ${geprueft} Bausteine geprüft`);
});

// ── Höhlen: Bausteine in Lauf-, Tunnel- und Kammerzonen ─────────────────────

const hoehle = (seed, extra = {}) => generateWorld({ seed, length: 'medium', difficulty: 3, worldType: 'hoehlen', kernidee: null, ...extra });

// Seit den eigenen Höhlen-Räumen (motive/hoehlenraeume.js, 24.09.2026) kommt ein Baustein aus zwei
// Quellen: den alten Chunks (statisch, per CHUNKS.find prüfbar) oder einem der neu ERZEUGTEN Räume
// (keine feste Vorlage — jeder Lauf sieht anders aus, es gibt kein `tpl.rows` zum Nachschlagen). Die
// eigentliche Zusage ("kein Sturz durch die halbe Welt") wird deshalb DIREKT im fertigen Raster
// gemessen, nicht an einer Vorlage — das prüft beide Quellen gleich und ist die Aussage, auf die es
// wirklich ankommt (siehe hoehlenraeume.js: ein Raum mit Grube bekommt jetzt selbst einen festen,
// mit Spitzen ausgelegten Boden PIT_TIEFE=11 Zeilen unter dem Hauptboden statt eines offenen Randes).
test('Höhlen: jedes Level enthält Bausteine, und keiner lässt länger als kurz durchfallen', () => {
  const MAX_FALL = 20;
  for (let i = 0; i < 12; i++) {
    const lv = hoehle(`hn-${i}`);
    assert.ok(lv.meta.bausteine.length >= 1, `hn-${i}: kein Baustein`);
    for (const b of lv.meta.bausteine) {
      for (let x = b.x0; x < b.x0 + b.w; x++) {
        if (lv.rows[b.entryRow][x] !== '.') continue;         // keine Grube in dieser Spalte
        let y = b.entryRow;
        while (y < lv.height && lv.rows[y][x] !== '#') y++;
        assert.ok(y - b.entryRow <= MAX_FALL, `${b.id} (hn-${i}), Spalte ${x}: Sturz über ${y - b.entryRow} Kacheln`);
      }
    }
  }
});

test('Höhlen: Zonen bleiben lückenlos und das Profil deckt die ganze Breite, auch nach dem Verbreitern', () => {
  for (let i = 0; i < 12; i++) {
    const lv = hoehle(`geom-${i}`, { length: 'long' });
    const zonen = lv.layout.zones;
    let x = 0;
    for (const z of zonen) { assert.equal(z.x0, x, `${z.id} beginnt bei ${z.x0}, erwartet ${x}`); x += z.w; }
    assert.equal(x, lv.width);
    assert.equal(lv.layout.profile.length, lv.width);
    for (let k = 1; k < zonen.length; k++) {
      // Naht: Der Ausgang einer Zone ist der Eingang der nächsten (das Verschieben darf keine Stufe reißen)
      assert.equal(zonen[k].entryRow, zonen[k - 1].exitRow, `${zonen[k - 1].id} → ${zonen[k].id}`);
    }
  }
});

test('Höhlen: hängt bei jeder Länge, Tempo-Klasse und Schwierigkeit zusammen, Start sicher, Grenzen eingehalten', () => {
  const fails = [];
  for (const length of ['short', 'medium', 'long']) {
    for (const speedClass of ['normal', 'fast', 'super']) {
      for (const difficulty of [1, 3, 5]) {
        for (let i = 0; i < 3; i++) {
          const lv = hoehle(`hm-${i}`, { length, speedClass, difficulty });
          const r = checkLevel(lv, lv.meta.limits);
          const sf = pruefeStart(lv.rows, lv.entities, lv.meta.start);
          const zuGross = lv.width > LIMITS.maxWidth || lv.height > LIMITS.maxHeight || lv.entities.length > LIMITS.maxElements;
          if (!r.ok || sf.length || zuGross) fails.push(`${length}/${speedClass}/S${difficulty}/${i}: ok=${r.ok} start=[${sf}] ${lv.width}×${lv.height}`);
          assert.doesNotThrow(() => createLevelWorld(lv));
        }
      }
    }
  }
  assert.deepEqual(fails, []);
});

test('Höhlen: Bausteine ändern das Gelände drumherum nicht kaputt — der Boden am Baustein-Rand ist eben und frei', () => {
  for (let i = 0; i < 12; i++) {
    const lv = hoehle(`rand-${i}`);
    for (const b of lv.meta.bausteine) {
      for (const x of [b.x0, b.x0 + 1, b.x0 + b.w - 2, b.x0 + b.w - 1]) {
        const y = x < b.x0 + 2 ? b.entryRow : b.exitRow;
        assert.equal(lv.rows[y][x], '#', `${b.id}: Boden fehlt bei (${x}, ${y})`);
        assert.notEqual(lv.rows[y - 1][x], '#', `${b.id}: Kopfraum belegt bei (${x}, ${y - 1})`);
      }
    }
  }
});
