// Operationen des Editors: Kacheln, Elemente, Bereiche, Spiegeln, Größe. Jede Operation muss das Dokument
// unverändert lassen (rein), und danach soll es gültig bleiben, wo immer die Regeln das versprechen.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as ops from '../ops.js';
import { emptyDoc, validateDocForTest } from './helpers.js';
import { lineCells, normRect } from '../geometry.js';

const FLOOR = 25; // emptyDoc(60×30): Start bei (2|25), Boden ab Zeile 26; freie Zeilen 0–25

test('lineCells: lückenlos, beide Enden, in jede Richtung', () => {
  const cells = lineCells(0, 0, 5, 2);
  assert.deepEqual(cells[0], [0, 0]);
  assert.deepEqual(cells[cells.length - 1], [5, 2]);
  for (let i = 1; i < cells.length; i++) {
    assert.ok(Math.abs(cells[i][0] - cells[i - 1][0]) <= 1 && Math.abs(cells[i][1] - cells[i - 1][1]) <= 1);
  }
  assert.deepEqual(lineCells(3, 3, 3, 3), [[3, 3]]);
  assert.deepEqual(lineCells(4, 0, 0, 0).map((c) => c[0]), [4, 3, 2, 1, 0]);
  assert.deepEqual(normRect({ x: 5, y: 1 }, { x: 2, y: 4 }), { x0: 2, y0: 1, x1: 5, y1: 4 });
});

test('Operationen verändern das Eingabe-Dokument nie', () => {
  const doc = emptyDoc();
  const snapshot = JSON.stringify(doc);
  ops.setTile(doc, 10, 10, '#');
  ops.fillRect(doc, { x0: 5, y0: 5, x1: 9, y1: 9 }, '#');
  ops.placeElement(doc, 'spring', 10, FLOOR);
  ops.eraseAt(doc, 10, 27);
  ops.resizeDoc(doc, 70, 40);
  ops.mirrorRegion(doc, { x0: 0, y0: 20, x1: 30, y1: 29 }, 'h');
  assert.equal(JSON.stringify(doc), snapshot);
});

test('setTile: ändert eine Kachel, außerhalb und ohne Änderung bleibt dasselbe Dokument', () => {
  const doc = emptyDoc();
  const a = ops.setTile(doc, 10, 10, '#');
  assert.equal(ops.tileAt(a, 10, 10), '#');
  assert.equal(ops.setTile(a, 10, 10, '#'), a, 'gleiche Kachel: dasselbe Dokument');
  assert.equal(ops.setTile(doc, -1, 5, '#'), doc);
  assert.equal(ops.setTile(doc, 60, 5, '#'), doc);
  assert.equal(ops.setTile(doc, 5, 5, 'x'), doc, 'unbekanntes Zeichen wird nicht geschrieben');
});

test('Start: ein neuer versetzt den alten; überschreiben, radieren und Bereichs-Löschen lassen ihn stehen', () => {
  const doc = emptyDoc();
  const moved = ops.setTile(doc, 10, FLOOR, 'S');
  assert.equal(ops.tileAt(moved, 10, FLOOR), 'S');
  assert.equal(ops.tileAt(moved, 2, FLOOR), '.', 'der alte ist weg');
  assert.equal(moved.tiles.join('').split('S').length - 1, 1, 'genau ein Start');

  assert.equal(ops.tileAt(ops.setTile(doc, 2, FLOOR, '#'), 2, FLOOR), 'S', 'überschreiben geht nicht');
  assert.equal(ops.tileAt(ops.fillRect(doc, { x0: 0, y0: 20, x1: 20, y1: 29 }, '#'), 2, FLOOR), 'S');
  assert.equal(ops.tileAt(ops.eraseAt(doc, 2, FLOOR), 2, FLOOR), 'S');
  assert.equal(ops.tileAt(ops.clearRegion(doc, { x0: 0, y0: 20, x1: 20, y1: 29 }), 2, FLOOR), 'S');
  assert.equal(ops.tileAt(ops.fillRect(doc, { x0: 5, y0: 3, x1: 9, y1: 7 }, 'S'), 5, 3), 'S', 'Rechteck mit S = eine Kachel links oben');
  assert.equal(validateDocForTest(moved).ok, true);
});

