#!/usr/bin/env node
// seedRunners/tools/simSpiegel.js
// Spiegelt die Sim, den Level-Generator und das Level-Modul von Seed Runners ins Backend und erzeugt ihre Fingerprints.
//
//   Quelle    Frontend/src/pages/SeedRunners/sim/, gen/, level/ und archiv/   (ohne __tests__ und tools)
//   Spiegel   Backend/seedRunners/engine/sim/, gen/, level/ und archiv/       (+ package.json mit "type": "module")
//   archiv/ enthält eingefrorene Generator-Versionen (archiv/pfad-vN, Frontend gen/tools/einfrieren.mjs) — der Server baut
//   damit die Level älterer Versionen nach (replay.js).
//   Version   Frontend/src/pages/SeedRunners/version.js              (wird mit gespiegelt)
//
// WARUM ES DAS GIBT
// Der Anti-Cheat spielt einen Lauf auf dem Server mit DERSELBEN Sim nach, die der Browser benutzt.
// Sim und Generator müssen dazu bitgleich sein — und Frontend und Backend werden getrennt
// ausgeliefert (deploy.sh). Die Frontend-Dateien sind die einzige Quelle; das Backend bekommt sie
// erzeugt, nie von Hand gepflegt. Der Fingerprint ist ein Hash über die gespiegelten Quelltexte:
// Der Browser schickt ihn mit jedem Lauf mit. Weicht er vom Stand des Servers ab (Frontend und
// Backend sind kurz verschieden aktuell), wird der Lauf NICHT geprüft — statt einen ehrlichen
// Spieler zu Unrecht auszuschließen, weil ein Deploy dazwischenlag.
//
// DREI FINGERPRINTS
// Welcher zählt, hängt davon ab, woran ein Lauf hängt:
//   SIM_FINGERPRINT     nur sim/    Physik und Elemente. Ein Lauf auf einem EIGENEN Level (Editor) hängt nur an der
//                                   Sim — das Level steckt komplett im Dokument. Eine Änderung am Generator
//                                   (Welt-Generierung) entwertet deshalb keinen einzigen eigenen Lauf.
//   GEN_FINGERPRINT     nur gen/    Der Generator allein (Information; zeigt, ob sich die Welten geändert haben).
//   ENGINE_FINGERPRINT  alles       sim/, gen/ und level/. Ein Lauf auf einem prozeduralen Level hängt daran: Der
//                                   Generator bestimmt, welches Level ein Seed ergibt.
//
// Zeilenenden werden vor dem Hashen und Spiegeln vereinheitlicht (LF): Auf Windows-Rechnern mit
// CRLF-Dateien käme sonst ein anderer Fingerprint heraus als auf dem Server.
//
//   node seedRunners/tools/simSpiegel.js             schreibt Spiegel und version.js
//   node seedRunners/tools/simSpiegel.js --pruefen   meldet nur, Rückgabewert 1 bei Abweichung

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WURZEL = path.resolve(__dirname, '..', '..', '..');
const QUELLE = path.join(WURZEL, 'Frontend', 'src', 'pages', 'SeedRunners');
const SPIEGEL = path.join(WURZEL, 'Backend', 'seedRunners', 'engine');
const ORDNER = ['sim', 'gen', 'level', 'archiv'];
const AUSGESCHLOSSEN = new Set(['__tests__', 'tools']);
const VERSION_DATEI = 'version.js';
const PACKAGE_JSON = `${JSON.stringify({ type: 'module', private: true }, null, 2)}\n`;

const lf = (text) => text.replace(/\r\n/g, '\n');

/** Alle .js-Dateien unter `dir` (relativ zu `basis`, mit /), sortiert, ohne ausgeschlossene Ordner. */
function dateien(basis, dir) {
  const out = [];
  const abs = path.join(basis, dir);
  for (const eintrag of fs.readdirSync(abs, { withFileTypes: true })) {
    if (eintrag.isDirectory()) {
      if (!AUSGESCHLOSSEN.has(eintrag.name)) out.push(...dateien(basis, `${dir}/${eintrag.name}`));
    } else if (eintrag.name.endsWith('.js')) {
      out.push(`${dir}/${eintrag.name}`);
    }
  }
  return out.sort();
}

function quelldateien() {
  return ORDNER.filter((d) => fs.existsSync(path.join(QUELLE, d))).flatMap((d) => dateien(QUELLE, d));
}

function fingerprint(inhalte) {
  const hash = crypto.createHash('sha256');
  for (const [rel, text] of inhalte) hash.update(`${rel}\n${text}\n`);
  return hash.digest('hex').slice(0, 16);
}

