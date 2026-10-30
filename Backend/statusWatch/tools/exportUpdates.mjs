// statusWatch/tools/exportUpdates.mjs — die neuesten Website-Updates als JSON auf stdout (läuft LOKAL in deploy.sh).
// Quelle ist dieselbe Liste wie die Seite /updates: Frontend/src/utils/newData.js (NEWS_UPDATES, neueste zuerst).
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, "..", "..", "..", "Frontend", "src", "utils", "newData.js");
const LIMIT = 5;

const { NEWS_UPDATES } = await import(pathToFileURL(source).href);
if (!Array.isArray(NEWS_UPDATES) || !NEWS_UPDATES.length) {
  console.error(`NEWS_UPDATES in ${source} fehlt oder ist leer`);
  process.exit(1);
}
process.stdout.write(JSON.stringify({ entries: NEWS_UPDATES.slice(0, LIMIT) }));
