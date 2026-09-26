// Test des Sim-Spiegels: Das Backend muss dieselbe Sim und denselben Generator haben wie das Frontend, sonst
// stimmen nachgespielte Läufe nicht. Schlägt dieser Test an: `npm run seedrunners:spiegel` (im Ordner Backend).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spiegle, sollzustand, fingerprint, fingerprints, SPIEGEL } = require('../tools/simSpiegel');

test('Der Spiegel im Backend und die version.js im Frontend sind aktuell', () => {
  const res = spiegle(true);
  assert.deepEqual(res.abweichungen, [], 'Sim-Spiegel veraltet: npm run seedrunners:spiegel');
  assert.equal(res.ok, true);
});

test('Die Fingerprints im Spiegel sind die der Quelltexte', () => {
  const { fps } = sollzustand();
  const text = fs.readFileSync(path.join(SPIEGEL, 'version.js'), 'utf8');
  assert.ok(text.includes(`SIM_FINGERPRINT = '${fps.sim}'`));
  assert.ok(text.includes(`GEN_FINGERPRINT = '${fps.gen}'`));
  assert.ok(text.includes(`ENGINE_FINGERPRINT = '${fps.engine}'`));
});

test('SIM hängt nur an sim/, GEN nur an gen/, ENGINE an allem — eine Änderung am Generator lässt SIM unberührt', () => {
  const basis = [['sim/a.js', 'x'], ['gen/b.js', 'y'], ['level/c.js', 'z']];
  const fps = fingerprints(basis);
  const generatorGeaendert = fingerprints([['sim/a.js', 'x'], ['gen/b.js', 'NEU'], ['level/c.js', 'z']]);
  assert.equal(generatorGeaendert.sim, fps.sim, 'SIM unverändert');
  assert.notEqual(generatorGeaendert.gen, fps.gen);
  assert.notEqual(generatorGeaendert.engine, fps.engine);

  const simGeaendert = fingerprints([['sim/a.js', 'NEU'], ['gen/b.js', 'y'], ['level/c.js', 'z']]);
  assert.notEqual(simGeaendert.sim, fps.sim);
  assert.equal(simGeaendert.gen, fps.gen, 'GEN unverändert');
  assert.notEqual(simGeaendert.engine, fps.engine);

  const levelGeaendert = fingerprints([['sim/a.js', 'x'], ['gen/b.js', 'y'], ['level/c.js', 'NEU']]);
  assert.equal(levelGeaendert.sim, fps.sim);
  assert.equal(levelGeaendert.gen, fps.gen);
  assert.notEqual(levelGeaendert.engine, fps.engine, 'ENGINE erfasst auch level/');
});

test('Der Fingerprint hängt an jedem Zeichen und an den Dateinamen', () => {
  const a = fingerprint([['sim/a.js', 'x'], ['sim/b.js', 'y']]);
  assert.equal(a, fingerprint([['sim/a.js', 'x'], ['sim/b.js', 'y']]));
  assert.notEqual(a, fingerprint([['sim/a.js', 'x'], ['sim/b.js', 'z']]));
  assert.notEqual(a, fingerprint([['sim/a.js', 'x'], ['sim/c.js', 'y']]));
  assert.match(a, /^[0-9a-f]{16}$/);
});

test('Tests und Werkzeuge gehören nicht in den Spiegel', () => {
  const { spiegel } = sollzustand();
  for (const rel of spiegel.keys()) {
    assert.ok(!rel.includes('__tests__') && !rel.includes('/tools/'), rel);
  }
  assert.ok(spiegel.has('sim/replay.js') && spiegel.has('gen/generator.js') && spiegel.has('level/validate.js'));
  assert.ok(spiegel.has('version.js') && spiegel.has('package.json'));
  assert.ok(!spiegel.has('sim/version.js'), 'version.js liegt nicht mehr in sim/');
});
