// discord/api/settings.js
const express = require("express");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getSettings, saveSettings, getReactionRoles, saveReactionRole, updateReactionRole, deleteReactionRole } = require("../database/db");

module.exports = function({ requireAuth, discordClient }) {
    const router = express.Router();

    router.get("/:guildId", requireAuth, (req, res) => res.json(getSettings(req.params.guildId)));

    router.post("/:guildId", requireAuth, express.json(), async (req, res) => {
        const { botNickname } = req.body;
        try {
            const guild = discordClient.guilds.cache.get(req.params.guildId);
            if (guild && botNickname !== undefined) {
                await guild.members.me.setNickname(botNickname || null);
            }
        } catch (e) { console.error("Konnte Nickname nicht ändern", e); }

        saveSettings(req.params.guildId, req.body);
        res.json({ success: true });
    });

    router.get("/:guildId/reaction-roles", requireAuth, (req, res) => {
        res.json(getReactionRoles(req.params.guildId));
    });

    // NEU: Unterstützt Text und Farbe (Style) bei den Buttons
    const buildComponents = (roleMapping) => {
        const components = [];
        let currentRow = new ActionRowBuilder();
        let btnCount = 0;

        // Fallback für alte Setups (als das noch ein Object war)
        const mappingList = Array.isArray(roleMapping) 
            ? roleMapping 
            : Object.entries(roleMapping).map(([emoji, roleId]) => ({ emoji, roleId, label: "", style: 2 }));

        for (const mapping of mappingList) {
            if (btnCount === 5) { 
                components.push(currentRow);
                currentRow = new ActionRowBuilder();
                btnCount = 0;
            }
            
            const button = new ButtonBuilder()
                .setCustomId(`rr_${mapping.roleId}`)
                .setStyle(Number(mapping.style) || ButtonStyle.Secondary);
            
            if (mapping.label) button.setLabel(mapping.label);

            if (mapping.emoji) {
                const isCustom = /^\d+$/.test(mapping.emoji);
                if (isCustom) button.setEmoji({ id: mapping.emoji });
                else button.setEmoji(mapping.emoji);
            }

            currentRow.addComponents(button);
            btnCount++;
        }
        if (btnCount > 0) components.push(currentRow);
        return components;
    };

    router.post("/:guildId/reaction-roles", requireAuth, express.json(), async (req, res) => {
        const { channelId, messageText, mode, roleMapping, title, color, embedTitle, embedFooter } = req.body;
        if (!channelId || !roleMapping) return res.status(400).json({ error: "Fehlende Daten." });

        try {
            const guild = discordClient.guilds.cache.get(req.params.guildId);
            const channel = guild.channels.cache.get(channelId);
            if (!channel) return res.status(400).json({ error: "Kanal existiert nicht." });

            const embed = new EmbedBuilder().setColor(color || '#06b6d4');
            if (messageText) embed.setDescription(messageText);
            if (embedTitle) embed.setTitle(embedTitle);
            if (embedFooter) embed.setFooter({ text: embedFooter });

            const components = buildComponents(roleMapping);
            const sentMsg = await channel.send({ embeds: [embed], components });

            const newId = saveReactionRole(req.params.guildId, channelId, sentMsg.id, mode, roleMapping, title, color, messageText, embedTitle, embedFooter);
            res.json({ success: true, id: newId });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Bot hat keine Berechtigung." });
        }
    });

    router.put("/:guildId/reaction-roles/:roleId", requireAuth, express.json(), async (req, res) => {
        const { messageText, mode, roleMapping, title, color, embedTitle, embedFooter } = req.body;
        const roleId = req.params.roleId;

        try {
            const existingRoles = getReactionRoles(req.params.guildId);
            const config = existingRoles.find(r => r.id == roleId);
            if (!config) return res.status(404).json({ error: "Nicht gefunden" });

            const guild = discordClient.guilds.cache.get(req.params.guildId);
            const channel = guild.channels.cache.get(config.channelId);
            const msg = channel ? await channel.messages.fetch(config.messageId).catch(()=>null) : null;

            if (msg) {
                const embed = new EmbedBuilder().setColor(color || '#06b6d4');
                if (messageText) embed.setDescription(messageText);
                if (embedTitle) embed.setTitle(embedTitle);
                if (embedFooter) embed.setFooter({ text: embedFooter });

                const components = buildComponents(roleMapping);
                await msg.edit({ embeds: [embed], components });
            }

            updateReactionRole(roleId, req.params.guildId, mode, roleMapping, title, color, messageText, embedTitle, embedFooter);
            res.json({ success: true });

        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Fehler beim Bearbeiten." });
        }
    });

    router.delete("/:guildId/reaction-roles/:roleId", requireAuth, async (req, res) => {
        const config = getReactionRoles(req.params.guildId).find(r => r.id == req.params.roleId);
        if (config) {
            try {
                const channel = discordClient.guilds.cache.get(req.params.guildId)?.channels.cache.get(config.channelId);
                if (channel) {
                    const msg = await channel.messages.fetch(config.messageId);
                    if (msg) await msg.delete();
                }
            } catch (e) {} 
        }
        deleteReactionRole(req.params.roleId, req.params.guildId);
        res.json({ success: true });
    });

    return router;
};