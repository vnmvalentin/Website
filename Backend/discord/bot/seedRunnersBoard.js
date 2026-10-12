// discord/bot/seedRunnersBoard.js
// Seed Runners: Tagesrangliste als EINE Nachricht pro Server, die der Bot laufend bearbeitet.
// Eingerichtet per /tagesrennen setzen; um Mitternacht (Berliner Zeit) wechselt dieselbe Nachricht auf den neuen Tag.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits, escapeMarkdown } = require('discord.js');
const {
    getSeedRunnersBoard, getAllSeedRunnersBoards, saveSeedRunnersBoard, deleteSeedRunnersBoard,
} = require('../database/db');

const REFRESH_MS = 60 * 1000;
const TOP_TODAY = 10;
const TOP_YESTERDAY = 3;
// Zeiten sind Sim-Ticks — muss zu Frontend SeedRunners/sim/config.js (TICK_HZ) passen
const TICK_HZ = 120;
// Discord: Kanal oder Nachricht existiert nicht mehr
const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_MESSAGE = 10008;

// Zuletzt gesendeter Inhalt je Server: Bearbeitet wird nur, wenn sich die Rangliste geändert hat
const lastSent = new Map();

// (gleiche Darstellung wie Frontend SeedRunners/room/format.js: m:ss.hh)
function formatTicks(ticks) {
    const totalHundredths = Math.floor((ticks / TICK_HZ) * 100);
    const m = Math.floor(totalHundredths / 6000);
    const s = Math.floor((totalHundredths % 6000) / 100);
    const h = totalHundredths % 100;
    return `${m}:${String(s).padStart(2, '0')}.${String(h).padStart(2, '0')}`;
}

const germanDate = (dateKey) => dateKey.split('-').reverse().join('.');
const dailyUrl = () => `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '')}/seed-runners/daily`;

function entryLine(e) {
    const deaths = e.deaths === 1 ? '1 Tod' : `${e.deaths} Tode`;
    return `\`${String(e.rank).padStart(2, ' ')}.\` **${escapeMarkdown(e.name)}** — ${formatTicks(e.ticks)} · ${deaths}`;
}

/**
 * @param {{ dateKey: string, total: number, entries: object[] }} today
 * @param {{ dateKey: string, entries: object[] }} yesterday
 */
function buildBoardMessage(today, yesterday) {
    const embed = new EmbedBuilder()
        .setColor(0x06b6d4)
        .setTitle(`Seed Runners: Tagesrennen ${germanDate(today.dateKey)}`)
        .setDescription(today.entries.length > 0
            ? today.entries.map(entryLine).join('\n')
            : 'Heute ist noch niemand ins Ziel gekommen.');

    if (yesterday.entries.length > 0) {
        embed.addFields({ name: `Gestern (${germanDate(yesterday.dateKey)})`, value: yesterday.entries.map(entryLine).join('\n') });
    }
    const runners = today.total === 1 ? '1 Läufer' : `${today.total} Läufer`;
    embed.setFooter({ text: `${runners} heute · aktualisiert sich automatisch` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Tagesrennen spielen').setURL(dailyUrl()),
    );
    return { embeds: [embed], components: [row] };
}

// Die Rangliste kommt direkt aus dem Seed-Runners-Dienst desselben Prozesses (kein HTTP-Umweg)
function loadBoards() {
    const { daily, todayKey } = require('../../seedRunners/runtime').getRuntime();
    const { previousDay } = require('../../seedRunners/daily');
    const today = todayKey();
    return { today: daily.board(today, TOP_TODAY), yesterday: daily.board(previousDay(today), TOP_YESTERDAY) };
}

/** Bringt die Nachricht eines Servers auf den aktuellen Stand; legt sie neu an, wenn sie gelöscht wurde. */
async function refreshBoard(client, config, boards, { force = false } = {}) {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(config.channelId)
        || await guild.channels.fetch(config.channelId).catch(e => (e.code === UNKNOWN_CHANNEL ? null : undefined));
    if (channel === null) {
        // Kanal gelöscht → Einrichtung verwerfen
        deleteSeedRunnersBoard(config.guildId);
        lastSent.delete(config.guildId);
        return;
    }
    if (!channel) return;

    const payload = buildBoardMessage(boards.today, boards.yesterday);
    const signature = JSON.stringify(payload.embeds[0].toJSON());
    if (!force && config.messageId && lastSent.get(config.guildId) === signature) return;

    if (config.messageId) {
        try {
            await channel.messages.edit(config.messageId, payload);
            lastSent.set(config.guildId, signature);
            return;
        } catch (e) {
            if (e.code !== UNKNOWN_MESSAGE) throw e;
        }
    }
    const message = await channel.send(payload);
    saveSeedRunnersBoard(config.guildId, channel.id, message.id);
    lastSent.set(config.guildId, signature);
}

async function refreshAllBoards(client) {
    const configs = getAllSeedRunnersBoards();
    if (configs.length === 0) return;
    let boards;
    try {
        boards = loadBoards();
    } catch (e) {
        console.error('[SeedRunners-Rangliste] Rangliste nicht lesbar:', e.message);
        return;
    }
    for (const config of configs) {
        await refreshBoard(client, config, boards).catch(e =>
            console.error(`[SeedRunners-Rangliste] Aktualisieren für Server ${config.guildId} fehlgeschlagen:`, e.message));
    }
}

function startSeedRunnersBoard(client) {
    refreshAllBoards(client);
    const timer = setInterval(() => refreshAllBoards(client), REFRESH_MS);
    timer.unref?.();
}

// ── /tagesrennen setzen | entfernen ───────────────────────────────────────────
async function handleTagesrennen(interaction) {
    if (!interaction.guild) {
        return interaction.reply({ content: '❌ Dieser Command funktioniert nur auf einem Server.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ Dafür brauchst du das Recht "Server verwalten".', flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guildId;
    const existing = getSeedRunnersBoard(guildId);
    const sub = interaction.options.getSubcommand();

    if (sub === 'entfernen') {
        if (!existing) return interaction.reply({ content: 'Auf diesem Server ist keine Tagesrangliste eingerichtet.', flags: MessageFlags.Ephemeral });
        const oldChannel = interaction.guild.channels.cache.get(existing.channelId);
        if (oldChannel && existing.messageId) await oldChannel.messages.delete(existing.messageId).catch(() => {});
        deleteSeedRunnersBoard(guildId);
        lastSent.delete(guildId);
        return interaction.reply({ content: 'Die Tagesrangliste wurde entfernt.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const boards = loadBoards();
        // Es gibt nur eine Rangliste pro Server: Die alte Nachricht verschwindet beim Umzug
        if (existing?.messageId) {
            await interaction.guild.channels.cache.get(existing.channelId)?.messages.delete(existing.messageId).catch(() => {});
        }
        saveSeedRunnersBoard(guildId, interaction.channelId, '');
        await refreshBoard(interaction.client, { guildId, channelId: interaction.channelId, messageId: '' }, boards, { force: true });
        return interaction.editReply({ content: 'Die Tagesrangliste steht jetzt in diesem Kanal und aktualisiert sich etwa einmal pro Minute.' });
    } catch (e) {
        console.error('[SeedRunners-Rangliste] Einrichten fehlgeschlagen:', e);
        deleteSeedRunnersBoard(guildId);
        return interaction.editReply({ content: '❌ Die Rangliste konnte nicht gepostet werden. Darf der Bot in diesem Kanal schreiben?' });
    }
}

module.exports = { startSeedRunnersBoard, handleTagesrennen, buildBoardMessage, formatTicks };
