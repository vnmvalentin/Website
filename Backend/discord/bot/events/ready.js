// discord/bot/events/ready.js
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { getAllActiveVoiceChannels, deleteActiveVoiceChannel } = require('../../database/db');
const { initVoiceTracking } = require('./voiceStateUpdate');
const { step } = require('../../../lib/startupLog');

const commands = [
    new SlashCommandBuilder()
        .setName('connect3')
        .setDescription('Starte ein Connect 3 Spiel gegen einen Gegner!')
        .addUserOption(opt => opt.setName('gegner').setDescription('Wähle deinen Gegner').setRequired(true)),
    new SlashCommandBuilder()
        .setName('magische_miesmuschel')
        .setDescription('Frag die magische Miesmuschel eine Ja/Nein Frage!')
        .addStringOption(opt => opt.setName('frage').setDescription('Deine Frage').setRequired(true)),
    new SlashCommandBuilder()
        .setName('pp')
        .setDescription('Misst deinen PP für heute. Täglich neu!'),
    new SlashCommandBuilder()
        .setName('aussehen')
        .setDescription('Bewertet dein Aussehen für heute. Täglich neu!'),
    new SlashCommandBuilder()
        .setName('iq')
        .setDescription('Misst deinen IQ für heute. Täglich neu!'),
    new SlashCommandBuilder()
        .setName('ship')
        .setDescription('Berechnet den Liebeswert zwischen zwei Nutzern.')
        .addUserOption(opt => opt.setName('user1').setDescription('Erster Nutzer').setRequired(true))
        .addUserOption(opt => opt.setName('user2').setDescription('Zweiter Nutzer').setRequired(true)),
    new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Wirf eine Münze — Kopf oder Zahl?'),
    new SlashCommandBuilder()
        .setName('voicelimit')
        .setDescription('Setzt das Userlimit deines Voice Channels (nur im Voice-Text-Kanal)')
        .addIntegerOption(opt =>
            opt.setName('limit').setDescription('Limit (0 = unbegrenzt)').setMinValue(0).setMaxValue(99).setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('voicelock')
        .setDescription('Sperrt oder entsperrt deinen Voice Channel (nur im Voice-Text-Kanal)'),
    new SlashCommandBuilder()
        .setName('voice_rename')
        .setDescription('Benennt deinen Voice Channel um (nur im Voice-Text-Kanal)')
        .addStringOption(opt => opt.setName('name').setDescription('Neuer Name').setRequired(true)),
    new SlashCommandBuilder()
        .setName('voice_hide')
        .setDescription('Versteckt deinen Voice Channel vor anderen (nur im Voice-Text-Kanal)'),
    new SlashCommandBuilder()
        .setName('voice_unhide')
        .setDescription('Macht deinen Voice Channel wieder sichtbar (nur im Voice-Text-Kanal)'),
    new SlashCommandBuilder()
        .setName('voice_transfer')
        .setDescription('Übergibt den Besitzer-Status deines Voice Channels (nur im Voice-Text-Kanal)')
        .addUserOption(opt => opt.setName('user').setDescription('Neuer Besitzer (muss im Voice sein)').setRequired(true)),
].map(cmd => cmd.toJSON());

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
