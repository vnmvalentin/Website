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
const { requireGuildAdmin } = require("./guildAccess");

module.exports = function({ requireAuth, discordClient, sessions, saveSessionsToFile }) {
    const router = express.Router();

    router.use("/", authRoutes({ requireAuth, sessions, saveSessionsToFile }));

    // Alles mit Server-Bezug nur für Admins DIESES Servers (vorher reichte jede Twitch-Anmeldung).
    // "/guilds" selbst (die eigene Server-Liste) bleibt frei — das Muster braucht eine ID dahinter.
    router.use(["/settings/:guildId", "/guilds/:guildId"], requireAuth, requireGuildAdmin(discordClient));

    router.use("/guilds",    guildsRoutes({ requireAuth, discordClient, sessions, saveSessionsToFile }));
    router.use("/settings",  settingsRoutes({ requireAuth, discordClient }));
    router.use("/settings",  approvalRoutes({ requireAuth, discordClient }));
    router.use("/settings",  voiceRoutes({ requireAuth }));
    router.use("/settings",  autoRolesRoutes({ requireAuth, discordClient }));
    router.use("/settings",  imageOnlyRoutes({ requireAuth, discordClient }));
    router.use("/settings",  liveRoleRoutes({ requireAuth, discordClient }));
    router.use("/settings",  syncChatRoutes({ requireAuth, discordClient }));
    router.use("/settings",  ticketsRoutes({ requireAuth, discordClient }));
    router.use("/settings",  twitchNotifRoutes({ requireAuth }));
    router.use("/settings",  statsRoutes({ requireAuth, discordClient }));
    router.use("/settings",  loyaltyRoutes({ requireAuth, discordClient }));

    return router;
};
