// discord/bot/commands/coinflip.js
const { botText } = require('../botText');

async function handleCoinflip(interaction) {
    const t = botText(interaction).fun;
    const heads = Math.random() < 0.5;

    await interaction.reply({
        content: t.coin(heads ? t.heads : t.tails, heads ? '👑' : '🔢'),
    });
}

module.exports = { handleCoinflip };
