// crFriendRoutes.js — Änderungen an der Freundesliste der Minigames (/api/clash/friends).
//
// Lesen läuft über den Socket (clash:friends:hello → clash:friends:state, siehe core/friends.js),
// hier nur die Aktionen. Jede Antwort enthält den neuen eigenen Stand; die Gegenseite bekommt
// ihren sofort per pushState(), statt bis zum nächsten Takt zu warten.
//
// Fehler wie bei crProfileRoutes.js als { ok: false, key } — der Client übersetzt den Schlüssel
// (hub/friendsI18n.js).
const express = require("express");
const store = require("../lib/crFriendsStore");
const { buildState, pushState, resolveLogin } = require("../core/friends");

function createCrFriendRouter({ requireAuth } = {}) {
  const router = express.Router();

  const otherId = (req) => {
    const id = req.body?.id;
    return typeof id === "string" || typeof id === "number" ? String(id).slice(0, 40) : "";
  };

  // Gemeinsamer Rahmen: Aktion ausführen, beide Seiten aktualisieren, eigenen Stand zurückgeben.
  const action = (fn) => (req, res) => {
    try {
      const result = fn(req);
      if (!result.ok) return res.json(result);
      pushState(req.twitchId);
      if (result.other) pushState(result.other);
      res.json({ ok: true, accepted: !!result.accepted, state: buildState(req.twitchId) });
    } catch (e) {
      console.error("[cr-friends]", e.message);
      res.status(500).json({ ok: false, key: "friendServerError" });
    }
  };

  router.get("/", requireAuth, (req, res) => {
    try { res.json(buildState(req.twitchId)); }
    catch (e) { res.status(500).json({ ok: false, key: "friendServerError" }); }
  });

  router.post("/request", requireAuth, action((req) => {
    const login = String(req.body?.login || "").trim().replace(/^@/, "");
    if (!/^[a-zA-Z0-9_]{3,25}$/.test(login)) return { ok: false, key: "friendInvalidName" };
    const target = resolveLogin(login);
    if (!target) return { ok: false, key: "friendNotFound" };
    const result = store.sendRequest(req.twitchId, target.id);
    return { ...result, other: target.id };
  }));

  router.post("/accept", requireAuth, action((req) => {
    const id = otherId(req);
    return { ...store.acceptRequest(req.twitchId, id), other: id };
  }));

  router.post("/decline", requireAuth, action((req) => {
    const id = otherId(req);
    return { ...store.deleteRequest(id, req.twitchId), other: id };
  }));

  router.post("/cancel", requireAuth, action((req) => {
    const id = otherId(req);
    return { ...store.deleteRequest(req.twitchId, id), other: id };
  }));

  router.post("/remove", requireAuth, action((req) => {
    const id = otherId(req);
    return { ...store.removeFriend(req.twitchId, id), other: id };
  }));

  return router;
}

module.exports = createCrFriendRouter;
