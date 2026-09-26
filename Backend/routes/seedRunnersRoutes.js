// backend/routes/seedRunnersRoutes.js
// Seed Runners: Socket.io-Anbindung der Raum-Logik (seedRunners/roomManager.js).
//
// Läuft im Hauptprozess und nicht in einem eigenen wie Blobby: Der Server rechnet keine Physik.
// Jeder Spieler simuliert sein Level im Browser; hier laufen nur ein paar Dutzend kleine
// Nachrichten pro Rennen (bereit, Checkpoint, Ziel) und drei Timer je Raum. Nichts davon schreibt
// synchron auf die Platte, der Event-Loop bleibt frei für den Rest des Backends.
//
// Protokoll (alle Ereignisse mit Präfix `sr:`; Antworten per Ack `{ ok, error?, … }`)
//   Client → Server
//     sr:create   { name, token, settings, color? } Raum anlegen (Ack: code, you, state); color = Wunschfarbe, wenn frei
//     sr:join     { code, name, token, color? }    Beitreten oder Wiederverbinden (Token = Identität)
//     sr:color    { color }                        eigene Farbe wechseln (Lobby/Ergebnis, nur freie Spielerfarben)
//     sr:settings { length, speedClass, biome, seedMode, seed }   Host, nur Lobby
//     sr:start    { mode: "settings" | "same" | "new" }           Host: Runde starten
//     sr:ready    { hash, checkpoints }            Level ist erzeugt (Hash aller Spieler muss gleich sein)
//     sr:checkpoint { index, tick }                Checkpoint erreicht
//     sr:finish   { ticks, deaths, splits, log, fp }  Ziel erreicht (log + fp für die Replay-Prüfung, siehe seedRunners/replay.js)
//     sr:giveup   {}                               Aufgeben (DNF)
//     sr:lobby    {}                               Host: aus dem Ergebnis zurück in die Lobby
//     sr:leave    {}                               Raum verlassen
//     sr:ping     { t }                            Uhrenabgleich (Ack: t, serverNow)
//   Server → Client
//     sr:state    vollständiger Raumzustand (bei jeder Änderung)
//     sr:notice   { text }                         kurze Meldung (Beitritt, Hostwechsel …)
//     sr:kicked   { reason }                       Platz wurde von einem anderen Fenster übernommen

const crypto = require('crypto');
const { createRoomManager } = require('../seedRunners/roomManager');
const { getRuntime } = require('../seedRunners/runtime');
const { todayDateKey } = require('../dle/core/dailySeed');

const SWEEP_MS = 5 * 60 * 1000;
// Mehr Nachrichten pro Sekunde und Socket sind kein Spiel mehr, sondern ein Fehler oder Missbrauch
const MAX_EVENTS_PER_SECOND = 40;

let manager = null;

// Anti-Cheat und Tagesrangliste hängen an Datenbank und Worker-Thread. Fällt beides aus (z.B. weil das
// native better-sqlite3 fehlt), laufen die Räume trotzdem — nur eben ungeprüft.
function antiCheatDeps() {
  try {
    const rt = getRuntime();
    return {
      verify: (job) => rt.verify(job),
      dailyDateOf: rt.dailyDateOf,
      onVerifiedRun: (run) => rt.onVerifiedRun(run),
      // Custom-Level für eine Serien-Runde auflösen (Phase 4): ohne Datenbank/Level-Dienst werden Custom-Runden
      // im Plan einfach zu Zufallsrunden (roomManager.js) — die Räume laufen also auch ohne das weiter.
      resolveCustomLevel: (code) => rt.levelService.roundLevel(code),
    };
  } catch (e) {
    console.error('[seed-runners] Anti-Cheat nicht verfügbar, Räume laufen ohne Prüfung:', e);
    return {};
  }
}

function getManager(io) {
  if (manager) return manager;
  manager = createRoomManager({
    ...antiCheatDeps(),
    // Räume heißen "sr:CODE": Connect4 nutzt seine Codes ungeprefixt als Raumnamen, ein gleicher
    // Code dort dürfte hier nicht mithören.
    emitRoom: (code, event, payload) => io.to(`sr:${code}`).emit(event, payload),
    emitSocket: (socketId, event, payload) => io.to(socketId).emit(event, payload),
    joinRoom: (socketId, code) => io.in(socketId).socketsJoin(`sr:${code}`),
    leaveRoom: (socketId, code) => io.in(socketId).socketsLeave(`sr:${code}`),
    randomSeed: () => crypto.randomBytes(4).toString('hex'),
    // Berliner Kalendertag wie bei den Daily Games: alle Besucher bekommen am Tag denselben Seed
    todayKey: todayDateKey,
  });
  const sweep = setInterval(() => manager.sweep(), SWEEP_MS);
  sweep.unref?.();
  return manager;
}

function registerSeedRunnersSocket(socket, io) {
  const mgr = getManager(io);
  let windowStart = 0;
  let count = 0;

  const allowed = () => {
    const t = Date.now();
    if (t - windowStart > 1000) {
      windowStart = t;
      count = 0;
    }
    return ++count <= MAX_EVENTS_PER_SECOND;
  };

  // Jeder Handler läuft durch dieselbe Hülle: Tempo begrenzen, Nutzlast absichern, Fehler abfangen,
  // Ergebnis als Ack zurückgeben. Ein Ausnahmefall in einem Raum darf nie den Prozess treffen.
  const on = (event, fn) => {
    socket.on(event, (payload, ack) => {
      let res;
      if (!allowed()) {
        res = { ok: false, error: 'Zu viele Anfragen.' };
      } else {
        try {
          res = fn(payload && typeof payload === 'object' ? payload : {});
        } catch (e) {
          console.error(`[seed-runners] ${event}:`, e);
          res = { ok: false, error: 'Serverfehler.' };
        }
      }
      if (typeof ack === 'function') ack(res);
    });
  };

  on('sr:create', (p) => mgr.create(socket, p));
  on('sr:join', (p) => mgr.join(socket, p));
  on('sr:settings', (p) => mgr.setSettings(socket, p));
  on('sr:color', (p) => mgr.setColor(socket, p));
  on('sr:start', (p) => mgr.start(socket, p));
  on('sr:ready', (p) => mgr.ready(socket, p));
  on('sr:checkpoint', (p) => mgr.checkpoint(socket, p));
  on('sr:finish', (p) => mgr.finish(socket, p));
  on('sr:giveup', () => mgr.giveUp(socket));
  on('sr:lobby', () => mgr.toLobby(socket));
  on('sr:leave', () => mgr.leave(socket));
  on('sr:ping', (p) => mgr.ping(socket, p));

  socket.on('disconnect', () => {
    try {
      mgr.disconnect(socket);
    } catch (e) {
      console.error('[seed-runners] disconnect:', e);
    }
  });
}

function seedRunnersStats() {
  return manager ? manager.stats() : { rooms: 0, players: 0 };
}

module.exports = { registerSeedRunnersSocket, seedRunnersStats };
