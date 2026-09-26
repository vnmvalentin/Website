// Das Element-Schema muss zu den Element-Modulen passen: Standardwerte gleich, erlaubte Bereiche weit
// genug für alles, was der Generator baut, und Unsinn (NaN, Text, riesige Zahlen) abgelehnt.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENT_SCHEMA, ELEMENT_TYPE_LIST, normalizeParams } from '../../sim/elements/schema.js';
import { ELEMENT_TYPES } from '../../sim/elements/index.js';
import { generateLevel } from '../../gen/index.js';
import { createLevelWorld } from '../../sim/levelWorld.js';
import { emptyDoc } from '../format.js';

const GEN_SAMPLE = [];
for (let s = 0; s < 30; s++) {
  for (const speedClass of ['normal', 'fast', 'super']) GEN_SAMPLE.push(generateLevel({ seed: `schema-${s}`, length: 'short', speedClass, biome: 'random' }));
}

const strip = (element) => {
  const params = { ...element };
  for (const key of ['type', 'tx', 'ty']) delete params[key];
  return params;
};

// Der Generator liefert vereinzelt Werte mit Fließkomma-Rauschen (0.6000000000000001); die Normalisierung rundet
// auf 3 (Pfadpunkte auf 2) Nachkommastellen. Erlaubt ist also nur eine Abweichung in Rundungsgröße.
function assertSame(actual, expected, message) {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', message);
    assert.ok(Math.abs(actual - expected) <= 0.005, `${message}: ${actual} statt ${expected}`);
  } else if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual) && actual.length === expected.length, message);
    expected.forEach((v, i) => assertSame(actual[i], v, message));
  } else {
    assert.deepEqual(actual, expected, message);
  }
}

test('Das Schema kennt genau die Elemente der Engine', () => {
  assert.deepEqual([...ELEMENT_TYPE_LIST].sort(), Object.keys(ELEMENT_TYPES).sort());
});

test('Alles, was der Generator baut, liegt im Schema und ändert sich durch die Normalisierung nicht', () => {
  const seen = new Set();
  for (const level of GEN_SAMPLE) {
    for (const e of level.entities) {
      seen.add(e.type);
      const res = normalizeParams(e.type, e);
      assert.ok(res.ok, `${e.type}: ${res.errors}`);
      const given = strip(e);
      for (const key of Object.keys(given)) {
        assert.ok(key in res.clean, `${e.type}: „${key}“ ging bei der Normalisierung verloren`);
        assertSame(res.clean[key], given[key], `${e.type}.${key} wurde verändert`);
      }
    }
  }
  assert.ok(seen.size >= 10, `nur ${seen.size} Typen in der Stichprobe`);
});

test('Normalisierung ist idempotent', () => {
  for (const level of GEN_SAMPLE.slice(0, 20)) {
    for (const e of level.entities) {
      const once = normalizeParams(e.type, e).clean;
      const twice = normalizeParams(e.type, { type: e.type, tx: 0, ty: 0, ...once });
      assert.ok(twice.ok);
      assert.deepEqual(twice.clean, once, e.type);
    }
  }
});

// Standardwerte des Schemas == Standardwerte der Module: Ein Element ohne Angaben und dasselbe Element mit den
// ausgefüllten Standardwerten müssen in der Engine identisch entstehen.
const MINIMAL = [
  ['spike', {}], ['saw', {}], ['saw', { path: [[0, 0], [5, 0]] }], ['saw', { orbit: 2 }], ['laser', {}],
  ['fallingBlock', {}], ['mover', { path: [[0, 0], [5, 0]] }], ['crumble', {}], ['spring', {}], ['ring', {}],
  ['crystal', {}], ['wind', {}], ['wind', { period: 3 }], ['gravityZone', {}], ['switch', {}], ['colorBlock', {}],
  ['key', {}], ['door', {}],
];

function build(type, params) {
  const doc = emptyDoc();
  const entities = [{ type, tx: 10, ty: 10, ...params }];
  if (type === 'portal') entities.push({ type, tx: 20, ty: 10, id: params.pair, pair: params.id });
  const world = createLevelWorld({ params: { speedClass: 'normal' }, rows: doc.tiles, entities });
  const el = { ...world.elements.find((e) => e.type === type) };
  delete el.i; delete el.mate; delete el.group;
  return el;
}

