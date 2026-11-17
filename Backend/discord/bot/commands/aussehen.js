// discord/bot/commands/aussehen.js
const { botText } = require('../botText');

function rollAussehen() {
    return Math.floor(Math.random() * 10) + 1;
}

async function handleAussehen(interaction) {
    const user = interaction.user;
    const displayName = interaction.guild?.members.cache.get(user.id)?.displayName || user.displayName || user.username;

    await interaction.reply({
        content: botText(interaction).fun.looks(displayName, rollAussehen()),
    });
}

module.exports = { handleAussehen, rollAussehen };
