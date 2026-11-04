// discord/bot/events/ready.js
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
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
        .setDescription('Misst deinen PP in cm.'),
    new SlashCommandBuilder()
        .setName('aussehen')
        .setDescription('Bewertet dein Aussehen.'),
    new SlashCommandBuilder()
        .setName('iq')
        .setDescription('Misst deinen IQ.'),
    new SlashCommandBuilder()
        .setName('größe')
        .setDescription('Misst deine Größe in cm.'),
    new SlashCommandBuilder()
        .setName('gewicht')
        .setDescription('Misst dein Gewicht in kg.'),
    new SlashCommandBuilder()
        .setName('ship')
        .setDescription('Berechnet den Liebeswert zwischen zwei Nutzern.')
        .addUserOption(opt => opt.setName('user1').setDescription('Erster Nutzer').setRequired(true))
        .addUserOption(opt => opt.setName('user2').setDescription('Zweiter Nutzer').setRequired(true)),
    new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Wirf eine Münze — Kopf oder Zahl?'),
    new SlashCommandBuilder()
        .setName('allstats')
        .setDescription('Zeigt alle deine Fun-Stats (IQ, Größe, Gewicht, PP, Aussehen) auf einen Blick.'),
    new SlashCommandBuilder()
        .setName('superkraft')
        .setDescription('Verleiht dir eine zufällige Superkraft — meistens nutzlos, manchmal richtig gut.'),
    new SlashCommandBuilder()
        .setName('ausrede')
        .setDescription('Liefert dir eine zufällige Ausrede für jede Gelegenheit.'),
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
    new SlashCommandBuilder()
        .setName('voice_kick')
        .setDescription('Wirft einen Nutzer aus deinem Voice Channel (nur im Voice-Text-Kanal)')
        .addUserOption(opt => opt.setName('user').setDescription('Nutzer im Voice Channel').setRequired(true)),
    new SlashCommandBuilder()
        .setName('voice_ban')
        .setDescription('Wirft einen Nutzer und hindert ihn am Beitreten (nur im Voice-Text-Kanal)')
        .addUserOption(opt => opt.setName('user').setDescription('Nutzer, der nicht mehr beitreten darf').setRequired(true)),
    new SlashCommandBuilder()
        .setName('voice_unban')
        .setDescription('Hebt einen Bann in deinem Voice Channel auf (nur im Voice-Text-Kanal)')
        .addUserOption(opt => opt.setName('user').setDescription('Gebannter Nutzer').setRequired(true)),
    new SlashCommandBuilder()
        .setName('serverstats')
        .setDescription('Zeigt die Server-Statistik: Voice-Zeiten und Nachrichten.')
        .addIntegerOption(opt =>
            opt.setName('zeitraum').setDescription('Zeitraum (Standard: 30 Tage)')
                .addChoices({ name: '7 Tage', value: 7 }, { name: '30 Tage', value: 30 }, { name: '90 Tage', value: 90 })
        )
        .addUserOption(opt => opt.setName('user').setDescription('Statt der Rangliste nur diesen Nutzer zeigen')),
    new SlashCommandBuilder()
        .setName('tagesrennen')
        .setDescription('Seed Runners: Tagesrangliste, die sich in diesem Kanal selbst aktualisiert.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub.setName('setzen').setDescription('Postet die Tagesrangliste in diesem Kanal und hält sie aktuell.'))
        .addSubcommand(sub => sub.setName('entfernen').setDescription('Entfernt die Tagesrangliste von diesem Server.')),

    // ── Punkte-System (discord/loyalty/games.js) ─────────────────────────────
    new SlashCommandBuilder()
        .setName('punkte')
        .setDescription('Zeigt deinen Kontostand und deine Statistik.')
        .addUserOption(opt => opt.setName('user').setDescription('Statt dir diesen Nutzer zeigen')),
    new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Hol dir deinen Tagesbonus — jeder Tag in Folge gibt mehr.'),
    new SlashCommandBuilder()
        .setName('rangliste')
        .setDescription('Die reichsten Mitglieder des Servers.')
        .addIntegerOption(opt => opt.setName('seite').setDescription('Seite (10 pro Seite)').setMinValue(1)),
    new SlashCommandBuilder()
        .setName('geben')
        .setDescription('Verschenke Punkte an ein anderes Mitglied.')
        .addUserOption(opt => opt.setName('user').setDescription('Wer bekommt sie?').setRequired(true))
        .addStringOption(opt => opt.setName('betrag').setDescription('z. B. 100, 1k, half, all').setRequired(true)),
    new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Dreh am Glücksrad: Grün verdoppelt, Rot ist weg, Gold ist der Jackpot (x5).')
        .addStringOption(opt => opt.setName('einsatz').setDescription('z. B. 100, 1k, half, all, 25%').setRequired(true)),
    new SlashCommandBuilder()
        .setName('rakete')
        .setDescription('Steig in die Rakete — und steig aus, bevor sie explodiert.')
        .addStringOption(opt => opt.setName('einsatz').setDescription('z. B. 100, 1k, half, all').setRequired(true))
        .addNumberOption(opt => opt.setName('auto').setDescription('Automatisch aussteigen bei diesem Multiplikator, z. B. 2.5').setMinValue(1.1).setMaxValue(100)),
    new SlashCommandBuilder()
        .setName('duell')
        .setDescription('Fordere jemanden heraus — die Münze entscheidet, der Gewinner bekommt alles.')
        .addUserOption(opt => opt.setName('gegner').setDescription('Dein Gegner').setRequired(true))
        .addStringOption(opt => opt.setName('einsatz').setDescription('Einsatz pro Person, z. B. 100 oder 1k').setRequired(true)),
    new SlashCommandBuilder()
        .setName('punkteadmin')
        .setDescription('Punkte von Mitgliedern anpassen (Server verwalten).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub.setName('geben').setDescription('Punkte gutschreiben')
            .addUserOption(opt => opt.setName('user').setDescription('Mitglied').setRequired(true))
            .addIntegerOption(opt => opt.setName('betrag').setDescription('Betrag').setRequired(true).setMinValue(1)))
        .addSubcommand(sub => sub.setName('nehmen').setDescription('Punkte abziehen')
            .addUserOption(opt => opt.setName('user').setDescription('Mitglied').setRequired(true))
            .addIntegerOption(opt => opt.setName('betrag').setDescription('Betrag').setRequired(true).setMinValue(1)))
        .addSubcommand(sub => sub.setName('setzen').setDescription('Kontostand festlegen')
            .addUserOption(opt => opt.setName('user').setDescription('Mitglied').setRequired(true))
            .addIntegerOption(opt => opt.setName('betrag').setDescription('Neuer Kontostand').setRequired(true).setMinValue(0))),
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