test('Ein fester Block entfernt Elemente, die Luft brauchen; Zonen und Laser bleiben', () => {
  let doc = emptyDoc();
  doc = ops.placeElement(doc, 'spike', 10, FLOOR).doc;
  doc = ops.placeElement(doc, 'wind', 20, 10).doc;
  doc = ops.placeElement(doc, 'laser', 30, 10).doc;
  doc = ops.placeElement(doc, 'laser', 32, 10).doc;

  const blocked = ops.paintCells(doc, [[10, FLOOR], [20, 10], [30, 10], [32, 10]], '#');
  assert.equal(ops.elementAt(blocked, 10, FLOOR), null, 'Spikes weg');
  assert.ok(ops.elementAt(blocked, 20, 10), 'Windzone bleibt');
  assert.ok(ops.elementAt(blocked, 30, 10), 'Laser im Block bleibt');
  const ice = ops.setTile(doc, 32, 10, 'I');
  assert.equal(ops.elementAt(ice, 32, 10), null, 'Laser auf Eis geht nicht');
});

test('fillRect füllt, klemmt am Rand und ignoriert ein Rechteck außerhalb', () => {
  const doc = emptyDoc();
  const filled = ops.fillRect(doc, { x0: 10, y0: 5, x1: 12, y1: 6 }, '#');
  for (const [x, y] of [[10, 5], [12, 6], [11, 5]]) assert.equal(ops.tileAt(filled, x, y), '#');
  assert.equal(ops.tileAt(filled, 13, 5), '.');
  const edge = ops.fillRect(doc, { x0: 55, y0: 0, x1: 70, y1: 1 }, '#');
  assert.equal(ops.tileAt(edge, 59, 1), '#');
  assert.equal(ops.fillRect(doc, { x0: 100, y0: 0, x1: 110, y1: 3 }, '#'), doc);
});

test('Element setzen: Standardwerte, Regeln für den Anker, Ersetzen', () => {
  let doc = emptyDoc();
  const r = ops.placeElement(doc, 'saw', 10, 10);
  assert.ok(r.element && !r.error);
  assert.equal(r.element.radius, 7);
  doc = r.doc;

  assert.match(ops.placeElement(doc, 'spike', 10, 27).error, /nicht frei/);
  assert.match(ops.placeElement(doc, 'spike', 60, 5).error, /Außerhalb/);
  assert.match(ops.placeElement(doc, 'bomb', 5, 5).error, /Unbekannt/);
  const onIce = ops.setTile(doc, 20, 10, 'I');
  assert.match(ops.placeElement(onIce, 'laser', 20, 10).error, /Laser/, 'auf Eis geht kein Laser');
  assert.ok(ops.placeElement(doc, 'laser', 20, 27).element, 'in einem festen Block schon');
});

test('Element setzen: der Laser darf in einem festen Block sitzen', () => {
  let doc = ops.setTile(emptyDoc(), 10, 10, '#');
  const res = ops.placeElement(doc, 'laser', 10, 10);
  assert.ok(res.element, res.error);
  doc = res.doc;
  assert.equal(validateDocForTest(doc).ok, true);
});

test('Ein Element auf derselben Kachel ersetzt das alte, ohne Dopplung', () => {
  let doc = ops.placeElement(emptyDoc(), 'crumble', 10, 10).doc;
  doc = ops.placeElement(doc, 'crystal', 10, 10).doc;
  assert.equal(doc.elements.length, 1);
  assert.equal(doc.elements[0].type, 'crystal');
});

test('Spikes bekommen die Ausrichtung des Blocks, an dem sie sitzen', () => {
  let doc = ops.fillRect(emptyDoc(), { x0: 20, y0: 10, x1: 25, y1: 10 }, '#');
  assert.equal(ops.placeElement(doc, 'spike', 22, 9).element.dir, 'up', 'auf dem Boden');
  assert.equal(ops.placeElement(doc, 'spike', 22, 11).element.dir, 'down', 'an der Decke');
  doc = ops.fillRect(doc, { x0: 30, y0: 5, x1: 30, y1: 15 }, '#');
  assert.equal(ops.placeElement(doc, 'spike', 31, 8).element.dir, 'right', 'an einer linken Wand');
  assert.equal(ops.placeElement(doc, 'spike', 29, 8).element.dir, 'left', 'an einer rechten Wand');
  assert.equal(ops.placeElement(doc, 'spike', 45, 5).element.dir, 'up', 'frei in der Luft: nach oben');
});

