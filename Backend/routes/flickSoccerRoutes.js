// backend/routes/flickSoccerRoutes.js
// Flick Soccer: Socket.io-Anbindung der Raum-Logik (flickSoccer/roomManager.js).
//
// Die Engine ist ein ES-Modul (Spiegel aus dem Frontend, flickSoccer/tools/spiegel.js) und wird einmal per import()
// geladen; Ereignisse, die davor ankommen, warten auf das Laden.
//
// Protokoll (Präfix `fs:`; Antworten per Ack `{ ok, error?, … }`)
//   Client → Server
//     fs:create    { name, token, settings, formation, skin }   Raum anlegen (Ack: code, seat)
//     fs:join      { code, name, token, formation, skin }     Beitreten, Wiederverbinden (Token = Platz) oder Zuschauen
//     fs:formation { formation }                           eigene Aufstellung (nicht während eines Spiels)
//     fs:skin      { skin }                                eigenes Scheiben-Design (jederzeit)
//     fs:settings  { settings }                            Host, nicht während eines Spiels (Tore, Zugzeit, Wiederholung, Feld, Chaos)
//     fs:ready     { ready }                               sind beide bereit, startet das Spiel
//     fs:shoot     { piece, sx, sy }                       Schuss (Richtung × Kraft, Länge ≤ 1)
//     fs:emote     { id }                                  feste Reaktion (engine EMOTES), gedrosselt
//     fs:rematch   {}                                      Revanche (beide müssen zustimmen)
//     fs:leave     {}                                      Raum verlassen (im laufenden Spiel = Aufgeben)
//   Server → Client
//     fs:room      vollständiger Raumzustand inkl. Match und letztem Schuss (zum Abspielen)
//     fs:emote     { seat, id }
//     fs:notice    { text }
//     fs:kicked    { reason }

const path = require('path');
const { pathToFileURL } = require('url');
const { createRoomManager } = require('../flickSoccer/roomManager');

const TICK_MS = 250;
const MAX_EVENTS_PER_SECOND = 20;
const ENGINE = path.join(__dirname, '..', 'flickSoccer', 'shared', 'engine', 'index.js');

let managerPromise = null;

function getManager(io) {
  if (!managerPromise) {
    managerPromise = (async () => {
      const engine = await import(pathToFileURL(ENGINE).href);
      const manager = createRoomManager({ engine, send: (id, event, payload) => io.to(id).emit(event, payload) });
      setInterval(() => {
        try {
          manager.tick();
        } catch (e) {
          console.error('[flick-soccer] Tick-Fehler:', e);
        }
      }, TICK_MS).unref();
      return manager;
    })().catch((e) => {
      console.error('[flick-soccer] Engine konnte nicht geladen werden:', e);
      managerPromise = null;
      throw e;
    });
  }
  return managerPromise;
}

const ACTIONS = {
  'fs:create': 'create',
  'fs:join': 'join',
  'fs:formation': 'setFormation',
  'fs:skin': 'setSkin',
  'fs:settings': 'setSettings',
  'fs:ready': 'setReady',
  'fs:shoot': 'shoot',
  'fs:emote': 'emote',
  'fs:rematch': 'rematch',
  'fs:leave': 'leave',
};

function registerFlickSoccerSocket(socket, io) {
  let windowStart = Date.now();
  let count = 0;
  const limited = () => {
    const t = Date.now();
    if (t - windowStart > 1000) {
      windowStart = t;
      count = 0;
    }
    count += 1;
    return count > MAX_EVENTS_PER_SECOND;
  };

  for (const [event, method] of Object.entries(ACTIONS)) {
    socket.on(event, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (limited()) return reply({ ok: false, error: 'Zu viele Anfragen.' });
      getManager(io)
        .then((m) => reply(m[method](socket.id, payload && typeof payload === 'object' ? payload : {})))
        .catch((e) => {
          console.error(`[flick-soccer] ${event}:`, e);
          reply({ ok: false, error: 'Serverfehler.' });
        });
    });
  }

  socket.on('disconnect', () => {
    if (!managerPromise) return;
    managerPromise.then((m) => m.disconnect(socket.id)).catch(() => {});
  });
}

module.exports = { registerFlickSoccerSocket };
