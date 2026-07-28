// Rundentimer. Jede Lobby hält höchstens EIN laufendes Intervall, abgelegt unter
// lobby.game.timerInterval — die Echtzeitmodi (Elixir Rush, Angel Royale, Dunkles
// Labyrinth) nutzen denselben Slot für ihren Tick-Loop.

const registry = require('./registry');

function clearTurnTimer(lobby) {
  if (lobby.game?.timerInterval) {
    clearInterval(lobby.game.timerInterval);
    lobby.game.timerInterval = null;
  }
}

// Sekundengenauer Zugtimer mit Tick an alle Clients. Nur Snake und Auktion nutzen ihn —
// die übrigen Modi bringen eigene Tick-Loops mit und definieren kein onTimerExpire.
function startTurnTimer(lobby, io) {
  clearTurnTimer(lobby);
  const game = lobby.game;
  game.timerRemaining = lobby.timerSeconds;
  game.timerInterval = setInterval(() => {
    game.timerRemaining--;
    io.to(lobby.code).emit('clash:timerTick', { remaining: game.timerRemaining });
    if (game.timerRemaining <= 0) {
      clearTurnTimer(lobby);
      registry.modeForGame(lobby.game)?.onTimerExpire?.(lobby, io);
    }
  }, 1000);
}

module.exports = { clearTurnTimer, startTurnTimer };
