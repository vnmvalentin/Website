// discord/api/autoRoles.js
const express = require('express');

module.exports = function ({ requireAuth, discordClient }) {
    const router = express.Router();

    // One-shot bulk role assignment: give all members with sourceRoleId also the assignRoleId
    router.post('/:guildId/assign-roles', requireAuth, express.json(), async (req, res) => {
        const { sourceRoleId, assignRoleId } = req.body;
        if (!sourceRoleId || !assignRoleId) return res.status(400).json({ error: 'Fehlende Daten.' });

        try {
            const guild = discordClient.guilds.cache.get(req.params.guildId);
            if (!guild) return res.status(404).json({ error: 'Server nicht gefunden.' });

            // Fetch all members (bypasses cache limit)
            await guild.members.fetch();

            const targets = guild.members.cache.filter(
                m => !m.user.bot && m.roles.cache.has(sourceRoleId) && !m.roles.cache.has(assignRoleId)
            );

            let count = 0;
            for (const member of targets.values()) {
                await member.roles.add(assignRoleId).catch(() => {});
                count++;
            }

            res.json({ success: true, count });
        } catch (e) {
            console.error('[AutoRoles] Fehler:', e.message);
            res.status(500).json({ error: 'Fehler beim Vergeben der Rollen. Steht die Bot-Rolle über der Zielrolle?' });
        }
    });

    return router;
};
