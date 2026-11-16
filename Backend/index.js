const express = require("express");
// quiet: true unterdrückt die rotierenden "tip:"-Werbezeilen, die dotenv seit v16.4
// bei jedem Start ausgibt (u.a. für unabhängige Nebenprojekte des Maintainers) —
// mit dem eigentlichen Laden der .env hat das nichts zu tun.
require("dotenv").config({ override: true, quiet: true });
// Live-Daten aus den alten <bereich>/data/-Ordnern nach data/ holen — VOR dem ersten Speicher, die meisten öffnen ihre
// Datenbank schon beim require (lib/dataDir.js). Wirft, wenn ein anderer Prozess die Dateien noch offen hält.
require("./lib/dataDir").zieheAlteDatenUm("hauptdienst");
const helmet = require("helmet");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const cookieParser = require("cookie-parser");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args)); 

// --- NEU: HTTP & Socket.io ---
const http = require("http");
const { Server } = require("socket.io");

// Feature-Router
const createBingoRouter = require("./bingo/routes");
const createGiveawayRouter = require("./giveaways/routes");
const createWinchallengeRouter = require("./winchallenge/winchallengeRoutes");
const createPollRouter = require("./polls/routes");
const createAdventureRouter = require("./adventure/routes");
const createAdminRouter = require("./admin/routes");
const createFeedbackRouter = require("./routes/feedbackRoutes");
const createGardenGameRouter = require("./garden/routes/gardenGameRoutes");
const discordClient = require("./discord/bot/index");
const createDiscordRouter = require("./discord/api/index");
const { createClashRoyaleRouter, registerClashRoyaleSocket, initLobbyPersistence } = require("./clashRoyale/routes/clashRoyaleRoutes");
// CR-Lobbys überleben einen Neustart: vor dem ersten Socket laden, beim Beenden speichern
initLobbyPersistence();
const { registerConnect4Socket } = require("./connect4/socket");
const { registerGuessWhoSocket } = require("./clashRoyale/guessWhoRoutes");
const { registerSeedRunnersSocket } = require("./seedRunners/socket");
const { registerSacrificeSigilsSocket } = require("./sacrificeSigils/socket");
const { registerFlickSoccerSocket } = require("./flickSoccer/socket");
const { registerLightsOutSocket } = require("./lightsOut/socket");
const { registerWorldflipSocket } = require("./worldflip/socket");
const { createSeedRunnersRouter } = require("./seedRunners/routes");
const { getRuntime: getSeedRunnersRuntime } = require("./seedRunners/runtime");
// Blobby Volley läuft NICHT hier, sondern als eigener Prozess: blobbyServer.js. Seine
// 75-Hz-Physik verträgt den Event-Loop dieses Prozesses nicht, in dem Discord-Bot,
// Twitch-IRC und synchrone SQLite-Schreibvorgänge stecken. Begründung dort im Kopf.
const createCrStreamerRouter = require("./clashRoyale/routes/crStreamerRoutes");
const { initCrStreamerStore } = require("./clashRoyale/lib/crStreamerStore");
const createCrProfileRouter = require("./clashRoyale/routes/crProfileRoutes");
const createCrFriendRouter = require("./clashRoyale/routes/crFriendRoutes");
const { initCrProfileStore } = require("./clashRoyale/lib/crProfileStore");
const createBannedCardsRouter = require("./clashRoyale/routes/bannedCardsRoutes");
const createNuzlockeRouter = require("./clashRoyale/routes/nuzlockeRoutes");
const createCrWinTrackerRouter = require("./clashRoyale/routes/crWinTrackerRoutes");
const createCrPresetRouter = require("./clashRoyale/routes/crPresetRoutes");
const createTournamentRouter = require("./clashRoyale/tournament/routes");
const { registerTournamentSocket } = require("./clashRoyale/tournament/matchRoom");
const createStreamToolRouter = require("./streamTool/routes/streamToolRoutes");
const { registerLiveBadgesSocket } = require("./lib/liveBadges");
const { createUsedByRouter } = require("./routes/usedByRoutes");
const { createLiveRouter } = require("./routes/liveRoutes");
const { createChatAvatarRouter } = require("./routes/chatAvatarRoutes");
const createStreamScenesRouter = require("./streamScenes/routes/streamScenesRoutes");
const { createAnalyticsRouter } = require("./analytics/analyticsRoutes");
// Admin-Reiter „Spiele“ (lib/spielStatistik.js): Partien je Tag und Live-Zahlen der Spiele
const { meldeSpielAn, liveZahlen, verbindePartienSpeicher } = require("./lib/spielStatistik");
const analyticsStore = require("./analytics/analyticsStore");
const { seedRunnersStats } = require("./seedRunners/socket");
const { _rooms: guessWhoRooms } = require("./clashRoyale/guessWhoRoutes");
const { weltUebersicht } = require("./garden/world/lobby");
const { getActiveLobbiesForAdmin: crLobbiesFuerAdmin } = require("./clashRoyale/core/lobbies");
const { createOgRouter } = require("./og/ogRoutes");
const { createActivityRouter } = require("./activity/activityRoutes");
const { createProfileRouter, buildProfile: buildPublicProfile } = require("./profile/profileRoutes");
const { createProfileStore } = require("./profile/profileStore");
const { previousDay: seedRunnersPreviousDay } = require("./seedRunners/daily");
const { createBillingRouter, createBillingWebhook } = require("./billing/billingRoutes");
const {
    saveAllFarmsOnExit, initGardenFarmsStore, farmStates,
    scheduleFarmsSave: scheduleFarmsSaveFuerMigration,
} = require("./garden/store/farms");
const { registerGardenSocket } = require("./garden/world/lobby");
const { runGardenMigrations } = require("./garden/migrations");
const { initWinchallengeStore, saveAllOnExit: saveWinchallengeOnExit } = require("./winchallenge/winchallengeStore");
const { initWinchallengeIrc, stopIrc: stopWinchallengeIrc, getIrcStatus } = require("./lib/winchallengeIrc");
const createCrViewerGamesRouter = require("./clashRoyale/routes/crViewerGamesRoutes");
const { createScoutRouter } = require("./clashRoyale/scout/scoutRoutes");
const { step } = require("./lib/startupLog");
const { createSessionStore } = require("./lib/sessionStore");
const { createKontoStore, tagVon: kontoTagVon, tagPlus: kontoTagPlus } = require("./konto/kontoStore");
const { createKontoRouter, kontoFuerBrowser } = require("./konto/kontoRoutes");
const { createSitzungsHelfer } = require("./konto/sitzung");
const { bremseMiddleware } = require("./lib/bremse");
const { schuetzeSocket } = require("./lib/socketSchutz");
const { createFehlerProtokoll } = require("./fehler");
const { createLeistungsMessung } = require("./leistung");
const { seiteVon: fehlerSeiteVon } = require("./fehler/signatur");

