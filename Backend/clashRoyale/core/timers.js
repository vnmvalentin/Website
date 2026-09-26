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

// Meldet den aktuellen Timerwert sofort an alle Clients. Jeder Timerstart ruft das auf: die
// Modi senden ihren Zustand fast überall VOR dem Start, dann trägt er noch den Restwert der
// vorigen Runde. Ohne diesen Tick blieb die Anzeige bis zum ersten Sekundentick auf dem alten
// Wert stehen und sprang danach auf timerSeconds-1 (die volle Zeit sah man nie).
function emitTimerTick(lobby, io) {
  io.to(lobby.code).emit('clash:timerTick', { remaining: lobby.game.timerRemaining });
}

// Sekundengenauer Zugtimer mit Tick an alle Clients. Nur Snake und Auktion nutzen ihn —
// die übrigen Modi bringen eigene Tick-Loops mit und definieren kein onTimerExpire.
function startTurnTimer(lobby, io) {
  clearTurnTimer(lobby);
  const game = lobby.game;
  game.timerRemaining = lobby.timerSeconds;
  emitTimerTick(lobby, io);
  game.timerInterval = setInterval(() => {
    game.timerRemaining--;
    io.to(lobby.code).emit('clash:timerTick', { remaining: game.timerRemaining });
    if (game.timerRemaining <= 0) {
      clearTurnTimer(lobby);
      registry.modeForGame(lobby.game)?.onTimerExpire?.(lobby, io);
    }
  }, 1000);
}

module.exports = { clearTurnTimer, startTurnTimer, emitTimerTick };
