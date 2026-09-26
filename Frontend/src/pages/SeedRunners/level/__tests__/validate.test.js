// Validierung: Der Server nimmt nur an, was hier besteht. Jede Ablehnung hat einen Test, und jede Art von Element
// mindestens einen Annahme-Test, damit das Schema nicht versehentlich zu streng wird.

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDoc } from '../validate.js';
import { smokeTest } from '../smoke.js';
import { lintDoc } from '../lint.js';
import { emptyDoc, docToLevel } from '../format.js';
import { LIMITS } from '../limits.js';
import { AIR, accept, docWith, errorsOf, setTile } from './docs.js';

const has = (errors, re) => errors.some((e) => re.test(e));

test('Jeder Elementtyp lässt sich platzieren und besteht Validierung und Rauchtest', () => {
  const doc = docWith((d) => {
    d.elements.push(
      { type: 'spike', tx: 5, ty: 25 },
      { type: 'saw', tx: 8, ty: AIR },
      { type: 'saw', tx: 10, ty: AIR, orbit: 2 },
      { type: 'saw', tx: 12, ty: AIR, path: [[0, 0], [4, 0], [4, 3]] },
      { type: 'laser', tx: 14, ty: AIR, dir: 'down' },
      { type: 'fallingBlock', tx: 16, ty: 10, width: 3 },
      { type: 'mover', tx: 20, ty: AIR, path: [[0, 0], [6, 0]] },
      { type: 'mover', tx: 30, ty: AIR, mode: 'loop', path: [[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]] },
      { type: 'crumble', tx: 35, ty: AIR },
      { type: 'spring', tx: 36, ty: 25, dir: 'upRight' },
      { type: 'ring', tx: 38, ty: AIR, dir: 'upLeft' },
      { type: 'crystal', tx: 40, ty: AIR },
      { type: 'wind', tx: 42, ty: 10, w: 5, h: 10, ay: -800 },
      { type: 'wind', tx: 48, ty: 10, w: 5, h: 10, period: 3, on: 1 },
      { type: 'gravityZone', tx: 52, ty: 10, w: 4, h: 8 },
      { type: 'portal', tx: 6, ty: AIR, id: 'a', pair: 'b' },
      { type: 'portal', tx: 54, ty: AIR, id: 'b', pair: 'a' },
      { type: 'switch', tx: 24, ty: 25, channel: 2 },
      { type: 'colorBlock', tx: 26, ty: 25, channel: 2, solidWhen: 1 },
      { type: 'key', tx: 28, ty: 25 },
      { type: 'door', tx: 29, ty: 25 },
    );
  });
  const res = accept(doc);
  assert.equal(res.doc.elements.length, doc.elements.length);
});

