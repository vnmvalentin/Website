// discord/bot/events/voiceStateUpdate.js
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
    getVoiceConfig, saveActiveVoiceChannel,
    getActiveVoiceChannel, deleteActiveVoiceChannel, updateVoiceOwner,
    trackVoiceActivity,
} = require('../../database/db');

// In-Memory: wann ist ein Nutzer welchem Voice-Channel beigetreten (für Zeit-Tracking)
const voiceJoinTimestamps = new Map(); // `${guildId}:${userId}` -> { channelId, joinedAt }
const trackKey = (guildId, userId) => `${guildId}:${userId}`;

function trackJoin(guildId, userId, channelId) {
    voiceJoinTimestamps.set(trackKey(guildId, userId), { channelId, joinedAt: Date.now() });
}

function trackLeave(guildId, userId) {
    const key = trackKey(guildId, userId);
    const entry = voiceJoinTimestamps.get(key);
    if (!entry) return;
    voiceJoinTimestamps.delete(key);
    const durationSeconds = Math.round((Date.now() - entry.joinedAt) / 1000);
    if (durationSeconds > 0) trackVoiceActivity(guildId, userId, entry.channelId, durationSeconds);
}

// Laufende Sitzungen (noch nicht in der DB, weil der Nutzer den Voice noch nicht verlassen hat): userId -> Sekunden
function getLiveVoiceSeconds(guildId) {
    const live = new Map();
    const prefix = `${guildId}:`;
    for (const [key, entry] of voiceJoinTimestamps) {
        if (!key.startsWith(prefix)) continue;
        live.set(key.slice(prefix.length), Math.round((Date.now() - entry.joinedAt) / 1000));
    }
    return live;
}

// Bei Bot-Neustart: Nutzer, die bereits im Voice sind, ab jetzt tracken
function initVoiceTracking(client) {
    for (const guild of client.guilds.cache.values()) {
        for (const channel of guild.channels.cache.values()) {
            if (channel.type !== ChannelType.GuildVoice) continue;
            for (const member of channel.members.values()) {
                if (member.user.bot) continue;
                trackJoin(guild.id, member.id, channel.id);
            }
        }
    }
}

function buildCommandsEmbed(ownerName) {
    return new EmbedBuilder()
        .setColor(0x06b6d4)
        .setTitle('🎛️ Voice Channel Commands')
        .setDescription(
            'Nur für den Channel-Besitzer, solange er im Voice ist. Per Knopf unten oder per Command:\n\n' +
            '`/voicelimit [zahl]` — Userlimit setzen (0 = unbegrenzt)\n' +
            '`/voicelock` — Channel sperren / entsperren\n' +
            '`/voice_rename [name]` — Channel umbenennen\n' +
            '`/voice_hide` — Channel für andere unsichtbar machen\n' +
            '`/voice_unhide` — Channel wieder sichtbar machen\n' +
            '`/voice_kick [user]` — Nutzer aus dem Channel werfen\n' +
            '`/voice_ban [user]` — Nutzer werfen und am Beitreten hindern\n' +
            '`/voice_unban [user]` — Bann wieder aufheben\n' +
            '`/voice_transfer [user]` — Besitzer-Status übergeben\n\n' +
            `👑 **Voice Channel Besitzer:** ${ownerName || 'Unbekannt'}`
        );
}

// Knopfleiste unter der Commands-Übersicht (customIds: siehe commands/voice.js → handleVoiceComponent)
function buildVoiceControls() {
    const button = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
    return [
        new ActionRowBuilder().addComponents(
            button('vc_lock', 'Sperren / Entsperren'),
            button('vc_hide', 'Verstecken / Zeigen'),
            button('vc_limit', 'Limit'),
            button('vc_rename', 'Umbenennen'),
        ),
        new ActionRowBuilder().addComponents(
            button('vc_kick', 'Kicken', ButtonStyle.Danger),
            button('vc_ban', 'Bannen', ButtonStyle.Danger),
            button('vc_unban', 'Entbannen'),
            button('vc_transfer', 'Besitzer übergeben'),
        ),
    ];
}

// Besitzer-Zeile in der angepinnten Commands-Nachricht aktualisieren (bei Transfer / Auto-Übergabe)
async function updateVoicePinOwner(guild, vcRecord, newOwnerId) {
    if (!vcRecord?.pin_message_id) return;
    const textChannel = guild.channels.cache.get(vcRecord.text_channel_id);
    if (!textChannel) return;
    const msg = await textChannel.messages.fetch(vcRecord.pin_message_id).catch(() => null);
    if (!msg) return;
    const ownerName = guild.members.cache.get(newOwnerId)?.displayName
        || (await guild.members.fetch(newOwnerId).catch(() => null))?.displayName
        || 'Unbekannt';
    await msg.edit({ embeds: [buildCommandsEmbed(ownerName)] }).catch(() => {});
}

