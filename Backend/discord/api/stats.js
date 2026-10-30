// discord/api/stats.js
const express = require('express');
const {
    getMessageStats, getVoiceStats, getUserMessageStats, getChatterCount, getMessageTotal,
    getSettings, getReactionRoles, getApprovalConfigs, getVoiceConfig, getLiveRole,
    getImageOnlyChannels, getSyncChannels, getTwitchNotifications, getTicketConfig,
} = require('../database/db');
const { renderMemberImage } = require('../bot/memberImage');

/** IDs, die Discord nicht mehr kennt (gelöschte Kanäle) — nicht bei jedem Abruf erneut fragen. */
const goneChannels = new Set();
const DELETED_KEY = 'deleted';

/**
 * Macht aus Kanal-IDs Namen und fasst zusammen, was zusammengehört.
 *
 * Im Cache des Bots liegen nur gewöhnliche Kanäle. Threads und Forenbeiträge
 * fehlen dort, gelöschte Kanäle sowieso — für beide zeigte die Statistik bisher
 * die nackte ID. Jetzt wird nachgefragt: Threads zählen zu ihrem Kanal, und was
 * es nicht mehr gibt, landet gemeinsam unter "Gelöschte Kanäle".
 */
async function resolveChannels(guild, rows) {
    const merged = new Map(); // Schlüssel -> { channelId, channelName, total }
    for (const row of rows) {
        let channel = guild?.channels.cache.get(row.channelId) || null;
        if (!channel && guild && !goneChannels.has(row.channelId)) {
            channel = await guild.channels.fetch(row.channelId).catch(() => null);
            if (!channel) goneChannels.add(row.channelId);
        }
        if (channel && typeof channel.isThread === 'function' && channel.isThread() && channel.parentId) {
            channel = guild.channels.cache.get(channel.parentId) || channel.parent || channel;
        }
        const key = channel ? channel.id : DELETED_KEY;
        const entry = merged.get(key) || {
            channelId: key,
            channelName: channel ? channel.name : 'Gelöschte Kanäle',
            deleted: !channel,
            total: 0,
        };
        entry.total += Number(row.total) || 0;
        merged.set(key, entry);
    }
    return [...merged.values()].sort((a, b) => b.total - a.total);
}

async function ensureMembers(guild, userIds) {
    if (!guild) return;
    const uncached = [...new Set(userIds)].filter(id => !guild.members.cache.has(id));
    if (!uncached.length) return;
    try {
        await guild.members.fetch({ user: uncached });
    } catch (e) {
        console.warn('[Stats] Member-Fetch teilweise fehlgeschlagen:', e.message);
    }
}

module.exports = function ({ requireAuth, discordClient }) {
    const router = express.Router();

    router.get('/:guildId/stats', requireAuth, async (req, res) => {
        const guildId = req.params.guildId;
        const days = Number(req.query.days) || 30;

        const rawMessages = getMessageStats(guildId, days);
        const rawVoice = getVoiceStats(guildId, days);
        const rawChat = getUserMessageStats(guildId, days, 25);

        const guild = discordClient.guilds.cache.get(guildId);
        // Wer den Server verlassen hat, lässt sich nicht mehr nachladen — dann
        // steht dort "Ehemaliges Mitglied" statt einer ID.
        await ensureMembers(guild, [...rawVoice, ...rawChat].map(r => r.userId));
        const nameOf = (id) => guild?.members.cache.get(id)?.displayName || 'Ehemaliges Mitglied';

        res.json({
            messageStats: await resolveChannels(guild, rawMessages),
            voiceStats: rawVoice.map(row => ({ userId: row.userId, totalSeconds: row.totalSeconds, displayName: nameOf(row.userId) })),
            userMessageStats: rawChat.map(row => ({ userId: row.userId, total: row.total, displayName: nameOf(row.userId) })),
            totals: { messages: getMessageTotal(guildId, days), chatters: getChatterCount(guildId, days) },
        });
    });

    /**
     * Welche Bereiche eingerichtet sind — für die Statuspunkte in der
     * Bereichsliste des Dashboards. Nur Ja/Nein, keine Inhalte.
     */
    router.get('/:guildId/overview', requireAuth, (req, res) => {
        const guildId = req.params.guildId;
        const safe = (fn) => { try { return !!fn(); } catch { return false; } };
        const settings = getSettings(guildId);
        res.json({
            welcome: !!(settings.welcomeChannel && settings.welcomeMessage),
            leave: !!(settings.leaveChannel && settings.leaveMessage),
            reactionroles: safe(() => getReactionRoles(guildId).length),
            approval: safe(() => getApprovalConfigs(guildId).length),
            liverole: safe(() => getLiveRole(guildId)),
            voice: safe(() => getVoiceConfig(guildId).triggerChannelId),
            imageonly: safe(() => getImageOnlyChannels(guildId).some(c => c.enabled)),
            syncchat: safe(() => getSyncChannels(guildId).length),
            twitchnotif: safe(() => getTwitchNotifications(guildId).length),
            tickets: safe(() => getTicketConfig(guildId)),
        });
    });

    /**
     * Vorschau des gezeichneten Ein-/Austrittsbilds fürs Dashboard — dieselbe
     * Zeichnung wie im Bot, mit einem Beispielmitglied.
     */
    router.get('/:guildId/member-image', requireAuth, async (req, res) => {
        const guild = discordClient.guilds.cache.get(req.params.guildId);
        try {
            const png = await renderMemberImage({
                name: 'Mika',
                serverName: guild?.name || 'Dein Server',
                memberCount: guild?.memberCount || 128,
                kind: req.query.kind === 'leave' ? 'leave' : 'welcome',
                layout: req.query.layout,
            });
            res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300' }).send(png);
        } catch (e) {
            console.warn('[Discord] Vorschaubild:', e.message);
            res.status(500).json({ error: 'Bild konnte nicht gezeichnet werden.' });
        }
    });

    return router;
};