test('Elemente bleiben nach Sortierung kanonisch und das Dokument gültig', () => {
  let doc = emptyDoc();
  for (const [type, x, y] of [['spring', 30, FLOOR], ['saw', 10, 5], ['crumble', 20, 5], ['key', 5, 12], ['mover', 40, 15], ['gravityZone', 45, 3]]) {
    doc = ops.placeElement(doc, type, x, y).doc;
  }
  const keys = doc.elements.map((e) => [e.ty, e.tx]);
  assert.deepEqual(keys, [...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  assert.equal(validateDocForTest(doc).ok, true);
});

test('Portale: nur als Paar, Löschen und Radieren nimmt den Partner mit', () => {
  let doc = emptyDoc();
  const a = ops.placeElement(doc, 'portal', 10, 10);
  assert.deepEqual([a.element.id, a.element.pair], ['p1', 'p1b']);
  doc = a.doc;
  const b = ops.placeElement(doc, 'portal', 30, 10, { id: a.element.pair, pair: a.element.id });
  doc = b.doc;
  assert.equal(validateDocForTest(doc).ok, true);
  assert.deepEqual(ops.nextPortalIds(doc), { id: 'p2', pair: 'p2b' });

  assert.equal(ops.removeElement(doc, 10, 10).elements.length, 0);
  assert.equal(ops.eraseAt(doc, 30, 10).elements.length, 0);
  assert.equal(ops.setTile(doc, 10, 10, '#').elements.length, 0, 'ein Block auf einem Portal nimmt beide weg');
});

test('updateElement: setzt und löscht Angaben; die Säge kennt nur eine Bewegungsart', () => {
  let doc = ops.placeElement(emptyDoc(), 'saw', 10, 10).doc;
  doc = ops.updateElement(doc, 10, 10, { path: [[0, 0], [5, 0]], speed: 80 });
  assert.deepEqual(ops.elementAt(doc, 10, 10).path, [[0, 0], [5, 0]]);
  doc = ops.updateElement(doc, 10, 10, { orbit: 3 });
  const saw = ops.elementAt(doc, 10, 10);
  assert.equal(saw.orbit, 3);
  assert.equal(saw.path, undefined, 'Kreisbahn ersetzt den Pfad');
  doc = ops.updateElement(doc, 10, 10, { orbit: undefined });
  assert.equal('orbit' in ops.elementAt(doc, 10, 10), false);
  assert.equal(ops.updateElement(doc, 50, 5, { speed: 1 }), doc, 'kein Element: unverändert');
});

test('Pfade: Anfang bei 0|0, höchstens 16 Punkte, Kreisbahn wird geschlossen und wieder geöffnet', () => {
  assert.deepEqual(ops.normalizePath([[3, 3], [4, 0]], 'pingpong')[0], [0, 0]);
  const long = Array.from({ length: 30 }, (_, i) => [i, 0]);
  assert.equal(ops.normalizePath(long, 'pingpong').length, 16);
  const loop = ops.normalizePath(long, 'loop');
  assert.ok(loop.length <= 16);
  assert.deepEqual(loop[loop.length - 1], [0, 0], 'geschlossen');

  let doc = ops.placeElement(emptyDoc(), 'mover', 10, 10).doc;
  doc = ops.updateElement(doc, 10, 10, { mode: 'loop' });
  const closed = ops.elementAt(doc, 10, 10).path;
  assert.deepEqual(closed[closed.length - 1], [0, 0]);
  assert.equal(validateDocForTest(doc).ok, true);
  doc = ops.updateElement(doc, 10, 10, { mode: 'pingpong' });
  assert.equal(validateDocForTest(doc).ok, true, 'wieder offen und gültig');

  doc = ops.setPath(doc, 10, 10, [[9, 9], [4, 0], [4, 4]]);
  assert.deepEqual(ops.elementAt(doc, 10, 10).path[0], [0, 0]);
  const noPath = ops.placeElement(emptyDoc(), 'spring', 10, FLOOR).doc;
  assert.equal(ops.setPath(noPath, 10, FLOOR, [[0, 0], [1, 1]]), noPath, 'ein Element ohne Pfad bleibt unverändert');
});

test('hitElement: Anker zuerst, dann Flächen von Zonen, Plattformen und breiten Blöcken', () => {
  let doc = emptyDoc();
  doc = ops.placeElement(doc, 'wind', 10, 5, { w: 6, h: 4 }).doc;
  doc = ops.placeElement(doc, 'mover', 30, 8, { width: 4 }).doc;
  doc = ops.placeElement(doc, 'spike', 12, 6).doc;
  assert.equal(ops.hitElement(doc, 12, 6).type, 'spike', 'Anker vor Fläche');
  assert.equal(ops.hitElement(doc, 13, 7).type, 'wind');
  assert.equal(ops.hitElement(doc, 15, 8).type, 'wind', 'rechte untere Ecke der Zone (x 10–15, y 5–8)');
  assert.equal(ops.hitElement(doc, 16, 8), null);
  assert.equal(ops.hitElement(doc, 33, 8).type, 'mover');
  assert.equal(ops.hitElement(doc, 34, 8), null);
});

// Rückmeldung vom 24.09.2026: "Sägen die sich im Kreis um einen Block bewegen kann man nicht mehr die Säge
// auswählen." Ursache: Die Vorschau zeichnet eine Kreisbahn-Säge bei Radius ≥ 1 (das Schema erzwingt das)
// NIE auf ihrer Ankerkachel — elementAt() kennt aber nur die Ankerkachel. Ein Klick auf die sichtbare Säge traf
// deshalb ins Leere. hitElement() erkennt die tatsächlich gezeichnete Kachel jetzt zusätzlich.
test('hitElement: eine Säge auf Kreisbahn ist auf ihrer sichtbaren Stelle klickbar, nicht nur auf dem (leeren) Anker', () => {
  let doc = ops.placeElement(emptyDoc(), 'saw', 20, 10, { orbit: 3, phase: 0 }).doc;
  const saw = doc.elements[0];
  assert.equal(ops.hitElement(doc, 20, 10), saw, 'die Ankerkachel bleibt klickbar (Dokument-Anker, auch wenn dort nichts gezeichnet wird)');
  assert.equal(ops.hitElement(doc, 23, 10), saw, 'NEU: phase 0 zeichnet die Säge `orbit` Kacheln rechts vom Anker — jetzt auch dort klickbar');
  // Eine STEHENDE Säge (kein orbit/path) bleibt weiterhin nur auf ihrem Anker klickbar
  const stillDoc = ops.placeElement(emptyDoc(), 'saw', 20, 10).doc;
  assert.equal(ops.hitElement(stillDoc, 23, 10), null);
  assert.equal(ops.hitElement(stillDoc, 20, 10), stillDoc.elements[0]);
});

test('Kopieren und Einfügen: Kacheln und Elemente kommen mit, der Start nie, Portale nur als Paar', () => {
  let doc = ops.fillRect(emptyDoc(), { x0: 20, y0: 20, x1: 24, y1: 21 }, '#');
  doc = ops.placeElement(doc, 'spike', 21, 19).doc;
  doc = ops.placeElement(doc, 'portal', 20, 10).doc;      // p1
  doc = ops.placeElement(doc, 'portal', 40, 10, { id: 'p1b', pair: 'p1' }).doc;

  const clip = ops.copyRegion(doc, { x0: 20, y0: 18, x1: 24, y1: 21 });
  assert.deepEqual([clip.w, clip.h], [5, 4]);
  assert.equal(clip.elements.length, 1);
  assert.deepEqual([clip.elements[0].tx, clip.elements[0].ty], [1, 1], 'relativ zur Ecke');
  assert.equal(ops.copyRegion(doc, { x0: 20, y0: 5, x1: 22, y1: 12 }).elements.length, 0, 'halbes Paar bleibt draußen');
  assert.equal(ops.copyRegion(doc, { x0: 20, y0: 5, x1: 41, y1: 12 }).elements.length, 2, 'ganzes Paar kommt mit');

  const around = ops.copyRegion(doc, { x0: 0, y0: 24, x1: 8, y1: 27 });
  assert.ok(!around.tiles.join('').includes('S'), 'der Start wird nicht kopiert');

  const pasted = ops.pasteRegion(doc, clip, 30, 10);
  assert.equal(ops.tileAt(pasted, 30, 12), '#');
  assert.equal(ops.tileAt(pasted, 34, 13), '#');
  assert.equal(ops.elementAt(pasted, 31, 11).type, 'spike');
  assert.equal(pasted.elements.length, doc.elements.length + 1);

  // Ein eingefügtes Portalpaar bekommt frische Kennungen
  const pairClip = ops.copyRegion(doc, { x0: 20, y0: 5, x1: 41, y1: 12 });
  const twice = ops.pasteRegion(doc, pairClip, 20, 0);
  const ids = twice.elements.filter((e) => e.type === 'portal').map((e) => e.id);
  assert.equal(new Set(ids).size, 4, 'vier verschiedene Kennungen');
  assert.equal(validateDocForTest(twice).ok, true);
});

test('Einfügen: außerhalb des Levels fällt weg, ein abgeschnittenes Portalpaar auch', () => {
  let doc = ops.placeElement(emptyDoc(), 'portal', 5, 10).doc;
  doc = ops.placeElement(doc, 'portal', 8, 10, { id: 'p1b', pair: 'p1' }).doc;
  const clip = ops.copyRegion(doc, { x0: 5, y0: 10, x1: 8, y1: 10 });
  const cut = ops.pasteRegion(emptyDoc(), clip, 57, 10);
  assert.equal(cut.elements.length, 0, 'das zweite Portal läge außerhalb: beide weg');
  assert.equal(validateDocForTest(cut).ok, true);
});

test('Verschieben: Inhalt wandert samt Elementen, Portal-Kennungen bleiben, der Start bleibt', () => {
  let doc = ops.fillRect(emptyDoc(), { x0: 20, y0: 15, x1: 22, y1: 15 }, '#');
  doc = ops.placeElement(doc, 'portal', 20, 10).doc;
  doc = ops.placeElement(doc, 'portal', 30, 10, { id: 'p1b', pair: 'p1' }).doc;
  const moved = ops.moveRegion(doc, { x0: 19, y0: 9, x1: 31, y1: 16 }, 5, 3);
  assert.equal(ops.tileAt(moved, 25, 18), '#');
  assert.equal(ops.tileAt(moved, 20, 15), '.');
  assert.deepEqual(moved.elements.map((e) => [e.id, e.tx, e.ty]).sort(), [['p1', 25, 13], ['p1b', 35, 13]]);
  assert.equal(ops.tileAt(moved, 2, FLOOR), 'S');
  assert.equal(validateDocForTest(moved).ok, true);
  assert.equal(ops.moveRegion(doc, { x0: 19, y0: 9, x1: 31, y1: 16 }, 0, 0), doc);
});

// Rückmeldung vom 24.09.2026: "Man kann Portale nicht verschieben ... wird automatisch despawned." Ursache:
// copyRegion()/clearRegion() verwarfen ein Portal serienmäßig als "verwaist", sobald sein Partner nicht IM
// SELBEN Bereich lag — richtig für echtes Ausschneiden/Löschen, aber falsch für moveRegion(), wo der Partner
// einfach unverschoben stehen bleibt. Zieht man nur EIN Ende, liegt der Partner per Definition außerhalb.
test('Verschieben nur EINES Portal-Endes lässt das Paar bestehen (der Partner bleibt unverschoben stehen)', () => {
  let doc = ops.placeElement(emptyDoc(), 'portal', 10, 10).doc;
  doc = ops.placeElement(doc, 'portal', 40, 10, { id: 'p1b', pair: 'p1' }).doc;
  const moved = ops.moveRegion(doc, { x0: 10, y0: 10, x1: 10, y1: 10 }, 5, 4);
  assert.deepEqual(moved.elements.map((e) => [e.id, e.tx, e.ty]).sort(), [['p1', 15, 14], ['p1b', 40, 10]]);
  assert.equal(validateDocForTest(moved).ok, true);
  // Ein zweiter Zug (das verschobene Ende erneut bewegen) muss das Paar ebenso erhalten
  const moved2 = ops.moveRegion(moved, { x0: 15, y0: 14, x1: 15, y1: 14 }, -3, 0);
  assert.deepEqual(moved2.elements.map((e) => [e.id, e.tx, e.ty]).sort(), [['p1', 12, 14], ['p1b', 40, 10]]);
});

test('Spiegeln: Kacheln, Förderband-Richtung, Pfade, Richtungen und Wind wechseln die Seite', () => {
  let doc = emptyDoc();
  doc = ops.fillRect(doc, { x0: 10, y0: 20, x1: 12, y1: 20 }, '>');
  doc = ops.setTile(doc, 13, 20, '#');
  doc = ops.placeElement(doc, 'saw', 11, 10, { path: [[0, 0], [4, 2]] }).doc;
  doc = ops.placeElement(doc, 'ring', 10, 8, { dir: 'upRight' }).doc;
  doc = ops.placeElement(doc, 'wind', 12, 4, { w: 3, h: 2, ax: 300 }).doc;
  doc = ops.placeElement(doc, 'mover', 10, 12, { width: 3 }).doc;

  const region = { x0: 10, y0: 4, x1: 15, y1: 21 };
  const m = ops.mirrorRegion(doc, region, 'h');
  assert.equal(ops.tileAt(m, 15, 20), '<', 'Band ←');
  assert.equal(ops.tileAt(m, 12, 20), '#', 'Block spiegelt mit');
  const saw = ops.elementAt(m, 14, 10);
  assert.deepEqual(saw.path, [[0, 0], [-4, 2]]);
  assert.equal(ops.elementAt(m, 15, 8).dir, 'upLeft');
  const wind = m.elements.find((e) => e.type === 'wind');
  assert.equal(wind.ax, -300);
  assert.equal(wind.tx, 11, 'Zone x 12–14 im Bereich 10–15 wird zu x 11–13');
  const mover = m.elements.find((e) => e.type === 'mover');
  assert.equal(mover.tx, 13, 'breite Plattform: Kante nach der Spiegelung');
  assert.equal(validateDocForTest(m).ok, true);

  const back = ops.mirrorRegion(m, region, 'h');
  assert.deepEqual(back.tiles, doc.tiles, 'zweimal spiegeln = Ausgangszustand');
  assert.deepEqual(back.elements, doc.elements);
});

test('Senkrecht spiegeln: Richtungen oben↔unten, Sprungpads behalten ihre Richtung', () => {
  let doc = ops.placeElement(emptyDoc(), 'ring', 10, 5, { dir: 'up' }).doc;
  doc = ops.placeElement(doc, 'spring', 12, 5, { dir: 'upLeft' }).doc;
  doc = ops.placeElement(doc, 'wind', 14, 2, { w: 2, h: 3, ay: -900 }).doc;
  const m = ops.mirrorRegion(doc, { x0: 8, y0: 1, x1: 20, y1: 8 }, 'v');
  assert.equal(m.elements.find((e) => e.type === 'ring').dir, 'down');
  assert.equal(m.elements.find((e) => e.type === 'spring').dir, 'upLeft');
  assert.equal(m.elements.find((e) => e.type === 'wind').ay, 900);
  assert.equal(m.elements.find((e) => e.type === 'ring').ty, 4, 'Zeile 5 in 1..8 wird 4');
});

test('Größe ändern: Inhalt bleibt auf der gewählten Seite, Elemente ziehen mit, Außerhalb fällt weg', () => {
  let doc = ops.placeElement(emptyDoc(), 'crumble', 10, 10).doc;
  doc = ops.placeElement(doc, 'crumble', 55, 10).doc;
  const wider = ops.resizeDoc(doc, 80, 30);
  assert.equal(wider.width, 80);
  assert.equal(ops.tileAt(wider, 2, FLOOR), 'S');
  const shifted = ops.resizeDoc(doc, 80, 30, { alignX: 'right' });
  assert.equal(ops.tileAt(shifted, 22, FLOOR), 'S', 'Inhalt nach rechts');
  assert.ok(ops.elementAt(shifted, 30, 10));

  const taller = ops.resizeDoc(doc, 60, 40);
  assert.equal(ops.tileAt(taller, 2, FLOOR + 10), 'S', 'unten bleibt unten');
  assert.ok(ops.elementAt(taller, 10, 20));
  const top = ops.resizeDoc(doc, 60, 40, { alignY: 'top' });
  assert.equal(ops.tileAt(top, 2, FLOOR), 'S');

  const narrower = ops.resizeDoc(doc, 30, 30);
  assert.equal(narrower.elements.length, 1, 'das Element bei 55 fällt weg');
  assert.equal(validateDocForTest(narrower).ok, false, 'das Ziel liegt außerhalb → ungültig, aber kein Absturz');
  assert.equal(ops.resizeDoc(doc, 5, 5).width, 12, 'Mindestgröße');
  assert.equal(ops.resizeDoc(doc, 9999, 9999).height, 160, 'Höchstgröße');
  assert.equal(ops.resizeDoc(doc, 60, 30), doc, 'keine Änderung: dasselbe Dokument');
});

// Rückmeldung vom 25.09.2026: bei einem Turm-Level respawnte ein tieferer Checkpoint, obwohl der Spieler
// längst einen höheren erreicht hatte — sim/tilemap.js sortierte Checkpoints nach Position (tx), was bei
// einem senkrechten Level die falsche Achse ist. Fix: eine explizite Nummer je Checkpoint, hier geprüft,
// dass sie bei jeder Editor-Operation an ihrer Kachel "klebt".
test('Checkpoint-Nummer: setzen/löschen, wandert bei Kopieren/Einfügen/Verschieben/Spiegeln/Größe ändern mit, verfällt beim Überschreiben der Kachel', () => {
  let doc = ops.setTile(emptyDoc(), 10, 10, 'C');
  assert.equal(ops.getCheckpointOrder(doc, 10, 10), undefined);
  assert.equal(ops.setCheckpointOrder(doc, 11, 10, 1), doc, 'nur auf einer Checkpoint-Kachel wirksam');
  doc = ops.setCheckpointOrder(doc, 10, 10, 3);
  assert.equal(ops.getCheckpointOrder(doc, 10, 10), 3);

  // Kopieren: die Nummer kommt mit, relativ zur Ecke des Ausschnitts
  const clip = ops.copyRegion(doc, { x0: 9, y0: 9, x1: 11, y1: 11 });
  assert.deepEqual(clip.checkpointOrder, [{ tx: 1, ty: 1, order: 3 }]);

  // Einfügen an neuer Stelle setzt die Nummer dort
  const pasted = ops.pasteRegion(emptyDoc(), clip, 20, 20);
  assert.equal(ops.getCheckpointOrder(pasted, 21, 21), 3);

  // Verschieben nimmt sie ebenso mit (weg von der alten Stelle)
  const moved = ops.moveRegion(doc, { x0: 10, y0: 10, x1: 10, y1: 10 }, 5, 0);
  assert.equal(ops.getCheckpointOrder(moved, 15, 10), 3);
  assert.equal(ops.getCheckpointOrder(moved, 10, 10), undefined);

  // Spiegeln (horizontal) folgt der gespiegelten Kachel
  let wide = ops.setCheckpointOrder(ops.setTile(emptyDoc(), 5, 10, 'C'), 5, 10, 7);
  const mirrored = ops.mirrorRegion(wide, { x0: 0, y0: 10, x1: 9, y1: 10 }, 'h');
  assert.equal(ops.getCheckpointOrder(mirrored, 4, 10), 7);
  assert.equal(ops.getCheckpointOrder(mirrored, 5, 10), undefined);

  // Größe ändern (rechtsbündig) verschiebt sie mit dem Inhalt
  const resized = ops.resizeDoc(doc, 70, 30, { alignX: 'right' });
  assert.equal(ops.getCheckpointOrder(resized, 20, 10), 3);

  // Die Kachel überschreiben lässt die Nummer verfallen, nicht liegen bleiben
  const overwritten = ops.setTile(doc, 10, 10, '.');
  assert.equal((overwritten.checkpointOrder || []).length, 0);
});

test('Dokumente bleiben nach zufälligen Operationen gültig oder scheitern nur an fehlendem Ziel/Portalen', () => {
  // Ein einfacher, deterministischer Zufallsgenerator (kein Math.random: der Test soll wiederholbar sein)
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let doc = emptyDoc();
  const types = ['spike', 'saw', 'laser', 'fallingBlock', 'mover', 'crumble', 'spring', 'ring', 'crystal', 'wind', 'gravityZone', 'switch', 'colorBlock', 'key', 'door', 'portal'];
  for (let i = 0; i < 400; i++) {
    const x = rnd(60);
    const y = rnd(28);
    switch (rnd(6)) {
      case 0: doc = ops.paintCells(doc, [[x, y], [x + 1, y]], '#'); break;
      case 1: doc = ops.placeElement(doc, types[rnd(types.length)], x, y).doc; break;
      case 2: doc = ops.eraseAt(doc, x, y); break;
      case 3: doc = ops.fillRect(doc, { x0: x, y0: y, x1: x + rnd(5), y1: y + rnd(3) }, '#I>'[rnd(3)]); break;
      case 4: doc = ops.moveRegion(doc, { x0: x, y0: y, x1: x + rnd(8), y1: y + rnd(6) }, rnd(9) - 4, rnd(7) - 3); break;
      default: doc = ops.mirrorRegion(doc, { x0: x, y0: y, x1: x + rnd(10), y1: y + rnd(8) }, rnd(2) ? 'h' : 'v');
    }
    const res = validateDocForTest(doc);
    if (!res.ok) {
      const allowed = res.errors.every((e) => /Portal|Partner|nicht aufeinander|doppelt/.test(e));
      assert.ok(allowed, `Schritt ${i}: ${res.errors.join(' | ')}`);
    }
  }
});

test('Pfadpunkte: anhängen, verschieben, entfernen — mit den Grenzen des Schemas', () => {
  let doc = ops.placeElement(emptyDoc(), 'saw', 10, 10, { path: [[0, 0], [4, 0]] }).doc;
  doc = ops.addPathPoint(doc, 10, 10, 14, 13);
  assert.deepEqual(ops.elementAt(doc, 10, 10).path, [[0, 0], [4, 0], [4, 3]], 'Klick auf Kachel 14|13 = Versatz 4|3');
  doc = ops.movePathPoint(doc, 10, 10, 2, 8, 10);
  assert.deepEqual(ops.elementAt(doc, 10, 10).path[2], [-2, 0]);
  assert.equal(ops.movePathPoint(doc, 10, 10, 0, 20, 20), doc, 'der erste Punkt bleibt am Element');
  assert.equal(ops.movePathPoint(doc, 10, 10, 9, 20, 20), doc, 'Punkt gibt es nicht');
  doc = ops.removePathPoint(doc, 10, 10, 2);
  assert.equal(ops.elementAt(doc, 10, 10).path.length, 2);
  assert.equal(ops.removePathPoint(doc, 10, 10, 1), doc, 'zwei Punkte müssen bleiben');
  assert.equal(ops.removePathPoint(doc, 10, 10, 0), doc, 'der erste bleibt');

  for (let i = 0; i < 30; i++) doc = ops.addPathPoint(doc, 10, 10, 11 + (i % 20), 11);
  assert.equal(ops.elementAt(doc, 10, 10).path.length, 16, 'höchstens 16 Punkte');
  assert.equal(validateDocForTest(doc).ok, true);
  assert.equal(ops.addPathPoint(emptyDoc(), 10, 10, 5, 5).elements.length, 0, 'ohne Element passiert nichts');
});

test('Pfadpunkte bei einer Kreisbahn: der Schlusspunkt bleibt, neue Punkte kommen davor', () => {
  let doc = ops.placeElement(emptyDoc(), 'mover', 10, 10, { mode: 'loop', path: [[0, 0], [3, 0], [3, 3], [0, 0]] }).doc;
  doc = ops.addPathPoint(doc, 10, 10, 10, 13);
  const path = ops.elementAt(doc, 10, 10).path;
  assert.deepEqual(path, [[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]]);
  assert.equal(ops.movePathPoint(doc, 10, 10, path.length - 1, 20, 20), doc, 'Schlusspunkt nicht verschiebbar');
  doc = ops.removePathPoint(doc, 10, 10, 3);
  assert.equal(ops.elementAt(doc, 10, 10).path.length, 4);
  assert.equal(validateDocForTest(doc).ok, true);
  const minimal = ops.placeElement(emptyDoc(), 'mover', 10, 10, { mode: 'loop', path: [[0, 0], [3, 0], [0, 0]] }).doc;
  assert.equal(ops.removePathPoint(minimal, 10, 10, 1), minimal, 'eine Kreisbahn braucht mindestens einen Punkt zwischen Anfang und Schluss');
});