test('Schema-Standardwerte stimmen mit den Standardwerten der Module überein', () => {
  const cases = [...MINIMAL, ['portal', { id: 'a', pair: 'b' }]];
  for (const [type, params] of cases) {
    const res = normalizeParams(type, { type, tx: 10, ty: 10, ...params });
    assert.ok(res.ok, `${type}: ${res.errors}`);
    assert.deepEqual(build(type, { ...params, ...res.clean }), build(type, params), `${type} ${JSON.stringify(params)}`);
  }
});

test('Ungültige Parameter werden abgelehnt', () => {
  const bad = [
    ['saw', { speed: NaN }], ['saw', { speed: Infinity }], ['saw', { speed: '70' }], ['saw', { speed: 1e9 }], ['saw', { speed: 0 }],
    ['saw', { path: [[0, 0]] }], ['saw', { path: [[0, 0], [1e9, 0]] }], ['saw', { path: [[1, 1], [5, 0]] }],
    ['saw', { path: [[0, 0], [5, 0]], orbit: 2 }],
    ['laser', { period: 0 }], ['laser', { period: 2, on: 2 }], ['laser', { dir: 'diagonal' }],
    ['fallingBlock', { width: 0 }], ['fallingBlock', { width: 2.5 }], ['fallingBlock', { height: 99 }],
    ['mover', {}], ['mover', { path: [[0, 0], [5, 0]], mode: 'loop' }], ['mover', { path: [[2, 0], [5, 0]] }],
    ['mover', { path: [[0, 0], [5, 0]], speed: -5 }], ['mover', { path: [[0, 0], [5, 0]], oneWay: 'ja' }],
    ['wind', { period: 0 }], ['wind', { ay: 1e6 }], ['wind', { on: 1 }], ['wind', { period: 2, on: 3 }],
    ['switch', { channel: 4 }], ['switch', { channel: -1 }], ['colorBlock', { solidWhen: 2 }],
    ['portal', {}], ['portal', { id: 'a b', pair: 'c' }], ['portal', { id: 'a', pair: 'a' }],
    ['spike', { dir: 'sideways' }], ['spike', { dir: 5 }],
    ['spike', { unbekannt: 1 }], ['spring', { dir: 'down' }], ['ring', { radius: 999 }],
  ];
  for (const [type, params] of bad) {
    const res = normalizeParams(type, { type, tx: 1, ty: 1, ...params });
    assert.equal(res.ok, false, `${type} ${JSON.stringify(params)} hätte abgelehnt werden müssen`);
    assert.ok(res.errors.length > 0);
  }
  for (const type of ['nope', 'constructor', '__proto__', 'toString', 42, null, undefined]) {
    assert.equal(normalizeParams(type, {}).ok, false, String(type));
  }
  // Auch als Parametername sind sie nicht "bekannt" (Prototypkette)
  for (const key of ['__proto__', 'constructor', 'hasOwnProperty']) {
    const spec = JSON.parse(`{"${key}": 1}`);
    assert.equal(normalizeParams('key', spec).ok, false, key);
  }
});

test('Der Inhalt einer stehenden Säge hängt nicht von wirkungslosen Angaben ab', () => {
  const a = normalizeParams('saw', { speed: 100, turnsPerSecond: 1, phase: 0.5 }).clean;
  const b = normalizeParams('saw', {}).clean;
  assert.deepEqual(a, b);
  assert.equal(normalizeParams('wind', { warn: 0.9, phase: 0.5 }).ok, true);
  assert.deepEqual(normalizeParams('wind', { warn: 0.9, phase: 0.5 }).clean, normalizeParams('wind', {}).clean);
});

test('Jeder Typ hat Beschriftung, Kategorie und Ankerart', () => {
  for (const [type, s] of Object.entries(ELEMENT_SCHEMA)) {
    assert.ok(s.label, type);
    assert.ok(['hazard', 'platform', 'movement', 'logic'].includes(s.category), type);
    assert.ok(['air', 'airOrSolid', 'any'].includes(s.anchor), type);
  }
});
