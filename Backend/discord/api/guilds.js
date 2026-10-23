// discord/api/guilds.js
const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const links = require("../linkStore");

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const guildCache = new Map();

/**
 * Holt mit dem Erneuerungs-Token ein frisches Zugriffstoken. Discord-Zugriffstokens laufen ab
 * (meist nach 7 Tagen); ohne das sah es danach aus, als sei man abgemeldet.
 * @returns {"ok"|"invalid"|"error"} invalid = Verknüpfung wirklich widerrufen, error = Discord gerade nicht erreichbar
 */
async function refreshTokens(twitchId, link) {
    if (!link.refreshToken) return "invalid";
    try {
        const res = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "refresh_token", refresh_token: link.refreshToken }),
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        const tokens = await res.json().catch(() => ({}));
        if (res.ok && tokens.access_token) {
            links.setTokens(twitchId, {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token || link.refreshToken,
                expiresAt: tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : 0,
            });
            return "ok";
        }
        // 400/401 mit invalid_grant: der Nutzer hat der Anwendung den Zugriff entzogen
        if (res.status === 400 || res.status === 401) return "invalid";
        return "error";
    } catch {
        return "error";
    }
}

// Timer-Cache gegen Rate Limit (Opcode 8) beim Member-Fetch
const membersFetchCache = new Map();

function hasAdminPermission(permissions) {
    return (BigInt(permissions) & BigInt(0x8)) === BigInt(0x8);
}

module.exports = function({ requireAuth, discordClient, sessions, saveSessionsToFile }) {
    const router = express.Router();

    // 1. Server-Liste
    router.get("/", requireAuth, async (req, res) => {
        // Verknüpfung alter Art (an der Sitzung) zieht beim ersten Zugriff in die Datenbank um
        if (links.migrateFromSessions(req.twitchId, sessions) && saveSessionsToFile) saveSessionsToFile(sessions);
        let link = links.getLink(req.twitchId);
        // 401 heißt hier und NUR hier: nicht verknüpft. Das Dashboard zeigt dann die Discord-Anmeldung.
        if (!link || !link.accessToken) return res.status(401).json({ error: "Discord not linked" });

        const discordUserId = link.userId;
        const now = Date.now();
        const cachedData = guildCache.get(discordUserId);
        const fromCache = () => ({ guilds: cachedData.guilds.map(g => ({ ...g, botPresent: discordClient.guilds.cache.has(g.id) })) });

        if (cachedData && now < cachedData.expiresAt) return res.json(fromCache());

        // Discord gerade nicht erreichbar oder gedrosselt: lieber der letzte bekannte Stand als ein
        // Fehler — und auf keinen Fall „abgemeldet“.
        const unavailable = () => (cachedData
            ? res.json(fromCache())
            : res.status(503).json({ error: "Discord antwortet gerade nicht. Bitte gleich noch einmal versuchen." }));

        try {
            // Läuft das Zugriffstoken ab (oder ist es schon abgelaufen), vorher erneuern
            if (link.expiresAt && link.expiresAt < now + 60 * 1000) {
                const r = await refreshTokens(req.twitchId, link);
                if (r === "invalid") { links.removeLink(req.twitchId); return res.status(401).json({ error: "Discord not linked" }); }
                if (r === "ok") link = links.getLink(req.twitchId);
            }
            const load = (token) => fetch("https://discord.com/api/users/@me/guilds", { headers: { Authorization: `Bearer ${token}` } });
            let response = await load(link.accessToken);
            if (response.status === 401) {
                // Token abgelehnt: einmal erneuern und noch einmal versuchen
                const r = await refreshTokens(req.twitchId, link);
                if (r === "invalid") { links.removeLink(req.twitchId); return res.status(401).json({ error: "Discord not linked" }); }
                if (r === "error") return unavailable();
                link = links.getLink(req.twitchId);
                response = await load(link.accessToken);
                if (response.status === 401) { links.removeLink(req.twitchId); return res.status(401).json({ error: "Discord not linked" }); }
            }
            if (!response.ok) return unavailable();

            const guilds = await response.json();
            const adminGuilds = guilds.filter(g => hasAdminPermission(g.permissions));

            const result = adminGuilds.map(guild => ({
                id: guild.id, name: guild.name,
                icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
                botPresent: discordClient.guilds.cache.has(guild.id),
                inviteUrl: `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands&guild_id=${guild.id}&disable_guild_select=true`
            }));

            guildCache.set(discordUserId, { guilds: result, expiresAt: now + (5 * 60 * 1000) });
            res.json({ guilds: result });
        } catch (e) {
            unavailable();
        }
    });

    // 2. Kanäle — type=0 (Text, default), type=2 (Voice), type=4 (Kategorie)
    router.get("/:guildId/channels", requireAuth, (req, res) => {
        const guild = discordClient.guilds.cache.get(req.params.guildId);
        if (!guild) return res.status(404).json({ error: "Bot ist nicht auf diesem Server." });

        const type = req.query.type !== undefined ? parseInt(req.query.type) : 0;
        const channels = guild.channels.cache
            .filter(c => c.type === type)
            .map(c => ({ id: c.id, name: c.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        res.json({ channels });
    });

    // 3. Rollen
    router.get("/:guildId/roles", requireAuth, (req, res) => {
        const guild = discordClient.guilds.cache.get(req.params.guildId);
        if (!guild) return res.status(404).json({ error: "Bot ist nicht auf diesem Server." });

        const roles = guild.roles.cache
            .filter(r => r.name !== '@everyone' && !r.managed)
            .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
            .sort((a, b) => b.rawPosition - a.rawPosition);
        res.json({ roles });
    });

    // 4. Emojis
    router.get("/:guildId/emojis", requireAuth, (req, res) => {
        const guild = discordClient.guilds.cache.get(req.params.guildId);
        if (!guild) return res.status(404).json({ error: "Bot ist nicht auf dem Server." });

        const emojis = guild.emojis.cache.map(e => ({
            id: e.id,
            name: e.name,
            url: e.imageURL(),
            animated: e.animated
        }));
        res.json({ emojis });
    });

    // 5. Mitglieder — mit 2-Minuten-Cooldown gegen Opcode-8-Rate-Limit
    router.get("/:guildId/members", requireAuth, async (req, res) => {
        const guild = discordClient.guilds.cache.get(req.params.guildId);
        if (!guild) return res.status(404).json({ error: "Bot ist nicht auf dem Server." });

        try {
            const now = Date.now();
            const lastFetch = membersFetchCache.get(guild.id) || 0;

            if (now - lastFetch > 120000) {
                try {
                    await guild.members.fetch();
                    membersFetchCache.set(guild.id, now);
                } catch (fetchError) {
                    console.warn(`[Discord API] Member Fetch Rate Limit — nutze Cache für ${guild.name}`);
                }
            }

            const members = guild.members.cache
                .filter(m => !m.user.bot)
                .map(m => ({
                    id: m.id,
                    username: m.user.username,
                    displayName: m.displayName,
                    avatar: m.displayAvatarURL({ size: 64, extension: 'webp' }),
                }))
                .sort((a, b) => a.displayName.localeCompare(b.displayName));

            res.json({ members });
        } catch (e) {
            console.error("Fehler beim Laden der Mitglieder:", e);
            res.status(500).json({ error: "Konnte Mitglieder nicht laden." });
        }
    });

    return router;
};
