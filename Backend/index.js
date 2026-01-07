const express = require("express");
require("dotenv").config({ override: true });
const helmet = require("helmet");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const cookieParser = require("cookie-parser");
const { nanoid } = require("nanoid");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args)); // für Twitch-Token-Check

// Feature-Router (wie bingoRoutes)
const createBingoRouter = require("./bingoRoutes");
const createAwardsRouter = require("./awardsRoutes");
const createClipqueueRouter = require("./clipqueueRoutes");
const createGiveawayRouter = require("./giveawayRoutes");
const createPackRouter = require("./packRoutes");
const createWinchallengeRouter = require("./winchallengeRoutes");
const createPollRouter = require("./pollRoutes");
const createKnowledgeRouter = require("./knowledgeRoutes")
const createCasinoRouter = require("./casinoRoutes");

const app = express();

// --- ÄNDERUNG HIER: Helmet Config gelockert ---
app.use(
  helmet({
    // CSP deaktivieren, da es im Dev-Modus und mit externen Bildern (Twitch) 
    // oft zu Problemen führt. 
    contentSecurityPolicy: false, 
    // Erlaubt das Laden von Ressourcen von anderen Ursprüngen (wichtig für Bilder)
    crossOriginEmbedderPolicy: false, 
  })
);
// ----------------------------------------------

app.use(express.json());
app.use(cookieParser());

// Nur deine Domain erlauben
app.use(
  cors({
    origin: ["https://vnmvalentin.de", "https://www.vnmvalentin.de"],
    credentials: true,
  })
);

// =================== CONFIG ===================
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const SESSIONS_PATH = path.join(__dirname, "sessions.json");
const STREAMER_TWITCH_ID = process.env.STREAMER_TWITCH_ID
const ADMIN_PW = process.env.ADMIN_PW || "";

// =================== HELPER ===================
// =================== SESSIONS (file-basiert) ===================

function loadSessionsFromFile() {
  try {
    if (!fs.existsSync(SESSIONS_PATH)) return {};
    const raw = fs.readFileSync(SESSIONS_PATH, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error("Fehler beim Laden von sessions.json:", e);
    return {};
  }
}

function saveSessionsToFile(sessions) {
  try {
    fs.writeFileSync(
      SESSIONS_PATH,
      JSON.stringify(sessions, null, 2),
      "utf8"
    );
  } catch (e) {
    console.error("Fehler beim Speichern von sessions.json:", e);
  }
}


// =================== SESSIONS & AUTH ===================

let sessions = loadSessionsFromFile();

async function verifyTwitchToken(token) {
  try {
    const res = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${token}` },
    });
    if (!res.ok) return null;
    return await res.json(); // enthält user_id, login, scopes, expires_in
  } catch (e) {
    console.error("Token-Validierung fehlgeschlagen:", e);
    return null;
  }
}

function createSession(twitchId, twitchLogin) {
  const now = Date.now();

  // nur abgelaufene/kaputte Sessions löschen
  for (const [id, sess] of Object.entries(sessions)) {
    if (!sess || sess.expiresAt < now) delete sessions[id];
  }

  const sessionId = nanoid(24);
  const expiresAt = Date.now() + SESSION_LIFETIME_MS;

  sessions[sessionId] = {
    twitchId: String(twitchId),
    twitchLogin: String(twitchLogin),
    expiresAt,
  };

  saveSessionsToFile(sessions);
  return sessionId;
}

function requireAuth(req, res, next) {
  const sessionId = req.cookies.session;
  if (!sessionId) {
    return res.status(401).json({ error: "Nicht eingeloggt" });
  }
  const session = sessions[sessionId];
  if (!session) {
    return res.status(401).json({ error: "Session ungültig" });
  }
  if (session.expiresAt < Date.now()) {
    delete sessions[sessionId];
    saveSessionsToFile(sessions);
    return res.status(401).json({ error: "Session abgelaufen" });
  }
  req.twitchId = session.twitchId;
  req.twitchLogin = session.twitchLogin; // NEU
  next();
}


// =================== ROUTES ===================

// Admin Login (ENV Passwort) – UNVERÄNDERT
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (!password)
    return res
      .status(400)
      .json({ ok: false, message: "Kein Passwort übergeben" });

  if (password === ADMIN_PW && ADMIN_PW !== "") {
    return res.json({ ok: true, message: "Login erfolgreich" });
  }
  res.status(401).json({ ok: false, message: "Falsches Passwort" });
});

// Twitch Client ID abrufen – für Frontend Login
app.get("/api/twitch/clientid", (req, res) => {
  res.json({ clientId: process.env.TWITCH_CLIENT_ID || null });
});

// Twitch Auth: Frontend sendet Access Token, Backend prüft & setzt Session-Cookie
app.post("/api/auth/twitch", async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: "Kein Token übergeben" });
  }

  const data = await verifyTwitchToken(token);
  if (!data || !data.user_id) {
    return res.status(401).json({ error: "Ungültiger Token" });
  }

  const sessionId = createSession(data.user_id, data.login);
  res.cookie("session", sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: SESSION_LIFETIME_MS,
  });

  res.json({ ok: true });
});

// Logout: Session invalidieren
app.post("/api/auth/logout", (req, res) => {
  const sessionId = req.cookies.session;
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
    saveSessionsToFile(sessions);
  }
  res.clearCookie("session");
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    twitchId: req.twitchId,
    twitchLogin: req.twitchLogin,
  });
});


// =================== FEATURE ROUTES ===================
// Wichtig: Pfade so gemountet, dass sie weiterhin mit deinen bisherigen /api/... URLs matchen.
app.use("/api/bingo", createBingoRouter({ requireAuth }));

app.use("/api/awards", createAwardsRouter({ requireAuth, STREAMER_TWITCH_ID }));

app.use("/api/clipqueue", createClipqueueRouter({ requireAuth }));

app.use("/", createGiveawayRouter({ requireAuth, STREAMER_TWITCH_ID }));

app.use("/api/winchallenge", createWinchallengeRouter({ requireAuth }));

// PackRoutes enthält /cards/* und /card-suggestions/*
app.use("/api/", createPackRouter({ requireAuth, ADMIN_PW, STREAMER_TWITCH_ID }));

app.use("/", createPollRouter({ requireAuth, STREAMER_TWITCH_ID }));

app.use("/api/knowledge", createKnowledgeRouter({ requireAuth }))

app.use("/api/casino", createCasinoRouter({ requireAuth }));

// =================== START SERVER ===================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`✅ Admin API läuft auf Port ${PORT}`)
);