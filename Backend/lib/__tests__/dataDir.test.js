// Umzug der Live-Daten nach Backend/data/ (lib/dataDir.js) — läuft in einem Scratch-Ordner, nie gegen echte Daten.
// Ausführen: npm test -- lib
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { zieheAlteDatenUm } = require('../dataDir');

function scratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'datadir-'));
}
function schreibe(base, rel, inhalt) {
  const p = path.join(base, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, inhalt);
}
const lies = (base, rel) => fs.readFileSync(path.join(base, rel), 'utf8');
const still = { log: () => {} };

test('Datenbank zieht samt -wal/-shm um, alter Ordner verschwindet', () => {
  const b = scratch();
  schreibe(b, 'streamScenes/data/stream_scenes.db', 'DB');
  schreibe(b, 'streamScenes/data/stream_scenes.db-wal', 'WAL');
  schreibe(b, 'streamScenes/data/stream_scenes.db-shm', 'SHM');
  const r = zieheAlteDatenUm('hauptdienst', { backendDir: b, ...still });
  assert.deepEqual(r, ['stream_scenes.db']);
  assert.equal(lies(b, 'data/stream_scenes.db'), 'DB');
  assert.equal(lies(b, 'data/stream_scenes.db-wal'), 'WAL');
  assert.equal(lies(b, 'data/stream_scenes.db-shm'), 'SHM');
  assert.equal(fs.existsSync(path.join(b, 'streamScenes/data')), false);
  fs.rmSync(b, { recursive: true, force: true });
});

test('Verwaiste -wal am Ziel wird beiseitegelegt, nie mit der echten Datenbank vermischt', () => {
  const b = scratch();
  schreibe(b, 'clashRoyale/data/cr_presets.db', 'ECHT');
  schreibe(b, 'data/cr_presets.db-wal', 'FREMDES-WAL');
  schreibe(b, 'data/cr_presets.db-shm', 'FREMDES-SHM');
  zieheAlteDatenUm('hauptdienst', { backendDir: b, ...still });
  assert.equal(lies(b, 'data/cr_presets.db'), 'ECHT');
  assert.equal(fs.existsSync(path.join(b, 'data/cr_presets.db-wal')), false, 'fremdes WAL darf nicht neben der echten DB liegen');
  const beiseite = fs.readdirSync(path.join(b, 'data')).filter((n) => n.includes('.alt-'));
  assert.equal(beiseite.length, 2);
  assert.ok(beiseite.some((n) => n.startsWith('cr_presets.db-wal.alt-')));
  fs.rmSync(b, { recursive: true, force: true });
});

test('Alte Datei gewinnt gegen eine gleichnamige am Ziel; die Zieldatei bleibt als .alt erhalten', () => {
  const b = scratch();
  schreibe(b, 'statusWatch/data/status_state.json', '{"neu":true}');
  schreibe(b, 'data/status_state.json', '{"alt":true}');
  zieheAlteDatenUm('statusWatch', { backendDir: b, ...still });
  assert.equal(lies(b, 'data/status_state.json'), '{"neu":true}');
  const alt = fs.readdirSync(path.join(b, 'data')).find((n) => n.startsWith('status_state.json.alt-'));
  assert.equal(lies(b, `data/${alt}`), '{"alt":true}');
  fs.rmSync(b, { recursive: true, force: true });
});

test('Jeder Dienst zieht nur seine Dateien um; ein zweiter Lauf tut nichts', () => {
  const b = scratch();
  schreibe(b, 'statusWatch/data/updates_state.json', 'U');
  schreibe(b, 'statusWatch/data/maintenance.json', 'M');
  schreibe(b, 'garden/data/twitch_token.json', 'T');
  assert.deepEqual(zieheAlteDatenUm('hauptdienst', { backendDir: b, ...still }), ['garden_twitch_token.json']);
  assert.ok(fs.existsSync(path.join(b, 'statusWatch/data/updates_state.json')));
  assert.deepEqual(zieheAlteDatenUm('statusWatch', { backendDir: b, ...still }), ['updates_state.json']);
  // maintenance.json läuft ab und zieht nicht mit; der alte Ordner bleibt deshalb stehen
  assert.ok(fs.existsSync(path.join(b, 'statusWatch/data/maintenance.json')));
  assert.deepEqual(zieheAlteDatenUm('hauptdienst', { backendDir: b, ...still }), []);
  assert.deepEqual(zieheAlteDatenUm('statusWatch', { backendDir: b, ...still }), []);
  fs.rmSync(b, { recursive: true, force: true });
});