test('Ungültige Dokumente werden abgelehnt', () => {
  const cases = [
    ['unbekanntes Feld', (d) => { d.extra = 1; }, /Unbekanntes Feld/],
    ['falsche Version', (d) => { d.version = 2; }, /Formatversion/],
    ['unbekannte Tempo-Klasse', (d) => { d.speedClass = 'turbo'; }, /Tempo-Klasse/],
    ['Tempo-Klasse als Objektname', (d) => { d.speedClass = 'constructor'; }, /Tempo-Klasse/],
    ['Breite zu klein', (d) => { d.width = 5; }, /Kacheln breit/],
    ['Breite zu groß', (d) => { d.width = LIMITS.maxWidth + 1; }, /Kacheln breit/],
    ['Breite keine ganze Zahl', (d) => { d.width = 60.5; }, /Kacheln breit/],
    ['Höhe zu groß', (d) => { d.height = LIMITS.maxHeight + 1; }, /hoch sein/],
    ['Zeilenzahl passt nicht', (d) => { d.tiles.pop(); }, /genau 30 Zeilen/],
    ['Zeilenlänge passt nicht', (d) => { d.tiles[3] += '.'; }, /Rasterzeile 4/],
    ['Zeile kein Text', (d) => { d.tiles[3] = 5; }, /Rasterzeile 4/],
    ['unbekanntes Zeichen', (d) => setTile(d, 4, 4, 'x'), /Unbekanntes Zeichen/],
    ['Elementzeichen im Raster', (d) => setTile(d, 4, 4, '^'), /Unbekanntes Zeichen/],
    ['Warp-Marke im Raster', (d) => setTile(d, 4, 4, '3'), /Unbekanntes Zeichen/],
    ['kein Start', (d) => setTile(d, 2, 25, '.'), /braucht einen Startpunkt/],
    ['zwei Starts', (d) => setTile(d, 5, 25, 'S'), /nur einen Startpunkt/],
    ['kein Ziel', (d) => setTile(d, 57, 25, '.'), /mindestens ein Ziel/],
    ['zu viele Checkpoints', (d) => { for (let i = 0; i <= LIMITS.maxCheckpoints; i++) setTile(d, 5 + i, 25, 'C'); }, /Checkpoints/],
    ['tiles fehlt', (d) => { delete d.tiles; }, /genau 30 Zeilen/],
    ['elements fehlt', (d) => { delete d.elements; }, /Elementliste/],
    ['elements kein Array', (d) => { d.elements = {}; }, /Elementliste/],
    ['zu viele Elemente', (d) => {
      d.elements = Array.from({ length: LIMITS.maxElements + 1 }, (_, i) => ({ type: 'crumble', tx: i % 55 + 2, ty: 1 + Math.floor(i / 55) }));
    }, new RegExp(`Höchstens ${LIMITS.maxElements} Elemente`)],
    ['Element kein Objekt', (d) => { d.elements.push('spike'); }, /kein Objekt/],
    ['unbekannter Elementtyp', (d) => { d.elements.push({ type: 'bomb', tx: 5, ty: 5 }); }, /Unbekannter Typ/],
    ['Typ ist ein Objektname', (d) => { d.elements.push({ type: 'constructor', tx: 5, ty: 5 }); }, /Unbekannter Typ/],
    ['Typ toString', (d) => { d.elements.push({ type: 'toString', tx: 5, ty: 5 }); }, /Unbekannter Typ/],
    ['Element außerhalb (rechts)', (d) => { d.elements.push({ type: 'crumble', tx: 60, ty: 5 }); }, /außerhalb/],
    ['Element außerhalb (negativ)', (d) => { d.elements.push({ type: 'crumble', tx: -1, ty: 5 }); }, /außerhalb/],
    ['Koordinate keine Ganzzahl', (d) => { d.elements.push({ type: 'crumble', tx: 5.5, ty: 5 }); }, /außerhalb/],
    ['Koordinate NaN', (d) => { d.elements.push({ type: 'crumble', tx: NaN, ty: 5 }); }, /außerhalb/],
    ['Koordinate als Text', (d) => { d.elements.push({ type: 'crumble', tx: '5', ty: 5 }); }, /außerhalb/],
    ['Element im festen Block', (d) => { d.elements.push({ type: 'spike', tx: 5, ty: 27 }); }, /freien Kachel/],
    ['Element auf dem Start', (d) => { d.elements.push({ type: 'spike', tx: 2, ty: 25 }); }, /freien Kachel/],
    ['Laser auf Eisblock', (d) => { setTile(d, 5, 5, 'I'); d.elements.push({ type: 'laser', tx: 5, ty: 5 }); }, /freien oder festen/],
    ['zwei Elemente auf einer Kachel', (d) => { d.elements.push({ type: 'spike', tx: 5, ty: 25 }, { type: 'spring', tx: 5, ty: 25 }); }, /übereinander/],
    ['Zone und Element am selben Anker', (d) => { d.elements.push({ type: 'wind', tx: 5, ty: 5 }, { type: 'key', tx: 5, ty: 5 }); }, /übereinander/],
    ['Parameter außerhalb des Bereichs', (d) => { d.elements.push({ type: 'saw', tx: 5, ty: 5, speed: 99999 }); }, /zwischen/],
    ['Parameter unbekannt', (d) => { d.elements.push({ type: 'spike', tx: 5, ty: 25, colour: 'red' }); }, /Unbekannter Parameter/],
    ['Portal ohne Partner', (d) => { d.elements.push({ type: 'portal', tx: 5, ty: 5, id: 'a', pair: 'b' }); }, /keinen Partner/],
    ['Portal-Kennung doppelt', (d) => {
      d.elements.push({ type: 'portal', tx: 5, ty: 5, id: 'a', pair: 'b' }, { type: 'portal', tx: 7, ty: 5, id: 'a', pair: 'b' }, { type: 'portal', tx: 9, ty: 5, id: 'b', pair: 'a' });
    }, /doppelt/],
    ['Portale zeigen nicht aufeinander', (d) => {
      d.elements.push({ type: 'portal', tx: 5, ty: 5, id: 'a', pair: 'b' }, { type: 'portal', tx: 7, ty: 5, id: 'b', pair: 'c' }, { type: 'portal', tx: 9, ty: 5, id: 'c', pair: 'b' });
    }, /nicht aufeinander/],
    ['Kreisbahn nicht geschlossen', (d) => { d.elements.push({ type: 'mover', tx: 5, ty: 5, mode: 'loop', path: [[0, 0], [3, 0], [3, 3]] }); }, /geschlossen/],
    ['checkpointOrder kein Array', (d) => { d.checkpointOrder = {}; }, /Liste sein/],
    ['checkpointOrder: Eintrag ungültig', (d) => {
      setTile(d, 10, 25, 'C'); setTile(d, 12, 25, 'C');
      d.checkpointOrder = [{ tx: 10, ty: 25 }];
    }, /ungültig/],
    ['checkpointOrder: zeigt auf keinen Checkpoint', (d) => {
      setTile(d, 10, 25, 'C'); setTile(d, 12, 25, 'C');
      d.checkpointOrder = [{ tx: 10, ty: 25, order: 1 }, { tx: 13, ty: 25, order: 2 }];
    }, /zeigt auf keinen Checkpoint/],
    ['checkpointOrder: zwei Nummern für denselben Checkpoint', (d) => {
      setTile(d, 10, 25, 'C'); setTile(d, 12, 25, 'C');
      d.checkpointOrder = [{ tx: 10, ty: 25, order: 1 }, { tx: 10, ty: 25, order: 2 }];
    }, /zwei Nummern/],
    ['checkpointOrder: Nummer kommt doppelt vor', (d) => {
      setTile(d, 10, 25, 'C'); setTile(d, 12, 25, 'C');
      d.checkpointOrder = [{ tx: 10, ty: 25, order: 1 }, { tx: 12, ty: 25, order: 1 }];
    }, /Nummer 1 kommt/],
    ['checkpointOrder: Nummer außerhalb 1–999', (d) => {
      setTile(d, 10, 25, 'C'); setTile(d, 12, 25, 'C');
      d.checkpointOrder = [{ tx: 10, ty: 25, order: 0 }, { tx: 12, ty: 25, order: 1 }];
    }, /zwischen 1 und 999/],
    ['checkpointOrder: unvollständig (nur einer von zwei nummeriert)', (d) => {
      setTile(d, 10, 25, 'C'); setTile(d, 12, 25, 'C');
      d.checkpointOrder = [{ tx: 10, ty: 25, order: 1 }];
    }, /ohne Nummer, obwohl andere/],
  ];
  for (const [name, mutate, expected] of cases) {
    const errors = errorsOf(docWith(mutate));
    assert.ok(has(errors, expected), `${name}: ${errors.join(' | ')}`);
  }
  for (const input of [42, [], null, 'text', undefined]) {
    assert.ok(has(errorsOf(input), /kein gültiges Dokument/), String(input));
  }
});

