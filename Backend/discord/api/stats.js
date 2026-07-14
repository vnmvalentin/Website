// discord/api/stats.js
const express = require('express');
const { getMessageStats, getVoiceStats } = require('../database/db');

module.exports = function ({ requireAuth, discordClient }) {
    const router = express.Router();

    router.get('/:guildId/stats', requireAuth, async (req, res) => {
        const guildId = req.params.guildId;
        const days = Number(req.query.days) || 30;

        const rawMessages = getMessageStats(guildId, days);
        const rawVoice = getVoiceStats(guildId, days);

        const guild = discordClient.guilds.cache.get(guildId);

        // Fetch members not in cache individually so we get real display names
        if (guild && rawVoice.length > 0) {
            const uncachedIds = rawVoice
                .map(r => r.userId)
                .filter(id => !guild.members.cache.has(id));
            if (uncachedIds.length > 0) {
                try {
                    await guild.members.fetch({ user: uncachedIds });
                } catch (e) {
                    console.warn('[Stats] Member-Fetch teilweise fehlgeschlagen:', e.message);
                }
            }
        }

        const messageStats = rawMessages.map(row => ({
            channelId: row.channelId,
            total: row.total,
            channelName: guild?.channels.cache.get(row.channelId)?.name || row.channelId,
        }));

        const voiceStats = rawVoice.map(row => ({
            userId: row.userId,
            totalSeconds: row.totalSeconds,
            displayName: guild?.members.cache.get(row.userId)?.displayName || row.userId,
        }));

        res.json({ messageStats, voiceStats });
    });

    return router;
};
