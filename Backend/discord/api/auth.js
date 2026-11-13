// discord/api/auth.js
const express = require("express");
const crypto = require("crypto");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
// Die Verknüpfung hängt an der Twitch-ID, nicht an der Sitzung (Begründung in ../linkStore.js)
const links = require("../linkStore");

// Nur interne Pfade als Rücksprungziel erlauben (kein Open Redirect)
function safeReturnPath(value, fallback = "/discord-bot") {
    if (typeof value !== "string") return fallback;
    if (!value.startsWith("/") || value.startsWith("//")) return fallback;
    return value;
}

// Schutz gegen untergeschobene Verknüpfungen (OAuth-CSRF): Ohne Prüfwert im `state` konnte
// ein präparierter Callback-Link einem eingeloggten Nutzer ein FREMDES Discord-Konto anhängen.
// Der Prüfwert hängt an der Twitch-ID, gilt 10 Minuten und nur einmal.
const STATE_TTL_MS = 10 * 60 * 1000;
// Mehrere je Nutzer: Dashboard holt den Link schon beim Laden, das Profil beim Klick —
// zwei offene Seiten dürfen sich nicht gegenseitig den Prüfwert wegnehmen.
const STATES_PER_USER = 5;
const pendingStates = new Map(); // twitchId -> [{ nonce, until }]

function issueState(twitchId, returnTo) {
    const now = Date.now();
    if (pendingStates.size > 5000) {
        for (const [k, list] of pendingStates) if (list.every((e) => e.until < now)) pendingStates.delete(k);
    }
    const nonce = crypto.randomBytes(16).toString("hex");
    const list = (pendingStates.get(String(twitchId)) || []).filter((e) => e.until >= now);
    list.push({ nonce, until: now + STATE_TTL_MS });
    pendingStates.set(String(twitchId), list.slice(-STATES_PER_USER));
    return `${nonce}.${returnTo}`;
}

/** @returns {string|null} Rücksprungpfad, wenn der Prüfwert stimmt; sonst null */
function consumeState(twitchId, state) {
    const raw = typeof state === "string" ? state : "";
    const dot = raw.indexOf(".");
    if (dot <= 0) return null;
    const nonce = raw.slice(0, dot);
    const now = Date.now();
    const list = pendingStates.get(String(twitchId)) || [];
    const a = Buffer.from(nonce);
    const hit = list.findIndex((e) => {
        const b = Buffer.from(e.nonce);
        return e.until >= now && a.length === b.length && crypto.timingSafeEqual(a, b);
    });
    if (hit === -1) return null;
    list.splice(hit, 1);
    if (list.length) pendingStates.set(String(twitchId), list); else pendingStates.delete(String(twitchId));
    return safeReturnPath(raw.slice(dot + 1));
}

module.exports = function({ requireAuth, sessions, saveSessionsToFile }) {
    const router = express.Router();

    // Verknüpfung dieses Nutzers. Steckt sie noch in einer alten Sitzung, zieht sie hier um.
    const linkOf = (req) => {
        if (links.migrateFromSessions(req.twitchId, sessions)) saveSessionsToFile(sessions);
        return links.getLink(req.twitchId);
    };

    router.get("/login-url", requireAuth, (req, res) => {
        const returnTo = safeReturnPath(req.query.returnTo);
        const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds&state=${encodeURIComponent(issueState(req.twitchId, returnTo))}`;
        res.json({ url });
    });

    router.get("/callback", requireAuth, async (req, res) => {
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const { code } = req.query;
        const checked = consumeState(req.twitchId, req.query.state);
        if (!checked) return res.redirect(`${frontendUrl}/discord-bot?error=auth_failed`);
        const returnTo = checked;
        if (!code) return res.redirect(`${frontendUrl}${returnTo}?error=no_code`);

        try {
            const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
                method: "POST",
                body: new URLSearchParams({
                    client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code,
                    grant_type: "authorization_code", redirect_uri: REDIRECT_URI,
                }),
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
            const tokens = await tokenResponse.json();
            if (tokens.error) throw new Error(tokens.error_description || "Token Request abgelehnt");

            const userResponse = await fetch("https://discord.com/api/users/@me", {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
            });
            const discordUser = await userResponse.json();

            if (!discordUser || !discordUser.id) throw new Error("Discord hat kein Konto geliefert");
            links.setLink(req.twitchId, {
                accessToken: tokens.access_token, refreshToken: tokens.refresh_token, userId: discordUser.id,
                // Das Zugriffstoken läuft ab (meist nach 7 Tagen) — guilds.js erneuert es rechtzeitig
                expiresAt: tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : 0,
                username: discordUser.global_name || discordUser.username || null,
                avatar: discordUser.avatar
                    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
                    : null,
            });
            // Reste alter Art aus den Sitzungen räumen
            if (links.migrateFromSessions(req.twitchId, sessions)) saveSessionsToFile(sessions);
            res.redirect(`${frontendUrl}${returnTo}`);
        } catch (e) {
            console.error("Discord Auth Fehler:", e);
            res.redirect(`${frontendUrl}${returnTo}?error=auth_failed`);
        }
    });

    // Status der Discord-Verknüpfung für die Profil-Seite
    router.get("/link-status", requireAuth, (req, res) => {
        const discord = linkOf(req);
        if (!discord || !discord.userId) return res.json({ linked: false });
        res.json({
            linked: true,
            user: {
                id: discord.userId,
                username: discord.username || null,
                avatar: discord.avatar || null,
            },
        });
    });

    router.post("/unlink", requireAuth, (req, res) => {
        links.removeLink(req.twitchId);
        if (links.migrateFromSessions(req.twitchId, sessions)) saveSessionsToFile(sessions);
        res.json({ success: true });
    });

    return router;
};
