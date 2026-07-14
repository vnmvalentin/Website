// discord/bot/commands/ship.js

function generateShipName(name1, name2) {
    const half1 = name1.substring(0, Math.ceil(name1.length / 2));
    const half2 = name2.substring(Math.floor(name2.length / 2));
    return (half1 + half2).charAt(0).toUpperCase() + (half1 + half2).slice(1).toLowerCase();
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

function getShipPercent(id1, id2) {
    const combined = [...[id1, id2].sort(), getTodayString()].join('');
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) - hash) + combined.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % 101;
}

function getShipEmoji(percent) {
    if (percent >= 90) return '💘';
    if (percent >= 70) return '❤️';
    if (percent >= 50) return '💛';
    if (percent >= 30) return '🤝';
    return '💔';
}

async function handleShip(interaction) {
    const user1 = interaction.options.getUser('user1');
    const user2 = interaction.options.getUser('user2');

    if (user1.id === user2.id) {
        return interaction.reply({ content: '🚢 Man kann sich nicht mit sich selbst shippen!' });
    }

    const percent = getShipPercent(user1.id, user2.id);
    const shipName = generateShipName(user1.displayName || user1.username, user2.displayName || user2.username);
    const emoji = getShipEmoji(percent);
    const bar = buildBar(percent);

    const nextTs = getNextMidnightUnix();
    await interaction.reply({
        content: [
            `${emoji} **Ship-Ergebnis**`,
            ``,
            `👤 **${user1.displayName || user1.username}** + **${user2.displayName || user2.username}**`,
            ``,
            `${bar} **${percent}%**`,
            ``,
            `*(Neues Ergebnis: <t:${nextTs}:R>)*`,
        ].join('\n'),
    });
}

function buildBar(percent) {
    const filled = Math.round(percent / 10);
    return '🟥'.repeat(filled) + '⬛'.repeat(10 - filled);
}

module.exports = { handleShip };
