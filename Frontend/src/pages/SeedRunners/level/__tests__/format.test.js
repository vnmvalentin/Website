// Kanonische Form und Inhalts-Hash: Der Hash gehört zum SPIELINHALT, nicht zu den Metadaten, und er ist
// unabhängig davon, wie ein Dokument aufgeschrieben wurde.

import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, contentHash, docToLevel, emptyDoc } from '../format.js';
import { validateDoc } from '../validate.js';
import { AIR, accept, docWith, setTile } from './docs.js';

const hashOf = (doc) => accept(doc).hash;

test('canonicalJson: Schlüsselreihenfolge egal, Arrayreihenfolge zählt', () => {
  assert.equal(canonicalJson({ b: 1, a: [2, 1] }), canonicalJson({ a: [2, 1], b: 1 }));
  assert.notEqual(canonicalJson({ a: [1, 2] }), canonicalJson({ a: [2, 1] }));
  assert.equal(canonicalJson({ a: 'x"y' }), '{"a":"x\\"y"}');
});

test('Ein leeres Startdokument ist gültig, warnungsfrei und hat einen 64-stelligen Hash', () => {
  const res = accept(emptyDoc());
  assert.match(res.hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(res.warnings, []);
  assert.equal(res.level.hash, res.hash);
  assert.equal(res.level.rows, res.doc.tiles);
  assert.equal(res.level.params.speedClass, 'normal');
  assert.equal(res.level.custom, true);
});

test('Der Hash ändert sich mit dem Spielinhalt', () => {
  const base = hashOf(emptyDoc());
  const variants = {
    'Kachel': docWith((d) => setTile(d, 20, 25, '#')),
    'Tempo-Klasse': docWith((d) => { d.speedClass = 'fast'; }),
    'Element': docWith((d) => { setTile(d, 20, 25, '.'); d.elements.push({ type: 'spike', tx: 20, ty: 25 }); }),
    'Checkpoint': docWith((d) => setTile(d, 30, 25, 'C')),
    'Größe': docWith(null, { width: 61 }),
  };
  const seen = new Set([base]);
  for (const [name, doc] of Object.entries(variants)) {
    const h = hashOf(doc);
    assert.ok(!seen.has(h), `${name} hätte den Hash ändern müssen`);
    seen.add(h);
  }
  const a = docWith((d) => d.elements.push({ type: 'saw', tx: 20, ty: AIR, path: [[0, 0], [5, 0]], speed: 50 }));
  const b = docWith((d) => d.elements.push({ type: 'saw', tx: 20, ty: AIR, path: [[0, 0], [5, 0]], speed: 55 }));
  assert.notEqual(hashOf(a), hashOf(b), 'Tempo einer Säge');
});

test('Metadaten gehören nicht zum Hash: Name, Beschreibung, Tags, Schwierigkeit und Biom ändern ihn nicht', () => {
  const base = hashOf(emptyDoc());
  const changed = docWith((d) => {
    d.meta = { name: 'Ganz anderer Name', description: 'Neu beschrieben', tags: ['schwer', 'lang'], difficulty: 4, biome: 'factory' };
  });
  assert.equal(hashOf(changed), base);
});

test('Der Hash hängt nicht von der Schreibweise ab: Elementreihenfolge, ausgeschriebene Standardwerte, Laser im Block', () => {
  const elems = [
    { type: 'spring', tx: 10, ty: 25 },
    { type: 'spike', tx: 30, ty: 25, dir: 'up' },
    { type: 'saw', tx: 20, ty: AIR },
  ];
  const a = docWith((d) => d.elements.push(...elems));
  const b = docWith((d) => d.elements.push(...[...elems].reverse().map((e) => ({ ...e }))));
  assert.equal(hashOf(a), hashOf(b), 'Reihenfolge');

  const implicit = docWith((d) => d.elements.push({ type: 'spring', tx: 10, ty: 25 }));
  const explicit = docWith((d) => d.elements.push({ type: 'spring', tx: 10, ty: 25, dir: 'up' }));
  assert.equal(hashOf(implicit), hashOf(explicit), 'Standardwert ausgeschrieben');

  const inAir = docWith((d) => d.elements.push({ type: 'laser', tx: 10, ty: AIR }));
  const inBlock = docWith((d) => { setTile(d, 10, AIR, '#'); d.elements.push({ type: 'laser', tx: 10, ty: AIR }); });
  assert.equal(hashOf(inAir), hashOf(inBlock), 'Laser auf Luft und Laser im Block sind dasselbe Level');
  assert.equal(accept(inBlock).doc.tiles[AIR][10], '.');

  const roundedA = docWith((d) => d.elements.push({ type: 'crumble', tx: 10, ty: AIR, delay: 0.2800001 }));
  const roundedB = docWith((d) => d.elements.push({ type: 'crumble', tx: 10, ty: AIR, delay: 0.28 }));
  assert.equal(hashOf(roundedA), hashOf(roundedB), 'Rundung auf 3 Stellen');
});

test('Der Hash ist stabil (fester Wert): eine Änderung der kanonischen Form würde alle gespeicherten Level entwerten', () => {
  // Wenn dieser Test fehlschlägt, wurde das Format geändert. Das ist nur mit neuer DOC_VERSION und Migration erlaubt.
  // Alle Parameter sind ausgeschrieben: Der Wert hängt am Format, nicht an den Standardwerten der Elemente.
  const doc = docWith((d) => d.elements.push(
    { type: 'spring', tx: 10, ty: 25, dir: 'up' },
    { type: 'saw', tx: 20, ty: AIR, radius: 7, speed: 50, phase: 0.25, path: [[0, 0], [5, 0]] },
  ));
  assert.equal(hashOf(doc), 'fe155c0f71e4bb718a61be455fdba3af5033d12e869e6b34dd60c3b7ebd7010f');
});

test('docToLevel liefert die Form der Engine, ohne das Dokument zu teilen', () => {
  const res = accept(docWith((d) => d.elements.push({ type: 'key', tx: 10, ty: AIR })));
  const level = docToLevel(res.doc);
  assert.deepEqual(Object.keys(level).sort(), ['biome', 'checkpointOrder', 'custom', 'entities', 'hash', 'height', 'params', 'placements', 'rows', 'version', 'width']);
  assert.notEqual(level.entities[0], res.doc.elements[0]);
  assert.equal(contentHash(res.doc), level.hash);
});

test('Nur ein kanonisches Dokument hat einen Hash: validateDoc ist idempotent', () => {
  const messy = docWith((d) => d.elements.push({ type: 'spring', tx: 10, ty: 25 }, { type: 'spike', tx: 5, ty: 25 }));
  const once = accept(messy);
  const twice = validateDoc(once.doc);
  assert.ok(twice.ok);
  assert.deepEqual(twice.doc, once.doc);
  assert.equal(twice.hash, once.hash);
});
