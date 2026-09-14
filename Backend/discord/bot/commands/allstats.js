// discord/bot/commands/allstats.js
// Zeigt alle Fun-Command-Stats eines Nutzers gesammelt untereinander an,
// statt dass man iq/größe/gewicht/pp/aussehen einzeln durchklicken muss.
const { rollIQ } = require('./iq');
const { rollGroesse } = require('./groesse');
const { rollGewicht } = require('./gewicht');
const { rollPP } = require('./pp');
const { rollAussehen } = require('./aussehen');

async function handleAllStats(interaction) {
    const user = interaction.user;
    const displayName = interaction.guild?.members.cache.get(user.id)?.displayName || user.displayName || user.username;

    const rows = [
        ['🧠', 'IQ', `${rollIQ()}`],
        ['📏', 'Größe', `${rollGroesse()}cm`],
        ['⚖️', 'Gewicht', `${rollGewicht()}kg`],
        ['📐', 'PP', `${rollPP()}cm`],
        ['👀', 'Aussehen', `${rollAussehen()}/10`],
    ];

    const labelWidth = Math.max(...rows.map(([, label]) => label.length));
    const lines = rows.map(([emoji, label, value]) => `${emoji} \`${label.padEnd(labelWidth, ' ')}\`  **${value}**`);

    await interaction.reply({
        content: `📊 **Alle Stats von ${displayName}**\n\n${lines.join('\n')}`,
    });
}

module.exports = { handleAllStats };
