// fetchTempdleData.js — einmaliger Abruf der Schmelzpunkt-Daten für Tempdle aus Wikidata.
//
// Nicht Teil des laufenden Backends: der Spielserver liest ausschließlich die kuratierte
// ../data/tempdle-elements.json, NIE live von Wikidata (siehe CLAUDE.md-Entscheidung
// "Precompute once, commit dataset" — Wikidata kann down/langsam sein, und Werte sollen vor
// dem Ausliefern an Spieler überprüfbar sein). Dieses Skript hier wird nur von Hand erneut
// ausgeführt, wenn der Datensatz erweitert/aktualisiert werden soll:
//   node dle/tools/fetchTempdleData.js
//
// CURATED_SYMBOLS unten grenzt bewusst auf Elemente ein, die den meisten Leuten aus dem
// Alltag ein Begriff sind (Schmuck, Werkzeug, Verkabelung, Chemie-Unterricht) — nicht die
// komplette Wikidata-Liste. Der erste Anlauf holte alle ~98 Elemente mit Schmelzpunkt, was
// obskure Sachen wie Germanium oder Technetium in die Ratequote brachte, mit denen niemand
// etwas anfangen kann. Liste einfach um weitere Symbole ergänzen und Skript neu laufen
// lassen, um den Datensatz zu erweitern.
const CURATED_SYMBOLS = new Set([
  'Au', // Gold
  'Ag', // Silber
  'Fe', // Eisen
  'Cu', // Kupfer
  'Al', // Aluminium
  'Pb', // Blei
  'Hg', // Quecksilber
  'Zn', // Zink
  'Sn', // Zinn
  'Pt', // Platin
  'Ti', // Titan
  'W',  // Wolfram
  'Ni', // Nickel
  'Na', // Natrium
]);
//
// Quelle: Wikidata P2101 (Schmelzpunkt) an allen Instanzen von "chemisches Element" (Q11344).
// wdt:P2101 (die "truthy"-Kurzform) würde nur die Zahl ohne Einheit liefern — das ist
// gefährlich, weil Wikidata denselben Wert mal in Kelvin, mal in Celsius, mal in Fahrenheit
// hinterlegt (siehe Beryllium: 1278 in °C UND 2349 in °F nebeneinander, beide "Normal"-Rang).
// Deshalb hier über p:/psv: explizit Betrag + Einheit abfragen und selbst nach Celsius
// umrechnen, statt der Kurzform blind zu vertrauen.
const fs = require('fs');
const path = require('path');

const ENDPOINT = 'https://query.wikidata.org/sparql';
// Bildbreite fürs Ausliefern an den Client — hier fest einbacken, damit das Frontend keine
// Wikimedia-URL-Konventionen kennen muss, sondern einfach <img src={round.image}> schreibt.
const IMAGE_WIDTH = 500;
const QUERY = `
SELECT ?item ?itemLabel ?symbol ?atomicNumber ?rank ?amount ?unitLabel ?image WHERE {
  ?item wdt:P31 wd:Q11344.
  ?item wdt:P1086 ?atomicNumber.
  OPTIONAL { ?item wdt:P246 ?symbol. }
  OPTIONAL { ?item wdt:P18 ?image. }
  ?item p:P2101 ?mpStatement.
  ?mpStatement wikibase:rank ?rank.
  FILTER(?rank != wikibase:DeprecatedRank)
  ?mpStatement psv:P2101 ?mpValueNode.
  ?mpValueNode wikibase:quantityAmount ?amount.
  ?mpValueNode wikibase:quantityUnit ?unit.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
}
ORDER BY ?atomicNumber
`;

// Deckt die drei Einheiten ab, die in den Beispielen tatsächlich vorkamen. Alles andere
// bricht das Skript lieber ab, statt einen falsch umgerechneten Wert stillschweigend
// auszuliefern (siehe defensive Programmierung, CLAUDE.md #3).
function toCelsius(amount, unitLabel) {
  const n = Number(amount);
  const u = unitLabel.toLowerCase();
  if (u.includes('celsius')) return n;
  if (u.includes('kelvin')) return n - 273.15;
  if (u.includes('fahrenheit')) return (n - 32) * (5 / 9);
  throw new Error(`Unbekannte Einheit: ${unitLabel}`);
}

async function main() {
  const url = `${ENDPOINT}?query=${encodeURIComponent(QUERY)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      // Wikidata verlangt einen aussagekräftigen User-Agent, sonst drosselt/blockt es.
      'User-Agent': 'vnmvalentin-dle-dataset/1.0 (valentin.heiner@gmail.com)',
    },
  });
  if (!res.ok) throw new Error(`Wikidata antwortete mit ${res.status}`);
  const json = await res.json();

  // Pro Element alle nicht-deprecateten Messungen sammeln, nach Celsius umrechnen und —
  // falls mehrere "Normal"-Rang-Werte widersprüchlich sind (siehe Beryllium oben) — den
  // Mittelwert nehmen. Ein "Preferred"-Rang sticht Normal-Werte immer aus.
  const byItem = new Map();
  for (const b of json.results.bindings) {
    const qid = b.item.value.split('/').pop();
    const celsius = toCelsius(b.amount.value, b.unitLabel.value);
    const preferred = b.rank.value.endsWith('PreferredRank');
    const entry = byItem.get(qid) || {
      qid,
      label: b.itemLabel.value,
      symbol: b.symbol?.value || '',
      atomicNumber: Number(b.atomicNumber.value),
      // Wikidata liefert die Commons-URI als http:// — auf der (https-)Seite würde das als
      // Mixed Content geblockt, deshalb hier auf https erzwingen.
      image: b.image?.value ? `${b.image.value.replace(/^http:/, 'https:')}?width=${IMAGE_WIDTH}` : null,
      normalValues: [],
      preferredValues: [],
    };
    (preferred ? entry.preferredValues : entry.normalValues).push(celsius);
    byItem.set(qid, entry);
  }

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const elements = [...byItem.values()]
    .map((e) => ({
      qid: e.qid,
      label: e.label,
      symbol: e.symbol,
      atomicNumber: e.atomicNumber,
      image: e.image,
      meltingPointC: Math.round(avg(e.preferredValues.length ? e.preferredValues : e.normalValues) * 10) / 10,
      // Nur zur Kontrolle beim Kuratieren sichtbar, fließt nicht ins Spiel ein.
      _sampleCount: e.preferredValues.length || e.normalValues.length,
    }))
    .filter((e) => e.atomicNumber <= 100) // ab da nur noch Laborisotope mit Sekunden Lebensdauer, kein "Schmelzpunkt" im sinnvollen Sinn
    .filter((e) => CURATED_SYMBOLS.has(e.symbol))
    .sort((a, b) => a.atomicNumber - b.atomicNumber);

  const outPath = path.join(__dirname, '../data/tempdle-elements.json');
  fs.writeFileSync(outPath, JSON.stringify(elements, null, 2) + '\n');
  console.log(`${elements.length} Elemente geschrieben nach ${outPath}`);
}

main().catch((err) => {
  console.error('Abruf fehlgeschlagen:', err);
  process.exit(1);
});
