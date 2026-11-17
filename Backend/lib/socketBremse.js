// lib/socketBremse.js — Grenzen für socket.io-Verbindungen (Absicherung 17.11.2026).
//
// Die HTTP-Bremse (lib/bremse.js) sieht Sockets nur beim Aufbau; danach konnte eine einzelne Adresse beliebig viele
// Verbindungen offen halten und über jede beliebig viele Ereignisse schicken — jedes davon läuft durch die Spiel-Handler
// im selben Prozess wie Discord-Bot und Twitch-Chat. Drei Grenzen, alle je Besucher-Adresse bzw. je Verbindung:
//   • gleichzeitig offene Verbindungen je Adresse (Standard 100 — OBS-Quellen, mehrere Tabs und geteilte Anschlüsse
//     bleiben weit darunter),
//   • neue Verbindungen je Minute und Adresse (Standard 240),
//   • Ereignisse je Verbindung in 5 Sekunden (Standard 1000 = 200/s; die schnellsten Spiele senden rund 10–30/s).
// Wer die Ereignis-Grenze reißt, wird getrennt. Dienste auf demselben Rechner (ohne nginx) sind ausgenommen.

const { createBremse } = require("./bremse");

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Adresse hinter nginx: letzter Eintrag von X-Forwarded-For (den hängt nginx an), sonst die der Verbindung */
function socketIp(socket) {
  const hs = socket.handshake || {};
  const weiter = String((hs.headers && hs.headers["x-forwarded-for"]) || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return weiter.length ? weiter[weiter.length - 1] : hs.address || "unbekannt";
}

function socketIstLokal(socket) {
  const hs = socket.handshake || {};
  return !(hs.headers && hs.headers["x-forwarded-for"]) && LOOPBACK.has(hs.address);
}

/**
 * @param {object} io  socket.io-Server
 * @param {object} [o]
 * @param {number} [o.maxOffen]        gleichzeitig offene Verbindungen je Adresse
 * @param {number} [o.maxNeuJeMinute]  neue Verbindungen je Minute und Adresse
 * @param {number} [o.maxEreignisse]   Ereignisse je Verbindung in `fensterMs`
 * @param {number} [o.fensterMs]
 * @param {(art: string, ip: string) => void} [o.bericht]  wird gedrosselt gerufen (höchstens einmal je Minute und Art)
 */
function schuetzeSocketServer(io, {
  maxOffen = 100, maxNeuJeMinute = 240, maxEreignisse = 1000, fensterMs = 5000, bericht = null, now = Date.now,
} = {}) {
  const offen = new Map(); // Adresse -> Anzahl offener Verbindungen
  const neu = createBremse({ fensterMs: 60_000, max: maxNeuJeMinute, now });
  const zuletztGemeldet = new Map();
  const melde = (art, ip) => {
    const t = now();
    if (t - (zuletztGemeldet.get(art) || 0) < 60_000) return;
    zuletztGemeldet.set(art, t);
    console.warn(`[socket] Grenze erreicht (${art}) von ${ip}`);
    if (bericht) {
      try { bericht(art, ip); } catch { /* Melden darf den Schutz nicht stören */ }
    }
  };

  io.use((socket, next) => {
    if (socketIstLokal(socket)) return next();
    const ip = socketIp(socket);
    if (neu.treffer(ip)) {
      melde("zu viele neue Verbindungen", ip);
      return next(new Error("rate_limited"));
    }
    const n = offen.get(ip) || 0;
    if (n >= maxOffen) {
      melde("zu viele offene Verbindungen", ip);
      return next(new Error("too_many_connections"));
    }
    offen.set(ip, n + 1);
    socket.once("disconnect", () => {
      const rest = (offen.get(ip) || 1) - 1;
      if (rest > 0) offen.set(ip, rest); else offen.delete(ip);
    });

    // Ereignis-Flut: festes Fenster je Verbindung, ohne Timer
    let start = now();
    let zahl = 0;
    socket.use((paket, weiter) => {
      const t = now();
      if (t - start >= fensterMs) { start = t; zahl = 0; }
      zahl += 1;
      if (zahl > maxEreignisse) {
        melde("Ereignis-Flut", ip);
        socket.disconnect(true);
        return undefined; // Ereignis verwerfen
      }
      return weiter();
    });
    return next();
  });

  return { offen: () => offen.size, stopp: () => neu.stopp() };
}

module.exports = { schuetzeSocketServer, socketIp, socketIstLokal };
