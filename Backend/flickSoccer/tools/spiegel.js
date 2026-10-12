#!/usr/bin/env node
// flickSoccer/tools/spiegel.js
// Spiegelt die Engine von Flick Soccer ins Backend.
//
//   Quelle    Frontend/src/pages/FlickSoccer/engine/   (ohne __tests__)
//   Spiegel   Backend/flickSoccer/shared/engine/       (+ package.json mit "type": "module")
//
// Der Server ist autoritativ: Er rechnet jeden Online-Schuss mit DERSELBEN Physik nach, die der Browser zum Abspielen
// benutzt. Frontend und Backend werden getrennt ausgeliefert (deploy.sh) — die Frontend-Dateien sind die einzige Quelle,
// das Backend bekommt sie erzeugt, nie von Hand gepflegt. Weicht ein veralteter Browser trotzdem ab, ist das harmlos:
// Nach dem Abspielen übernimmt er den Zustand vom Server.
//
//   node flickSoccer/tools/spiegel.js             schreibt den Spiegel
//   node flickSoccer/tools/spiegel.js --pruefen   meldet nur, Rückgabewert 1 bei Abweichung

const fs = require('fs');
const path = require('path');

const WURZEL = path.resolve(__dirname, '..', '..', '..');
const QUELLE = path.join(WURZEL, 'Frontend', 'src', 'pages', 'FlickSoccer', 'engine');
const SPIEGEL = path.join(WURZEL, 'Backend', 'flickSoccer', 'shared');
const PACKAGE_JSON = `${JSON.stringify({ type: 'module', private: true }, null, 2)}\n`;

const lf = (text) => text.replace(/\r\n/g, '\n');

function sollZustand() {
  const soll = new Map();
  for (const name of fs.readdirSync(QUELLE).sort()) {
    if (name.endsWith('.js')) soll.set(`engine/${name}`, lf(fs.readFileSync(path.join(QUELLE, name), 'utf8')));
  }
  soll.set('package.json', PACKAGE_JSON);
  return soll;
}

function istZustand() {
  const ist = new Map();
  const engine = path.join(SPIEGEL, 'engine');
  if (fs.existsSync(engine)) {
    for (const name of fs.readdirSync(engine)) ist.set(`engine/${name}`, lf(fs.readFileSync(path.join(engine, name), 'utf8')));
  }
  const pj = path.join(SPIEGEL, 'package.json');
  if (fs.existsSync(pj)) ist.set('package.json', lf(fs.readFileSync(pj, 'utf8')));
  return ist;
}

function abweichungen() {
  const soll = sollZustand();
  const ist = istZustand();
  const diff = [];
  for (const [rel, text] of soll) if (ist.get(rel) !== text) diff.push(rel);
  for (const rel of ist.keys()) if (!soll.has(rel)) diff.push(`${rel} (überzählig)`);
  return diff;
}

function schreiben() {
  const soll = sollZustand();
  fs.rmSync(SPIEGEL, { recursive: true, force: true });
  for (const [rel, text] of soll) {
    const ziel = path.join(SPIEGEL, rel);
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, text);
  }
  return soll.size;
}

if (require.main === module) {
  if (process.argv.includes('--pruefen')) {
    const diff = abweichungen();
    if (diff.length) {
      console.error(`Flick Soccer: Engine-Spiegel veraltet (${diff.length} Dateien), z. B. ${diff.slice(0, 5).join(', ')}`);
      process.exit(1);
    }
    console.log('Flick Soccer: Engine-Spiegel aktuell.');
  } else {
    const n = schreiben();
    console.log(`Flick Soccer: ${n} Dateien gespiegelt nach ${path.relative(WURZEL, SPIEGEL)}.`);
  }
}

module.exports = { abweichungen, schreiben, SPIEGEL, QUELLE };
