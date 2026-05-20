// discord/api/guilds.js
const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const guildCache = new Map();

// Timer-Cache gegen Rate Limit (Opcode 8) beim Member-Fetch
const membersFetchCache = new Map();

function hasAdminPermission(permissions) {
    return (BigInt(permissions) & BigInt(0x8)) === BigInt(0x8);
}

module.exports = function({ requireAuth, discordClient, sessions }) {
    const router = express.Router();

    // 1. Server-Liste
    router.get("/", requireAuth, async (req, res) => {
        const userSession = sessions[req.cookies.session];
        if (!userSession?.discord?.accessToken) return res.status(401).json({ error: "Discord not linked" });

        const discordUserId = userSession.discord.userId;
        const now = Date.now();

        if (guildCache.has(discordUserId)) {
            const cachedData = guildCache.get(discordUserId);
            if (now < cachedData.expiresAt) {
                const result = cachedData.guilds.map(g => ({ ...g, botPresent: discordClient.guilds.cache.has(g.id) }));
                return res.json({ guilds: result });
            }
        }

        try {
            const response = await fetch("https://discord.com/api/users/@me/guilds", {
                headers: { Authorization: `Bearer ${userSession.discord.accessToken}` },
            });
            if (!response.ok) throw new Error(`Discord Fehler: ${response.status}`);

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
            res.status(500).json({ error: "Fehler beim Laden der Server" });
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
