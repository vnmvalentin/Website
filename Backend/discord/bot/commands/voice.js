// discord/bot/commands/voice.js
const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getActiveVoiceChannelByText, updateVoiceOwner } = require('../../database/db');
const { updateVoicePinOwner } = require('../events/voiceStateUpdate');

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

    if (cmd === 'voice_hide') {
        await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
        // Besitzer + alle aktuellen Mitglieder dürfen den Channel weiterhin sehen
        await voiceChannel.permissionOverwrites.edit(vcRecord.owner_id, { ViewChannel: true, Connect: true }).catch(() => {});
        for (const m of voiceChannel.members.values()) {
            if (m.user.bot || m.id === vcRecord.owner_id) continue;
            await voiceChannel.permissionOverwrites.edit(m.id, { ViewChannel: true }).catch(() => {});
        }
        return interaction.reply({ content: '🙈 Voice Channel versteckt! Nur die aktuellen Mitglieder sehen ihn noch.' });
    }

    if (cmd === 'voice_unhide') {
        await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: null });
        return interaction.reply({ content: '👁️ Voice Channel ist wieder für alle sichtbar.' });
    }

    if (cmd === 'voice_transfer') {
        if (vcRecord.owner_id !== interaction.user.id) {
            return interaction.reply({ content: '❌ Nur der Channel-Besitzer kann den Besitz übertragen!', flags: MessageFlags.Ephemeral });
        }
        const target = interaction.options.getUser('user');
        if (!target || target.bot) {
            return interaction.reply({ content: '❌ Ungültiger Nutzer.', flags: MessageFlags.Ephemeral });
        }
        if (target.id === interaction.user.id) {
            return interaction.reply({ content: '❌ Du bist bereits der Besitzer.', flags: MessageFlags.Ephemeral });
        }
        const targetMember = voiceChannel.members.get(target.id);
        if (!targetMember) {
            return interaction.reply({ content: '❌ Der Nutzer muss dafür im Voice Channel sein!', flags: MessageFlags.Ephemeral });
        }

        updateVoiceOwner(voiceChannel.id, target.id);
        // Neuer Besitzer bekommt garantierten Zugang (relevant bei gesperrtem/verstecktem Channel)
        await voiceChannel.permissionOverwrites.edit(target.id, { ViewChannel: true, Connect: true }).catch(() => {});
        // Besitzer-Zeile in der angepinnten Nachricht aktualisieren
        await updateVoicePinOwner(interaction.guild, vcRecord, target.id);
        return interaction.reply({ content: `👑 **${targetMember.displayName}** ist jetzt der Channel-Besitzer.` });
    }
}

module.exports = { handleVoiceCommand };
