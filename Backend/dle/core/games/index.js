// index.js — Katalog der -dle-Spielmodule mit tatsächlicher Serverlogik.
//
// Nur Spiele mit einer echten Runden-/Punkte-Implementierung stehen hier drin. Die
// restlichen "kommt noch"-Spiele aus dem Frontend-Hub (Frontend/src/pages/Dle/gamesConfig.js)
// tauchen absichtlich NICHT hier auf — ein GET .../rounds für sie soll 404 liefern, nicht
// leere Platzhalterdaten vortäuschen.
const tempdle = require('./tempdle');
const velocidle = require('./velocidle');
const probabildle = require('./probabildle');
const duratidle = require('./duratidle');
const inventiondle = require('./inventiondle');
const pricedle = require('./pricedle');
const balancdle = require('./balancdle');

const GAMES = { tempdle, velocidle, probabildle, duratidle, inventiondle, pricedle, balancdle };

function getGame(gameId) {
  return GAMES[gameId] || null;
}

module.exports = { getGame, GAMES };
