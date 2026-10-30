import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

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

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);