// tools/spiegel.js — erzeugt oder prüft alle Spiegel auf einmal.
//
// Mehrere Spiele rechnen auf dem Server mit einer KOPIE ihres Frontend-Codes nach (Seed Runners: Sim und Generator,
// Sacrifice & Sigils: Engine, Flick Soccer: Physik, Worldflip: Regeln, Farm: Katalog). Jede Kopie hat ihr eigenes
// Werkzeug; dieses hier ruft sie der Reihe nach auf, damit man sich nur einen Befehl merken muss.
//
//   npm run spiegel                     alle Spiegel neu schreiben
//   npm run spiegel -- worldflip flick  nur diese
//   npm run spiegel:pruefen             nur prüfen; Rückgabewert 1, wenn einer veraltet ist (nutzt deploy.sh)

const { spawnSync } = require('child_process');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const SPIEGEL = {
  seedrunners: 'seedRunners/tools/simSpiegel.js',
  sigils: 'sacrificeSigils/tools/spiegel.js',
  flick: 'flickSoccer/tools/spiegel.js',
  worldflip: 'worldflip/tools/spiegel.js',
  garden: 'garden/tools/katalogSpiegel.js',
};

const args = process.argv.slice(2);
const pruefen = args.includes('--pruefen');
const namen = args.filter((a) => !a.startsWith('--'));

const unbekannt = namen.filter((n) => !SPIEGEL[n]);
if (unbekannt.length) {
  console.error(`Unbekannter Spiegel: ${unbekannt.join(', ')} (vorhanden: ${Object.keys(SPIEGEL).join(', ')})`);
  process.exit(2);
}

const auswahl = namen.length ? namen : Object.keys(SPIEGEL);
const veraltet = [];
for (const name of auswahl) {
  const res = spawnSync(process.execPath, [SPIEGEL[name], ...(pruefen ? ['--pruefen'] : [])], {
    cwd: BACKEND,
    stdio: 'inherit',
  });
  if (res.status !== 0) veraltet.push(name);
}

if (veraltet.length) {
  console.error(pruefen
    ? `\nVeraltet: ${veraltet.join(', ')} — im Ordner Backend:  npm run spiegel -- ${veraltet.join(' ')}`
    : `\nFehlgeschlagen: ${veraltet.join(', ')}`);
  process.exit(1);
}
console.log(pruefen ? `\nAlle Spiegel aktuell (${auswahl.join(', ')}).` : `\nSpiegel geschrieben (${auswahl.join(', ')}).`);
