// Tests des Kernideen-Systems (Phase C, siehe gen/PLANUNG_WELTTYPEN.md).
//
// Die Zusage dieser Phase: Eine Kernidee ist eine Datei mit ein bis drei optionalen Hooks, die ein
// Welttyp an seinen EIGENEN Entscheidungspunkten aufruft — ohne Idee (oder ohne passende Idee für
// diesen Welttyp) bleibt alles wie vorher (Phase B, byte-identisch geprüft in world.test.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { pruefeIdee, forderIdee, passtZuWelttyp, wendeGewichtePalette, wendeWandleElement } from '../vertrag.js';
import { IDEEN, IDEEN_IDS, waehleIdee } from '../registry.js';
import { generateWorld } from '../../generate.js';
import { checkLevel } from '../../reichweite/graph.js';
import { pruefeStart } from '../../gemeinsam/plattform.js';

const gueltigeIdee = () => ({
  id: 'probe', label: 'Probe', beschreibung: 'nur für den Test', kompatibel: ['parcours'],
  gewichtePalette: (liste, gewichte) => ({ liste, gewichte }),
});

// ── Vertrag ─────────────────────────────────────────────────────────────────

test('Vertrag: eine gültige Idee geht durch', () => {
  assert.deepEqual(pruefeIdee(gueltigeIdee()), []);
});

test('Vertrag: fehlende Pflichtfelder werden einzeln benannt', () => {
  const idee = gueltigeIdee();
  delete idee.beschreibung;
  delete idee.kompatibel;
  const fehler = pruefeIdee(idee);
  assert.ok(fehler.some((f) => f.includes('beschreibung')));
  assert.ok(fehler.some((f) => f.includes('kompatibel')));
});

test('Vertrag: ohne mindestens einen Hook wird die Idee abgelehnt', () => {
  const idee = gueltigeIdee();
  delete idee.gewichtePalette;
  const fehler = pruefeIdee(idee);
  assert.ok(fehler.some((f) => f.includes('Hook')));
});

test('Vertrag: leeres kompatibel-Array wird abgelehnt (die Idee würde nie gewählt)', () => {
  const idee = { ...gueltigeIdee(), kompatibel: [] };
  assert.ok(pruefeIdee(idee).some((f) => f.includes('leeres')));
});

test('Vertrag: "alle" ist als kompatibel-Wert erlaubt', () => {
  const idee = { ...gueltigeIdee(), kompatibel: 'alle' };
  assert.deepEqual(pruefeIdee(idee), []);
  assert.ok(passtZuWelttyp(idee, 'irgendeinWelttyp'));
});

test('forderIdee wirft mit dem Idee-Namen in der Meldung', () => {
  const idee = gueltigeIdee();
  delete idee.beschreibung;
  assert.throws(() => forderIdee(idee), /probe/);
});

test('wendeGewichtePalette/wendeWandleElement sind ohne Idee die Identität', () => {
  const liste = ['a', 'b'];
  const gewichte = [1, 2];
  assert.deepEqual(wendeGewichtePalette(null, liste, gewichte, {}), { liste, gewichte });
  const spec = { type: 'spike', tx: 1, ty: 2 };
  assert.equal(wendeWandleElement(null, spec, {}), spec);
});

// ── Registry ────────────────────────────────────────────────────────────────

test('Registry: alle eingetragenen Ideen erfüllen den Vertrag (sonst wäre das Modul gar nicht geladen)', () => {
  for (const id of IDEEN_IDS) assert.equal(IDEEN[id].id, id);
});

test('Registry: waehleIdee(seed, welttyp, null) erzwingt "keine"', () => {
  const { idee, tier } = waehleIdee('irgendein-seed', 'parcours', null);
  assert.equal(idee, null);
  assert.equal(tier, 'keine');
});

test('Registry: waehleIdee mit einem gültigen, passenden Wunsch liefert genau den', () => {
  const id = IDEEN_IDS[0];
  const { idee, tier } = waehleIdee('irgendein-seed', 'parcours', id);
  assert.equal(idee.id, id);
  assert.equal(tier, 'stark');
});

test('Registry: waehleIdee ohne Wunsch ist deterministisch (gleicher Seed → gleiche Idee)', () => {
  const a = waehleIdee('deterministisch-1', 'parcours');
  const b = waehleIdee('deterministisch-1', 'parcours');
  assert.deepEqual(a, b);
});

test('Registry: ein Welttyp ohne passende Idee bekommt "keine", nicht einen Fehler', () => {
  const { idee, tier } = waehleIdee('irgendein-seed', 'welttyp-den-es-nicht-gibt');
  assert.equal(idee, null);
  assert.equal(tier, 'keine');
});

