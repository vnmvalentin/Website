// discord/bot/commands/voice.js
const {
    PermissionFlagsBits, MessageFlags,
    ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder,
} = require('discord.js');
const { getActiveVoiceChannelByText, updateVoiceOwner } = require('../../database/db');
const { updateVoicePinOwner } = require('../events/voiceStateUpdate');

// Ergebnis einer Aktion: Erfolg wird öffentlich im Kanal gezeigt, Fehler nur dem Auslöser
const ok = (content) => ({ content, error: false });
const fail = (content) => ({ content, error: true });

/**
 * Prüft, ob der Auslöser den Voice Channel dieses Text-Kanals verwalten darf.
 * Gilt für Slash Commands, Knöpfe, Modals und Auswahlmenüs gleichermaßen.
 * @returns {{ vcRecord: object, voiceChannel: object, guild: object, userId: string } | { error: string }}
 */
function resolveVoiceContext(interaction) {
    const vcRecord = getActiveVoiceChannelByText(interaction.channelId);
    if (!vcRecord) return { error: '❌ Dieser Command funktioniert nur im dedizierten Voice-Text-Kanal!' };

    const voiceChannel = interaction.guild.channels.cache.get(vcRecord.voice_channel_id);
    if (!voiceChannel) return { error: '❌ Der Voice Channel existiert nicht mehr.' };

    if (!voiceChannel.members.has(interaction.user.id)) {
        return { error: '❌ Du musst im Voice Channel sein um diesen Command zu nutzen!' };
    }

    // Nur der Channel-Besitzer (oder der Server-Owner) darf den Channel verwalten
    const isChannelOwner = vcRecord.owner_id === interaction.user.id;
    const isGuildOwner = interaction.guild.ownerId === interaction.user.id;
    if (!isChannelOwner && !isGuildOwner) return { error: '❌ Nur der Channel-Besitzer kann diesen Command nutzen!' };

    return { vcRecord, voiceChannel, guild: interaction.guild, userId: interaction.user.id };
}

// ── Aktionen ──────────────────────────────────────────────────────────────────

async function setLimit({ voiceChannel }, limit) {
    if (!Number.isInteger(limit) || limit < 0 || limit > 99) return fail('❌ Das Limit muss eine Zahl von 0 bis 99 sein (0 = unbegrenzt).');
    await voiceChannel.setUserLimit(limit);
    return ok(limit === 0
        ? '♾️ Userlimit entfernt — der Channel ist jetzt unbegrenzt.'
        : `👥 Userlimit auf **${limit}** gesetzt.`);
}

async function toggleLock({ voiceChannel, guild, vcRecord }) {
    const everyoneOverwrite = voiceChannel.permissionOverwrites.cache.get(guild.id);
    const isLocked = everyoneOverwrite?.deny.has(PermissionFlagsBits.Connect) ?? false;

    if (isLocked) {
        await voiceChannel.permissionOverwrites.edit(guild.id, { Connect: null });
        return ok('🔓 Voice Channel entsperrt! Alle können wieder joinen.');
    }
    await voiceChannel.permissionOverwrites.edit(guild.id, { Connect: false });
    // Owner kann trotzdem joinen
    await voiceChannel.permissionOverwrites.edit(vcRecord.owner_id, { Connect: true, ViewChannel: true });
    return ok('🔒 Voice Channel gesperrt! Nur noch du kannst joinen.');
}

async function rename({ voiceChannel, guild, vcRecord }, rawName) {
    const name = String(rawName ?? '').trim();
    if (!name || name.length > 100) return fail('❌ Name ungültig (max. 100 Zeichen).');
    await voiceChannel.setName(name);

    // Zugehörigen Text-Kanal mitbenennen (gleiches "voice-"-Schema wie beim Erstellen)
    const textChannel = guild.channels.cache.get(vcRecord.text_channel_id);
    const slug = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 94);
    if (textChannel && slug) {
        // Nicht awaiten: Discord erlaubt nur 2 Umbenennungen pro 10 Min je Kanal —
        // ein Rate-Limit hier darf die Antwort nicht blockieren
        textChannel.setName(`voice-${slug}`).catch(e => console.error('[Voice] Text-Kanal umbenennen fehlgeschlagen:', e.message));
    }
    return ok(`✏️ Voice Channel umbenannt zu **${name}**.`);
}

function isHidden({ voiceChannel, guild }) {
    return voiceChannel.permissionOverwrites.cache.get(guild.id)?.deny.has(PermissionFlagsBits.ViewChannel) ?? false;
}

