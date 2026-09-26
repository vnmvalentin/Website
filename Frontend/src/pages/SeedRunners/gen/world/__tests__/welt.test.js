// Tests der Welttyp-Architektur (Phase A des Umbaus, siehe gen/PLANUNG_WELTTYPEN.md).
//
// Die Zusage dieser Phase: Ein Welttyp ist eine Datei, die einen Vertrag erfüllt — und die
// gemeinsamen Regeln gelten für ALLE, nicht je Welttyp neu. Die wichtigste davon ist die sichere,
// ebene Startplattform.

import test from 'node:test';
import assert from 'node:assert/strict';
import { pruefeWelttyp, forderVertrag } from '../vertrag.js';
import { WELTTYPEN, WELTTYP_IDS, waehleWelttyp } from '../registry.js';
import { setzeStartplattform, pruefeStart, ebneFlaeche, START_BREITE } from '../gemeinsam/plattform.js';
import { neuesRaster } from '../gemeinsam/raster.js';
import { generateWorld, WORLD_VERSION, normalizeParams } from '../generate.js';
// Fähigkeitsbewusst (nicht direkt aus v2/reachability.js!): Seit die Registry mehr als „Höhlen"
// enthält, kann `generateWorld()` OHNE erzwungenen worldType auch Welttypen mit Mover- oder
// Grapple-Brücken liefern — ein Check ohne deren Fähigkeiten hielte jede solche Brücke für eine
// tote Zone, obwohl sie es nicht ist.
import { checkLevel } from '../reichweite/graph.js';
import { createLevelWorld } from '../../../sim/levelWorld.js';
import { parseMap, rectHitsSolid } from '../../../sim/tilemap.js';
import { TILE } from '../../../sim/config.js';
import { LIMITS } from '../../../level/limits.js';

const gueltigerTyp = () => ({
  id: 'probe', label: 'Probe', beschreibung: 'nur für den Test',
  kamera: 'horizontal', achse: 'x', grundstoff: 'fels',
  faehigkeiten: ['boden'], palette: { haupt: ['spike'], neben: [], verboten: [] },
  biome: ['cave'], baue: () => ({}),
});

// ── Vertrag ─────────────────────────────────────────────────────────────────

test('Vertrag: ein gültiger Welttyp geht durch', () => {
  assert.deepEqual(pruefeWelttyp(gueltigerTyp()), []);
});

test('Vertrag: fehlende Pflichtfelder werden einzeln benannt', () => {
  const typ = gueltigerTyp();
  delete typ.kamera;
  delete typ.palette;
  const fehler = pruefeWelttyp(typ);
  assert.ok(fehler.some((f) => f.includes('"kamera"')), 'kamera nicht gemeldet');
  assert.ok(fehler.some((f) => f.includes('"palette"')), 'palette nicht gemeldet');
});

test('Vertrag: ein Element kann nicht Hauptrolle UND verboten sein', () => {
  const typ = gueltigerTyp();
  typ.palette = { haupt: ['saw'], neben: [], verboten: ['saw'] };
  assert.ok(pruefeWelttyp(typ).some((f) => f.includes('palette.haupt UND')), 'Widerspruch nicht erkannt');
});

test('Vertrag: ohne die Fähigkeit "boden" gibt es keinen Grund für Marken', () => {
  const typ = gueltigerTyp();
  typ.faehigkeiten = ['grapple'];
  assert.ok(pruefeWelttyp(typ).some((f) => f.includes('"boden" ist Pflicht')));
});

test('Vertrag: unbekannte Kamera, Achse, Grundstoff und Fähigkeit fallen auf', () => {
  const typ = { ...gueltigerTyp(), kamera: 'seitlich', achse: 'z', grundstoff: 'wasser', faehigkeiten: ['boden', 'fliegen'] };
  const fehler = pruefeWelttyp(typ);
  for (const wort of ['seitlich', 'z', 'wasser', 'fliegen']) {
    assert.ok(fehler.some((f) => f.includes(wort)), `"${wort}" nicht gemeldet`);
  }
});

