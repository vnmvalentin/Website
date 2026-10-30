// discord/bot/events/guildMemberAdd.js
const { getSettings } = require('../../database/db');
const { memberCard } = require('../memberCard');
const { memberImageFile } = require('../memberImage');

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
            if (serverSettings.welcomeStyle === 'image') {
                // Der Text steht als gewöhnliche Nachricht über dem Bild — so pingt [USER] wie gewohnt
                await channel.send({ content: finalMessage, files: [await memberImageFile(member, 'welcome', serverSettings.welcomeImageLayout)] });
            } else if (serverSettings.welcomeStyle === 'card') {
                // Eine Erwähnung IN der Karte pingt nicht — deshalb steht sie
                // zusätzlich als Text darüber, wenn die Nachricht [USER] nutzt.
                const ping = /\[USER\]/.test(serverSettings.welcomeMessage) ? `<@${member.id}>` : undefined;
                await channel.send({ content: ping, embeds: [memberCard(member, finalMessage, 'welcome')] });
            } else {
                await channel.send(finalMessage);
            }
        } catch (err) {
            console.error(`[DEBUG] ❌ Fehler beim Senden der Willkommensnachricht:`, err);
        }
    },
};