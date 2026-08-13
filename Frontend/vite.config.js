import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";

const analyze = process.env.ANALYZE === "true";

export default defineConfig({
  base: "/",
  build: {
    // Das Limit erhöhen, damit die Warnung verschwindet (kosmetisch)
    chunkSizeWarningLimit: 2000,
    // WICHTIG: rollupOptions komplett entfernen oder leer lassen!
    rollupOptions: {
      // Keine manualChunks mehr!
      output: {
        // Bilder aus src/assets/avatars/ (z.B. Clash Royale Profilbilder) landen in einem
        // eigenen Unterordner statt flach zwischen den JS/CSS-Chunks in assets/ zu liegen.
        // Einfach neue Bilder in den Ordner legen — sie werden automatisch mit-gehasht.
        assetFileNames: (assetInfo) => {
          const sourceNames = assetInfo.originalFileNames
            || (assetInfo.originalFileName ? [assetInfo.originalFileName] : [])
            || [];
          const isAvatar = sourceNames.some((n) => n.includes('/assets/avatars/'));
          if (isAvatar) return 'assets/avatars/[name]-[hash][extname]';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    // Hilft oft bei Problemen mit älteren Libraries wie Quill
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  plugins: [
    // Unterdrückt den harmlosen "ws proxy socket error: ECONNABORTED" bei Browser-Refresh
    {
      name: 'suppress-ws-proxy-errors',
      configureServer(server) {
        const orig = server.config.logger.error.bind(server.config.logger);
        server.config.logger.error = (msg, opts) => {
          if (typeof msg === 'string' && msg.includes('ws proxy')) return;
          orig(msg, opts);
        };
      },
    },
    react(),
    tailwindcss(),
    analyze &&
      visualizer({
        filename: "dist/stats.html",
        open: true,
        template: "treemap",
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),

  server: {
    port: 5173, 
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/logos': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      // Socket.io (Garden MP) — ohne Proxy trifft der Client Vite (5173), nicht den Node-Server → connect_error "server error"
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      // Blobby Volley hat einen EIGENEN Node-Prozess (Backend/blobbyServer.js, Port 3002),
      // damit seine 75-Hz-Physik nicht im Event-Loop von Discord-Bot, Twitch-IRC und den
      // synchronen SQLite-Stores hängt. In Produktion macht nginx dasselbe (Backend/deploy/).
      '/blobby-socket': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    }
  }
});