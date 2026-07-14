// discord/api/syncChat.js — "Taverne" (one channel per guild, global group)
const express = require('express');
const { getSyncChannels, saveSyncChannel, deleteSyncChannel } = require('../database/db');

module.exports = function ({ requireAuth, discordClient }) {
    const router = express.Router();

    router.get('/:guildId/sync-chat', requireAuth, (req, res) => {
        res.json(getSyncChannels(req.params.guildId));
    });

    router.post('/:guildId/sync-chat', requireAuth, express.json(), async (req, res) => {
        const { channelId } = req.body;
        if (!channelId) return res.status(400).json({ error: 'Fehlende Daten.' });

        const guild = discordClient.guilds.cache.get(req.params.guildId);
        if (!guild) return res.status(404).json({ error: 'Server nicht gefunden.' });

        // Remove any existing taverne for this guild first
        const existing = getSyncChannels(req.params.guildId);
        for (const cfg of existing) {
            try {
                const ch = guild.channels.cache.get(cfg.channelId);
                if (ch) {
                    const webhooks = await ch.fetchWebhooks();
                    const wh = webhooks.get(cfg.webhookId);
                    if (wh) await wh.delete('Taverne geändert');
                }
            } catch (e) {}
            deleteSyncChannel(cfg.id, req.params.guildId);
        }

        let webhookId = null;
        let webhookToken = null;
        try {
            const channel = guild.channels.cache.get(channelId);
            if (!channel) return res.status(400).json({ error: 'Kanal nicht gefunden.' });
            const webhook = await channel.createWebhook({ name: 'Taverne', reason: 'Global Taverne Webhook' });
            webhookId = webhook.id;
            webhookToken = webhook.token;
        } catch (e) {
            console.error('[Taverne] Webhook-Erstellung fehlgeschlagen:', e.message);
            return res.status(500).json({ error: 'Konnte Webhook nicht erstellen. Hat der Bot die Berechtigung?' });
        }

        const id = saveSyncChannel(req.params.guildId, channelId, webhookId, webhookToken);
        res.json({ success: true, id });
    });

    router.delete('/:guildId/sync-chat/:id', requireAuth, async (req, res) => {
        const configs = getSyncChannels(req.params.guildId);
        const config = configs.find(c => c.id == req.params.id);

        if (config?.webhookId) {
            try {
                const guild = discordClient.guilds.cache.get(req.params.guildId);
                const channel = guild?.channels.cache.get(config.channelId);
                if (channel) {
                    const webhooks = await channel.fetchWebhooks();
                    const wh = webhooks.get(config.webhookId);
                    if (wh) await wh.delete('Taverne deaktiviert');
                }
            } catch (e) {}
        }

        deleteSyncChannel(req.params.id, req.params.guildId);
        res.json({ success: true });
    });

    return router;
};