const app = express();

// 1. Server Wrapper erstellen
const server = http.createServer(app);

// 2. Origins definieren (bevor wir sie nutzen)
const ALLOWED_ORIGINS = ["https://vnmvalentin.de", "https://www.vnmvalentin.de", "http://localhost:5173"];

// 3. Socket.io initialisieren (WICHTIG: VOR DEN ROUTEN!)
const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGINS, 
        credentials: true
    },
    path: "/socket.io" 
});

// --- Middleware ---
app.use(
  helmet({
    contentSecurityPolicy: false, 
    crossOriginEmbedderPolicy: false, 
  })
);

// Stripe-Webhook: MUSS vor express.json() stehen — die Signatur gilt für den unveränderten
// Body, den express.json() schon geparst (und damit verworfen) hätte.
app.post("/api/billing/webhook", ...createBillingWebhook());

// Rückhalt gegen Anfragefluten (lib/bremse.js): je Adresse höchstens 1800 API-Anfragen pro Minute (30/s) — weit über
// dem, was Seiten und OBS-Overlays brauchen. Steht vor dem Einlesen, damit eine Flut keine Parse-Zeit kostet. Engere
// Grenzen sitzen an Login, Feedback und Vorschaubildern (weiter unten).
app.use("/api", bremseMiddleware({ fensterMs: 60_000, max: 1800 }));

// Anfragegröße (Sicherheits-Durchgang 16.11.2026): ohne gültige Sitzung höchstens 1 MB — die größte anonyme Nutzlast
// ist ein Seed-Runners-Lauf (60.000 Zahlen ≈ 0,5 MB), Level-Prüfungen sind auf 400 KB begrenzt. Angemeldet weiter
// 10 MB (Editoren, Farm-Stand, Turnierbilder). Vorher durfte jede anonyme Anfrage 10 MB JSON parsen lassen.
app.use(cookieParser());
const jsonGross = express.json({ limit: "10mb" });
const jsonKlein = express.json({ limit: "1mb" });
const formGross = express.urlencoded({ limit: "10mb", extended: true });
const formKlein = express.urlencoded({ limit: "1mb", extended: true });
app.use((req, res, next) => {
  // Nur Twitch-Sitzungen: Gastkonten kann jeder anlegen, sie bekommen die Grenze für Anonyme (Spielstände ≤ 64 KB)
  const angemeldet = Boolean(sessionStore.get(req.cookies.session)?.twitchId);
  (angemeldet ? jsonGross : jsonKlein)(req, res, (err) => {
    if (err) return next(err);
    (angemeldet ? formGross : formKlein)(req, res, next);
  });
});

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  })
);

// =================== CONFIG & HELPER & SESSIONS ===================
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const STREAMER_TWITCH_ID = process.env.STREAMER_TWITCH_ID;

// Sitzungen liegen seit 16.11.2026 in data/sessions.db (lib/sessionStore.js, Begründung dort). Die alte
// Backend/sessions.json wird beim ersten Start einmal übernommen — samt der Discord-Verknüpfungen, die früher in den
// Sitzungen hingen (discord/linkStore.js migrateFromSessions). Die Datei selbst bleibt liegen.
const sessionStore = createSessionStore({ lebensdauerMs: SESSION_LIFETIME_MS });
{
  const umzug = sessionStore.importiereJson(path.join(__dirname, "sessions.json"), {
    beiAltdaten: (alt) => {
      const links = require("./discord/linkStore");
      const mitDiscord = new Set(Object.values(alt || {}).filter((s) => s && s.discord && s.twitchId).map((s) => String(s.twitchId)));
      for (const id of mitDiscord) {
        try {
          links.migrateFromSessions(id, alt);
        } catch (e) {
          console.error("[sessions] Discord-Verknüpfung nicht übernommen:", e.message);
        }
      }
    },
  });
  if (umzug.importiert) console.log(`[sessions] ${umzug.importiert} Sitzungen aus sessions.json übernommen`);
  if (umzug.fehler) console.error("[sessions] sessions.json nicht lesbar — Übernahme beim nächsten Start erneut:", umzug.fehler);
}
// Konten (konto/): ein Konto je Person für alle Anmeldewege — Twitch, Discord oder Gast mit Wiederherstellungscode.
// Die Twitch-Bereiche bleiben bei req.twitchId; neue Dinge (Spielstände, Abzeichen, Sprache) hängen an req.kontoId.
const kontoStore = createKontoStore();
setInterval(() => {
  try {
    sessionStore.purge();
    kontoStore.raeumeAuf(); // aktive Tage älter als 120 Tage (Wiederkehr-Zahl)
  } catch (e) {
    console.error("[sessions] Aufräumen fehlgeschlagen:", e.message);
  }
}, 60 * 60 * 1000).unref();

