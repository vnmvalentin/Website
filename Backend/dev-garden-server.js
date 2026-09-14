// Backend/dev-garden-server.js
// Eigener, schlanker Server NUR für das Garden Game — für die lokale v2-Baustelle.
//
// WARUM EIN EIGENER SERVER UND NICHT index.js
// index.js lädt beim Start unbedingt den Discord-Bot-Client und die Twitch-IRC-
// Verbindung mit (siehe dortiger Kopf). Ein zweiter, parallel laufender Prozess mit
// denselben Live-Zugangsdaten wäre ein zweiter Discord-Bot unter demselben Token —
// doppelte Slash-Command-Registrierung, möglicher Rate-Limit/Kick durch Discord.
// Für "lokal am Garden Game bauen" braucht es nichts davon: nur Express + die
// Garden-Routen + der Garden-Socket, genau wie im bestehenden Test-Harness-Muster
// (siehe [[project_garden_mp_harness]] in der Memory). Deshalb hier ohne .env,
// ohne Discord, ohne Twitch — dieser Prozess kennt gar keine Live-Zugangsdaten.
//
// LOGIN OHNE ECHTES TWITCH-OAUTH
// requireAuth prüft nur ein Cookie "session" gegen eine sessionId → { twitchId,
// twitchLogin }-Map, genau wie in index.js. /api/dev/login legt so eine Session
// direkt an, ohne den echten OAuth-Umweg — nur in diesem Prozess nutzbar.
//
// START: cd Backend && node dev-garden-server.js   (Port über PORT env, Default 4001)
// Danach Frontend-Dev-Server separat starten (siehe Frontend/vite.config.js — der
// Proxy in diesem Worktree zeigt bereits auf Port 4001) und im Browser
// http://localhost:5183/api/dev/login öffnen, danach auf /garden gehen.

const express = require("express");
const http = require("http");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { Server } = require("socket.io");
const { nanoid } = require("nanoid");

const createGardenGameRouter = require("./garden/routes/gardenGameRoutes");
const { registerGardenSocket } = require("./garden/world/lobby");
const { runGardenMigrations } = require("./garden/migrations");
const {
    farmStates, initGardenFarmsStore, saveAllFarmsOnExit,
    scheduleFarmsSave: scheduleFarmsSaveFuerMigration,
} = require("./garden/store/farms");
const { step } = require("./lib/startupLog");

const PORT = process.env.PORT || 4001;
const ALLOWED_ORIGINS = ["http://localhost:5183", "http://127.0.0.1:5183"];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: ALLOWED_ORIGINS, credentials: true },
    path: "/socket.io",
});

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Sessions — nur im Speicher, dieser Prozess kennt keine echten Zugangsdaten ──
const sessions = {};
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function requireAuth(req, res, next) {
    const sessionId = req.cookies.session;
    if (!sessionId) return res.status(401).json({ error: "Nicht eingeloggt" });
    const session = sessions[sessionId];
    if (!session || session.expiresAt < Date.now()) return res.status(401).json({ error: "Session abgelaufen" });
    req.twitchId = session.twitchId;
    req.twitchLogin = session.twitchLogin;
    next();
}

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

function getSessionFromSocket(socket) {
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    const session = sessions[cookies.session];
    if (!session || session.expiresAt < Date.now()) return null;
    return { twitchId: session.twitchId, twitchLogin: session.twitchLogin };
}

// ── Die GLOBALE Twitch-Auth-Schicht ─────────────────────────────────────────
// TwitchAuthProvider.jsx ist eine ZWEITE, von der Garden-Session unabhängige
// Ebene: sie hält `user` in localStorage, holt sich beim Start eine Client-ID
// über /api/twitch/clientid (ohne die restauriert sie den localStorage-User gar
// nicht erst — siehe deren zweiter useEffect) und bestätigt jeden restaurierten
// User über /api/auth/me; schlägt DAS fehl, wirft syncBackendSession() den User
// sofort wieder raus. Beide müssen hier also mitgestubbt werden, sonst zeigt die
// Farm zwar den Garden-Spielstand, aber GameContainer sieht `authUser` nie.
app.get("/api/twitch/clientid", (req, res) => res.json({ clientId: "v2dev-fake-client-id" }));

app.get("/api/auth/me", (req, res) => {
    const session = sessions[req.cookies.session];
    if (!session || session.expiresAt < Date.now()) return res.status(401).json({ error: "Nicht eingeloggt" });
    res.json({ ok: true, twitchId: session.twitchId, twitchLogin: session.twitchLogin });
});

// GET statt POST: so reicht ein Klick auf den Link im Browser, ohne extra Tooling.
// `name`-Query wählt die Spielfigur — mehrere Namen = mehrere Testkonten nebeneinander,
// genau wie die zwei Browser-Kontexte im CR/Garden-Test-Harness ([[project_cr_e2e_harness]]).
//
// Antwortet mit einer winzigen HTML-Seite statt einem reinen Redirect: die
// Garden-Session (Cookie) ist damit noch nicht die Twitch-Auth-Schicht — die
// lebt in localStorage (siehe oben) und lässt sich nur aus dem Browser heraus
// setzen, nicht aus einer Server-Antwort.
app.get("/api/dev/login", (req, res) => {
    const name = String(req.query.name || "dev").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "dev";
    const twitchId = `v2dev_${name}`;
    const sessionId = nanoid(24);
    sessions[sessionId] = { twitchId, twitchLogin: name, expiresAt: Date.now() + SESSION_LIFETIME_MS };
    res.cookie("session", sessionId, { httpOnly: true, secure: false, sameSite: "lax", maxAge: SESSION_LIFETIME_MS });
    const user = JSON.stringify({
        id: twitchId, twitchId, login: name, twitchLogin: name,
        display_name: name, displayName: name, profile_image_url: "", profileImageUrl: "",
    });
    res.type("html").send(`<!doctype html><script>
        localStorage.setItem("twitchUser", ${JSON.stringify(user)});
        localStorage.setItem("twitchAccessToken", "v2dev-fake-token");
        location.replace("/garden");
    </script>`);
});

app.use("/api/garden", createGardenGameRouter({ requireAuth }));

io.on("connection", (socket) => {
    registerGardenSocket(socket, io, getSessionFromSocket, farmStates);
});

(async () => {
    await initGardenFarmsStore();
    step("Garden-DB (v2)", true);
    for (const zeile of runGardenMigrations(farmStates, { scheduleFarmsSave: scheduleFarmsSaveFuerMigration })) {
        step(zeile.name, true, zeile.text);
    }
    server.listen(PORT, () => {
        console.log(`\n[garden-v2] läuft auf http://localhost:${PORT}`);
        console.log(`[garden-v2] Login: http://localhost:5183/api/dev/login  (Frontend-Dev-Server muss laufen)\n`);
    });
})();

process.on("SIGINT", () => { saveAllFarmsOnExit(); process.exit(0); });
process.on("SIGTERM", () => { saveAllFarmsOnExit(); process.exit(0); });
