// pack.mjs — packt twitch-extension/dist/ in ein Zip zum Hochladen in der Twitch-Entwicklerkonsole
// („Files“ → Upload Version Assets). Ohne Paket: Node bringt Deflate (zlib) und CRC32 mit.
//
// Twitch erwartet die Dateien direkt im Zip (kein umschließender Ordner). Die Seiten liegen darin unter
// twitch-extension/panel.html und twitch-extension/config.html — genau diese Pfade gehören in der Konsole bei
// „Panel Viewer Path“ und „Config Path“ eingetragen (siehe docs/twitch-erweiterung/PLAN.md).
//
//   node twitch-extension/scripts/pack.mjs          (läuft mit npm run twitch-ext:build automatisch)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "..", "dist");
const ZIP_NAME = "win-tracker-twitch-extension.zip";

/** Alle Dateien unter dir, Pfade mit „/“, ohne frühere Zips. */
export function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else if (!entry.name.endsWith(".zip")) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort();
}

/** Zip im Speicher bauen. files: [{ name, data: Buffer }] — feste Zeit (1.1.2026), damit gleiche Eingabe gleiches Zip gibt. */
export function buildZip(files) {
  const DOS_TIME = 0; // 00:00:00
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = zlib.crc32(data);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    // Lohnt sich Deflate nicht (Bilder, Schriften), unkomprimiert speichern
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const method = stored ? 0 : 8;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8-Namen
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }
  const centralSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function main() {
  if (!fs.existsSync(dist)) {
    console.error("twitch-extension/dist fehlt — erst bauen: npm run twitch-ext:build");
    process.exit(1);
  }
  const names = listFiles(dist);
  for (const page of ["twitch-extension/panel.html", "twitch-extension/config.html"]) {
    if (!names.includes(page)) {
      console.error(`${page} fehlt im Build`);
      process.exit(1);
    }
  }
  const zip = buildZip(names.map((name) => ({ name, data: fs.readFileSync(path.join(dist, name)) })));
  const target = path.join(dist, ZIP_NAME);
  fs.writeFileSync(target, zip);
  console.log(`${names.length} Dateien → ${path.relative(process.cwd(), target)} (${(zip.length / 1024).toFixed(0)} KB)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
