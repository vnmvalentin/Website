// discord/api/loyalty.js
// Dashboard-Reiter "Punkte": Einstellungen, Rangliste, Punkte anpassen, alles zurücksetzen.
const express = require('express');
const store = require('../loyalty/store');
const { requireGuildAdmin } = require('./guildAccess');

module.exports = function ({ requireAuth, discordClient }) {
    const router = express.Router();
    const guard = [requireAuth, requireGuildAdmin(discordClient)];

    router.get('/:guildId/loyalty', ...guard, (req, res) => {
        res.json({ config: store.getConfig(req.params.guildId), summary: store.summary(req.params.guildId) });
    });

    router.post('/:guildId/loyalty', ...guard, express.json(), (req, res) => {
        const guild = discordClient.guilds.cache.get(req.params.guildId);
        const raw = req.body || {};
        // Spiele-Kanal muss auf diesem Server existieren
        if (raw.gameChannel && !guild?.channels.cache.has(String(raw.gameChannel))) raw.gameChannel = '';
        res.json({ config: store.saveConfig(req.params.guildId, raw) });
    });

    router.get('/:guildId/loyalty/leaderboard', ...guard, async (req, res) => {
        const guildId = req.params.guildId;
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const rows = store.leaderboard(guildId, limit, offset);
        const guild = discordClient.guilds.cache.get(guildId);
        if (guild && rows.length) await guild.members.fetch({ user: rows.map(r => r.user_id) }).catch(() => {});
        res.json({
            summary: store.summary(guildId),
            rows: rows.map((r, i) => {
                const m = guild?.members.cache.get(r.user_id);
                return {
                    rank: offset + i + 1,
                    userId: r.user_id,
                    name: m?.displayName || 'Ehemaliges Mitglied',
                    avatar: m ? m.displayAvatarURL({ size: 64 }) : null,
                    points: r.points, wins: r.wins, losses: r.losses,
                    biggestWin: r.biggest_win, voiceMinutes: r.voice_minutes, messages: r.messages,
                    dailyStreak: r.daily_streak,
                };
            }),
        });
    });

    router.post('/:guildId/loyalty/adjust', ...guard, express.json(), (req, res) => {
        const { userId, mode, amount } = req.body || {};
        const n = Math.round(Number(amount));
        if (!/^\d{5,25}$/.test(String(userId || ''))) return res.status(400).json({ error: 'Ungültiges Mitglied' });
        if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return res.status(400).json({ error: 'Ungültiger Betrag' });
        let points;
        if (mode === 'add') points = store.addPoints(req.params.guildId, userId, n);
        else if (mode === 'remove') points = store.addPoints(req.params.guildId, userId, -n);
        else if (mode === 'set') points = store.setPoints(req.params.guildId, userId, n);
        else return res.status(400).json({ error: 'Ungültige Aktion' });
        res.json({ points });
    });

    router.post('/:guildId/loyalty/reset', ...guard, express.json(), (req, res) => {
        if (req.body?.confirm !== 'ZURÜCKSETZEN') return res.status(400).json({ error: 'Bestätigung fehlt' });
        res.json({ removed: store.resetGuild(req.params.guildId) });
    });

    return router;
};
