// discord/bot/commands/serverstats.js
// Zeigt die Statistik, die der Bot ohnehin sammelt (Voice-Zeit je Nutzer, Nachrichten je Kanal), im Discord an.
// Laufende Voice-Sitzungen zählen mit: In der DB landen sie erst beim Verlassen des Channels.
// Texte und Zahlen in der Sprache des Bots auf dem Server (botTexts.js, stats).
const { EmbedBuilder, MessageFlags, escapeMarkdown } = require('discord.js');
const { getMessageStats, getMessageTotal, getVoiceTotalsByUser, getUserMessageStats } = require('../../database/db');
const { getLiveVoiceSeconds } = require('../events/voiceStateUpdate');
const { botText, botTextFor } = require('../botText');

const TOP_USERS = 10;
const TOP_CHANNELS = 5;

/** Dauer als „1 Std 05 Min“ bzw. „1 h 05 min“. t: Texte des Servers (ohne Angabe Deutsch). */
function formatDuration(totalSeconds, t = botTextFor('de')) {
    const minutes = Math.floor(totalSeconds / 60);
    return t.stats.duration(Math.floor(minutes / 60), minutes % 60);
}

/** Voice-Sekunden je Nutzer (DB + laufende Sitzungen), absteigend sortiert. */
function voiceRanking(guildId, days) {
    const totals = new Map(getVoiceTotalsByUser(guildId, days).map(r => [r.userId, r.totalSeconds]));
    for (const [userId, seconds] of getLiveVoiceSeconds(guildId)) {
        totals.set(userId, (totals.get(userId) || 0) + seconds);
    }
    return [...totals.entries()]
        .map(([userId, totalSeconds]) => ({ userId, totalSeconds }))
        .filter(r => r.totalSeconds > 0)
        .sort((a, b) => b.totalSeconds - a.totalSeconds);
}

async function displayNames(guild, userIds, unknown) {
    const uncached = userIds.filter(id => !guild.members.cache.has(id));
    if (uncached.length > 0) {
        await guild.members.fetch({ user: uncached }).catch(e => console.warn('[Stats] Member-Fetch teilweise fehlgeschlagen:', e.message));
    }
    return new Map(userIds.map(id => [id, guild.members.cache.get(id)?.displayName || unknown]));
}

async function handleServerStats(interaction) {
    const all = botText(interaction);
    const t = all.stats;
    if (!interaction.guild) {
        return interaction.reply({ content: t.onlyServer, flags: MessageFlags.Ephemeral });
    }

    const guild = interaction.guild;
    const days = interaction.options.getInteger('zeitraum') || 30;
    const user = interaction.options.getUser('user');
    const ranking = voiceRanking(guild.id, days);
    const live = getLiveVoiceSeconds(guild.id);
    const dur = (s) => formatDuration(s, all);
    const num = (n) => n.toLocaleString(all.locale);

    // ── Einzelner Nutzer ──────────────────────────────────────────────────────
    if (user) {
        const index = ranking.findIndex(r => r.userId === user.id);
        const names = await displayNames(guild, [user.id], all.unknown);
        const embed = new EmbedBuilder()
            .setColor(0x06b6d4)
            .setTitle(t.userTitle(names.get(user.id)))
            .setFooter({ text: t.lastDays(days) });

        if (index === -1) {
            embed.setDescription(t.noVoice);
        } else {
            embed.addFields(
                { name: t.voiceTime, value: dur(ranking[index].totalSeconds), inline: true },
                { name: t.place, value: t.placeValue(index + 1, ranking.length), inline: true },
            );
            if (live.has(user.id)) embed.addFields({ name: t.inVoiceNow, value: t.since(dur(live.get(user.id))), inline: true });
        }
        return interaction.reply({ embeds: [embed] });
    }

    // ── Rangliste des Servers ─────────────────────────────────────────────────
    const top = ranking.slice(0, TOP_USERS);
    const chatTop = getUserMessageStats(guild.id, days, TOP_USERS);
    const names = await displayNames(guild, [...new Set([...top, ...chatTop].map(r => r.userId))], all.unknown);
    const chatLines = chatTop.map((r, i) =>
        `\`${String(i + 1).padStart(2, ' ')}.\` **${escapeMarkdown(names.get(r.userId))}** — ${num(r.total)}`);
    const voiceLines = top.map((r, i) => {
        const name = escapeMarkdown(names.get(r.userId));
        return `\`${String(i + 1).padStart(2, ' ')}.\` **${name}** — ${dur(r.totalSeconds)}${live.has(r.userId) ? t.inVoiceTag : ''}`;
    });

    const channelLines = getMessageStats(guild.id, days).slice(0, TOP_CHANNELS)
        .map((r, i) => `\`${String(i + 1).padStart(2, ' ')}.\` <#${r.channelId}> — ${num(r.total)}`);

    const totalVoice = ranking.reduce((sum, r) => sum + r.totalSeconds, 0);
    const totalMessages = getMessageTotal(guild.id, days);

    const embed = new EmbedBuilder()
        .setColor(0x06b6d4)
        .setTitle(t.serverTitle(guild.name))
        .addFields(
            { name: t.voiceTotal, value: dur(totalVoice), inline: true },
            { name: t.usersInVoice, value: `${ranking.length}`, inline: true },
            { name: t.messages, value: num(totalMessages), inline: true },
            { name: t.topVoice(TOP_USERS), value: voiceLines.join('\n') || t.noVoiceYet },
            { name: t.topChat(TOP_USERS), value: chatLines.join('\n') || t.noChatYet },
            { name: t.topChannels(TOP_CHANNELS), value: channelLines.join('\n') || t.noMessagesYet },
        )
        .setFooter({ text: t.lastDays(days) });

    return interaction.reply({ embeds: [embed] });
}

module.exports = { handleServerStats, formatDuration };