// Fehlerprotokoll (fehler/): Browser melden über POST /api/fehler, der Server über meldeServer (Prozess, Socket-Ereignisse,
// Anfragen mit 5xx). Admin-Reiter „Fehler“; neue Fehlerbilder gehen an BETREIBER_WEBHOOK_URL (privater Kanal).
const fehlerProtokoll = createFehlerProtokoll();
// Leistung echter Besucher (leistung/): Ladezeiten, Reaktion, Layout-Sprünge, Bildrate in Spielen — Admin-Reiter „Leistung“
const leistungsMessung = createLeistungsMessung();
// Betreiber-Prüfung für die eigenen Admin-Bereiche (Fehlerprotokoll, Leistung)
const istBetreiber = (req) => !!STREAMER_TWITCH_ID && String(req.twitchId) === String(STREAMER_TWITCH_ID);

async function verifyTwitchToken(token) {
  try {
    const res = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${token}` },
    });
    if (!res.ok) return null;
    return await res.json(); 
  } catch (e) { return null; }
}

// Sitzung lesen samt Konto und die Anmelde-Middlewares (konto/sitzung.js, Beschreibung dort):
// requireAuth = Twitch nötig (wie bisher), optionalAuth, requireKonto/optionalKonto = jedes Konto (Twitch, Discord, Gast).
// Sitzungen von vor den Konten bekommen ihr Konto beim ersten Gebrauch; jeder Gebrauch merkt den aktiven Tag (außer Betreiber).
const {
  sitzungLesen, setzeSitzungsCookie, loescheSitzungsCookie,
  requireAuth, optionalAuth, requireKonto, optionalKonto,
  getTwitchIdFromSocket, getSessionFromSocket, getKontoFromSocket, // eslint-disable-line no-unused-vars
} = createSitzungsHelfer({
  sessionStore,
  kontoStore,
  betreiberTwitchId: STREAMER_TWITCH_ID,
  lebensdauerMs: SESSION_LIFETIME_MS,
  secureCookie: process.env.NODE_ENV === "production",
});

/** Name und Bild zur Twitch-Anmeldung (Helix), für das Konto. Darf scheitern — dann eben der Login-Name. */
async function twitchProfil(token) {
  try {
    const r = await fetch("https://api.twitch.tv/helix/users", {
      headers: { "Client-ID": process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    const u = (await r.json())?.data?.[0];
    return u ? { name: u.display_name || u.login, avatar: u.profile_image_url || null } : null;
  } catch {
    return null;
  }
}

// =================== AUTH ROUTES ===================
// Der frühere POST /api/admin/login ist entfernt: kein Aufrufer mehr (Admin läuft über die
// Twitch-Session + STREAMER_TWITCH_ID), er bot nur unbegrenzte Rateversuche auf ADMIN_PW.

app.get("/api/twitch/clientid", (req, res) => res.json({ clientId: process.env.TWITCH_CLIENT_ID || null }));

// Für den Status-Prüfer (statusWatch/, eigener Prozess → #status in Discord). Bewusst nur grob:
// läuft der Prozess, wie lange schon, ist der Bot (im selben Prozess) mit Discord verbunden.
app.get("/api/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, uptimeS: Math.round(process.uptime()), bot: { ready: discordClient.isReady() } });
});

// Jeder Versuch fragt Twitch (oauth2/validate) — ohne Grenze ließe sich der Server als Verstärker gegen Twitch nutzen
const loginBremse = bremseMiddleware({ fensterMs: 15 * 60_000, max: 30, meldung: "Zu viele Anmeldeversuche. Bitte in ein paar Minuten erneut." });
app.post("/api/auth/twitch", loginBremse, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "Kein Token" });
  const data = await verifyTwitchToken(token);
  if (!data || !data.user_id) return res.status(401).json({ error: "Ungültiger Token" });
  // Nur Tokens UNSERER App: sonst könnte jede fremde Twitch-App mit dem Token eines Nutzers
  // hier als dieser Nutzer einloggen (auch als Admin). Fehlt die Client-ID, gibt es keinen Login.
  if (!process.env.TWITCH_CLIENT_ID || data.client_id !== process.env.TWITCH_CLIENT_ID) {
    return res.status(401).json({ error: "Ungültiger Token" });
  }
  // Konto (konto/): Wer schon angemeldet ist (Gast, Discord), verknüpft Twitch mit seinem Konto — gehört dieses Twitch
  // schon zu einem anderen Konto, werden beide zusammengeführt. Geht das nicht (Konto hat schon ein anderes Twitch,
  // beide hätten Discord), wechselt die Anmeldung einfach ins Konto dieses Twitch-Nutzers.
  const profil = (await twitchProfil(token)) || { name: data.login };
  const vorher = sitzungLesen(req.cookies.session);
  let kontoId = null;
  const konto = { status: "angemeldet" };
  try {
    if (vorher?.kontoId && String(vorher.twitchId || "") !== String(data.user_id)) {
      const r = kontoStore.verknuepfe(vorher.kontoId, "twitch", data.user_id, profil);
      if (r.ok) {
        kontoId = r.kontoId;
        if (r.entfernt) sessionStore.ersetzeKonto(r.entfernt, r.kontoId);
        konto.status = r.entfernt ? "zusammengefuehrt" : "verknuepft";
      } else if (!vorher.twitchId) {
        // Discord- oder Gastkonto, das sich nicht verbinden ließ — dem Browser sagen, warum
        Object.assign(konto, { status: "fehler", grund: r.fehler });
      }
    }
    if (!kontoId) kontoId = kontoStore.anmelden("twitch", data.user_id, profil).kontoId;
    if (!(STREAMER_TWITCH_ID && String(data.user_id) === String(STREAMER_TWITCH_ID))) kontoStore.merkeAktiv(kontoId);
  } catch (e) {
    console.error("[konto] Twitch-Anmeldung ohne Konto:", e.message);
  }
  sessionStore.remove(req.cookies.session);
  setzeSitzungsCookie(res, sessionStore.create({ twitchId: data.user_id, twitchLogin: data.login, kontoId }));
  res.json({ ok: true, konto });
});

app.post("/api/auth/logout", (req, res) => {
  sessionStore.remove(req.cookies.session);
  loescheSitzungsCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ twitchId: req.twitchId, twitchLogin: req.twitchLogin }));

// Ein Konto für alle Anmeldewege (konto/kontoRoutes.js): Konto ansehen und verwalten, Discord-Anmeldung, Gast mit
// Wiederherstellungscode, Spielstände und Abzeichen der Spiele (Andockstelle im Browser: utils/kontoSpeicher.js)
app.use("/api/konto", createKontoRouter({ kontoStore, sessionStore, requireKonto, optionalKonto, setzeSitzungsCookie, loescheSitzungsCookie }));


// =================== SYSTEM BROADCAST ===================
// Globale Variablen für den aktuellen Broadcast
let activeBroadcast = null;
let broadcastTimeout = null;

// Public Route (Wird beim Laden der Seite aufgerufen)
app.get('/api/system/broadcast', (req, res) => {
    // Prüfen, ob der Broadcast schon abgelaufen ist
    if (activeBroadcast && Date.now() > activeBroadcast.expiresAt) {
        activeBroadcast = null;
    }
    res.json(activeBroadcast || {});
});

// Admin Route (Setzt den Broadcast)
app.post('/api/admin/broadcast', requireAuth, (req, res) => {
    // Sicherheitscheck: Ist es wirklich der Streamer/Admin?
    if (String(req.twitchId) !== String(STREAMER_TWITCH_ID)) { 
      return res.status(403).json({ error: "Access Denied" });
    }

    const { message, duration, type } = req.body;
    
    if (!message || !duration) {
        return res.status(400).json({ error: "Nachricht und Dauer erforderlich." });
    }

    // Falls schon ein Broadcast lief, den alten Timer abbrechen
    if (broadcastTimeout) clearTimeout(broadcastTimeout);

    // Neuen Broadcast setzen
    activeBroadcast = {
        message,
        type: type || 'warning',
        expiresAt: Date.now() + (duration * 60 * 1000) // Dauer in Minuten -> Millisekunden
    };

    // Broadcast an ALLE User pushen
    io.emit('system_broadcast', activeBroadcast);

    // Timer starten, um den Broadcast nach Ablauf der Zeit automatisch zu löschen
    broadcastTimeout = setTimeout(() => {
        activeBroadcast = null;
        io.emit('system_broadcast', null); // Pop-up bei den Usern wieder ausblenden
    }, duration * 60 * 1000);

    res.json({ success: true, broadcast: activeBroadcast });
});


// =================== FEATURE ROUTES ===================

// Admin-Reiter „Spiele“: Partien landen als Tagessumme in der Besucherstatistik. Live-Zahlen melden die Spiele selbst
// an (lib/spielStatistik.js); hier stehen nur die, deren Stand schon von außen lesbar ist — die übrigen schließen ihre
// Spuren an (Ausbauplan, Anschlüsse spiele-zahlen-d / spiele-zahlen-b).
verbindePartienSpeicher((spiel) => analyticsStore.recordMatch(spiel));
meldeSpielAn("seed-runners", seedRunnersStats);
meldeSpielAn("garden", () => {
  const welten = weltUebersicht();
  return { raeume: welten.length, spieler: welten.reduce((s, w) => s + w.playerCount, 0) };
});
meldeSpielAn("cr-minigames", () => {
  const lobbys = crLobbiesFuerAdmin();
  return { raeume: lobbys.length, spieler: lobbys.reduce((s, l) => s + l.playerCount, 0) };
});
meldeSpielAn("cr-wer-bin-ich", () => {
  let spieler = 0;
  for (const raum of guessWhoRooms.values()) for (const slot of [1, 2]) if (raum.players?.[slot]?.connected) spieler++;
  return { raeume: guessWhoRooms.size, spieler };
});
// Blobby läuft im eigenen Prozess: seine Räume und Partien holt eine Brücke über /healthz ab (Spur D)
require("./blobby/statistikBruecke").starteBlobbyStatistik();

// Wiederkehr neuer Konten (nur angemeldete, pseudonym über die Konto-ID; aktive Tage 120 Tage) und Anmeldewege.
// Das Konto des Betreibers zählt nicht mit.
function kontoStatistik(days) {
  const span = Math.min(Math.max(Math.floor(Number(days)) || 30, 1), 365);
  const heute = kontoTagVon(Date.now());
  const von = kontoTagPlus(heute, -(span - 1));
  const ohne = [STREAMER_TWITCH_ID ? kontoStore.kontoVonLink("twitch", STREAMER_TWITCH_ID) : null];
  return { von, bis: heute, zahlen: kontoStore.zahlen(), wiederkehr: kontoStore.wiederkehr({ von, bis: heute, heute, ohne }) };
}

// Jetzt existiert 'io' bereits und kann sicher übergeben werden!
app.use("/api/admin", createAdminRouter({ requireAuth, STREAMER_TWITCH_ID, io, liveZahlen, discordClient, kontoStatistik }));

// Andere Routen
app.use("/api/bingo", createBingoRouter({ requireAuth }));
app.use("/", createGiveawayRouter({ requireAuth, STREAMER_TWITCH_ID, io }));
app.use("/api/winchallenge", createWinchallengeRouter({ requireAuth }));
app.use("/api/polls", createPollRouter({ requireAuth, STREAMER_TWITCH_ID, io }));
app.use("/api/adventure", createAdventureRouter({ requireAuth, optionalAuth }));
// Feedback geht ohne Login direkt in einen Discord-Kanal — ohne Grenze ließe er sich fluten
app.use("/api/feedback", bremseMiddleware({ fensterMs: 10 * 60_000, max: 5, meldung: "Zu viele Nachrichten. Bitte etwas später erneut." }), createFeedbackRouter());
app.use("/api/garden", createGardenGameRouter({ requireAuth }));
// sessions/saveSessionsToFile sind nur noch für die alte Discord-Übernahme da (migrateFromSessions): die lief beim
// Sitzungs-Umzug oben schon für alle — hier gibt es nichts mehr zu übernehmen.
app.use("/api/discord", createDiscordRouter({ requireAuth, discordClient, sessions: Object.create(null), saveSessionsToFile: () => {} }));
// Streamer-Konfiguration VOR dem allgemeinen Clash-Router mounten (spezifischerer Pfad)
app.use("/api/clash/streamer", createCrStreamerRouter({ requireAuth }));
app.use("/api/clash/profile", createCrProfileRouter({ requireAuth }));
// Freundesliste der Minigames (Aktionen; Live-Stand läuft über den Socket, clashRoyale/core/friends.js)
app.use("/api/clash/friends", createCrFriendRouter({ requireAuth }));
app.use("/api/clash/presets", createCrPresetRouter({ requireAuth }));
// Stats-Seiten unter /clash (Spieler, Clans, Ranglisten, Meta) — öffentlich, clashRoyale/scout/
app.use("/api/clash/scout", createScoutRouter({ requireAuth, optionalAuth }));
// Tagesrunde der CR-Ratespiele: Bestenliste (clashRoyale/daily/, Frontend /clash/heute)
app.use("/api/clash/heute", require("./clashRoyale/daily/dailyRoutes").createDailyRouter({ requireAuth, optionalAuth }));
// Turniere der CR-Minigames (Plan: docs/clash-royale/PLANUNG_TURNIER.md)
app.use("/api/clash/tournaments", createTournamentRouter({
  requireAuth, optionalAuth,
  // Turniere erstellen: nur der Streamer-Admin und von ihm freigegebene Content Creator
  isAdmin: (req) => !!STREAMER_TWITCH_ID && String(req.twitchId) === String(STREAMER_TWITCH_ID),
}));
app.use("/api/clash", createClashRoyaleRouter({ requireAuth, STREAMER_TWITCH_ID }));
app.use("/api/banned-cards", createBannedCardsRouter({ requireAuth }));
app.use("/api/nuzlocke", createNuzlockeRouter({ requireAuth }));
app.use("/api/cr-wintracker", createCrWinTrackerRouter({
  requireAuth,
  // Admin darf den Win Tracker anderer Nutzer einrichten (?asUser=…, siehe actAsUser)
  isAdmin: (req) => !!STREAMER_TWITCH_ID && String(req.twitchId) === String(STREAMER_TWITCH_ID),
}));
app.use("/api/stream-tool", createStreamToolRouter({ requireAuth }));
// Viewer Games: Chat-Quiz-Overlay (Pixel-/Zoom-Raten, Zuschauer raten mit !tipp), clashRoyale/viewerGames/
app.use("/api/cr-viewer-games", createCrViewerGamesRouter({ requireAuth, ircStatus: getIrcStatus }));
// Abo (Stripe): Stand, Bezahlseite, Kundenportal. Wer frei ist, entscheidet billing/entitlements.js
app.use("/api/billing", createBillingRouter({ requireAuth }));
app.use("/api/used-by", createUsedByRouter());
// Ist der eigene Kanal live? (Hinweis in der Kopfzeile, Player der Startseite)
app.use("/api/live", createLiveRouter({ userId: STREAMER_TWITCH_ID }));
app.use("/api/chat-avatars", createChatAvatarRouter());
// 3D-Stream-Szenen: Steuerpult (OBS-Link mit Key) und Figurbaukasten der Zuschauer
app.use("/api/stream-scenes", createStreamScenesRouter({ requireAuth, STREAMER_TWITCH_ID }));
// Besucherstatistik ohne Cookies (analytics/analyticsStore.js); die Auswertung liegt unter /api/admin/analytics
app.use("/api/analytics", createAnalyticsRouter({ optionalAuth, STREAMER_TWITCH_ID }));
app.use("/api/fehler", fehlerProtokoll.router({ requireAuth, istBetreiber }));
app.use("/api/leistung", leistungsMessung.router({ optionalAuth, requireAuth, istBetreiber }));
// Seed Runners: Tagesrangliste, ohne Login (Identität = Schlüssel aus dem Browser-Token), siehe seedRunners/daily.js
try {
  app.use("/api/seed-runners", createSeedRunnersRouter({
    ...getSeedRunnersRuntime(),
    requireAuth,
    optionalAuth,
    isAdmin: (req) => !!STREAMER_TWITCH_ID && String(req.twitchId) === String(STREAMER_TWITCH_ID),
  }));
} catch (e) {
  console.error("[seed-runners] Tagesrangliste nicht verfügbar:", e);
}

// Link-Vorschau für Discord, WhatsApp & Co. (og/ogRoutes.js): nginx schickt nur Vorschau-Bots hierher.
// Die Quellen werden erst bei der Anfrage geholt — fehlt eine, bleibt es bei der Standard-Vorschau.
const OG_GUEST = { accountId: null, name: "", isAdmin: false };
// Vorschaubilder werden gezeichnet (Rechenzeit) und nur je Pfad zwischengespeichert — neue Pfade erzwingen neue Bilder
app.use("/api/og/image.png", bremseMiddleware({ fensterMs: 60_000, max: 60 }));
app.use("/api/og", createOgRouter({
  getSources: () => {
    const tStore = require("./clashRoyale/tournament/store");
    const sr = getSeedRunnersRuntime();
    return {
      tournament: (id) => {
        const t = tStore.getTournament(id);
        if (!t || t.status === "void") return null;
        return {
          name: t.settings?.name, description: t.settings?.description, maxPlayers: t.settings?.maxPlayers,
          status: t.status, ownerLogin: t.ownerLogin, count: tStore.countParticipants(t.id),
        };
      },
      level: (code) => sr.levelService.detail(String(code).toUpperCase(), OG_GUEST, ""),
      creator: (id) => sr.levelService.creator(id, OG_GUEST),
      dailyBoard: (dateKey) => sr.daily.board(dateKey, 3),
      todayKey: () => sr.todayKey(),
      // Clash-Royale-Stats: Name aus dem Namens-Index (clashRoyale/scout/scoutStore.js), Karte aus der Kartenliste
      scoutPlayer: (tag) => require("./clashRoyale/scout/scoutStore").getPlayer(tag),
      card: (id) => require("./clashRoyale/core/cards").ALL_CARDS.find((c) => c.id === id) || null,
      // Öffentliches Profil: nur eingeschaltete (byLogin liefert sonst null)
      profile: (login) => {
        const entry = publicProfileStore.byLogin(login);
        return entry ? { login: entry.login, displayName: entry.displayName, sections: buildPublicProfile(entry.twitchId, publicProfileSources) } : null;
      },
    };
  },
}));

// Öffentliches Profil /u/<login> (profile/profileRoutes.js), opt-in unter /profile. Jede Quelle liefert einen Abschnitt
// oder null; Fehler einer Quelle kosten nur ihren Abschnitt.
const publicProfileStore = createProfileStore();
const publicProfileSources = {
  // Konto (konto/): Website-Stufe, Abzeichen, Spiele mit Fortschritt — nur das, nie Konto-ID, Discord oder Code
  konto: (id) => {
    const kontoId = kontoStore.kontoVonLink("twitch", id);
    const k = kontoId ? kontoFuerBrowser(kontoStore.ansicht(kontoId)) : null;
    if (!k || (!k.spiele.length && !k.erfolge.length)) return null;
    return {
      stufe: k.stufe,
      spiele: k.spiele.map(({ spiel, name, xp }) => ({ spiel, name, xp })),
      erfolge: k.erfolge.map(({ spiel, erfolg, name, text, erreicht }) => ({ spiel, erfolg, name, text, erreicht })),
    };
  },
  winTracker: (id) => {
    const wt = require("./clashRoyale/lib/winTrackerStore");
    const acc = wt.prepare("SELECT * FROM cr_wintracker_accounts WHERE user_id = ? ORDER BY is_active DESC, last_fetched DESC LIMIT 1").get(String(id));
    if (!acc) return null;
    const settingsMode = wt.prepare("SELECT track_mode FROM cr_wintracker_settings WHERE user_id = ?").get(String(id))?.track_mode;
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const counts = Object.fromEntries(wt.prepare("SELECT result, COUNT(*) AS c FROM cr_wintracker_battles WHERE account_id = ? AND battle_time_ms >= ? GROUP BY result")
      .all(acc.account_id, since).map((r) => [r.result, r.c]));
    return {
      playerName: acc.player_name, trackMode: acc.track_mode || settingsMode || "medals",
      trophies: acc.trophies, bestTrophies: acc.best_trophies, seasonMedals: acc.season_medals,
      leagueNumber: acc.league_number, polRank: acc.pol_rank ?? null,
      last30: { wins: counts.win || 0, losses: counts.loss || 0, draws: counts.draw || 0 },
    };
  },
  tournaments: (id) => {
    const tStore = require("./clashRoyale/tournament/store");
    const { championOf } = require("./clashRoyale/tournament/structure");
    return tStore.listJoinedBy(id).map((t) => ({
      id: t.id, name: t.settings?.name || "Turnier", status: t.status, ownerLogin: t.ownerLogin,
      champion: t.status === "finished" && championOf(tStore.listMatches(t.id)) === t.participantId,
      at: t.finishedAt || t.startedAt || t.createdAt,
    }));
  },
  seedRunners: (id) => {
    const c = getSeedRunnersRuntime().levelService.creator(String(id), OG_GUEST);
    return c ? { creatorId: c.id, levels: c.stats.levels, plays: c.stats.plays, ratings: c.stats.ratings, ratingAvg: c.stats.ratingAvg } : null;
  },
  adventure: (id) => createAdventureRouter.publicStats(id),
  garden: (id) => {
    const s = require("./garden/store/farms").farmStates.get(String(id));
    if (!s || !((s.xp || 0) > 0 || (s.gold || 0) > 0)) return null;
    return { level: require("./garden/core/skills").levelZuXp(s.xp), gold: s.gold || 0 };
  },
};
app.use("/api/public-profile", createProfileRouter({ requireAuth, store: publicProfileStore, getSources: () => publicProfileSources }));

// "Gerade los" auf der Startseite (activity/activityRoutes.js): nur Zahlen über ihrer Schwelle werden gezeigt.
// Jede Quelle einzeln abgesichert — fällt eine aus, fehlt nur ihre Zahl.
app.use("/api/activity", createActivityRouter({
  getStats: () => {
    const stats = {};
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    try {
      const wt = require("./clashRoyale/lib/winTrackerStore");
      stats.wtBattles7 = wt.prepare("SELECT COUNT(*) AS c FROM cr_wintracker_battles WHERE battle_time_ms >= ?").get(weekAgo).c;
      stats.wtUsers7 = wt.prepare("SELECT COUNT(DISTINCT user_id) AS c FROM cr_wintracker_accounts WHERE last_fetched >= ?").get(weekAgo).c;
    } catch (e) { console.error("[activity] Win Tracker:", e.message); }
    try {
      const sr = getSeedRunnersRuntime();
      let day = sr.todayKey();
      let runs = 0;
      for (let i = 0; i < 7; i++) {
        runs += sr.daily.board(day, 0).total;
        day = seedRunnersPreviousDay(day);
      }
      stats.dailyRuns7 = runs;
      stats.levelsPublished = sr.levelService.list({ sort: "new", limit: 1 }, OG_GUEST).total;
    } catch (e) { console.error("[activity] Seed Runners:", e.message); }
    try {
      const tStore = require("./clashRoyale/tournament/store");
      stats.openTournaments = tStore.listListed()
        .filter((t) => t.status === "registration")
        .map((t) => ({ id: t.id, name: t.settings?.name || "Turnier" }));
    } catch (e) { console.error("[activity] Turniere:", e.message); }
    return stats;
  },
}));

// Fehler beim Einlesen einer Anfrage (zu groß, kaputtes JSON): kurze JSON-Antwort statt Express-Fehlerseite mit
// Stacktrace im Log — unter einer Flut würde sonst jede abgewiesene Anfrage das Journal füllen. Echte Serverfehler (5xx)
// gehen zusätzlich ins Fehlerprotokoll und laufen dann unverändert zur Express-Standardbehandlung.
const LESEFEHLER = new Set(["entity.too.large", "entity.parse.failed", "encoding.unsupported", "charset.unsupported"]);
app.use((err, req, res, next) => {
  if (!err) return next(err);
  if (LESEFEHLER.has(err.type) && !res.headersSent) {
    return res.status(err.status || 400).json({ error: err.type === "entity.too.large" ? "Anfrage zu groß." : "Anfrage nicht lesbar." });
  }
  if (!(Number(err.status || err.statusCode) < 500)) {
    fehlerProtokoll.meldeServer("http", err, `${req.method} ${fehlerSeiteVon(req.originalUrl)}`);
  }
  next(err);
});

// =================== SOCKET.IO LOGIC ===================
// Jeder Handler der Spiel-Module läuft im Schutzmantel (lib/socketSchutz.js): Ein Fehler in einem Ereignis beendet nicht
// mehr den ganzen Prozess. Scheitert schon der Aufbau einer Verbindung, wird nur diese eine getrennt.
const sicherVerbinden = (aufbau) => (socket) => {
    schuetzeSocket(socket, { bericht: (ereignis, e) => fehlerProtokoll.meldeServer("socket", e, String(ereignis)) });
    try {
        aufbau(socket);
    } catch (e) {
        console.error("[socket] Verbindungsaufbau fehlgeschlagen:", e);
        fehlerProtokoll.meldeServer("socket", e, "Verbindungsaufbau");
        socket.disconnect(true);
    }
};
io.on("connection", sicherVerbinden((socket) => {
 
    // ── bestehende Handler (unverändert) ──
    const clashSocketTwitchId = getTwitchIdFromSocket(socket);

    // Einziger Aufrufer: das Admin-Dashboard (Raum streamer:<ID>, siehe adminRoutes.js notifyUpdate).
    // Vorher trat hier jeder ohne Login jedem Raum bei — Freundeslisten (crf:<id>), Turnier-Chats,
    // private Spieler-Räume der Minigames. Jetzt nur noch dieser eine Raum und nur für den Admin.
    socket.on("join_room", (room) => {
        if (!STREAMER_TWITCH_ID || String(clashSocketTwitchId) !== String(STREAMER_TWITCH_ID)) return;
        if (room !== `streamer:${STREAMER_TWITCH_ID}`) return;
        socket.join(room);
    });

    const isClashAdmin = !!clashSocketTwitchId && String(clashSocketTwitchId) === String(STREAMER_TWITCH_ID);
    const clashSocketTwitchLogin = getSessionFromSocket(socket)?.twitchLogin || null;
    registerClashRoyaleSocket(socket, io, { isAdmin: isClashAdmin, twitchId: clashSocketTwitchId, twitchLogin: clashSocketTwitchLogin });
    // Turnier-Match-Räume (Chat, Bereit, Pick/Ban, Draft-Lobby) — clashRoyale/tournament/matchRoom.js
    registerTournamentSocket(socket, io, { twitchId: clashSocketTwitchId });

    // Virtual Farm: dauerhafte 8-Plot-Welt (Slots, Anwesenheit, Positionen)
    registerGardenSocket(socket, io, getSessionFromSocket, farmStates);

    // Connect4 (Vier Gewinnt) — Link-basierte 1v1-Räume
    registerConnect4Socket(socket, io);

    // Clash Royale „Wer bin ich?“ — 1v1-Klappbrett per Link (clashRoyale/guessWhoRoutes.js)
    registerGuessWhoSocket(socket, io);

    // Seed Runners — Räume und Rennen; die Physik läuft komplett im Browser (siehe seedRunnersRoutes.js)
    registerSeedRunnersSocket(socket, io);

    // Sacrifice & Sigils — 1v1-Kartenspiel, serverautoritativ (Engine-Spiegel, siehe sacrificeSigilsRoutes.js)
    registerSacrificeSigilsSocket(socket, io);

    // Flick Soccer — rundenbasierter Scheiben-Fußball, 1v1 per Link, serverautoritativ (Engine-Spiegel)
    registerFlickSoccerSocket(socket, io, { isAdmin: isClashAdmin });

    // Worldflip — 3D-Kartenspiel für 2 bis 4, Räume per Link, serverautoritativ (Engine-Spiegel)
    registerWorldflipSocket(socket, io);

    // Lights Out (Koop) — Räume per Code; Welt aus gemeinsamem Seed, Monster rechnet der Host-Browser
    registerLightsOutSocket(socket, io);

    // Abstimmungen/Giveaways: Vollpayload nur für die jeweilige Seite, sonst
    // nur der schlanke Nav-Punkt (siehe lib/liveBadges.js)
    registerLiveBadgesSocket(socket);
}));

// =================== START SERVER ===================
const PORT = process.env.PORT || 3001;

(async () => {
  try {
    await initGardenFarmsStore();
    step("Garden-DB", true);
    // Alle Umstellungen alter Spielstände in einem Durchgang. Reihenfolge und
    // Protokollzeilen stehen in garden/migrations/index.js — jede läuft genau
    // einmal je Spielstand (eigene Marke im Stand).
    for (const zeile of runGardenMigrations(farmStates, { scheduleFarmsSave: scheduleFarmsSaveFuerMigration })) {
      step(zeile.name, true, zeile.text);
    }
  } catch (e) {
    step("Garden-DB", false, e.message);
    process.exit(1);
  }
  try {
    await initWinchallengeStore();
    step("Winchallenge-DB", true);
  } catch (e) {
    step("Winchallenge-DB", false, e.message);
    process.exit(1);
  }
  try {
    initCrStreamerStore();
    step("CR-Streamer-DB", true);
  } catch (e) {
    step("CR-Streamer-DB", false, e.message);
    process.exit(1);
  }
  try {
    initCrProfileStore();
    step("CR-Profil-DB", true);
  } catch (e) {
    step("CR-Profil-DB", false, e.message);
    process.exit(1);
  }
  // Ab hier lauscht der Server SOFORT — Twitch-IRC und der Win-Tracker-Sync brauchen beide
  // einen externen Netzwerk-Handshake (waren vorher per `await` vor `listen()` gesetzt und
  // hielten die ganze API unnötig auf, ~1s bei jedem Start). Beide sind schon von Haus aus
  // fehlertolerant: initWinchallengeIrc() wirft bei Fehlern nicht (eigenes try/catch, kein
  // process.exit), und jeder Aufrufer von winchallengeIrc-Funktionen (siehe
  // winchallenge/winchallengeRoutes.js, streamTool/routes/streamToolRoutes.js,
  // clashRoyale/routes/crWinTrackerRoutes.js)
  // behandelt eine noch nicht verbundene IRC-Instanz bereits als Normalfall, nicht als Bug —
  // sie liefen also schon immer mit "IRC evtl. noch nicht da" zurecht, nur bisher nie beim
  // allerersten Request.
  server.once("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      step(
        "Server",
        false,
        `Port ${PORT} bereits belegt (EADDRINUSE) — anderen Prozess beenden oder PORT in .env ändern`
      );
    } else {
      step("Server", false, err.message);
    }
    process.exit(1);
  });
  server.listen(PORT, "0.0.0.0", () => {
    step("Server", true, `Port ${PORT}`);
    installiereProzessFehler();
  });

  try {
    const irc = await initWinchallengeIrc();
    step("Winchallenge-IRC", irc.status, irc.detail);
  } catch (e) {
    step("Winchallenge-IRC", false, e.message);
  }
  // Synct aktive Win-Tracker-Accounts regelmäßig im Hintergrund, auch ohne offenes Overlay —
  // sonst fallen bei langen Sessions Spiele aus dem ~25-Spiele-Fenster des Battlelogs, bevor sie
  // je gespeichert wurden, und die Tagesstatistik zählt zu wenig.
  try {
    const started = createCrWinTrackerRouter.startBackgroundSync();
    // Aus SYNC_LOOP_INTERVAL_MS abgeleitet statt fest eingetippt — sonst genau das Problem, das
    // schon einmal auftrat: der Wert wurde geändert (5 Minuten -> 90s), aber diese Logzeile hier
    // sagte weiter "alle 5 min".
    const intervalS = Math.round(createCrWinTrackerRouter.SYNC_LOOP_INTERVAL_MS / 1000);
    step("Win-Tracker-Sync", started ? true : "warn", started ? `alle ${intervalS}s` : "kein Token konfiguriert");
  } catch (e) {
    step("Win-Tracker-Sync", false, e.message);
  }
})();

// Unerwartete Fehler außerhalb von Anfragen und Socket-Ereignissen (Timer, Hintergrund-Abgleiche): Nutzerentscheidung
// 16.11.2026 — loggen und ins Fehlerprotokoll schreiben, statt den ganzen Prozess (Discord-Bot, Twitch-Chat, Spiele) zu
// beenden. Erst nach dem erfolgreichen Start aktiv (server.listen oben): Fehler beim Hochfahren scheitern weiter laut.
// Notbremse: mehr als 20 davon in 5 Minuten heißt vermutlich kaputter Zustand — dann speichern und beenden, systemd
// startet neu.
function installiereProzessFehler() {
  const zeiten = [];
  const behandle = (art) => (fehler) => {
    console.error(`[prozess] ${art}:`, fehler && fehler.stack ? fehler.stack : fehler);
    fehlerProtokoll.meldeServer(art, fehler);
    const t = Date.now();
    zeiten.push(t);
    while (zeiten.length && t - zeiten[0] > 5 * 60 * 1000) zeiten.shift();
    if (zeiten.length > 20) {
      console.error("[prozess] über 20 unerwartete Fehler in 5 Minuten — speichere und starte neu");
      shutdownWinchallenge();
      shutdownGardenFarms();
      process.exit(1);
    }
  };
  process.on("uncaughtException", behandle("uncaughtException"));
  process.on("unhandledRejection", behandle("unhandledRejection"));
}

function shutdownGardenFarms() {
  try {
    saveAllFarmsOnExit();
  } catch (e) {
    console.error("[garden] shutdown save failed:", e);
  }
}

function shutdownWinchallenge() {
  try {
    stopWinchallengeIrc();
  } catch (e) {
    console.error("[winchallenge irc] shutdown:", e);
  }
  try {
    saveWinchallengeOnExit(createWinchallengeRouter.loadDb());
  } catch (e) {
    console.error("[winchallenge] shutdown save failed:", e);
  }
}
process.on("SIGINT", () => {
  shutdownWinchallenge();
  shutdownGardenFarms();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdownWinchallenge();
  shutdownGardenFarms();
  process.exit(0);
});