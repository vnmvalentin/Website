// Verlauf (Undo/Redo), RLE-Speicherformat, Entwurfsspeicher und die Vorschau-Welt des Editors.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from '../history.js';
import { encodeRow, decodeRow, encodeTiles, decodeTiles } from '../rle.js';
import { createDraftStore, memoryStorage, MAX_DRAFTS } from '../drafts.js';
import { buildPreview } from '../previewWorld.js';
import * as ops from '../ops.js';
import { emptyDoc } from './helpers.js';
import { stepWorld } from '../../sim/world.js';

// ── Verlauf ─────────────────────────────────────────────────────────────────

test('Verlauf: Änderung, Rückgängig, Wiederholen; eine neue Änderung verwirft das Wiederholen', () => {
  const a = { n: 1 };
  const b = { n: 2 };
  const c = { n: 3 };
  let h = H.createHistory(a);
  assert.equal(H.canUndo(h), false);
  h = H.commit(h, b);
  h = H.commit(h, c);
  assert.equal(h.present, c);
  h = H.undo(h);
  assert.equal(h.present, b);
  assert.equal(H.canRedo(h), true);
  h = H.undo(h);
  assert.equal(h.present, a);
  assert.equal(H.undo(h), h, 'am Anfang: nichts zu tun');
  h = H.redo(h);
  assert.equal(h.present, b);
  h = H.commit(h, { n: 9 });
  assert.equal(H.canRedo(h), false);
  assert.equal(H.commit(h, h.present), h, 'derselbe Stand: kein Eintrag');
});

test('Verlauf: ein Strich mit vielen Änderungen ist EIN Schritt; ein leerer Strich schreibt nichts', () => {
  const a = { n: 0 };
  let h = H.createHistory(a);
  h = H.beginStroke(h);
  for (let i = 1; i <= 50; i++) h = H.replace(h, { n: i });
  h = H.endStroke(h);
  assert.equal(h.present.n, 50);
  assert.equal(h.past.length, 1);
  h = H.undo(h);
  assert.equal(h.present, a, 'ein Undo macht den ganzen Strich rückgängig');

  h = H.beginStroke(H.createHistory(a));
  h = H.endStroke(H.replace(h, a));
  assert.equal(h.past.length, 0);
  assert.equal(H.endStroke(h), h);
});

test('Verlauf: die Länge ist begrenzt, der älteste Schritt fällt zuerst weg', () => {
  let h = H.createHistory({ n: 0 });
  for (let i = 1; i <= H.HISTORY_LIMIT + 20; i++) h = H.commit(h, { n: i });
  assert.equal(h.past.length, H.HISTORY_LIMIT);
  assert.equal(h.past[0].n, 20);
});

test('Verlauf mit echten Operationen: Rückgängig stellt den Stand exakt wieder her', () => {
  const start = emptyDoc();
  let h = H.createHistory(start);
  h = H.commit(h, ops.fillRect(h.present, { x0: 5, y0: 5, x1: 9, y1: 9 }, '#'));
  h = H.commit(h, ops.placeElement(h.present, 'saw', 20, 10).doc);
  h = H.undo(H.undo(h));
  assert.equal(h.present, start);
  assert.equal(H.reset(start).past.length, 0);
});

// ── RLE ─────────────────────────────────────────────────────────────────────

test('RLE: Zeilen überstehen Hin- und Rückweg, auch mit allen Zeichen', () => {
  assert.equal(encodeRow('....##..'), '4.2#2.');
  assert.equal(decodeRow('4.2#2.', 8), '....##..');
  const chars = '.#IW><=SCGE';
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 200; i++) {
    let row = '';
    while (row.length < 80) row += chars[rnd(chars.length)].repeat(1 + rnd(9));
    row = row.slice(0, 80);
    assert.equal(decodeRow(encodeRow(row), 80), row);
  }
});

test('RLE: ungültiger Text wird abgelehnt, nicht "repariert"', () => {
  for (const bad of ['', '3', 'x', '4x', '0.', '4.4', '4.2#', '5.5#', '4040', '-3.', '3. ', null, 42]) {
    assert.equal(decodeRow(bad, 8), null, String(bad));
  }
  assert.equal(decodeTiles(['4.'], 4, 2), null, 'falsche Zeilenzahl');
  assert.equal(decodeTiles(['4.', '3.'], 4, 2), null, 'eine Zeile zu kurz');
  assert.equal(decodeTiles('nope', 4, 2), null);
});

