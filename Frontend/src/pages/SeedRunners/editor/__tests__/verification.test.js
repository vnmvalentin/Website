// Anzeige-Zustand der Verifizierung: Server vor lokalem Merker, Hash-Wechsel entwertet, Sim-Änderung macht sie veraltet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { verificationState } from '../verification.js';
import { emptyDoc } from './helpers.js';
import { validateDoc } from '../../level/validate.js';
import * as ops from '../ops.js';

const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const local = (hash, ticks = 900) => ({ hash, ticks, deaths: 1 });
const server = (hash, over = {}) => ({ hash, verified: true, current: true, ticks: 700, deaths: 0, ...over });

test('Ohne Angaben und bei ungültigem Level: nicht verifiziert', () => {
  assert.deepEqual(verificationState({ hash: H1, local: null, server: null }), { kind: 'none' });
  assert.deepEqual(verificationState({ hash: null, local: local(H1), server: server(H1) }), { kind: 'none' });
});

test('Der lokale Merker gilt nur für genau denselben Inhalt', () => {
  assert.deepEqual(verificationState({ hash: H1, local: local(H1), server: null }), { kind: 'verified', ticks: 900, deaths: 1 });
  assert.deepEqual(verificationState({ hash: H2, local: local(H1), server: null }), { kind: 'changed', ticks: 900 }, 'Inhalt geändert');
});

test('Der Server hat Vorrang vor dem Merker — für den Hash, nach dem er gefragt wurde', () => {
  assert.deepEqual(verificationState({ hash: H1, local: local(H1, 999), server: server(H1) }), { kind: 'verified', ticks: 700, deaths: 0 });
  // Der Server kennt diesen Stand nicht (anderes Konto, aufgeräumt): nicht verifiziert, auch wenn der Merker es glaubt
  assert.deepEqual(verificationState({ hash: H1, local: local(H1), server: { hash: H1, verified: false } }), { kind: 'none' });
  // Eine Antwort für einen ANDEREN Hash sagt über diesen nichts
  assert.deepEqual(verificationState({ hash: H2, local: null, server: server(H1) }), { kind: 'none' });
  assert.deepEqual(verificationState({ hash: H2, local: local(H1), server: server(H1) }), { kind: 'changed', ticks: 900 });
});

test('Eine Verifizierung gegen ältere Physik ist veraltet, nicht verschwunden', () => {
  assert.deepEqual(verificationState({ hash: H1, local: local(H1), server: server(H1, { current: false }) }), { kind: 'outdated', ticks: 700, deaths: 0 });
});

test('Mit echten Dokumenten: Name und Biom ändern den Hash nicht, Gelände und Tempo-Klasse schon', () => {
  const base = emptyDoc();
  const hashOf = (doc) => validateDoc(doc, { smoke: false }).hash;
  const h = hashOf(base);
  const merk = local(h);
  const renamed = ops.setMeta(base, { name: 'Neu', biome: 'cave', description: 'x', tags: ['a1'], difficulty: 4 });
  assert.equal(verificationState({ hash: hashOf(renamed), local: merk, server: null }).kind, 'verified');
  assert.equal(verificationState({ hash: hashOf(ops.setTile(base, 10, 10, '#')), local: merk, server: null }).kind, 'changed');
  assert.equal(verificationState({ hash: hashOf(ops.setSpeedClass(base, 'fast')), local: merk, server: null }).kind, 'changed');
  assert.equal(verificationState({ hash: hashOf(ops.placeElement(base, 'key', 10, 10).doc), local: merk, server: null }).kind, 'changed');
  // Änderung rückgängig gemacht: wieder verifiziert
  assert.equal(verificationState({ hash: hashOf(ops.setTile(ops.setTile(base, 10, 10, '#'), 10, 10, '.')), local: merk, server: null }).kind, 'verified');
});
