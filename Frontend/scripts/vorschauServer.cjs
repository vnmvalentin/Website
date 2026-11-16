// scripts/vorschauServer.cjs — Prüfstand für die Vorschaubilder, die ein laufendes Spiel brauchen
// (Virtual Farm: angemeldeter Spielstand; Blobby Volley: Partie mit zwei Spielern).
//
// Aufruf (im Ordner Frontend):
//   node scripts/vorschauServer.cjs
//   VORSCHAU_BASE=http://localhost:5191 node scripts/vorschaubilder.cjs garden blobby
//
// Alles läuft nur im Speicher und auf eigenen Ports — das laufende Backend (3001/3002), der normale
// Dev-Server (5173) und Backend/data bleiben unberührt:
//   Farm   3091  echte Farm-Routen + Socket, Spielstände in einer Map statt in der Datenbank; die Uhr steht
//                auf einem Sommertag (FARM_ZEIT), damit das Bild nicht von der laufenden Jahreszeit abhängt
//   Blobby 3012  der Physikserver (Backend/blobbyServer.js)
//   Vite   5191  Dev-Server, der /api, /socket.io und /blobby-socket auf diese beiden leitet
const path = require('path');
const { spawn } = require('child_process');
const Module = require('module');

const FRONT = path.join(__dirname, '..');
const BACKEND = path.join(FRONT, '..', 'Backend');
const FARM_PORT = 3091;
const BLOBBY_PORT = 3012;
const VITE_PORT = 5191;
/** Mittag eines Sommertags im Farm-Kalender (die Jahreszeiten hängen an der Uhr und wechseln wöchentlich) */
const FARM_ZEIT = 1795546800000;
/** Testkonto: Sitzungs-Cookie "session=vorschau" (bewusst kein Admin — sonst stehen Admin-Knöpfe im Bild) */
const FARM_KONTO = { twitchId: '424242', twitchLogin: 'vnmvalentin' };

module.exports = { FARM_PORT, BLOBBY_PORT, VITE_PORT, FARM_ZEIT, FARM_KONTO };

function farmServer() {
  Date.now = () => FARM_ZEIT;
  const req = Module.createRequire(path.join(BACKEND, 'package.json'));
  // Keine Twitch-Abfragen (Abo-Prüfung) aus dem Prüfstand
  process.env.STREAMER_TWITCH_ID = '';
  process.env.TWITCH_CLIENT_ID = '';
  // Spielstände: Map statt Datenbank — der Speicher wird ersetzt, BEVOR die Routen ihn laden
  const storePath = require.resolve(path.join(BACKEND, 'garden/store/farms.js'));
  const farmStates = new Map();
  const fake = new Module(storePath, null);
  fake.exports = { farmStates, setFarmState: (m, u, s) => m.set(String(u), s), scheduleFarmsSave: () => {}, initGardenFarmsStore: () => {}, saveAllFarmsSync: () => {}, closeDb: () => {} };
  fake.loaded = true;
  require.cache[storePath] = fake;

  const express = req('express');
  const http = require('http');
  const { Server } = req('socket.io');
  const createRouter = require(path.join(BACKEND, 'garden/routes/gardenGameRoutes.js'));
  const { registerGardenSocket } = require(path.join(BACKEND, 'garden/world/lobby.js'));

  const sessionVon = (raw) => (/(?:^|;\s*)session=vorschau(?:;|$)/.test(String(raw || '')) ? FARM_KONTO : null);
  const requireAuth = (r, res, next) => {
    const s = sessionVon(r.headers.cookie);
    if (!s) return res.status(401).json({ error: 'Nicht eingeloggt' });
    r.twitchId = s.twitchId;
    r.twitchLogin = s.twitchLogin;
    return next();
  };
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.get('/api/auth/me', requireAuth, (r, res) => res.json({ twitchId: r.twitchId, twitchLogin: r.twitchLogin }));
  app.get('/api/twitch/clientid', (r, res) => res.json({ clientId: 'vorschau' }));
  app.use('/api/garden', createRouter({ requireAuth }));
  // Spielstand von außen setzen (vorschaubilder.cjs legt hier die vorbereitete Farm ab)
  app.post('/api/vorschau/state/:uid', (r, res) => { farmStates.set(r.params.uid, r.body); res.json({ ok: true }); });
  app.use('/api', (r, res) => res.status(404).json({ error: 'im Prüfstand nicht vorhanden' }));

  const server = http.createServer(app);
  const io = new Server(server);
  io.on('connection', (socket) => registerGardenSocket(socket, io, (s) => sessionVon(s.handshake.headers.cookie), farmStates));
  server.listen(FARM_PORT, '127.0.0.1', () => console.log(`[vorschau] Farm auf ${FARM_PORT}`));
}

async function alles() {
  const kinder = [
    spawn(process.execPath, [__filename, 'farm'], { stdio: 'inherit' }),
    spawn(process.execPath, [path.join(BACKEND, 'blobbyServer.js')], { stdio: 'inherit', cwd: BACKEND, env: { ...process.env, BLOBBY_PORT: String(BLOBBY_PORT) } }),
  ];
  const ende = () => { for (const k of kinder) k.kill(); };
  process.on('exit', ende);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));

  const farm = `http://127.0.0.1:${FARM_PORT}`;
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: FRONT,
    server: {
      port: VITE_PORT,
      strictPort: true,
      proxy: {
        '/api': { target: farm },
        '/logos': { target: farm },
        '/socket.io': { target: farm },
        '/blobby-socket': { target: `http://127.0.0.1:${BLOBBY_PORT}` },
      },
    },
  });
  await vite.listen();
  console.log(`[vorschau] bereit: VORSCHAU_BASE=http://localhost:${VITE_PORT} node scripts/vorschaubilder.cjs garden blobby   (Strg+C beendet)`);
}

if (require.main === module) {
  if (process.argv[2] === 'farm') farmServer();
  else alles().catch((e) => { console.error('[vorschau]', e.message); process.exit(1); });
}
