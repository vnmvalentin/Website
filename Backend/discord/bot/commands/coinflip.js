// discord/bot/commands/coinflip.js

async function handleCoinflip(interaction) {
    const result = Math.random() < 0.5 ? 'Kopf' : 'Zahl';
    const emoji = result === 'Kopf' ? '👑' : '🔢';

    await interaction.reply({
        content: `🪙 Die Münze landet auf... **${result}** ${emoji}`,
    });
}

module.exports = { handleCoinflip };
