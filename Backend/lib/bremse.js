// lib/bremse.js — Anfragen-Bremse je Besucher-Adresse: höchstens `max` Anfragen je `fensterMs` (festes Zeitfenster im
// Speicher, ohne Fremdpaket). Gedacht als Rückhalt gegen Fluten (Sicherheits-Durchgang, 16.11.2026); einzelne Bereiche
// haben eigene, feinere Grenzen (Seed Runners, CR-Scout, Analytics). Dienste auf demselben Rechner (ohne nginx) sind
// ausgenommen. Nach einem Neustart beginnt die Zählung von vorn — für eine Bremse genügt das.

const { clientIp, istLokal } = require("./clientIp");

function createBremse({ fensterMs, max, now = Date.now, aufraeumenAb = 50_000 }) {
  if (!(fensterMs > 0) || !(max > 0)) throw new Error("Bremse braucht fensterMs und max");
  const zaehler = new Map(); // Schlüssel -> { start, n }

  function aufraeumen(t) {
    for (const [k, z] of zaehler) if (t - z.start >= fensterMs) zaehler.delete(k);
  }

  /** Zählt eine Anfrage. Liefert 0, wenn sie durchdarf, sonst die Wartezeit in ms bis zum nächsten Fenster. */
  function treffer(schluessel) {
    const t = now();
    let z = zaehler.get(schluessel);
    if (!z || t - z.start >= fensterMs) {
      if (zaehler.size >= aufraeumenAb) aufraeumen(t);
      z = { start: t, n: 0 };
      zaehler.set(schluessel, z);
    }
    z.n += 1;
    return z.n > max ? Math.max(1, fensterMs - (t - z.start)) : 0;
  }

  const timer = setInterval(() => aufraeumen(now()), Math.max(fensterMs, 60_000));
  if (timer.unref) timer.unref();
  return { treffer, groesse: () => zaehler.size, stopp: () => clearInterval(timer) };
}

/** Express-Middleware: 429 mit Retry-After und JSON-Fehlertext, sobald eine Adresse ihr Fenster überzieht */
function bremseMiddleware({ fensterMs, max, meldung = "Zu viele Anfragen. Bitte kurz warten.", now } = {}) {
  const bremse = createBremse({ fensterMs, max, now });
  const mw = (req, res, next) => {
    if (istLokal(req)) return next();
    const warten = bremse.treffer(clientIp(req));
    if (!warten) return next();
    res.set("Retry-After", String(Math.ceil(warten / 1000)));
    res.status(429).json({ error: meldung });
  };
  mw.bremse = bremse;
  return mw;
}

module.exports = { createBremse, bremseMiddleware };
