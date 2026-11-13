// Ego-Volleyball — die Spielrechnung des Hosts in einem eigenen Thread.
//
// Warum ein Worker: Im Haupt-Thread hängt der Takt an requestAnimationFrame bzw. an
// Timern, die der Browser in Hintergrund-Tabs stark drosselt. Der Host ist hier der
// Server — schaltet er kurz in einen anderen Tab, würde sonst für alle das Spiel stehen.
// Ein Worker-Timer läuft davon weitgehend unbeeinflusst weiter.
//
// Nachrichten rein:  start {mode, serveTeam, maxTouches, powerups, bots: [Plätze]}
//                    · input {slot, inp} · power {slot} · pause {v} · stop
// Nachrichten raus:  snap {snap}  (ein Schnappschuss pro gerechnetem Frame-Bündel)
//
// `bots` sind Plätze, die der Übungsgegner spielt (beach/bot.js) — nur beim Üben allein.
import { createWorld, stepWorld, encodeSnapshot, zuendePowerup, TICK_MS } from "./sim";
import { createBot, botInput } from "./bot";

let world = null;
let inputs = {};
let bots = [];
let paused = false;
let timer = null;
let last = 0;
let carry = 0;

function tick() {
  const now = performance.now();
  // Aufholen, aber höchstens 24 Frames — nach einem langen Hänger lieber springen als rasen
  carry = Math.min(carry + (now - last), 24 * TICK_MS);
  last = now;
  const steps = Math.floor(carry / TICK_MS);
  if (steps <= 0) return;
  carry -= steps * TICK_MS;
  if (!world || paused) return;
  for (let i = 0; i < steps; i++) {
    for (const bot of bots) {
      inputs[bot.slot] = botInput(world, bot);
      // Der Bot zündet ein eingesammeltes Powerup einfach sofort
      if (world.held[bot.slot] !== undefined) zuendePowerup(world, bot.slot);
    }
    stepWorld(world, inputs);
    if (world.winner) break;
  }
  self.postMessage({ t: "snap", snap: encodeSnapshot(world) });
  if (world.winner) stop();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.t === "start") {
    world = createWorld(m.mode, m.serveTeam || 1, m.maxTouches || 0, !!m.powerups);
    inputs = {};
    bots = (Array.isArray(m.bots) ? m.bots : []).filter((s) => s >= 1 && s <= 4).map((s) => createBot(s));
    paused = false;
    last = performance.now();
    carry = 0;
    stop();
    timer = setInterval(tick, 4);
    self.postMessage({ t: "snap", snap: encodeSnapshot(world) });
  } else if (m.t === "input") {
    if (m.slot >= 1 && m.slot <= 4 && m.inp) inputs[m.slot] = m.inp;
  } else if (m.t === "power") {
    if (world && m.slot >= 1 && m.slot <= 4) zuendePowerup(world, m.slot);
  } else if (m.t === "pause") {
    paused = !!m.v;
    last = performance.now();
    carry = 0;
  } else if (m.t === "stop") {
    stop();
    world = null;
  }
};
