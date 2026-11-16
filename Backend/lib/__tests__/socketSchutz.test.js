// npm test -- lib — Schutzmantel für Socket-Handler (lib/socketSchutz.js)
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { schuetzeSocket } = require("../socketSchutz");

test("Fehler in Handlern (synchron und async) beenden nichts, werden geloggt; Argumente, Rückruf und this bleiben", async () => {
  const socket = new EventEmitter();
  const geloggt = [];
  schuetzeSocket(socket, { log: { error: (...a) => geloggt.push(a.join(" ")) } });

  let unbehandelt = null;
  const spion = (e) => { unbehandelt = e; };
  process.on("unhandledRejection", spion);
  try {
    socket.on("sync-kaputt", () => { throw new Error("sync"); });
    socket.on("async-kaputt", async () => { throw new Error("async"); });
    let erhalten = null;
    let thisWar = null;
    socket.on("gut", function (wert, cb) {
      thisWar = this;
      erhalten = wert;
      cb("ok");
    });
    let einmal = 0;
    socket.once("einmal", () => { einmal += 1; throw new Error("einmal"); });

    assert.doesNotThrow(() => socket.emit("sync-kaputt"));
    assert.doesNotThrow(() => socket.emit("async-kaputt"));
    assert.doesNotThrow(() => socket.emit("einmal"));
    socket.emit("einmal");
    let antwort = null;
    socket.emit("gut", 42, (a) => { antwort = a; });
    await new Promise((r) => setImmediate(r));

    assert.equal(erhalten, 42);
    assert.equal(antwort, "ok");
    assert.equal(thisWar, socket);
    assert.equal(einmal, 1, "once bleibt once");
    assert.equal(unbehandelt, null, "kein unbehandeltes Promise");
    assert.ok(geloggt.some((z) => z.includes("sync-kaputt")));
    assert.ok(geloggt.some((z) => z.includes("async-kaputt")));
  } finally {
    process.off("unhandledRejection", spion);
  }
});

test("off() findet einen ummantelten Handler über das Original", () => {
  const socket = new EventEmitter();
  schuetzeSocket(socket, { log: { error() {} } });
  let n = 0;
  const handler = () => { n += 1; };
  socket.on("x", handler);
  socket.emit("x");
  socket.off("x", handler);
  socket.emit("x");
  assert.equal(n, 1);
  assert.equal(socket.listenerCount("x"), 0);
});
