// billing/adminGrants.js — Admin-Reiter „Abos“: das Abo von Hand vergeben (ohne Bezahlung), befristet oder dauerhaft,
// und wieder nehmen. Dazu die Liste der bezahlten Abos zur Übersicht. Nur für den Betreiber.
//
//   GET    /api/billing/admin/abos            { freischaltungen: [...], bezahlt: [...] }
//   POST   /api/billing/admin/abos            { login, tage, notiz }  → Twitch-Name wird zu seiner ID aufgelöst
//   DELETE /api/billing/admin/abos/:twitchId
//
// Eine Freischaltung ist nur ein Eintrag in der Tabelle grants (billingStore.js); ob jemand das Abo hat, entscheidet
// weiter allein entitlements.js. Mit Stripe hat das nichts zu tun — es wird nichts berechnet und nichts gekündigt.
const express = require("express");
const defaultStore = require("./billingStore");

const TAG_MS = 24 * 60 * 60 * 1000;
const MAX_TAGE = 3650;
const LOGIN_RE = /^[a-z0-9][a-z0-9_]{2,24}$/;

/**
 * @param {object} deps
 * @param {Function} deps.requireAuth
 * @param {(req: object) => boolean} deps.istBetreiber
 * @param {(login: string) => Promise<{ id: string, login: string, name: string } | null>} deps.twitchNutzer
 *   Twitch-Konto zu einem Login (null = gibt es nicht); darf werfen, wenn Twitch nicht erreichbar ist
 * @param {(twitchId: string, info: { bis: number }) => void} [deps.benachrichtige]  Hinweis an den Beschenkten (Glocke)
 */
function createAboAdminRouter({ requireAuth, istBetreiber, twitchNutzer, benachrichtige = null, store = defaultStore, now = Date.now }) {
  const router = express.Router();
  router.use(requireAuth, (req, res, next) => (istBetreiber(req) ? next() : res.status(403).json({ error: "Access Denied" })));

  const liste = () => {
    const t = now();
    return {
      freischaltungen: store.listGrants().map((g) => ({
        twitchId: g.twitch_id, login: g.login || "", notiz: g.note || "", bis: g.until || 0, seit: g.created_at,
        aktiv: !g.until || g.until > t,
      })),
      bezahlt: store.listSubscriptions().map((s) => ({
        twitchId: s.twitch_id, status: s.status, bis: s.current_period_end || 0, gekuendigt: !!s.cancel_at_period_end,
      })),
    };
  };

  router.get("/abos", (req, res) => res.json(liste()));

  router.post("/abos", async (req, res, next) => {
    try {
      const login = String(req.body?.login || "").trim().toLowerCase().replace(/^@/, "");
      if (!LOGIN_RE.test(login)) return res.status(400).json({ error: "Das ist kein gültiger Twitch-Name." });
      const tage = Math.floor(Number(req.body?.tage) || 0);
      if (tage < 0 || tage > MAX_TAGE) return res.status(400).json({ error: `Dauer: 0 (dauerhaft) bis ${MAX_TAGE} Tage.` });
      const notiz = String(req.body?.notiz || "").trim().slice(0, 120);

      let nutzer;
      try {
        nutzer = await twitchNutzer(login);
      } catch (e) {
        console.error("[abo-admin] Twitch-Suche:", e?.message || e);
        return res.status(503).json({ error: "Twitch ist gerade nicht erreichbar. Bitte gleich noch einmal." });
      }
      if (!nutzer) return res.status(404).json({ error: `Den Twitch-Kanal „${login}“ gibt es nicht.` });

      const t = now();
      const bis = tage > 0 ? t + tage * TAG_MS : 0;
      store.setGrant(nutzer.id, notiz, bis, t, nutzer.login);
      if (benachrichtige) {
        try { benachrichtige(nutzer.id, { bis }); } catch (e) { console.error("[abo-admin] Hinweis:", e?.message || e); }
      }
      return res.json({ ...liste(), neu: { twitchId: nutzer.id, login: nutzer.login, name: nutzer.name, bis } });
    } catch (e) {
      return next(e);
    }
  });

  router.delete("/abos/:twitchId", (req, res) => {
    const id = String(req.params.twitchId || "");
    if (!/^\d{1,20}$/.test(id)) return res.status(400).json({ error: "Ungültige ID." });
    store.removeGrant(id);
    res.json(liste());
  });

  return router;
}

module.exports = { createAboAdminRouter };
