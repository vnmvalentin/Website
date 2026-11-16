// fehler/index.js — Fehlerprotokoll: Meldungen aus dem Browser (POST /api/fehler) und vom Server (meldeServer) landen in
// einem Speicher (fehlerStore.js); der Betreiber sieht sie im Admin-Reiter „Fehler“ (/api/fehler/liste, /bild/…).
//
// BENACHRICHTIGUNG bei einem neuen Fehlerbild oder einem Rückfall (erledigt → wieder da): BETREIBER_WEBHOOK_URL —
// derselbe private Kanal wie für die Datensicherung, nur in der Server-.env. Höchstens 10 Meldungen je Stunde, stumme
// Bilder nie. Ohne Webhook nur ins Log. Gesendet wird nie aus dem Weg der Anfrage heraus (kein Warten auf Discord).
//
// meldeServer(art, fehler, kontext) ist die Andockstelle für Server-Fehler: Prozess (index.js), Socket-Ereignisse
// (lib/socketSchutz.js) und Anfragen mit 5xx (Fehler-Middleware in index.js). Sie wirft nie.

const express = require("express");
const { createFehlerStore } = require("./fehlerStore");
const { seiteVon, istBot, browserVon, geraetVon } = require("./signatur");
const { bremseMiddleware } = require("../lib/bremse");
const { createWebhook } = require("../statusWatch/webhook");

const ARTEN = new Set(["error", "unhandledrejection", "react", "webgl", "manuell"]);
const STATUS = ["offen", "erledigt", "stumm"];
const MELDUNGEN_JE_STUNDE = 10;

function createBenachrichtiger({ webhookUrl, sende, log = console, now = Date.now, maxJeStunde = MELDUNGEN_JE_STUNDE } = {}) {
  let senden = sende;
  if (!senden && webhookUrl) {
    try {
      const hook = createWebhook(webhookUrl);
      senden = (text) => hook.send({ content: text, allowed_mentions: { parse: [] } });
    } catch (e) {
      log.error(`[fehler] BETREIBER_WEBHOOK_URL: ${e.message} — Meldungen nur im Log`);
    }
  }
  const zeiten = [];
  return function benachrichtige(bild) {
    if (!bild || bild.stumm || bild.verworfen || !(bild.neu || bild.wieder)) return;
    const kopf = bild.wieder ? "Fehlerbild wieder aufgetreten" : "Neues Fehlerbild";
    const text = `${kopf} (${bild.quelle === "server" ? "Server" : "Browser"}, ${bild.art}): ${bild.nachricht}`
      + `\nSeite: ${bild.seite || "–"}${bild.browser ? ` · ${bild.browser}` : ""}${bild.geraet ? ` · ${bild.geraet}` : ""}`;
    log.warn(`[fehler] ${text.replace(/\n/g, " | ")}`);
    if (!senden) return;
    const t = now();
    while (zeiten.length && t - zeiten[0] > 60 * 60 * 1000) zeiten.shift();
    if (zeiten.length >= maxJeStunde) return;
    zeiten.push(t);
    Promise.resolve()
      .then(() => senden(text.slice(0, 1900)))
      .catch((e) => log.warn(`[fehler] Discord-Meldung nicht zugestellt: ${e.message}`));
  };
}

function createFehlerProtokoll({ store, webhookUrl = process.env.BETREIBER_WEBHOOK_URL, log = console, benachrichtige } = {}) {
  const speicher = store || createFehlerStore();
  const melden = benachrichtige || createBenachrichtiger({ webhookUrl, log });

  /** Server-Fehler protokollieren. Wirft nie — ein Fehler beim Melden darf nichts weiter kaputt machen. */
  function meldeServer(art, fehler, kontext = "") {
    try {
      const e = fehler instanceof Error ? fehler : new Error(typeof fehler === "string" ? fehler : JSON.stringify(fehler));
      melden(speicher.melde({
        quelle: "server",
        art: String(art || "server"),
        nachricht: e.message || String(e),
        stapel: e.stack || "",
        kontext: String(kontext || ""),
      }));
    } catch (e) {
      log.error("[fehler] Server-Fehler nicht protokolliert:", e && e.message);
    }
  }

  /** @param {{ requireAuth: Function, istBetreiber: (req) => boolean }} deps */
  function router({ requireAuth, istBetreiber }) {
    const r = express.Router();
    const nurBetreiber = (req, res, next) => (istBetreiber(req) ? next() : res.status(403).json({ error: "Nur für den Betreiber." }));

    // Meldungen aus dem Browser: ohne Login, gebremst; Bots und Prüfstände (headless) zählen nicht
    r.post("/", bremseMiddleware({ fensterMs: 60_000, max: 30 }), (req, res) => {
      const ua = String(req.headers["user-agent"] || "").slice(0, 400);
      if (istBot(ua)) return res.status(204).end();
      const b = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
      if (!b || typeof b.nachricht !== "string" || !b.nachricht.trim()) return res.status(400).json({ error: "Kein Fehlerbericht." });
      try {
        melden(speicher.melde({
          quelle: "browser",
          art: ARTEN.has(b.art) ? b.art : "error",
          nachricht: b.nachricht,
          stapel: typeof b.stapel === "string" ? b.stapel : "",
          seite: seiteVon(b.seite),
          // OBS-Browserquellen melden sich selbst (window.obsstudio), ihr User-Agent sagt es nicht immer
          browser: `${b.obs === true && !/OBS\//.test(ua) ? "OBS · " : ""}${browserVon(ua)}`,
          geraet: geraetVon(ua),
          kontext: typeof b.kontext === "string" ? b.kontext : "",
        }));
      } catch (e) {
        log.error("[fehler] Meldung nicht gespeichert:", e && e.message);
      }
      res.status(204).end();
    });

    r.get("/liste", requireAuth, nurBetreiber, (req, res) => {
      const status = STATUS.includes(req.query.status) ? req.query.status : "offen";
      res.json({ status, bilder: speicher.liste({ status }), zaehler: speicher.zaehler() });
    });

    r.get("/bild/:signatur", requireAuth, nurBetreiber, (req, res) => {
      const d = speicher.details(req.params.signatur);
      if (!d) return res.status(404).json({ error: "Fehlerbild nicht gefunden." });
      res.json(d);
    });

    r.post("/bild/:signatur/status", requireAuth, nurBetreiber, (req, res) => {
      const status = req.body && req.body.status;
      if (!STATUS.includes(status)) return res.status(400).json({ error: "Status muss offen, erledigt oder stumm sein." });
      if (!speicher.setzeStatus(req.params.signatur, status)) return res.status(404).json({ error: "Fehlerbild nicht gefunden." });
      res.json({ ok: true, status });
    });

    return r;
  }

  const timer = setInterval(() => {
    try {
      speicher.aufraeumen();
    } catch (e) {
      log.error("[fehler] Aufräumen fehlgeschlagen:", e.message);
    }
  }, 24 * 60 * 60 * 1000);
  if (timer.unref) timer.unref();

  return { store: speicher, meldeServer, router };
}

module.exports = { createFehlerProtokoll, createBenachrichtiger, ARTEN };
