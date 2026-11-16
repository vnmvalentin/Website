// discord/bot/events/voiceStateUpdate.js
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
    getVoiceConfig, saveActiveVoiceChannel,
    getActiveVoiceChannel, deleteActiveVoiceChannel, updateVoiceOwner, updateVoicePinMessage,
    trackVoiceActivity,
} = require('../../database/db');
const { botText } = require('../botText');

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

/** Angepinnte Übersicht. t: Texte des Servers (botText(guild)), wegen unknown auf oberster Ebene. */
function buildCommandsEmbed(ownerName, t) {
    return new EmbedBuilder()
        .setColor(0x06b6d4)
        .setTitle(t.voice.pinTitle)
        .setDescription(
            `${t.voice.pinIntro}\n\n${t.voice.pinCommands.join('\n')}\n\n${t.voice.pinOwner(ownerName || t.unknown)}`
        );
}

// Knopfleiste unter der Commands-Übersicht (customIds: siehe commands/voice.js → handleVoiceComponent)
function buildVoiceControls(t) {
    const b = t.voice.buttons;
    const button = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
    return [
        new ActionRowBuilder().addComponents(
            button('vc_lock', b.lock),
            button('vc_hide', b.hide),
            button('vc_limit', b.limit),
            button('vc_rename', b.rename),
        ),
        new ActionRowBuilder().addComponents(
            button('vc_kick', b.kick, ButtonStyle.Danger),
            button('vc_ban', b.ban, ButtonStyle.Danger),
            button('vc_unban', b.unban),
            button('vc_transfer', b.transfer),
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
    const t = botText(guild);
    const ownerName = guild.members.cache.get(newOwnerId)?.displayName
        || (await guild.members.fetch(newOwnerId).catch(() => null))?.displayName
        || t.unknown;
    // Knöpfe mit erneuern: nach einem Sprachwechsel im Dashboard passen sie so wieder zur Übersicht
    await msg.edit({ embeds: [buildCommandsEmbed(ownerName, t)], components: buildVoiceControls(t) }).catch(() => {});
}

async function createPrivateVC(guild, member, triggerChannel) {
    const categoryId = triggerChannel.parentId;
    const t = botText(guild);

    const voiceChannel = await guild.channels.create({
        name: t.voice.channelName(member.displayName),
        type: ChannelType.GuildVoice,
        parent: categoryId,
        userLimit: 0,
    });

    // Sofort verschieben – Text-Kanal und Pin-Nachricht folgen danach, sonst wartet der Nutzer
    // auf mehrere (ratenbegrenzte) API-Aufrufe im Trigger-Kanal
    const moved = await guild.members.cache.get(member.id)?.voice.setChannel(voiceChannel).then(() => true).catch(() => false);
    if (!moved) {
        // Nutzer hat den Trigger-Kanal schon wieder verlassen → nichts zurücklassen
        await voiceChannel.delete().catch(() => {});
        return;
    }

    const textChannel = await guild.channels.create({
        name: `voice-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ],
    }).catch(async (e) => {
        await voiceChannel.delete().catch(() => {});
        throw e;
    });

    // Direkt speichern, damit Verlassen/Beitreten ab jetzt greift (auch während die Pin-Nachricht noch läuft)
    saveActiveVoiceChannel(voiceChannel.id, textChannel.id, member.id, guild.id);

    // Alle schon wieder weg, während der Text-Kanal entstand? Das Leave-Event kam vor dem Speichern → hier aufräumen
    if (voiceChannel.members.filter(m => !m.user.bot).size === 0) {
        await handleVCEmpty(guild, getActiveVoiceChannel(voiceChannel.id));
        return;
    }

    // Commands-Übersicht (inkl. Besitzer-Zeile) senden und anpinnen – mit einem zweiten Versuch bei
    // vorübergehenden Fehlern; Senden und Anpinnen getrennt, damit ein fehlgeschlagener Pin die Nachricht nicht verliert
    const withRetry = async (label, fn) => {
        try { return await fn(); } catch (e) {
            console.warn(`[Voice] ${label} fehlgeschlagen, neuer Versuch:`, e?.message || e);
            await new Promise(r => setTimeout(r, 1500));
            return fn();
        }
    };
    try {
        const pinMsg = await withRetry('Commands-Nachricht senden', () =>
            textChannel.send({ embeds: [buildCommandsEmbed(member.displayName, t)], components: buildVoiceControls(t) }));
        updateVoicePinMessage(voiceChannel.id, pinMsg.id);
        await withRetry('Commands-Nachricht anpinnen', () => pinMsg.pin());
    } catch (e) {
        console.error('[Voice] Commands-Nachricht konnte nicht gesendet/angepinnt werden:', e?.message || e);
    }
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