/** Die drei Fingerprints aus den gespiegelten Dateien (relativer Pfad → Text) */
function fingerprints(inhalte) {
  const von = (...ordner) => inhalte.filter(([rel]) => ordner.some((o) => rel.startsWith(`${o}/`)));
  return {
    sim: fingerprint(von('sim')),
    gen: fingerprint(von('gen')),
    engine: fingerprint(inhalte),
  };
}

function versionText(fps) {
  return [
    '// Erzeugt von Backend/seedRunners/tools/simSpiegel.js — nicht von Hand ändern.',
    '// Fingerprints über die Quelltexte (ohne Tests). Der Browser schickt einen mit jedem Lauf mit; der Server',
    '// prüft nur Läufe, deren Fingerprint zu seinem eigenen Stand passt.',
    '//   SIM_FINGERPRINT     nur sim/      — Läufe auf eigenen Leveln (das Level steckt im Dokument)',
    '//   GEN_FINGERPRINT     nur gen/      — der Generator allein',
    '//   ENGINE_FINGERPRINT  sim/, gen/, level/ — Läufe auf prozeduralen Leveln (der Generator bestimmt das Level)',
    `export const SIM_FINGERPRINT = '${fps.sim}';`,
    `export const GEN_FINGERPRINT = '${fps.gen}';`,
    `export const ENGINE_FINGERPRINT = '${fps.engine}';`,
    '',
  ].join('\n');
}

/** Soll-Zustand: relativer Pfad → Text, für Frontend (nur version.js) und Spiegel. */
function sollzustand() {
  const inhalte = quelldateien().map((rel) => [rel, lf(fs.readFileSync(path.join(QUELLE, rel), 'utf8'))]);
  const fps = fingerprints(inhalte);
  const version = versionText(fps);
  const spiegel = new Map(inhalte);
  spiegel.set(VERSION_DATEI, version);
  spiegel.set('package.json', PACKAGE_JSON);
  return { fps, fp: fps.engine, version, spiegel };
}

function lies(datei) {
  try {
    return lf(fs.readFileSync(datei, 'utf8'));
  } catch {
    return null;
  }
}

/** Alle Dateien, die aktuell im Spiegelordner liegen (relativ, mit /). */
function istDateien() {
  const out = [];
  const gehe = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) gehe(abs);
      else out.push(path.relative(SPIEGEL, abs).split(path.sep).join('/'));
    }
  };
  gehe(SPIEGEL);
  return out;
}

/**
 * @param {boolean} nurPruefen
 * @returns {{ ok: boolean, fp: string, fps: object, abweichungen: string[] }}
 */
function spiegle(nurPruefen) {
  const { fp, fps, version, spiegel } = sollzustand();
  const abweichungen = [];

  // Frontend: version.js
  const feVersion = path.join(QUELLE, VERSION_DATEI);
  if (lies(feVersion) !== version) {
    abweichungen.push(`Frontend/…/SeedRunners/${VERSION_DATEI}`);
    if (!nurPruefen) fs.writeFileSync(feVersion, version);
  }

  // Backend: alle Spiegeldateien
  for (const [rel, text] of spiegel) {
    const ziel = path.join(SPIEGEL, rel);
    if (lies(ziel) === text) continue;
    abweichungen.push(`Backend/seedRunners/engine/${rel}`);
    if (!nurPruefen) {
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      fs.writeFileSync(ziel, text);
    }
  }

  // Verwaiste Dateien (in der Quelle gelöscht oder umbenannt) verschwinden auch im Spiegel
  for (const rel of istDateien()) {
    if (spiegel.has(rel)) continue;
    abweichungen.push(`Backend/seedRunners/engine/${rel} (verwaist)`);
    if (!nurPruefen) fs.rmSync(path.join(SPIEGEL, rel));
  }

  return { ok: abweichungen.length === 0, fp, fps, abweichungen };
}

if (require.main === module) {
  const nurPruefen = process.argv.includes('--pruefen');
  const res = spiegle(nurPruefen);
  const stand = `sim ${res.fps.sim}, gen ${res.fps.gen}, engine ${res.fps.engine}`;
  if (res.ok) {
    console.log(`Sim-Spiegel in Ordnung (${stand}).`);
  } else if (nurPruefen) {
    console.error(`Sim-Spiegel VERALTET (${res.abweichungen.length} Dateien weichen ab):`);
    for (const a of res.abweichungen) console.error(`  ${a}`);
    console.error('→ npm run seedrunners:spiegel  (im Ordner Backend)');
    process.exit(1);
  } else {
    console.log(`Sim-Spiegel geschrieben (${stand}), ${res.abweichungen.length} Dateien geändert.`);
  }
}

module.exports = { spiegle, sollzustand, fingerprint, fingerprints, SPIEGEL, QUELLE };
