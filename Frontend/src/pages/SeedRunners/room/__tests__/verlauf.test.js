// Tagesarchiv (ui/tagesArchiv.js) und Runden-Verlauf (room/rundenVerlauf.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { archivTage, isArchivTag, tagesRef, ARCHIV_AB } from '../../ui/tagesArchiv.js';
import { eintragAusRunde, merkeRunde, getVerlauf, entferneRunde, leereVerlauf, VERLAUF_MAX } from '../rundenVerlauf.js';

test('Archiv: alle Tage ab dem ersten Pfad-Tagesrennen bis gestern, jüngster zuerst', () => {
  assert.deepEqual(archivTage('2026-09-29'), ['2026-09-28', '2026-09-27', '2026-09-26']);
  assert.deepEqual(archivTage(ARCHIV_AB), [], 'am ersten Tag gibt es noch kein Archiv');
  assert.equal(archivTage('2027-01-01').length, 97);
  assert.equal(archivTage('2026-10-01').at(-1), ARCHIV_AB);
});

test('Archiv: nur vergangene Pfad-Tage sind Archiv-Tage', () => {
  assert.equal(isArchivTag('2026-09-26', '2026-09-28'), true);
  assert.equal(isArchivTag('2026-09-28', '2026-09-28'), false, 'heute gehört ins Tagesrennen');
  assert.equal(isArchivTag('2026-09-25', '2026-09-28'), false, 'Chunk-Tag vor dem Archiv');
  assert.equal(isArchivTag('2026-10-01', '2026-09-28'), false, 'Zukunft');
  assert.equal(isArchivTag('gestern', '2026-09-28'), false);
});

test('Archiv: die Referenz eines Tages ist ein festes Zufallslevel (bewertbar, in der Lobby spielbar)', () => {
  assert.deepEqual(tagesRef('2026-09-26'), { kind: 'pfad', seed: 'daily-2026-09-26', biome: 'random', gv: 1 });
});

const round = (over = {}) => ({ number: 1, kind: 'random', startAt: 1000, params: { seed: 'abc', gen: 'pfad', biome: 'random', gv: 1 }, ...over });
const results = [
  { id: 'a', name: 'Anna', place: 1, ticks: 3000, dnf: false },
  { id: 'b', name: 'Ben', place: 2, ticks: 3600, dnf: false },
  { id: 'c', name: 'Cem', place: null, ticks: null, dnf: true },
];
const ref = { kind: 'pfad', seed: 'abc', biome: 'random', gv: 1 };

test('Verlauf: Eintrag aus einer Runde — Platz, Zeit, Sieger; ohne Referenz nichts', () => {
  const e = eintragAusRunde({ round: round(), results, meId: 'b', ref, info: { leitidee: 'x' } });
  assert.equal(e.id, '1000:p1:random:abc');
  assert.equal(e.place, 2);
  assert.equal(e.total, 3);
  assert.equal(e.ticks, 3600);
  assert.equal(e.winner, 'Anna');
  assert.deepEqual(e.info, { leitidee: 'x' });
  const dnf = eintragAusRunde({ round: round(), results, meId: 'c', ref });
  assert.equal(dnf.place, null);
  assert.equal(dnf.dnf, true);
  assert.equal(eintragAusRunde({ round: round(), results, meId: 'a', ref: null }), null);
});

test('Verlauf: dieselbe Runde wird ergänzt statt verdoppelt, neueste zuerst, gedeckelt', () => {
  leereVerlauf();
  merkeRunde(eintragAusRunde({ round: round(), results, meId: 'a', ref }));
  merkeRunde(eintragAusRunde({ round: round(), results, meId: 'a', ref, info: { autor: 'akrobat' } }));
  assert.equal(getVerlauf().length, 1);
  assert.deepEqual(getVerlauf()[0].info, { autor: 'akrobat' });
  merkeRunde(eintragAusRunde({ round: round({ startAt: 2000 }), results, meId: 'a', ref }));
  assert.equal(getVerlauf()[0].id, '2000:p1:random:abc');
  entferneRunde('2000:p1:random:abc');
  assert.equal(getVerlauf().length, 1);
  for (let i = 0; i < VERLAUF_MAX + 5; i++) merkeRunde(eintragAusRunde({ round: round({ startAt: 5000 + i }), results, meId: 'a', ref }));
  assert.equal(getVerlauf().length, VERLAUF_MAX);
  leereVerlauf();
});
