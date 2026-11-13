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
//     fs:formation { formation }                           Aufstellung: ID oder selbst gebaute ("c:…"), nicht während eines Spiels
//     fs:skin      { skin }                                eigenes Scheiben-Design (jederzeit)
//     fs:settings  { settings }                            Host, nicht während eines Spiels (Tore, Zugzeit, Wiederholung, Feld, Chaos)
//     fs:ready     { ready }                               sind beide bereit, startet das Spiel
//     fs:shoot     { piece, sx, sy, power? }               Schuss (Richtung × Kraft, Länge ≤ 1); power = gespielte Karte (Chaos)
//     fs:emote     { id }                                  feste Reaktion (engine EMOTES), gedrosselt
//     fs:rematch   {}                                      Revanche (beide müssen zustimmen)
//     fs:leave     {}                                      Raum verlassen (im laufenden Spiel = Aufgeben)
//   Server → Client
//     fs:room      vollständiger Raumzustand inkl. Match und letztem Schuss (zum Abspielen)
//     fs:emote     { seat, id }
//     fs:notice    { text }
//     fs:kicked    { reason }
//     fs:closed    { reason, tournament }                  Turnier-Raum wurde geschlossen (kampflos, entschieden, abgesagt)
//
// Turniere (Präfix `ft:`, flickSoccer/tournamentManager.js) — Erstellen und Steuern nur für den Admin (Twitch-Sitzung)
//   Client → Server
//     ft:list      {}                                      alle Turniere (Ack: tournaments, canCreate, sizes)
//     ft:watch     { code, token }                         Turnier ansehen; ab jetzt kommt ft:state (Ack: state, isAdmin)
//     ft:unwatch   {}
//     ft:signup    { code, name, token }                   anmelden bzw. Namen ändern (nur vor dem Start)
//     ft:withdraw  { code, token }                         abmelden (nur vor dem Start)
//     ft:create    { name, maxPlayers, rules[] }           Admin (Ack: code)
//     ft:update    { code, name?, maxPlayers?, rules? }    Admin
//     ft:kick      { code, playerId }                      Admin, vor dem Start
//     ft:start     { code }                                Admin: auslosen und beginnen
//     ft:setWinner { code, matchId, winner }               Admin: offene Paarung von Hand entscheiden
//     ft:cancel    { code }   ft:delete { code }           Admin
//   Server → Client
//     ft:state     Turnierstand inkl. me (eigene Spieler-ID oder null)
//     ft:gone      {}                                      Turnier gelöscht

const path = require('path');
const { pathToFileURL } = require('url');
const { createRoomManager } = require('../flickSoccer/roomManager');
const { createTournamentManager } = require('../flickSoccer/tournamentManager');

const TICK_MS = 250;
const MAX_EVENTS_PER_SECOND = 20;
const ENGINE = path.join(__dirname, '..', 'flickSoccer', 'shared', 'engine', 'index.js');

let managerPromise = null;

function getManager(io) {
  if (!managerPromise) {
    managerPromise = (async () => {
      const engine = await import(pathToFileURL(ENGINE).href);
      const send = (id, event, payload) => io.to(id).emit(event, payload);
      const manager = createRoomManager({ engine, send });
      // Speicher erst hier laden: Prüfstände ohne FLICK_TOURNAMENT_DB sollen die echte Datei nicht schon beim require anlegen
      let store = null;
      try {
        store = require('../flickSoccer/tournamentStore').openTournamentStore();
      } catch (e) {
        console.error('[flick-soccer] Turnier-Speicher nicht verfügbar — Turniere überleben keinen Neustart:', e.message);
      }
      const tournaments = createTournamentManager({ engine, rooms: manager, send, store });
      try {
        const n = tournaments.restore();
        if (n) console.log(`[flick-soccer] ${n} Turnier(e) geladen.`);
      } catch (e) {
        console.error('[flick-soccer] Turniere konnten nicht geladen werden:', e);
      }
      setInterval(() => {
        try {
          manager.tick();
          tournaments.tick();
        } catch (e) {
          console.error('[flick-soccer] Tick-Fehler:', e);
        }
      }, TICK_MS).unref();
      manager.tournaments = tournaments;
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

const TOURNAMENT_ACTIONS = {
  'ft:list': 'list',
  'ft:watch': 'watch',
  'ft:unwatch': 'unwatch',
  'ft:signup': 'signup',
  'ft:withdraw': 'withdraw',
  'ft:create': 'create',
  'ft:update': 'update',
  'ft:kick': 'kick',
  'ft:start': 'start',
  'ft:setWinner': 'setWinner',
  'ft:cancel': 'cancel',
  'ft:delete': 'remove',
};

// ctx.isAdmin: ob hinter dem Socket die Twitch-Sitzung des Betreibers steckt (index.js)
function registerFlickSoccerSocket(socket, io, ctx = {}) {
  const tournamentCtx = { isAdmin: ctx.isAdmin === true };
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

  for (const [event, method] of Object.entries(TOURNAMENT_ACTIONS)) {
    socket.on(event, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (limited()) return reply({ ok: false, error: 'Zu viele Anfragen.' });
      getManager(io)
        .then((m) => reply(m.tournaments[method](socket.id, payload && typeof payload === 'object' ? payload : {}, tournamentCtx)))
        .catch((e) => {
          console.error(`[flick-soccer] ${event}:`, e);
          reply({ ok: false, error: 'Serverfehler.' });
        });
    });
  }

  socket.on('disconnect', () => {
    if (!managerPromise) return;
    managerPromise.then((m) => {
      m.disconnect(socket.id);
      m.tournaments.disconnect(socket.id);
    }).catch(() => {});
  });
}

module.exports = { registerFlickSoccerSocket };