async function createPrivateVC(guild, member, triggerChannel) {
    const categoryId = triggerChannel.parentId;

    const voiceChannel = await guild.channels.create({
        name: `🔊 ${member.displayName}s Kanal`,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        userLimit: 0,
    });

    const textChannel = await guild.channels.create({
        name: `voice-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ],
    });

    // Commands-Übersicht (inkl. Besitzer-Zeile) anpinnen
    let pinMessageId = '';
    try {
        const pinMsg = await textChannel.send({ embeds: [buildCommandsEmbed(member.displayName)], components: buildVoiceControls() });
        await pinMsg.pin();
        pinMessageId = pinMsg.id;
    } catch (e) {}

    await guild.members.cache.get(member.id)?.voice.setChannel(voiceChannel).catch(() => {});

    saveActiveVoiceChannel(voiceChannel.id, textChannel.id, member.id, guild.id, pinMessageId);
}

async function addMemberToText(guild, memberId, vcRecord) {
    const textChannel = guild.channels.cache.get(vcRecord.text_channel_id);
    if (!textChannel) return;
    await textChannel.permissionOverwrites.create(memberId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
    }).catch(() => {});
}

async function removeMemberFromText(guild, memberId, vcRecord) {
    const textChannel = guild.channels.cache.get(vcRecord.text_channel_id);
    if (!textChannel) return;
    await textChannel.permissionOverwrites.delete(memberId).catch(() => {});
}

async function handleVCEmpty(guild, vcRecord) {
    const voice = guild.channels.cache.get(vcRecord.voice_channel_id);
    const text = guild.channels.cache.get(vcRecord.text_channel_id);
    if (voice) await voice.delete().catch(() => {});
    if (text) await text.delete().catch(() => {});
    deleteActiveVoiceChannel(vcRecord.voice_channel_id);
}

module.exports = {
    name: 'voiceStateUpdate',
    once: false,
    initVoiceTracking,
    updateVoicePinOwner,
    getLiveVoiceSeconds,
    async execute(oldState, newState) {
        const guild = newState.guild || oldState.guild;
        const member = newState.member || oldState.member;
        if (!guild || !member || member.user.bot) return;

        const config = getVoiceConfig(guild.id);
        const triggerChannelId = config?.triggerChannelId;

        const leftChannelId = oldState.channelId;
        const joinedChannelId = newState.channelId;

        // ── Zeit-Tracking ────────────────────────────────────────────────────
        if (leftChannelId && leftChannelId !== joinedChannelId) {
            trackLeave(guild.id, member.id);
        }
        if (joinedChannelId && joinedChannelId !== leftChannelId) {
            trackJoin(guild.id, member.id, joinedChannelId);
        }

        // ── Verlassen ────────────────────────────────────────────────────────
        if (leftChannelId && leftChannelId !== joinedChannelId) {
            const vcRecord = getActiveVoiceChannel(leftChannelId);
            if (vcRecord) {
                const voiceChannel = guild.channels.cache.get(leftChannelId);
                const membersLeft = voiceChannel ? voiceChannel.members.filter(m => !m.user.bot).size : 0;

                if (membersLeft === 0) {
                    await handleVCEmpty(guild, vcRecord);
                } else {
                    await removeMemberFromText(guild, member.id, vcRecord);

                    // Owner-Übergabe falls Owner verlässt
                    if (vcRecord.owner_id === member.id && voiceChannel) {
                        const nextOwner = voiceChannel.members.find(m => !m.user.bot && m.id !== member.id);
                        if (nextOwner) {
                            updateVoiceOwner(leftChannelId, nextOwner.id);
                            await updateVoicePinOwner(guild, vcRecord, nextOwner.id);
                            const textChannel = guild.channels.cache.get(vcRecord.text_channel_id);
                            if (textChannel) {
                                await textChannel.send(`👑 **${nextOwner.displayName}** ist jetzt der Channel-Besitzer.`).catch(() => {});
                            }
                        }
                    }
                }
            }
        }

        // ── Beitreten ────────────────────────────────────────────────────────
        if (joinedChannelId && joinedChannelId !== leftChannelId) {
            if (triggerChannelId && joinedChannelId === triggerChannelId) {
                const triggerChannel = guild.channels.cache.get(triggerChannelId);
                if (triggerChannel) {
                    await createPrivateVC(guild, member, triggerChannel).catch(e => {
                        console.error('Voice channel creation error:', e);
                    });
                }
            } else {
                const vcRecord = getActiveVoiceChannel(joinedChannelId);
                if (vcRecord) {
                    await addMemberToText(guild, member.id, vcRecord);
                }
            }
        }
    },
};
