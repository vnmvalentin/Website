// leistung/index.js — Leistungsmessung echter Besucher: POST /api/leistung nimmt Messungen aus
// Frontend/src/utils/leistungMessung.js an, GET /api/leistung/auswertung liefert dem Betreiber den Admin-Reiter „Leistung“.
//
// Gezählt wird nur, was sich einer bekannten Seite zuordnen lässt (analytics/normalize: Overlays, Steuer-Links, Admin
// fallen heraus), nie von Bots, Prüfständen oder OBS (isBot der Besucherstatistik) und nie die eigenen Besuche des
// Betreibers (sein Rechner würde die Zahlen einer kleinen Seite verzerren). Geräteklasse aus dem User-Agent und der
// Kernzahl: Handy, PC oder „PC schwach“ (höchstens 4 logische Kerne). Antwort immer 204 — der Browser wartet nicht.

const express = require("express");
const { createLeistungStore, GERAETE } = require("./leistungStore");
const { normalizePath, isBot, isMobile } = require("../analytics/normalize");
const { bremseMiddleware } = require("../lib/bremse");

const ARTEN = new Set(["seite", "spiel"]);

function geraeteklasse(userAgent, kerne) {
  if (isMobile(userAgent)) return "Handy";
  const k = Number(kerne);
  return Number.isFinite(k) && k > 0 && k <= 4 ? "PC schwach" : "PC";
}

/** Prüft einen Spiel-Messabschnitt: mindestens 5 s, höchstens 1 h, höchstens 500 Bilder je Sekunde */
function gueltigerAbschnitt(b) {
  const ms = Number(b.ms);
  const bilder = Number(b.bilder);
  const ueber33 = Number(b.ueber33);
  const ueber50 = Number(b.ueber50);
  if (![ms, bilder, ueber33, ueber50].every(Number.isFinite)) return null;
  if (ms < 5000 || ms > 3_600_000 || bilder < 1 || bilder > (ms / 1000) * 500) return null;
  if (ueber33 < 0 || ueber50 < 0 || ueber33 > bilder || ueber50 > ueber33) return null;
  return { ms, bilder: Math.round(bilder), ueber33: Math.round(ueber33), ueber50: Math.round(ueber50) };
}

/**
 * @param {{ optionalAuth: Function, requireAuth: Function, istBetreiber: (req) => boolean, store?: object, log?: object }} deps
 */
function createLeistungsMessung({ store, log = console } = {}) {
  const speicher = store || createLeistungStore();

  function router({ optionalAuth, requireAuth, istBetreiber }) {
    const r = express.Router();

    r.post("/", bremseMiddleware({ fensterMs: 60_000, max: 60 }), optionalAuth, (req, res) => {
      res.status(204).end();
      try {
        const ua = String(req.headers["user-agent"] || "").slice(0, 400);
        if (isBot(ua) || istBetreiber(req)) return;
        const b = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
        if (!b || !ARTEN.has(b.art)) return;
        const seite = normalizePath(typeof b.seite === "string" ? b.seite : "");
        if (!seite) return;
        const geraet = geraeteklasse(ua, b.kerne);
        if (b.art === "seite") {
          if (b.werte && typeof b.werte === "object") speicher.erfasseSeite({ seite, geraet, werte: b.werte });
        } else {
          const a = gueltigerAbschnitt(b);
          if (a) speicher.erfasseSpiel({ seite, geraet, sparmodus: b.sparmodus === true, ...a });
        }
      } catch (e) {
        log.error("[leistung] Messung nicht gezählt:", e && e.message);
      }
    });

    r.get("/auswertung", requireAuth, (req, res) => {
      if (!istBetreiber(req)) return res.status(403).json({ error: "Nur für den Betreiber." });
      const tage = [7, 30, 90].includes(Number(req.query.tage)) ? Number(req.query.tage) : 30;
      const geraet = GERAETE.includes(req.query.geraet) ? req.query.geraet : "alle";
      res.json(speicher.auswertung({ tage, geraet }));
    });

    return r;
  }

  const timer = setInterval(() => {
    try {
      speicher.aufraeumen();
    } catch (e) {
      log.error("[leistung] Aufräumen fehlgeschlagen:", e.message);
    }
  }, 24 * 60 * 60 * 1000);
  if (timer.unref) timer.unref();

  return { store: speicher, router };
}

module.exports = { createLeistungsMessung, geraeteklasse, gueltigerAbschnitt };
