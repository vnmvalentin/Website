// discord/bot/commands/tickets.js
const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, MessageFlags,
    ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder,
} = require('discord.js');
const {
    getTicketConfig, getTicketFields, saveTicketHistoryEntry, closeTicketHistoryEntry,
} = require('../../database/db');
const { botText } = require('../botText');

// Feld, wenn der Server keine eigenen Felder eingerichtet hat — Beschriftung in der Sprache des Servers
const defaultField = (t) => ({ ...t.defaultField, required: true, style: 2 });

async function handleTicketCreateButton(interaction) {
    const t = botText(interaction).tickets;
    const config = getTicketConfig(interaction.guildId);
    if (!config) {
        return interaction.reply({ content: t.notSetUp, flags: MessageFlags.Ephemeral });
    }

    const fields = getTicketFields(interaction.guildId);
    const usedFields = fields.length > 0 ? fields : [defaultField(t)];

    try {
        const modal = new ModalBuilder()
            .setCustomId('ticket_modal')
            .setTitle((config.embedTitle || t.defaultTitle).slice(0, 45));

        modal.addComponents(...usedFields.slice(0, 5).map((f, i) => {
            const input = new TextInputBuilder()
                .setCustomId(`field_${i}`)
                .setLabel(f.label.slice(0, 45))
                .setStyle(f.style === 2 ? TextInputStyle.Paragraph : TextInputStyle.Short)
                .setRequired(f.required !== false)
                .setMaxLength(f.style === 2 ? 1000 : 200);
            if (f.placeholder) input.setPlaceholder(f.placeholder.slice(0, 100));
            return new ActionRowBuilder().addComponents(input);
        }));

        await interaction.showModal(modal);
    } catch (e) {
        console.error('Ticket modal error:', e);
        if (!interaction.replied) {
            await interaction.reply({ content: t.formFailed, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
}

async function handleTicketModalSubmit(interaction) {
    const t = botText(interaction).tickets;
    const config = getTicketConfig(interaction.guildId);
    if (!config) {
        return interaction.reply({ content: t.notSetUp, flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const fields = getTicketFields(interaction.guildId);
    const usedFields = fields.length > 0 ? fields : [defaultField(t)];
    const fieldData = {};
    usedFields.slice(0, 5).forEach((f, i) => {
        try { fieldData[f.label] = interaction.fields.getTextInputValue(`field_${i}`); } catch {}
    });

    try {
        const guild = interaction.guild;

        const overwrites = [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ];
        // Nur Rollen setzen, die auf dem Server auch wirklich noch existieren (sonst lehnt Discord den ganzen Request ab)
        const validHandlerRoleIds = (config.handlerRoleIds || []).filter(roleId => guild.roles.cache.has(roleId));
        for (const roleId of validHandlerRoleIds) {
            overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
        }
        const botMember = guild.members.me;
        if (botMember) {
            overwrites.push({ id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] });
        }

        const channelName = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90) || `ticket-${interaction.user.id}`;

        // Nur als Parent nutzen, wenn die Kategorie noch existiert und wirklich eine Kategorie ist
        // (sonst lehnt Discord die Channel-Erstellung mit einem wenig aussagekräftigen Fehler ab)
        const parentCategory = config.categoryId ? guild.channels.cache.get(config.categoryId) : null;
        const parent = parentCategory?.type === ChannelType.GuildCategory ? parentCategory.id : null;

        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent,
            permissionOverwrites: overwrites,
        });

        saveTicketHistoryEntry(interaction.guildId, interaction.user.id, channel.id, interaction.user.username, fieldData);

        const embed = new EmbedBuilder()
            .setTitle(`🎫 ${config.embedTitle || t.defaultTitle}`)
            .setColor(config.embedColor || '#5865F2')
            .setDescription(t.createdBy(interaction.user.id))
            .addFields(Object.entries(fieldData).map(([name, value]) => ({ name, value: value || '—' })))
            .setTimestamp();

        const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_close').setLabel(t.closeButton).setStyle(ButtonStyle.Danger)
        );

        const mentions = [`<@${interaction.user.id}>`, ...validHandlerRoleIds.map(id => `<@&${id}>`)].join(' ');

        await channel.send({ content: mentions, embeds: [embed], components: [closeRow] });

        await interaction.editReply({ content: t.created(channel.id) });
    } catch (e) {
        console.error('Ticket creation error:', e);
        await interaction.editReply({ content: t.createFailed(e.message || e) });
    }
}

async function handleTicketClose(interaction) {
    const t = botText(interaction).tickets;
    const config = getTicketConfig(interaction.guildId);
    const isHandler = config?.handlerRoleIds?.some(id => interaction.member.roles.cache.has(id));
    const canManage = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
    if (!isHandler && !canManage) {
        return interaction.reply({ content: t.onlyHandlers, flags: MessageFlags.Ephemeral });
    }

    try {
        await interaction.reply({ content: t.closing });
        closeTicketHistoryEntry(interaction.channelId);
        setTimeout(() => {
            interaction.channel.delete().catch(() => {});
        }, 5000);
    } catch (e) {
        console.error('Ticket close error:', e);
    }
}

module.exports = { handleTicketCreateButton, handleTicketModalSubmit, handleTicketClose };
