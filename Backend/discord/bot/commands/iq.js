// discord/bot/commands/iq.js
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../../data/iq_data.json');

function loadData() {
    if (!fs.existsSync(DATA_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return {}; }
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

function getNextMidnightUnix() {
    const next = new Date();
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(0, 0, 0, 0);
    return Math.floor(next.getTime() / 1000);
}

async function handleIQ(interaction) {
    const user = interaction.user;
    const displayName = interaction.guild?.members.cache.get(user.id)?.displayName || user.displayName || user.username;
    const today = getTodayString();
    const data = loadData();

    if (data[user.id] && data[user.id].date === today) {
        const iq = data[user.id].iq;
        return interaction.reply({
            content: `Immer noch **${iq} IQ**, ${displayName}. Nächste Messung: <t:${getNextMidnightUnix()}:R>`,
        });
    }

    const iq = Math.floor(Math.random() * 181);
    data[user.id] = { iq, date: today };
    saveData(data);

    await interaction.reply({
        content: `**${displayName}**'s IQ liegt heute bei **${iq}**.`,
    });
}

module.exports = { handleIQ };
