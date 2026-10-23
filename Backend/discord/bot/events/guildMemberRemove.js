// discord/bot/events/guildMemberRemove.js
const { getSettings } = require('../../database/db');
const { memberCard } = require('../memberCard');
const { memberImageFile } = require('../memberImage');

module.exports = {
    name: 'guildMemberRemove',
    once: false,
    async execute(member) {
        const settings = getSettings(member.guild.id);
        if (!settings.leaveChannel || !settings.leaveMessage) return;

        const channel = member.guild.channels.cache.get(settings.leaveChannel);
        if (!channel) return;

        const finalMessage = settings.leaveMessage
            .replace(/\[USER\]/g, member.user.username)
            .replace(/\[SERVER\]/g, member.guild.name)
            .replace(/\[MEMBER\]/g, member.guild.memberCount);

        try {
            if (settings.leaveStyle === 'image') await channel.send({ content: finalMessage, files: [await memberImageFile(member, 'leave')] });
            else if (settings.leaveStyle === 'card') await channel.send({ embeds: [memberCard(member, finalMessage, 'leave')] });
            else await channel.send(finalMessage);
        } catch (err) {
            console.error('❌ Fehler beim Senden der Austrittsnachricht:', err);
        }
    },
};