test('Vertrag: forderVertrag wirft mit allen Gründen auf einmal', () => {
  assert.throws(() => forderVertrag({ id: 'kaputt' }), /Feld "label" fehlt/);
});

// ── Registry ────────────────────────────────────────────────────────────────

test('Registry: jeder eingetragene Welttyp erfüllt den Vertrag', () => {
  for (const id of WELTTYP_IDS) assert.deepEqual(pruefeWelttyp(WELTTYPEN[id]), [], id);
});

test('Registry: die Typwahl hängt nur am Seed und lässt sich erzwingen', () => {
  assert.equal(waehleWelttyp('abc').id, waehleWelttyp('abc').id);
  assert.equal(waehleWelttyp('abc', 'hoehlen').id, 'hoehlen');
  assert.equal(waehleWelttyp('abc', 'gibtsnicht').id, waehleWelttyp('abc').id, 'unbekannter Wunsch darf nicht zählen');
});

// ── Gemeinsame Regeln ───────────────────────────────────────────────────────

test('Plattform: ebneFlaeche macht Boden und Kopfraum, egal welcher Grundstoff', () => {
  for (const grundstoff of ['fels', 'luft']) {
    const grid = neuesRaster(40, 40, grundstoff);
    const f = ebneFlaeche(grid, { x: 10, y: 25, breite: 8 });
    for (let i = 0; i < f.breite; i++) {
      assert.equal(grid[f.y + 1][f.x + i], '#', `${grundstoff}: kein Boden bei ${f.x + i}`);
      assert.equal(grid[f.y][f.x + i], '.', `${grundstoff}: Standzeile nicht frei`);
      assert.equal(grid[f.y - 8][f.x + i], '.', `${grundstoff}: kein Kopfraum`);
    }
  }
});

test('Plattform: die Startplattform fasst nichts hinter der Grenze an', () => {
  // Der Fehler, den dieser Test festhält: Der freie Anlauf hinter der Plattform räumte stur sechs
  // Spalten weiter — mitten in den Schacht der Nachbarzone, wo er die Vorsprünge löschte. Die Route
  // riss ab, und die Reparatur flickte danach zehn Runden lang an den Folgen statt an der Ursache.
  const grid = neuesRaster(60, 40, 'fels');
  const grenze = 20;
  setzeStartplattform(grid, { x: 4, y: 25 }, { richtung: 1, grenze });
  for (let x = grenze; x < 60; x++) {
    for (let y = 0; y < 40; y++) {
      assert.equal(grid[y][x], '#', `Spalte ${x} (hinter der Grenze ${grenze}) wurde verändert`);
    }
  }
});

test('Plattform: pruefeStart erkennt unebenen Grund und Gefahr in Reichweite', () => {
  const eben = ['.'.repeat(20), '.'.repeat(20), '.'.repeat(20), '.'.repeat(20),
    '.'.repeat(20), '.'.repeat(20), '.'.repeat(20), '.'.repeat(20), '.'.repeat(20), '#'.repeat(20)];
  assert.deepEqual(pruefeStart(eben, [], { x: 10, y: 8 }), []);

  const holprig = [...eben];
  holprig[8] = `${'.'.repeat(8)}###${'.'.repeat(9)}`;
  assert.ok(pruefeStart(holprig, [], { x: 10, y: 8 }).length > 0, 'unebener Grund nicht gemeldet');

  const mitSaege = pruefeStart(eben, [{ type: 'saw', tx: 14, ty: 8 }], { x: 10, y: 8 });
  assert.ok(mitSaege.some((f) => f.includes('saw')), 'Gefahr am Start nicht gemeldet');
});

// ── Ganze Welt ──────────────────────────────────────────────────────────────

