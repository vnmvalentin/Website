// discord/bot/commandDefs.js — die Slash-Befehle des Bots, wie sie bei Discord registriert werden (events/ready.js).
//
// Sprache (Ausbauplan „discord-verzeichnis“): Discord zeigt Befehle in der Sprache der App des Lesers, nicht in der
// des Servers. Beschreibungen sind deshalb standardmäßig Englisch (gilt für alle Sprachen ohne eigene Fassung) und
// haben eine deutsche Fassung für deutsche Apps. Die Befehls- und Optionsnamen bleiben, wie sie waren (/punkte,
// einsatz …) — interactionCreate.js erkennt Befehle an diesem Namen —, englische Apps sehen dazu englische Namen
// (/points, bet …).
//
// Reine Daten ohne Datenbank: der Test (__tests__/verzeichnis.test.js) lädt diese Datei direkt.
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const EN_LOCALES = ['en-US', 'en-GB'];
const enNames = (name) => Object.fromEntries(EN_LOCALES.map((l) => [l, name]));

/**
 * Name, englische Beschreibung, deutsche Beschreibung — und optional ein englischer Name, wenn der Name deutsch ist.
 * Funktioniert für Befehle, Unterbefehle und Optionen (alles mit setName/setDescription).
 */
function named(builder, { name, en, de, enName }) {
    builder.setName(name).setDescription(en).setDescriptionLocalizations({ de });
    if (enName) builder.setNameLocalizations(enNames(enName));
    return builder;
}

const cmd = (def) => named(new SlashCommandBuilder(), def);

