// discord/api/index.js
const express = require("express");
const authRoutes      = require("./auth");
const guildsRoutes    = require("./guilds");
const settingsRoutes  = require("./settings");
const approvalRoutes  = require("./approval");
const voiceRoutes     = require("./voice");
const autoRolesRoutes = require("./autoRoles");
const imageOnlyRoutes = require("./imageOnly");
const liveRoleRoutes  = require("./liveRole");
const syncChatRoutes  = require("./syncChat");
const ticketsRoutes   = require("./tickets");
const twitchNotifRoutes = require("./twitchNotif");
const statsRoutes     = require("./stats");
const loyaltyRoutes   = require("./loyalty");
const setupRoutes     = require("./setup");
const { requireGuildAdmin } = require("./guildAccess");
const links = require("../linkStore");

/**
 * Anmeldung fürs Dashboard: Seit „discord-verzeichnis“ reicht jedes Konto (Twitch, Discord, Gast) — wer den Bot über
 * eine Bot-Liste findet, hat oft kein Twitch. Gibt index.js kein requireKonto mit (ältere Prüfstände), bleibt es bei
 * Twitch. req.linkKey ist der Schlüssel der Discord-Verknüpfung (linkStore.linkKeyOf).
 */
function dashboardAuth(base) {
    return function requireDashboardUser(req, res, next) {
        base(req, res, (err) => {
            if (err) return next(err);
            req.linkKey = links.linkKeyOf(req);
            if (!req.linkKey) return res.status(401).json({ error: "Nicht angemeldet", code: "not_signed_in" });
            next();
        });
    };
}

module.exports = function({ requireAuth, requireKonto, discordClient, sessions, saveSessionsToFile }) {
    const router = express.Router();
    const requireUser = dashboardAuth(requireKonto || requireAuth);

    router.use("/", authRoutes({ requireAuth: requireUser, sessions, saveSessionsToFile }));

    // Alles mit Server-Bezug nur für Admins DIESES Servers (vorher reichte jede Twitch-Anmeldung).
    // "/guilds" selbst (die eigene Server-Liste) bleibt frei — das Muster braucht eine ID dahinter.
    router.use(["/settings/:guildId", "/guilds/:guildId"], requireUser, requireGuildAdmin(discordClient));

    // Öffentlich /bot-info (Einstiegsseite /tools/discord-bot) und der Einrichtungs-Check /guilds/:guildId/check —
    // NACH der Admin-Prüfung eingehängt, damit sie auch für den Check gilt
    router.use("/", setupRoutes({ requireAuth: requireUser, discordClient }));

    router.use("/guilds",    guildsRoutes({ requireAuth: requireUser, discordClient, sessions, saveSessionsToFile }));
    router.use("/settings",  settingsRoutes({ requireAuth: requireUser, discordClient }));
    router.use("/settings",  approvalRoutes({ requireAuth: requireUser, discordClient }));
    router.use("/settings",  voiceRoutes({ requireAuth: requireUser }));
    router.use("/settings",  autoRolesRoutes({ requireAuth: requireUser, discordClient }));
    router.use("/settings",  imageOnlyRoutes({ requireAuth: requireUser, discordClient }));
    router.use("/settings",  liveRoleRoutes({ requireAuth: requireUser, discordClient }));
    router.use("/settings",  syncChatRoutes({ requireAuth: requireUser, discordClient }));
    router.use("/settings",  ticketsRoutes({ requireAuth: requireUser, discordClient }));
    router.use("/settings",  twitchNotifRoutes({ requireAuth: requireUser }));
    router.use("/settings",  statsRoutes({ requireAuth: requireUser, discordClient }));
    router.use("/settings",  loyaltyRoutes({ requireAuth: requireUser, discordClient }));

    return router;
};
