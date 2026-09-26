// Level-Übertragung (tools/levelTransfer.js): veröffentlichte Level von einer Datenbank in eine andere — nur Wegwerf-Datenbanken.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createStore } = require('../store');
const { exportiere, importiere, FORMAT, VERSION } = require('../tools/levelTransfer');

function rig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-transfer-'));
  const a = path.join(dir, 'lokal.db');
  const b = path.join(dir, 'server.db');
  return { dir, a, b, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

let n = 0;
function lege(store, over = {}) {
  n++;
  const l = {
    code: over.code, accountId: '160224748', creatorName: 'valen', name: `Mein Level ${n}`, description: 'Beschreibung', tags: ['schwer'],
    difficulty: 4, biome: 'cave', speedClass: 'super', width: 40, height: 20, elements: 3,
    contentHash: (over.hash || String(n)).padStart(64, 'a'), doc: { version: 1, width: 40, height: 20, tiles: ['#'], elements: [{ type: 'spike' }] },
    preview: { w: 1, h: 1, scale: 1, rows: ['#'] }, simFp: 'fp1', creatorTicks: 1234, creatorDeaths: 2, creatorSplits: [[1, 600]],
    creatorLog: [0, 2, 50, 0], createdAt: 1000 + n, ...over,
  };
  store.levels.insertLevel(l);
  return l;
}

test('Export → Import: Dokument, Angaben, Vorschau, Ersteller-Lauf und Code kommen an; Statistik nicht', () => {
  const r = rig();
  try {
    const lokal = createStore(r.a);
    const eins = lege(lokal, { code: 'SR-AAA-BBB' });
    lege(lokal, { code: 'SR-CCC-DDD' });
    const id = lokal.levels.byCode('SR-AAA-BBB').id;
    lokal.levels.touchPlayer(id, 'k:1', 5);
    lokal.levels.rate('c:SR-AAA-BBB', 'k:1', 5, 5);
    const { levels, fehlend } = exportiere(lokal, ['sr-aaa-bbb', 'SR-ZZZ-ZZZ']);
    assert.deepEqual(fehlend, ['SR-ZZZ-ZZZ']);
    lokal.close();

    const server = createStore(r.b);
    const res = importiere(server, { format: FORMAT, version: VERSION, levels });
    assert.deepEqual(res, { angelegt: ['SR-AAA-BBB'], uebersprungen: [] });
    const got = server.levels.byCode('SR-AAA-BBB');
    assert.deepEqual([got.name, got.description, got.tags, got.difficulty, got.biome, got.speedClass, got.accountId, got.creatorName, got.status],
      [eins.name, 'Beschreibung', ['schwer'], 4, 'cave', 'super', '160224748', 'valen', 'published']);
    assert.deepEqual(server.levels.docOf(got.id), eins.doc);
    assert.deepEqual(server.levels.creatorRun(got.id), { simFp: 'fp1', ticks: 1234, deaths: 2, splits: [[1, 600]], log: [0, 2, 50, 0] });
    assert.deepEqual([got.plays, got.ratingCount], [0, 0], 'Spiele und Sterne gehören zur jeweiligen Datenbank');

    assert.deepEqual(importiere(server, { format: FORMAT, version: VERSION, levels }).uebersprungen, [{ code: 'SR-AAA-BBB', grund: 'gibt es dort schon' }]);
    server.close();
  } finally {
    r.cleanup();
  }
});

test('Import überschreibt nie: vergebener Code, gleicher Inhalt unter anderem Code, kaputte Datei', () => {
  const r = rig();
  try {
    const server = createStore(r.b);
    lege(server, { code: 'SR-AAA-BBB', hash: 'x1' });
    lege(server, { code: 'SR-EEE-FFF', hash: 'x2' });
    const fremd = { code: 'SR-AAA-BBB', accountId: '1', creatorName: 'a', name: 'Anderes', biome: 'ice', speedClass: 'normal', width: 1, height: 1, contentHash: 'b'.repeat(64), doc: {}, simFp: 'f', creatorTicks: 1, creatorLog: [] };
    const kopie = { ...fremd, code: 'SR-GGG-HHH', contentHash: 'x2'.padStart(64, 'a') };
    const res = importiere(server, { format: FORMAT, version: VERSION, levels: [fremd, kopie, { code: 'SR-KKK-MMM' }] });
    assert.deepEqual(res.angelegt, []);
    assert.deepEqual(res.uebersprungen.map((u) => u.grund.split(' (')[0]), ['Code dort schon vergeben', 'derselbe Inhalt existiert dort als SR-EEE-FFF', 'unvollständig']);
    assert.equal(server.levels.byCode('SR-AAA-BBB').name.startsWith('Mein Level'), true, 'das vorhandene Level bleibt unangetastet');
    assert.throws(() => importiere(server, { levels: [] }), /Keine Level-Datei/);
    server.close();
  } finally {
    r.cleanup();
  }
});

test('Kommandozeile: export | import zwischen zwei Datenbanken (wie in deploy.sh)', () => {
  const r = rig();
  try {
    const lokal = createStore(r.a);
    lege(lokal, { code: 'SR-PPP-QQQ' });
    lokal.close();
    createStore(r.b).close();
    const tool = path.join(__dirname, '..', 'tools', 'levelTransfer.js');
    const liste = execFileSync(process.execPath, [tool, 'liste', '--db', r.a], { encoding: 'utf8' });
    assert.match(liste, /SR-PPP-QQQ/);
    const json = execFileSync(process.execPath, [tool, 'export', 'SR-PPP-QQQ', '--db', r.a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const aus = execFileSync(process.execPath, [tool, 'import', '--db', r.b], { input: json, encoding: 'utf8' });
    assert.match(aus, /angelegt: SR-PPP-QQQ/);
    assert.throws(() => execFileSync(process.execPath, [tool, 'export', 'SR-XXX-YYY', '--db', r.a], { stdio: 'ignore' }), 'unbekannter Code: Fehler statt leerer Datei');
  } finally {
    r.cleanup();
  }
});
