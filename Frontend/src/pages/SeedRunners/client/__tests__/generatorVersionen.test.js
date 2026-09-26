// Generator-Versionen: Ein Zufallslevel ist „Seed + Biom + gv“ und muss für immer dasselbe Level bleiben (Favoriten, vergangene
// Tagesrennen, geteilte Seeds). Diese Tests schlagen an, sobald eine Änderung am Generator (oder an der Sim, die er beim Bauen
// benutzt) die Level einer Version verändern würde.
//
// SCHLÄGT „laufender Generator = Referenz“ FEHL, hat sich der Generator verändert. Dann NICHT die Referenz anpassen, sondern eine
// neue Version anlegen (gen/PLANUNG_WELTTYPEN.md 16r, gen/tools/einfrieren.mjs): GEN_VERSION + PFAD_GEN_VERSION auf N+1, neuen
// Stand einfrieren, in client/generatorArchiv.js und hier in REFERENZ eintragen. Version N bleibt im Archiv und baut ihre Seeds.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { weltParams, ohneGv, normalizeParams, levelFuerParams, GEN_VERSION } from '../../gen/index.js';
import { generateWorld } from '../../gen/world/generate.js';
import { welterzeugerFuer, erzeugeWelt } from '../generatorArchiv.js';
import { einfrieren } from '../../gen/tools/einfrieren.mjs';

// Referenz-Level je Version: Hash des Levels zu Seed und Biom (ermittelt beim Einfrieren; v1 am 26.09.2026)
const REFERENZ = {
  1: [
    { seed: 'golden-1', biome: 'random', hash: '2b1cc8af' },
    { seed: 'golden-2', biome: 'ice', hash: 'a15c01b1' },
  ],
};
const REFERENZ_V1 = REFERENZ[1];

const w = (seed, biome, gv) => ohneGv(weltParams({ seed, biome, gen: 'pfad', gv }));

test('Jede Version im Archiv baut genau ihre Referenz-Level (das Archiv bleibt unverändert)', async () => {
  for (const [gv, liste] of Object.entries(REFERENZ)) {
    const erzeuge = (await import(`../../archiv/pfad-v${gv}/gen/world/generate.js`)).generateWorld;
    for (const r of liste) assert.equal(erzeuge(w(r.seed, r.biome, Number(gv))).hash, r.hash, `v${gv} ${r.seed}/${r.biome}`);
  }
});

test('Laufender Generator = Referenz seiner Version (sonst: neue Generator-Version anlegen, siehe Kopf der Datei)', () => {
  const liste = REFERENZ[GEN_VERSION];
  assert.ok(liste, `Für die laufende Version ${GEN_VERSION} fehlen Referenz-Level`);
  for (const r of liste) {
    assert.equal(generateWorld(w(r.seed, r.biome, GEN_VERSION)).hash, r.hash,
      `Der Generator baut für ${r.seed}/${r.biome} ein anderes Level als Version ${GEN_VERSION} — neue Version anlegen statt die Referenz zu ändern`);
  }
});

test('Parameter: gv bleibt erhalten, fehlt es, ist es Version 1; Unsinn wird zu 1', () => {
  assert.equal(normalizeParams({ seed: 'x', gen: 'pfad' }).gv, 1);
  assert.equal(normalizeParams({ seed: 'x', gen: 'pfad', gv: 3 }).gv, 3);
  assert.equal(normalizeParams({ seed: 'x', gen: 'pfad', gv: 'quatsch' }).gv, 1);
  assert.equal(normalizeParams({ seed: 'x', gen: 'pfad', gv: 0 }).gv, 1);
  assert.equal(normalizeParams({ seed: 'x', length: 'short' }).gv, undefined, 'Chunk-Level haben keine Generator-Version');
  assert.equal(weltParams({ seed: 'x', gen: 'pfad', gv: 1 }).gv, 1);
  assert.equal(ohneGv(weltParams({ seed: 'x', gen: 'pfad', gv: 1 })).gv, undefined, 'generateWorld bekommt kein gv');
});

test('Weiche: laufende Version baut live, unbekannte Version wird abgelehnt, levelFuerParams baut keine fremde Version', async () => {
  assert.equal(await welterzeugerFuer(GEN_VERSION), generateWorld);
  await assert.rejects(welterzeugerFuer(GEN_VERSION + 50), /unbekannt/);
  assert.throws(() => levelFuerParams({ seed: 'x', gen: 'pfad', gv: GEN_VERSION + 1 }), /Archiv/);
  const lvl = await erzeugeWelt(weltParams({ seed: REFERENZ_V1[0].seed, biome: REFERENZ_V1[0].biome, gen: 'pfad', gv: 1 }));
  assert.equal(lvl.hash, REFERENZ_V1[0].hash);
});

test('Einfrieren: kopiert sim/, gen/, level/ ohne Tests und Werkzeuge, überschreibt nie', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-einfrieren-'));
  const ziel = path.join(dir, 'pfad-v9');
  try {
    const res = einfrieren(9, ziel);
    assert.ok(res.dateien > 50, `${res.dateien} Dateien`);
    assert.ok(fs.existsSync(path.join(ziel, 'gen', 'world', 'generate.js')));
    assert.ok(fs.existsSync(path.join(ziel, 'sim', 'world.js')));
    assert.ok(!fs.existsSync(path.join(ziel, 'gen', 'tools')), 'keine Werkzeuge');
    assert.ok(!fs.existsSync(path.join(ziel, 'sim', '__tests__')), 'keine Tests');
    assert.throws(() => einfrieren(9, ziel), /nie überschrieben/);
    assert.throws(() => einfrieren(0, path.join(dir, 'x')), /Version/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
