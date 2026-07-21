// discord/bot/commands/iq.js

async function handleIQ(interaction) {
    const user = interaction.user;
    const displayName = interaction.guild?.members.cache.get(user.id)?.displayName || user.displayName || user.username;
    const iq = Math.floor(Math.random() * 181);

    await interaction.reply({
        content: `**${displayName}**'s IQ liegt bei **${iq}**.`,
    });
}

module.exports = { handleIQ };
