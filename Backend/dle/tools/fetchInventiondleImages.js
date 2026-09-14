// fetchInventiondleImages.js — holt zu jedem Inventiondle-Eintrag (inventiondle-entries.json)
// ein Bild, ausgehend vom kuratierten `wikiTitle`-Feld. Nur von Hand erneut ausführen:
//   node dle/tools/fetchInventiondleImages.js [--force]
//
// Selbe Such-Logik wie fetchTempdleImages.js/fetchVelocidleImages.js — siehe wikiImageLookup.js.
const fs = require('fs');
const path = require('path');
const { resolveImagesInFile } = require('./wikiImageLookup');

const dataPath = path.join(__dirname, '../data/inventiondle-entries.json');
const force = process.argv.includes('--force');

resolveImagesInFile(fs, dataPath, { force }).catch((err) => {
  console.error('Abruf fehlgeschlagen:', err);
  process.exit(1);
});
