// discord/bot/commands/ausrede.js
const AUSREDEN = require('./data/ausreden');

async function handleAusrede(interaction) {
    const ausrede = AUSREDEN[Math.floor(Math.random() * AUSREDEN.length)];

    await interaction.reply({
        content: ausrede,
    });
}

module.exports = { handleAusrede };
