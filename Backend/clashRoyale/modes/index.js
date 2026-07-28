// Sammelstelle der Spielmodi. Jede Datei meldet sich beim Laden selbst per
// registerMode() an der Registry an — hier reicht deshalb das require.
//
// Ein neuer Modus braucht genau zwei Handgriffe: eine Datei mit registerMode({…})
// und eine Zeile hier. Lobby-Einstellungen, Startbedingung, Spielstand-Übertragung,
// Reconnect-Umhängen und modus-eigene Socket-Events kommen alle aus dem Deskriptor.

require('./snakeRoyale');
require('./elixirAuction');
require('./bingoRoyale');
require('./shadowCarousel');
require('./elixirRush');
require('./cardEvolution');
require('./angelRoyale');
require('./darkMaze');
