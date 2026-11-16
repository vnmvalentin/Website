// konto/kontoRoutes.js — /api/konto: Konto ansehen und verwalten, Anmeldung per Discord oder als Gast, Spielstände
// und Abzeichen. Die Twitch-Anmeldung bleibt POST /api/auth/twitch in index.js (sie legt dort ebenfalls ein Konto an
// oder verknüpft Twitch mit dem Konto der laufenden Sitzung).
//
// Regel für alle Anmeldewege: Wer schon angemeldet ist und sich zusätzlich mit Twitch oder Discord anmeldet, verknüpft
// diesen Weg mit seinem Konto (gehört er schon zu einem anderen Konto, werden beide zusammengeführt — kontoStore.js).
// Der Wiederherstellungscode ist dagegen ein Wechsel: wer ihn eingibt, ist danach in dem Konto, zu dem er gehört.
//
// Discord: eigener Rückweg /api/konto/discord/callback (Scope nur „identify“), getrennt von der Bot-Verknüpfung in
// discord/api/auth.js. Die Adresse muss im Discord-Entwicklerportal als Redirect eingetragen sein. Der Prüfwert im
// `state` hängt an einem kurzlebigen Cookie (SameSite=Lax): das Sitzungs-Cookie ist in Produktion SameSite=Strict und
// kommt beim Rücksprung von discord.com gar nicht an — deshalb merkt sich der Start, zu welchem Konto verknüpft wird.

const crypto = require("crypto");
const express = require("express");
const { bremseMiddleware } = require("../lib/bremse");
const { SPIELE } = require("../analytics/spiele");
const { KATALOG, erfolgInfo } = require("./erfolge");

const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_COOKIE = "konto_oauth";
const SPIEL_NAMEN = Object.fromEntries(SPIELE.map((s) => [s.id, s.name]));

/** Nur interne Pfade als Rücksprungziel (kein Open Redirect) */
function sichererPfad(wert, ersatz = "/profile") {
  if (typeof wert !== "string" || wert.length > 300) return ersatz;
  if (!wert.startsWith("/") || wert.startsWith("//") || wert.startsWith("/\\")) return ersatz;
  return wert;
}

/** Ansicht fürs eigene Konto: wie kontoStore.ansicht, Abzeichen mit Namen und Spiele mit Anzeigenamen */
function kontoFuerBrowser(ansicht) {
  if (!ansicht) return null;
  return {
    ...ansicht,
    spiele: ansicht.spiele.map((s) => ({ ...s, name: SPIEL_NAMEN[s.spiel] || s.spiel })),
    erfolge: ansicht.erfolge.map((e) => {
      const info = erfolgInfo(e.spiel, e.erfolg);
      return { ...e, name: info?.name || null, text: info?.text || null };
    }),
  };
}

