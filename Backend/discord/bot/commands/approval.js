// discord/bot/commands/approval.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const {
    getApprovalConfigById, saveApprovalRequest,
    getApprovalRequest, getPendingRequest, getLatestRejectedRequest, updateApprovalRequest,
} = require('../../database/db');

async function handleApply(interaction) {
    const configId = interaction.customId.replace('apply_', '');
    const config = getApprovalConfigById(parseInt(configId));
    if (!config) {
        return interaction.reply({ content: '❌ Dieses Formular existiert nicht mehr.', flags: MessageFlags.Ephemeral });
    }

    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    // Schutz: doppelte Anfrage
    const pending = getPendingRequest(guildId, config.id, userId);
    if (pending) {
        return interaction.reply({ content: '⏳ Du hast bereits eine offene Anfrage. Warte auf die Entscheidung!', flags: MessageFlags.Ephemeral });
    }

    // Schutz: Cooldown nach Ablehnung
    const rejected = getLatestRejectedRequest(guildId, config.id, userId);
    if (rejected && rejected.resolved_at > 0) {
        const cooldownEnd = rejected.resolved_at + config.cooldownHours * 3600;
        const now = Math.floor(Date.now() / 1000);
        if (now < cooldownEnd) {
            return interaction.reply({
                content: `❌ Deine letzte Anfrage wurde abgelehnt. Du kannst erst wieder <t:${cooldownEnd}:R> eine neue Anfrage stellen.`,
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        // Privaten Thread erstellen
        const thread = await interaction.channel.threads.create({
            name: `anfrage-${interaction.user.username}`.slice(0, 100),
            type: ChannelType.PrivateThread,
            invitable: false,
        });

        // Antragsteller + Genehmiger hinzufügen
        await thread.members.add(userId);
        for (const approverId of config.approverIds) {
            try { await thread.members.add(approverId); } catch (e) {}
        }

        const requestId = saveApprovalRequest(guildId, config.id, userId, thread.id);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`appv_${requestId}`).setLabel('✅ Genehmigen').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`appx_${requestId}`).setLabel('❌ Ablehnen').setStyle(ButtonStyle.Danger),
        );

        await thread.send({
            content: `📩 **Neue Anfrage von <@${userId}>**\n\nBitte prüft die Anfrage und stimmt ab:`,
            components: [row],
        });

        await interaction.editReply({ content: `✅ Deine Anfrage wurde erstellt! <#${thread.id}>` });
    } catch (e) {
        console.error('Approval thread error:', e);
        await interaction.editReply({ content: '❌ Fehler beim Erstellen des Threads. Hat der Bot die Berechtigung `Threads verwalten`?' });
    }
}

async function handleApprove(interaction) {
    const requestId = parseInt(interaction.customId.replace('appv_', ''));
    const request = getApprovalRequest(requestId);
    if (!request || request.status !== 'pending') {
        return interaction.reply({ content: '❌ Anfrage nicht gefunden oder bereits bearbeitet.', flags: MessageFlags.Ephemeral });
    }

    const config = getApprovalConfigById(request.config_id);
    if (!config) {
        return interaction.reply({ content: '❌ Konfiguration nicht mehr vorhanden.', flags: MessageFlags.Ephemeral });
    }

    // Nur Genehmiger dürfen abstimmen
    if (!config.approverIds.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ Du bist kein Genehmiger für diese Anfrage.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(request.user_id).catch(() => null);

        if (member) {
            if (config.accessType === 'role' && config.accessId) {
                await member.roles.add(config.accessId).catch(e => console.error('Role add failed:', e));
            } else if (config.accessType === 'channel' && config.accessId) {
                const ch = guild.channels.cache.get(config.accessId);
                if (ch) {
                    await ch.permissionOverwrites.create(member.id, {
                        ViewChannel: true,
                        SendMessages: true,
                    }).catch(e => console.error('Channel perm failed:', e));
                }
            }

            // DM senden
            try {
                await member.user.send(`✅ **Deine Anfrage auf ${guild.name} wurde genehmigt!**`);
            } catch (e) {}
        }

        updateApprovalRequest(requestId, 'approved');

        // Thread archivieren
        try {
            await interaction.channel.setArchived(true);
        } catch (e) {}

        await interaction.editReply({ content: '✅ Anfrage genehmigt!' });
    } catch (e) {
        console.error(e);
        await interaction.editReply({ content: '❌ Fehler bei der Genehmigung.' });
    }
}

async function handleReject(interaction) {
    const requestId = parseInt(interaction.customId.replace('appx_', ''));
    const request = getApprovalRequest(requestId);
    if (!request || request.status !== 'pending') {
        return interaction.reply({ content: '❌ Anfrage nicht gefunden oder bereits bearbeitet.', flags: MessageFlags.Ephemeral });
    }

    const config = getApprovalConfigById(request.config_id);
    if (!config) {
        return interaction.reply({ content: '❌ Konfiguration nicht mehr vorhanden.', flags: MessageFlags.Ephemeral });
    }

    if (!config.approverIds.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ Du bist kein Genehmiger für diese Anfrage.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(request.user_id).catch(() => null);

        if (member) {
            try {
                await member.user.send(`❌ **Deine Anfrage auf ${guild.name} wurde abgelehnt.**`);
            } catch (e) {}
        }

        updateApprovalRequest(requestId, 'rejected');

        try {
            await interaction.channel.setArchived(true);
        } catch (e) {}

        await interaction.editReply({ content: '❌ Anfrage abgelehnt.' });
    } catch (e) {
        console.error(e);
        await interaction.editReply({ content: '❌ Fehler bei der Ablehnung.' });
    }
}

module.exports = { handleApply, handleApprove, handleReject };
