// backend/routes/lightsOutRoutes.js
// Lights Out (Koop): Socket.io-Anbindung der Räume (lightsOut/rooms.js). Der Server vermittelt nur — die Welt
// entsteht in jedem Browser aus demselben Seed, das Monster rechnet der Browser des Hosts.
//
// Protokoll (Präfix `lo:`; Antworten per Ack `{ ok, error?, … }`)
//   Client → Server
//     lo:create { name, token }           Raum anlegen (Ack: code, seat, room)
//     lo:join   { code, name, token }     beitreten bzw. wiederverbinden (Ack: seat, room, start? wenn Runde läuft)
//     lo:start  { level, seed? }          nur Host: Ebene starten (seed nur zum Neustart derselben Karte)
//     lo:lobby  {}                        nur Host: zurück in den Warteraum
//     lo:state  { r, x, z, yaw, pitch, sp, f }   eigene Lage, ~12×/s (flüchtig)
//     lo:world  { … }                     nur Host: Monster + geteilter Zustand, ~10×/s (flüchtig)
//     lo:event  { type, … }               Spielereignis (zuverlässig)
//     lo:leave  {}
//   Server → Client
//     lo:room   Raumansicht (Spieler, Host, Phase)
//     lo:start  { level, seed, round, hostSeat, players }
//     lo:lobby  {}
//     lo:peer   { seat, … }   ·   lo:world { … }   ·   lo:event { seat, type, … }
//     lo:host   { hostSeat }  ·   lo:left  { seat }

const { createLightsOutRooms } = require('../lightsOut/rooms');

const LIMITS = { 'lo:state': 25, 'lo:world': 25, 'lo:event': 40, other: 6 };

let rooms = null;
function getRooms(io) {
  if (!rooms) {
    rooms = createLightsOutRooms({
      send: (id, event, payload, opts) => {
        const target = io.to(id);
        (opts?.volatile ? target.volatile : target).emit(event, payload);
      },
    });
    setInterval(() => {
      try { rooms.sweep(); } catch (e) { console.error('[lights-out] Aufräumen:', e); }
    }, 60 * 1000).unref();
  }
  return rooms;
}

function registerLightsOutSocket(socket, io) {
  const r = getRooms(io);
  // Je Ereignisart eigenes Fenster: viele Lage-Pakete sollen keine Ereignisse verdrängen
  const windows = {};
  const limited = (event) => {
    const key = LIMITS[event] ? event : 'other';
    const t = Date.now();
    const w = windows[key] || (windows[key] = { start: t, n: 0 });
    if (t - w.start > 1000) { w.start = t; w.n = 0; }
    w.n += 1;
    return w.n > LIMITS[key];
  };
  const safe = (fn) => (payload, ack) => {
    try {
      fn(payload && typeof payload === 'object' ? payload : {}, typeof ack === 'function' ? ack : () => {});
    } catch (e) {
      console.error('[lights-out]', e);
      if (typeof ack === 'function') ack({ ok: false, error: 'Serverfehler.' });
    }
  };

  for (const [event, method] of [['lo:create', 'create'], ['lo:join', 'join'], ['lo:start', 'start'], ['lo:lobby', 'lobby'], ['lo:leave', 'leave']]) {
    socket.on(event, safe((p, ack) => {
      if (limited(event)) return ack({ ok: false, error: 'Zu viele Anfragen.' });
      ack(r[method](socket.id, p));
    }));
  }
  for (const [event, method] of [['lo:state', 'state'], ['lo:world', 'world'], ['lo:event', 'event']]) {
    socket.on(event, safe((p) => {
      if (limited(event)) return;
      r[method](socket.id, p);
    }));
  }
  socket.on('disconnect', () => {
    try { r.disconnect(socket.id); } catch (e) { console.error('[lights-out] disconnect:', e); }
  });
}

module.exports = { registerLightsOutSocket };
