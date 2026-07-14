// discord/api/imageOnly.js
const express = require('express');
const { getImageOnlyChannels, saveImageOnlyChannel, deleteImageOnlyChannel } = require('../database/db');

module.exports = function ({ requireAuth, discordClient }) {
    const router = express.Router();

    router.get('/:guildId/image-only', requireAuth, (req, res) => {
        res.json(getImageOnlyChannels(req.params.guildId));
    });

    router.post('/:guildId/image-only', requireAuth, express.json(), async (req, res) => {
        const { channelId, slowmode, enabled } = req.body;
        if (!channelId) return res.status(400).json({ error: 'Fehlende Daten.' });

        const slowmodeSecs = Number(slowmode) || 0;
        saveImageOnlyChannel(req.params.guildId, channelId, slowmodeSecs, enabled !== false ? 1 : 0);

        // Apply Discord slowmode via bot
        try {
            const guild = discordClient.guilds.cache.get(req.params.guildId);
            const channel = guild?.channels.cache.get(channelId);
            if (channel && enabled !== false) {
                await channel.setRateLimitPerUser(slowmodeSecs);
            }
        } catch (e) {
            console.error('[ImageOnly] Slowmode-Fehler:', e.message);
        }

        res.json({ success: true });
    });

    router.delete('/:guildId/image-only/:channelId', requireAuth, async (req, res) => {
        deleteImageOnlyChannel(req.params.guildId, req.params.channelId);

        // Remove slowmode when disabling
        try {
            const guild = discordClient.guilds.cache.get(req.params.guildId);
            const channel = guild?.channels.cache.get(req.params.channelId);
            if (channel) await channel.setRateLimitPerUser(0);
        } catch (e) {}

        res.json({ success: true });
    });

    return router;
};
