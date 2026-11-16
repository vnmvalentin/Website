// backend/sacrificeSigils/socket.js
// Sacrifice & Sigils: Socket.io-Anbindung der Raum-Logik (sacrificeSigils/roomManager.js).
//
// Läuft im Hauptprozess: Ein Kartenspiel erzeugt nur eine Handvoll Nachrichten pro Zug, die Engine rechnet eine Aktion
// in Mikrosekunden. Die Engine selbst ist ein ES-Modul (Spiegel aus dem Frontend, sacrificeSigils/tools/spiegel.js) und
// wird deshalb einmal per import() geladen; Ereignisse, die davor ankommen, warten auf das Laden.
//
// Protokoll (Präfix `ss:`; Antworten per Ack `{ ok, error?, … }`)
//   Client → Server
//     ss:create   { name, token, mask, settings, seed }   Raum anlegen (Ack: code, seat, room)
//     ss:join     { code, name, token, mask }       Beitreten, Wiederverbinden (Token = Platz) oder Zuschauen
//     ss:gesture  { kind, target? }                 Geste am Tisch (eine von sechs, statt Chat); target nur beim Zeigen
//     ss:mask     { mask }                          Maske wechseln (reine Optik, jederzeit)
//     ss:settings { settings, seed }                Host, nur Lobby
//     ss:ready    { ready }                         Bereit; sind beide bereit, startet das Match
//     ss:action   { action }                        Spielzug (Engine-Aktion ohne `player`)
//     ss:rematch  {}                                Revanche mit neuem Seed
//     ss:leave    {}                                Raum verlassen (im laufenden Match = Aufgeben)
//     mw:create / mw:join / mw:settings / mw:ready / mw:action / mw:rematch / mw:leave
//                 dasselbe für die Moorwanderung (Run-Modus, 2–6 Plätze, sacrificeSigils/runRoomManager.js)
//   Server → Client
//     ss:room     Lobby-Zustand (Plätze, Bereit, Einstellungen, Zuschauerzahl)
//     ss:state    { view, events, timers, serverNow, you }   gefilterte Sicht + Ereignisse für die Animations-Queue
//     ss:notice   { text }
//     ss:gesture  { seat, kind, target }            Geste eines anderen (geht nicht an den Absender zurück)
//     ss:kicked   { reason }                        Platz wurde von einem anderen Fenster übernommen
//     mw:room / mw:state / mw:notice / mw:kicked   dasselbe für die Moorwanderung

const path = require('path');
const { pathToFileURL } = require('url');
const { createRoomManager } = require('./roomManager');
const { createRunRoomManager } = require('./runRoomManager');
const { meldeSpielAn } = require('../lib/spielStatistik');

const TICK_MS = 500;
const MAX_EVENTS_PER_SECOND = 30;
const SHARED = path.join(__dirname, 'shared');

let managerPromise = null;
// Admin-Reiter „Spiele“: Räume beider Modi (1 gegen 1 und Moorwanderung); entstehen erst mit dem ersten Besucher
let live = null;
meldeSpielAn('sacrifice-and-sigils', () => {
  let raeume = 0;
  let spieler = 0;
  for (const m of live ? [live.duel, live.run] : []) {
    raeume += m.rooms.size;
    for (const room of m.rooms.values()) for (const s of room.seats) if (s && s.connected) spieler += 1;
  }
  return { raeume, spieler };
});

function getManager(io) {
  if (!managerPromise) {
    managerPromise = (async () => {
      const engine = await import(pathToFileURL(path.join(SHARED, 'engine', 'index.js')).href);
      const { ENGINE_FINGERPRINT } = await import(pathToFileURL(path.join(SHARED, 'version.js')).href);
      const send = (socketId, event, payload) => io.to(socketId).emit(event, payload);
      const manager = createRoomManager({ engine, fingerprint: ENGINE_FINGERPRINT, send });
      const runs = createRunRoomManager({ engine, fingerprint: ENGINE_FINGERPRINT, send });
      setInterval(() => {
        for (const m of [manager, runs]) {
          try {
            m.tick();
          } catch (e) {
            console.error('[sacrifice-sigils] Tick-Fehler:', e);
          }
        }
      }, TICK_MS).unref();
      live = { duel: manager, run: runs };
      return live;
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

  const handle = (event, kind, method) => {
    socket.on(event, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (limited()) return reply({ ok: false, error: 'rateLimited' });
      getManager(io)
        .then((m) => reply(m[kind][method](socket.id, payload && typeof payload === 'object' ? payload : {})))
        .catch(() => reply({ ok: false, error: 'serverError' }));
    });
  };

  for (const method of ['create', 'join', 'settings', 'ready', 'action', 'rematch', 'leave']) {
    handle(`ss:${method}`, 'duel', method);
    handle(`mw:${method}`, 'run', method);
  }
  // Gesten und Masken gibt es nur im Duell (am neuen Tisch); die Moorwanderung kennt sie nicht
  handle('ss:gesture', 'duel', 'gesture');
  handle('ss:mask', 'duel', 'mask');

  socket.on('disconnect', () => {
    if (!managerPromise) return;
    managerPromise.then((m) => { m.duel.detach(socket.id); m.run.detach(socket.id); }).catch(() => {});
  });
}

module.exports = { registerSacrificeSigilsSocket };
