// discord/bot/commands/aussehen.js

function rollAussehen() {
    return Math.floor(Math.random() * 10) + 1;
}

async function handleAussehen(interaction) {
    const user = interaction.user;
    const displayName = interaction.guild?.members.cache.get(user.id)?.displayName || user.displayName || user.username;
    const score = rollAussehen();

    await interaction.reply({
        content: `**${displayName}** ist eine **${score}/10**.`,
    });
}

module.exports = { handleAussehen, rollAussehen };
