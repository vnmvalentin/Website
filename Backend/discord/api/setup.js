// discord/api/setup.js — öffentliche Bot-Zahlen und der Einrichtungs-Check eines Servers (Ausbauplan „discord-verzeichnis“).
//
//   GET /api/discord/bot-info              öffentlich: läuft der Bot, auf wie vielen Servern, Einladungs-Link
//   GET /api/discord/guilds/:guildId/check  Einrichtungs-Check (bot/setupCheck.js); nur für Admins des Servers —
//                                           api/index.js hängt requireGuildAdmin vor alle /guilds/:guildId-Routen
const express = require("express");
const { inviteUrl, PERMISSION_NAMES } = require("../bot/permissions");
const { checkSetup } = require("../bot/setupCheck");

const INFO_TTL_MS = 60 * 1000;

/**
 * @param {object} deps
 * @param {Function} deps.requireAuth  Anmeldung fürs Dashboard (api/index.js: jedes Konto)
 * @param {object}   deps.discordClient
 * @param {Function} [deps.loadConfig] (guildId) → Einstellungen für checkSetup; Standard: aus database/db.js
 * @param {string}   [deps.clientId]   Anwendungs-ID des Bots (Standard: DISCORD_CLIENT_ID)
 */
function createSetupRouter({ requireAuth, discordClient, loadConfig = defaultLoadConfig, clientId = process.env.DISCORD_CLIENT_ID }) {
    const router = express.Router();

    let info = null;
    router.get("/bot-info", (req, res) => {
        const now = Date.now();
        if (!info || info.until < now) {
            const ready = typeof discordClient?.isReady === "function" && discordClient.isReady();
            info = {
                until: now + INFO_TTL_MS,
                body: {
                    ready,
                    servers: ready ? discordClient.guilds.cache.size : null,
                    invite: inviteUrl({ clientId }),
                    permissions: PERMISSION_NAMES,
                },
            };
        }
        res.set("Cache-Control", "public, max-age=60").json(info.body);
    });

    router.get("/guilds/:guildId/check", requireAuth, (req, res) => {
        const guild = discordClient.guilds.cache.get(req.params.guildId);
        if (!guild) return res.status(404).json({ error: "Bot ist nicht auf diesem Server.", code: "bot_not_in_guild" });
        const me = guild.members.me;
        if (!me) return res.status(503).json({ error: "Discord antwortet gerade nicht. Bitte gleich noch einmal versuchen.", code: "discord_down" });
        let config;
        try {
            config = loadConfig(guild.id);
        } catch (e) {
            console.error("[Discord] Einrichtungs-Check: Einstellungen nicht lesbar:", e.message);
            return res.status(500).json({ error: "Etwas ist schiefgelaufen.", code: "generic" });
        }
        const result = checkSetup({ guild, me, config });
        res.json({
            ...result,
            invite: inviteUrl({ clientId, guildId: guild.id }),
            botRole: me.roles?.highest ? { id: me.roles.highest.id, name: me.roles.highest.name } : null,
            checkedAt: Date.now(),
        });
    });

    return router;
}

function defaultLoadConfig(guildId) {
    const db = require("../database/db");
    const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
    return {
        settings: db.getSettings(guildId),
        twitchNotifications: safe(() => db.getTwitchNotifications(guildId), []),
        ticketConfig: safe(() => db.getTicketConfig(guildId), null),
        imageOnly: safe(() => db.getImageOnlyChannels(guildId), []),
        syncChannels: safe(() => db.getSyncChannels(guildId), []),
        approvals: safe(() => db.getApprovalConfigs(guildId), []),
        reactionRoles: safe(() => db.getReactionRoles(guildId), []),
        voice: safe(() => db.getVoiceConfig(guildId), null),
        liveRole: safe(() => db.getLiveRole(guildId), null),
        autoRoles: safe(() => db.getAutoRoles(guildId), []),
    };
}

module.exports = createSetupRouter;