async function setHidden({ voiceChannel, guild, vcRecord }, hidden) {
    if (!hidden) {
        await voiceChannel.permissionOverwrites.edit(guild.id, { ViewChannel: null });
        return ok('👁️ Voice Channel ist wieder für alle sichtbar.');
    }
    await voiceChannel.permissionOverwrites.edit(guild.id, { ViewChannel: false });
    // Besitzer + alle aktuellen Mitglieder dürfen den Channel weiterhin sehen
    await voiceChannel.permissionOverwrites.edit(vcRecord.owner_id, { ViewChannel: true, Connect: true }).catch(() => {});
    for (const m of voiceChannel.members.values()) {
        if (m.user.bot || m.id === vcRecord.owner_id) continue;
        await voiceChannel.permissionOverwrites.edit(m.id, { ViewChannel: true }).catch(() => {});
    }
    return ok('🙈 Voice Channel versteckt! Nur die aktuellen Mitglieder sehen ihn noch.');
}

async function transfer({ voiceChannel, guild, vcRecord }, targetId) {
    const targetMember = voiceChannel.members.get(targetId);
    if (targetMember?.user.bot) return fail('❌ Ungültiger Nutzer.');
    if (targetId === vcRecord.owner_id) return fail('❌ Der Nutzer ist bereits der Besitzer.');
    if (!targetMember) return fail('❌ Der Nutzer muss dafür im Voice Channel sein!');

    updateVoiceOwner(voiceChannel.id, targetId);
    // Neuer Besitzer bekommt garantierten Zugang (relevant bei gesperrtem/verstecktem Channel)
    await voiceChannel.permissionOverwrites.edit(targetId, { ViewChannel: true, Connect: true }).catch(() => {});
    // Besitzer-Zeile in der angepinnten Nachricht aktualisieren
    await updateVoicePinOwner(guild, vcRecord, targetId);
    return ok(`👑 **${targetMember.displayName}** ist jetzt der Channel-Besitzer.`);
}

// Sich selbst und den Server-Owner kann niemand kicken oder bannen
function protectedTargetError({ guild, userId }, targetId) {
    if (targetId === userId) return '❌ Das geht nicht bei dir selbst.';
    if (targetId === guild.ownerId) return '❌ Der Server-Owner kann nicht gekickt oder gebannt werden.';
    return null;
}

async function kick(ctx, targetId) {
    const blocked = protectedTargetError(ctx, targetId);
    if (blocked) return fail(blocked);
    const targetMember = ctx.voiceChannel.members.get(targetId);
    if (!targetMember) return fail('❌ Der Nutzer ist nicht im Voice Channel.');

    await targetMember.voice.disconnect();
    return ok(`👢 **${targetMember.displayName}** wurde aus dem Voice Channel gekickt.`);
}

async function ban(ctx, targetId) {
    const blocked = protectedTargetError(ctx, targetId);
    if (blocked) return fail(blocked);
    const { voiceChannel, guild } = ctx;
    const targetMember = guild.members.cache.get(targetId) || await guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) return fail('❌ Der Nutzer ist nicht auf diesem Server.');

    // Der Bann ist eine Kanal-Berechtigung: Er endet von selbst, wenn der Channel gelöscht wird
    await voiceChannel.permissionOverwrites.edit(targetId, { Connect: false });
    if (voiceChannel.members.has(targetId)) await targetMember.voice.disconnect().catch(() => {});
    return ok(`🚫 **${targetMember.displayName}** wurde aus dem Voice Channel gebannt.`);
}

async function unban({ voiceChannel, guild }, targetId) {
    const overwrite = voiceChannel.permissionOverwrites.cache.get(targetId);
    if (!overwrite?.deny.has(PermissionFlagsBits.Connect)) return fail('❌ Der Nutzer ist in diesem Channel nicht gebannt.');

    await voiceChannel.permissionOverwrites.edit(targetId, { Connect: null });
    const name = guild.members.cache.get(targetId)?.displayName || 'Der Nutzer';
    return ok(`✅ **${name}** darf dem Voice Channel wieder beitreten.`);
}

// ── Antworten ─────────────────────────────────────────────────────────────────

function respond(interaction, result) {
    return interaction.reply(result.error
        ? { content: result.content, flags: MessageFlags.Ephemeral }
        : { content: result.content });
}

