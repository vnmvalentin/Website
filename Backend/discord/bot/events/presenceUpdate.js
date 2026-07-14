// discord/bot/events/presenceUpdate.js
const { ActivityType } = require('discord.js');
const { getAllEnabledLiveRoles } = require('../../database/db');

module.exports = {
    name: 'presenceUpdate',
    async execute(oldPresence, newPresence) {
        if (!newPresence?.member || newPresence.member.user.bot) return;

        const member = newPresence.member;
        const guild = newPresence.guild;
        if (!guild) return;

        const configs = getAllEnabledLiveRoles();
        const config = configs.find(r => r.guildId === guild.id);
        if (!config) return;

        const isStreaming = newPresence.activities?.some(a => a.type === ActivityType.Streaming) ?? false;
        const wasStreaming = oldPresence?.activities?.some(a => a.type === ActivityType.Streaming) ?? false;

        if (isStreaming === wasStreaming) return;

        try {
            // Check restriction role if configured
            if (config.restrictionRoleId && !member.roles.cache.has(config.restrictionRoleId)) return;

            if (isStreaming && !member.roles.cache.has(config.liveRoleId)) {
                await member.roles.add(config.liveRoleId);
            } else if (!isStreaming && member.roles.cache.has(config.liveRoleId)) {
                await member.roles.remove(config.liveRoleId);
            }
        } catch (e) {
            console.warn(`[LiveRole] Fehler bei ${member.user.tag}:`, e.message);
        }
    },
};
