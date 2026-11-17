// discord/bot/events/interactionCreate.js
const { getReactionRoles, getSettings } = require('../../database/db');
const { MessageFlags } = require('discord.js');
const { handleConnect3, handleConnect3Button } = require('../commands/connect3');
const { handleMiesmuschel } = require('../commands/magische_miesmuschel');
const { handlePP } = require('../commands/pp');
const { handleAussehen } = require('../commands/aussehen');
const { handleIQ } = require('../commands/iq');
const { handleGroesse } = require('../commands/groesse');
const { handleGewicht } = require('../commands/gewicht');
const { handleShip } = require('../commands/ship');
const { handleCoinflip } = require('../commands/coinflip');
const { handleAllStats } = require('../commands/allstats');
const { handleSuperkraft } = require('../commands/superkraft');
const { handleAusrede } = require('../commands/ausrede');
const { handleApply, handleApprove, handleReject } = require('../commands/approval');
const { handleVoiceCommand, handleVoiceComponent } = require('../commands/voice');
const { handleServerStats } = require('../commands/serverstats');
const { handleTagesrennen } = require('../seedRunnersBoard');
const { handleTicketCreateButton, handleTicketModalSubmit, handleTicketClose } = require('../commands/tickets');
const { LOYALTY_COMMANDS, handleLoyaltyCommand, handleLoyaltyButton } = require('../../loyalty/games');
const { botText } = require('../botText');

