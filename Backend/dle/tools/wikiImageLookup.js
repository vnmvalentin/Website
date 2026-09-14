// wikiImageLookup.js — gemeinsame Bildsuche für alle -dle-Datensätze, ausgehend von einem
// kuratierten `wikiTitle`-Feld pro Eintrag. Aus fetchTempdleImages.js herausgelöst, als
// Velocidle denselben Mechanismus brauchte — sonst hätte dieselbe ~40-Zeilen-Logik zweimal
// im Repo gelegen.
//
// Zwei Versuche pro Titel, in dieser Reihenfolge:
//  1. wikiTitle → verknüpftes Wikidata-Objekt → dessen P18-Bild (Special:FilePath). Das ist
//     das "offizielle" Vorschaubild eines Wikidata-Objekts und meist eine echte, zum Thema
//     passende Aufnahme (nicht nur eine Lagekarte o.ä.).
//  2. Fällt (1) aus (kein Wikidata-Objekt oder kein P18), Wikipedia-Zusammenfassungs-API als
//     Fallback — liefert das Artikel-Titelbild, das aber gelegentlich eine Karte/ein Diagramm
//     statt eines Fotos ist. Besser als gar kein Bild.
// Schlägt beides fehl, gibt resolveImage null zurück.
const IMAGE_WIDTH = 500;
const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'vnmvalentin-dle-dataset/1.0 (valentin.heiner@gmail.com)',
};

async function getWikidataQid(title) {
  const url = `https://de.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageprops&ppprop=wikibase_item&format=json`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  const json = await res.json();
  const page = Object.values(json.query?.pages || {})[0];
  return page?.pageprops?.wikibase_item || null;
}

async function getWikidataImage(qid) {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  const json = await res.json();
  const filename = json.entities?.[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!filename) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${IMAGE_WIDTH}`;
}

async function getWikipediaThumbnail(title) {
  const url = `https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  const json = await res.json();
  return json.thumbnail?.source || null;
}

async function resolveImage(title) {
  try {
    const qid = await getWikidataQid(title);
    if (qid) {
      const wdImage = await getWikidataImage(qid);
      if (wdImage) return wdImage;
    }
  } catch { /* fällt unten auf den Wikipedia-Fallback zurück */ }

  try {
    return await getWikipediaThumbnail(title);
  } catch {
    return null;
  }
}

// Gemeinsame Lauf-Logik: liest eine JSON-Datei mit Einträgen, die je ein `wikiTitle`-Feld
// tragen (und optional schon ein `image`), holt fehlende Bilder und schreibt die Datei
// zurück. --force holt auch bereits aufgelöste Einträge neu.
async function resolveImagesInFile(fs, filePath, { force = false } = {}) {
  const entries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const results = [];
  const failed = [];
  for (const entry of entries) {
    if (entry.image && !force) {
      results.push(entry);
      continue;
    }
    if (!entry.wikiTitle) {
      results.push({ ...entry, image: null });
      failed.push(entry.id + ' (kein wikiTitle)');
      continue;
    }
    const image = await resolveImage(entry.wikiTitle);
    results.push({ ...entry, image });
    if (!image) failed.push(entry.id);
    console.log(`${image ? '✓' : '✗'} ${entry.id} (${entry.wikiTitle})`);
  }
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2) + '\n');
  console.log(`\n${results.length - failed.length}/${results.length} Bilder gefunden.`);
  if (failed.length) console.log('Ohne Bild:', failed.join(', '));
  return { total: results.length, failed };
}

module.exports = { resolveImage, resolveImagesInFile };
