// discord/bot/commands/pp.js
const { botText } = require('../botText');

function rollPP() {
    return Math.floor(Math.random() * 25) + 1;
}

async function handlePP(interaction) {
    await interaction.reply({
        content: botText(interaction).fun.pp(rollPP()),
    });
}

module.exports = { handlePP, rollPP };
