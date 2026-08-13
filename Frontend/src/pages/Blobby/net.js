// Verbindung zum Blobby-Server.
//
// Blobby läuft NICHT im Hauptbackend, sondern als eigener Node-Prozess
// (`Backend/blobbyServer.js`). Grund ist der Event-Loop, nicht die CPU-Last: Node rechnet
// pro Prozess in einem einzigen Thread, und im Hauptprozess teilen sich Discord-Bot,
// Twitch-IRC und neun synchrone SQLite-Stores diesen Thread. Blockiert einer davon 120 ms,
// finden neun Physikframes schlicht nicht statt — der Server simuliert dann dauerhaft
// langsamer als Echtzeit, während der Client mit 75 Hz weiterrechnet. Gemessen liefen auf
// dem Live-Server nur ~50 statt 75 Frames pro Sekunde.
//
// Erreichbar ist der zweite Prozess über einen EIGENEN socket.io-Pfad, nicht über einen
// eigenen Host: In der Entwicklung leitet der Vite-Proxy `/blobby-socket` auf Port 3002
// (vite.config.js), in Produktion tut das nginx. Damit bleibt die Verbindung Same-Origin —
// ein absoluter Host würde CORS und die Cookie-Regeln unnötig aufmachen, und `/socket.io`
// bleibt unverändert beim Hauptserver für alles andere (Clash Royale, Connect4, Garden).
export const BLOBBY_SOCKET_PATH = "/blobby-socket";

export const BLOBBY_SOCKET_OPTS = {
  path: BLOBBY_SOCKET_PATH,
  transports: ["websocket", "polling"],
};
