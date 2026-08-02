const express = require("express");
require("dotenv").config({ override: true });
const helmet = require("helmet");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const cookieParser = require("cookie-parser");
const { nanoid } = require("nanoid");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args)); 

// --- NEU: HTTP & Socket.io ---
const http = require("http");
const { Server } = require("socket.io");

// Feature-Router
const createBingoRouter = require("./routes/bingoRoutes");
const createAwardsRouter = require("./routes/awardsRoutes");
const createGiveawayRouter = require("./routes/giveawayRoutes");
const createWinchallengeRouter = require("./routes/winchallengeRoutes");
const createPollRouter = require("./routes/pollRoutes");
const createCasinoRouter = require("./routes/casinoRoutes");
const createAdventureRouter = require("./routes/adVenturesRoutes");
const createAdminRouter = require("./routes/adminRoutes");
const createPromoRouter = require("./routes/promoRoutes");
const createFeedbackRouter = require("./routes/feedbackRoutes");
const createGardenGameRouter = require("./routes/gardenGameRoutes");
const discordClient = require("./discord/bot/index");
const createDiscordRouter = require("./discord/api/index");
const { createClashRoyaleRouter, registerClashRoyaleSocket } = require("./routes/clashRoyaleRoutes");
const { registerArenaSocket, createArenaRouter } = require("./routes/adventureArenaRoutes");
const { registerConnect4Socket } = require("./routes/connect4Routes");
const { registerBlobbySocket } = require("./routes/blobbyRoutes");
const createCrStreamerRouter = require("./routes/crStreamerRoutes");
const { initCrStreamerStore } = require("./lib/crStreamerStore");
const createBannedCardsRouter = require("./routes/bannedCardsRoutes");
const createNuzlockeRouter = require("./routes/nuzlockeRoutes");
const createCrWinTrackerRouter = require("./routes/crWinTrackerRoutes");
const createCrPresetRouter = require("./routes/crPresetRoutes");
const createStreamToolRouter = require("./routes/streamToolRoutes");
const { registerLiveBadgesSocket } = require("./lib/liveBadges");
const { startModeScanner } = require("./clashRoyale/core/officialModeScanner");
const { createUsedByRouter } = require("./routes/usedByRoutes");
const { saveAllFarmsOnExit, initGardenFarmsStore, farmStates } = require("./lib/gardenFarmsStore");
const { runPlantMigration } = require("./lib/gardenMigration");
const { initWinchallengeStore, saveAllOnExit: saveWinchallengeOnExit } = require("./lib/winchallengeStore");
const { initWinchallengeIrc, stopIrc: stopWinchallengeIrc } = require("./lib/winchallengeIrc");
const { step } = require("./lib/startupLog");

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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  })
);

// =================== CONFIG & HELPER & SESSIONS ===================
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const SESSIONS_PATH = path.join(__dirname, "sessions.json");
const STREAMER_TWITCH_ID = process.env.STREAMER_TWITCH_ID;
const ADMIN_PW = process.env.ADMIN_PW || "";

