// discord/bot/commands/pp.js
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../../data/pp_data.json');

function loadData() {
    if (!fs.existsSync(DATA_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
        return {};
    }
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

async function handlePP(interaction) {
    const userId = interaction.user.id;
    const today = getTodayString();
    const data = loadData();

    if (data[userId] && data[userId].date === today) {
        const size = data[userId].size;
        const nextTs = getNextMidnightUnix();
        return interaction.reply({
            content: `🍆 Dein PP ist **${size}cm** groß.\n*(Nächste Messung möglich: <t:${nextTs}:R>)*`,
        });
    }

    const size = Math.floor(Math.random() * 25) + 1;
    data[userId] = { size, date: today };
    saveData(data);

    await interaction.reply({
        content: `🍆 Dein PP ist **${size}cm** groß.`,
    });
}

module.exports = { handlePP };
