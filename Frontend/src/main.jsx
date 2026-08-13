import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import TwitchAuthProvider from "./components/TwitchAuthProvider";
import "./index.css";

// Beim Deploy wird assets/ komplett ersetzt. Ein Tab, der davor geöffnet wurde, will
// beim Navigieren einen Chunk nachladen, den es nicht mehr gibt — statt weißer Seite
// einmal neu laden, damit die aktuelle index.html mit den neuen Hashes kommt. Das Flag
// verhindert eine Reload-Schleife, falls der Chunk aus einem anderen Grund fehlt.
window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem("chunkReloadDone")) return;
  sessionStorage.setItem("chunkReloadDone", "1");
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);