async function replyFailure(interaction, e) {
    console.error('[Voice] Aktion fehlgeschlagen:', e);
    const payload = { content: '❌ Das hat nicht geklappt. Fehlen dem Bot Rechte für diesen Channel?', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
}

// ── Slash Commands ────────────────────────────────────────────────────────────

async function handleVoiceCommand(interaction) {
    const ctx = resolveVoiceContext(interaction);
    if (ctx.error) return interaction.reply({ content: ctx.error, flags: MessageFlags.Ephemeral });

    const cmd = interaction.commandName;
    const targetId = interaction.options.getUser('user')?.id;

    try {
        if (cmd === 'voicelimit') return await respond(interaction, await setLimit(ctx, interaction.options.getInteger('limit')));
        if (cmd === 'voicelock') return await respond(interaction, await toggleLock(ctx));
        if (cmd === 'voice_rename') return await respond(interaction, await rename(ctx, interaction.options.getString('name')));
        if (cmd === 'voice_hide') return await respond(interaction, await setHidden(ctx, true));
        if (cmd === 'voice_unhide') return await respond(interaction, await setHidden(ctx, false));
        if (cmd === 'voice_transfer') return await respond(interaction, await transfer(ctx, targetId));
        if (cmd === 'voice_kick') return await respond(interaction, await kick(ctx, targetId));
        if (cmd === 'voice_ban') return await respond(interaction, await ban(ctx, targetId));
        if (cmd === 'voice_unban') return await respond(interaction, await unban(ctx, targetId));
    } catch (e) {
        return replyFailure(interaction, e);
    }
}

// ── Knöpfe, Modals und Auswahlmenüs der angepinnten Nachricht ─────────────────

// Knopf → Auswahlmenü: welcher Nutzer ist gemeint?
const USER_PICKS = {
    vc_kick: { selectId: 'vc_sel_kick', prompt: 'Wen möchtest du kicken?', run: kick },
    vc_ban: { selectId: 'vc_sel_ban', prompt: 'Wen möchtest du bannen?', run: ban },
    vc_unban: { selectId: 'vc_sel_unban', prompt: 'Wen möchtest du entbannen?', run: unban },
    vc_transfer: { selectId: 'vc_sel_transfer', prompt: 'Wer soll der neue Besitzer werden?', run: transfer },
};
const PICK_BY_SELECT = Object.fromEntries(Object.values(USER_PICKS).map(p => [p.selectId, p]));

function textModal(customId, title, label, { maxLength, placeholder }) {
    const input = new TextInputBuilder()
        .setCustomId('value')
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(maxLength)
        .setPlaceholder(placeholder)
        .setRequired(true);
    return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(new ActionRowBuilder().addComponents(input));
}

async function handleVoiceComponent(interaction) {
    const ctx = resolveVoiceContext(interaction);
    if (ctx.error) return interaction.reply({ content: ctx.error, flags: MessageFlags.Ephemeral });

    const id = interaction.customId;

    try {
        if (interaction.isButton()) {
            if (id === 'vc_lock') return await respond(interaction, await toggleLock(ctx));
            if (id === 'vc_hide') return await respond(interaction, await setHidden(ctx, !isHidden(ctx)));
            if (id === 'vc_limit') {
                return await interaction.showModal(textModal('vc_modal_limit', 'Userlimit setzen', 'Limit (0 = unbegrenzt)', { maxLength: 2, placeholder: '0 bis 99' }));
            }
            if (id === 'vc_rename') {
                return await interaction.showModal(textModal('vc_modal_rename', 'Channel umbenennen', 'Neuer Name', { maxLength: 100, placeholder: 'Name des Voice Channels' }));
            }
            const pick = USER_PICKS[id];
            if (pick) {
                const select = new UserSelectMenuBuilder().setCustomId(pick.selectId).setPlaceholder('Nutzer auswählen').setMinValues(1).setMaxValues(1);
                return await interaction.reply({
                    content: pick.prompt,
                    components: [new ActionRowBuilder().addComponents(select)],
                    flags: MessageFlags.Ephemeral,
                });
            }
            return;
        }

        if (interaction.isModalSubmit()) {
            const value = interaction.fields.getTextInputValue('value').trim();
            if (id === 'vc_modal_limit') {
                return await respond(interaction, await setLimit(ctx, /^\d{1,2}$/.test(value) ? Number(value) : NaN));
            }
            if (id === 'vc_modal_rename') return await respond(interaction, await rename(ctx, value));
            return;
        }

        if (interaction.isUserSelectMenu()) {
            const pick = PICK_BY_SELECT[id];
            if (!pick) return;
            const result = await pick.run(ctx, interaction.values[0]);
            // Das Auswahlmenü war nur für den Auslöser sichtbar: Fehler bleiben dort, Erfolg geht öffentlich in den Kanal
            if (result.error) return await interaction.update({ content: result.content, components: [] });
            await interaction.update({ content: 'Erledigt.', components: [] });
            return await interaction.followUp({ content: result.content });
        }
    } catch (e) {
        return replyFailure(interaction, e);
    }
}

module.exports = { handleVoiceCommand, handleVoiceComponent };