const FUN_COMMANDS = ['connect3', 'magische_miesmuschel', 'pp', 'aussehen', 'iq', 'größe', 'gewicht', 'ship', 'coinflip', 'allstats', 'superkraft', 'ausrede'];
const VOICE_COMMANDS = ['voicelimit', 'voicelock', 'voice_rename', 'voice_hide', 'voice_unhide', 'voice_transfer', 'voice_kick', 'voice_ban', 'voice_unban'];

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {

        // ── Slash Commands ────────────────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const cmd = interaction.commandName;

            // Fun Commands: optionaler Kanal-Check + Disabled-Check
            if (FUN_COMMANDS.includes(cmd)) {
                const settings = getSettings(interaction.guildId);
                const t = botText(interaction).commands;
                if (settings.disabledCommands?.includes(cmd)) {
                    return interaction.reply({ content: t.disabled, flags: MessageFlags.Ephemeral });
                }
                if (settings.funChannel && interaction.channelId !== settings.funChannel) {
                    return interaction.reply({
                        content: t.onlyIn(settings.funChannel),
                        flags: MessageFlags.Ephemeral,
                    });
                }
                if (cmd === 'connect3') return handleConnect3(interaction);
                if (cmd === 'magische_miesmuschel') return handleMiesmuschel(interaction);
                if (cmd === 'pp') return handlePP(interaction);
                if (cmd === 'aussehen') return handleAussehen(interaction);
                if (cmd === 'iq') return handleIQ(interaction);
                if (cmd === 'größe') return handleGroesse(interaction);
                if (cmd === 'gewicht') return handleGewicht(interaction);
                if (cmd === 'ship') return handleShip(interaction);
                if (cmd === 'coinflip') return handleCoinflip(interaction);
                if (cmd === 'allstats') return handleAllStats(interaction);
                if (cmd === 'superkraft') return handleSuperkraft(interaction);
                if (cmd === 'ausrede') return handleAusrede(interaction);
            }

            // Voice Commands
            if (VOICE_COMMANDS.includes(cmd)) {
                return handleVoiceCommand(interaction);
            }

            // Punkte-System: eigener Schalter und eigener Spiele-Kanal im Dashboard (Reiter "Punkte")
            if (LOYALTY_COMMANDS.includes(cmd)) {
                return handleLoyaltyCommand(interaction).catch(e => {
                    console.error('[Punkte]', cmd, e);
                    const msg = { content: botText(interaction).commands.failed, flags: MessageFlags.Ephemeral };
                    return (interaction.replied || interaction.deferred ? interaction.followUp(msg) : interaction.reply(msg)).catch(() => {});
                });
            }

            if (cmd === 'serverstats') return handleServerStats(interaction);
            if (cmd === 'tagesrennen') return handleTagesrennen(interaction);

            return;
        }

        // ── Voice Channel: Knöpfe, Modals und Auswahlmenüs der angepinnten Nachricht ──
        if ((interaction.isButton() || interaction.isModalSubmit() || interaction.isUserSelectMenu()) && interaction.customId.startsWith('vc_')) {
            return handleVoiceComponent(interaction);
        }

        // ── Modal: Ticket erstellen ───────────────────────────────────────────
        if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
            return handleTicketModalSubmit(interaction);
        }

        // ── Button: Giveaway „Teilnehmen“ (Backend/giveaways/discordPost.js) ──
        if (interaction.isButton() && interaction.customId.startsWith('gw_join:')) {
            return require('../../../giveaways/discordPost').handleGiveawayButton(interaction)
                .catch(e => console.error('[Giveaways] Knopf:', e));
        }

        // ── Button: Punkte-System (Rakete aussteigen, Duell annehmen) ─────────
        if (interaction.isButton() && interaction.customId.startsWith('lp_')) {
            return handleLoyaltyButton(interaction).catch(e => console.error('[Punkte] Knopf:', e));
        }

        // ── Button: Connect 3 ─────────────────────────────────────────────────
        if (interaction.isButton() && interaction.customId.startsWith('c3_')) {
            return handleConnect3Button(interaction);
        }

        // ── Button: Genehmigungsverfahren ────────────────────────────────────
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('apply_')) return handleApply(interaction);
            if (interaction.customId.startsWith('appv_')) return handleApprove(interaction);
            if (interaction.customId.startsWith('appx_')) return handleReject(interaction);
        }

        // ── Button: Tickets ────────────────────────────────────────────────────
        if (interaction.isButton()) {
            if (interaction.customId === 'ticket_create') return handleTicketCreateButton(interaction);
            if (interaction.customId === 'ticket_close') return handleTicketClose(interaction);
        }

        // ── Button: Reaktionsrollen ───────────────────────────────────────────
        if (!interaction.isButton() || !interaction.customId.startsWith('rr_')) return;

        const roleId = interaction.customId.replace('rr_', '');
        const member = interaction.member;
        const t = botText(interaction).roles;

        const configs = getReactionRoles(interaction.guildId);
        const config = configs.find(c => c.messageId === interaction.message.id);

        if (!config) {
            return interaction.reply({ content: t.setupGone, flags: MessageFlags.Ephemeral });
        }

        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
            return interaction.reply({ content: t.roleGone, flags: MessageFlags.Ephemeral });
        }

        try {
            if (config.mode === 'single') {
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId);
                    return interaction.reply({ content: t.removedAgain(role.name), flags: MessageFlags.Ephemeral });
                }

                const allRolesInSetup = Array.isArray(config.roleMapping)
                    ? config.roleMapping.map(m => m.roleId)
                    : Object.values(config.roleMapping);

                const rolesToRemove = allRolesInSetup.filter(rId => rId !== roleId && member.roles.cache.has(rId));
                let removedText = '';
                if (rolesToRemove.length > 0) {
                    await member.roles.remove(rolesToRemove);
                    const names = rolesToRemove.map(id => interaction.guild.roles.cache.get(id)?.name).filter(Boolean);
                    if (names.length > 0) removedText = t.oldRemoved(names.join(', '));
                }

                await member.roles.add(roleId);
                return interaction.reply({ content: `${t.added(role.name)} ${removedText}`, flags: MessageFlags.Ephemeral });

            } else {
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId);
                    return interaction.reply({ content: t.removed(role.name), flags: MessageFlags.Ephemeral });
                } else {
                    await member.roles.add(roleId);
                    return interaction.reply({ content: t.added(role.name), flags: MessageFlags.Ephemeral });
                }
            }
        } catch (e) {
            console.error(e);
            return interaction.reply({ content: t.failed, flags: MessageFlags.Ephemeral });
        }
    },
};
