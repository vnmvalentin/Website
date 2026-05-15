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
    },
    // Hilft oft bei Problemen mit älteren Libraries wie Quill
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  plugins: [
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
    }
  }
});