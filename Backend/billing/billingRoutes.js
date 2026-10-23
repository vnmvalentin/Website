// billingRoutes.js — Abo-Routen unter /api/billing und der Stripe-Webhook.
//
//   GET  /status     Abo-Stand des angemeldeten Nutzers (auch: ist Bezahlen überhaupt eingerichtet?)
//   POST /checkout   Bezahlseite öffnen — { consent: true } ist Pflicht (Widerrufs-Hinweis gelesen)
//   POST /portal     Stripe-Kundenportal öffnen (kündigen, Zahlungsart, Rechnungen)
//   POST /webhook    von Stripe aufgerufen; braucht den ROHEN Body für die Signaturprüfung und
//                    wird deshalb in index.js VOR express.json() eingehängt (billingWebhook)
const express = require("express");
const store = require("./billingStore");
const { premiumStatus } = require("./entitlements");
const { createBillingService, missingConfig } = require("./billingService");

// Wohin Stripe zurückschicken darf — nur eigene Seiten, nie eine frei mitgegebene Adresse
const RETURN_PATHS = new Set(["/twitch-tools", "/abo", "/profile"]);
const returnPathOf = (v) => (RETURN_PATHS.has(v) ? v : "/twitch-tools");

function createBillingRouter({ requireAuth, service = createBillingService() } = {}) {
  const router = express.Router();

  router.get("/status", requireAuth, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
      configured: missingConfig().length === 0,
      premium: premiumStatus(req.twitchId),
      hasCustomer: !!store.customerOf(req.twitchId),
    });
  });

  router.post("/checkout", requireAuth, async (req, res) => {
    if (missingConfig().length) return res.status(503).json({ error: "Bezahlen ist noch nicht eingerichtet." });
    if (req.body?.consent !== true) return res.status(400).json({ error: "Bitte bestätige zuerst den Hinweis zum Widerrufsrecht." });
    const status = premiumStatus(req.twitchId);
    if (status.active) return res.status(409).json({ error: "Du hast bereits Zugriff." });
    try {
      store.addConsent(req.twitchId, "widerruf-abo");
      const out = await service.createCheckout({ twitchId: req.twitchId, twitchLogin: req.twitchLogin, returnPath: returnPathOf(req.body?.returnPath) });
      res.json(out);
    } catch (e) {
      console.error("[billing] checkout:", e.message);
      res.status(502).json({ error: "Die Bezahlseite ließ sich nicht öffnen. Bitte später erneut versuchen." });
    }
  });

  router.post("/portal", requireAuth, async (req, res) => {
    if (missingConfig().length) return res.status(503).json({ error: "Bezahlen ist noch nicht eingerichtet." });
    try {
      const out = await service.createPortal({ twitchId: req.twitchId, returnPath: returnPathOf(req.body?.returnPath) });
      if (out.error) return res.status(404).json({ error: "Zu diesem Konto gibt es kein Abo." });
      res.json(out);
    } catch (e) {
      console.error("[billing] portal:", e.message);
      res.status(502).json({ error: "Die Abo-Verwaltung ließ sich nicht öffnen. Bitte später erneut versuchen." });
    }
  });

  return router;
}

/**
 * Webhook als eigenes Stück Middleware: express.raw() liefert den unveränderten Body, den
 * Stripe signiert hat. Antwortet immer schnell — Stripe wiederholt sonst die Zustellung.
 */
function createBillingWebhook({ service = createBillingService() } = {}) {
  const handler = async (req, res) => {
    if (missingConfig().length) return res.status(503).send("not configured");
    let event;
    try {
      event = service.parseWebhook(req.body, req.headers["stripe-signature"]);
    } catch (e) {
      console.warn("[billing] Webhook mit ungültiger Signatur:", e.message);
      return res.status(400).send("bad signature");
    }
    try {
      await service.handleEvent(event);
      res.json({ received: true });
    } catch (e) {
      // 500 => Stripe versucht es später erneut (das Ereignis gilt erst nach Erfolg als verarbeitet)
      console.error("[billing] Webhook-Verarbeitung:", event.type, e.message);
      res.status(500).send("error");
    }
  };
  return [express.raw({ type: "application/json", limit: "1mb" }), handler];
}

module.exports = { createBillingRouter, createBillingWebhook };
