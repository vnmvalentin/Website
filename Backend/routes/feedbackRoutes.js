// routes/feedbackRoutes.js — Feedback der Website (Fenster „Feedback“ im Kopf, components/Layout.jsx).
//
//   POST /api/feedback/main                 { message, seite } — speichern (feedback/feedbackStore.js) und wie bisher
//                                           nach Discord (DISCORD_WEBHOOK_MAIN). Mit jedem Konto (Twitch, Discord,
//                                           Gast); der Name kommt vom Konto, nicht aus dem Browser.
//   GET  /api/feedback/admin?status=…       Betreiber: Liste (offen | beantwortet | erledigt | alle) und Zahlen
//   POST /api/feedback/admin/:id/antwort    Betreiber: { text } — Antwort; landet in der Glocke des Absenders und als
//                                           Mitteilung (Thema „antworten“), wenn er beim Senden angemeldet war
//   POST /api/feedback/admin/:id/status     Betreiber: { status: offen | erledigt }
//
// Die Bremse (5 je 10 min) gilt nur fürs Absenden, nicht für die Admin-Liste.
const express = require("express");
const { bremseMiddleware } = require("../lib/bremse");

/** Discord-Post wie bisher; ein Fehler dort kostet das Feedback nicht mehr (es ist ja gespeichert) */
async function postDiscord({ name, nachricht, beantwortbar }) {
  const url = process.env.DISCORD_WEBHOOK_MAIN;
  if (!url || url.includes("HIER")) return false;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Website Feedback Bot",
      avatar_url: "https://cdn-icons-png.flaticon.com/512/2583/2583166.png",
      embeds: [{
        title: "📬 Allgemeines Feedback / Kontakt",
        color: 5763719,
        fields: [
          { name: "👤 User", value: name, inline: true },
          { name: "💬 Nachricht", value: nachricht.length > 1000 ? `${nachricht.slice(0, 1000)}…` : nachricht },
        ],
        footer: { text: `${beantwortbar ? "Antworten: Admin → Feedback · " : ""}Gesendet am ${new Date().toLocaleString("de-DE")}` },
      }],
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Discord ${res.status}`);
  return true;
}

/**
 * @param {object} deps
 * @param {ReturnType<import('../feedback/feedbackStore').createFeedbackStore>} deps.store
 * @param {Function} deps.optionalKonto  konto/sitzung.js
 * @param {Function} deps.requireAuth
 * @param {(req) => boolean} deps.istBetreiber
 * @param {(kontoId: string) => { name: string } | null} deps.kontoAnsicht
 * @param {(nachricht: object) => Promise<any>} deps.melde  lib/mitteilungen.js meldeMitteilung
 */
module.exports = function createFeedbackRouter({ store, optionalKonto, requireAuth, istBetreiber, kontoAnsicht, melde, discord = postDiscord, log = console }) {
  const router = express.Router();
  const bremse = bremseMiddleware({ fensterMs: 10 * 60_000, max: 5, meldung: "Zu viele Nachrichten. Bitte etwas später erneut." });
  const nurBetreiber = (req, res, next) => (istBetreiber(req) ? next() : res.status(403).json({ error: "Nur für den Betreiber." }));

  router.post("/main", optionalKonto, bremse, async (req, res) => {
    const roh = req.body?.message;
    if (typeof roh !== "string" || roh.trim().length === 0) {
      return res.status(400).json({ error: "Nachricht darf nicht leer sein." });
    }
    const nachricht = roh.trim().slice(0, 2000);
    const konto = req.kontoId ? kontoAnsicht(req.kontoId) : null;
    const name = konto?.name || (typeof req.body?.user === "string" && req.body.user.trim() ? req.body.user.trim().slice(0, 100) : "Anonym");
    let gespeichert;
    try {
      gespeichert = store.lege({ kontoId: konto ? req.kontoId : null, name, nachricht, seite: req.body?.seite });
    } catch (e) {
      log.error("[feedback] nicht gespeichert:", e.message);
      return res.status(500).json({ error: "Interner Serverfehler" });
    }
    try {
      await discord({ name, nachricht, beantwortbar: Boolean(gespeichert.kontoId) });
    } catch (e) {
      log.error("[feedback] Discord:", e.message);
    }
    return res.json({ success: true });
  });

  router.get("/admin", requireAuth, nurBetreiber, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ eintraege: store.liste(String(req.query.status || "offen")), zahlen: store.zahlen() });
  });

  router.post("/admin/:id/antwort", requireAuth, nurBetreiber, async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (text.length < 2) return res.status(400).json({ error: "Die Antwort ist leer." });
    const fb = store.eins(req.params.id);
    if (!fb) return res.status(404).json({ error: "Feedback nicht gefunden." });
    const neu = store.antworte(fb.id, text);
    let zugestellt = false;
    if (fb.kontoId) {
      // Glocke + Mitteilung; die Glocke zeigt die Antwort ganz, die Mitteilung den Anfang
      await melde({
        thema: "antworten",
        konten: [fb.kontoId],
        titel: { de: "Antwort auf dein Feedback", en: "Reply to your feedback" },
        text: { de: text, en: text },
        url: "/?glocke=1",
        tag: `feedback-${fb.id}`,
      });
      zugestellt = true;
    }
    return res.json({ eintrag: neu, zugestellt });
  });

  router.post("/admin/:id/status", requireAuth, nurBetreiber, (req, res) => {
    const neu = store.setzeStatus(req.params.id, req.body?.status);
    if (!neu) return res.status(400).json({ error: "Unbekannter Status oder Feedback." });
    return res.json({ eintrag: neu });
  });

  return router;
};