test('checkpointOrder: vollständig und eindeutig wird angenommen, gehört aber bewusst NICHT zum Inhalts-Hash', () => {
  const withOrder = docWith((d) => {
    setTile(d, 10, 25, 'C'); setTile(d, 12, 25, 'C');
    d.checkpointOrder = [{ tx: 12, ty: 25, order: 1 }, { tx: 10, ty: 25, order: 2 }];
  });
  const res = accept(withOrder);
  assert.deepEqual(res.doc.checkpointOrder, [{ tx: 10, ty: 25, order: 2 }, { tx: 12, ty: 25, order: 1 }]);

  // DOC_VERSION steht seit Projektbeginn unverändert auf 1 und es gibt keine Migration — jedes zusätzliche
  // Hash-Feld würde den Hash JEDES bestehenden Levels ändern und bestehende Verifizierungen entwerten (siehe
  // contentOf() in format.js). Dieselben Kacheln, andere Nummern: gleicher Hash.
  const swapped = docWith((d) => {
    setTile(d, 10, 25, 'C'); setTile(d, 12, 25, 'C');
    d.checkpointOrder = [{ tx: 12, ty: 25, order: 2 }, { tx: 10, ty: 25, order: 1 }];
  });
  assert.equal(accept(swapped).hash, res.hash);

  // Ganz ohne checkpointOrder (Normalfall) bleibt weiterhin gültig und hat denselben Hash
  const without = docWith((d) => { setTile(d, 10, 25, 'C'); setTile(d, 12, 25, 'C'); });
  const resWithout = accept(without);
  assert.deepEqual(resWithout.doc.checkpointOrder, []);
  assert.equal(resWithout.hash, res.hash);
});

