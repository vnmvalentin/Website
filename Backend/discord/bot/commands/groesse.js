// discord/bot/commands/groesse.js

// 120–220 cm: 0cm/1cm-Ergebnisse waren unrealistisch/nicht witzig, sondern nur Datenmüll.
function rollGroesse() {
    return Math.floor(Math.random() * 101) + 120;
}

async function handleGroesse(interaction) {
    const size = rollGroesse();

    await interaction.reply({
        content: `Du bist **${size}cm** groß.`,
    });
}

module.exports = { handleGroesse, rollGroesse };
