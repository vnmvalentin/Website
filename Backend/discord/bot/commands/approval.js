// discord/bot/commands/approval.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const {
    getApprovalConfigById, saveApprovalRequest,
    getApprovalRequest, getPendingRequest, getLatestRejectedRequest, updateApprovalRequest,
} = require('../../database/db');
const { botText } = require('../botText');

async function handleApply(interaction) {
    const t = botText(interaction).approval;
    const configId = interaction.customId.replace('apply_', '');
    const config = getApprovalConfigById(parseInt(configId));
    if (!config) {
        return interaction.reply({ content: t.formGone, flags: MessageFlags.Ephemeral });
    }

    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    // Schutz: doppelte Anfrage
    const pending = getPendingRequest(guildId, config.id, userId);
    if (pending) {
        return interaction.reply({ content: t.alreadyPending, flags: MessageFlags.Ephemeral });
    }

    // Schutz: Cooldown nach Ablehnung
    const rejected = getLatestRejectedRequest(guildId, config.id, userId);
    if (rejected && rejected.resolved_at > 0) {
        const cooldownEnd = rejected.resolved_at + config.cooldownHours * 3600;
        const now = Math.floor(Date.now() / 1000);
        if (now < cooldownEnd) {
            return interaction.reply({
                content: t.cooldown(cooldownEnd),
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        // Privaten Thread erstellen
        const thread = await interaction.channel.threads.create({
            name: t.threadName(interaction.user.username).slice(0, 100),
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
            new ButtonBuilder().setCustomId(`appv_${requestId}`).setLabel(t.approveButton).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`appx_${requestId}`).setLabel(t.rejectButton).setStyle(ButtonStyle.Danger),
        );

        await thread.send({
            content: t.newRequest(userId),
            components: [row],
        });

        await interaction.editReply({ content: t.created(thread.id) });
    } catch (e) {
        console.error('Approval thread error:', e);
        await interaction.editReply({ content: t.threadFailed });
    }
}

/** Gemeinsame Prüfung für Genehmigen und Ablehnen. Gibt { request, config } zurück oder hat schon geantwortet. */
async function checkDecision(interaction, prefix, t) {
    const requestId = parseInt(interaction.customId.replace(prefix, ''));
    const request = getApprovalRequest(requestId);
    if (!request || request.status !== 'pending') {
        await interaction.reply({ content: t.notFound, flags: MessageFlags.Ephemeral });
        return null;
    }

    const config = getApprovalConfigById(request.config_id);
    if (!config) {
        await interaction.reply({ content: t.configGone, flags: MessageFlags.Ephemeral });
        return null;
    }

    // Nur Genehmiger dürfen abstimmen
    if (!config.approverIds.includes(interaction.user.id)) {
        await interaction.reply({ content: t.notApprover, flags: MessageFlags.Ephemeral });
        return null;
    }
    return { requestId, request, config };
}

async function handleApprove(interaction) {
    const t = botText(interaction).approval;
    const checked = await checkDecision(interaction, 'appv_', t);
    if (!checked) return;
    const { requestId, request, config } = checked;

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
                await member.user.send(t.dmApproved(guild.name));
            } catch (e) {}
        }

        updateApprovalRequest(requestId, 'approved');

        // Thread archivieren
        try {
            await interaction.channel.setArchived(true);
        } catch (e) {}

        await interaction.editReply({ content: t.approved });
    } catch (e) {
        console.error(e);
        await interaction.editReply({ content: t.approveFailed });
    }
}

async function handleReject(interaction) {
    const t = botText(interaction).approval;
    const checked = await checkDecision(interaction, 'appx_', t);
    if (!checked) return;
    const { requestId, request } = checked;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(request.user_id).catch(() => null);

        if (member) {
            try {
                await member.user.send(t.dmRejected(guild.name));
            } catch (e) {}
        }

        updateApprovalRequest(requestId, 'rejected');

        try {
            await interaction.channel.setArchived(true);
        } catch (e) {}

        await interaction.editReply({ content: t.rejected });
    } catch (e) {
        console.error(e);
        await interaction.editReply({ content: t.rejectFailed });
    }
}

module.exports = { handleApply, handleApprove, handleReject };
