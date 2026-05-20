// discord/bot/events/guildMemberAdd.js
const { getSettings } = require('../../database/db');

module.exports = {
    name: 'guildMemberAdd',
    once: false,
    async execute(member) {
        // Hole Settings aus der SQLite DB
        const serverSettings = getSettings(member.guild.id);

        if (!serverSettings.welcomeChannel || !serverSettings.welcomeMessage) {
            return;
        }

        const channel = member.guild.channels.cache.get(serverSettings.welcomeChannel);
        if (!channel) return; 

        // NEU: Hänge das .replace für [MEMBER] einfach hinten dran
        const finalMessage = serverSettings.welcomeMessage
            .replace(/\[USER\]/g, `<@${member.id}>`)
            .replace(/\[SERVER\]/g, member.guild.name)
            .replace(/\[MEMBER\]/g, member.guild.memberCount);

        try {
            await channel.send(finalMessage);
        } catch (err) {
            console.error(`[DEBUG] ❌ Fehler beim Senden der Willkommensnachricht:`, err);
        }
    },
};