test('Welt v3: gleicher Seed, gleiche Welt — mit Welttyp im Hash', () => {
  const a = generateWorld({ seed: 'gleich', length: 'short' });
  const b = generateWorld({ seed: 'gleich', length: 'short' });
  assert.equal(a.hash, b.hash);
  assert.deepEqual(a.rows, b.rows);
  assert.equal(a.version, WORLD_VERSION);
});

test('Welt v3: Welttyp steht im Level und lässt sich erzwingen', () => {
  const lv = generateWorld({ seed: 'typ', length: 'short', worldType: 'hoehlen' });
  assert.equal(lv.meta.worldType, 'hoehlen');
  assert.equal(lv.meta.worldLabel, WELTTYPEN.hoehlen.label);
  assert.equal(lv.meta.kamera, 'horizontal');
  assert.equal(normalizeParams({ worldType: 'gibtsnicht' }).worldType, null);
});

test('Welt v3: das Biom kommt aus der Palette DES WELTTYPS', () => {
  for (let i = 0; i < 20; i++) {
    const lv = generateWorld({ seed: `biom${i}`, length: 'short' });
    assert.ok(WELTTYPEN[lv.meta.worldType].biome.includes(lv.biome), `${lv.meta.worldType} darf kein ${lv.biome}`);
  }
});

test('Welt v3: jedes Level startet eben, frei und ungefährlich', () => {
  for (const length of ['short', 'medium', 'long']) {
    for (let i = 0; i < 6; i++) {
      const lv = generateWorld({ seed: `start-${i}`, length });
      assert.deepEqual(pruefeStart(lv.rows, lv.entities, lv.meta.start), [], `${length}/${i}`);
    }
  }
});

test('Welt v3: hängt bei jeder Schwierigkeit zusammen', () => {
  const fails = [];
  for (const difficulty of [1, 2, 3, 4, 5]) {
    for (const length of ['short', 'medium', 'long']) {
      for (let i = 0; i < 3; i++) {
        const lv = generateWorld({ seed: `v3-stufen-${i}`, length, difficulty });
        const res = checkLevel(lv, lv.meta.limits);
        if (!res.ok) fails.push(`S${difficulty}/${length}/${i}: tot=[${res.deadZones}] gerissen=[${res.brokenZones}]`);
      }
    }
  }
  assert.deepEqual(fails, [], `${fails.length} von 45 Welten hängen nicht zusammen`);
});

test('Welt v3: bleibt in den Grenzen und die Sim kann sie bauen', () => {
  for (const length of ['short', 'medium', 'long']) {
    const lv = generateWorld({ seed: `grenzen-v3-${length}`, length });
    assert.ok(lv.width >= LIMITS.minWidth && lv.width <= LIMITS.maxWidth, `Breite ${lv.width}`);
    assert.ok(lv.height >= LIMITS.minHeight && lv.height <= LIMITS.maxHeight, `Höhe ${lv.height}`);
    const world = createLevelWorld(lv);
    assert.ok(world.player, 'kein Spieler');
    assert.ok(world.map.finish.length > 0, 'kein Ziel');
  }
});

test('Welt v3: die Startplattform ist wirklich mindestens START_BREITE breit', () => {
  const lv = generateWorld({ seed: 'breite', length: 'medium' });
  const { x, y } = lv.meta.start;
  let breite = 0;
  for (let dx = -START_BREITE; dx <= START_BREITE; dx++) {
    if (lv.rows[y + 1][x + dx] === '#' && lv.rows[y][x + dx] !== '#') breite++;
  }
  assert.ok(breite >= START_BREITE, `nur ${breite} ebene Kacheln`);
});

