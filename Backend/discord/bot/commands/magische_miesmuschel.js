// discord/bot/commands/magische_miesmuschel.js
//
// Der Befehl ist als Ja/Nein-Frage angekündigt, also gibt die Muschel auch immer
// eine Antwort. Die Ausweicher des klassischen Magic 8 Ball („Frag nochmal
// später", „Konzentriere dich und frag nochmal", „Besser nicht zu wissen") sind
// bewusst raus: wer fragt, hat sich schon konzentriert und will keine Vertröstung.
//
// Ja und Nein stehen mit je zehn Antworten gleich oft im Topf — eine Muschel, die
// erkennbar öfter „Ja" sagt, ist als Orakel wertlos.
const ANSWERS = [
    // Ja
    'Ja!',
    'Definitiv ja!',
    'Die Zeichen deuten auf Ja.',
    'Ganz sicher!',
    'Zweifellos!',
    'Sehr wahrscheinlich.',
    'Ja, vertrau mir!',
    'Ohne Frage — ja!',
    'Darauf kannst du wetten.',
    'Meine Quellen sagen Ja.',
    // Nein
    'Nein!',
    'Eher nicht.',
    'Auf keinen Fall!',
    'Die Zeichen deuten auf Nein.',
    'Meine Quellen sagen Nein.',
    'Sehr unwahrscheinlich.',
    'Ich bezweifle es stark.',
    'Ganz sicher nicht.',
    'Vergiss es.',
    'Das wird nichts.',
];

async function handleMiesmuschel(interaction) {
    const frage = interaction.options.getString('frage');
    const answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];

    await interaction.reply({
        content: `🐚 **Magische Miesmuschel**\n❓ *${frage}*\n\n🔮 **${answer}**`,
    });
}

module.exports = { handleMiesmuschel };
