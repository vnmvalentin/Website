// discord/api/approval.js
const express = require('express');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
    getApprovalConfigs, getApprovalConfig,
    saveApprovalConfig, updateApprovalConfigMessageId, updateApprovalConfig, deleteApprovalConfig,
} = require('../database/db');

module.exports = function ({ requireAuth, discordClient }) {
    const router = express.Router();

    router.get('/:guildId/approvals', requireAuth, (req, res) => {
        res.json(getApprovalConfigs(req.params.guildId));
    });

    router.post('/:guildId/approvals', requireAuth, express.json(), async (req, res) => {
        const { channelId, title, embedTitle, embedText, embedColor, approverIds, accessType, accessId, cooldownHours } = req.body;
        if (!channelId) return res.status(400).json({ error: 'Kein Kanal angegeben.' });

        try {
            const guild = discordClient.guilds.cache.get(req.params.guildId);
            const channel = guild?.channels.cache.get(channelId);
            if (!channel) return res.status(400).json({ error: 'Kanal nicht gefunden.' });

            const newId = saveApprovalConfig(req.params.guildId, req.body);

            const embed = new EmbedBuilder().setColor(embedColor || '#06b6d4');
            if (embedTitle) embed.setTitle(embedTitle);
            if (embedText) embed.setDescription(embedText);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`apply_${newId}`).setLabel('📩 Anfragen').setStyle(ButtonStyle.Primary)
            );

            const msg = await channel.send({ embeds: [embed], components: [row] });
            updateApprovalConfigMessageId(newId, msg.id);
            res.json({ success: true, id: newId });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Fehler beim Erstellen.' });
        }
    });

    router.put('/:guildId/approvals/:id', requireAuth, express.json(), async (req, res) => {
        const { embedTitle, embedText, embedColor } = req.body;
        const config = getApprovalConfig(req.params.id, req.params.guildId);
        if (!config) return res.status(404).json({ error: 'Nicht gefunden.' });

        try {
            const guild = discordClient.guilds.cache.get(req.params.guildId);
            const channel = guild?.channels.cache.get(config.channelId);
            if (channel && config.messageId) {
                const msg = await channel.messages.fetch(config.messageId).catch(() => null);
                if (msg) {
                    const embed = new EmbedBuilder().setColor(embedColor || '#06b6d4');
                    if (embedTitle) embed.setTitle(embedTitle);
                    if (embedText) embed.setDescription(embedText);
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`apply_${config.id}`).setLabel('📩 Anfragen').setStyle(ButtonStyle.Primary)
                    );
                    await msg.edit({ embeds: [embed], components: [row] });
                }
            }
            updateApprovalConfig(req.params.id, req.params.guildId, req.body);
            res.json({ success: true });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Fehler beim Aktualisieren.' });
        }
    });

    router.delete('/:guildId/approvals/:id', requireAuth, async (req, res) => {
        const config = getApprovalConfig(req.params.id, req.params.guildId);
        if (config) {
            try {
                const guild = discordClient.guilds.cache.get(req.params.guildId);
                const channel = guild?.channels.cache.get(config.channelId);
                if (channel && config.messageId) {
                    const msg = await channel.messages.fetch(config.messageId).catch(() => null);
                    if (msg) await msg.delete().catch(() => {});
                }
            } catch (e) {}
        }
        deleteApprovalConfig(req.params.id, req.params.guildId);
        res.json({ success: true });
    });

    return router;
};
