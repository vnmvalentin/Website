// konto/sitzung.js — Sitzung lesen und die Anmelde-Middlewares für alle Routen (index.js reicht sie an die Router).
//
//   requireAuth    Twitch-Anmeldung nötig (Kanal, Twitch-Daten, alle bisherigen Bereiche). Setzt twitchId/twitchLogin
//                  und kontoId. Discord- und Gastkonten bekommen 401 mit twitchNoetig: true.
//   optionalAuth   wie requireAuth, lässt aber alle durch (twitchId nur bei Twitch-Sitzungen)
//   requireKonto   irgendein Konto nötig (Twitch, Discord oder Gast) — Spielstände, Abzeichen, Konto-Einstellungen
//   optionalKonto  wie requireKonto, lässt aber alle durch
//
// Sitzungen von vor den Konten (ohne konto_id) bekommen ihr Konto beim ersten Gebrauch; es zählt in der Wiederkehr-Zahl
// nicht als neu (bestand). Jeder Gebrauch merkt den aktiven Tag des Kontos (kontoStore.merkeAktiv, einmal je Tag) —
// außer beim Betreiber.

const { parseCookieHeader } = require("../lib/cookies");

function createSitzungsHelfer({ sessionStore, kontoStore, betreiberTwitchId = null, lebensdauerMs, secureCookie = false, log = console }) {
  const istBetreiberId = (twitchId) => Boolean(betreiberTwitchId) && String(twitchId) === String(betreiberTwitchId);

  /** @returns {{ twitchId: string|null, twitchLogin: string|null, kontoId: string|null } | null} */
  function sitzungLesen(sessionId) {
    const s = sessionStore.get(sessionId);
    if (!s) return null;
    let kontoId = s.kontoId;
    try {
      if (!kontoId && s.twitchId) {
        kontoId = kontoStore.kontoVonLink("twitch", s.twitchId)
          || kontoStore.anmelden("twitch", s.twitchId, { name: s.twitchLogin }, { bestand: true }).kontoId;
        sessionStore.setzeKonto(sessionId, kontoId);
      }
      if (kontoId && !istBetreiberId(s.twitchId)) kontoStore.merkeAktiv(kontoId);
    } catch (e) {
      log.error("[konto] Sitzung ohne Konto:", e.message);
    }
    return { twitchId: s.twitchId, twitchLogin: s.twitchLogin, kontoId: kontoId || null };
  }

  function setzeSitzungsCookie(res, sessionId) {
    res.cookie("session", sessionId, {
      httpOnly: true,
      secure: secureCookie,
      // secure/strict brechen Cookies auf http://localhost (ohne TLS)
      sameSite: secureCookie ? "strict" : "lax",
      maxAge: lebensdauerMs,
    });
  }
  const loescheSitzungsCookie = (res) => res.clearCookie("session");

  function requireAuth(req, res, next) {
    const sessionId = req.cookies?.session;
    if (!sessionId) return res.status(401).json({ error: "Nicht eingeloggt" });
    const session = sitzungLesen(sessionId);
    // Wortlaut mit „Session“/„ungültig“/„abgelaufen“: die Farm erkennt daran den Login-Fehler (GameContainer.jsx)
    if (!session) return res.status(401).json({ error: "Session ungültig oder abgelaufen" });
    if (!session.twitchId) return res.status(401).json({ error: "Nicht eingeloggt", twitchNoetig: true });
    req.twitchId = session.twitchId;
    req.twitchLogin = session.twitchLogin;
    req.kontoId = session.kontoId;
    next();
  }

  function optionalAuth(req, res, next) {
    const session = sitzungLesen(req.cookies?.session);
    if (session?.twitchId) {
      req.twitchId = session.twitchId;
      req.twitchLogin = session.twitchLogin;
    }
    if (session?.kontoId) req.kontoId = session.kontoId;
    next();
  }

  function requireKonto(req, res, next) {
    const session = sitzungLesen(req.cookies?.session);
    if (!session?.kontoId) return res.status(401).json({ error: "Nicht angemeldet" });
    req.kontoId = session.kontoId;
    if (session.twitchId) {
      req.twitchId = session.twitchId;
      req.twitchLogin = session.twitchLogin;
    }
    next();
  }

  function optionalKonto(req, res, next) {
    const session = sitzungLesen(req.cookies?.session);
    if (session?.kontoId) {
      req.kontoId = session.kontoId;
      if (session.twitchId) {
        req.twitchId = session.twitchId;
        req.twitchLogin = session.twitchLogin;
      }
    }
    next();
  }

  // Sockets laufen nicht durch Express: die Sitzung kommt direkt aus dem Cookie des Handshakes.
  // parseCookieHeader (lib/cookies.js) wirft nie — ein kaputter Cookie beendete früher den Prozess.
  const sitzungVonSocket = (socket) => sitzungLesen(parseCookieHeader(socket?.handshake?.headers?.cookie).session);

  /** Nur Twitch-Sitzungen — Discord- und Gastkonten gelten für die Twitch-Bereiche als nicht angemeldet */
  const getTwitchIdFromSocket = (socket) => sitzungVonSocket(socket)?.twitchId || null;
  function getSessionFromSocket(socket) {
    const s = sitzungVonSocket(socket);
    return s?.twitchId ? { twitchId: s.twitchId, twitchLogin: s.twitchLogin } : null;
  }
  /** Für Spiele, die jedes Konto annehmen: { kontoId, twitchId|null, twitchLogin|null } oder null */
  function getKontoFromSocket(socket) {
    const s = sitzungVonSocket(socket);
    return s?.kontoId ? s : null;
  }

  return {
    sitzungLesen, istBetreiberId, setzeSitzungsCookie, loescheSitzungsCookie,
    requireAuth, optionalAuth, requireKonto, optionalKonto,
    getTwitchIdFromSocket, getSessionFromSocket, getKontoFromSocket,
  };
}

module.exports = { createSitzungsHelfer };
