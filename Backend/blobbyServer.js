// blobbyServer.js — Blobby Volley als eigenständiger Node-Prozess.
//
// WARUM ES DIESE DATEI GIBT
// Blobby simuliert server-autoritativ mit 75 Hz. Node rechnet pro Prozess in genau EINEM
// Thread, und im Hauptbackend (index.js) teilen sich diesen Thread der Discord-Bot, das
// Twitch-IRC, der Modus-Scanner und neun SQLite-Stores, die über better-sqlite3 SYNCHRON
// schreiben. Blockiert einer davon den Event-Loop für 120 ms, finden neun Physikframes
// nicht statt — und sie werden auch nicht nachgeholt, sobald die Blockade länger ist als
// das Aufholfenster in `runLoop`. Der Server läuft dann dauerhaft langsamer als Echtzeit,
// während jeder Client mit vollen 75 Hz weiter vorhersagt: die beiden driften auseinander,
// bis der nächste Hard-Snap alles zurückreißt. Auf dem Live-Server gemessen waren es ~50
// statt 75 Frames pro Sekunde, also ein Drittel verlorene Simulationszeit.
//
// Rechenaufwand ist NICHT der Grund: `stepWorld` kostet gemessen 0,44 µs (1v1) bzw. 0,69 µs
// (2v2) pro Frame. Bei 75 Hz sind das rund 0,005 % einer CPU. Was der eigene Prozess bringt,
// ist der eigene Event-Loop — nicht Rechenleistung.
//
// Deshalb braucht es auch keine CPU-Zuweisung: Ein zweiter Prozess wird vom Betriebssystem
// von selbst auf einem freien Kern eingeplant. Feste Bindung (systemd `CPUAffinity=`) lohnt
// erst, wenn mehr rechnende Prozesse als Kerne da sind — siehe deploy/blobby.service.
//
// WAS HIER BEWUSST NICHT DRIN IST
// Kein Express, keine Sessions, keine Datenbank. Blobby hält seinen kompletten Zustand in
// der `games`-Map im Speicher und braucht weder Auth noch Persistenz. Genau deshalb ließ es
// sich überhaupt sauber heraustrennen — die Spiellogik in routes/blobbyRoutes.js bleibt
// dabei unverändert und wird hier nur eingehängt. Was in diesem Prozess läuft, darf niemals
// synchron auf die Platte oder in eine DB greifen; sonst ist der Grund für die Trennung weg.
//
// Ein Neustart beendet laufende Partien: Der Zustand liegt nur im Speicher, und der
// Reconnect-Pfad im Client kann keinen Raum wiederherstellen, den es nicht mehr gibt.

// Bewusst OHNE `override: true` (anders als index.js): In Produktion kommt die Umgebung von
// systemd (`Environment=` in der Unit bzw. `EnvironmentFile=`), und die soll gewinnen. Mit
// override würde eine versehentlich mit hochgeladene .env im Projektordner still die
// Dienstkonfiguration aushebeln — ein Fehler, den man erst am falschen Port bemerkt.
// Fehlt die Datei ganz, tut dotenv nichts; der Server braucht keine Variable zwingend.
require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");
const { registerBlobbySocket, blobbyStats } = require("./routes/blobbyRoutes");

// In `ps`/`htop` sofort erkennbar, und Voraussetzung dafür, den Prozess gezielt
// anzusprechen (Neustart, Affinität, Priorität), ohne die PID zu suchen.
process.title = "blobby-server";

const PORT = Number(process.env.BLOBBY_PORT) || 3002;
// Nur auf Loopback: Erreichbar ist der Prozess ausschließlich über den Reverse Proxy, der
// TLS und die Herkunftsprüfung erledigt. Ein offener Port 3002 im Internet wäre ein zweiter,
// ungeschützter Eingang neben nginx.
const HOST = process.env.BLOBBY_HOST || "127.0.0.1";

const ALLOWED_ORIGINS = [
  "https://vnmvalentin.de",
  "https://www.vnmvalentin.de",
  "http://localhost:5173",
];

// Reine Diagnose: Läuft der Prozess, und hält er seinen Takt? Bewusst ohne Express — ein
// Framework für zwei Routen wäre nur eine weitere Abhängigkeit im Echtzeitpfad.
const server = http.createServer((req, res) => {
  const url = (req.url || "").split("?")[0];
  if (url === "/healthz") {
    const body = JSON.stringify({ ok: true, uptime: Math.round(process.uptime()), ...blobbyStats() });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

// Eigener Pfad statt eigenem Host: Der Browser verbindet sich weiterhin Same-Origin, der
// Proxy entscheidet anhand des Pfades, welcher Prozess gemeint ist. `/socket.io` bleibt
// unverändert beim Hauptserver — Clash Royale, Connect4 und Garden merken von der Trennung
// nichts. Der Pfad muss zu Frontend/src/pages/Blobby/net.js passen.
const io = new Server(server, {
  path: "/blobby-socket",
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
});

io.on("connection", (socket) => {
  registerBlobbySocket(socket, io);
});

server.once("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`[blobby] Port ${PORT} bereits belegt — läuft der Server schon? (BLOBBY_PORT setzt ihn um)`);
  } else {
    console.error("[blobby] Serverfehler:", err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[blobby] Physikserver auf http://${HOST}:${PORT} (socket.io-Pfad /blobby-socket)`);
});

// Beim Beenden zuerst die Verbindungen schließen, damit die Clients ein sauberes
// `disconnect` sehen und in ihren Reconnect-Zustand gehen, statt in einen Timeout zu laufen.
function shutdown(signal) {
  console.log(`[blobby] ${signal} — fahre herunter.`);
  io.close(() => process.exit(0));
  // Notausstieg, falls eine Verbindung nicht zumacht
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
