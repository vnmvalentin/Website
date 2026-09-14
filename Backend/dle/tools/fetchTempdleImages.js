// fetchTempdleImages.js — holt zu jedem Tempdle-Phänomen (tempdle-phenomena.json) ein Bild,
// ausgehend vom von Hand kuratierten `wikiTitle`-Feld pro Eintrag. Genau wie
// fetchTempdleData.js NICHT Teil des laufenden Backends — nur von Hand erneut ausführen,
// wenn neue Phänomene mit wikiTitle dazukommen oder ein Bild ersetzt werden soll:
//   node dle/tools/fetchTempdleImages.js [--force]
//
// Die eigentliche Such-Logik (Wikidata P18, Wikipedia-Fallback) steckt in
// wikiImageLookup.js — Velocidle nutzt exakt dieselbe Funktion, siehe fetchVelocidleImages.js.
const fs = require('fs');
const path = require('path');
const { resolveImagesInFile } = require('./wikiImageLookup');

const dataPath = path.join(__dirname, '../data/tempdle-phenomena.json');
const force = process.argv.includes('--force');

resolveImagesInFile(fs, dataPath, { force }).catch((err) => {
  console.error('Abruf fehlgeschlagen:', err);
  process.exit(1);
});