test('RLE: ein großes, meist leeres Level braucht nur wenige KB', () => {
  const doc = emptyDoc({ width: 1200, height: 160 });
  const plain = JSON.stringify(doc.tiles).length;
  const packed = JSON.stringify(encodeTiles(doc.tiles)).length;
  assert.ok(plain > 190_000);
  assert.ok(packed < 5000, `kodiert ${packed} Bytes`);
  assert.deepEqual(decodeTiles(encodeTiles(doc.tiles), 1200, 160), doc.tiles);
});

// ── Entwürfe ────────────────────────────────────────────────────────────────

function store(opts = {}) {
  let clock = opts.start ?? 1000;
  const storage = opts.storage || memoryStorage();
  return { s: createDraftStore(storage, () => clock++), storage };
}

test('Entwürfe: speichern, laden, Liste (neuester zuerst), überschreiben, löschen', () => {
  const { s } = store();
  const a = { ...emptyDoc(), meta: { ...emptyDoc().meta, name: 'Erster' } };
  const b = { ...emptyDoc({ width: 80 }), meta: { ...emptyDoc().meta, name: 'Zweiter' } };
  const ra = s.save(null, a);
  const rb = s.save(null, b);
  assert.ok(ra.ok && rb.ok);
  assert.notEqual(ra.id, rb.id);
  assert.deepEqual(s.list().map((e) => e.name), ['Zweiter', 'Erster']);
  assert.deepEqual(s.load(ra.id), a, 'Dokument kommt unverändert zurück');

  const changed = ops.fillRect(a, { x0: 5, y0: 5, x1: 8, y1: 8 }, '#');
  assert.ok(s.save(ra.id, changed).ok);
  assert.deepEqual(s.list().map((e) => e.name), ['Erster', 'Zweiter'], 'Speichern rückt nach oben');
  assert.equal(s.list().length, 2, 'überschreiben legt keinen zweiten an');
  assert.deepEqual(s.load(ra.id), changed);
  assert.deepEqual(s.list()[0], { id: ra.id, hash: null, name: 'Erster', updatedAt: s.list()[0].updatedAt, width: 60, height: 30, elements: 0, speedClass: 'normal', biome: 'meadow' });

  s.remove(ra.id);
  assert.equal(s.load(ra.id), null);
  assert.deepEqual(s.list().map((e) => e.id), [rb.id]);
});

test('Entwürfe: Kopie mit neuem Namen; fehlender Entwurf gibt null', () => {
  const { s } = store();
  const doc = { ...emptyDoc(), meta: { ...emptyDoc().meta, name: 'Original' } };
  const id = s.save(null, doc).id;
  const copyId = s.duplicate(id);
  assert.ok(copyId && copyId !== id);
  assert.equal(s.load(copyId).meta.name, 'Original (Kopie)');
  assert.equal(s.duplicate('gibtsnicht'), null);
});

test('Entwürfe: beschädigte Einträge stürzen nichts ab', () => {
  const { s, storage } = store();
  const id = s.save(null, emptyDoc()).id;
  storage.setItem(`srDraft:${id}`, '{kaputt');
  assert.equal(s.load(id), null);
  storage.setItem(`srDraft:${id}`, JSON.stringify({ width: 60, height: 30, tiles: ['4.'], elements: [] }));
  assert.equal(s.load(id), null, 'Raster passt nicht zur Größe');
  storage.setItem(`srDraft:${id}`, JSON.stringify({ width: 99999, height: 30, tiles: [], elements: [] }));
  assert.equal(s.load(id), null, 'unmögliche Größe');
  storage.setItem('srDrafts:v1', 'kein json');
  assert.deepEqual(s.list(), []);
  storage.setItem('srDrafts:v1', JSON.stringify([null, 5, { id: 'x', updatedAt: 1 }]));
  assert.deepEqual(s.list().map((e) => e.id), ['x']);
});

