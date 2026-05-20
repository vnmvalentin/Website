// discord/api/auth.js
const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;

module.exports = function({ requireAuth, sessions, saveSessionsToFile }) {
    const router = express.Router();

    router.get("/login-url", requireAuth, (req, res) => {
        const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
        res.json({ url });
    });

    router.get("/callback", requireAuth, async (req, res) => {
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const { code } = req.query;
        if (!code) return res.redirect(`${frontendUrl}/discord-bot?error=no_code`);

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

            const sessionId = req.cookies.session;
            if (sessionId && sessions[sessionId]) {
                sessions[sessionId].discord = {
                    accessToken: tokens.access_token, refreshToken: tokens.refresh_token, userId: discordUser.id
                };
                saveSessionsToFile(sessions);
            }
            res.redirect(`${frontendUrl}/discord-bot`);
        } catch (e) {
            console.error("Discord Auth Fehler:", e);
            res.redirect(`${frontendUrl}/discord-bot?error=auth_failed`);
        }
    });

    return router;
};