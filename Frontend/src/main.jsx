import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { applyLowGfxFlag } from "./utils/lowGfx";
import { wendeBarrierefreiAn } from "./utils/barrierefrei";
import { markShellHeadTags } from "./utils/shellHeadTags";
import { installiereFehlerMelder, meldeFehler, komponentenKette } from "./utils/fehlerMelder";
import { installiereLeistungsMessung } from "./utils/leistungMessung";
import { starteApp } from "./utils/mitteilungen";

// Fehler im Browser ans eigene Fehlerprotokoll (utils/fehlerMelder.js → Backend/fehler, Admin-Reiter „Fehler“)
installiereFehlerMelder();
// Ladezeiten, Reaktion und Bildrate echter Besucher (utils/leistungMessung.js → Backend/leistung, Admin „Leistung“).
// Vor dem ersten Rendern, damit die gepufferten Messungen vom Laden mitzählen; Seitenwechsel meldet LeistungTracker.
installiereLeistungsMessung();

// Website als App (utils/mitteilungen.js): Service Worker für Mitteilungen, Installations-Angebot des Browsers merken.
// Nicht in OBS, auf Overlays und im Admin.
starteApp();

// Ohne Hardwarebeschleunigung: Animationen, Weichzeichner und 3D sparen (utils/lowGfx.js)
applyLowGfxFlag();
// Barrierefreiheit je Gerät (Bewegung, Kontrast, Farbhilfe, Untertitel): Attribute auf <html> für index.css
wendeBarrierefreiAn();
// Titel/Canonical/robots der ausgelieferten Datei markieren, bevor React eigene setzt (Wegräumen in components/SEO.jsx)
markShellHeadTags();

// Beim Deploy wird assets/ komplett ersetzt. Ein Tab, der davor geöffnet wurde, will
// beim Navigieren einen Chunk nachladen, den es nicht mehr gibt — statt weißer Seite
// einmal neu laden, damit die aktuelle index.html mit den neuen Hashes kommt. Das Flag
// verhindert eine Reload-Schleife, falls der Chunk aus einem anderen Grund fehlt. Es ist ein
// Zeitstempel (nicht nur "einmal je Sitzung"): OBS-Browserquellen laufen tagelang in derselben
// Sitzung — mit einem festen Flag hätte nach dem zweiten Deploy nichts mehr neu geladen.
window.addEventListener("vite:preloadError", () => {
  let last = 0;
  try { last = Number(sessionStorage.getItem("chunkReloadAt")) || 0; } catch { /* kein Speicher */ }
  if (Date.now() - last < 60_000) return;
  try { sessionStorage.setItem("chunkReloadAt", String(Date.now())); } catch { /* kein Speicher */ }
  window.location.reload();
});

// React-Fehler (auch die, die LazyRouteBoundary in App.jsx abfängt) ins Fehlerprotokoll. Eigene Handler ersetzen Reacts
// Standard — die Konsolenmeldung bleibt deshalb hier erhalten, und window "error" sieht sie nicht ein zweites Mal.
const meldeReactFehler = (error, info) => {
  console.error(error);
  meldeFehler("react", error, komponentenKette(info?.componentStack));
};

ReactDOM.createRoot(document.getElementById("root"), {
  onCaughtError: meldeReactFehler,
  onUncaughtError: meldeReactFehler,
}).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);