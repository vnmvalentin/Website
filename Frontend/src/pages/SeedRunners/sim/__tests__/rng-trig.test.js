// Zufall, Sinus-Tabelle und die Quelltext-Wache für Determinismus.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, hashText } from '../rng.js';
import { cosTurns, sinTurns } from '../trig.js';

// ── PRNG ────────────────────────────────────────────────────────────────────

test('gleicher Seed → gleiche Folge; anderer Seed oder Teilstrom → andere', () => {
  const take = (rng, n = 50) => Array.from({ length: n }, () => rng.next());
  assert.deepEqual(take(createRng('a')), take(createRng('a')));
  assert.notDeepEqual(take(createRng('a')), take(createRng('b')));
  assert.notDeepEqual(take(createRng('a', 'layout')), take(createRng('a', 'chunk:1')));
  assert.deepEqual(take(createRng(42)), take(createRng('42')), 'Zahl und Text gleich');
});

test('PRNG ist gleichverteilt (grob) und bleibt in den Grenzen', () => {
  const rng = createRng('verteilung');
  const buckets = Array(10).fill(0);
  for (let i = 0; i < 20000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1);
    buckets[Math.floor(v * 10)]++;
  }
  for (const b of buckets) assert.ok(b > 1700 && b < 2300, `Eimer ${b}`);
  for (let i = 0; i < 2000; i++) {
    const n = rng.intRange(3, 7);
    assert.ok(Number.isInteger(n) && n >= 3 && n <= 7);
    assert.ok(rng.int(5) >= 0 && rng.int(5) < 5);
  }
});

test('Ähnliche Seeds liefern keine ähnlichen Folgen (Einlaufen)', () => {
  const firsts = ['seed1', 'seed2', 'seed3', 'seed4'].map((s) => createRng(s).next());
  const distinct = new Set(firsts.map((v) => v.toFixed(4)));
  assert.equal(distinct.size, 4);
});

test('weighted() bevorzugt hohe Gewichte, pick() erreicht alle Elemente', () => {
  const rng = createRng('gewichte');
  const count = { a: 0, b: 0 };
  for (let i = 0; i < 4000; i++) count[rng.weighted(['a', 'b'], [1, 3])]++;
  assert.ok(count.b > count.a * 2.4 && count.b < count.a * 3.7, `${count.a}:${count.b}`);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(rng.pick([1, 2, 3, 4]));
  assert.equal(seen.size, 4);
});

test('fork() ist unabhängig vom Verbrauch des Elternstroms', () => {
  const a = createRng('x');
  const b = createRng('x');
  a.next(); a.next(); a.next();            // Elternstrom a verbraucht Werte
  assert.equal(a.fork('kind').next(), b.fork('kind').next());
});

test('hashText ist stabil', () => {
  assert.equal(hashText('seed-runners'), hashText('seed-runners'));
  assert.notEqual(hashText('a'), hashText('b'));
  assert.equal(hashText('').length, 8);
});

// ── Sinus-Tabelle ───────────────────────────────────────────────────────────

test('sinTurns/cosTurns stimmen mit Math.sin/cos überein (nur in Tests benutzt) und sind periodisch', () => {
  let worst = 0;
  for (let i = 0; i <= 4000; i++) {
    const turns = i / 1000 - 2;   // -2 .. +2 Umdrehungen
    worst = Math.max(worst, Math.abs(sinTurns(turns) - Math.sin(turns * 2 * Math.PI)), Math.abs(cosTurns(turns) - Math.cos(turns * 2 * Math.PI)));
  }
  assert.ok(worst < 1e-5, `größte Abweichung ${worst}`);
  for (const t of [0.1, 0.37, 0.9]) assert.ok(Math.abs(sinTurns(t) - sinTurns(t + 3)) < 1e-9);
  for (let i = 0; i < 100; i++) {
    const t = i / 100;
    assert.ok(Math.abs(sinTurns(t) ** 2 + cosTurns(t) ** 2 - 1) < 2e-5);
  }
});

// ── Quelltext-Wache ─────────────────────────────────────────────────────────
// Was in Sim und Generator nicht vorkommen darf, weil es zwischen Engines (Chrome, Firefox, Safari,
// Node) oder von Lauf zu Lauf verschieden sein kann — und damit Level und Replays auseinanderlaufen ließe.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANNED = [
  [/Math\.(random|sin|cos|tan|asin|acos|atan2?|exp|expm1|log\d*|log1p|pow|hypot|cbrt|sinh|cosh|tanh)\b/, 'Math-Funktion ohne festgelegtes Ergebnis'],
  [/\bDate\b/, 'Date (Wanduhr)'],
  [/performance\.now/, 'performance.now (Wanduhr)'],
  [/\bcrypto\b/, 'crypto (Zufall)'],
  [/[^*/]\*\*[^*]/, '** (Potenz: nicht bitgleich festgelegt)'],
];

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['__tests__', 'tools', 'node_modules'].includes(entry.name)) continue;
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.js') && entry.name !== 'solver.js') {
      out.push(full);
    }
  }
  return out;
}

// Kommentare entfernen, damit Erklärungen wie "kein Math.sin" nicht anschlagen
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"`])\/\/.*$/gm, '$1');

test('Sim und Generator enthalten keine nicht-deterministischen Aufrufe', () => {
  const problems = [];
  for (const dir of ['sim', 'gen']) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      for (const [pattern, why] of BANNED) {
        const m = code.match(pattern);
        if (m) problems.push(`${path.relative(ROOT, file)}: ${m[0].trim()} — ${why}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
