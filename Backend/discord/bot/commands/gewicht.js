// discord/bot/commands/gewicht.js

// 30–200 kg: Werte nahe 0 waren unrealistisch für ein Gewicht.
function rollGewicht() {
    return Math.floor(Math.random() * 171) + 30;
}

async function handleGewicht(interaction) {
    const weight = rollGewicht();

    await interaction.reply({
        content: `Du wiegst **${weight}kg**.`,
    });
}

module.exports = { handleGewicht, rollGewicht };
