// lib/lastWaechter.js — merkt, wenn der Prozess nicht mehr hinterherkommt (Absicherung 17.11.2026).
//
// Alles im Hauptdienst teilt sich eine Ereignisschleife: Spiele, Discord-Bot, Twitch-Chat, Stats-Seiten. Kommt eine Flut
// aus vielen Adressen (verteilte Crawler), greifen die Grenzen je Adresse nicht — dann staut sich die Schleife, und
// jede Seite wird langsam. Der Wächter misst die Verzögerung der Schleife; teure, öffentliche Routen fragen
// `ueberlastet()` und antworten bei Stau sofort mit „gerade viel los“, statt die Schlange weiter zu verlängern.
//
// Gemessen wird mit perf_hooks.monitorEventLoopDelay (kostet praktisch nichts). `ueberlastet()` gilt, wenn der Mittelwert
// des letzten Messfensters über der Schwelle lag — und bleibt danach noch kurz gesetzt, damit es nicht flattert.

const { monitorEventLoopDelay } = require("perf_hooks");

function createLastWaechter({ schwelleMs = 120, fensterMs = 2000, nachlaufMs = 4000, now = Date.now, messer = null } = {}) {
  const h = messer || monitorEventLoopDelay({ resolution: 20 });
  if (h.enable) h.enable();
  let bis = 0; // bis wann „überlastet“ gilt
  let letzterMittelwert = 0;

  function messe() {
    // mean in Nanosekunden; ohne Messwerte NaN
    const ms = Number(h.mean) / 1e6;
    letzterMittelwert = Number.isFinite(ms) ? ms : 0;
    if (h.reset) h.reset();
    if (letzterMittelwert > schwelleMs) bis = now() + nachlaufMs;
  }
  const timer = setInterval(messe, fensterMs);
  if (timer.unref) timer.unref();

  return {
    ueberlastet: () => now() < bis,
    verzoegerungMs: () => Math.round(letzterMittelwert),
    messe, // für Tests
    stopp: () => { clearInterval(timer); if (h.disable) h.disable(); },
  };
}

// Ein Wächter für den ganzen Prozess (erst beim ersten Gebrauch angelegt)
let gemeinsam = null;
function lastWaechter() {
  if (!gemeinsam) gemeinsam = createLastWaechter();
  return gemeinsam;
}

module.exports = { createLastWaechter, lastWaechter };
