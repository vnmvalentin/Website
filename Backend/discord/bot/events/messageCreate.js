// discord/bot/events/messageCreate.js
const { WebhookClient, REST, Routes, PermissionFlagsBits } = require('discord.js');
const {
    getSettings, getAllEnabledImageOnlyChannels,
    getAllEnabledSyncChannels,
    incrementMessageStat
} = require('../../database/db');
const { handlePP } = require('../commands/pp');
const { handleMiesmuschel } = require('../commands/magische_miesmuschel');
const { handleShip } = require('../commands/ship');
const { handleCoinflip } = require('../commands/coinflip');
const { handleAussehen } = require('../commands/aussehen');
const { handleIQ } = require('../commands/iq');
const { handleGroesse } = require('../commands/groesse');
const { handleGewicht } = require('../commands/gewicht');

// Cache für Sync-Webhook-IDs (verhindert Relay-Loops)
const syncWebhookIds = new Set();

// Initialisiert Webhook-ID-Cache aus DB beim Start
function refreshSyncWebhookCache() {
    syncWebhookIds.clear();
    try {
        const channels = getAllEnabledSyncChannels();
        for (const ch of channels) {
            if (ch.webhookId) syncWebhookIds.add(ch.webhookId);
        }
    } catch (e) {}
}
refreshSyncWebhookCache();
setInterval(refreshSyncWebhookCache, 5 * 60 * 1000);

// Bild-Anhang-Prüfung
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

function messageHasImage(message) {
    for (const att of message.attachments.values()) {
        if (att.contentType && IMAGE_TYPES.some(t => att.contentType.startsWith(t))) return true;
        if (att.name && IMAGE_EXTENSIONS.some(ext => att.name.toLowerCase().endsWith(ext))) return true;
    }
    // Embeds mit Bildern zählen auch
    for (const embed of message.embeds) {
        if (embed.image || embed.thumbnail) return true;
    }
    return false;
}

// Prefix-Command-Adapter: erzeugt ein Fake-Interaction-Objekt für Text-Commands
function makeTextInteraction(message, args) {
    return {
        user: message.author,
        member: message.member,
        guild: message.guild,
        guildId: message.guildId,
        channelId: message.channelId,
        options: {
            getString: (name) => args[0] || null,
            getUser: (name) => {
                const mention = args.find(a => a.startsWith('<@'));
                if (!mention) return null;
                const id = mention.replace(/[<@!>]/g, '');
                return message.guild?.members.cache.get(id)?.user || null;
            },
            _args: args,
        },
        reply: (content) => {
            const payload = typeof content === 'string' ? { content } : content;
            // Entferne flags (keine ephemeral-Antworten bei Text-Commands)
            delete payload.flags;
            return message.reply(payload);
        },
    };
}

