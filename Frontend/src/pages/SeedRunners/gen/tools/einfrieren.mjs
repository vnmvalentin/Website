#!/usr/bin/env node
// einfrieren.mjs — friert den aktuellen Stand des Level-Generators als Version N ein (archiv/pfad-vN/).
//
// WARUM
// Ein Zufallslevel ist nur „Seed + Biom + Generator-Version“ (gv). Ändert sich der Generator, ergäbe derselbe Seed ein anderes
// Level — Favoriten, Bestenlisten vergangener Tagesrennen und geteilte Seeds wären dann ein anderes Spiel. Deshalb wird jede
// ausgelieferte Generator-Version eingefroren und bleibt für ihre Seeds zuständig (client/generatorArchiv.js im Browser,
// Backend/seedRunners/replay.js auf dem Server).
//
// WAS
// Kopiert sim/, gen/ und level/ (nur .js, ohne __tests__ und tools) unverändert nach archiv/pfad-vN/ — die Ordnerstruktur
// bleibt gleich, deshalb stimmen alle relativen Importe. Die Sim gehört dazu, weil der Generator beim Bauen Züge mit der
// Physik ausprobiert: Auch eine Physik-Änderung würde sonst die Level einer alten Version verändern.
//
// ABLAUF bei einer Generator-Änderung (siehe gen/PLANUNG_WELTTYPEN.md, Abschnitt 16r) — jede Version wird bei ihrer
// Auslieferung eingefroren, die bisherige liegt also schon im Archiv:
//   1. Generator ändern; der Test „Generator-Versionen“ schlägt an (live ≠ Referenz der laufenden Version)
//   2. GEN_VERSION in gen/generator.js und PFAD_GEN_VERSION im Backend (seedRunners/genVersion.js) auf N+1
//   3. den neuen Stand einfrieren: node …/einfrieren.mjs <N+1>, in client/generatorArchiv.js eintragen, Referenz-Level ergänzen
//   4. Stichtag fürs Tagesrennen, im Backend npm run seedrunners:spiegel
//
//   node src/pages/SeedRunners/gen/tools/einfrieren.mjs 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, '..', '..');           // …/SeedRunners
const ORDNER = ['sim', 'gen', 'level'];
const AUSGESCHLOSSEN = new Set(['__tests__', 'tools']);

/** Alle .js-Dateien unter dir (relativ zu WURZEL), ohne Tests und Werkzeuge */
function dateien(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(WURZEL, dir), { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!AUSGESCHLOSSEN.has(e.name)) out.push(...dateien(`${dir}/${e.name}`));
    } else if (e.name.endsWith('.js')) {
      out.push(`${dir}/${e.name}`);
    }
  }
  return out.sort();
}

/**
 * @param {number} version
 * @param {string} [ziel]  Standard: archiv/pfad-v<version> (für Tests auch ein Wegwerf-Ordner)
 * @returns {{ ziel: string, dateien: number }}
 */
export function einfrieren(version, ziel = path.join(WURZEL, 'archiv', `pfad-v${version}`)) {
  if (!Number.isInteger(version) || version < 1) throw new Error('Version muss eine ganze Zahl ≥ 1 sein.');
  if (fs.existsSync(ziel)) throw new Error(`${ziel} gibt es schon — eine eingefrorene Version wird nie überschrieben.`);
  const liste = ORDNER.flatMap(dateien);
  for (const rel of liste) {
    const nach = path.join(ziel, rel);
    fs.mkdirSync(path.dirname(nach), { recursive: true });
    // Zeilenenden vereinheitlichen (wie der Server-Spiegel), damit das Archiv auf jedem Rechner gleich aussieht
    fs.writeFileSync(nach, fs.readFileSync(path.join(WURZEL, rel), 'utf8').replace(/\r\n/g, '\n'));
  }
  fs.writeFileSync(path.join(ziel, 'LIESMICH.md'), [
    `# Generator-Version ${version} (eingefroren)`,
    '',
    `Kopie von sim/, gen/ und level/ zum Zeitpunkt des Einfrierens (${new Date().toISOString().slice(0, 10)}).`,
    'Nie von Hand ändern: Diese Dateien bestimmen, welches Level ein Seed dieser Version ergibt.',
    'Erzeugt von gen/tools/einfrieren.mjs.',
    '',
  ].join('\n'));
  return { ziel, dateien: liste.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = Number(process.argv[2]);
  try {
    const res = einfrieren(version);
    console.log(`Version ${version} eingefroren: ${res.dateien} Dateien nach ${path.relative(process.cwd(), res.ziel)}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
