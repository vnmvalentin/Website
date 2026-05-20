// discord/bot/commands/connect3.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const crypto = require('crypto');

const activeGames = new Map();

function createBoard() {
    return Array(5).fill(null).map(() => Array(5).fill(0));
}

function findLowestEmpty(board, col) {
    for (let r = 4; r >= 0; r--) {
        if (board[r][col] === 0) return r;
    }
    return -1;
}

function checkWin(board, player) {
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            if (board[r][c] !== player) continue;
            // Horizontal
            if (c + 2 < 5 && board[r][c + 1] === player && board[r][c + 2] === player) return true;
            // Vertikal
            if (r + 2 < 5 && board[r + 1][c] === player && board[r + 2][c] === player) return true;
            // Diagonal rechts-unten
            if (r + 2 < 5 && c + 2 < 5 && board[r + 1][c + 1] === player && board[r + 2][c + 2] === player) return true;
            // Diagonal links-unten
            if (r + 2 < 5 && c - 2 >= 0 && board[r + 1][c - 1] === player && board[r + 2][c - 2] === player) return true;
        }
    }
    return false;
}

function isBoardFull(board) {
    return board[0].every(cell => cell !== 0);
}

function buildComponents(gameId, board, gameOver = false) {
    const rows = [];
    for (let r = 0; r < 5; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 5; c++) {
            const cell = board[r][c];
            const lowestEmpty = findLowestEmpty(board, c);
            const isClickable = !gameOver && cell === 0 && r === lowestEmpty;

            let emoji;
            if (cell === 1) emoji = '🔴';
            else if (cell === 2) emoji = '🟡';
            else if (isClickable) emoji = '⬜';
            else emoji = '⬛';

            const btn = new ButtonBuilder()
                .setCustomId(`c3_${gameId}_${r}_${c}`)
                .setEmoji(emoji)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!isClickable);

            row.addComponents(btn);
        }
        rows.push(row);
    }
    return rows;
}

async function handleConnect3(interaction) {
    const opponent = interaction.options.getUser('gegner');

    if (opponent.id === interaction.user.id) {
        return interaction.reply({ content: '❌ Du kannst nicht gegen dich selbst spielen!', flags: MessageFlags.Ephemeral });
    }
    if (opponent.bot) {
        return interaction.reply({ content: '❌ Du kannst nicht gegen einen Bot spielen!', flags: MessageFlags.Ephemeral });
    }

    const gameId = crypto.randomBytes(4).toString('hex');
    const board = createBoard();
    const firstGoesFirst = Math.random() < 0.5;

    const game = {
        player1: firstGoesFirst ? interaction.user.id : opponent.id,
        player2: firstGoesFirst ? opponent.id : interaction.user.id,
        currentPlayer: 1,
        board,
    };

    const p1 = `<@${game.player1}>`;
    const p2 = `<@${game.player2}>`;
    const components = buildComponents(gameId, board);

    const { resource } = await interaction.reply({
        content: `🎮 **Connect 3** — 🔴 ${p1} vs 🟡 ${p2}\n🔴 ${p1} ist am Zug!`,
        components,
        withResponse: true,
    });

    activeGames.set(gameId, game);

    // Spiel nach 30 Minuten automatisch beenden
    setTimeout(() => activeGames.delete(gameId), 30 * 60 * 1000);
}

async function handleConnect3Button(interaction) {
    const parts = interaction.customId.split('_');
    // Format: c3_{gameId}_{row}_{col}
    const gameId = parts[1];
    const col = parseInt(parts[3]);

    const game = activeGames.get(gameId);
    if (!game) {
        return interaction.reply({ content: '❌ Dieses Spiel existiert nicht mehr.', flags: MessageFlags.Ephemeral });
    }

    const currentPlayerId = game.currentPlayer === 1 ? game.player1 : game.player2;
    if (interaction.user.id !== currentPlayerId) {
        return interaction.reply({ content: '❌ Du bist gerade nicht dran!', flags: MessageFlags.Ephemeral });
    }

    const lowestEmpty = findLowestEmpty(game.board, col);
    if (lowestEmpty === -1) {
        return interaction.reply({ content: '❌ Diese Spalte ist voll!', flags: MessageFlags.Ephemeral });
    }

    game.board[lowestEmpty][col] = game.currentPlayer;

    const p1 = `<@${game.player1}>`;
    const p2 = `<@${game.player2}>`;
    const currentEmoji = game.currentPlayer === 1 ? '🔴' : '🟡';
    const currentName = game.currentPlayer === 1 ? p1 : p2;

    if (checkWin(game.board, game.currentPlayer)) {
        const components = buildComponents(gameId, game.board, true);
        await interaction.update({
            content: `🎮 **Connect 3** — 🔴 ${p1} vs 🟡 ${p2}\n🏆 ${currentEmoji} ${currentName} **hat gewonnen!** Glückwunsch!`,
            components,
        });
        activeGames.delete(gameId);
        return;
    }

    if (isBoardFull(game.board)) {
        const components = buildComponents(gameId, game.board, true);
        await interaction.update({
            content: `🎮 **Connect 3** — 🔴 ${p1} vs 🟡 ${p2}\n🤝 **Unentschieden!**`,
            components,
        });
        activeGames.delete(gameId);
        return;
    }

    game.currentPlayer = game.currentPlayer === 1 ? 2 : 1;
    const nextName = game.currentPlayer === 1 ? p1 : p2;
    const nextEmoji = game.currentPlayer === 1 ? '🔴' : '🟡';
    const components = buildComponents(gameId, game.board);

    await interaction.update({
        content: `🎮 **Connect 3** — 🔴 ${p1} vs 🟡 ${p2}\n${nextEmoji} ${nextName} ist am Zug!`,
        components,
    });
}

module.exports = { handleConnect3, handleConnect3Button };
