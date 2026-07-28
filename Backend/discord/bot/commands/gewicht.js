// discord/bot/commands/gewicht.js

async function handleGewicht(interaction) {
    const weight = Math.floor(Math.random() * 201);

    await interaction.reply({
        content: `Du wiegst **${weight}kg**.`,
    });
}

module.exports = { handleGewicht };
