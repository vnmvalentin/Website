// Build der Twitch-Erweiterung „Win Tracker“ (Ausbauplan „twitch-erweiterung“, Spur C) — getrennt vom Website-Build.
//
//   npm run twitch-ext:build    → twitch-extension/dist/ + Zip zum Hochladen (scripts/pack.mjs)
//
// Twitch hostet die Dateien selbst (https://<client-id>.ext-twitch.tv/<client-id>/<version>/<hash>/…), daher:
// - base './': nur relative Pfade
// - kein public/-Ordner der Website (der hätte hunderte MB Medien ins Zip gelegt)
// - keine eingebetteten data:-Bilder (assetsInlineLimit 0) — Twitchs Content-Security-Policy erlaubt Bilder nur von
//   der eigenen Herkunft und freigegebenen Domains
// - alle Skripte im Paket, kein Inline-Skript, kein eval (Twitch-Prüfregeln)
//
// root ist der Frontend-Ordner, damit die Win-Tracker-Karte ihre Bilder wie auf der Website findet
// (import.meta.glob('/src/assets/clashRoyale/clanBadges/*.webp')).
//
// Die Karte selbst ist die echte OBS-Overlay-Seite des Win Trackers (Revier B, unverändert). Nur ihr Datenmodul
// winTrackerApi.js wird hier gegen src/extApi.js getauscht: Daten über Twitchs Token statt über den Overlay-Schlüssel.
import { defineConfig, normalizePath } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, "..");

export default defineConfig({
  root: frontend,
  base: "./",
  publicDir: false,
  plugins: [
    react(),
    {
      // Nur Importe AUS dem Win-Tracker-Ordner umbiegen — sonst bliebe die Website unberührt, hier gibt es aber nur die Karte
      name: "twitch-ext-api",
      enforce: "pre",
      resolveId(source, importer) {
        if (/^\.\/winTrackerApi(\.js)?$/.test(source) && importer && importer.replace(/\\/g, "/").includes("/pages/ClashRoyale/WinTracker/")) {
          // Genau dieselbe Schreibweise wie Vites eigene Auflösung (Schrägstriche) — sonst landet extApi.js zweimal im
          // Paket, und Karte und Hinweis sprächen mit verschiedenen Kopien
          return normalizePath(path.join(here, "src", "extApi.js"));
        }
        return null;
      },
    },
  ],
  build: {
    outDir: path.join(here, "dist"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      input: {
        panel: path.join(here, "panel.html"),
        config: path.join(here, "config.html"),
      },
    },
  },
  // Prüfstand: npx vite --config twitch-extension/vite.config.js --port <p> (VITE_TWITCH_EXT_API leer → gleiche Herkunft)
  server: { strictPort: true },
});
