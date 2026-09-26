// Seed Runners — Prüfung eines Level-Dokuments auf dem Server. Der Server glaubt nie, was der Client schon
// geprüft hat: Jedes Level, das gespeichert, verifiziert oder veröffentlicht wird, läuft hier durch dieselbe
// Funktion (Frontend/…/SeedRunners/level/validate.js, gespiegelt nach engine/level), mit Schema, Grenzen,
// Rauchtest der Engine und dem Inhalts-Hash, den ALLEIN der Server berechnet.
//
// Das ist eine kurze Rechnung (Maximal-Level: rund 45 ms) und läuft deshalb im Hauptprozess, mit einem Limit
// pro Adresse (routes.js). Das NACHSPIELEN eines Laufs dagegen dauert Sekunden bis Minuten und gehört in den
// Worker (verifier.js).
'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

let enginePromise = null;

/** Lädt Level-Modul und Fingerprints einmal pro Prozess. */
function loadLevelEngine() {
  if (!enginePromise) {
    const dir = path.join(__dirname, 'engine');
    const load = (rel) => import(pathToFileURL(path.join(dir, rel)).href);
    enginePromise = Promise.all([load('level/index.js'), load('version.js')])
      .then(([level, version]) => ({ ...level, ...version }));
  }
  return enginePromise;
}

/**
 * @param {unknown} doc  das Dokument, wie es vom Client kommt
 * @param {{ requireName?: boolean, includeDoc?: boolean }} [opts]
 *   requireName  für die Veröffentlichung
 *   includeDoc   das KANONISCHE Dokument mitliefern (für die Verifizierung, die es an den Worker weitergibt)
 * @param {object} [engine]  Ersatz für Tests
 * @returns {Promise<{ ok: false, errors: string[] } | { ok: true, hash: string, warnings: object[], stats: object, fp: object, doc?: object }>}
 */
async function checkLevel(doc, opts = {}, engine) {
  const eng = engine || await loadLevelEngine();
  const res = eng.validateDoc(doc, { requireName: !!opts.requireName });
  if (!res.ok) return { ok: false, errors: res.errors };
  const { doc: canon } = res;
  const count = (ch) => canon.tiles.reduce((n, row) => n + [...row].filter((c) => c === ch).length, 0);
  return {
    ok: true,
    ...(opts.includeDoc ? { doc: canon } : {}),
    hash: res.hash,
    warnings: res.warnings,
    stats: { width: canon.width, height: canon.height, elements: canon.elements.length, checkpoints: count('C') },
    // Der Client vergleicht sie mit seinem eigenen Stand: Weichen sie ab, wird ein Lauf hier nicht bestätigt
    fp: { sim: eng.SIM_FINGERPRINT, engine: eng.ENGINE_FINGERPRINT },
  };
}

/** Die Fingerprints dieses Servers: { sim, engine } */
async function currentFingerprints() {
  const eng = await loadLevelEngine();
  return { sim: eng.SIM_FINGERPRINT, engine: eng.ENGINE_FINGERPRINT };
}

module.exports = { checkLevel, loadLevelEngine, currentFingerprints };
