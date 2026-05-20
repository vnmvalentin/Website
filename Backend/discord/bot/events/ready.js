// discord/bot/events/ready.js
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { getAllActiveVoiceChannels, deleteActiveVoiceChannel } = require('../../database/db');

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
].map(cmd => cmd.toJSON());

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        console.log(`🤖 Discord Bot eingeloggt als ${client.user.tag}`);

        // Slash Commands global registrieren
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
        try {
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
            console.log('✅ Slash Commands global registriert!');
        } catch (e) {
            console.error('❌ Fehler beim Registrieren der Slash Commands:', e);
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
