// discord/bot/commands/magische_miesmuschel.js
//
// Der Befehl ist als Ja/Nein-Frage angekündigt, also gibt die Muschel auch immer
// eine Antwort. Die Ausweicher des klassischen Magic 8 Ball („Frag nochmal
// später", „Konzentriere dich und frag nochmal", „Besser nicht zu wissen") sind
// bewusst raus: wer fragt, hat sich schon konzentriert und will keine Vertröstung.
//
// Die Antworten stehen je Sprache in botTexts.js (fun.conchAnswers): Ja und Nein mit je zehn Antworten gleich oft
// im Topf — eine Muschel, die erkennbar öfter „Ja" sagt, ist als Orakel wertlos.
const { botText } = require('../botText');

async function handleMiesmuschel(interaction) {
    const t = botText(interaction).fun;
    const frage = interaction.options.getString('frage');
    const answer = t.conchAnswers[Math.floor(Math.random() * t.conchAnswers.length)];

    await interaction.reply({
        content: `🐚 **${t.conchTitle}**\n❓ *${frage}*\n\n🔮 **${answer}**`,
    });
}

module.exports = { handleMiesmuschel };
