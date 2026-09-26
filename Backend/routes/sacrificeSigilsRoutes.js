// backend/routes/sacrificeSigilsRoutes.js
// Sacrifice & Sigils: Socket.io-Anbindung der Raum-Logik (sacrificeSigils/roomManager.js).
//
// Läuft im Hauptprozess: Ein Kartenspiel erzeugt nur eine Handvoll Nachrichten pro Zug, die Engine rechnet eine Aktion
// in Mikrosekunden. Die Engine selbst ist ein ES-Modul (Spiegel aus dem Frontend, sacrificeSigils/tools/spiegel.js) und
// wird deshalb einmal per import() geladen; Ereignisse, die davor ankommen, warten auf das Laden.
//
// Protokoll (Präfix `ss:`; Antworten per Ack `{ ok, error?, … }`)
//   Client → Server
//     ss:create   { name, token, settings, seed }   Raum anlegen (Ack: code, seat, room)
//     ss:join     { code, name, token }             Beitreten, Wiederverbinden (Token = Platz) oder Zuschauen
//     ss:settings { settings, seed }                Host, nur Lobby
//     ss:ready    { ready }                         Bereit; sind beide bereit, startet das Match
//     ss:action   { action }                        Spielzug (Engine-Aktion ohne `player`)
//     ss:rematch  {}                                Revanche mit neuem Seed
//     ss:leave    {}                                Raum verlassen (im laufenden Match = Aufgeben)
//   Server → Client
//     ss:room     Lobby-Zustand (Plätze, Bereit, Einstellungen, Zuschauerzahl)
//     ss:state    { view, events, timers, serverNow, you }   gefilterte Sicht + Ereignisse für die Animations-Queue
//     ss:notice   { text }
//     ss:kicked   { reason }                        Platz wurde von einem anderen Fenster übernommen

const path = require('path');
const { pathToFileURL } = require('url');
const { createRoomManager } = require('../sacrificeSigils/roomManager');

const TICK_MS = 500;
const MAX_EVENTS_PER_SECOND = 30;
const SHARED = path.join(__dirname, '..', 'sacrificeSigils', 'shared');

let managerPromise = null;

function getManager(io) {
  if (!managerPromise) {
    managerPromise = (async () => {
      const engine = await import(pathToFileURL(path.join(SHARED, 'engine', 'index.js')).href);
      const { ENGINE_FINGERPRINT } = await import(pathToFileURL(path.join(SHARED, 'version.js')).href);
      const manager = createRoomManager({
        engine,
        fingerprint: ENGINE_FINGERPRINT,
        send: (socketId, event, payload) => io.to(socketId).emit(event, payload),
      });
      setInterval(() => {
        try {
          manager.tick();
        } catch (e) {
          console.error('[sacrifice-sigils] Tick-Fehler:', e);
        }
      }, TICK_MS).unref();
      return manager;
    })().catch((e) => {
      console.error('[sacrifice-sigils] Engine konnte nicht geladen werden:', e);
      managerPromise = null;
      throw e;
    });
  }
  return managerPromise;
}

function registerSacrificeSigilsSocket(socket, io) {
  let windowStart = Date.now();
  let count = 0;
  const limited = () => {
    const t = Date.now();
    if (t - windowStart > 1000) { windowStart = t; count = 0; }
    count += 1;
    return count > MAX_EVENTS_PER_SECOND;
  };

  const handle = (event, method) => {
    socket.on(event, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (limited()) return reply({ ok: false, error: 'rateLimited' });
      getManager(io)
        .then((m) => reply(m[method](socket.id, payload && typeof payload === 'object' ? payload : {})))
        .catch(() => reply({ ok: false, error: 'serverError' }));
    });
  };

  handle('ss:create', 'create');
  handle('ss:join', 'join');
  handle('ss:settings', 'settings');
  handle('ss:ready', 'ready');
  handle('ss:action', 'action');
  handle('ss:rematch', 'rematch');
  handle('ss:leave', 'leave');

  socket.on('disconnect', () => {
    if (!managerPromise) return;
    managerPromise.then((m) => m.detach(socket.id)).catch(() => {});
  });
}

module.exports = { registerSacrificeSigilsSocket };
