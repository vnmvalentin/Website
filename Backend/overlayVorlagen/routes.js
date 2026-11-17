// routes.js — /api/vorlagen: Community-Vorlagen der Overlay-Galerie (Ausbauplan „vorlagen-teilen“).
//
//   GET    /?tool=&sort=beliebt|neu   öffentliche Vorlagen (+ eigene, die gerade geprüft werden)
//   GET    /gemeldet                  Betreiber: gemeldete und ausgeblendete Vorlagen
//   GET    /:id                       eine Vorlage (öffentlich, eigene oder Betreiber) — die Editoren holen sie beim Übernehmen
//   POST   /                          veröffentlichen { tool, title, style }
//   POST   /:id/use                   übernommen (zählt einmal je Konto)
//   POST   /:id/report                melden (einmal je Konto; ab HIDE_AFTER_REPORTS ausgeblendet bis zur Prüfung)
//   POST   /:id/moderate              Betreiber: { action: "keep" | "remove" }
//   DELETE /:id                       eigene (oder als Betreiber jede) entfernen
//
// Fehler tragen einen code, die Galerie zeigt den Text dazu (pages/StreamerTools/vorlagen/vorlagenTexts.js).
const express = require("express");
const core = require("./core");
const store = require("./store");

function notifyOperator(text) {
  const url = process.env.BETREIBER_WEBHOOK_URL;
  if (!url) return;
  try {
    const { createWebhook } = require("../statusWatch/webhook");
    Promise.resolve(createWebhook(url).send({ content: text, allowed_mentions: { parse: [] } })).catch(() => {});
  } catch { /* ohne Meldung weiter */ }
}

module.exports = function createVorlagenRouter({ requireAuth, optionalAuth, isAdmin = () => false }) {
  const router = express.Router();
  const optional = optionalAuth || ((req, _res, next) => next());
  const fail = (res, status, code, error) => res.status(status).json({ error, code });

  router.get("/", optional, (req, res) => {
    const tool = String(req.query.tool || "");
    if (!core.TOOLS.includes(tool)) return fail(res, 400, "bad_tool", "Unbekanntes Overlay.");
    const sort = req.query.sort === "neu" ? "neu" : "beliebt";
    const userId = req.twitchId ? String(req.twitchId) : "";
    const ctx = { userId, admin: !!userId && isAdmin(req) };
    const rows = store.list(tool, sort);
    // Eigene, die gerade geprüft werden, sieht nur der Besitzer — mit Hinweis statt still zu verschwinden
    const own = userId ? store.ownHidden(tool, userId) : [];
    res.set("Cache-Control", "no-store");
    res.json({ vorlagen: [...own, ...rows].map((r) => core.publicView(r, ctx)) });
  });

  router.get("/gemeldet", requireAuth, (req, res) => {
    if (!isAdmin(req)) return fail(res, 403, "forbidden", "Nur für den Betreiber.");
    res.json({ vorlagen: store.reported().map((r) => core.publicView(r, { userId: req.twitchId, admin: true })) });
  });

  router.get("/:id", optional, (req, res) => {
    const row = store.get(req.params.id);
    const userId = req.twitchId ? String(req.twitchId) : "";
    const admin = !!userId && isAdmin(req);
    if (!row || row.status === "removed" || (row.status !== "public" && row.owner_id !== userId && !admin)) {
      return fail(res, 404, "not_found", "Diese Vorlage gibt es nicht (mehr).");
    }
    res.json({ vorlage: core.publicView(row, { userId, admin }) });
  });

  router.post("/", requireAuth, express.json({ limit: "8kb" }), (req, res) => {
    const userId = String(req.twitchId);
    const { tool, title, style } = req.body || {};
    if (!core.TOOLS.includes(tool)) return fail(res, 400, "bad_tool", "Unbekanntes Overlay.");
    const cleanTitle = core.cleanTitle(title);
    if (!cleanTitle) return fail(res, 400, "bad_title", `Der Name braucht ${core.MIN_TITLE} bis ${core.MAX_TITLE} Zeichen und keine Links.`);
    const cleanStyle = core.sanitizeStyle(tool, style);
    if (!cleanStyle) return fail(res, 400, "bad_style", "Dieser Look lässt sich nicht teilen.");
    if (store.countOwn(tool, userId) >= core.MAX_PER_TOOL) return fail(res, 400, "limit", `Du hast schon ${core.MAX_PER_TOOL} Vorlagen für dieses Overlay geteilt.`);
    if (Date.now() - store.lastPublishAt(userId) < core.PUBLISH_GAP_MS) return fail(res, 429, "too_fast", "Bitte einen Moment warten, bevor du die nächste Vorlage teilst.");
    const id = store.insert({ tool, ownerId: userId, ownerName: req.twitchLogin || "", title: cleanTitle, style: cleanStyle });
    res.json({ ok: true, vorlage: core.publicView(store.get(id), { userId }) });
  });

  router.post("/:id/use", requireAuth, (req, res) => {
    const row = store.get(req.params.id);
    if (!row || row.status !== "public") return fail(res, 404, "not_found", "Diese Vorlage gibt es nicht (mehr).");
    // Eigene zählen nicht — sonst ließe sich die Zahl selbst hochtreiben
    if (row.owner_id !== String(req.twitchId)) store.addUse(row.id, req.twitchId);
    res.json({ ok: true, uses: store.get(row.id).uses });
  });

  router.post("/:id/report", requireAuth, (req, res) => {
    const row = store.get(req.params.id);
    if (!row || row.status === "removed") return fail(res, 404, "not_found", "Diese Vorlage gibt es nicht (mehr).");
    if (row.owner_id === String(req.twitchId)) return fail(res, 400, "own", "Die eigene Vorlage kannst du löschen statt melden.");
    const reports = store.addReport(row.id, req.twitchId);
    if (row.status === "public" && reports >= core.HIDE_AFTER_REPORTS) {
      store.setStatus(row.id, "hidden");
      notifyOperator(`Overlay-Vorlage „${row.title}“ (${row.tool}, von ${row.owner_name || row.owner_id}) wurde ${reports}× gemeldet und ist bis zur Prüfung ausgeblendet. Prüfen: /tools/vorlagen`);
    }
    res.json({ ok: true });
  });

  router.post("/:id/moderate", requireAuth, express.json({ limit: "1kb" }), (req, res) => {
    if (!isAdmin(req)) return fail(res, 403, "forbidden", "Nur für den Betreiber.");
    const row = store.get(req.params.id);
    if (!row) return fail(res, 404, "not_found", "Diese Vorlage gibt es nicht (mehr).");
    const action = req.body && req.body.action;
    if (action === "keep") {
      store.clearReports(row.id);
      store.setStatus(row.id, "public");
    } else if (action === "remove") {
      store.setStatus(row.id, "removed");
    } else {
      return fail(res, 400, "bad_action", "Unbekannte Aktion.");
    }
    res.json({ ok: true });
  });

  router.delete("/:id", requireAuth, (req, res) => {
    const row = store.get(req.params.id);
    if (!row || row.status === "removed") return fail(res, 404, "not_found", "Diese Vorlage gibt es nicht (mehr).");
    if (row.owner_id !== String(req.twitchId) && !isAdmin(req)) return fail(res, 403, "forbidden", "Das ist nicht deine Vorlage.");
    store.setStatus(row.id, "removed");
    res.json({ ok: true });
  });

  return router;
};
