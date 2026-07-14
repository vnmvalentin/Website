// discord/api/liveRole.js
const express = require('express');
const { getLiveRole, saveLiveRole, deleteLiveRole } = require('../database/db');

module.exports = function ({ requireAuth }) {
    const router = express.Router();

    router.get('/:guildId/live-role', requireAuth, (req, res) => {
        res.json(getLiveRole(req.params.guildId) || {});
    });

    router.post('/:guildId/live-role', requireAuth, express.json(), (req, res) => {
        const { liveRoleId, restrictionRoleId, enabled } = req.body;
        if (!liveRoleId) return res.status(400).json({ error: 'liveRoleId fehlt.' });
        saveLiveRole(req.params.guildId, liveRoleId, restrictionRoleId || null, enabled !== false);
        res.json({ success: true });
    });

    router.delete('/:guildId/live-role', requireAuth, (req, res) => {
        deleteLiveRole(req.params.guildId);
        res.json({ success: true });
    });

    return router;
};
