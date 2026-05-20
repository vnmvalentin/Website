// discord/api/index.js
const express = require("express");
const authRoutes = require("./auth");
const guildsRoutes = require("./guilds");
const settingsRoutes = require("./settings");
const approvalRoutes = require("./approval");
const voiceRoutes = require("./voice");

module.exports = function({ requireAuth, discordClient, sessions, saveSessionsToFile }) {
    const router = express.Router();

    router.use("/", authRoutes({ requireAuth, sessions, saveSessionsToFile }));
    router.use("/guilds", guildsRoutes({ requireAuth, discordClient, sessions }));
    router.use("/settings", settingsRoutes({ requireAuth, discordClient }));
    router.use("/settings", approvalRoutes({ requireAuth, discordClient }));
    router.use("/settings", voiceRoutes({ requireAuth }));

    return router;
};
