const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeSettings, defaultSettings } = require('../settings');

const SOLO = ['snake', 'auction', 'bingo', 'pyramid-draft'];

test('Standardwerte sind bis auf den Namen gültig', () => {
  const { settings, errors } = sanitizeSettings({}, SOLO);
  assert.deepEqual(errors, ['tournamentNameMissing']);
  assert.deepEqual(settings.modes, SOLO);
  assert.equal(settings.maxPlayers, 16);
});

test('Name wird gekürzt und Leerraum zusammengefasst', () => {
  const { settings, errors } = sanitizeSettings({ name: '  Mein   Turnier  ' + 'x'.repeat(100) }, SOLO);
  assert.equal(errors.length, 0);
  assert.equal(settings.name.startsWith('Mein Turnier'), true);
  assert.equal(settings.name.length, 60);
});

test('Spielerzahl wird auf 2..64 begrenzt', () => {
  assert.equal(sanitizeSettings({ name: 'a', maxPlayers: 1 }, SOLO).settings.maxPlayers, 2);
  assert.equal(sanitizeSettings({ name: 'a', maxPlayers: 500 }, SOLO).settings.maxPlayers, 64);
  assert.equal(sanitizeSettings({ name: 'a', maxPlayers: 'abc' }, SOLO).settings.maxPlayers, 16);
});

test('nur Solo-Modi sind erlaubt, mindestens einer', () => {
  const r = sanitizeSettings({ name: 'a', modes: ['snake', 'elixir-auction-2v2', 'gibtsnicht'], modeSelection: 'random' }, SOLO);
  assert.deepEqual(r.settings.modes, ['snake']);
  assert.deepEqual(r.errors, []);
  assert.ok(sanitizeSettings({ name: 'a', modes: [] }, SOLO).errors.includes('tournamentNoModes'));
});

test('Pick/Ban braucht mindestens drei Modi', () => {
  const r = sanitizeSettings({ name: 'a', modes: ['snake', 'bingo'], modeSelection: 'pickban' }, SOLO);
  assert.ok(r.errors.includes('tournamentPickBanNeedsThree'));
  assert.deepEqual(sanitizeSettings({ name: 'a', modes: ['snake', 'bingo'], modeSelection: 'random' }, SOLO).errors, []);
});

test('Gruppengröße muss in der Spielerzahl aufgehen', () => {
  const bad = sanitizeSettings({ name: 'a', maxPlayers: 10, groupStage: { enabled: true, groupSize: 4, advancePerGroup: 2 } }, SOLO);
  assert.ok(bad.errors.includes('tournamentGroupSizeMismatch'));
  const ok = sanitizeSettings({ name: 'a', maxPlayers: 12, groupStage: { enabled: true, groupSize: 4, advancePerGroup: 2 } }, SOLO);
  assert.deepEqual(ok.errors, []);
});

test('Weiterkommende müssen kleiner als die Gruppengröße sein und mindestens 2 ins Bracket bringen', () => {
  const tooHigh = sanitizeSettings({ name: 'a', maxPlayers: 8, groupStage: { enabled: true, groupSize: 4, advancePerGroup: 4 } }, SOLO);
  assert.ok(tooHigh.errors.includes('tournamentAdvanceTooHigh'));
  const tooLow = sanitizeSettings({ name: 'a', maxPlayers: 4, groupStage: { enabled: true, groupSize: 4, advancePerGroup: 1 } }, SOLO);
  assert.ok(tooLow.errors.includes('tournamentAdvanceTooLow'));
});

test('Gruppen-Prüfung greift nur, wenn die Gruppenphase an ist', () => {
  const r = sanitizeSettings({ name: 'a', maxPlayers: 10, groupStage: { enabled: false, groupSize: 4 } }, SOLO);
  assert.deepEqual(r.errors, []);
});

test('Best-of nur 1/3 (normal) und 3/5 (Finals)', () => {
  const r = sanitizeSettings({ name: 'a', bestOf: { normal: 5, finals: 1 } }, SOLO);
  assert.deepEqual(r.settings.bestOf, { normal: 1, finals: 3 });
  assert.deepEqual(sanitizeSettings({ name: 'a', bestOf: { normal: 3, finals: 5 } }, SOLO).settings.bestOf, { normal: 3, finals: 5 });
});

test('Autostart nur mit Startzeitpunkt', () => {
  assert.equal(sanitizeSettings({ name: 'a', autoStart: true }, SOLO).settings.autoStart, false);
  assert.equal(sanitizeSettings({ name: 'a', autoStart: true, startsAt: 1893456000000 }, SOLO).settings.autoStart, true);
});

test('Bearbeiten: fehlende Felder bleiben, angegebene werden geprüft', () => {
  const base = { ...defaultSettings(SOLO), name: 'Alt', maxPlayers: 8, doubleElimination: true };
  const { settings, errors } = sanitizeSettings({ description: 'neu' }, SOLO, base);
  assert.deepEqual(errors, []);
  assert.equal(settings.name, 'Alt');
  assert.equal(settings.maxPlayers, 8);
  assert.equal(settings.doubleElimination, true);
  assert.equal(settings.description, 'neu');
});

test('Fristen werden begrenzt', () => {
  const { settings } = sanitizeSettings({ name: 'a', showUpMinutes: 999, battleMinutes: 1 }, SOLO);
  assert.equal(settings.showUpMinutes, 30);
  assert.equal(settings.battleMinutes, 10);
});
