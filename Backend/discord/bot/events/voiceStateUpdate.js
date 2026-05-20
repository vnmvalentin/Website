// discord/bot/events/voiceStateUpdate.js
const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const {
    getVoiceConfig, saveActiveVoiceChannel,
    getActiveVoiceChannel, deleteActiveVoiceChannel, updateVoiceOwner,
} = require('../../database/db');

const COMMANDS_EMBED = new EmbedBuilder()
    .setColor(0x06b6d4)
    .setTitle('🎛️ Voice Channel Commands')
    .setDescription(
        'Diese Commands funktionieren nur hier, solange du im Voice bist:\n\n' +
        '`/voicelimit [zahl]` — Userlimit setzen (0 = unbegrenzt)\n' +
        '`/voicelock` — Channel sperren / entsperren\n' +
        '`/voice_rename [name]` — Channel umbenennen'
    );

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

    // Commands-Übersicht anpinnen
    try {
        const pinMsg = await textChannel.send({ embeds: [COMMANDS_EMBED] });
        await pinMsg.pin();
    } catch (e) {}

    await guild.members.cache.get(member.id)?.voice.setChannel(voiceChannel).catch(() => {});

    saveActiveVoiceChannel(voiceChannel.id, textChannel.id, member.id, guild.id);
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
    async execute(oldState, newState) {
        const guild = newState.guild || oldState.guild;
        const member = newState.member || oldState.member;
        if (!guild || !member || member.user.bot) return;

        const config = getVoiceConfig(guild.id);
        const triggerChannelId = config?.triggerChannelId;

        const leftChannelId = oldState.channelId;
        const joinedChannelId = newState.channelId;

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