test('Feindliche Eingaben aus JSON.parse: Prototype-Schlüssel und Typ-Verwechslungen', () => {
  const doc = JSON.stringify(emptyDoc());
  const attempts = [
    doc.replace('{', '{"__proto__":{"admin":true},'),
    doc.replace('"elements":[]', '"elements":[{"type":"spike","tx":5,"ty":25,"__proto__":{"x":1}}]'),
    doc.replace('"elements":[]', '"elements":[{"type":"spike","tx":5,"ty":25,"constructor":{"prototype":{}}}]'),
    doc.replace('"meta":{', '"meta":{"__proto__":{"a":1},'),
    doc.replace('"width":60', '"width":"60"'),
    doc.replace('"meta"', '"meta":null,"x"'),
  ];
  for (const text of attempts) {
    const parsed = JSON.parse(text);
    const res = validateDoc(parsed);
    assert.equal(res.ok, false, text.slice(0, 80));
  }
  assert.equal({}.admin, undefined, 'Object.prototype blieb sauber');
});

test('Eine riesige Eingabe wird sofort abgelehnt, ohne sie zu durchsuchen', () => {
  const errors = errorsOf({ ...emptyDoc(), junk: 'x'.repeat(LIMITS.maxBytes + 1) });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /zu groß/);
});

test('Die Fehlerliste ist gedeckelt', () => {
  const doc = docWith((d) => { for (let i = 0; i < 100; i++) d.elements.push({ type: 'saw', tx: 2 + (i % 50), ty: 3 + Math.floor(i / 50), speed: 1e9 }); });
  assert.ok(errorsOf(doc).length <= LIMITS.maxErrors);
});

test('Die Grenzen selbst sind erlaubt (Mindest- und Höchstmaße)', () => {
  accept(emptyDoc({ width: LIMITS.minWidth, height: LIMITS.minHeight }), { smoke: false });
  accept(emptyDoc({ width: LIMITS.maxWidth, height: LIMITS.maxHeight }), { smoke: false });
});

// ── Metadaten ───────────────────────────────────────────────────────────────

test('Metadaten werden bereinigt und geprüft', () => {
  const res = accept(docWith((d) => { d.meta = { name: '  Mein   Level  ', description: ' Text\nzweite Zeile ', tags: ['Schwer', ' schwer ', 'Lang'], difficulty: 3, biome: 'cave' }; }));
  assert.equal(res.doc.meta.name, 'Mein Level');
  assert.equal(res.doc.meta.description, 'Text\nzweite Zeile');
  assert.deepEqual(res.doc.meta.tags, ['schwer', 'lang']);
  assert.equal(res.doc.meta.difficulty, 3);
  assert.equal(res.doc.meta.biome, 'cave');

  const bad = [
    [{ name: 'a'.repeat(LIMITS.nameMax + 1) }, /höchstens 40 Zeichen/],
    [{ name: 'Tab\there' }, /ungültige Zeichen/],
    [{ name: 42 }, /ungültige Zeichen/],
    [{ description: 'x'.repeat(LIMITS.descriptionMax + 1) }, /höchstens 500/],
    [{ tags: ['a'] }, /Tag braucht/],
    [{ tags: ['a'.repeat(21)] }, /Tag braucht/],
    [{ tags: ['eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs'] }, /Höchstens 5 Tags/],
    [{ tags: 'schwer' }, /Höchstens 5 Tags/],
    [{ difficulty: 6 }, /1 bis 5/],
    [{ difficulty: 2.5 }, /1 bis 5/],
    [{ biome: 'lava' }, /Unbekanntes Biom/],
    [{ mystery: 1 }, /Unbekannte Angabe/],
  ];
  for (const [meta, expected] of bad) {
    const errors = errorsOf(docWith((d) => { d.meta = meta; }));
    assert.ok(has(errors, expected), `${JSON.stringify(meta).slice(0, 60)}: ${errors.join(' | ')}`);
  }
});

