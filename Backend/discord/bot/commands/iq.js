// discord/bot/commands/iq.js
const { botText } = require('../botText');

// 40–180: ein IQ von 0-10 ist kein Witz mehr, sondern einfach nur Unfug.
function rollIQ() {
    return Math.floor(Math.random() * 141) + 40;
}

async function handleIQ(interaction) {
    const user = interaction.user;
    const displayName = interaction.guild?.members.cache.get(user.id)?.displayName || user.displayName || user.username;

    await interaction.reply({
        content: botText(interaction).fun.iq(displayName, rollIQ()),
    });
}

module.exports = { handleIQ, rollIQ };
