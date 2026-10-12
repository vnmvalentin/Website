// discord/bot/commands/serverstats.js
// Zeigt die Statistik, die der Bot ohnehin sammelt (Voice-Zeit je Nutzer, Nachrichten je Kanal), im Discord an.
// Laufende Voice-Sitzungen zählen mit: In der DB landen sie erst beim Verlassen des Channels.
const { EmbedBuilder, MessageFlags, escapeMarkdown } = require('discord.js');
const { getMessageStats, getMessageTotal, getVoiceTotalsByUser } = require('../../database/db');
const { getLiveVoiceSeconds } = require('../events/voiceStateUpdate');

const TOP_USERS = 10;
const TOP_CHANNELS = 5;

function formatDuration(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} Min`;
    return `${h} Std ${String(m).padStart(2, '0')} Min`;
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

async function displayNames(guild, userIds) {
    const uncached = userIds.filter(id => !guild.members.cache.has(id));
    if (uncached.length > 0) {
        await guild.members.fetch({ user: uncached }).catch(e => console.warn('[Stats] Member-Fetch teilweise fehlgeschlagen:', e.message));
    }
    return new Map(userIds.map(id => [id, guild.members.cache.get(id)?.displayName || 'Unbekannt']));
}

async function handleServerStats(interaction) {
    if (!interaction.guild) {
        return interaction.reply({ content: '❌ Dieser Command funktioniert nur auf einem Server.', flags: MessageFlags.Ephemeral });
    }

    const guild = interaction.guild;
    const days = interaction.options.getInteger('zeitraum') || 30;
    const user = interaction.options.getUser('user');
    const ranking = voiceRanking(guild.id, days);
    const live = getLiveVoiceSeconds(guild.id);

    // ── Einzelner Nutzer ──────────────────────────────────────────────────────
    if (user) {
        const index = ranking.findIndex(r => r.userId === user.id);
        const names = await displayNames(guild, [user.id]);
        const embed = new EmbedBuilder()
            .setColor(0x06b6d4)
            .setTitle(`Voice-Statistik von ${names.get(user.id)}`)
            .setFooter({ text: `Letzte ${days} Tage` });

        if (index === -1) {
            embed.setDescription('In diesem Zeitraum keine Voice-Zeit.');
        } else {
            embed.addFields(
                { name: 'Voice-Zeit', value: formatDuration(ranking[index].totalSeconds), inline: true },
                { name: 'Platz', value: `${index + 1} von ${ranking.length}`, inline: true },
            );
            if (live.has(user.id)) embed.addFields({ name: 'Gerade im Voice', value: `seit ${formatDuration(live.get(user.id))}`, inline: true });
        }
        return interaction.reply({ embeds: [embed] });
    }

    // ── Rangliste des Servers ─────────────────────────────────────────────────
    const top = ranking.slice(0, TOP_USERS);
    const names = await displayNames(guild, top.map(r => r.userId));
    const voiceLines = top.map((r, i) => {
        const name = escapeMarkdown(names.get(r.userId));
        return `\`${String(i + 1).padStart(2, ' ')}.\` **${name}** — ${formatDuration(r.totalSeconds)}${live.has(r.userId) ? ' · gerade im Voice' : ''}`;
    });

    const channelLines = getMessageStats(guild.id, days).slice(0, TOP_CHANNELS)
        .map((r, i) => `\`${String(i + 1).padStart(2, ' ')}.\` <#${r.channelId}> — ${r.total.toLocaleString('de-DE')}`);

    const totalVoice = ranking.reduce((sum, r) => sum + r.totalSeconds, 0);
    const totalMessages = getMessageTotal(guild.id, days);

    const embed = new EmbedBuilder()
        .setColor(0x06b6d4)
        .setTitle(`Server-Statistik: ${guild.name}`)
        .addFields(
            { name: 'Voice-Zeit gesamt', value: formatDuration(totalVoice), inline: true },
            { name: 'Nutzer im Voice', value: `${ranking.length}`, inline: true },
            { name: 'Nachrichten', value: totalMessages.toLocaleString('de-DE'), inline: true },
            { name: `Top ${TOP_USERS} Voice-Zeit`, value: voiceLines.join('\n') || 'Noch keine Voice-Zeit erfasst.' },
            { name: `Top ${TOP_CHANNELS} Kanäle nach Nachrichten`, value: channelLines.join('\n') || 'Noch keine Nachrichten erfasst.' },
        )
        .setFooter({ text: `Letzte ${days} Tage` });

    return interaction.reply({ embeds: [embed] });
}

module.exports = { handleServerStats, formatDuration };
