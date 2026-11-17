// discord/bot/commands/ausrede.js
const { pickLine } = require('./funLines');
const { botText } = require('../botText');

async function handleAusrede(interaction) {
    await interaction.reply({
        content: pickLine('ausrede', botText(interaction).lang, interaction.channel),
    });
}

module.exports = { handleAusrede };