test('Entwürfe: voller oder gesperrter Speicher meldet den Fehler statt zu werfen', () => {
  const base = memoryStorage();
  let full = false;
  const storage = { ...base, setItem: (k, v) => { if (full) throw new Error('QuotaExceededError'); base.setItem(k, v); } };
  const { s } = store({ storage });
  const id = s.save(null, emptyDoc()).id;
  full = true;
  const res = s.save(id, ops.setTile(emptyDoc(), 10, 10, '#'));
  assert.equal(res.ok, false);
  assert.match(res.error, /Speicher/);
  assert.equal(s.load(id).tiles[10][10], '.', 'der alte Stand bleibt heil');
  // Nichts vorhanden / gar keine Funktionen: memoryStorage fängt das im Editor ab; hier nur der Vertrag
  assert.deepEqual(createDraftStore(memoryStorage()).list(), []);
});

test(`Entwürfe: höchstens ${MAX_DRAFTS}, ein bestehender lässt sich trotzdem speichern`, () => {
  const { s } = store();
  let lastId;
  for (let i = 0; i < MAX_DRAFTS; i++) lastId = s.save(null, emptyDoc()).id;
  const over = s.save(null, emptyDoc());
  assert.equal(over.ok, false);
  assert.match(over.error, /Höchstens/);
  assert.ok(s.save(lastId, emptyDoc()).ok);
});

// ── Vorschau-Welt ───────────────────────────────────────────────────────────

test('Vorschau: ein gültiges Dokument wird eine spielbare Welt ohne Meldungen', () => {
  const doc = ops.placeElement(emptyDoc(), 'spring', 20, 25).doc;
  const pv = buildPreview(doc);
  assert.ok(pv.world);
  assert.deepEqual(pv.issues, []);
  assert.equal(pv.startFixed, false);
  assert.equal(pv.world.elements.length, 1);
  stepWorld(pv.world, 0);
});

test('Vorschau: ohne Start wird für die Ansicht einer angenommen, mit zwei bleibt der erste', () => {
  const noStart = { ...emptyDoc(), tiles: emptyDoc().tiles.map((r) => r.replace('S', '.')) };
  const a = buildPreview(noStart);
  assert.ok(a.world && a.startFixed);

  const two = { ...emptyDoc(), tiles: emptyDoc().tiles.map((r) => r) };
  two.tiles[3] = `${two.tiles[3].slice(0, 5)}S${two.tiles[3].slice(6)}`;
  const b = buildPreview(two);
  assert.ok(b.world);
  assert.equal(b.map.start.ty, 3, 'der erste (oberste) Start zählt');
});

test('Vorschau: Unfertiges wird gemeldet und weggelassen, nicht geworfen', () => {
  const doc = emptyDoc();
  doc.elements = [
    { type: 'portal', tx: 10, ty: 10, id: 'a', pair: 'fehlt' },
    { type: 'saw', tx: 12, ty: 10, speed: 99999 },
    { type: 'spike', tx: 14, ty: 27 },
    { type: 'crumble', tx: 16, ty: 10 },
    { type: 'crystal', tx: 16, ty: 10 },
    { type: 'key', tx: 18, ty: 10 },
  ];
  const pv = buildPreview(doc);
  assert.ok(pv.world, pv.error);
  assert.deepEqual(pv.world.elements.map((e) => e.type).sort(), ['crumble', 'key']);
  const messages = pv.issues.map((i) => `${i.tx},${i.ty}`).sort();
  assert.deepEqual(messages, ['10,10', '12,10', '14,27', '16,10']);
});

test('Vorschau: zufällig zusammengebaute Dokumente führen nie zu einem Absturz', () => {
  let seed = 99;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const types = ['spike', 'saw', 'laser', 'fallingBlock', 'mover', 'crumble', 'spring', 'ring', 'crystal', 'wind', 'gravityZone', 'switch', 'colorBlock', 'key', 'door', 'portal'];
  let doc = emptyDoc();
  for (let i = 0; i < 300; i++) {
    doc = ops.placeElement(doc, types[rnd(types.length)], rnd(60), rnd(28)).doc;
    if (rnd(4) === 0) doc = ops.paintCells(doc, [[rnd(60), rnd(28)]], '#');
    const pv = buildPreview(doc);
    assert.ok(pv.map, `Schritt ${i}`);
    if (pv.world) stepWorld(pv.world, 2);
  }
});