// Ship-Adapter braucht beide User
function makeShipTextInteraction(message, user1, user2) {
    return {
        user: message.author,
        member: message.member,
        guild: message.guild,
        guildId: message.guildId,
        channelId: message.channelId,
        options: {
            getUser: (name) => name === 'user1' ? user1 : user2,
        },
        reply: (content) => {
            const payload = typeof content === 'string' ? { content } : content;
            delete payload.flags;
            return message.reply(payload);
        },
    };
}

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, client) {
        if (!message.guild) return;
        if (message.author.bot) {
            // Relay-Loop verhindern: eigene Sync-Webhooks ignorieren
            if (message.webhookId && syncWebhookIds.has(message.webhookId)) return;
            return;
        }

        const guildId = message.guild.id;

        // ── Nachrichtenstatistik ──────────────────────────────────────────────
        try { incrementMessageStat(guildId, message.channelId); } catch (e) {}

        // ── Image-Only-Kanäle ─────────────────────────────────────────────────
        try {
            const imageOnlyChannels = getAllEnabledImageOnlyChannels();
            const imgConfig = imageOnlyChannels.find(c => c.guildId === guildId && c.channelId === message.channelId);
            if (imgConfig) {
                if (!messageHasImage(message)) {
                    await message.delete().catch(() => {});
                    const warn = await message.channel.send(
                        `❌ <@${message.author.id}> Dieser Kanal ist nur für Bilder! Nachrichten ohne Bild werden automatisch gelöscht.`
                    ).catch(() => null);
                    if (warn) setTimeout(() => warn.delete().catch(() => {}), 5000);
                    return;
                }
            }
        } catch (e) {}

        // ── Global Synced Chat ────────────────────────────────────────────────
        try {
            const allSyncChannels = getAllEnabledSyncChannels();
            const thisSync = allSyncChannels.find(c => c.guildId === guildId && c.channelId === message.channelId);
            if (thisSync) {
                // Anti-Spam-Filter
                const isMentionEveryone = message.mentions.everyone;
                const isCommandMessage = message.content.startsWith('/') || message.content.startsWith('!');
                const tooLong = message.content.length > 1500;

                if (!isMentionEveryone && !isCommandMessage && !tooLong) {
                    const groupChannels = allSyncChannels
                        .filter(c => !(c.guildId === guildId && c.channelId === message.channelId));

                    const serverName = message.guild.name;
                    const displayName = message.member?.displayName || message.author.username;
                    const avatarUrl = message.author.displayAvatarURL({ size: 64 });

                    for (const target of groupChannels) {
                        if (!target.webhookId || !target.webhookToken) continue;
                        try {
                            const wh = new WebhookClient({ id: target.webhookId, token: target.webhookToken });
                            let content = message.content || '';
                            // Keine @everyone/@here im relay
                            content = content.replace(/@everyone/g, '@​everyone').replace(/@here/g, '@​here');

                            await wh.send({
                                content: content || undefined,
                                username: `${displayName} (${serverName})`,
                                avatarURL: avatarUrl,
                                files: message.attachments.size > 0
                                    ? [...message.attachments.values()].map(a => a.url)
                                    : undefined,
                            });
                        } catch (e) {
                            console.error('[SyncChat] Webhook-Fehler:', e.message);
                        }
                    }
                }
            }
        } catch (e) {}

        // ── Prefix-Commands (!cmd) ────────────────────────────────────────────
        const settings = getSettings(guildId);
        const prefix = settings.prefix || '!';
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/\s+/);
        const cmdName = args.shift().toLowerCase();

        // ── !sync — Slash Commands synchronisieren (nur Admins) ──────────────
        if (cmdName === 'sync') {
            if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;
            const { getCommandsJSON } = require('../events/ready');
            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
            const guildSync = args[0] === '.';
            try {
                if (guildSync) {
                    await rest.put(Routes.applicationGuildCommands(client.user.id, message.guildId), { body: getCommandsJSON() });
                    return message.reply('✅ Slash Commands für **diesen Server** synchronisiert — sofort aktiv!');
                } else {
                    await rest.put(Routes.applicationCommands(client.user.id), { body: getCommandsJSON() });
                    return message.reply('✅ Slash Commands **global** synchronisiert — kann bis zu 1 Stunde dauern.\nTipp: `!sync .` für sofortige Aktivierung auf diesem Server.');
                }
            } catch (e) {
                return message.reply(`❌ Fehler beim Sync: ${e.message}`);
            }
        }

        const FUN_COMMANDS = ['connect3', 'magische_miesmuschel', 'miesmuschel', 'pp', 'ship', 'coinflip', 'aussehen', 'iq', 'größe', 'gewicht'];
        if (!FUN_COMMANDS.includes(cmdName)) return;

        // Fun-Channel-Check
        if (settings.funChannel && message.channelId !== settings.funChannel) {
            const reply = await message.reply(`❌ Diese Commands sind nur in <#${settings.funChannel}> erlaubt!`).catch(() => null);
            if (reply) setTimeout(() => reply.delete().catch(() => {}), 5000);
            return;
        }

        // Disabled-Commands-Check
        const disabled = settings.disabledCommands || [];
        const canonicalName = cmdName === 'miesmuschel' ? 'magische_miesmuschel' : cmdName;
        if (disabled.includes(canonicalName)) return;

        const interaction = makeTextInteraction(message, args);

        if (canonicalName === 'pp') return handlePP(interaction);
        if (canonicalName === 'magische_miesmuschel') {
            // Baue String-Option aus restlichen Args
            interaction.options.getString = () => args.join(' ') || 'keine Frage';
            return handleMiesmuschel(interaction);
        }
        if (canonicalName === 'coinflip') return handleCoinflip(interaction);
        if (canonicalName === 'aussehen') return handleAussehen(interaction);
        if (canonicalName === 'iq') return handleIQ(interaction);
        if (canonicalName === 'größe') return handleGroesse(interaction);
        if (canonicalName === 'gewicht') return handleGewicht(interaction);
        if (canonicalName === 'ship') {
            const mentions = message.mentions.users;
            if (mentions.size < 2) {
                return message.reply('⚓ Nutzung: `!ship @user1 @user2`');
            }
            const [u1, u2] = mentions.values();
            return handleShip(makeShipTextInteraction(message, u1, u2));
        }
    },
};