function createKontoRouter({
  kontoStore,
  sessionStore,
  requireKonto,
  optionalKonto,
  setzeSitzungsCookie,
  loescheSitzungsCookie,
  frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173",
  discord = {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    redirectUri: process.env.KONTO_DISCORD_REDIRECT_URI || `${process.env.FRONTEND_URL || "http://localhost:5173"}/api/konto/discord/callback`,
  },
  fetchImpl = (...args) => fetch(...args),
  secureCookie = process.env.NODE_ENV === "production",
  log = console,
  now = Date.now,
} = {}) {
  const router = express.Router();
  const offeneStates = new Map(); // nonce → { kontoId, returnTo, bis }

  const gastBremse = bremseMiddleware({ fensterMs: 60 * 60_000, max: 10, meldung: "Zu viele neue Gastkonten von dieser Adresse. Bitte später erneut." });
  const codeBremse = bremseMiddleware({ fensterMs: 15 * 60_000, max: 20, meldung: "Zu viele Versuche. Bitte in ein paar Minuten erneut." });
  const discordBremse = bremseMiddleware({ fensterMs: 15 * 60_000, max: 30, meldung: "Zu viele Anmeldeversuche. Bitte in ein paar Minuten erneut." });
  const standBremse = bremseMiddleware({ fensterMs: 60_000, max: 120, meldung: "Zu viele Speicherungen. Bitte kurz warten." });

  const meinKonto = (req) => kontoFuerBrowser(kontoStore.ansicht(req.kontoId));

  // ── Ansehen ──────────────────────────────────────────────────────────────────────────────────────────────────

  // Kein 401 ohne Anmeldung: die Seite fragt das bei jedem Laden, „nicht angemeldet“ ist dort der Normalfall
  router.get("/ich", optionalKonto, (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!req.kontoId) return res.json({ konto: null });
    const konto = meinKonto(req);
    if (!konto) return res.json({ konto: null });
    // Gleitender Ablauf: wer die Seite nutzt, bleibt angemeldet (sonst müsste ein Gast nach 30 Tagen seinen Code suchen)
    if (sessionStore.verlaengere(req.cookies.session)) setzeSitzungsCookie(res, req.cookies.session);
    res.json({ konto });
  });

  router.get("/katalog", (req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.json({ spiele: SPIELE.map((s) => ({ id: s.id, name: s.name })), erfolge: KATALOG });
  });

  // ── Gast und Wiederherstellungscode ──────────────────────────────────────────────────────────────────────────

  router.post("/gast", optionalKonto, gastBremse, (req, res) => {
    if (req.kontoId) return res.status(409).json({ error: "Du bist schon angemeldet." });
    const { kontoId, code } = kontoStore.erstelleGast();
    kontoStore.merkeAktiv(kontoId);
    setzeSitzungsCookie(res, sessionStore.create({ kontoId }));
    res.json({ konto: kontoFuerBrowser(kontoStore.ansicht(kontoId)), code });
  });

  router.post("/code", codeBremse, (req, res) => {
    const kontoId = kontoStore.kontoVonCode(req.body?.code);
    if (!kontoId) return res.status(404).json({ error: "Diesen Code kennen wir nicht. Bitte genau prüfen." });
    sessionStore.remove(req.cookies.session);
    setzeSitzungsCookie(res, sessionStore.create({ kontoId }));
    res.json({ konto: kontoFuerBrowser(kontoStore.ansicht(kontoId)) });
  });

  router.post("/code/neu", requireKonto, (req, res) => {
    res.json({ code: kontoStore.erneuereCode(req.kontoId) });
  });

  // ── Konto ändern ─────────────────────────────────────────────────────────────────────────────────────────────

  router.post("/name", requireKonto, (req, res) => {
    const r = kontoStore.setzeName(req.kontoId, req.body?.name);
    if (!r.ok) {
      const text = r.fehler === "adresse" ? "Bitte keine Web-Adressen im Namen." : "Der Name braucht 2 bis 24 Zeichen.";
      return res.status(400).json({ error: text, fehler: r.fehler });
    }
    res.json({ konto: meinKonto(req) });
  });

  router.put("/sprache", requireKonto, (req, res) => {
    const r = kontoStore.setzeSprache(req.kontoId, req.body?.sprache);
    if (!r.ok) return res.status(400).json({ error: "Unbekannte Sprache.", fehler: r.fehler });
    res.json({ ok: true, sprache: r.sprache });
  });

  router.post("/trennen", requireKonto, (req, res) => {
    const art = req.body?.art;
    if (art !== "twitch" && art !== "discord") return res.status(400).json({ error: "Unbekannter Anmeldeweg." });
    const r = kontoStore.trenne(req.kontoId, art);
    if (!r.ok) {
      return res.status(409).json({
        error: "Das ist dein letzter Anmeldeweg. Verknüpfe vorher einen anderen oder lege einen Wiederherstellungscode an.",
        fehler: r.fehler,
      });
    }
    // Ohne Twitch gelten die Sitzungen dieses Kontos für die Twitch-Bereiche als nicht angemeldet
    if (art === "twitch") sessionStore.ohneTwitch(req.kontoId);
    res.json({ konto: meinKonto(req) });
  });

  router.delete("/", requireKonto, (req, res) => {
    if (req.body?.bestaetigt !== true) return res.status(400).json({ error: "Bitte das Löschen bestätigen." });
    kontoStore.loesche(req.kontoId);
    sessionStore.entferneKonto(req.kontoId);
    loescheSitzungsCookie(res);
    res.json({ ok: true });
  });

  // ── Discord ──────────────────────────────────────────────────────────────────────────────────────────────────

  const discordBereit = () => Boolean(discord.clientId && discord.clientSecret && discord.redirectUri);

  function zurueck(res, returnTo, status, grund) {
    let ziel;
    try {
      const url = new URL(returnTo, frontendUrl);
      url.searchParams.set("konto", status);
      if (grund) url.searchParams.set("grund", grund);
      ziel = `${frontendUrl.replace(/\/$/, "")}${url.pathname}${url.search}${url.hash}`;
    } catch {
      ziel = `${frontendUrl.replace(/\/$/, "")}/profile?konto=fehler`;
    }
    res.clearCookie(STATE_COOKIE, { path: "/api/konto/discord" });
    res.redirect(ziel);
  }

  router.get("/discord/start", optionalKonto, discordBremse, (req, res) => {
    const returnTo = sichererPfad(req.query.returnTo);
    if (!discordBereit()) return zurueck(res, returnTo, "fehler", "discord-aus");
    const t = now();
    if (offeneStates.size > 5000) for (const [k, v] of offeneStates) if (v.bis < t) offeneStates.delete(k);
    const nonce = crypto.randomBytes(16).toString("hex");
    offeneStates.set(nonce, { kontoId: req.kontoId || null, returnTo, bis: t + STATE_TTL_MS });
    res.cookie(STATE_COOKIE, nonce, {
      httpOnly: true, secure: secureCookie, sameSite: "lax", maxAge: STATE_TTL_MS, path: "/api/konto/discord",
    });
    const params = new URLSearchParams({
      client_id: discord.clientId,
      redirect_uri: discord.redirectUri,
      response_type: "code",
      scope: "identify",
      state: nonce,
      prompt: "none",
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  });

  router.get("/discord/callback", async (req, res) => {
    const nonce = typeof req.query.state === "string" ? req.query.state : "";
    const offen = offeneStates.get(nonce);
    offeneStates.delete(nonce);
    const cookieNonce = req.cookies?.[STATE_COOKIE] || "";
    const passt = offen && offen.bis >= now() && cookieNonce.length === nonce.length && nonce.length > 0
      && crypto.timingSafeEqual(Buffer.from(cookieNonce), Buffer.from(nonce));
    if (!passt) return zurueck(res, offen?.returnTo || "/profile", "fehler", "abgelaufen");
    const { returnTo, kontoId } = offen;
    if (req.query.error || typeof req.query.code !== "string") return zurueck(res, returnTo, "fehler", "abgebrochen");

    let nutzer;
    try {
      const tokenAntwort = await fetchImpl("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: discord.clientId,
          client_secret: discord.clientSecret,
          grant_type: "authorization_code",
          code: req.query.code,
          redirect_uri: discord.redirectUri,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const token = await tokenAntwort.json();
      if (!tokenAntwort.ok || !token.access_token) throw new Error(token.error_description || token.error || `Token ${tokenAntwort.status}`);
      const ichAntwort = await fetchImpl("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(8000),
      });
      nutzer = await ichAntwort.json();
      if (!ichAntwort.ok || !nutzer?.id) throw new Error(`Nutzer ${ichAntwort.status}`);
    } catch (e) {
      log.error("[konto] Discord-Anmeldung fehlgeschlagen:", e.message);
      return zurueck(res, returnTo, "fehler", "discord");
    }

    const info = {
      name: nutzer.global_name || nutzer.username,
      avatar: nutzer.avatar ? `https://cdn.discordapp.com/avatars/${nutzer.id}/${nutzer.avatar}.png?size=128` : null,
    };
    try {
      if (kontoId && kontoStore.ansicht(kontoId)) {
        const r = kontoStore.verknuepfe(kontoId, "discord", nutzer.id, info);
        if (!r.ok) return zurueck(res, returnTo, "fehler", r.fehler);
        if (r.entfernt) sessionStore.ersetzeKonto(r.entfernt, r.kontoId);
        return zurueck(res, returnTo, r.entfernt ? "zusammengefuehrt" : "verknuepft");
      }
      const { kontoId: neuesKonto } = kontoStore.anmelden("discord", nutzer.id, info);
      kontoStore.merkeAktiv(neuesKonto);
      sessionStore.remove(req.cookies?.session);
      setzeSitzungsCookie(res, sessionStore.create({ kontoId: neuesKonto }));
      return zurueck(res, returnTo, "angemeldet");
    } catch (e) {
      log.error("[konto] Discord-Konto nicht gespeichert:", e.message);
      return zurueck(res, returnTo, "fehler", "server");
    }
  });

  // ── Spielstände und Abzeichen ────────────────────────────────────────────────────────────────────────────────

  router.get("/staende", requireKonto, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ staende: kontoStore.staende(req.kontoId) });
  });

  router.get("/stand/:spiel", requireKonto, (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!SPIEL_NAMEN[req.params.spiel]) return res.status(404).json({ error: "Unbekanntes Spiel." });
    res.json({ stand: kontoStore.stand(req.kontoId, req.params.spiel) });
  });

  router.put("/stand/:spiel", requireKonto, standBremse, (req, res) => {
    const { daten, xp, version } = req.body || {};
    const r = kontoStore.speichereStand(req.kontoId, req.params.spiel, daten, { xp, version });
    if (r.ok) return res.json({ ok: true, version: r.version, geaendert: r.geaendert });
    if (r.konflikt) return res.status(409).json({ konflikt: true, stand: r.stand });
    const texte = {
      spiel: "Unbekanntes Spiel.", "zu-gross": "Spielstand zu groß (höchstens 64 KB).", xp: "Ungültige Erfahrungspunkte.",
      version: "Ungültige Version.", daten: "Spielstand fehlt.", "konto-fehlt": "Konto nicht gefunden.",
    };
    res.status(r.fehler === "konto-fehlt" ? 401 : 400).json({ error: texte[r.fehler] || "Ungültig.", fehler: r.fehler });
  });

  router.post("/erfolge/:spiel", requireKonto, standBremse, (req, res) => {
    const r = kontoStore.meldeErfolge(req.kontoId, req.params.spiel, req.body?.ids);
    if (!r.ok) return res.status(400).json({ error: "Ungültige Meldung.", fehler: r.fehler });
    res.json({ neu: r.neu, abgelehnt: r.abgelehnt });
  });

  return router;
}

module.exports = { createKontoRouter, kontoFuerBrowser, sichererPfad };
