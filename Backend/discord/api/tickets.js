// discord/api/tickets.js
const express = require('express');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
    getTicketConfig, saveTicketConfig, updateTicketConfigMessageId, deleteTicketConfig,
    getTicketFields, saveTicketFields, getTicketHistory,
} = require('../database/db');

module.exports = function ({ requireAuth, discordClient }) {
    const router = express.Router();

    // GET config + fields
    router.get('/:guildId/ticket-config', requireAuth, (req, res) => {
        const config = getTicketConfig(req.params.guildId);
        const fields = getTicketFields(req.params.guildId);
        res.json({ config: config || null, fields });
    });

    // POST config → delete old message, save, send new setup message
    router.post('/:guildId/ticket-config', requireAuth, express.json(), async (req, res) => {
        const { setupChannelId, embedTitle, embedDescription, embedColor, categoryId, handlerRoleIds } = req.body;
        if (!setupChannelId) return res.status(400).json({ error: 'setupChannelId fehlt.' });

        const guildId = req.params.guildId;
        const guild = discordClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Bot nicht auf dem Server.' });

        // Delete old setup message if exists
        const existing = getTicketConfig(guildId);
        if (existing?.messageId) {
            try {
                const oldCh = guild.channels.cache.get(existing.setupChannelId);
                if (oldCh) {
                    const oldMsg = await oldCh.messages.fetch(existing.messageId).catch(() => null);
                    if (oldMsg) await oldMsg.delete().catch(() => {});
                }
            } catch {}
        }

        saveTicketConfig(guildId, {
            setupChannelId, embedTitle, embedDescription, embedColor,
            categoryId: categoryId || null, handlerRoleIds: handlerRoleIds || [], messageId: null,
        });

        // Send new setup message
        const channel = guild.channels.cache.get(setupChannelId);
        if (!channel) return res.status(404).json({ error: 'Kanal nicht gefunden.' });

        try {
            const embed = new EmbedBuilder()
                .setTitle(embedTitle || 'Support Ticket')
                .setDescription(embedDescription || 'Klicke auf den Button um ein Ticket zu erstellen.')
                .setColor(embedColor || '#5865F2');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_create')
                    .setLabel('🎫 Ticket erstellen')
                    .setStyle(ButtonStyle.Primary)
            );

            const msg = await channel.send({ embeds: [embed], components: [row] });
            updateTicketConfigMessageId(guildId, msg.id);
            res.json({ success: true, messageId: msg.id });
        } catch (e) {
            res.status(500).json({ error: 'Nachricht konnte nicht gesendet werden: ' + e.message });
        }
    });

    // POST fields
    router.post('/:guildId/ticket-fields', requireAuth, express.json(), (req, res) => {
        const { fields } = req.body;
        if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields muss ein Array sein.' });
        if (fields.length > 5) return res.status(400).json({ error: 'Maximal 5 Felder erlaubt (Discord-Limit).' });
        saveTicketFields(req.params.guildId, fields);
        res.json({ success: true });
    });

    // GET history
    router.get('/:guildId/ticket-history', requireAuth, (req, res) => {
        const days = parseInt(req.query.days) || 7;
        res.json(getTicketHistory(req.params.guildId, days));
    });

    // DELETE config (removes setup message + DB entry)
    router.delete('/:guildId/ticket-config', requireAuth, async (req, res) => {
        const guildId = req.params.guildId;
        const existing = getTicketConfig(guildId);
        if (existing?.messageId) {
            try {
                const guild = discordClient.guilds.cache.get(guildId);
                const ch = guild?.channels.cache.get(existing.setupChannelId);
                if (ch) {
                    const msg = await ch.messages.fetch(existing.messageId).catch(() => null);
                    if (msg) await msg.delete().catch(() => {});
                }
            } catch {}
        }
        deleteTicketConfig(guildId);
        res.json({ success: true });
    });

    return router;
};
