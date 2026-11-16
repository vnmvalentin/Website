// lib/clientIp.js — Adresse des Besuchers hinter nginx.
//
// nginx hängt die echte Adresse als LETZTEN Eintrag an X-Forwarded-For an; alles davor kann der Besucher selbst
// mitschicken und ist deshalb wertlos. Ohne den Kopf (direkte Anfrage) zählt die Socket-Adresse. Dieselbe Regel steht
// als eigene Kopie in analytics, clashRoyale/scout, seedRunners und garden/world/zweitkonto.

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function clientIp(req) {
  const weiter = String((req.headers && req.headers["x-forwarded-for"]) || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return weiter.length ? weiter[weiter.length - 1] : (req.socket && req.socket.remoteAddress) || "unbekannt";
}

/** Anfrage eines Dienstes auf demselben Rechner (Statuswächter, Werkzeuge): kommt ohne nginx und damit ohne den Kopf */
function istLokal(req) {
  return !(req.headers && req.headers["x-forwarded-for"]) && LOOPBACK.has(req.socket && req.socket.remoteAddress);
}

module.exports = { clientIp, istLokal };
