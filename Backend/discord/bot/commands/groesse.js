// discord/bot/commands/groesse.js
const { botText } = require('../botText');

// 120–220 cm: 0cm/1cm-Ergebnisse waren unrealistisch/nicht witzig, sondern nur Datenmüll.
function rollGroesse() {
    return Math.floor(Math.random() * 101) + 120;
}

async function handleGroesse(interaction) {
    await interaction.reply({
        content: botText(interaction).fun.height(rollGroesse()),
    });
}

module.exports = { handleGroesse, rollGroesse };
