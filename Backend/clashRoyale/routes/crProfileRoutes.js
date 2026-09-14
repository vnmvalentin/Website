// crProfileRoutes.js — API für das dauerhafte Clash-Royale-Profil (Name, Avatar, verknüpfte
// CR-Accounts). GET/PUT laufen wie bei crStreamerRoutes.js über die Twitch-Session
// (requireAuth) — Gäste ohne Login speichern ihr Profil rein im Browser (siehe
// Frontend/src/pages/ClashRoyale/useProfile.js) und brauchen dafür keine dieser Routen.
//
// Mehrere CR-Accounts pro Profil möglich (crProfileStore.js: crAccounts-Liste + crTag/crName
// als "gerade aktiver" Zeiger): /link-cr fügt einen weiteren hinzu und macht ihn aktiv,
// /switch-cr wechselt nur den aktiven Zeiger (keine erneute API-Prüfung nötig), /unlink-cr
// entfernt gezielt einen (oder ohne tag im Body: den aktiven, Rückwärtskompatibilität).
//
// Die Tag-Prüfung (/verify-cr-tag) ist bewusst OHNE requireAuth: sie braucht nur den
// serverseitigen CR-API-Token, nicht die Identität des Aufrufers, und auch Gäste sollen
// ihren Tag im Profil verifizieren können, bevor sie ihn lokal speichern. Die eigentliche
// Verknüpfung mit einem LOBBY-Spieler läuft weiterhin unverändert über den
// clash:linkCrAccount-Socket-Event (Backend/routes/clashRoyaleRoutes.js) — diese Datei
// dupliziert nur die Prüfung, nicht die Lobby-Logik.
const express = require("express");
const store = require("../lib/crProfileStore");
const { isConfigured: crApiConfigured, normalizeTag, fetchPlayerSummary } = require("../lib/crApi");

function createCrProfileRouter({ requireAuth } = {}) {
  const router = express.Router();

  const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

  router.get(
    "/",
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(store.getOrCreateProfile(req.twitchId, req.twitchLogin || ""));
    })
  );

  router.put(
    "/",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      const profile = store.saveProfile(req.twitchId, {
        twitchLogin: req.twitchLogin || "",
        displayName: body.displayName,
        avatarId: body.avatarId,
        useTwitchAvatar: body.useTwitchAvatar,
      });
      res.json(profile);
    })
  );

  // Nur prüfen, nicht speichern — siehe Kommentar oben. Gleiches Fehlerformat wie
  // clash:linkCrAccount, damit der Client dieselbe resolveError()-Übersetzung nutzen kann.
  router.post(
    "/verify-cr-tag",
    asyncHandler(async (req, res) => {
      if (!crApiConfigured()) return res.json({ ok: false, key: "apiNotConfigured" });
      const clean = normalizeTag(req.body?.tag);
      if (!clean) return res.json({ ok: false, key: "invalidTag" });

      let profile;
      try {
        profile = await fetchPlayerSummary(clean);
      } catch {
        return res.json({ ok: false, key: "tagLookupFailed" });
      }
      if (!profile || profile.notFound) return res.json({ ok: false, key: "tagNotFound" });
      res.json({ ok: true, tag: clean, name: profile.name });
    })
  );

  // Prüfen UND im Profil speichern (nur eingeloggt — Gäste speichern das Ergebnis von
  // /verify-cr-tag selbst in localStorage, siehe useProfile.js). Fügt den Account der Liste
  // hinzu (mehrere Accounts pro Profil möglich) und macht ihn zum aktiven — bestehende Aufrufer,
  // die nur den einen crTag/crName kennen, sehen also weiterhin genau das, was sie erwarten.
  router.post(
    "/link-cr",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!crApiConfigured()) return res.json({ ok: false, key: "apiNotConfigured" });
      const clean = normalizeTag(req.body?.tag);
      if (!clean) return res.json({ ok: false, key: "invalidTag" });

      let cr;
      try {
        cr = await fetchPlayerSummary(clean);
      } catch {
        return res.json({ ok: false, key: "tagLookupFailed" });
      }
      if (!cr || cr.notFound) return res.json({ ok: false, key: "tagNotFound" });

      const profile = store.addCrAccount(req.twitchId, req.twitchLogin || "", clean, cr.name);
      res.json({ ok: true, tag: clean, name: cr.name, profile });
    })
  );

  // Ohne tag im Body: der aktive Account wird entfernt (Rückwärtskompatibilität zum
  // bisherigen Ein-Account-Verhalten). Mit tag: gezielt EINEN von mehreren entfernen.
  router.post(
    "/unlink-cr",
    requireAuth,
    asyncHandler(async (req, res) => {
      const tag = req.body?.tag ? normalizeTag(req.body.tag) : store.getProfile(req.twitchId)?.crTag;
      const profile = tag ? store.removeCrAccount(req.twitchId, tag) : store.getOrCreateProfile(req.twitchId, req.twitchLogin || "");
      res.json(profile);
    })
  );

  // Aktiven Account wechseln, ohne ihn neu gegen die API zu prüfen — er steht schon
  // verifiziert in der Liste (aus /link-cr).
  router.post(
    "/switch-cr",
    requireAuth,
    asyncHandler(async (req, res) => {
      const tag = normalizeTag(req.body?.tag);
      if (!tag) return res.json({ ok: false, key: "invalidTag" });
      const profile = store.setActiveCrAccount(req.twitchId, tag);
      res.json({ ok: true, profile });
    })
  );

  return router;
}

module.exports = createCrProfileRouter;
