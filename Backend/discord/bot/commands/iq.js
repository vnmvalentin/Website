// discord/bot/commands/iq.js

// 40–180: ein IQ von 0-10 ist kein Witz mehr, sondern einfach nur Unfug.
function rollIQ() {
    return Math.floor(Math.random() * 141) + 40;
}

async function handleIQ(interaction) {
    const user = interaction.user;
    const displayName = interaction.guild?.members.cache.get(user.id)?.displayName || user.displayName || user.username;
    const iq = rollIQ();

    await interaction.reply({
        content: `**${displayName}**'s IQ liegt bei **${iq}**.`,
    });
}

module.exports = { handleIQ, rollIQ };