// ── Turm: Stockwerk-Brücken tragen bei jeder Schwierigkeit ───────────────────
//
// Der Turm ist seit dem Umbau vom 24.09.2026 (PLANUNG_WELTTYPEN.md, „Der Turm war nie durchspielbar")
// keine Schachtleiter mehr, sondern eine Kette von STOCKWERKEN (gen/world/motive/stockwerke.js): Jedes
// gilt dem Graph als Brücke von den Zellen neben der unteren Luke zu denen neben der oberen (Fähigkeit
// „stockwerk", faehigkeiten/stockwerk.js) — sein Inneres (Bröckelblöcke, Federn, Aufzüge …) kennt der
// Graph nicht. Dieser Test prüft nur, dass die Brücken selbst lückenlos aneinanderhängen; ob ein
// Stockwerk WIRKLICH spielbar ist, zeigt der Solver (gen/__tests__/solver.test.js, „Solver löst ganze
// Türme" und das Fenster-Prüfwerkzeug im Scratch-Ordner, siehe PLANUNG_WELTTYPEN.md).
test('Welt v3 (Turm): hängt bei jeder Schwierigkeit vollständig zusammen', () => {
  const fails = [];
  for (const difficulty of [1, 2, 3, 4, 5]) {
    for (const length of ['short', 'medium', 'long']) {
      for (let i = 0; i < 8; i++) {
        const lv = generateWorld({ seed: `turm-${i}`, length, difficulty, worldType: 'turm' });
        const res = checkLevel(lv, lv.meta.limits);
        if (!res.ok) fails.push(`S${difficulty}/${length}/${i}: tot=[${res.deadZones}] gerissen=[${res.brokenZones}]`);
      }
    }
  }
  assert.deepEqual(fails, [], `${fails.length} von 120 Türmen hängen nicht zusammen`);
});

// Rückmeldung vom 25.09.2026: bei einem Turm respawnte ein tieferer Checkpoint, obwohl der Spieler längst
// einen höheren erreicht hatte — sim/tilemap.js sortierte Checkpoints nach Position (tx), was bei einem
// senkrechten Level die falsche Achse ist (ein tieferes Stockwerk kann zufällig weiter rechts liegen als
// eines darüber). generate.js gibt die Bau-Reihenfolge (Stockwerk für Stockwerk, siehe pruefzonen) jetzt
// als explizite checkpointOrder mit — dieser Test prüft, dass sie wirklich ankommt und die Sortierung in
// sim/tilemap.js überschreibt, statt an der Position zu scheitern.
test('Welt v3 (Turm): die Checkpoint-Reihenfolge folgt dem Baufortschritt (Stockwerk für Stockwerk), nicht der Position', () => {
  for (const length of ['short', 'medium', 'long']) {
    for (let i = 0; i < 6; i++) {
      const lv = generateWorld({ seed: `turm-order-${i}`, length, difficulty: 3, worldType: 'turm' });
      assert.ok(lv.checkpointOrder.length >= 1, `${length}/${i}: keine Checkpoints`);
      assert.equal(lv.checkpointOrder.length, lv.meta.checkpoints.length, `${length}/${i}: Anzahl passt nicht`);
      const map = parseMap(lv.rows, { entities: lv.entities, checkpointOrder: lv.checkpointOrder });
      // Die geparste (jetzt explizit sortierte) Reihenfolge entspricht exakt der Bau-Reihenfolge — unabhängig
      // davon, was die reine Positions-Sortierung (tx) ergeben hätte
      assert.deepEqual(
        map.checkpoints.map((c) => [c.tx, c.ty]),
        lv.meta.checkpoints.map((c) => [c.x, c.y]),
        `${length}/${i}: Reihenfolge weicht vom Baufortschritt ab`,
      );
    }
  }
});