const commands = [
    cmd({ name: 'connect3', en: 'Start a Connect 3 game against an opponent!', de: 'Starte ein Connect 3 Spiel gegen einen Gegner!' })
        .addUserOption((o) => named(o, { name: 'gegner', enName: 'opponent', en: 'Pick your opponent', de: 'Wähle deinen Gegner' }).setRequired(true)),
    cmd({ name: 'magische_miesmuschel', enName: 'magic_conch', en: 'Ask the magic conch a yes/no question!', de: 'Frag die magische Miesmuschel eine Ja/Nein Frage!' })
        .addStringOption((o) => named(o, { name: 'frage', enName: 'question', en: 'Your question', de: 'Deine Frage' }).setRequired(true)),
    cmd({ name: 'pp', en: 'Measures your PP in cm.', de: 'Misst deinen PP in cm.' }),
    cmd({ name: 'aussehen', enName: 'looks', en: 'Rates your looks.', de: 'Bewertet dein Aussehen.' }),
    cmd({ name: 'iq', en: 'Measures your IQ.', de: 'Misst deinen IQ.' }),
    cmd({ name: 'größe', enName: 'height', en: 'Measures your height in cm.', de: 'Misst deine Größe in cm.' }),
    cmd({ name: 'gewicht', enName: 'weight', en: 'Measures your weight in kg.', de: 'Misst dein Gewicht in kg.' }),
    cmd({ name: 'ship', en: 'Calculates the love score between two users.', de: 'Berechnet den Liebeswert zwischen zwei Nutzern.' })
        .addUserOption((o) => named(o, { name: 'user1', en: 'First user', de: 'Erster Nutzer' }).setRequired(true))
        .addUserOption((o) => named(o, { name: 'user2', en: 'Second user', de: 'Zweiter Nutzer' }).setRequired(true)),
    cmd({ name: 'coinflip', en: 'Flip a coin — heads or tails?', de: 'Wirf eine Münze — Kopf oder Zahl?' }),
    cmd({ name: 'allstats', en: 'Shows all your fun stats (IQ, height, weight, PP, looks) at a glance.', de: 'Zeigt alle deine Fun-Stats (IQ, Größe, Gewicht, PP, Aussehen) auf einen Blick.' }),
    cmd({ name: 'superkraft', enName: 'superpower', en: 'Grants you a random superpower — mostly useless, sometimes great.', de: 'Verleiht dir eine zufällige Superkraft — meistens nutzlos, manchmal richtig gut.' }),
    cmd({ name: 'ausrede', enName: 'excuse', en: 'Gives you a random excuse for any occasion.', de: 'Liefert dir eine zufällige Ausrede für jede Gelegenheit.' }),

    cmd({ name: 'voicelimit', en: 'Sets the user limit of your voice channel (only in the voice text channel)', de: 'Setzt das Userlimit deines Voice Channels (nur im Voice-Text-Kanal)' })
        .addIntegerOption((o) => named(o, { name: 'limit', en: 'Limit (0 = unlimited)', de: 'Limit (0 = unbegrenzt)' }).setMinValue(0).setMaxValue(99).setRequired(true)),
    cmd({ name: 'voicelock', en: 'Locks or unlocks your voice channel (only in the voice text channel)', de: 'Sperrt oder entsperrt deinen Voice Channel (nur im Voice-Text-Kanal)' }),
    cmd({ name: 'voice_rename', en: 'Renames your voice channel (only in the voice text channel)', de: 'Benennt deinen Voice Channel um (nur im Voice-Text-Kanal)' })
        .addStringOption((o) => named(o, { name: 'name', en: 'New name', de: 'Neuer Name' }).setRequired(true)),
    cmd({ name: 'voice_hide', en: 'Hides your voice channel from others (only in the voice text channel)', de: 'Versteckt deinen Voice Channel vor anderen (nur im Voice-Text-Kanal)' }),
    cmd({ name: 'voice_unhide', en: 'Makes your voice channel visible again (only in the voice text channel)', de: 'Macht deinen Voice Channel wieder sichtbar (nur im Voice-Text-Kanal)' }),
    cmd({ name: 'voice_transfer', en: 'Hands over ownership of your voice channel (only in the voice text channel)', de: 'Übergibt den Besitzer-Status deines Voice Channels (nur im Voice-Text-Kanal)' })
        .addUserOption((o) => named(o, { name: 'user', en: 'New owner (must be in the voice channel)', de: 'Neuer Besitzer (muss im Voice sein)' }).setRequired(true)),
    cmd({ name: 'voice_kick', en: 'Removes a user from your voice channel (only in the voice text channel)', de: 'Wirft einen Nutzer aus deinem Voice Channel (nur im Voice-Text-Kanal)' })
        .addUserOption((o) => named(o, { name: 'user', en: 'User in the voice channel', de: 'Nutzer im Voice Channel' }).setRequired(true)),
    cmd({ name: 'voice_ban', en: 'Removes a user and keeps them from joining (only in the voice text channel)', de: 'Wirft einen Nutzer und hindert ihn am Beitreten (nur im Voice-Text-Kanal)' })
        .addUserOption((o) => named(o, { name: 'user', en: 'User who may no longer join', de: 'Nutzer, der nicht mehr beitreten darf' }).setRequired(true)),
    cmd({ name: 'voice_unban', en: 'Lifts a ban from your voice channel (only in the voice text channel)', de: 'Hebt einen Bann in deinem Voice Channel auf (nur im Voice-Text-Kanal)' })
        .addUserOption((o) => named(o, { name: 'user', en: 'Banned user', de: 'Gebannter Nutzer' }).setRequired(true)),

    cmd({ name: 'serverstats', en: 'Shows the server stats: voice time and messages.', de: 'Zeigt die Server-Statistik: Voice-Zeiten und Nachrichten.' })
        .addIntegerOption((o) => named(o, { name: 'zeitraum', enName: 'period', en: 'Time period (default: 30 days)', de: 'Zeitraum (Standard: 30 Tage)' })
            .addChoices(
                { name: '7 Tage', value: 7, name_localizations: enNames('7 days') },
                { name: '30 Tage', value: 30, name_localizations: enNames('30 days') },
                { name: '90 Tage', value: 90, name_localizations: enNames('90 days') },
            ))
        .addUserOption((o) => named(o, { name: 'user', en: 'Show only this user instead of the leaderboard', de: 'Statt der Rangliste nur diesen Nutzer zeigen' })),
    cmd({ name: 'tagesrennen', enName: 'dailyrace', en: 'Seed Runners: daily leaderboard that keeps itself up to date in this channel.', de: 'Seed Runners: Tagesrangliste, die sich in diesem Kanal selbst aktualisiert.' })
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((s) => named(s, { name: 'setzen', enName: 'set', en: 'Posts the daily leaderboard in this channel and keeps it up to date.', de: 'Postet die Tagesrangliste in diesem Kanal und hält sie aktuell.' }))
        .addSubcommand((s) => named(s, { name: 'entfernen', enName: 'remove', en: 'Removes the daily leaderboard from this server.', de: 'Entfernt die Tagesrangliste von diesem Server.' })),

    // ── Punkte-System (discord/loyalty/games.js) ─────────────────────────────
    cmd({ name: 'punkte', enName: 'points', en: 'Shows your balance and your stats.', de: 'Zeigt deinen Kontostand und deine Statistik.' })
        .addUserOption((o) => named(o, { name: 'user', en: 'Show this user instead of you', de: 'Statt dir diesen Nutzer zeigen' })),
    cmd({ name: 'daily', en: 'Claim your daily bonus — every day in a row gives more.', de: 'Hol dir deinen Tagesbonus — jeder Tag in Folge gibt mehr.' }),
    cmd({ name: 'rangliste', enName: 'leaderboard', en: 'The richest members of the server.', de: 'Die reichsten Mitglieder des Servers.' })
        .addIntegerOption((o) => named(o, { name: 'seite', enName: 'page', en: 'Page (10 per page)', de: 'Seite (10 pro Seite)' }).setMinValue(1)),
    cmd({ name: 'geben', enName: 'give', en: 'Give points to another member.', de: 'Verschenke Punkte an ein anderes Mitglied.' })
        .addUserOption((o) => named(o, { name: 'user', en: 'Who gets them?', de: 'Wer bekommt sie?' }).setRequired(true))
        .addStringOption((o) => named(o, { name: 'betrag', enName: 'amount', en: 'e.g. 100, 1k, half, all', de: 'z. B. 100, 1k, half, all' }).setRequired(true)),
    cmd({ name: 'gamble', en: 'Spin the wheel: green doubles, red is gone, gold is the jackpot (x5).', de: 'Dreh am Glücksrad: Grün verdoppelt, Rot ist weg, Gold ist der Jackpot (x5).' })
        .addStringOption((o) => named(o, { name: 'einsatz', enName: 'bet', en: 'e.g. 100, 1k, half, all, 25%', de: 'z. B. 100, 1k, half, all, 25%' }).setRequired(true)),
    cmd({ name: 'rakete', enName: 'rocket', en: 'Board the rocket — and get off before it explodes.', de: 'Steig in die Rakete — und steig aus, bevor sie explodiert.' })
        .addStringOption((o) => named(o, { name: 'einsatz', enName: 'bet', en: 'e.g. 100, 1k, half, all', de: 'z. B. 100, 1k, half, all' }).setRequired(true))
        .addNumberOption((o) => named(o, { name: 'auto', en: 'Cash out automatically at this multiplier, e.g. 2.5', de: 'Automatisch aussteigen bei diesem Multiplikator, z. B. 2.5' }).setMinValue(1.1).setMaxValue(100)),
    cmd({ name: 'duell', enName: 'duel', en: 'Challenge someone — the coin decides, the winner takes it all.', de: 'Fordere jemanden heraus — die Münze entscheidet, der Gewinner bekommt alles.' })
        .addUserOption((o) => named(o, { name: 'gegner', enName: 'opponent', en: 'Your opponent', de: 'Dein Gegner' }).setRequired(true))
        .addStringOption((o) => named(o, { name: 'einsatz', enName: 'bet', en: 'Bet per person, e.g. 100 or 1k', de: 'Einsatz pro Person, z. B. 100 oder 1k' }).setRequired(true)),
    cmd({ name: 'punkteadmin', enName: 'pointsadmin', en: 'Adjust members\' points (Manage Server).', de: 'Punkte von Mitgliedern anpassen (Server verwalten).' })
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((s) => named(s, { name: 'geben', enName: 'give', en: 'Add points', de: 'Punkte gutschreiben' })
            .addUserOption((o) => named(o, { name: 'user', en: 'Member', de: 'Mitglied' }).setRequired(true))
            .addIntegerOption((o) => named(o, { name: 'betrag', enName: 'amount', en: 'Amount', de: 'Betrag' }).setRequired(true).setMinValue(1)))
        .addSubcommand((s) => named(s, { name: 'nehmen', enName: 'take', en: 'Remove points', de: 'Punkte abziehen' })
            .addUserOption((o) => named(o, { name: 'user', en: 'Member', de: 'Mitglied' }).setRequired(true))
            .addIntegerOption((o) => named(o, { name: 'betrag', enName: 'amount', en: 'Amount', de: 'Betrag' }).setRequired(true).setMinValue(1)))
        .addSubcommand((s) => named(s, { name: 'setzen', enName: 'set', en: 'Set the balance', de: 'Kontostand festlegen' })
            .addUserOption((o) => named(o, { name: 'user', en: 'Member', de: 'Mitglied' }).setRequired(true))
            .addIntegerOption((o) => named(o, { name: 'betrag', enName: 'amount', en: 'New balance', de: 'Neuer Kontostand' }).setRequired(true).setMinValue(0))),
].map((c) => c.toJSON());

module.exports = { commands, EN_LOCALES };
