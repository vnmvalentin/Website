// discord/bot/commands/superkraft.js
const SUPERKRAEFTE = require('./data/superkraefte');

async function handleSuperkraft(interaction) {
    const kraft = SUPERKRAEFTE[Math.floor(Math.random() * SUPERKRAEFTE.length)];

    await interaction.reply({
        content: kraft,
    });
}

module.exports = { handleSuperkraft };