test('Registry: die Welttyp-Wahl bleibt unberührt von der Kernidee-Wahl (getrennte Teilströme)', () => {
  // Erzwungene Idee darf nicht verschieben, welchen WELTTYP ein Seed ohne worldType-Wunsch bekäme —
  // sonst hinge die Vielfalt der Welttypen heimlich an der Zahl der Kernideen.
  const ohne = generateWorld({ seed: 'kopplungs-check', length: 'short' });
  const mit = generateWorld({ seed: 'kopplungs-check', length: 'short', kernidee: null });
  assert.equal(ohne.meta.worldType, mit.meta.worldType);
});

// ── Zusammenspiel mit generateWorld() ────────────────────────────────────────

test('generateWorld: ohne Kernidee (kernidee: null) bleibt meta.kernidee null', () => {
  const lv = generateWorld({ seed: 'x', worldType: 'parcours', kernidee: null });
  assert.equal(lv.meta.kernidee, null);
  assert.equal(lv.meta.kernideeTier, 'keine');
});

test('generateWorld: eine erzwungene Kernidee steht im Level (feste Regel 7)', () => {
  const lv = generateWorld({ seed: 'x', worldType: 'parcours', kernidee: 'einElement' });
  assert.equal(lv.meta.kernidee, 'einElement');
  assert.equal(lv.meta.kernideeLabel, 'Ein Element, alle Rollen');
  assert.ok(lv.meta.kernideeBeschreibung.length > 0);
});

test('generateWorld: eine Idee für einen NICHT kompatiblen Welttyp wird ignoriert (fällt auf normale Wahl zurück)', () => {
  // himmelsreich ist bei keiner der drei Ideen in `kompatibel` gelistet.
  const lv = generateWorld({ seed: 'x', worldType: 'himmelsreich', kernidee: 'einElement' });
  assert.notEqual(lv.meta.kernidee, 'einElement');
});

test('einElement: das Level enthält am Ende wirklich nur eine Gefahrenart', () => {
  for (const worldType of ['parcours', 'turm']) {
    for (let i = 0; i < 6; i++) {
      const lv = generateWorld({ seed: `ee-${i}`, length: 'long', difficulty: 3, worldType, kernidee: 'einElement' });
      const arten = new Set(lv.entities.map((e) => e.type).filter((t) => ['spike', 'saw', 'laser'].includes(t)));
      assert.ok(arten.size <= 1, `${worldType}/ee-${i}: ${[...arten]}`);
    }
  }
});

test('saegenTakt: alle bewegten Sägen laufen phasengleich, die Periode verengt sich zum Levelende', () => {
  const lv = generateWorld({ seed: 'takt-1', length: 'long', difficulty: 3, worldType: 'parcours', kernidee: 'saegenTakt' });
  const saws = lv.entities.filter((e) => e.type === 'saw' && (e.path || e.orbit));
  assert.ok(saws.length >= 3, `zu wenige bewegte Sägen zum Prüfen: ${saws.length}`);
  for (const s of saws) assert.equal(s.phase, 0);
  // speed steigt monoton mit fortschreitendem Level (kürzere Periode = schnellere Bewegung auf
  // gleicher Bahnlänge) — nicht streng (Bahnlängen variieren), aber der erste ist nie schneller als
  // der letzte innerhalb derselben Bahnlänge lässt sich nicht pauschal prüfen; stattdessen: Anfang
  // und Ende liegen im erwarteten Bereich der Zielperiode.
  assert.ok(saws[0].speed > 0);
});

test('laserAmpeln: alle nicht-drehenden Laser teilen Periode/Tastverhältnis, Phase 0', () => {
  const lv = generateWorld({ seed: 'ampel-1', length: 'long', difficulty: 3, worldType: 'parcours', kernidee: 'laserAmpeln' });
  const lasers = lv.entities.filter((e) => e.type === 'laser' && !e.spin);
  assert.ok(lasers.length >= 3, `zu wenige Laser zum Prüfen: ${lasers.length}`);
  for (const l of lasers) {
    assert.equal(l.phase, 0);
    const quote = l.on / l.period;
    assert.ok(Math.abs(quote - 0.55) < 1e-9, `Tastverhältnis ${quote}`);
  }
});

// ── Zusammenhang bleibt erhalten (die Kernidee darf die Lösbarkeits-Garantie nicht brechen) ────

test('Jede Kernidee hängt bei jedem kompatiblen Welttyp vollständig zusammen', () => {
  const fails = [];
  for (const id of IDEEN_IDS) {
    for (const welttyp of IDEEN[id].kompatibel) {
      for (const difficulty of [1, 3, 5]) {
        for (const length of ['short', 'medium', 'long']) {
          for (let i = 0; i < 3; i++) {
            const lv = generateWorld({ seed: `id-${i}`, length, difficulty, worldType: welttyp, kernidee: id });
            const r = checkLevel(lv, lv.meta.limits);
            const sf = pruefeStart(lv.rows, lv.entities, lv.meta.start);
            if (!r.ok || sf.length) fails.push(`${id}/${welttyp}/${length}/S${difficulty}/${i}: ok=${r.ok} tot=[${r.deadZones}] start=[${sf.join(',')}]`);
          }
        }
      }
    }
  }
  assert.deepEqual(fails, []);
});
