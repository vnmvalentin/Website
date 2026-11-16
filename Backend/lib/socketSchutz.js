// lib/socketSchutz.js — ein Fehler in einem Socket-Ereignis darf nicht den ganzen Prozess beenden.
//
// socket.io ruft Ereignis-Handler ohne try/catch auf: Ein Fehler (oder ein abgelehntes Promise eines async-Handlers)
// wird zur uncaughtException/unhandledRejection und beendet den Hauptprozess — samt Discord-Bot, Twitch-Chat und allen
// laufenden Partien (nachgestellt 16.11.2026). schuetzeSocket() ummantelt jeden Handler, den die Spiel-Module danach
// mit socket.on() anmelden: Fehler landen gedrosselt im Log, der Prozess läuft weiter.
//
// once() meldet intern über this.on() an und landet damit auch im Mantel. Der Mantel trägt wie Nodes eigene Hüllen das
// Original in .listener — so finden removeListener()/off() und das Selbst-Abmelden von once() ihn wieder.

const LOG_PAUSE_MS = 60_000;
const zuletzt = new Map(); // Ereignisname -> Zeit der letzten Meldung (endlich viele Namen)

// bericht(ereignis, fehler): optionaler zweiter Weg, im Hauptdienst das Fehlerprotokoll (fehler/index.js meldeServer).
// Läuft hinter derselben Drossel wie das Log — unter einer Fehlerflut also höchstens einmal je Minute und Ereignis.
function melde(ereignis, fehler, log, bericht) {
  const t = Date.now();
  if (t - (zuletzt.get(ereignis) || 0) < LOG_PAUSE_MS) return;
  zuletzt.set(ereignis, t);
  log.error(`[socket] Fehler in "${String(ereignis)}":`, fehler && fehler.stack ? fehler.stack : fehler);
  if (bericht) {
    try {
      bericht(ereignis, fehler);
    } catch {
      // Das Melden darf den Schutz nicht aushebeln
    }
  }
}

function ummantele(ereignis, handler, log, bericht) {
  const geschuetzt = function (...args) {
    try {
      const r = handler.apply(this, args);
      if (r && typeof r.then === "function") r.then(undefined, (e) => melde(ereignis, e, log, bericht));
      return r;
    } catch (e) {
      melde(ereignis, e, log, bericht);
      return undefined;
    }
  };
  geschuetzt.listener = handler;
  return geschuetzt;
}

/** Muss vor dem Anmelden der Handler laufen (am Anfang von io.on("connection")) */
function schuetzeSocket(socket, { log = console, bericht } = {}) {
  const original = socket.on.bind(socket);
  const anmelden = (ereignis, handler) =>
    typeof handler === "function" ? original(ereignis, ummantele(ereignis, handler, log, bericht)) : original(ereignis, handler);
  socket.on = anmelden;
  socket.addListener = anmelden;
  return socket;
}

module.exports = { schuetzeSocket };
