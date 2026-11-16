// lib/cookies.js — Cookie-Kopfzeile lesen, ohne bei kaputten Werten zu werfen.
//
// Socket.io-Verbindungen laufen nicht durch cookie-parser (Express), deshalb liest index.js den Handshake-Kopf selbst.
// Früher warf decodeURIComponent bei einem kaputten Prozentzeichen (z. B. "session=%E0%A4%A") einen URIError mitten im
// connection-Handler — das beendete den ganzen Prozess samt Discord-Bot und Twitch-Chat (nachgestellt 16.11.2026).
// Jetzt gilt: Ein unlesbarer Wert bleibt roh stehen, es fliegt nie eine Ausnahme. Wie bei cookie-parser gewinnt der
// erste Cookie eines Namens; das Ergebnis hat keinen Prototyp, damit Namen wie "__proto__" nichts verbiegen.

function decodeSicher(wert) {
  if (!wert.includes("%")) return wert;
  try {
    return decodeURIComponent(wert);
  } catch {
    return wert;
  }
}

/** @returns {Record<string, string>} Objekt ohne Prototyp */
function parseCookieHeader(header) {
  const out = Object.create(null);
  if (typeof header !== "string" || !header) return out;
  for (const paar of header.split(";")) {
    const idx = paar.indexOf("=");
    if (idx === -1) continue;
    const name = paar.slice(0, idx).trim();
    if (!name || name in out) continue;
    let wert = paar.slice(idx + 1).trim();
    if (wert.length >= 2 && wert.startsWith('"') && wert.endsWith('"')) wert = wert.slice(1, -1);
    out[name] = decodeSicher(wert);
  }
  return out;
}

module.exports = { parseCookieHeader };
