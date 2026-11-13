// tools/test.js — alle Tests oder nur die eines Bereichs, in einem Befehl.
//
//   npm test                                alle *.test.js im Backend
//   npm test -- garden worldflip            nur diese Ordner
//   npm test -- clashRoyale/tournament      Unterordner gehen auch
//
// Das Frontend ruft dieselbe Datei mit --root=src/pages auf (siehe Frontend/package.json). node --test bekommt dafür
// Suchmuster <ordner>/**/*.test.{js,mjs}; ein nacktes "garden/**" würde sonst JEDE Datei als Test ausführen.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const rootArg = args.find((a) => a.startsWith('--root='));
const root = rootArg ? rootArg.slice('--root='.length) : '.';
const ordner = args.filter((a) => !a.startsWith('--'));

const fehlend = ordner.filter((o) => !fs.existsSync(path.join(root, o)));
if (fehlend.length) {
  console.error(`Ordner nicht gefunden (unter ${root}): ${fehlend.join(', ')}`);
  process.exit(2);
}

const basen = ordner.length ? ordner.map((o) => path.posix.join(root.replace(/\\/g, '/'), o)) : [root.replace(/\\/g, '/')];
const muster = basen.flatMap((b) => [`${b}/**/*.test.js`, `${b}/**/*.test.mjs`]);

const res = spawnSync(process.execPath, ['--test', ...muster], { stdio: 'inherit' });
process.exit(res.status ?? 1);
