// npm test -- lib — Grenzen für Socket-Verbindungen (lib/socketBremse.js) und Überlast-Wächter (lib/lastWaechter.js)
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { schuetzeSocketServer, socketIp, socketIstLokal } = require("../socketBremse");
const { createLastWaechter } = require("../lastWaechter");

function attrappeIo() {
  const mws = [];
  return {
    use: (mw) => mws.push(mw),
    /** Verbindet einen Socket; liefert { socket, fehler } */
    verbinde(ip, { lokal = false } = {}) {
      const socket = new EventEmitter();
      socket.handshake = lokal ? { headers: {}, address: "127.0.0.1" } : { headers: { "x-forwarded-for": `6.6.6.6, ${ip}` }, address: "127.0.0.1" };
      socket.paketMws = [];
      socket.use = (mw) => socket.paketMws.push(mw);
      socket.getrennt = false;
      socket.disconnect = () => { socket.getrennt = true; socket.emit("disconnect"); };
      /** Schickt ein Ereignis durch die Paket-Middleware; true = kam beim Handler an */
      socket.sende = () => {
        let durch = false;
        socket.paketMws[0](["x"], () => { durch = true; });
        return durch;
      };
      let fehler = null;
      for (const mw of mws) mw(socket, (e) => { fehler = e || null; });
      return { socket, fehler };
    },
  };
}

test("Socket-Adresse: letzter X-Forwarded-For-Eintrag zählt; ohne Kopf von Loopback gilt als lokal", () => {
  assert.equal(socketIp({ handshake: { headers: { "x-forwarded-for": "6.6.6.6, 1.2.3.4" }, address: "127.0.0.1" } }), "1.2.3.4");
  assert.equal(socketIp({ handshake: { headers: {}, address: "9.9.9.9" } }), "9.9.9.9");
  assert.equal(socketIstLokal({ handshake: { headers: {}, address: "127.0.0.1" } }), true);
  assert.equal(socketIstLokal({ handshake: { headers: { "x-forwarded-for": "1.2.3.4" }, address: "127.0.0.1" } }), false);
});

test("Socket-Bremse: höchstens maxOffen Verbindungen je Adresse, nach dem Trennen wieder frei", () => {
  const io = attrappeIo();
  const schutz = schuetzeSocketServer(io, { maxOffen: 2, maxNeuJeMinute: 100 });
  try {
    const a = io.verbinde("1.1.1.1");
    const b = io.verbinde("1.1.1.1");
    assert.equal(a.fehler, null);
    assert.equal(b.fehler, null);
    assert.equal(io.verbinde("1.1.1.1").fehler?.message, "too_many_connections");
    assert.equal(io.verbinde("2.2.2.2").fehler, null, "andere Adresse ist nicht betroffen");
    a.socket.disconnect();
    assert.equal(io.verbinde("1.1.1.1").fehler, null);
    assert.equal(io.verbinde("3.3.3.3", { lokal: true }).fehler, null);
  } finally {
    schutz.stopp();
  }
});

test("Socket-Bremse: neue Verbindungen je Minute und Adresse begrenzt", () => {
  const uhr = { t: 0 };
  const io = attrappeIo();
  const schutz = schuetzeSocketServer(io, { maxOffen: 100, maxNeuJeMinute: 3, now: () => uhr.t });
  try {
    for (let i = 0; i < 3; i++) io.verbinde("1.1.1.1").socket.disconnect();
    assert.equal(io.verbinde("1.1.1.1").fehler?.message, "rate_limited");
    uhr.t = 60_000;
    assert.equal(io.verbinde("1.1.1.1").fehler, null);
  } finally {
    schutz.stopp();
  }
});

test("Socket-Bremse: Ereignis-Flut trennt die Verbindung, normales Tempo nicht", () => {
  const uhr = { t: 0 };
  const io = attrappeIo();
  const schutz = schuetzeSocketServer(io, { maxEreignisse: 5, fensterMs: 1000, now: () => uhr.t });
  try {
    const ruhig = io.verbinde("1.1.1.1").socket;
    for (let runde = 0; runde < 4; runde++) {
      for (let i = 0; i < 5; i++) assert.equal(ruhig.sende(), true);
      uhr.t += 1000;
    }
    assert.equal(ruhig.getrennt, false);
    const flut = io.verbinde("2.2.2.2").socket;
    for (let i = 0; i < 5; i++) assert.equal(flut.sende(), true);
    assert.equal(flut.sende(), false, "das Ereignis über der Grenze erreicht keinen Handler");
    assert.equal(flut.getrennt, true);
  } finally {
    schutz.stopp();
  }
});

test("Überlast-Wächter: schlägt über der Schwelle an und hält kurz nach", () => {
  const uhr = { t: 0 };
  const messer = { mean: 0, reset() {} };
  const w = createLastWaechter({ schwelleMs: 100, nachlaufMs: 4000, now: () => uhr.t, messer });
  try {
    messer.mean = 20e6;
    w.messe();
    assert.equal(w.ueberlastet(), false);
    messer.mean = 250e6;
    w.messe();
    assert.equal(w.ueberlastet(), true);
    assert.equal(w.verzoegerungMs(), 250);
    messer.mean = NaN; // Fenster ohne Messwerte
    uhr.t = 3000;
    w.messe();
    assert.equal(w.ueberlastet(), true, "hält nach");
    uhr.t = 4001;
    assert.equal(w.ueberlastet(), false);
  } finally {
    w.stopp();
  }
});
