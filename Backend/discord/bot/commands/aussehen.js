// discord/bot/commands/aussehen.js

async function handleAussehen(interaction) {
    const user = interaction.user;
    const displayName = interaction.guild?.members.cache.get(user.id)?.displayName || user.displayName || user.username;
    const score = Math.floor(Math.random() * 10) + 1;

    await interaction.reply({
        content: `**${displayName}** ist eine **${score}/10**.`,
    });
}

module.exports = { handleAussehen };
