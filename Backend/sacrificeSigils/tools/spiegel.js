#!/usr/bin/env node
// sacrificeSigils/tools/spiegel.js
// Spiegelt die Engine und die Spieldaten von Sacrifice & Sigils ins Backend.
//
//   Quelle    Frontend/src/pages/SacrificeSigils/engine/ und data/   (ohne __tests__)
//   Spiegel   Backend/sacrificeSigils/shared/engine/ und data/        (+ package.json mit "type": "module")
//
// WARUM ES DAS GIBT
// Der Server ist autoritativ: Er wendet jede Aktion mit DERSELBEN Engine an, die der Browser für die Vorschau und den
// Übungsmodus benutzt. Frontend und Backend werden getrennt ausgeliefert (deploy.sh) — die Frontend-Dateien sind die
// einzige Quelle, das Backend bekommt sie erzeugt, nie von Hand gepflegt. Der Fingerprint (Hash über alle gespiegelten
// Dateien) steht in shared/version.js; der Client schickt seinen beim Beitreten mit, damit ein veralteter Browser-Stand
// nach einem Deploy einen Hinweis zum Neuladen bekommt statt merkwürdiger Fehler.
//
//   node sacrificeSigils/tools/spiegel.js             schreibt den Spiegel
//   node sacrificeSigils/tools/spiegel.js --pruefen   meldet nur, Rückgabewert 1 bei Abweichung

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WURZEL = path.resolve(__dirname, '..', '..', '..');
const QUELLE = path.join(WURZEL, 'Frontend', 'src', 'pages', 'SacrificeSigils');
const SPIEGEL = path.join(WURZEL, 'Backend', 'sacrificeSigils', 'shared');
const ORDNER = ['engine', 'data'];
const AUSGESCHLOSSEN = new Set(['__tests__']);
// Der Browser bekommt denselben Fingerprint (Frontend/…/SacrificeSigils/version.js) und schickt ihn beim Beitreten mit
const FRONTEND_VERSION = path.join(QUELLE, 'version.js');
const PACKAGE_JSON = `${JSON.stringify({ type: 'module', private: true }, null, 2)}\n`;

const lf = (text) => text.replace(/\r\n/g, '\n');

/** Alle .js-Dateien unter `dir` (relativ zu `basis`, mit /), sortiert. */
function dateien(basis, dir) {
  const out = [];
  for (const eintrag of fs.readdirSync(path.join(basis, dir), { withFileTypes: true })) {
    if (eintrag.isDirectory()) {
      if (!AUSGESCHLOSSEN.has(eintrag.name)) out.push(...dateien(basis, `${dir}/${eintrag.name}`));
    } else if (eintrag.name.endsWith('.js')) {
      out.push(`${dir}/${eintrag.name}`);
    }
  }
  return out.sort();
}

function inhalte(basis) {
  return ORDNER.filter((d) => fs.existsSync(path.join(basis, d)))
    .flatMap((d) => dateien(basis, d))
    .map((rel) => [rel, lf(fs.readFileSync(path.join(basis, rel), 'utf8'))]);
}

function fingerprint(liste) {
  const hash = crypto.createHash('sha256');
  for (const [rel, text] of liste) hash.update(`${rel}\n${text}\n`);
  return hash.digest('hex').slice(0, 16);
}

function versionDatei(fp) {
  return `// ERZEUGT von sacrificeSigils/tools/spiegel.js — nicht von Hand ändern.\nexport const ENGINE_FINGERPRINT = ${JSON.stringify(fp)};\n`;
}

/** Soll-Zustand des Spiegels: relativer Pfad → Text */
function sollZustand() {
  const liste = inhalte(QUELLE);
  const fp = fingerprint(liste);
  const soll = new Map(liste);
  soll.set('package.json', PACKAGE_JSON);
  soll.set('version.js', versionDatei(fp));
  return { soll, fp };
}

function istZustand() {
  const ist = new Map();
  if (!fs.existsSync(SPIEGEL)) return ist;
  for (const [rel, text] of inhalte(SPIEGEL)) ist.set(rel, text);
  for (const extra of ['package.json', 'version.js']) {
    const p = path.join(SPIEGEL, extra);
    if (fs.existsSync(p)) ist.set(extra, lf(fs.readFileSync(p, 'utf8')));
  }
  return ist;
}

function abweichungen() {
  const { soll, fp } = sollZustand();
  const ist = istZustand();
  const diff = [];
  for (const [rel, text] of soll) if (ist.get(rel) !== text) diff.push(rel);
  for (const rel of ist.keys()) if (!soll.has(rel)) diff.push(`${rel} (überzählig)`);
  const fe = fs.existsSync(FRONTEND_VERSION) ? lf(fs.readFileSync(FRONTEND_VERSION, 'utf8')) : null;
  if (fe !== versionDatei(fp)) diff.push('Frontend version.js');
  return { diff, soll, fp };
}

function schreiben() {
  const { soll, fp } = sollZustand();
  fs.rmSync(SPIEGEL, { recursive: true, force: true });
  for (const [rel, text] of soll) {
    const ziel = path.join(SPIEGEL, rel);
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, text);
  }
  fs.writeFileSync(FRONTEND_VERSION, versionDatei(fp));
  return fp;
}

if (require.main === module) {
  if (process.argv.includes('--pruefen')) {
    const { diff, fp } = abweichungen();
    if (diff.length) {
      console.error(`Sacrifice & Sigils: Engine-Spiegel veraltet (${diff.length} Dateien), z. B. ${diff.slice(0, 5).join(', ')}`);
      process.exit(1);
    }
    console.log(`Sacrifice & Sigils: Engine-Spiegel aktuell (${fp}).`);
  } else {
    const fp = schreiben();
    console.log(`Sacrifice & Sigils: Engine gespiegelt nach ${path.relative(WURZEL, SPIEGEL)} (${fp}).`);
  }
}

module.exports = { abweichungen, schreiben, SPIEGEL, QUELLE };
