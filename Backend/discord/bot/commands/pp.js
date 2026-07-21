// discord/bot/commands/pp.js

async function handlePP(interaction) {
    const size = Math.floor(Math.random() * 25) + 1;

    await interaction.reply({
        content: `Dein PP ist **${size}cm** groß.`,
    });
}

module.exports = { handlePP };
