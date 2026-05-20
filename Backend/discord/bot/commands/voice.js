// discord/bot/commands/voice.js
const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getActiveVoiceChannelByText } = require('../../database/db');

async function handleVoiceCommand(interaction) {
    const vcRecord = getActiveVoiceChannelByText(interaction.channelId);
    if (!vcRecord) {
        return interaction.reply({ content: '❌ Dieser Command funktioniert nur im dedizierten Voice-Text-Kanal!', flags: MessageFlags.Ephemeral });
    }

    const voiceChannel = interaction.guild.channels.cache.get(vcRecord.voice_channel_id);
    if (!voiceChannel) {
        return interaction.reply({ content: '❌ Der Voice Channel existiert nicht mehr.', flags: MessageFlags.Ephemeral });
    }

    if (!voiceChannel.members.has(interaction.user.id)) {
        return interaction.reply({ content: '❌ Du musst im Voice Channel sein um diesen Command zu nutzen!', flags: MessageFlags.Ephemeral });
    }

    const cmd = interaction.commandName;

    if (cmd === 'voicelimit') {
        const limit = interaction.options.getInteger('limit');
        await voiceChannel.setUserLimit(limit);
        return interaction.reply({
            content: limit === 0
                ? '♾️ Userlimit entfernt — der Channel ist jetzt unbegrenzt.'
                : `👥 Userlimit auf **${limit}** gesetzt.`,
        });
    }

    if (cmd === 'voicelock') {
        const everyoneOverwrite = voiceChannel.permissionOverwrites.cache.get(interaction.guild.id);
        const isLocked = everyoneOverwrite?.deny.has(PermissionFlagsBits.Connect) ?? false;

        if (isLocked) {
            await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: null });
            return interaction.reply({ content: '🔓 Voice Channel entsperrt! Alle können wieder joinen.' });
        } else {
            await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
            // Owner kann trotzdem joinen
            await voiceChannel.permissionOverwrites.edit(vcRecord.owner_id, { Connect: true, ViewChannel: true });
            return interaction.reply({ content: '🔒 Voice Channel gesperrt! Nur noch du kannst joinen.' });
        }
    }

    if (cmd === 'voice_rename') {
        const name = interaction.options.getString('name');
        if (!name || name.length > 100) {
            return interaction.reply({ content: '❌ Name ungültig (max. 100 Zeichen).', flags: MessageFlags.Ephemeral });
        }
        await voiceChannel.setName(name);
        return interaction.reply({ content: `✏️ Voice Channel umbenannt zu **${name}**.` });
    }
}

module.exports = { handleVoiceCommand };