function loadSessionsFromFile() {
  try {
    if (!fs.existsSync(SESSIONS_PATH)) return {};
    const raw = fs.readFileSync(SESSIONS_PATH, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (e) { console.error(e); return {}; }
}
function saveSessionsToFile(sessions) {
  try { fs.writeFileSync(SESSIONS_PATH, JSON.stringify(sessions, null, 2), "utf8"); } catch (e) {}
}

let sessions = loadSessionsFromFile();

async function verifyTwitchToken(token) {
  try {
    const res = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${token}` },
    });
    if (!res.ok) return null;
    return await res.json(); 
  } catch (e) { return null; }
}

function createSession(twitchId, twitchLogin) {
  const now = Date.now();
  for (const [id, sess] of Object.entries(sessions)) {
    if (!sess || sess.expiresAt < now) delete sessions[id];
  }
  const sessionId = nanoid(24);
  const expiresAt = Date.now() + SESSION_LIFETIME_MS;
  sessions[sessionId] = { twitchId: String(twitchId), twitchLogin: String(twitchLogin), expiresAt };
  saveSessionsToFile(sessions);
  return sessionId;
}

// Liest die Twitch-ID direkt aus dem Session-Cookie des Socket.io-Handshakes
// (Sockets laufen nicht durch die Express-Middlewarekette, daher hier separat geparst).
function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function getTwitchIdFromSocket(socket) {
  const cookies = parseCookieHeader(socket.handshake.headers.cookie);
  const sessionId = cookies.session;
  if (!sessionId) return null;
  const session = sessions[sessionId];
  if (!session || session.expiresAt < Date.now()) return null;
  return session.twitchId;
}

// Wie getTwitchIdFromSocket, liefert aber die volle Session (inkl. Login-Name) — für die Arena
function getSessionFromSocket(socket) {
  const cookies = parseCookieHeader(socket.handshake.headers.cookie);
  const sessionId = cookies.session;
  if (!sessionId) return null;
  const session = sessions[sessionId];
  if (!session || session.expiresAt < Date.now()) return null;
  return { twitchId: session.twitchId, twitchLogin: session.twitchLogin };
}

function requireAuth(req, res, next) {
  const sessionId = req.cookies.session;
  if (!sessionId) return res.status(401).json({ error: "Nicht eingeloggt" });
  const session = sessions[sessionId];
  if (!session) return res.status(401).json({ error: "Session ungültig" });
  if (session.expiresAt < Date.now()) {
    delete sessions[sessionId];
    saveSessionsToFile(sessions);
    return res.status(401).json({ error: "Session abgelaufen" });
  }
  req.twitchId = session.twitchId;
  req.twitchLogin = session.twitchLogin;
  next();
}

// =================== AUTH ROUTES ===================
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PW && ADMIN_PW !== "") return res.json({ ok: true });
  res.status(401).json({ ok: false });
});

app.get("/api/twitch/clientid", (req, res) => res.json({ clientId: process.env.TWITCH_CLIENT_ID || null }));

app.post("/api/auth/twitch", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "Kein Token" });
  const data = await verifyTwitchToken(token);
  if (!data || !data.user_id) return res.status(401).json({ error: "Ungültiger Token" });
  const sessionId = createSession(data.user_id, data.login);
  // secure: true bricht Session-Cookies auf http://localhost (ohne TLS)
  const secureCookie = process.env.NODE_ENV === "production";
  res.cookie("session", sessionId, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: secureCookie ? "strict" : "lax",
    maxAge: SESSION_LIFETIME_MS,
  });
  res.json({ ok: true });
});

app.post("/api/auth/logout", (req, res) => {
  const sessionId = req.cookies.session;
  if (sessionId && sessions[sessionId]) { delete sessions[sessionId]; saveSessionsToFile(sessions); }
  res.clearCookie("session");
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ twitchId: req.twitchId, twitchLogin: req.twitchLogin }));


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

// Jetzt existiert 'io' bereits und kann sicher übergeben werden!
app.use("/api/admin", createAdminRouter({ requireAuth, STREAMER_TWITCH_ID, io }));

// Andere Routen
app.use("/api/bingo", createBingoRouter({ requireAuth }));
app.use("/api/awards", createAwardsRouter({ requireAuth, STREAMER_TWITCH_ID }));
app.use("/", createGiveawayRouter({ requireAuth, STREAMER_TWITCH_ID, io }));
app.use("/api/winchallenge", createWinchallengeRouter({ requireAuth }));
app.use("/api/polls", createPollRouter({ requireAuth, STREAMER_TWITCH_ID, io }));
app.use("/api/casino", createCasinoRouter({ requireAuth, io }));
app.use("/api/", createCasinoRouter.createLegacyCardsAdminRouter());
app.use("/api/adventure", createAdventureRouter({ requireAuth }));
app.use("/api/adventure", createArenaRouter());
app.use("/api/promo", createPromoRouter({ requireAuth, STREAMER_TWITCH_ID }));
app.use("/api/feedback", createFeedbackRouter());
app.use("/api/garden", createGardenGameRouter({ requireAuth }));
app.use("/api/discord", createDiscordRouter({requireAuth, discordClient, sessions, saveSessionsToFile }));
// Streamer-Konfiguration VOR dem allgemeinen Clash-Router mounten (spezifischerer Pfad)
app.use("/api/clash/streamer", createCrStreamerRouter({ requireAuth }));
app.use("/api/clash/presets", createCrPresetRouter({ requireAuth, STREAMER_TWITCH_ID }));
app.use("/api/clash", createClashRoyaleRouter({ requireAuth, STREAMER_TWITCH_ID }));
app.use("/api/banned-cards", createBannedCardsRouter({ requireAuth }));
app.use("/api/nuzlocke", createNuzlockeRouter({ requireAuth }));
app.use("/api/cr-wintracker", createCrWinTrackerRouter({ requireAuth }));
app.use("/api/stream-tool", createStreamToolRouter({ requireAuth }));
app.use("/api/used-by", createUsedByRouter());

// =================== SOCKET.IO LOGIC ===================
io.on("connection", (socket) => {
 
    // ── bestehende Handler (unverändert) ──
    socket.on("join_room", (room) => {
        socket.join(room);
    });
 
    socket.on("update_pond_config", (data) => {
        if (data && data.streamerId && data.config) {
            socket.to(`streamer:${data.streamerId}`).emit("pond_config_update", data.config);
        }
    });
 
    const clashSocketTwitchId = getTwitchIdFromSocket(socket);
    const isClashAdmin = !!clashSocketTwitchId && String(clashSocketTwitchId) === String(STREAMER_TWITCH_ID);
    const clashSocketTwitchLogin = getSessionFromSocket(socket)?.twitchLogin || null;
    registerClashRoyaleSocket(socket, io, { isAdmin: isClashAdmin, twitchId: clashSocketTwitchId, twitchLogin: clashSocketTwitchLogin });

    // adVentures PvPvE Arena
    registerArenaSocket(socket, io, getSessionFromSocket);

    // Connect4 (Vier Gewinnt) — Link-basierte 1v1-Räume
    registerConnect4Socket(socket, io);

    // Blobby Volley — Link-basierte 1v1-Räume mit Echtzeitphysik
    registerBlobbySocket(socket, io);

    // Abstimmungen/Giveaways: Vollpayload nur für die jeweilige Seite, sonst
    // nur der schlanke Nav-Punkt (siehe lib/liveBadges.js)
    registerLiveBadgesSocket(socket);
});

// =================== START SERVER ===================
const PORT = process.env.PORT || 3001;

(async () => {
  try {
    await initGardenFarmsStore();
    const { migratedPlants, migratedUsers } = runPlantMigration(farmStates);
    step("Garden-DB", true);
    step(
      "Pflanzenmigration",
      true,
      migratedUsers > 0 ? `${migratedPlants} Pflanzen / ${migratedUsers} Spieler` : "keine Änderungen"
    );
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
    const irc = await initWinchallengeIrc();
    step("Winchallenge-IRC", irc.status, irc.detail);
  } catch (e) {
    step("Winchallenge-IRC", false, e.message);
  }
  // Erkennt im Hintergrund die Kartenpools offizieller Clash-Royale-Spezialmodi
  // (nur mit CLASH_ROYALE_API_TOKEN, erster Lauf ~1 Minute nach dem Start)
  try {
    const started = startModeScanner();
    step("CR-Modus-Scanner", started ? true : "warn", started ? "alle 6 h" : "kein CLASH_ROYALE_API_TOKEN");
  } catch (e) {
    step("CR-Modus-Scanner", false, e.message);
  }
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
  server.listen(PORT, "0.0.0.0", () => step("Server", true, `Port ${PORT}`));
})();

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