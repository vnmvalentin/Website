// backend/routes/worldflipRoutes.js
// Worldflip: Socket.io-Anbindung der Raum-Logik (worldflip/roomManager.js).
//
// Die Engine ist ein ES-Modul (Spiegel aus dem Frontend, worldflip/tools/spiegel.js) und wird einmal per import()
// geladen; Ereignisse, die davor ankommen, warten auf das Laden.
//
// Protokoll (Präfix `wf:`; Antworten per Ack `{ ok, error?, … }`)
//   Client → Server
//     wf:create    { name, token, settings, skin }   Raum anlegen (Ack: code); skin = Aussehen des eigenen Blobs
//     wf:join      { code, name, token, skin }   Beitreten, Wiederverbinden (Token = Platz) oder Zuschauen
//     wf:settings  { settings }                  Gastgeber, nicht während einer Runde (Spielerzahl, 2 gegen 2, Handkarten, Zugzeit, Bots)
//     wf:team      { team }                      eigenes Team wählen (2 gegen 2), nicht während einer Runde
//     wf:start     {}                            Gastgeber: Runde starten (auch die nächste nach dem Ende)
//     wf:action    { action }                    Zug: { t: 'play', id, world?, target? } | { t: 'draw' } | { t: 'pass' }
//     wf:leave     {}                            Raum verlassen (im laufenden Spiel übernimmt ein Bot)
//   Server → Client
//     wf:room      Raumzustand aus Sicht des Empfängers: eigene Hand, fremde Kartenzahlen, Ereignisse des letzten Zugs
//     wf:notice    { text }
//     wf:kicked    { reason }

const path = require('path');
const { pathToFileURL } = require('url');
const { createRoomManager } = require('../worldflip/roomManager');

const TICK_MS = 250;
const MAX_EVENTS_PER_SECOND = 20;
const ENGINE = path.join(__dirname, '..', 'worldflip', 'shared', 'engine', 'index.js');

let managerPromise = null;

function getManager(io) {
  if (!managerPromise) {
    managerPromise = (async () => {
      const engine = await import(pathToFileURL(ENGINE).href);
      const send = (id, event, payload) => io.to(id).emit(event, payload);
      const manager = createRoomManager({ engine, send });
      setInterval(() => {
        try {
          manager.tick();
        } catch (e) {
          console.error('[worldflip] Tick-Fehler:', e);
        }
      }, TICK_MS).unref();
      return manager;
    })().catch((e) => {
      console.error('[worldflip] Engine konnte nicht geladen werden:', e);
      managerPromise = null;
      throw e;
    });
  }
  return managerPromise;
}

const ACTIONS = {
  'wf:create': 'create',
  'wf:join': 'join',
  'wf:settings': 'setSettings',
  'wf:team': 'setTeam',
  'wf:start': 'start',
  'wf:action': 'action',
  'wf:leave': 'leave',
};

function registerWorldflipSocket(socket, io) {
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
          console.error(`[worldflip] ${event}:`, e);
          reply({ ok: false, error: 'Serverfehler.' });
        });
    });
  }

  socket.on('disconnect', () => {
    if (!managerPromise) return;
    managerPromise.then((m) => m.disconnect(socket.id)).catch(() => {});
  });
}

module.exports = { registerWorldflipSocket };
