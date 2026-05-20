// discord/bot/events/interactionCreate.js
const { getReactionRoles, getSettings } = require('../../database/db');
const { MessageFlags } = require('discord.js');
const { handleConnect3, handleConnect3Button } = require('../commands/connect3');
const { handleMiesmuschel } = require('../commands/magische_miesmuschel');
const { handlePP } = require('../commands/pp');
const { handleApply, handleApprove, handleReject } = require('../commands/approval');
const { handleVoiceCommand } = require('../commands/voice');

const FUN_COMMANDS = ['connect3', 'magische_miesmuschel', 'pp'];
const VOICE_COMMANDS = ['voicelimit', 'voicelock', 'voice_rename'];

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {

        // ── Slash Commands ────────────────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const cmd = interaction.commandName;

            // Fun Commands: optionaler Kanal-Check
            if (FUN_COMMANDS.includes(cmd)) {
                const settings = getSettings(interaction.guildId);
                if (settings.funChannel && interaction.channelId !== settings.funChannel) {
                    return interaction.reply({
                        content: `❌ Diese Commands sind nur in <#${settings.funChannel}> erlaubt!`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
                if (cmd === 'connect3') return handleConnect3(interaction);
                if (cmd === 'magische_miesmuschel') return handleMiesmuschel(interaction);
                if (cmd === 'pp') return handlePP(interaction);
            }

            // Voice Commands
            if (VOICE_COMMANDS.includes(cmd)) {
                return handleVoiceCommand(interaction);
            }

            return;
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

        // ── Button: Reaktionsrollen ───────────────────────────────────────────
        if (!interaction.isButton() || !interaction.customId.startsWith('rr_')) return;

        const roleId = interaction.customId.replace('rr_', '');
        const member = interaction.member;

        const configs = getReactionRoles(interaction.guildId);
        const config = configs.find(c => c.messageId === interaction.message.id);

        if (!config) {
            return interaction.reply({ content: 'Dieses Setup existiert nicht mehr.', flags: MessageFlags.Ephemeral });
        }

        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
            return interaction.reply({ content: 'Diese Rolle existiert auf dem Server nicht mehr.', flags: MessageFlags.Ephemeral });
        }

        try {
            if (config.mode === 'single') {
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId);
                    return interaction.reply({ content: `Dir wurde die Rolle **${role.name}** wieder entfernt.`, flags: MessageFlags.Ephemeral });
                }

                const allRolesInSetup = Array.isArray(config.roleMapping)
                    ? config.roleMapping.map(m => m.roleId)
                    : Object.values(config.roleMapping);

                const rolesToRemove = allRolesInSetup.filter(rId => rId !== roleId && member.roles.cache.has(rId));
                let removedText = '';
                if (rolesToRemove.length > 0) {
                    await member.roles.remove(rolesToRemove);
                    const names = rolesToRemove.map(id => interaction.guild.roles.cache.get(id)?.name).filter(Boolean);
                    if (names.length > 0) removedText = `\n*(Die alte Rolle **${names.join(', ')}** wurde entfernt).*`;
                }

                await member.roles.add(roleId);
                return interaction.reply({ content: `Du hast die Rolle **${role.name}** erhalten! ${removedText}`, flags: MessageFlags.Ephemeral });

            } else {
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId);
                    return interaction.reply({ content: `Dir wurde die Rolle **${role.name}** entfernt.`, flags: MessageFlags.Ephemeral });
                } else {
                    await member.roles.add(roleId);
                    return interaction.reply({ content: `Du hast die Rolle **${role.name}** erhalten!`, flags: MessageFlags.Ephemeral });
                }
            }
        } catch (e) {
            console.error(e);
            return interaction.reply({ content: '❌ Fehler! Steht meine Bot-Rolle über der zu vergebenden Rolle?', flags: MessageFlags.Ephemeral });
        }
    },
};
