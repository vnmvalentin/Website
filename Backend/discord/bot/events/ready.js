// discord/bot/events/ready.js
const { REST, Routes } = require('discord.js');
const { getAllActiveVoiceChannels, deleteActiveVoiceChannel } = require('../../database/db');
const { initVoiceTracking } = require('./voiceStateUpdate');
const { step } = require('../../../lib/startupLog');

// Die Befehle selbst (mit englischen und deutschen Beschreibungen) stehen in ../commandDefs.js
const { commands } = require('../commandDefs');

function getCommandsJSON() { return commands; }

module.exports = {
    name: 'clientReady',
    once: true,
    getCommandsJSON,
    async execute(client) {
        step("Discord Bot", true, client.user.tag);

        // Nutzer, die bereits im Voice sind, ab jetzt für Zeit-Statistiken tracken
        initVoiceTracking(client);

        // Slash Commands global registrieren
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
        try {
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
            step("Slash Commands", true, `${commands.length} registriert`);
        } catch (e) {
            step("Slash Commands", false, e.message);
        }

        // Verwaiste Voice-Channels beim Neustart aufräumen
        const activeVCs = getAllActiveVoiceChannels();
        for (const vc of activeVCs) {
            const guild = client.guilds.cache.get(vc.guild_id);
            if (!guild) { deleteActiveVoiceChannel(vc.voice_channel_id); continue; }

            const voiceChannel = guild.channels.cache.get(vc.voice_channel_id);
            if (!voiceChannel || voiceChannel.members.filter(m => !m.user.bot).size === 0) {
                await guild.channels.cache.get(vc.voice_channel_id)?.delete().catch(() => {});
                await guild.channels.cache.get(vc.text_channel_id)?.delete().catch(() => {});
                deleteActiveVoiceChannel(vc.voice_channel_id);
            }
        }
    },
};
