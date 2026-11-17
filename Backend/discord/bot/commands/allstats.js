// discord/bot/commands/allstats.js
// Zeigt alle Fun-Command-Stats eines Nutzers gesammelt untereinander an,
// statt dass man iq/größe/gewicht/pp/aussehen einzeln durchklicken muss.
const { rollIQ } = require('./iq');
const { rollGroesse } = require('./groesse');
const { rollGewicht } = require('./gewicht');
const { rollPP } = require('./pp');
const { rollAussehen } = require('./aussehen');
const { botText } = require('../botText');

async function handleAllStats(interaction) {
    const user = interaction.user;
    const displayName = interaction.guild?.members.cache.get(user.id)?.displayName || user.displayName || user.username;
    const t = botText(interaction).fun;
    const label = t.statLabels;

    const rows = [
        ['🧠', label.iq, `${rollIQ()}`],
        ['📏', label.height, `${rollGroesse()}cm`],
        ['⚖️', label.weight, `${rollGewicht()}kg`],
        ['📐', label.pp, `${rollPP()}cm`],
        ['👀', label.looks, `${rollAussehen()}/10`],
    ];

    const labelWidth = Math.max(...rows.map(([, l]) => l.length));
    const lines = rows.map(([emoji, l, value]) => `${emoji} \`${l.padEnd(labelWidth, ' ')}\`  **${value}**`);

    await interaction.reply({
        content: `${t.allStatsTitle(displayName)}\n\n${lines.join('\n')}`,
    });
}

module.exports = { handleAllStats };
