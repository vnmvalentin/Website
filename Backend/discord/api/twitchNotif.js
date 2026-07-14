// discord/api/twitchNotif.js
const express = require('express');
const {
    getTwitchNotifications, saveTwitchNotification,
    updateTwitchNotification, deleteTwitchNotification,
} = require('../database/db');

module.exports = function ({ requireAuth }) {
    const router = express.Router();

    router.get('/:guildId/twitch-notifications', requireAuth, (req, res) => {
        res.json(getTwitchNotifications(req.params.guildId));
    });

    router.post('/:guildId/twitch-notifications', requireAuth, express.json(), (req, res) => {
        const { twitchUsername, channelId, messageTemplate, enabled } = req.body;
        if (!twitchUsername || !channelId) return res.status(400).json({ error: 'Fehlende Daten.' });
        const id = saveTwitchNotification(req.params.guildId, channelId, twitchUsername, messageTemplate || '');
        res.json({ success: true, id });
    });

    router.put('/:guildId/twitch-notifications/:id', requireAuth, express.json(), (req, res) => {
        const { twitchUsername, channelId, messageTemplate, enabled } = req.body;
        updateTwitchNotification(req.params.id, req.params.guildId, channelId, twitchUsername, messageTemplate || '', enabled !== false ? 1 : 0);
        res.json({ success: true });
    });

    router.delete('/:guildId/twitch-notifications/:id', requireAuth, (req, res) => {
        deleteTwitchNotification(req.params.id, req.params.guildId);
        res.json({ success: true });
    });

    return router;
};
