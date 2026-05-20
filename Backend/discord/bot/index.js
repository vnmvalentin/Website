// discord/bot/index.js
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');

const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Erforderlich für Prefix-Befehle
        GatewayIntentBits.GuildMembers,   // Erforderlich für Welcome-Nachrichten
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates, // NEU: Erforderlich für Reaktionsrollen
    ],
    // NEU: Partials erlauben dem Bot, auf Reactions von Nachrichten zu hören, 
    // die vor dem Start des Bots gesendet wurden (ungecachte Nachrichten).
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction
    ]
});

// Lade alle Events automatisch aus dem Unterordner "events"
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        if (event.once) {
            discordClient.once(event.name, (...args) => event.execute(...args, discordClient));
        } else {
            discordClient.on(event.name, (...args) => event.execute(...args, discordClient));
        }
    }
} else {
    console.warn("Der Ordner discord/bot/events existiert noch nicht!");
}

// Bot einloggen
discordClient.login(process.env.DISCORD_BOT_TOKEN);

module.exports = discordClient;