test('Der Levelname ist im Entwurf optional und für die Veröffentlichung Pflicht', () => {
  accept(emptyDoc());
  assert.ok(has(errorsOf(emptyDoc(), { requireName: true }), /Levelname braucht mindestens 3/));
  accept(docWith((d) => { d.meta.name = 'Ein Name'; }), { requireName: true });
});

// ── Rauchtest ───────────────────────────────────────────────────────────────

test('Rauchtest: ein Level, das die Engine nicht aufbauen kann, wird gemeldet statt den Server zu treffen', () => {
  const rows = emptyDoc().tiles;
  const broken = { params: { speedClass: 'normal' }, rows, entities: [{ type: 'portal', tx: 5, ty: 5, id: 'a', pair: 'fehlt' }] };
  const res = smokeTest(broken);
  assert.equal(res.ok, false);
  assert.match(res.error, /Portal/);
  assert.equal(smokeTest(docToLevel(accept(emptyDoc()).doc)).ok, true);
});

test('validateDoc mit smoke:false überspringt den Rauchtest, mit smoke:true läuft er', () => {
  const doc = emptyDoc();
  assert.equal(validateDoc(doc, { smoke: false }).ok, true);
  assert.equal(validateDoc(doc, { smoke: true }).ok, true);
});

// ── Warnungen ───────────────────────────────────────────────────────────────

test('Warnungen: schwebender Start, Gefahr am Spawn, Kanäle, Türen, fehlende Checkpoints, Pfad außerhalb', () => {
  const codes = (doc) => lintDoc(accept(doc, { smoke: false }).doc).map((w) => w.code);

  assert.deepEqual(codes(emptyDoc()), []);
  assert.ok(codes(docWith((d) => setTile(d, 2, 26, '.'))).includes('startFloating'));
  assert.ok(codes(docWith((d) => d.elements.push({ type: 'spike', tx: 4, ty: 25 }))).includes('hazardNearSpawn'));
  assert.ok(!codes(docWith((d) => d.elements.push({ type: 'spike', tx: 12, ty: 25 }))).includes('hazardNearSpawn'));
  assert.ok(codes(docWith((d) => d.elements.push({ type: 'colorBlock', tx: 20, ty: 25, channel: 1 }))).includes('blocksWithoutSwitch'));
  assert.ok(codes(docWith((d) => d.elements.push({ type: 'switch', tx: 20, ty: 25, channel: 2 }))).includes('switchWithoutBlocks'));
  assert.ok(codes(docWith((d) => d.elements.push({ type: 'door', tx: 20, ty: 25 }))).includes('doorsWithoutKeys'));
  assert.ok(codes(docWith((d) => d.elements.push({ type: 'key', tx: 20, ty: 25 }))).includes('keysWithoutDoors'));
  // Eine Tür aus mehreren Blöcken braucht nur EINEN Schlüssel
  assert.ok(!codes(docWith((d) => d.elements.push({ type: 'key', tx: 10, ty: 25 }, { type: 'door', tx: 20, ty: 24 }, { type: 'door', tx: 20, ty: 25 }))).includes('doorsWithoutKeys'));
  assert.ok(codes(emptyDoc({ width: 300 })).includes('noCheckpoints'));
  assert.ok(codes(docWith((d) => d.elements.push({ type: 'saw', tx: 5, ty: AIR, path: [[0, 0], [70, 0]] }))).includes('pathOutside'));
});
