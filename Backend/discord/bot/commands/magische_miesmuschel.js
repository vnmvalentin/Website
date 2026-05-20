// discord/bot/commands/magische_miesmuschel.js
const ANSWERS = [
    'Ja!',
    'Nein!',
    'Definitiv ja!',
    'Eher nicht.',
    'Auf keinen Fall!',
    'Die Zeichen deuten auf Ja.',
    'Die Zeichen deuten auf Nein.',
    'Frag nochmal später.',
    'Ganz sicher!',
    'Zweifellos!',
    'Meine Quellen sagen Nein.',
    'Sehr wahrscheinlich.',
    'Sehr unwahrscheinlich.',
    'Besser nicht zu wissen.',
    'Konzentriere dich und frag nochmal.',
    'Ja, vertrau mir!',
    'Ich bezweifle es stark.',
    'Ohne Frage — ja!',
];

async function handleMiesmuschel(interaction) {
    const frage = interaction.options.getString('frage');
    const answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];

    await interaction.reply({
        content: `🐚 **Magische Miesmuschel**\n❓ *${frage}*\n\n🔮 **${answer}**`,
    });
}

module.exports = { handleMiesmuschel };
