// discord/api/voice.js
const express = require('express');
const { getVoiceConfig, saveVoiceConfig } = require('../database/db');

module.exports = function ({ requireAuth }) {
    const router = express.Router();

    router.get('/:guildId/voice', requireAuth, (req, res) => {
        res.json(getVoiceConfig(req.params.guildId));
    });

    router.post('/:guildId/voice', requireAuth, express.json(), (req, res) => {
        const { triggerChannelId } = req.body;
        saveVoiceConfig(req.params.guildId, triggerChannelId || '');
        res.json({ success: true });
    });

    return router;
};
