// discord/bot/commands/superkraft.js
const { pickLine } = require('./funLines');
const { botText } = require('../botText');

async function handleSuperkraft(interaction) {
    await interaction.reply({
        content: pickLine('superkraft', botText(interaction).lang, interaction.channel),
    });
}

module.exports = { handleSuperkraft };