test('Entwürfe: der Inhalts-Hash steht in der Liste; die Verifizierung ist ein Merker, der mit dem Entwurf verschwindet', () => {
  const { s: drafts, storage } = store();
  const id = drafts.save(null, emptyDoc(), 'a'.repeat(64)).id;
  assert.equal(drafts.list()[0].hash, 'a'.repeat(64));
  drafts.save(id, emptyDoc());
  assert.equal(drafts.list()[0].hash, null, 'ohne Angabe kein Hash (etwa bei ungültigem Level)');

  assert.equal(drafts.getVerification(id), null);
  drafts.setVerification(id, { hash: 'a'.repeat(64), ticks: 1234, deaths: 2, verifiedAt: 55 });
  assert.deepEqual(drafts.getVerification(id), { hash: 'a'.repeat(64), ticks: 1234, deaths: 2, verifiedAt: 55 });
  assert.equal(drafts.getVerification('anderer'), null);

  // Ein Merker ohne Zeit oder mit Unsinn zählt nicht
  storage.setItem(`srDraftVer:${id}`, JSON.stringify({ hash: 'x' }));
  assert.equal(drafts.getVerification(id), null);
  storage.setItem(`srDraftVer:${id}`, '{kaputt');
  assert.equal(drafts.getVerification(id), null);

  drafts.setVerification(id, { hash: 'b'.repeat(64), ticks: 99 });
  assert.equal(drafts.getVerification(id).deaths, 0);
  const copy = drafts.duplicate(id);
  assert.equal(drafts.getVerification(copy), null, 'eine Kopie ist nicht verifiziert');
  drafts.remove(id);
  assert.equal(drafts.getVerification(id), null, 'mit dem Entwurf verschwindet auch der Merker');
});

test('Entwürfe: ein voller Speicher beim Merken der Verifizierung wirft nicht', () => {
  const base = memoryStorage();
  const storage = { ...base, setItem: (k, v) => { if (k.startsWith('srDraftVer:')) throw new Error('Quota'); base.setItem(k, v); } };
  const { s: drafts } = store({ storage });
  const id = drafts.save(null, emptyDoc()).id;
  drafts.setVerification(id, { hash: 'a'.repeat(64), ticks: 10 });
  assert.equal(drafts.getVerification(id), null);
});

test('Entwürfe: der Veröffentlicht-Merker gehört zum Entwurf, überlebt Änderungen und verschwindet mit ihm', () => {
  const { s: drafts, storage } = store({ start: 500 });
  const id = drafts.save(null, emptyDoc()).id;
  assert.equal(drafts.getPublished(id), null);

  drafts.setPublished(id, { code: 'SR-7K2-QX9', hash: 'a'.repeat(64), publishedAt: 77 });
  assert.deepEqual(drafts.getPublished(id), { code: 'SR-7K2-QX9', hash: 'a'.repeat(64), publishedAt: 77 });
  assert.equal(drafts.getPublished('anderer'), null);

  // Weiterbauen ändert den Merker nicht: Die veröffentlichte Fassung bleibt, wie sie ist
  drafts.save(id, { ...emptyDoc(), width: 70 });
  assert.equal(drafts.getPublished(id).code, 'SR-7K2-QX9');
  // Ohne Zeitangabe wird die aktuelle gesetzt
  drafts.setPublished(id, { code: 'SR-AAA-BBB', hash: 'b'.repeat(64) });
  assert.ok(Number.isInteger(drafts.getPublished(id).publishedAt));

  // Kaputtes und Unvollständiges zählt nicht
  storage.setItem(`srDraftPub:${id}`, JSON.stringify({ code: 'SR-AAA-BBB' }));
  assert.equal(drafts.getPublished(id), null);
  storage.setItem(`srDraftPub:${id}`, '{kaputt');
  assert.equal(drafts.getPublished(id), null);

  drafts.setPublished(id, { code: 'SR-AAA-BBB', hash: 'b'.repeat(64) });
  assert.equal(drafts.getPublished(drafts.duplicate(id)), null, 'eine Kopie ist nicht veröffentlicht');
  drafts.remove(id);
  assert.equal(drafts.getPublished(id), null, 'mit dem Entwurf verschwindet auch der Merker');
});

test('Entwürfe: ein voller Speicher beim Merken der Veröffentlichung wirft nicht', () => {
  const base = memoryStorage();
  const storage = { ...base, setItem: (k, v) => { if (k.startsWith('srDraftPub:')) throw new Error('Quota'); base.setItem(k, v); } };
  const { s: drafts } = store({ storage });
  const id = drafts.save(null, emptyDoc()).id;
  drafts.setPublished(id, { code: 'SR-AAA-BBB', hash: 'a'.repeat(64) });
  assert.equal(drafts.getPublished(id), null);
});