// ── Luftverbindung: die Untergrenze jeder Lösbarkeit ─────────────────────────
//
// Der Bewegungsgraph ist eine Näherung und war einmal durchlässig für dünne Platten: Er meldete jeden
// Turm als erreichbar, obwohl der Schacht in jeder Kammer von deren Boden gedeckelt war — kein Turm war
// durchspielbar, und alle Tests blieben grün. Diese Prüfung hängt nicht vom Graphen ab: Ohne einen
// zusammenhängenden Weg durch Luft von Start zu Ziel kann es keine Lösung geben (Portale und Grapple
// sind Kanten IM Luftraum; kein Welttyp führt durch Fels).
function luftVerbunden(lv) {
  const map = parseMap(lv.rows, { entities: lv.entities });
  const gesehen = new Uint8Array(map.w * map.h);
  const stapel = [map.start.ty * map.w + map.start.tx];
  gesehen[stapel[0]] = 1;
  // Portale sind Kanten: Wer den Eingang erreicht, erreicht den Ausgang (der Pfad-Generator legt Ausgänge auch in Lufträume,
  // die das Gelände vom Eingang trennt)
  const portale = lv.entities.filter((e) => e.type === 'portal');
  const partner = new Map(portale.map((e) => [e.ty * map.w + e.tx, portale.find((q) => q.id === e.pair)]));
  while (stapel.length) {
    const i = stapel.pop();
    const x = i % map.w;
    const y = (i - x) / map.w;
    const ziel = partner.get(i);
    if (ziel) {
      const j = ziel.ty * map.w + ziel.tx;
      if (!gesehen[j]) { gesehen[j] = 1; stapel.push(j); }
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const j = ny * map.w + nx;
      if (gesehen[j] || map.solid[j]) continue;
      gesehen[j] = 1;
      stapel.push(j);
    }
  }
  return map.finish.some((f) => gesehen[f.ty * map.w + f.tx]);
}

test('Welt v3: von JEDEM Start führt ein Weg durch Luft zum Ziel (alle Welttypen, Schwierigkeit 1/3/5)', () => {
  const fails = [];
  for (const worldType of WELTTYP_IDS) {
    for (const difficulty of [1, 3, 5]) {
      for (const length of ['short', 'medium']) {
        for (let i = 0; i < 6; i++) {
          const lv = generateWorld({ seed: `luft-${i}`, length, difficulty, worldType, kernidee: null });
          if (!luftVerbunden(lv)) fails.push(`${worldType}/S${difficulty}/${length}/${i}`);
        }
      }
    }
  }
  assert.deepEqual(fails, [], `${fails.length} Welten ohne Luftverbindung von Start zu Ziel`);
});

// ── Himmelsreich: Pendelplattformen und Fels ──────────────────────────────────
//
// Die Plattformen starteten in der letzten Spalte der einen Insel und endeten in der ersten der nächsten — die Bahn
// ging zu großen Teilen durch Fels (182 von 220), und wer mitfuhr, blieb in der Insel hängen. Weder der Graph noch der
// Solver hatten es bemerkt (der Solver kam auch ohne die Plattformen über die Lücken).
test('Himmelsreich: keine Pendelplattform überlappt an irgendeiner Stelle ihrer Bahn Fels', () => {
  const fails = [];
  for (const difficulty of [1, 3, 5]) {
    for (let i = 0; i < 12; i++) {
      const lv = generateWorld({ seed: `flug-${i}`, length: 'short', difficulty, worldType: 'himmelsreich', kernidee: null });
      const map = parseMap(lv.rows, { entities: lv.entities });
      lv.entities.filter((e) => e.type === 'mover').forEach((m, k) => {
        const [dx, dy] = m.path[m.path.length - 1];
        for (let schritt = 0; schritt <= 50; schritt++) {
          const f = schritt / 50;                 // ganzzahlig gezählt: 0,02-Schritte summieren Rundungsfehler, und ein Rand von 1e-5 px zählte als Berührung
          if (rectHitsSolid(map, (m.tx + dx * f) * TILE, (m.ty + dy * f) * TILE, m.width * TILE, 8)) { fails.push(`S${difficulty}/flug-${i}#${k} bei ${Math.round(f * 100)} %`); break; }
        }
      });
    }
  }
  assert.deepEqual(fails, [], `${fails.length} Bahnen im Fels`);
});
