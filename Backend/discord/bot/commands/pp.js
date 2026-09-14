// discord/bot/commands/pp.js

function rollPP() {
    return Math.floor(Math.random() * 25) + 1;
}

async function handlePP(interaction) {
    const size = rollPP();

    await interaction.reply({
        content: `Dein PP ist **${size}cm** groß.`,
    });
}

module.exports = { handlePP, rollPP };
