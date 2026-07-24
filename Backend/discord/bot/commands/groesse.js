// discord/bot/commands/groesse.js

async function handleGroesse(interaction) {
    const size = Math.floor(Math.random() * 201);

    await interaction.reply({
        content: `Du bist **${size}cm** groß.`,
    });
}

module.exports = { handleGroesse };
