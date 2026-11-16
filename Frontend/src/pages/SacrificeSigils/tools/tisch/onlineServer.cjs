// Prüf-Server für Online-Matches am neuen Tisch (tools/tisch/online.cjs): NUR die Raum-Logik von Sacrifice & Sigils
// über Socket.io — kein Discord-Bot, kein Twitch, keine Datenbank. Der Vite-Dev-Server leitet /socket.io an
// 127.0.0.1:3001 weiter, deshalb lauscht dieser Server dort (anderer Port: SS_PORT). Danach wieder beenden.
//
// Zusätzlich zwei Hilfen, damit ein Test nicht erst Draft und Pfad von Hand durchklicken muss:
//   GET /auto?code=ABCDE&turn=2   die KI spielt für beide, bis der Kampf in Zug ≥ turn ist → { phase, turn, active }
//   GET /step?code=ABCDE&seat=1&n=6   bis zu n KI-Aktionen für einen Platz, solange er am Zug ist → { done, active }
const path = require("path");
const http = require("http");
const { pathToFileURL } = require("url");

const BACKEND = path.resolve(__dirname, "../../../../../../Backend");
const { Server } = require(path.join(BACKEND, "node_modules", "socket.io"));
const { createRoomManager } = require(path.join(BACKEND, "sacrificeSigils", "roomManager"));
const PORT = Number(process.env.SS_PORT || 3001);

(async () => {
  const shared = path.join(BACKEND, "sacrificeSigils", "shared");
  const engine = await import(pathToFileURL(path.join(shared, "engine", "index.js")).href);
  const { ENGINE_FINGERPRINT } = await import(pathToFileURL(path.join(shared, "version.js")).href);
  let manager = null;
  const rng = { rng: 5 };

  /** Eine KI-Aktion für den Platz p über den Manager; klappt sie nicht, läuft seine Zeit ab. */
  const aiStep = (room, p) => {
    const a = engine.aiAction(room.match, p, "normal", rng);
    const { player, ...rest } = a || {};
    void player;
    const res = a ? manager.action(room.seats[p].socketId, { action: rest }) : { ok: false };
    if (!res.ok) {
      room.deadlines[p] = { key: "pruefstand", at: 0, total: 1 };
      manager.tick();
    }
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const room = manager.rooms.get(String(url.searchParams.get("code") || "").toUpperCase());
    const reply = (obj) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (!room || !room.match) return reply({ error: "kein Raum oder kein Match" });
    const info = () => ({ phase: room.match.phase, turn: room.match.battle?.turn ?? null, active: room.match.battle?.active ?? null });
    if (url.pathname === "/auto") {
      const turn = Number(url.searchParams.get("turn") || 1);
      for (let guard = 0; guard < 3000 && room.match.phase !== "over" && !(room.match.phase === "battle" && room.match.battle.turn >= turn); guard++) {
        aiStep(room, engine.awaiting(room.match)[0]);
      }
      return reply(info());
    }
    if (url.pathname === "/step") {
      const seat = Number(url.searchParams.get("seat") || 0);
      const n = Number(url.searchParams.get("n") || 1);
      let done = 0;
      while (done < n && room.match.phase === "battle" && engine.awaiting(room.match).includes(seat)) { aiStep(room, seat); done++; }
      return reply({ done, ...info() });
    }
    return reply(info());
  });
  const io = new Server(server, { path: "/socket.io" });
  manager = createRoomManager({ engine, fingerprint: ENGINE_FINGERPRINT, send: (id, ev, payload) => io.to(id).emit(ev, payload) });
  setInterval(() => manager.tick(), 500);
  io.on("connection", (socket) => {
    for (const method of ["create", "join", "settings", "ready", "action", "gesture", "mask", "rematch", "leave"]) {
      socket.on(`ss:${method}`, (payload, ack) => {
        const r = manager[method](socket.id, payload && typeof payload === "object" ? payload : {});
        if (typeof ack === "function") ack(r);
      });
    }
    socket.on("disconnect", () => manager.detach(socket.id));
  });
  server.listen(PORT, "127.0.0.1", () => console.log(`S&S-Prüfserver auf 127.0.0.1:${PORT} (PID ${process.pid})`));
})();
