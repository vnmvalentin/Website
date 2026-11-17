// discord/bot/commands/gewicht.js
const { botText } = require('../botText');

// 30–200 kg: Werte nahe 0 waren unrealistisch für ein Gewicht.
function rollGewicht() {
    return Math.floor(Math.random() * 171) + 30;
}

async function handleGewicht(interaction) {
    await interaction.reply({
        content: botText(interaction).fun.weight(rollGewicht()),
    });
}

module.exports = { handleGewicht, rollGewicht };
